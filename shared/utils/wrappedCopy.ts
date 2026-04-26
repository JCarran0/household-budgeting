/**
 * Wrapped copy pools — data-only module.
 *
 * TOKEN CONVENTION
 * ────────────────
 * Slot fills use {camelCase}: {displayName}, {N}, {M}, {winner}, {loser},
 * {ageInDays}, {tripName}, {projectName}, {badgeLabel}, {celebrationCopy},
 * {pct}, {delta}, {taskName}, {count}, {currentStreak}.
 *
 * VOICE GUIDE (§6.3) — mandatory reading before adding copy
 * ──────────────────────────────────────────────────────────
 * • Validating, never guilt-trippy. "Rest day, earned or not" — not "you slacked off."
 * • Playful, occasionally absurd. "The to-do list is actively afraid of you" — yes.
 * • Mildly snarky ONLY at the spouse-vs-spouse moment. "Suck it, Jared" is allowed
 *   because it is framed as playful competition between two consenting adults. Do NOT
 *   extend snark to zero-task or low-activity days.
 * • Second-person to the household, not first-person-plural. "You two closed 8"
 *   not "we closed 8."
 * • Never apologetic. No "sorry you didn't get to X."
 * • No emoji spam in prose. Emoji at the start of highlight rows is genre convention;
 *   don't sprinkle them through sentences.
 * • Pool minimum: ≥8 variants per tier (headline); ≥5 variants per rule (highlights,
 *   weekly cards). The pickVariant exhaustion fallback relaxes dedup after 7 days,
 *   so pool size directly determines how long before repetition is possible.
 */

import type { WrappedRuleId, WrappedTier } from '../types';

// =============================================================================
// Core types
// =============================================================================

export interface CopyVariant {
  id: string;
  template: string;
}

export interface TierPool {
  tier: WrappedTier;
  variants: CopyVariant[];
}

// =============================================================================
// Headline tier pools (§6.1)
// Tier 0 = 0 tasks, Tier 1 = 1-2, Tier 2 = 3-5, Tier 3 = 6-9, Tier 4 = 10+
// ≥8 variants per tier
// =============================================================================

