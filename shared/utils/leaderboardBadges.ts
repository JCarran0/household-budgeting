/**
 * Pure badge derivation for the task leaderboard.
 *
 * Given a stream of credit events for a single user + the streak milestones
 * produced by `computeStreaksForUser`, return the set of earned badges with
 * their first-tip `earnedAt` timestamps.
 *
 * Badges are data-driven (BRD §4.2 / plan D15): a badge appears when the
 * threshold is currently satisfied, and disappears if the qualifying
 * completions are reverted. The `earnedAt` is the completedAt of the credit
 * that first tipped the threshold against the current dataset.
 */

import type { BadgeId, EarnedBadge } from '../types';
import type { CreditEvent } from './leaderboardStreaks';
import { localDayKey } from './leaderboardDays';

type StreakMilestones = Partial<Record<7 | 30 | 100, string>>;

/**
 * ISO-week key (YYYY-Www, Monday-start) in the given timezone.
 *
 * Derived from the local YYYY-MM-DD key to stay DST-safe. Applies the
 * standard ISO 8601 algorithm: the week that contains the year's first
 * Thursday is week 1.
 */
function isoWeekKey(iso: string, timezone: string): string {
  const dayKey = localDayKey(iso, timezone);
  const [y, m, d] = dayKey.split('-').map(Number);
  // Use UTC Date as a calendar calculator — we want a pure date computation
  // independent of the host TZ.
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7; // 1..7 with Monday=1
  dt.setUTCDate(dt.getUTCDate() + 4 - dow); // move to Thursday of that ISO week
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Compute earned badges for a single user.
 *
 * @param events           Credit events for ONE user (filter upstream).
 * @param streakMilestones From `computeStreaksForUser`.
 * @param timezone         IANA timezone for calendar bucketing.
 */
export function computeEarnedBadges(
  events: CreditEvent[],
  streakMilestones: StreakMilestones,
  timezone: string
): EarnedBadge[] {
  if (events.length === 0) return [];

  // Sort events ascending by completedAt for monotonic first-tip semantics.
  const sorted = [...events].sort((a, b) =>
    a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0
  );

  const earned = new Map<BadgeId, string>();

  // ---- VOLUME (N-in-a-day) ----------------------------------------------
  const volumeThresholds: Array<{ id: BadgeId; n: number }> = [
    { id: 'volume_5', n: 5 },
    { id: 'volume_10', n: 10 },
    { id: 'volume_20', n: 20 },
  ];
  const dailyCounts = new Map<string, number>();
  for (const evt of sorted) {
    const day = localDayKey(evt.completedAt, timezone);
    const next = (dailyCounts.get(day) ?? 0) + 1;
    dailyCounts.set(day, next);
    for (const { id, n } of volumeThresholds) {
      if (next === n && !earned.has(id)) {
        earned.set(id, evt.completedAt);
      }
    }
  }

  // ---- CONSISTENCY (distinct days in an ISO week) -----------------------
  const consistencyThresholds: Array<{ id: BadgeId; n: number }> = [
    { id: 'consistency_4', n: 4 },
    { id: 'consistency_5', n: 5 },
    { id: 'consistency_7', n: 7 },
  ];
  // Per week, track the set of distinct local days seen so far.
  const weekDistinctDays = new Map<string, Set<string>>();
  for (const evt of sorted) {
    const day = localDayKey(evt.completedAt, timezone);
    const week = isoWeekKey(evt.completedAt, timezone);
    let set = weekDistinctDays.get(week);
    if (!set) {
      set = new Set();
      weekDistinctDays.set(week, set);
    }
    if (set.has(day)) continue;
    set.add(day);
    const distinct = set.size;
    for (const { id, n } of consistencyThresholds) {
      if (distinct === n && !earned.has(id)) {
        earned.set(id, evt.completedAt);
      }
    }
  }

  // ---- STREAK (from caller-supplied milestones) -------------------------
  if (streakMilestones[7]) earned.set('streak_7', streakMilestones[7]!);
  if (streakMilestones[30]) earned.set('streak_30', streakMilestones[30]!);
  if (streakMilestones[100]) earned.set('streak_100', streakMilestones[100]!);

  // ---- LIFETIME (cumulative count) --------------------------------------
  const lifetimeThresholds: Array<{ id: BadgeId; n: number }> = [
    { id: 'lifetime_10', n: 10 },
    { id: 'lifetime_50', n: 50 },
    { id: 'lifetime_100', n: 100 },
    { id: 'lifetime_500', n: 500 },
    { id: 'lifetime_1000', n: 1000 },
  ];
  for (let i = 0; i < sorted.length; i++) {
    const count = i + 1;
    for (const { id, n } of lifetimeThresholds) {
      if (count === n && !earned.has(id)) {
        earned.set(id, sorted[i].completedAt);
      }
    }
  }

  // Return sorted by earnedAt ascending for stability.
  const out: EarnedBadge[] = Array.from(earned.entries()).map(([id, earnedAt]) => ({
    id,
    earnedAt,
  }));
  out.sort((a, b) => (a.earnedAt < b.earnedAt ? -1 : a.earnedAt > b.earnedAt ? 1 : 0));
  return out;
}
