/**
 * Calendar-day helpers for leaderboard streak + badge computation.
 *
 * Both bucketing layers (streaks, badges) need to convert ISO timestamps to
 * local YYYY-MM-DD keys in the viewer's timezone. `en-CA` locale is
 * ISO-shaped and DST-aware via Intl.
 */

/** YYYY-MM-DD in the given IANA timezone. */
export function localDayKey(iso: string, timezone: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: timezone });
}
