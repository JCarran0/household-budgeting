/**
 * Pure Wrapped highlight rule catalog.
 *
 * `evaluateRules` is the single public entry point. It runs all 11 rule
 * functions, filters candidates by cadence, and returns them unsorted so the
 * caller (wrappedEngine) can apply its own sort + slot-selection logic.
 *
 * All functions are deterministic given the same WrappedInput — no I/O,
 * no date.now(), no randomness. Copy selection (which requires an RNG) is
 * the engine's responsibility.
 */

import type { CreditEvent } from './leaderboardStreaks';
import type { BadgeId } from '../types';
import type { WrappedCadence, WrappedRuleId, WrappedRuleCategory } from '../types';

// =============================================================================
// Public input / output types
// =============================================================================

export interface WrappedInput {
  familyId: string;
  windowStart: string;           // ISO datetime (inclusive)
  windowEnd: string;             // ISO datetime (inclusive)
  cadence: WrappedCadence;
  tz: string;
  members: Array<{ id: string; displayName: string }>;
  perUser: Map<
    string,
    {
      creditEvents: CreditEvent[];
      allTimeDaily30: number;      // per-user rolling 30-day daily-credit max
      currentStreak: number;
      grewStreakInWindow: boolean;
      newlyEarnedBadges: Array<{
        badgeId: BadgeId;
        tier: 1 | 2 | 3 | 4 | 5;
        earnedAt: string;
        label: string;
        celebrationCopy: string;
      }>;
    }
  >;
  closedTasksInWindow: Array<{
    id: string;
    title: string;
    createdAt: string;
    completedAt: string;
    completedByUserId: string;
  }>;
  projectCloses: Array<{
    projectId: string;
    projectName: string;
    count: number;
    byUserId: string;
  }>;
  tripStopsAdded: Array<{
    tripId: string;
    tripName: string;
    count: number;
    byUserId: string;
  }>;
  transactionsCategorized: { count: number; byUserId: string | null };
  priorWeek: { familyTotal: number } | null;       // weekly-only
  midweekState: { byUserId: Record<string, number> } | null; // EOD Wed counts, weekly-only
}

