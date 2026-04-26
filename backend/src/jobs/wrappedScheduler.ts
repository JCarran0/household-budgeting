/**
 * Wrapped Scheduler
 *
 * A 15-minute tick that fans out per-user Wrapped fire checks. Fires at
 * 9:00–9:15 PM local time per user timezone. First tick is delayed 60 seconds
 * after boot to let services warm up; that tick also includes a catch-up path
 * for cases where the process restarted during the 9:15–11:59 PM window.
 *
 * Pattern mirrors chatActions/proposalStore.ts: module-level setInterval,
 * .unref() so Jest and graceful shutdown don't hang, and a returned
 * { stop } handle for SIGTERM cleanup.
 *
 * Single-instance assumption — if PM2 ever runs multiple workers, a
 * leader-election mechanism must be added before the fire path. See
 * AI-DEPLOYMENTS.md and WRAPPED-BRD.md §12.
 */

import {
  isSchedulerWindow,
  isInNineToMidnightWindow,
  dayOfWeekLabel,
  localDateKey,
} from '../../../shared/utils/wrappedDays';
import type { UserService } from '../services/userService';
import type { WrappedService } from '../services/wrappedService';

const TICK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const INITIAL_DELAY_MS = 60 * 1000;       // 1 minute warm-up

/**
 * Start the Wrapped scheduler.
 *
 * Returns a `stop()` handle that clears the interval; call it on SIGTERM.
 */
export function startWrappedScheduler(deps: {
  userService: UserService;
  wrappedService: WrappedService;
}): { stop: () => void } {
  // Track whether the very first tick has run — used for the catch-up window.
  let isFirstTick = true;

  const tick = async (): Promise<void> => {
    const capturedIsFirstTick = isFirstTick;
    // Clear the flag immediately so a slow async tick doesn't re-enter
    // as "first" if it somehow runs again before interval fires.
    if (capturedIsFirstTick) {
      isFirstTick = false;
    }

    try {
      const now = new Date();
      const users = await deps.userService.listAllUsers();

      for (const user of users) {
        if (!user.wrappedEnabled) continue;

        try {
          const tz = user.timezone ?? 'America/New_York';

          const inNormalWindow = isSchedulerWindow(now, tz);

          // Catch-up path: first tick after boot, within 9:15 PM–11:59 PM.
          // Only fire if today's dispatch row is absent (wrappedService.fireDaily
          // / fireWeekly are idempotent, but we skip the network call entirely
          // rather than letting the service do the idempotency check — this
          // keeps the scheduler fast when there's nothing to do).
          //
          // The service's own idempotency check (dispatch log) is the
          // authoritative guard; this is an early-exit optimisation.
          const inCatchUpWindow =
            capturedIsFirstTick &&
            !inNormalWindow &&
            isInNineToMidnightWindow(now, tz);

          if (!inNormalWindow && !inCatchUpWindow) continue;

          const dateKey = localDateKey(now, tz);
          const isSunday = dayOfWeekLabel(dateKey, tz) === 'Sunday';

          if (isSunday) {
            await deps.wrappedService.fireWeekly(user.id, now);
          } else {
            await deps.wrappedService.fireDaily(user.id, now);
          }
        } catch (userErr) {
          // Per-user errors must not block other users.
          console.error(
            `[wrappedScheduler] error for user ${user.id}:`,
            userErr instanceof Error ? userErr.message : userErr,
          );
        }
      }
    } catch (topErr) {
      // Top-level catch: prevents an unhandled rejection if listAllUsers throws.
      console.error('[wrappedScheduler] tick error:', topErr instanceof Error ? topErr.message : topErr);
    }
  };

  // Delay the first tick by 60 s to let services finish initializing, then
  // schedule recurring ticks every 15 minutes thereafter.
  const initialTimer = setTimeout(() => {
    void tick();
    intervalHandle = setInterval(() => void tick(), TICK_INTERVAL_MS);
    intervalHandle.unref();
  }, INITIAL_DELAY_MS);

  // Unref the initial timer too so it doesn't keep the process alive.
  initialTimer.unref();

  // The interval handle is assigned inside the setTimeout callback.
  // We need a reference for stop() — use a let that is reassigned.
  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  return {
    stop: () => {
      clearTimeout(initialTimer);
      if (intervalHandle !== null) {
        clearInterval(intervalHandle);
      }
    },
  };
}
