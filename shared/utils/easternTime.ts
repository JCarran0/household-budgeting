/**
 * US Eastern Time helpers.
 *
 * All user-visible date boundaries in this app (month buckets, "today"
 * comparisons, sync windows) should resolve in America/New_York, not the
 * server's runtime timezone or UTC. Both users live in ET, and the
 * leaderboard/streak layer already assumes ET — the rest of the app
 * should match so a transaction posted at 11pm ET on the last of the
 * month never leaks into next month's totals.
 */

export const EASTERN_TIME_ZONE = 'America/New_York';

/** YYYY-MM-DD for the given moment in US Eastern Time. Defaults to now. */
export function etDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: EASTERN_TIME_ZONE });
}

/** YYYY-MM for the given moment in US Eastern Time. Defaults to now. */
export function etMonthString(date: Date = new Date()): string {
  return etDateString(date).slice(0, 7);
}

/**
 * YYYY-MM-DD for the first day of the given calendar month.
 * Timezone-independent — the 1st is always the 1st.
 * monthIndex is 0-based (0 = January) to match JS Date conventions.
 */
export function firstDayOfMonth(year: number, monthIndex: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  return `${year}-${m}-01`;
}

/**
 * YYYY-MM-DD for the last day of the given calendar month.
 * Uses UTC Date math so the result doesn't depend on the server's timezone.
 * Correctly handles 28/29/30/31-day months including leap years.
 * monthIndex is 0-based (0 = January) to match JS Date conventions.
 */
export function lastDayOfMonth(year: number, monthIndex: number): string {
  const day = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/** Parse a YYYY-MM key into { year, monthIndex } where monthIndex is 0-based. */
export function parseMonthKey(monthKey: string): { year: number; monthIndex: number } {
  const [year, month] = monthKey.split('-').map(Number);
  return { year, monthIndex: month - 1 };
}

/**
 * First day (YYYY-MM-DD) of the ET month containing the given moment.
 * Defaults to now.
 */
export function etStartOfCurrentMonth(date: Date = new Date()): string {
  const { year, monthIndex } = parseMonthKey(etMonthString(date));
  return firstDayOfMonth(year, monthIndex);
}

/**
 * Last day (YYYY-MM-DD) of the ET month containing the given moment.
 * Defaults to now.
 */
export function etEndOfCurrentMonth(date: Date = new Date()): string {
  const { year, monthIndex } = parseMonthKey(etMonthString(date));
  return lastDayOfMonth(year, monthIndex);
}
