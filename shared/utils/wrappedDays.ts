/**
 * Pure IANA-TZ helpers for Wrapped cadence and window logic.
 *
 * All functions accept an explicit `now: Date` — never call Date.now()
 * internally. This makes every function deterministically testable against
 * DST edge cases (spring-forward, fall-back) and arbitrary timezones.
 *
 * TZ conversion is done via Intl.DateTimeFormat / toLocaleDateString
 * (the same approach used in leaderboardDays.ts and easternTime.ts),
 * which is DST-safe across all IANA timezone identifiers.
 */

/**
 * Returns YYYY-MM-DD in the given IANA timezone.
 *
 * Uses `en-CA` locale which produces ISO-shaped dates without locale
 * transforms, matching the convention in leaderboardDays.ts.
 */
export function localDateKey(now: Date, tz: string): string {
  return now.toLocaleDateString('en-CA', { timeZone: tz });
}

/**
 * Returns { hour, minute } in the given IANA timezone for the given moment.
 * Uses en-GB 24-hour format to avoid AM/PM ambiguity.
 */
function localHourMinute(now: Date, tz: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).formatToParts(now);

  const hourPart = parts.find((p) => p.type === 'hour');
  const minutePart = parts.find((p) => p.type === 'minute');
  const hour = hourPart ? parseInt(hourPart.value, 10) : 0;
  const minute = minutePart ? parseInt(minutePart.value, 10) : 0;
  // Intl may return "24" for midnight in some locales — normalize.
  return { hour: hour === 24 ? 0 : hour, minute };
}

/**
 * Returns the day of week (0=Sunday..6=Saturday) in the given IANA timezone.
 * Derived from the local YYYY-MM-DD key for DST safety.
 */
function localDayOfWeek(now: Date, tz: string): number {
  const dateKey = localDateKey(now, tz);
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Returns true when `now` falls in the 9:00 PM – 11:59 PM window (inclusive)
 * in the given IANA timezone.
 *
 * Used to determine whether the daily/weekly Wrapped viewing window is open.
 */
export function isInNineToMidnightWindow(now: Date, tz: string): boolean {
  const { hour } = localHourMinute(now, tz);
  return hour >= 21; // 21:00–23:59
}

/**
 * Returns true during the extended weekly Wrapped viewing window:
 * Sunday 9:00 PM through Monday 11:59 PM (27-hour window).
 *
 * This window is wider than the daily to accommodate Monday-morning openers.
 */
export function isInWeeklyExtendedWindow(now: Date, tz: string): boolean {
  const dow = localDayOfWeek(now, tz);
  const { hour } = localHourMinute(now, tz);

  // Sunday (0) from 21:00 onward.
  if (dow === 0 && hour >= 21) return true;
  // All of Monday (1) up through 23:59.
  if (dow === 1) return true;

  return false;
}

/**
 * Returns the ISO Monday (start) and ISO Sunday (end) of the calendar week
 * that contains `now`, in the given IANA timezone.
 *
 * Uses Monday-as-week-start convention (ISO 8601).
 */
export function isoWeekBoundaries(now: Date, tz: string): { start: string; end: string } {
  const dateKey = localDateKey(now, tz);
  const [y, m, d] = dateKey.split('-').map(Number);
  const localMidnight = new Date(Date.UTC(y, m - 1, d));
  const dow = localMidnight.getUTCDay(); // 0=Sun..6=Sat

  // ISO week starts Monday. Days from Monday: Mon=0, Tue=1...Sun=6.
  const daysFromMonday = dow === 0 ? 6 : dow - 1;

  const monday = new Date(localMidnight);
  monday.setUTCDate(localMidnight.getUTCDate() - daysFromMonday);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  function toKey(dt: Date): string {
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  return { start: toKey(monday), end: toKey(sunday) };
}

/**
 * Returns the day-of-week label for a YYYY-MM-DD ISO date string.
 * The `tz` parameter is unused for date-only strings (no TZ ambiguity),
 * but is accepted for API symmetry and future extension.
 */
export function dayOfWeekLabel(
  dateIso: string,
  _tz: string
): 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday' {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const labels = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ] as const;
  return labels[dow];
}

/**
 * Returns true when `now` is within the scheduler fire window:
 * 9:00 PM – 9:14 PM (inclusive) in the given IANA timezone.
 *
 * The scheduler runs every 15 minutes; this window ensures a single
 * tick fires without the window having already been missed or double-firing
 * at 9:15 (which would fall outside).
 */
export function isSchedulerWindow(now: Date, tz: string): boolean {
  const { hour, minute } = localHourMinute(now, tz);
  return hour === 21 && minute <= 14;
}
