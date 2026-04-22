/**
 * Pure streak math for the task leaderboard.
 *
 * Given a stream of credit events (task or subtask completedAt timestamps)
 * for a single user, a timezone, and "now", compute:
 *   - currentStreak  — consecutive streak days ending at the today-is-grace
 *                       anchor (today if today has ≥1 credit, else yesterday).
 *   - bestStreak     — longest run of consecutive streak days ever observed.
 *   - bestStreakAchievedAt — completedAt of the first credit on the day that
 *                       tipped the all-time best streak to its current value.
 *   - streakMilestones — map of {7 | 30 | 100} -> ISO completedAt of the
 *                       earliest credit on the day that tipped that threshold.
 *
 * A streak day is a calendar day (viewer's IANA timezone) with ≥1 credit.
 * Multiple credits on the same day count as ONE streak day.
 */

import { localDayKey } from './leaderboardDays';

export interface CreditEvent {
  userId: string;
  completedAt: string;
  /**
   * Optional parent-task dueDate for Clutch badge derivation (§4.1).
   * Populated only on parent-task events; subtask events have no independent
   * due date. ISO datetime OR YYYY-MM-DD (date-only means end-of-day local).
   */
  dueDate?: string;
}

export interface StreakSummary {
  currentStreak: number;
  bestStreak: number;
  bestStreakAchievedAt: string | null;
  streakMilestones: Partial<Record<7 | 30 | 100, string>>;
}

/**
 * Parse a YYYY-MM-DD key back to a UTC midnight Date for date arithmetic.
 * The reverse is not exact (day indices are in a different TZ), but we only
 * use these keys for day-diff via constant 86400000ms steps, so this is fine
 * — DST shifts only affect wall-clock hours, not calendar-day deltas.
 */
function dayKeyToUTCDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Day key for a UTC Date (inverse of dayKeyToUTCDate). */
function utcDateToDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Previous day key (UTC arithmetic on the parsed key — TZ-independent). */
function prevDayKey(key: string): string {
  const d = dayKeyToUTCDate(key);
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDateToDayKey(d);
}

/**
 * Compute streak summary for a single user.
 *
 * @param events   Credit events for ONE user (filter upstream).
 * @param timezone IANA timezone for calendar-day bucketing.
 * @param now      "Current moment" (usually `new Date()`). Used only to
 *                 compute the today/yesterday anchor.
 */
export function computeStreaksForUser(
  events: CreditEvent[],
  timezone: string,
  now: Date
): StreakSummary {
  if (events.length === 0) {
    return {
      currentStreak: 0,
      bestStreak: 0,
      bestStreakAchievedAt: null,
      streakMilestones: {},
    };
  }

  // Earliest completedAt ISO per local day.
  const earliestByDay = new Map<string, string>();
  for (const evt of events) {
    const key = localDayKey(evt.completedAt, timezone);
    const existing = earliestByDay.get(key);
    if (existing === undefined || evt.completedAt < existing) {
      earliestByDay.set(key, evt.completedAt);
    }
  }

  const sortedDays = Array.from(earliestByDay.keys()).sort();

  // Walk days, tracking running streak and best streak.
  let runLength = 0;
  let bestStreak = 0;
  let bestStreakAchievedAt: string | null = null;
  const streakMilestones: Partial<Record<7 | 30 | 100, string>> = {};
  let prevKey: string | null = null;

  for (const dayKey of sortedDays) {
    if (prevKey !== null && prevDayKey(dayKey) === prevKey) {
      runLength += 1;
    } else {
      runLength = 1;
    }

    const earliest = earliestByDay.get(dayKey)!;

    if (runLength > bestStreak) {
      bestStreak = runLength;
      bestStreakAchievedAt = earliest;
    }

    for (const threshold of [7, 30, 100] as const) {
      if (runLength === threshold && streakMilestones[threshold] === undefined) {
        streakMilestones[threshold] = earliest;
      }
    }

    prevKey = dayKey;
  }

  // Current streak uses today-is-grace anchor.
  const todayKey = localDayKey(now.toISOString(), timezone);
  const yesterdayKey = prevDayKey(todayKey);

  let anchor: string | null = null;
  if (earliestByDay.has(todayKey)) {
    anchor = todayKey;
  } else if (earliestByDay.has(yesterdayKey)) {
    anchor = yesterdayKey;
  }

  let currentStreak = 0;
  if (anchor !== null) {
    let cursor: string = anchor;
    while (earliestByDay.has(cursor)) {
      currentStreak += 1;
      cursor = prevDayKey(cursor);
    }
  }

  return {
    currentStreak,
    bestStreak,
    bestStreakAchievedAt,
    streakMilestones,
  };
}
