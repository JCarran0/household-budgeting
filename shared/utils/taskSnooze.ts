/**
 * Task snooze helpers — resolve a SnoozeOption to an ISO datetime at 06:00
 * local time on the target date.
 *
 * Rules (BRD §2.7, plan D7/D8):
 *   - 'tomorrow'   → now + 1 day at 06:00 local
 *   - 'next_week'  → next Monday at 06:00 local; if today is Monday, +7 days
 *   - 'next_month' → 1st of next month at 06:00 local; if today is the 1st, +1 month
 *   - 'custom'     → customDate (YYYY-MM-DD) at 06:00 local
 *
 * Shared between frontend (Snooze submenu UI) and backend (server-side
 * validation of snoozedUntil values).
 */

export type SnoozeOption = 'tomorrow' | 'next_week' | 'next_month' | 'custom';

const SNOOZE_HOUR = 6;

/**
 * Resolve a snooze option to an ISO datetime.
 *
 * The "local" interpretation uses the provided tzOffsetMinutes (Date#getTimezoneOffset
 * convention — JS-native sign: US Eastern in winter is +300, not -300). The
 * returned ISO string is in UTC; consumers that show it back to the user should
 * format against the same offset.
 *
 * @param option         The snooze option
 * @param now            The current moment (wall-clock). Usually `new Date()`.
 * @param tzOffsetMinutes Local offset from UTC in minutes, using Date#getTimezoneOffset
 *                        convention (positive when local is behind UTC).
 * @param customDate     Required when option === 'custom'. ISO date 'YYYY-MM-DD'.
 */
export function resolveSnoozeDate(
  option: SnoozeOption,
  now: Date,
  tzOffsetMinutes: number,
  customDate?: string
): string {
  if (option === 'custom') {
    if (!customDate || !/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
      throw new Error('custom snooze requires a YYYY-MM-DD customDate');
    }
    const [y, m, d] = customDate.split('-').map(Number);
    return buildLocalAt(y, m - 1, d, tzOffsetMinutes);
  }

  // Shift "now" into local wall-clock space so day-math is local-aware.
  // getTimezoneOffset returns minutes where local = UTC - offset, hence the subtract.
  const localNow = new Date(now.getTime() - tzOffsetMinutes * 60_000);
  const year = localNow.getUTCFullYear();
  const month = localNow.getUTCMonth();
  const date = localNow.getUTCDate();
  const dow = localNow.getUTCDay(); // 0 = Sunday

  if (option === 'tomorrow') {
    return buildLocalAt(year, month, date + 1, tzOffsetMinutes);
  }

  if (option === 'next_week') {
    // Monday = 1. Days to add: (8 - dow) % 7; if that equals 0 (Monday), use 7.
    const rawOffset = (8 - dow) % 7;
    const daysToAdd = rawOffset === 0 ? 7 : rawOffset;
    return buildLocalAt(year, month, date + daysToAdd, tzOffsetMinutes);
  }

  if (option === 'next_month') {
    // If we're already on the 1st, snooze to the 1st of the following month.
    const target = date === 1 ? { y: year, m: month + 2 } : { y: year, m: month + 1 };
    return buildLocalAt(target.y, target.m, 1, tzOffsetMinutes);
  }

  // Exhaustive — TypeScript guards above.
  const _exhaustive: never = option;
  throw new Error(`Unknown snooze option: ${String(_exhaustive)}`);
}

/**
 * Build an ISO UTC string representing 06:00 local on the given local
 * calendar date. Handles year/month rollovers via the Date constructor's
 * own normalization.
 */
function buildLocalAt(
  year: number,
  month: number,
  day: number,
  tzOffsetMinutes: number
): string {
  // Construct in local wall-clock space (via UTC math), then shift back to UTC.
  const localWall = new Date(Date.UTC(year, month, day, SNOOZE_HOUR, 0, 0, 0));
  const utc = new Date(localWall.getTime() + tzOffsetMinutes * 60_000);
  return utc.toISOString();
}

/** True if the snoozedUntil timestamp is in the future relative to `now`. */
export function isSnoozeActive(snoozedUntil: string | null, now: Date): boolean {
  if (!snoozedUntil) return false;
  return new Date(snoozedUntil).getTime() > now.getTime();
}
