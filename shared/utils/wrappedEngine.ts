/**
 * Pure Wrapped compute engine.
 *
 * Produces WrappedDailyPayload and WrappedWeeklyCards from a WrappedInput.
 * No I/O, no Date.now(), no side effects. Fully deterministic given the
 * same input + ctx (the RNG is the only non-deterministic element, and in
 * tests it is seeded).
 */

import type { WrappedDailyPayload, WrappedHighlight, WrappedTier, WrappedWeeklyCards } from '../types';
import type { WrappedInput } from './wrappedRules';
import type { WrappedCandidate } from './wrappedRules';
import { evaluateRules } from './wrappedRules';
import {
  pickVariant,
  HEADLINE_TIER_POOLS,
  HIGHLIGHT_POOLS,
} from './wrappedCopy';
import { dayOfWeekLabel } from './wrappedDays';
import type { CreditEvent } from './leaderboardStreaks';

// =============================================================================
// Internal helpers
// =============================================================================

/** Map a family task count to a WrappedTier. */
function countToTier(count: number): WrappedTier {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

/** Sum credit events for one user inside the window. */
function creditsInWindow(events: CreditEvent[], windowStart: string, windowEnd: string): number {
  return events.filter(
    (e) => e.completedAt >= windowStart && e.completedAt <= windowEnd
  ).length;
}

/**
 * Sort candidates descending by score with deterministic tie-breaking:
 *   1. score DESC
 *   2. cadenceTag 'both' before 'daily'/'weekly'
 *   3. category alphabetical ASC
 */
function sortCandidates(candidates: WrappedCandidate[]): WrappedCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aBoth = a.cadenceTag === 'both' ? 0 : 1;
    const bBoth = b.cadenceTag === 'both' ? 0 : 1;
    if (aBoth !== bBoth) return aBoth - bBoth;
    return a.category < b.category ? -1 : a.category > b.category ? 1 : 0;
  });
}

/**
 * Select up to `maxSlots` highlights from sorted candidates.
 *
 * Slot 0 is picked unconditionally (highest score).
 * Slots 1+ require:
 *   - score ≥ 40
 *   - category not already selected
 */
function selectHighlights(
  sorted: WrappedCandidate[],
  maxSlots: number,
  recentCopyIds: Set<string>,
  rng: () => number
): WrappedHighlight[] {
  if (sorted.length === 0) return [];

  const selected: WrappedHighlight[] = [];
  const usedCategories = new Set<string>();

  for (const candidate of sorted) {
    if (selected.length >= maxSlots) break;

    // Slot 0: unconditional. Slots 1+: score floor + category dedup.
    if (selected.length > 0) {
      if (candidate.score < 40) break; // sorted desc — nothing after will pass either
      if (usedCategories.has(candidate.category)) continue;
    }

    const pool = HIGHLIGHT_POOLS[candidate.ruleId];
    const variant = pickVariant(pool, recentCopyIds, rng);
    // Add variant to recentCopyIds so subsequent slots in the same Wrapped
    // don't repeat it.
    recentCopyIds.add(variant.id);

    selected.push({
      ruleId: candidate.ruleId,
      category: candidate.category,
      score: candidate.score,
      copyVariantId: variant.id,
      fills: candidate.fills,
    });
    usedCategories.add(candidate.category);
  }

  return selected;
}

// =============================================================================
// Public: computeDailyWrapped
// =============================================================================

/**
 * Compute a complete WrappedDailyPayload for the given window + input.
 *
 * @param input  All task/badge/streak/trip data for the window.
 * @param ctx    { recentCopyIds } is mutated as variant IDs are picked;
 *               pass a fresh Set seeded from the stored usedCopyIds. rng
 *               must be a seeded PRNG in tests, Math.random in production.
 */
export function computeDailyWrapped(
  input: WrappedInput,
  ctx: { recentCopyIds: Set<string>; rng: () => number }
): WrappedDailyPayload {
  // 1. Total credit count for the window.
  let totalCount = 0;
  for (const [, userData] of input.perUser) {
    totalCount += creditsInWindow(userData.creditEvents, input.windowStart, input.windowEnd);
  }

  // 2. Map to tier.
  const tier = countToTier(totalCount);

  // 3. Pick headline copy.
  const tierPool = HEADLINE_TIER_POOLS[tier];
  const headlineVariant = pickVariant(tierPool.variants, ctx.recentCopyIds, ctx.rng);
  ctx.recentCopyIds.add(headlineVariant.id);

  // 4. Evaluate rules (already filtered to cadence by evaluateRules).
  const candidates = evaluateRules(input);

  // 5. Sort.
  const sorted = sortCandidates(candidates);

  // 6–8. Select up to 2 highlights for daily.
  const highlights = selectHighlights(sorted, 2, ctx.recentCopyIds, ctx.rng);

  // 9. dateKey = start of the window (YYYY-MM-DD portion).
  const dateKey = input.windowStart.slice(0, 10);

  return {
    cadence: 'daily',
    dateKey,
    familyId: input.familyId,
    headline: { count: totalCount, tier, copyVariantId: headlineVariant.id },
    highlights,
    tz: input.tz,
  };
}

