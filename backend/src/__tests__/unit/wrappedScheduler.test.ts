/**
 * Unit tests for the Wrapped scheduler (backend/src/jobs/wrappedScheduler.ts).
 *
 * Strategy:
 *   - jest.useFakeTimers({ now }) pins the system clock to a specific moment.
 *   - jest.advanceTimersByTime triggers setTimeout/setInterval callbacks.
 *   - userService and wrappedService are plain jest mock objects — no I/O.
 *
 * Timer sequence inside startWrappedScheduler:
 *   T+0       : setTimeout(60 s) registered
 *   T+60 000  : first tick fires; setInterval(15 min) registered
 *   T+960 000 : second tick fires (60 s + 15 min)
 *   T+1860000 : third tick fires, etc.
 */

import { startWrappedScheduler } from '../../jobs/wrappedScheduler';
import type { UserService } from '../../services/userService';
import type { WrappedService } from '../../services/wrappedService';
import type { User } from '../../services/dataService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockUser = User & { timezone: string; wrappedEnabled: boolean };

function makeUser(overrides: Partial<MockUser> & { id: string }): MockUser {
  return {
    username: overrides.id,
    displayName: overrides.id,
    familyId: 'family-1',
    passwordHash: 'hash',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    timezone: 'America/New_York',
    wrappedEnabled: true,
    ...overrides,
  };
}

function makeDeps(users: MockUser[]) {
  const userService = {
    listAllUsers: jest.fn().mockResolvedValue(users),
  } as unknown as UserService;

  const wrappedService = {
    fireDaily: jest.fn().mockResolvedValue({ fired: true, delivered: true }),
    fireWeekly: jest.fn().mockResolvedValue({ fired: true, delivered: true }),
  } as unknown as WrappedService;

  return { userService, wrappedService };
}

/**
 * Advance timers far enough to trigger the first tick only.
 * First tick fires at T+60 000 ms.
 */