export const HEADLINE_TIER_POOLS: TierPool[] = [
  {
    tier: 0,
    variants: [
      { id: 'h0.v1', template: 'Rest day. Earned or not, it counts.' },
      { id: 'h0.v2', template: 'Quiet one. Tomorrow\'s a new shot.' },
      { id: 'h0.v3', template: 'A zero-task day is sometimes the most productive one 🧘' },
      { id: 'h0.v4', template: 'Nothing crossed off, and that\'s fine.' },
      { id: 'h0.v5', template: 'The to-do list got a day off. So did you.' },
      { id: 'h0.v6', template: 'Pause is a feature, not a bug.' },
      { id: 'h0.v7', template: 'Not every day needs a scoreboard.' },
      { id: 'h0.v8', template: 'Tomorrow then. 🌙' },
    ],
  },
  {
    tier: 1,
    variants: [
      { id: 'h1.v1', template: 'Slow and steady. {N} down.' },
      { id: 'h1.v2', template: 'Momentum is momentum — {N} on the board.' },
      { id: 'h1.v3', template: 'A modest day. Every one counts.' },
      { id: 'h1.v4', template: '{N} in the books. That\'s {N} more than yesterday\'s Mondays.' },
      { id: 'h1.v5', template: 'Not your loudest day, but the list got shorter.' },
      { id: 'h1.v6', template: '{N} closed. The compounding starts with the small days.' },
      { id: 'h1.v7', template: 'Respect to the {N}-task days — they\'re underrated.' },
      { id: 'h1.v8', template: 'Small wins stack.' },
    ],
  },
  {
    tier: 2,
    variants: [
      { id: 'h2.v1', template: 'Solid day. {N} closed.' },
      { id: 'h2.v2', template: '{N} in a day — the list is taking damage.' },
      { id: 'h2.v3', template: 'Respectable. Very respectable.' },
      { id: 'h2.v4', template: '{N} tasks lighter tonight. Nice.' },
      { id: 'h2.v5', template: 'Methodical. {N} on the board.' },
      { id: 'h2.v6', template: 'A good, working day. {N} done.' },
      { id: 'h2.v7', template: 'Nothing flashy — just {N} tasks dispatched.' },
      { id: 'h2.v8', template: '{N} closed, which is more than most humans did today.' },
    ],
  },
  {
    tier: 3,
    variants: [
      { id: 'h3.v1', template: 'Strong day. {N} closed. Keep it up.' },
      { id: 'h3.v2', template: '{N} in a day — someone was in a mood.' },
      { id: 'h3.v3', template: 'Machine mode engaged. {N} down.' },
      { id: 'h3.v4', template: '{N} tasks closed, zero mercy.' },
      { id: 'h3.v5', template: 'A real productive-ish afternoon, apparently.' },
      { id: 'h3.v6', template: '{N} down. The list is in retreat.' },
      { id: 'h3.v7', template: 'Big day. {N} closed before bedtime.' },
      { id: 'h3.v8', template: '{N} closed. You\'re making the rest of us look bad.' },
    ],
  },
  {
    tier: 4,
    variants: [
      { id: 'h4.v1', template: 'OK you two. {N} tasks in a single day?' },
      { id: 'h4.v2', template: 'Unhinged output today. {N} closed.' },
      { id: 'h4.v3', template: '{N} in one day. Are you okay? (Don\'t answer.)' },
      { id: 'h4.v4', template: 'Someone had coffee. {N} closes.' },
      { id: 'h4.v5', template: '{N} tasks. You broke the scoreboard.' },
      { id: 'h4.v6', template: '{N} closed. This isn\'t productivity — it\'s performance art.' },
      { id: 'h4.v7', template: '{N} in a day. Your future self is clapping from the couch.' },
      { id: 'h4.v8', template: 'We checked the math. {N} is correct. Stunning.' },
    ],
  },
];

// =============================================================================
// Highlight copy pools (§6.2)
// 11 rules; ≥5 variants each
// =============================================================================