// =============================================================================
// Public: computeWeeklyCards
// =============================================================================

/**
 * Compute a complete WrappedWeeklyCards for the given window + input.
 *
 * In addition to highlight selection, computes:
 *   - bestDay (Mon–Sun day with max credit events; ties go to most recent day)
 *   - leaderboard totals + winnerId (null if tied)
 *   - streak state per user
 *
 * @param input  All data for the week.
 * @param ctx    { recentCopyIds, rng, nextFireLocalIso } — nextFireLocalIso is
 *               ISO date of the next weekly fire (used for the closer card).
 */
export function computeWeeklyCards(
  input: WrappedInput,
  ctx: { recentCopyIds: Set<string>; rng: () => number; nextFireLocalIso: string }
): WrappedWeeklyCards {
  // 1. Total count for headline + tier.
  let totalCount = 0;
  for (const [, userData] of input.perUser) {
    totalCount += creditsInWindow(userData.creditEvents, input.windowStart, input.windowEnd);
  }

  // 2. Week-over-week delta.
  const wowDelta = input.priorWeek !== null ? totalCount - input.priorWeek.familyTotal : 0;

  // 3. Headline copy.
  const tier = countToTier(totalCount);
  const tierPool = HEADLINE_TIER_POOLS[tier];
  const headlineVariant = pickVariant(tierPool.variants, ctx.recentCopyIds, ctx.rng);
  ctx.recentCopyIds.add(headlineVariant.id);

  // 4. Best day: day with max credit events among Mon–Sun.
  //    Collect all events in the window bucketed by their YYYY-MM-DD (UTC slice).
  const creditsByDay = new Map<string, number>();
  for (const [, userData] of input.perUser) {
    for (const e of userData.creditEvents) {
      if (e.completedAt < input.windowStart || e.completedAt > input.windowEnd) continue;
      const dayKey = e.completedAt.slice(0, 10);
      creditsByDay.set(dayKey, (creditsByDay.get(dayKey) ?? 0) + 1);
    }
  }

  let bestDayKey: string = input.windowStart.slice(0, 10);
  let bestDayCount = 0;
  for (const [dayKey, count] of creditsByDay) {
    // Ties: take the most recent (larger dateKey string).
    if (count > bestDayCount || (count === bestDayCount && dayKey > bestDayKey)) {
      bestDayKey = dayKey;
      bestDayCount = count;
    }
  }

  const bestDayLabel = dayOfWeekLabel(bestDayKey, input.tz);

  // 5. Leaderboard totals.
  const leaderboardByUserId: Record<string, number> = {};
  for (const [userId, userData] of input.perUser) {
    leaderboardByUserId[userId] = creditsInWindow(
      userData.creditEvents,
      input.windowStart,
      input.windowEnd
    );
  }

  let winnerId: string | null = null;
  {
    const entries = Object.entries(leaderboardByUserId);
    if (entries.length === 2) {
      const [[idA, cntA], [idB, cntB]] = entries;
      if (cntA > cntB) winnerId = idA;
      else if (cntB > cntA) winnerId = idB;
      // else tied → null
    } else if (entries.length === 1) {
      winnerId = entries[0][0];
    }
  }

  // 6. Streak state.
  const streaksByUserId: Record<string, { current: number; grew: boolean }> = {};
  for (const [userId, userData] of input.perUser) {
    streaksByUserId[userId] = {
      current: userData.currentStreak,
      grew: userData.grewStreakInWindow,
    };
  }

  // 7. Evaluate rules (already filtered to weekly cadence).
  const candidates = evaluateRules(input);
  const sorted = sortCandidates(candidates);

  // 8. Select up to 3 highlights.
  const highlights = selectHighlights(sorted, 3, ctx.recentCopyIds, ctx.rng);

  return {
    headline: { count: totalCount, wowDelta, copyVariantId: headlineVariant.id },
    bestDay: { dayOfWeek: bestDayLabel, count: bestDayCount },
    leaderboard: { byUserId: leaderboardByUserId, winnerId },
    streaks: { byUserId: streaksByUserId },
    highlights,
    closer: { nextFireLocalIso: ctx.nextFireLocalIso },
  };
}