async function advanceToFirstTick(): Promise<void> {
  jest.advanceTimersByTime(60_000);
  // Allow all microtasks (Promise chains from the async tick) to settle.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * Advance timers to trigger the second tick (first interval tick).
 * Second tick fires at T+60 000 + 15*60*1000 = T+960 000 ms.
 */
async function advanceToSecondTick(): Promise<void> {
  jest.advanceTimersByTime(900_000); // 15 min
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wrappedScheduler', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Case 1: NY user at 9:05 PM Monday — fireDaily, LA user skipped
  // -------------------------------------------------------------------------
  it('fires fireDaily for NY user at 9:05 PM Monday; skips LA user (6:05 PM local)', async () => {
    // 2026-04-20 is a Monday.
    // 9:05 PM ET = 01:05 UTC next day (EDT = UTC-4).
    // 9:05 PM ET → UTC: 21:05 - (-4h) = 21:05 + 4h = 01:05 UTC on Apr 21
    const now = new Date('2026-04-21T01:05:00.000Z'); // 9:05 PM ET Monday (April 20 local)
    jest.useFakeTimers({ now });

    const nyUser = makeUser({ id: 'ny-user', timezone: 'America/New_York' });
    const laUser = makeUser({ id: 'la-user', timezone: 'America/Los_Angeles' });
    const { userService, wrappedService } = makeDeps([nyUser, laUser]);

    const scheduler = startWrappedScheduler({ userService, wrappedService });

    await advanceToFirstTick();

    expect(wrappedService.fireDaily).toHaveBeenCalledTimes(1);
    expect(wrappedService.fireDaily).toHaveBeenCalledWith('ny-user', expect.any(Date));
    expect(wrappedService.fireWeekly).not.toHaveBeenCalled();
    // LA user (6:05 PM local) must not be called
    expect(wrappedService.fireDaily).not.toHaveBeenCalledWith('la-user', expect.anything());

    scheduler.stop();
  });

  // -------------------------------------------------------------------------
  // Case 2: NY user at 9:05 PM Sunday — fireWeekly, NOT fireDaily
  // -------------------------------------------------------------------------
  it('fires fireWeekly (not fireDaily) for NY user at 9:05 PM Sunday', async () => {
    // 2026-04-19 is a Sunday in ET.
    // 9:05 PM ET (EDT = UTC-4) → 2026-04-20T01:05:00Z
    const now = new Date('2026-04-20T01:05:00.000Z');
    jest.useFakeTimers({ now });

    const nyUser = makeUser({ id: 'ny-user', timezone: 'America/New_York' });
    const { userService, wrappedService } = makeDeps([nyUser]);

    const scheduler = startWrappedScheduler({ userService, wrappedService });

    await advanceToFirstTick();

    expect(wrappedService.fireWeekly).toHaveBeenCalledTimes(1);
    expect(wrappedService.fireWeekly).toHaveBeenCalledWith('ny-user', expect.any(Date));
    expect(wrappedService.fireDaily).not.toHaveBeenCalled();

    scheduler.stop();
  });

  // -------------------------------------------------------------------------
  // Case 3: 9:20 PM, first-tick flag true → catch-up fires
  // -------------------------------------------------------------------------
  it('fires catch-up on first tick when time is 9:20 PM and wrappedService is idempotent', async () => {
    // 9:20 PM ET Monday (2026-04-20) is outside the normal 9:00–9:14 PM window
    // but inside the 9:15–11:59 PM catch-up window.
    // 9:20 PM ET (EDT UTC-4) → 2026-04-21T01:20:00Z
    const now = new Date('2026-04-21T01:20:00.000Z');
    jest.useFakeTimers({ now });

    const nyUser = makeUser({ id: 'ny-user', timezone: 'America/New_York' });
    const { userService, wrappedService } = makeDeps([nyUser]);

    const scheduler = startWrappedScheduler({ userService, wrappedService });

    await advanceToFirstTick();

    // Catch-up should fire fireDaily (Monday)
    expect(wrappedService.fireDaily).toHaveBeenCalledTimes(1);
    expect(wrappedService.fireDaily).toHaveBeenCalledWith('ny-user', expect.any(Date));

    scheduler.stop();
  });

  // -------------------------------------------------------------------------
  // Case 4: 9:20 PM, first-tick flag false (second tick) → NOT fired
  // -------------------------------------------------------------------------
  it('does NOT fire on second tick at 9:20 PM (catch-up window, but first-tick exhausted)', async () => {
    // Start the clock at 9:05 PM ET Monday so first tick fires normally.
    // Then advance the clock to 9:20 PM ET for the second tick — it should skip.
    const firstTickNow = new Date('2026-04-21T01:05:00.000Z'); // 9:05 PM ET Monday
    jest.useFakeTimers({ now: firstTickNow });

    const nyUser = makeUser({ id: 'ny-user', timezone: 'America/New_York' });
    const { userService, wrappedService } = makeDeps([nyUser]);

    const scheduler = startWrappedScheduler({ userService, wrappedService });

    // First tick at 9:05 PM ET — fires normally (within 9:00–9:14 window).
    await advanceToFirstTick();
    expect(wrappedService.fireDaily).toHaveBeenCalledTimes(1);

    // Reset mocks so we can check second-tick behavior cleanly.
    jest.clearAllMocks();
    userService.listAllUsers = jest.fn().mockResolvedValue([nyUser]);
    wrappedService.fireDaily = jest.fn().mockResolvedValue({ fired: false, delivered: false });
    wrappedService.fireWeekly = jest.fn().mockResolvedValue({ fired: false, delivered: false });

    // Advance system clock to 9:20 PM ET for the second tick.
    // The interval fires 15 min after the first tick.
    // We advance time AND set the fake system time to 9:20 PM.
    jest.setSystemTime(new Date('2026-04-21T01:20:00.000Z')); // 9:20 PM ET
    await advanceToSecondTick();

    // 9:20 PM is outside normal window (9:00–9:14); isFirstTick is now false
    // so catch-up should NOT fire.
    expect(wrappedService.fireDaily).not.toHaveBeenCalled();
    expect(wrappedService.fireWeekly).not.toHaveBeenCalled();

    scheduler.stop();
  });

  // -------------------------------------------------------------------------
  // Case 5: Per-user error isolation
  // -------------------------------------------------------------------------
  it('continues firing for other users when one user throws; logs the error', async () => {
    // 9:05 PM ET Monday
    const now = new Date('2026-04-21T01:05:00.000Z');
    jest.useFakeTimers({ now });

    const errorUser = makeUser({ id: 'error-user' });
    const goodUser = makeUser({ id: 'good-user' });

    const userService = {
      listAllUsers: jest.fn().mockResolvedValue([errorUser, goodUser]),
    } as unknown as UserService;

    const wrappedService = {
      fireDaily: jest.fn().mockImplementation((userId: string) => {
        if (userId === 'error-user') return Promise.reject(new Error('push failed'));
        return Promise.resolve({ fired: true, delivered: true });
      }),
      fireWeekly: jest.fn().mockResolvedValue({ fired: true, delivered: true }),
    } as unknown as WrappedService;

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const scheduler = startWrappedScheduler({ userService, wrappedService });

    await advanceToFirstTick();

    // good-user must still have been called
    expect(wrappedService.fireDaily).toHaveBeenCalledWith('good-user', expect.any(Date));
    // error should have been logged
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('error-user'),
      expect.any(String),
    );

    consoleSpy.mockRestore();
    scheduler.stop();
  });

  // -------------------------------------------------------------------------
  // Case 6: stop() clears the interval — no further ticks fire
  // -------------------------------------------------------------------------
  it('stop() prevents any further ticks from firing', async () => {
    // 9:05 PM ET Monday
    const now = new Date('2026-04-21T01:05:00.000Z');
    jest.useFakeTimers({ now });

    const nyUser = makeUser({ id: 'ny-user' });
    const { userService, wrappedService } = makeDeps([nyUser]);

    const scheduler = startWrappedScheduler({ userService, wrappedService });

    // Let first tick fire.
    await advanceToFirstTick();
    expect(wrappedService.fireDaily).toHaveBeenCalledTimes(1);

    // Stop the scheduler.
    scheduler.stop();

    // Reset mocks to detect any further calls.
    jest.clearAllMocks();
    userService.listAllUsers = jest.fn().mockResolvedValue([nyUser]);
    wrappedService.fireDaily = jest.fn().mockResolvedValue({ fired: true, delivered: true });
    wrappedService.fireWeekly = jest.fn().mockResolvedValue({ fired: true, delivered: true });

    // Advance well past a second tick — nothing should fire.
    await advanceToSecondTick();
    await advanceToSecondTick();

    expect(wrappedService.fireDaily).not.toHaveBeenCalled();
    expect(wrappedService.fireWeekly).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 7: wrappedEnabled === false — user is skipped entirely
  // -------------------------------------------------------------------------
  it('skips users with wrappedEnabled === false', async () => {
    const now = new Date('2026-04-21T01:05:00.000Z'); // 9:05 PM ET Monday
    jest.useFakeTimers({ now });

    const disabledUser = makeUser({ id: 'disabled-user', wrappedEnabled: false });
    const enabledUser = makeUser({ id: 'enabled-user', wrappedEnabled: true });
    const { userService, wrappedService } = makeDeps([disabledUser, enabledUser]);

    const scheduler = startWrappedScheduler({ userService, wrappedService });

    await advanceToFirstTick();

    expect(wrappedService.fireDaily).toHaveBeenCalledTimes(1);
    expect(wrappedService.fireDaily).toHaveBeenCalledWith('enabled-user', expect.any(Date));
    expect(wrappedService.fireDaily).not.toHaveBeenCalledWith('disabled-user', expect.anything());

    scheduler.stop();
  });

  // -------------------------------------------------------------------------
  // Case 8: stop() before first tick fires — initial setTimeout also cancelled
  // -------------------------------------------------------------------------
  it('stop() before first tick prevents the initial tick from running', async () => {
    const now = new Date('2026-04-21T01:05:00.000Z');
    jest.useFakeTimers({ now });

    const nyUser = makeUser({ id: 'ny-user' });
    const { userService, wrappedService } = makeDeps([nyUser]);

    const scheduler = startWrappedScheduler({ userService, wrappedService });

    // Stop before 60 s has elapsed.
    scheduler.stop();

    await advanceToFirstTick();

    expect(wrappedService.fireDaily).not.toHaveBeenCalled();
    expect(wrappedService.fireWeekly).not.toHaveBeenCalled();
  });
});
