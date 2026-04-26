/**
 * Integration tests for WrappedService.
 *
 * Uses the InMemoryDataService and real service instances (no mocking of
 * the compute layer) to validate the orchestration logic: vacation
 * suppression, idempotency, feature-flag gating, admin gate, snapshot
 * immutability, and repetition avoidance.
 */

import { InMemoryDataService } from '../../services/dataService';
import { TaskService } from '../../services/taskService';
import { TripService } from '../../services/tripService';
import { ProjectService } from '../../services/projectService';
import { TransactionService } from '../../services/transactionService';
import { FamilyService } from '../../services/familyService';
import { UserService } from '../../services/userService';
import { WrappedService } from '../../services/wrappedService';
import { ForbiddenError } from '../../errors';
import type { User } from '../../services/dataService';
import type { Family, StoredTrip } from '../../shared/types';

// ---------------------------------------------------------------------------
// Fake push service — records calls without sending
// ---------------------------------------------------------------------------

interface PushCall {
  userId: string;
  cadence: string;
  localDateKey: string;
}

function makeFakePushService(deliver = true) {
  const calls: PushCall[] = [];
  return {
    calls,
    async sendWrapped(
      userId: string,
      cadence: string,
      _tier: unknown,
      _headlineCount: unknown,
      _highlightCount: unknown,
      localDateKey: string,
    ) {
      calls.push({ userId, cadence, localDateKey });
      return { delivered: deliver };
    },
    async getUserPreferences() {
      return { wrappedEnabled: true, syncFailures: false, budgetAlerts: false, budgetAlertThreshold: 80, largeTransactions: false, largeTransactionThreshold: 500, billReminders: false };
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers for seeding test data
// ---------------------------------------------------------------------------

async function seedFamily(
  dataService: InMemoryDataService,
  opts: {
    userId: string;
    username: string;
    displayName: string;
    wrappedEnabled?: boolean;
    isAdmin?: boolean;
    timezone?: string;
  },
): Promise<{ user: User; familyId: string }> {
  const familyId = `family-${opts.userId}`;
  const user: User = {
    id: opts.userId,
    username: opts.username,
    displayName: opts.displayName,
    familyId,
    passwordHash: 'x',
    createdAt: new Date('2026-01-01'),
    wrappedEnabled: opts.wrappedEnabled,
    isAdmin: opts.isAdmin,
    timezone: opts.timezone,
  };

  await dataService.createUser(user);

  const family: Family = {
    id: familyId,
    name: 'Test Family',
    members: [{ userId: opts.userId, displayName: opts.displayName, joinedAt: '2026-01-01T00:00:00.000Z' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  await dataService.createFamily(family);

  return { user, familyId };
}

async function seedActiveTrip(
  dataService: InMemoryDataService,
  familyId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const trips: StoredTrip[] = (await dataService.getData(`trips_${familyId}`)) ?? [];
  trips.push({
    id: `trip-${Date.now()}`,
    userId: familyId,
    name: 'Test Trip',
    tag: 'test-trip',
    startDate,
    endDate,
    totalBudget: null,
    categoryBudgets: [],
    rating: null,
    notes: '',
    stops: [],
    photoAlbumUrl: null,
    coverStopId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await dataService.saveData(`trips_${familyId}`, trips);
}

// ---------------------------------------------------------------------------
// Build service under test
// ---------------------------------------------------------------------------

function buildServices(dataService: InMemoryDataService, pushService: ReturnType<typeof makeFakePushService>) {
  const familyService = new FamilyService(dataService);
  const taskService = new TaskService(dataService, familyService);
  // TransactionService requires a plaidService — provide a minimal stub
  const fakeTransactionService = {
    getTransactions: async () => ({ success: true, transactions: [] }),
    hasTransactionsForCategory: async () => false,
    getBlockingTransactionDetails: async () => [],
  } as unknown as TransactionService;

  const fakeProjectService = {
    getAllProjects: async () => [],
  } as unknown as ProjectService;

  const fakeTripService = {
    getAllTrips: async (familyId: string) => {
      return (await dataService.getData<StoredTrip[]>(`trips_${familyId}`)) ?? [];
    },
  } as unknown as TripService;

  const userService = new UserService(dataService);
  const wrappedService = new WrappedService(
    dataService,
    taskService,
    fakeTripService,
    fakeProjectService,
    fakeTransactionService,
    userService,
    pushService as unknown as import('../../services/pushNotificationService').PushNotificationService,
  );

  return { taskService, userService, wrappedService };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('WrappedService integration', () => {
  let dataService: InMemoryDataService;
  let pushService: ReturnType<typeof makeFakePushService>;

  beforeEach(() => {
    dataService = new InMemoryDataService();
    pushService = makeFakePushService();
  });

  // =========================================================================
  // 1. Feature flag — wrappedEnabled === false
  // =========================================================================

  describe('feature flag', () => {
    it('getDailyPayload returns null when wrappedEnabled is false', async () => {
      await seedFamily(dataService, {
        userId: 'u1',
        username: 'u1',
        displayName: 'User1',
        wrappedEnabled: false,
        timezone: 'America/New_York',
      });
      const { wrappedService } = buildServices(dataService, pushService);

      // 9:05 PM ET — within window
      const now = new Date('2026-04-24T01:05:00.000Z'); // 9:05 PM ET
      const result = await wrappedService.getDailyPayload('u1', now);
      expect(result).toBeNull();
    });

    it('fireDaily returns fired:false when wrappedEnabled is false', async () => {
      await seedFamily(dataService, {
        userId: 'u1',
        username: 'u1',
        displayName: 'User1',
        wrappedEnabled: false,
        timezone: 'America/New_York',
      });
      const { wrappedService } = buildServices(dataService, pushService);

      const now = new Date('2026-04-24T01:05:00.000Z');
      const result = await wrappedService.fireDaily('u1', now);
      expect(result.fired).toBe(false);
      expect(pushService.calls).toHaveLength(0);
    });
  });

  // =========================================================================
  // 2. Vacation suppression
  // =========================================================================

  describe('vacation suppression', () => {
    it('fireDaily fires on a non-trip day', async () => {
      await seedFamily(dataService, {
        userId: 'u1',
        username: 'u1',
        displayName: 'User1',
        wrappedEnabled: true,
        timezone: 'America/New_York',
      });
      const { wrappedService } = buildServices(dataService, pushService);

      // 9:05 PM ET on 2026-04-24 (Friday — no active trip)
      const now = new Date('2026-04-25T01:05:00.000Z'); // 9:05 PM ET on 2026-04-24
      const result = await wrappedService.fireDaily('u1', now);
      expect(result.fired).toBe(true);
      expect(pushService.calls).toHaveLength(1);
    });

    it('fireDaily does NOT fire on an active-trip day', async () => {
      const { familyId } = await seedFamily(dataService, {
        userId: 'u1',
        username: 'u1',
        displayName: 'User1',
        wrappedEnabled: true,
        timezone: 'America/New_York',
      });
      await seedActiveTrip(dataService, familyId, '2026-04-24', '2026-04-28');

      const { wrappedService } = buildServices(dataService, pushService);

      // 9:05 PM ET on 2026-04-24 — trip active
      const now = new Date('2026-04-25T01:05:00.000Z');
      const result = await wrappedService.fireDaily('u1', now);
      expect(result.fired).toBe(false);
      expect(pushService.calls).toHaveLength(0);
    });

    it('fireWeekly creates a suppressed record when week contains a trip', async () => {
      const { familyId } = await seedFamily(dataService, {
        userId: 'u1',
        username: 'u1',
        displayName: 'User1',
        wrappedEnabled: true,
        timezone: 'America/New_York',
      });
      // Trip covers part of the week 2026-04-20 (Mon) – 2026-04-26 (Sun)
      await seedActiveTrip(dataService, familyId, '2026-04-22', '2026-04-24');

      const { wrappedService } = buildServices(dataService, pushService);

      // 9:05 PM ET Sunday 2026-04-26
      const now = new Date('2026-04-27T01:05:00.000Z');
      const result = await wrappedService.fireWeekly('u1', now);
      expect(result.fired).toBe(true);
      expect(result.delivered).toBe(false); // suppressed week never delivers

      const records = await dataService.getWeeklyWrappeds(familyId);
      const record = records.find((r) => r.weekStart === '2026-04-20');
      expect(record).toBeDefined();
      expect(record!.suppressed).toBe(true);
      expect(record!.cards).toBeNull();
    });
  });

  // =========================================================================
  // 3. Idempotency
  // =========================================================================

  describe('idempotency', () => {
    it('calling fireDaily twice for the same local day only fires once', async () => {
      await seedFamily(dataService, {
        userId: 'u1',
        username: 'u1',
        displayName: 'User1',
        wrappedEnabled: true,
        timezone: 'America/New_York',
      });
      const { wrappedService } = buildServices(dataService, pushService);

      const now = new Date('2026-04-25T01:05:00.000Z'); // 9:05 PM ET 2026-04-24

      const r1 = await wrappedService.fireDaily('u1', now);
      expect(r1.fired).toBe(true);

      const r2 = await wrappedService.fireDaily('u1', now);
      expect(r2.fired).toBe(false);

      expect(pushService.calls).toHaveLength(1);

      const log = await dataService.getWrappedDispatchLog('u1');
      expect(log.filter((e) => e.localDateKey === '2026-04-24')).toHaveLength(1);
    });
  });

  // =========================================================================
  // 4. Admin gate
  // =========================================================================

  describe('admin gate', () => {
    it('non-admin calling setWrappedEnabled throws ForbiddenError', async () => {
      await seedFamily(dataService, {
        userId: 'admin1',
        username: 'admin1',
        displayName: 'Admin',
        wrappedEnabled: true,
        isAdmin: true,
      });
      await seedFamily(dataService, {
        userId: 'nonadmin',
        username: 'nonadmin',
        displayName: 'NonAdmin',
        wrappedEnabled: false,
        isAdmin: false,
      });
      const { wrappedService } = buildServices(dataService, pushService);

      await expect(
        wrappedService.setWrappedEnabled('admin1', true, 'nonadmin'),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('admin calling setWrappedEnabled succeeds', async () => {
      await seedFamily(dataService, {
        userId: 'admin1',
        username: 'admin1',
        displayName: 'Admin',
        wrappedEnabled: true,
        isAdmin: true,
      });
      await seedFamily(dataService, {
        userId: 'target',
        username: 'target',
        displayName: 'Target',
        wrappedEnabled: false,
        isAdmin: false,
      });
      const { wrappedService } = buildServices(dataService, pushService);

      await expect(
        wrappedService.setWrappedEnabled('target', true, 'admin1'),
      ).resolves.toBeUndefined();

      const updatedUser = await dataService.getUser('target');
      expect(updatedUser!.wrappedEnabled).toBe(true);
    });
  });

  // =========================================================================
  // 5. Weekly snapshot immutability
  // =========================================================================

  describe('weekly snapshot immutability', () => {
    it('getWeeklyRecord for archived week returns stored data unchanged', async () => {
      const { familyId } = await seedFamily(dataService, {
        userId: 'u1',
        username: 'u1',
        displayName: 'User1',
        wrappedEnabled: true,
        timezone: 'America/New_York',
      });

      // Pre-seed a weekly record directly into storage
      const storedRecord = {
        id: '2026-04-06',
        familyId,
        weekStart: '2026-04-06',
        weekEnd: '2026-04-12',
        tz: 'America/New_York',
        suppressed: false,
        cards: {
          headline: { count: 14, wowDelta: 3, copyVariantId: 'tier3.v1' },
          bestDay: { dayOfWeek: 'Wednesday', count: 4 },
          leaderboard: { byUserId: { u1: 14 }, winnerId: 'u1' },
          streaks: { byUserId: { u1: { current: 5, grew: true } } },
          highlights: [],
          closer: { nextFireLocalIso: '2026-04-13' },
        },
        usedCopyIds: ['tier3.v1'],
        createdAt: '2026-04-13T01:05:00.000Z',
      };
      await dataService.saveWeeklyWrappeds([storedRecord], familyId);

      const { wrappedService } = buildServices(dataService, pushService);

      // Now during a different week — pass weekStart to get archived record
      const result = await wrappedService.getWeeklyRecord('u1', '2026-04-06');
      expect(result).not.toBeNull();
      // Verify it returns the stored snapshot as-is
      expect(result!.cards!.headline.copyVariantId).toBe('tier3.v1');
      expect(result!.cards!.headline.count).toBe(14);
    });
  });

  // =========================================================================
  // 6. Repetition avoidance
  // =========================================================================

  describe('repetition avoidance', () => {
    it('fires 3 consecutive daily Wrappeds and accumulates copy variant IDs', async () => {
      const { familyId } = await seedFamily(dataService, {
        userId: 'u1',
        username: 'u1',
        displayName: 'User1',
        wrappedEnabled: true,
        timezone: 'America/New_York',
      });
      const { wrappedService } = buildServices(dataService, pushService);

      // Fire on 3 different days — 9:05 PM ET each night
      const days = [
        new Date('2026-04-25T01:05:00.000Z'), // 2026-04-24
        new Date('2026-04-26T01:05:00.000Z'), // 2026-04-25
        new Date('2026-04-27T01:05:00.000Z'), // 2026-04-26
      ];

      for (const now of days) {
        const r = await wrappedService.fireDaily('u1', now);
        expect(r.fired).toBe(true);
      }

      // 3 pushes total
      expect(pushService.calls).toHaveLength(3);

      // Recent copy cache should have grown (at least the headline copy IDs)
      const cache = await dataService.getRecentCopyIds(familyId);
      expect(cache.length).toBeGreaterThanOrEqual(3);
    });
  });

  // =========================================================================
  // 7. listArchive pagination
  // =========================================================================

  describe('listArchive', () => {
    it('returns records in reverse-chronological order with pagination', async () => {
      const { familyId } = await seedFamily(dataService, {
        userId: 'u1',
        username: 'u1',
        displayName: 'User1',
        wrappedEnabled: true,
        timezone: 'America/New_York',
      });

      // Seed 12 weekly records
      const records = Array.from({ length: 12 }, (_, i) => {
        const weekStart = `2026-${String(1 + Math.floor(i / 4)).padStart(2, '0')}-${String(6 + (i % 4) * 7).padStart(2, '0')}`;
        return {
          id: weekStart,
          familyId,
          weekStart,
          weekEnd: weekStart, // simplified for test
          tz: 'America/New_York',
          suppressed: false,
          cards: null,
          usedCopyIds: [],
          createdAt: new Date().toISOString(),
        };
      });
      await dataService.saveWeeklyWrappeds(records, familyId);

      const { wrappedService } = buildServices(dataService, pushService);

      const page1 = await wrappedService.listArchive('u1');
      expect(page1.items).toHaveLength(10);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await wrappedService.listArchive('u1', page1.nextCursor);
      expect(page2.items).toHaveLength(2);
      expect(page2.nextCursor).toBeUndefined();

      // All items are in reverse-chronological order
      const all = [...page1.items, ...page2.items];
      for (let i = 1; i < all.length; i++) {
        expect(all[i - 1].weekStart >= all[i].weekStart).toBe(true);
      }
    });
  });
});