export const HIGHLIGHT_POOLS: Record<WrappedRuleId, CopyVariant[]> = {
  zombie: [
    {
      id: 'zombie.v1',
      template: '🐌 {displayName} finally closed \'{taskName}\' — that one was {ageInDays} days old.',
    },
    {
      id: 'zombie.v2',
      template: '🐌 {displayName} killed the zombie task. \'{taskName}\' had been lurking for {ageInDays} days.',
    },
    {
      id: 'zombie.v3',
      template: '🐌 \'{taskName}\' has been on the list for {ageInDays} days. {displayName} just put it down.',
    },
    {
      id: 'zombie.v4',
      template: '🐌 {displayName} cleared \'{taskName}\' after {ageInDays} days. That must feel good.',
    },
    {
      id: 'zombie.v5',
      template: '🐌 Zombie task slain: \'{taskName}\' ({ageInDays} days). {displayName} with the kill shot.',
    },
  ],

  badge: [
    {
      id: 'badge.v1',
      template: '🏅 {displayName} earned {badgeLabel}. {celebrationCopy}',
    },
    {
      id: 'badge.v2',
      template: '🏅 New badge for {displayName}: {badgeLabel}.',
    },
    {
      id: 'badge.v3',
      template: '🏅 {displayName} unlocked {badgeLabel}. Casual.',
    },
    {
      id: 'badge.v4',
      template: '🏅 {badgeLabel} goes to {displayName}.',
    },
    {
      id: 'badge.v5',
      template: '🏅 {displayName} clinched {badgeLabel} today. Shelf\'s getting heavier.',
    },
  ],

  streak_milestone: [
    {
      id: 'streak_milestone.v1',
      template: '🔥 {displayName} hit a {currentStreak}-day streak.',
    },
    {
      id: 'streak_milestone.v2',
      template: '🔥 Day {currentStreak} in a row for {displayName}. The rhythm is real.',
    },
    {
      id: 'streak_milestone.v3',
      template: '🔥 {displayName}\'s streak ticked over to {currentStreak} days.',
    },
    {
      id: 'streak_milestone.v4',
      template: '🔥 {currentStreak} consecutive days of closes for {displayName}.',
    },
    {
      id: 'streak_milestone.v5',
      template: '🔥 {displayName}, {currentStreak} days straight. Impressive.',
    },
  ],

  personal_best: [
    {
      id: 'personal_best.v1',
      template: '⭐ {N} tasks in a day — {displayName}\'s best in a month.',
    },
    {
      id: 'personal_best.v2',
      template: '⭐ {displayName} just set a personal record: {N} closes in one day.',
    },
    {
      id: 'personal_best.v3',
      template: '⭐ New personal best for {displayName}. {N} in a day.',
    },
    {
      id: 'personal_best.v4',
      template: '⭐ {displayName} hit {N} tasks today — a month-high.',
    },
    {
      id: 'personal_best.v5',
      template: '⭐ {N} in a day is {displayName}\'s best in 30 days.',
    },
  ],

  leaderboard_win: [
    {
      id: 'leaderboard_win.v1',
      template: '🏆 {winner} lapped {loser} today, {N} vs {M}. Suck it, {loser}.',
    },
    {
      id: 'leaderboard_win.v2',
      template: '🏆 {winner} out-closed {loser} {N}–{M}. Ouch.',
    },
    {
      id: 'leaderboard_win.v3',
      template: '🏆 The scoreboard says {winner} {N}, {loser} {M}. Don\'t shoot the messenger.',
    },
    {
      id: 'leaderboard_win.v4',
      template: '🏆 {winner} ran away with it today. {N}–{M}.',
    },
    {
      id: 'leaderboard_win.v5',
      template: '🏆 {winner} {N}, {loser} {M}. We don\'t make the rules, we just report them.',
    },
  ],

  wow_gain: [
    {
      id: 'wow_gain.v1',
      template: '📈 Family total up {pct}% from last week. Somebody\'s lighting a fire.',
    },
    {
      id: 'wow_gain.v2',
      template: '📈 {N} closes this week vs {M} last week. Real movement.',
    },
    {
      id: 'wow_gain.v3',
      template: '📈 Week-over-week: +{delta}. Nice lift.',
    },
    {
      id: 'wow_gain.v4',
      template: '📈 {pct}% more tasks than last week. Keep it going.',
    },
    {
      id: 'wow_gain.v5',
      template: '📈 The household just had its best week in a while. +{pct}% on last week.',
    },
  ],

  midweek_comeback: [
    {
      id: 'midweek_comeback.v1',
      template: '⚡ {winner} was down at hump day. Finished the week ahead. Classic heel turn.',
    },
    {
      id: 'midweek_comeback.v2',
      template: '⚡ {winner} came from behind — trailing Wed, leading Sunday.',
    },
    {
      id: 'midweek_comeback.v3',
      template: '⚡ Midweek comeback for {winner}. Down mid-week, up by Sunday.',
    },
    {
      id: 'midweek_comeback.v4',
      template: '⚡ Wednesday: {winner} was losing. Sunday: {winner} was winning. Storybook.',
    },
    {
      id: 'midweek_comeback.v5',
      template: '⚡ {winner} pulled a reversal — behind Wednesday, ahead by end of week.',
    },
  ],

  category_sweep: [
    {
      id: 'category_sweep.v1',
      template: '📅 A task closed every single day this week. Perfect attendance.',
    },
    {
      id: 'category_sweep.v2',
      template: '📅 7 for 7 — at least one close every day this week.',
    },
    {
      id: 'category_sweep.v3',
      template: '📅 No zeroes this week. Daily rhythm intact.',
    },
    {
      id: 'category_sweep.v4',
      template: '📅 Full-week sweep: a completion on every day.',
    },
    {
      id: 'category_sweep.v5',
      template: '📅 You two showed up every day this week. That\'s the whole game.',
    },
  ],

  project_progress: [
    {
      id: 'project_progress.v1',
      template: '📁 {count} items closed on {projectName} — real progress.',
    },
    {
      id: 'project_progress.v2',
      template: '📁 {displayName} knocked out {count} on {projectName}.',
    },
    {
      id: 'project_progress.v3',
      template: '📁 {projectName} lost {count} items today. {displayName}\'s doing.',
    },
    {
      id: 'project_progress.v4',
      template: '📁 Big day on {projectName} — {count} closed.',
    },
    {
      id: 'project_progress.v5',
      template: '📁 {count} down on {projectName}. The finish line\'s closer.',
    },
  ],

  trip_momentum: [
    {
      id: 'trip_momentum.v1',
      template: '🌍 {count} new stops on the {tripName} trip — taking shape.',
    },
    {
      id: 'trip_momentum.v2',
      template: '🌍 {displayName} added {count} stops to {tripName}. Planning mode unlocked.',
    },
    {
      id: 'trip_momentum.v3',
      template: '🌍 {tripName} just got {count} new entries. Exciting.',
    },
    {
      id: 'trip_momentum.v4',
      template: '🌍 The {tripName} itinerary grew by {count}.',
    },
    {
      id: 'trip_momentum.v5',
      template: '🌍 {count} stops added to {tripName}. The vibes are building.',
    },
  ],

  receipt_sweep: [
    {
      id: 'receipt_sweep.v1',
      template: '🧾 {count} transactions categorized — receipt inbox tamed.',
    },
    {
      id: 'receipt_sweep.v2',
      template: '🧾 {displayName} plowed through {count} uncategorized transactions.',
    },
    {
      id: 'receipt_sweep.v3',
      template: '🧾 {count} down in categorization. Finances less chaotic.',
    },
    {
      id: 'receipt_sweep.v4',
      template: '🧾 {count} transactions sorted. Future-you thanks present-you.',
    },
    {
      id: 'receipt_sweep.v5',
      template: '🧾 Receipts: {count} categorized. Clean.',
    },
  ],
};