export interface WrappedCandidate {
  ruleId: WrappedRuleId;
  category: WrappedRuleCategory;
  score: number;                   // 0..100
  fills: Record<string, string | number>;
  cadenceTag: 'daily' | 'weekly' | 'both';
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Sum credit events for one user in the given window. */
function sumCredits(events: CreditEvent[], windowStart: string, windowEnd: string): number {
  return events.filter(
    (e) => e.completedAt >= windowStart && e.completedAt <= windowEnd
  ).length;
}

/** Display name for a userId, fallback to userId. */
function displayName(userId: string, members: WrappedInput['members']): string {
  return members.find((m) => m.id === userId)?.displayName ?? userId;
}

/** Calendar-day age between two ISO timestamps (completedAt − createdAt), in full days. */
function ageInDays(createdAt: string, completedAt: string): number {
  const created = new Date(createdAt).getTime();
  const completed = new Date(completedAt).getTime();
  return Math.floor((completed - created) / 86_400_000);
}

// =============================================================================
// Rule implementations (private)
// =============================================================================

/**
 * Rule 1 — Zombie slain
 * Closed a task with completedAt − createdAt ≥ 7 days.
 * One candidate per user (oldest zombie only). Score: 90. Cadence: both.
 */
function ruleZombie(input: WrappedInput): WrappedCandidate[] {
  const byUser = new Map<
    string,
    { task: WrappedInput['closedTasksInWindow'][number]; age: number }
  >();

  for (const task of input.closedTasksInWindow) {
    const age = ageInDays(task.createdAt, task.completedAt);
    if (age < 7) continue;

    const existing = byUser.get(task.completedByUserId);
    // Keep the oldest zombie per user (most impressive).
    if (!existing || age > existing.age) {
      byUser.set(task.completedByUserId, { task, age });
    }
  }

  const candidates: WrappedCandidate[] = [];
  for (const [userId, { task, age }] of byUser) {
    candidates.push({
      ruleId: 'zombie',
      category: 'zombie',
      score: 90,
      fills: {
        displayName: displayName(userId, input.members),
        taskName: task.title,
        ageInDays: age,
      },
      cadenceTag: 'both',
    });
  }
  return candidates;
}

/**
 * Rule 2 — Badge earned
 * Newly-earned leaderboard badge within the window. One candidate per
 * user per badge. De-duplicated to the highest-scoring badge per user.
 * Score: 85 + tier × 2. Cadence: both.
 */
function ruleBadge(input: WrappedInput): WrappedCandidate[] {
  // Collect all badge candidates, then keep only the best per user.
  const bestByUser = new Map<string, WrappedCandidate>();

  for (const [userId, userData] of input.perUser) {
    for (const badge of userData.newlyEarnedBadges) {
      if (badge.earnedAt < input.windowStart || badge.earnedAt > input.windowEnd) continue;
      const score = 85 + badge.tier * 2;
      const candidate: WrappedCandidate = {
        ruleId: 'badge',
        category: 'badge',
        score,
        fills: {
          displayName: displayName(userId, input.members),
          badgeLabel: badge.label,
          celebrationCopy: badge.celebrationCopy,
        },
        cadenceTag: 'both',
      };
      const existing = bestByUser.get(userId);
      if (!existing || score > existing.score) {
        bestByUser.set(userId, candidate);
      }
    }
  }

  return Array.from(bestByUser.values());
}

/**
 * Rule 3 — Streak milestone
 * grewStreakInWindow && currentStreak ≥ 3. Score: 75. Cadence: both.
 */
function ruleStreakMilestone(input: WrappedInput): WrappedCandidate[] {
  const candidates: WrappedCandidate[] = [];
  for (const [userId, userData] of input.perUser) {
    if (!userData.grewStreakInWindow) continue;
    if (userData.currentStreak < 3) continue;
    candidates.push({
      ruleId: 'streak_milestone',
      category: 'streak',
      score: 75,
      fills: {
        displayName: displayName(userId, input.members),
        currentStreak: userData.currentStreak,
      },
      cadenceTag: 'both',
    });
  }
  return candidates;
}

/**
 * Rule 4 — Personal best day (daily only)
 * Today's per-user credit count > allTimeDaily30 AND allTimeDaily30 ≥ 3.
 * Score: 80. Cadence: daily.
 */
function rulePersonalBest(input: WrappedInput): WrappedCandidate[] {
  const candidates: WrappedCandidate[] = [];
  for (const [userId, userData] of input.perUser) {
    const todayCount = sumCredits(userData.creditEvents, input.windowStart, input.windowEnd);
    if (userData.allTimeDaily30 < 3) continue;
    if (todayCount <= userData.allTimeDaily30) continue;
    candidates.push({
      ruleId: 'personal_best',
      category: 'personal_best',
      score: 80,
      fills: {
        displayName: displayName(userId, input.members),
        N: todayCount,
      },
      cadenceTag: 'daily',
    });
  }
  return candidates;
}

/**
 * Rule 5 — Leaderboard win
 * |N − M| ≥ 3 AND min ≤ max / 2 (lopsided days get louder copy; close days = no highlight).
 * Score: 70. Cadence: both.
 */
function ruleLeaderboardWin(input: WrappedInput): WrappedCandidate[] {
  if (input.members.length < 2) return [];

  const countsByUser: Array<{ userId: string; count: number }> = [];
  for (const [userId, userData] of input.perUser) {
    const count = sumCredits(userData.creditEvents, input.windowStart, input.windowEnd);
    countsByUser.push({ userId, count });
  }

  // Exactly 2 users assumed (two-user family app).
  if (countsByUser.length < 2) return [];
  const [a, b] = countsByUser;
  const maxCount = Math.max(a.count, b.count);
  const minCount = Math.min(a.count, b.count);

  if (Math.abs(a.count - b.count) < 3) return [];
  if (minCount > maxCount / 2) return [];

  const winner = a.count > b.count ? a : b;
  const loser = a.count > b.count ? b : a;

  return [
    {
      ruleId: 'leaderboard_win',
      category: 'leaderboard',
      score: 70,
      fills: {
        winner: displayName(winner.userId, input.members),
        loser: displayName(loser.userId, input.members),
        N: winner.count,
        M: loser.count,
      },
      cadenceTag: 'both',
    },
  ];
}

/**
 * Rule 6 — Week-over-week gain (weekly only)
 * priorWeek.familyTotal ≥ 5 AND windowTotal ≥ 1.2 × priorWeek.familyTotal.
 * Score: 65. Cadence: weekly.
 */
function ruleWowGain(input: WrappedInput): WrappedCandidate[] {
  if (!input.priorWeek) return [];
  const prior = input.priorWeek.familyTotal;
  if (prior < 5) return [];

  let windowTotal = 0;
  for (const [, userData] of input.perUser) {
    windowTotal += sumCredits(userData.creditEvents, input.windowStart, input.windowEnd);
  }

  if (windowTotal < 1.2 * prior) return [];

  const pct = Math.round(((windowTotal - prior) / prior) * 100);
  const delta = windowTotal - prior;

  return [
    {
      ruleId: 'wow_gain',
      category: 'wow',
      score: 65,
      fills: {
        pct,
        delta,
        N: windowTotal,
        M: prior,
      },
      cadenceTag: 'weekly',
    },
  ];
}

/**
 * Rule 7 — Midweek comeback (weekly only)
 * midweekState leader ≠ final leader AND final gap ≥ 1.
 * Score: 60. Cadence: weekly.
 */
function ruleMidweekComeback(input: WrappedInput): WrappedCandidate[] {
  if (!input.midweekState) return [];
  if (input.members.length < 2) return [];

  const midCounts = input.midweekState.byUserId;

  // Final counts (full window).
  const finalCounts: Record<string, number> = {};
  for (const [userId, userData] of input.perUser) {
    finalCounts[userId] = sumCredits(userData.creditEvents, input.windowStart, input.windowEnd);
  }

  const userIds = input.members.map((m) => m.id);
  if (userIds.length < 2) return [];

  const [idA, idB] = userIds;
  const midA = midCounts[idA] ?? 0;
  const midB = midCounts[idB] ?? 0;
  const finalA = finalCounts[idA] ?? 0;
  const finalB = finalCounts[idB] ?? 0;

  // Midweek leader (higher midweek count).
  const midLeader = midA > midB ? idA : midA < midB ? idB : null;
  // Final leader (higher final count, must win by ≥1).
  const finalLeader = finalA > finalB ? idA : finalA < finalB ? idB : null;

  if (midLeader === null || finalLeader === null) return [];
  if (midLeader === finalLeader) return [];

  // finalLeader was behind at midweek — that's the comeback.
  return [
    {
      ruleId: 'midweek_comeback',
      category: 'comeback',
      score: 60,
      fills: {
        winner: displayName(finalLeader, input.members),
        loser: displayName(midLeader, input.members),
      },
      cadenceTag: 'weekly',
    },
  ];
}

/**
 * Rule 8 — Category sweep (weekly only)
 * ≥1 family credit event on every day Mon–Sun.
 * Score: 55. Cadence: weekly.
 */
function ruleCategorySweep(input: WrappedInput): WrappedCandidate[] {
  // Collect all credit event timestamps in the window.
  const daysWithCredits = new Set<string>();
  for (const [, userData] of input.perUser) {
    for (const e of userData.creditEvents) {
      if (e.completedAt < input.windowStart || e.completedAt > input.windowEnd) continue;
      // Extract YYYY-MM-DD in UTC (events are already filtered to the window so
      // the calendar day in the household TZ is close enough for daily presence).
      const dayKey = e.completedAt.slice(0, 10);
      daysWithCredits.add(dayKey);
    }
  }

  // We need 7 distinct calendar days in the window.
  if (daysWithCredits.size < 7) return [];

  return [
    {
      ruleId: 'category_sweep',
      category: 'sweep',
      score: 55,
      fills: {},
      cadenceTag: 'weekly',
    },
  ];
}

/**
 * Rule 9 — Project progress
 * projectCloses.length > 0. Pick the project with the most closes.
 * Score: 50. Cadence: both.
 */
function ruleProjectProgress(input: WrappedInput): WrappedCandidate[] {
  if (input.projectCloses.length === 0) return [];

  // Pick project with most closes; tie-break alphabetical by projectName.
  const best = input.projectCloses.reduce((a, b) =>
    a.count > b.count || (a.count === b.count && a.projectName < b.projectName) ? a : b
  );

  return [
    {
      ruleId: 'project_progress',
      category: 'project',
      score: 50,
      fills: {
        projectName: best.projectName,
        count: best.count,
        displayName: displayName(best.byUserId, input.members),
      },
      cadenceTag: 'both',
    },
  ];
}

/**
 * Rule 10 — Trip momentum
 * tripStopsAdded.length > 0. Pick the trip with the most stops.
 * Score: 45. Cadence: both.
 */
function ruleTripMomentum(input: WrappedInput): WrappedCandidate[] {
  if (input.tripStopsAdded.length === 0) return [];

  const best = input.tripStopsAdded.reduce((a, b) =>
    a.count > b.count || (a.count === b.count && a.tripName < b.tripName) ? a : b
  );

  return [
    {
      ruleId: 'trip_momentum',
      category: 'trip',
      score: 45,
      fills: {
        tripName: best.tripName,
        count: best.count,
        displayName: displayName(best.byUserId, input.members),
      },
      cadenceTag: 'both',
    },
  ];
}

/**
 * Rule 11 — Receipt sweep
 * transactionsCategorized.count ≥ 5. Score: 40. Cadence: both.
 */
function ruleReceiptSweep(input: WrappedInput): WrappedCandidate[] {
  if (input.transactionsCategorized.count < 5) return [];

  const fills: Record<string, string | number> = {
    count: input.transactionsCategorized.count,
  };
  if (input.transactionsCategorized.byUserId !== null) {
    fills.displayName = displayName(
      input.transactionsCategorized.byUserId,
      input.members
    );
  }

  return [
    {
      ruleId: 'receipt_sweep',
      category: 'receipts',
      score: 40,
      fills,
      cadenceTag: 'both',
    },
  ];
}

// =============================================================================
// Public entry point
// =============================================================================

/**
 * Evaluate all 11 highlight rules against `input` and return the candidates
 * that match the requested cadence.
 *
 * Candidates are returned **unsorted** — sorting and slot-selection are the
 * engine's responsibility (wrappedEngine.ts) so the engine owns the full
 * tie-breaking + category-dedup logic in one place.
 */
export function evaluateRules(input: WrappedInput): WrappedCandidate[] {
  const all: WrappedCandidate[] = [
    ...ruleZombie(input),
    ...ruleBadge(input),
    ...ruleStreakMilestone(input),
    ...rulePersonalBest(input),
    ...ruleLeaderboardWin(input),
    ...ruleWowGain(input),
    ...ruleMidweekComeback(input),
    ...ruleCategorySweep(input),
    ...ruleProjectProgress(input),
    ...ruleTripMomentum(input),
    ...ruleReceiptSweep(input),
  ];

  return all.filter((c) => {
    if (c.cadenceTag === 'both') return true;
    return c.cadenceTag === input.cadence;
  });
}