// =============================================================================
// Weekly card copy pools
// ≥5 variants each
// =============================================================================

export const WEEKLY_CARD_COPY: {
  bestDay: CopyVariant[];
  leaderboardPlayful: CopyVariant[];
  leaderboardTied: CopyVariant[];
  streakStatus: CopyVariant[];
  closer: CopyVariant[];
} = {
  bestDay: [
    { id: 'bestDay.v1', template: '{dayOfWeek} was your day — {N} closes.' },
    { id: 'bestDay.v2', template: '{dayOfWeek} ran away with the week: {N} tasks closed.' },
    { id: 'bestDay.v3', template: '{N} on {dayOfWeek}. That was the peak.' },
    { id: 'bestDay.v4', template: 'Best day: {dayOfWeek} with {N} closes.' },
    { id: 'bestDay.v5', template: '{dayOfWeek} hit hardest — {N} in the books.' },
  ],

  leaderboardPlayful: [
    {
      id: 'leaderboard_playful.v1',
      template: '🏆 {winner} takes the week: {N} vs {M}. Bragging rights until Sunday.',
    },
    {
      id: 'leaderboard_playful.v2',
      template: '🏆 Weekly scoreboard: {winner} {N}, {loser} {M}.',
    },
    {
      id: 'leaderboard_playful.v3',
      template: '🏆 {winner} won the week. {N}–{M}. Enjoy the couch, {loser}.',
    },
    {
      id: 'leaderboard_playful.v4',
      template: '🏆 {winner} edged {loser} this week. {N} vs {M}.',
    },
    {
      id: 'leaderboard_playful.v5',
      template: '🏆 The weekly verdict: {winner} {N}, {loser} {M}.',
    },
  ],

  leaderboardTied: [
    {
      id: 'leaderboard_tied.v1',
      template: 'You two split it down the middle. {N}–{N}. A true draw.',
    },
    {
      id: 'leaderboard_tied.v2',
      template: 'Perfectly tied at {N} each. Honestly impressive.',
    },
    {
      id: 'leaderboard_tied.v3',
      template: '{N} all. No winner, no loser — just two adults who got things done.',
    },
    {
      id: 'leaderboard_tied.v4',
      template: 'A dead heat: {N} apiece. The scoreboard shrugs.',
    },
    {
      id: 'leaderboard_tied.v5',
      template: 'Tied at {N}. The most boring outcome in the best possible way.',
    },
  ],

  streakStatus: [
    { id: 'streak_status.v1', template: '🔥 {displayName}: {currentStreak}-day streak.' },
    {
      id: 'streak_status.v2',
      template: '🔥 {displayName} is on a {currentStreak}-day run.',
    },
    {
      id: 'streak_status.v3',
      template: '🔥 {currentStreak} days straight for {displayName}.',
    },
    {
      id: 'streak_status.v4',
      template: '🔥 {displayName} kept it going — {currentStreak} days in a row.',
    },
    {
      id: 'streak_status.v5',
      template: '🔥 {displayName}\'s streak: {currentStreak}.',
    },
  ],

  closer: [
    {
      id: 'closer.v1',
      template: 'Next week\'s Wrapped drops Sunday at 9 PM. See you there.',
    },
    {
      id: 'closer.v2',
      template: 'That\'s a wrap. Next Sunday at 9 PM for the next one.',
    },
    {
      id: 'closer.v3',
      template: 'Done for the week. More Sunday night.',
    },
    {
      id: 'closer.v4',
      template: 'Week complete. Next Wrapped: Sunday 9 PM.',
    },
    {
      id: 'closer.v5',
      template: 'See you Sunday at 9 PM for next week\'s Wrapped.',
    },
  ],
};

// =============================================================================
// Push notification bodies (§7.1)
// =============================================================================

export const PUSH_BODIES: {
  tier0: string;
  tierNonZero: string;
} = {
  /** Used for tier-0 (0 tasks) — omit the count to avoid guilt-bait. */
  tier0: 'Your Wrapped is ready 🌙',
  /** Template: {N} = family task count; {H} = highlight count. */
  tierNonZero: 'You two closed {N} today. {H} highlight(s) inside.',
};

// =============================================================================
// pickVariant — rolling de-dup picker
// =============================================================================

/**
 * Pick a copy variant from `pool`, preferring variants not in `recentIds`.
 *
 * Algorithm:
 *   1. Filter pool to variants whose id is NOT in `recentIds`.
 *   2. If the filtered set is non-empty, pick uniformly at random using `rng`.
 *   3. If the filtered set is empty (exhaustion — every variant was recently used),
 *      fall back to the full pool and pick uniformly at random. This handles the
 *      "8 consecutive days in the same tier" edge case described in BRD §6.4.
 *
 * @param pool      The pool of candidates to pick from (must be non-empty).
 * @param recentIds IDs of variants used in the last 7 days for this household.
 * @param rng       A `() => number` in [0, 1) — pass Math.random in prod,
 *                  or a seeded PRNG in tests.
 */
export function pickVariant(
  pool: CopyVariant[],
  recentIds: Set<string>,
  rng: () => number
): CopyVariant {
  const fresh = pool.filter((v) => !recentIds.has(v.id));
  const candidates = fresh.length > 0 ? fresh : pool;
  const idx = Math.floor(rng() * candidates.length);
  return candidates[idx];
}
