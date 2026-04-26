/**
 * Tests for shared/utils/wrappedRules.ts
 *
 * Covers: trigger + no-trigger for every rule; edge cases for zombie (6d vs 7d),
 * leaderboard_win (gap=3 but min > max/2 → no trigger), personal_best (daily-only),
 * wow_gain/midweek_comeback (weekly-only), category_sweep (7-day presence).
 */

import { evaluateRules, type WrappedInput, type WrappedCandidate } from '../../shared/utils/wrappedRules';
import type { CreditEvent } from '../../shared/utils/leaderboardStreaks';

// ---------------------------------------------------------------------------
// Test fixtures / helpers
// ---------------------------------------------------------------------------

const ALICE = { id: 'alice', displayName: 'Alice' };
const BOB   = { id: 'bob',   displayName: 'Bob'   };

const WINDOW_START = '2026-04-20T00:00:00.000Z'; // Monday
const WINDOW_END   = '2026-04-26T23:59:59.999Z'; // Sunday

/** Build a minimal WrappedInput with sensible defaults. Override specific fields in each test. */
function baseInput(overrides: Partial<WrappedInput> = {}): WrappedInput {
  return {
    familyId: 'fam-1',
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    cadence: 'daily',
    tz: 'America/New_York',
    members: [ALICE, BOB],
    perUser: new Map([
      [
        'alice',
        {
          creditEvents: [],
          allTimeDaily30: 0,
          currentStreak: 0,
          grewStreakInWindow: false,
          newlyEarnedBadges: [],
        },
      ],
      [
        'bob',
        {
          creditEvents: [],
          allTimeDaily30: 0,
          currentStreak: 0,
          grewStreakInWindow: false,
          newlyEarnedBadges: [],
        },
      ],
    ]),
    closedTasksInWindow: [],
    projectCloses: [],
    tripStopsAdded: [],
    transactionsCategorized: { count: 0, byUserId: null },
    priorWeek: null,
    midweekState: null,
    ...overrides,
  };
}

/** Returns an event in the middle of the window. */
function inWindowEvent(userId: string, day = '2026-04-22T10:00:00.000Z'): CreditEvent {
  return { userId, completedAt: day };
}

function findRule(candidates: WrappedCandidate[], ruleId: string): WrappedCandidate | undefined {
  return candidates.find((c) => c.ruleId === ruleId);
}

// ---------------------------------------------------------------------------
// Rule 1 — Zombie slain
// ---------------------------------------------------------------------------

describe('zombie rule', () => {
  it('triggers when a task is ≥7 days old at completion', () => {
    const input = baseInput({
      closedTasksInWindow: [
        {
          id: 'task-1',
          title: 'Fix the dryer',
          createdAt: '2026-04-13T00:00:00.000Z',  // 7 days before Apr 20
          completedAt: '2026-04-20T10:00:00.000Z',
          completedByUserId: 'alice',
        },
      ],
    });
    const candidates = evaluateRules(input);
    const z = findRule(candidates, 'zombie');
    expect(z).toBeDefined();
    expect(z!.score).toBe(90);
    expect(z!.fills.displayName).toBe('Alice');
    expect(z!.fills.ageInDays).toBe(7);
  });

  it('does NOT trigger when task is 6 days old (edge: strictly < 7)', () => {
    const input = baseInput({
      closedTasksInWindow: [
        {
          id: 'task-2',
          title: 'Vacuum',
          createdAt: '2026-04-14T00:00:00.000Z',  // 6 days before Apr 20
          completedAt: '2026-04-20T10:00:00.000Z',
          completedByUserId: 'alice',
        },
      ],
    });
    const candidates = evaluateRules(input);
    expect(findRule(candidates, 'zombie')).toBeUndefined();
  });

  it('keeps only the oldest zombie per user when multiple tasks qualify', () => {
    const input = baseInput({
      closedTasksInWindow: [
        {
          id: 't1',
          title: 'Old task',
          createdAt: '2026-04-01T00:00:00.000Z', // 21 days old
          completedAt: '2026-04-22T10:00:00.000Z',
          completedByUserId: 'alice',
        },
        {
          id: 't2',
          title: 'Newer zombie',
          createdAt: '2026-04-12T00:00:00.000Z', // 10 days old
          completedAt: '2026-04-22T12:00:00.000Z',
          completedByUserId: 'alice',
        },
      ],
    });
    const candidates = evaluateRules(input);
    const zombies = candidates.filter((c) => c.ruleId === 'zombie');
    expect(zombies).toHaveLength(1);
    expect(zombies[0].fills.ageInDays).toBe(21);
  });

  it('can produce one zombie candidate per user', () => {
    const input = baseInput({
      closedTasksInWindow: [
        {
          id: 't-alice',
          title: 'Alice zombie',
          createdAt: '2026-04-10T00:00:00.000Z',
          completedAt: '2026-04-20T10:00:00.000Z',
          completedByUserId: 'alice',
        },
        {
          id: 't-bob',
          title: 'Bob zombie',
          createdAt: '2026-04-11T00:00:00.000Z',
          completedAt: '2026-04-21T10:00:00.000Z',
          completedByUserId: 'bob',
        },
      ],
    });
    const candidates = evaluateRules(input);
    const zombies = candidates.filter((c) => c.ruleId === 'zombie');
    expect(zombies).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — Badge earned
// ---------------------------------------------------------------------------

describe('badge rule', () => {
  it('triggers when a user earns a badge within the window', () => {
    const input = baseInput({
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [
              {
                badgeId: 'streak_7',
                tier: 2,
                earnedAt: '2026-04-21T10:00:00.000Z',
                label: '7-Day Streak',
                celebrationCopy: 'Seven days straight!',
              },
            ],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    const candidates = evaluateRules(input);
    const badge = findRule(candidates, 'badge');
    expect(badge).toBeDefined();
    expect(badge!.score).toBe(85 + 2 * 2); // 89
    expect(badge!.fills.badgeLabel).toBe('7-Day Streak');
  });

  it('de-duplicates to highest-scoring badge per user', () => {
    const input = baseInput({
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [
              {
                badgeId: 'streak_7',
                tier: 1,
                earnedAt: '2026-04-21T10:00:00.000Z',
                label: 'Tier 1 Badge',
                celebrationCopy: 'Nice!',
              },
              {
                badgeId: 'streak_30',
                tier: 5,
                earnedAt: '2026-04-22T10:00:00.000Z',
                label: 'Tier 5 Badge',
                celebrationCopy: 'Amazing!',
              },
            ],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    const candidates = evaluateRules(input);
    const badges = candidates.filter((c) => c.ruleId === 'badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].fills.badgeLabel).toBe('Tier 5 Badge');
    expect(badges[0].score).toBe(85 + 5 * 2); // 95
  });

  it('does NOT trigger when badge earned outside window', () => {
    const input = baseInput({
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [
              {
                badgeId: 'streak_7',
                tier: 2,
                earnedAt: '2026-04-19T10:00:00.000Z', // before WINDOW_START
                label: 'Old badge',
                celebrationCopy: 'Yay!',
              },
            ],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    const candidates = evaluateRules(input);
    expect(findRule(candidates, 'badge')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — Streak milestone
// ---------------------------------------------------------------------------

describe('streak_milestone rule', () => {
  it('triggers when streak grew and is ≥3', () => {
    const input = baseInput({
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 7,
            grewStreakInWindow: true,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    const candidates = evaluateRules(input);
    const sm = findRule(candidates, 'streak_milestone');
    expect(sm).toBeDefined();
    expect(sm!.score).toBe(75);
    expect(sm!.fills.currentStreak).toBe(7);
  });

  it('does NOT trigger when streak did not grow', () => {
    const input = baseInput({
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 10,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    expect(findRule(evaluateRules(input), 'streak_milestone')).toBeUndefined();
  });

  it('does NOT trigger when streak grew but is < 3', () => {
    const input = baseInput({
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 2,
            grewStreakInWindow: true,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    expect(findRule(evaluateRules(input), 'streak_milestone')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — Personal best (daily-only)
// ---------------------------------------------------------------------------

describe('personal_best rule', () => {
  it('triggers on daily when count > allTimeDaily30 AND allTimeDaily30 ≥ 3', () => {
    const input = baseInput({
      cadence: 'daily',
      windowStart: '2026-04-22T00:00:00.000Z',
      windowEnd: '2026-04-22T23:59:59.999Z',
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: [
              inWindowEvent('alice', '2026-04-22T09:00:00.000Z'),
              inWindowEvent('alice', '2026-04-22T10:00:00.000Z'),
              inWindowEvent('alice', '2026-04-22T11:00:00.000Z'),
              inWindowEvent('alice', '2026-04-22T12:00:00.000Z'),
            ],
            allTimeDaily30: 3,  // 4 > 3 ✓
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    const pb = findRule(evaluateRules(input), 'personal_best');
    expect(pb).toBeDefined();
    expect(pb!.fills.N).toBe(4);
  });

  it('does NOT trigger when count equals (not exceeds) allTimeDaily30', () => {
    const input = baseInput({
      cadence: 'daily',
      windowStart: '2026-04-22T00:00:00.000Z',
      windowEnd: '2026-04-22T23:59:59.999Z',
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: [
              inWindowEvent('alice', '2026-04-22T09:00:00.000Z'),
              inWindowEvent('alice', '2026-04-22T10:00:00.000Z'),
              inWindowEvent('alice', '2026-04-22T11:00:00.000Z'),
            ],
            allTimeDaily30: 3,  // 3 == 3, NOT >
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    expect(findRule(evaluateRules(input), 'personal_best')).toBeUndefined();
  });

  it('does NOT trigger when allTimeDaily30 < 3 (noise guard)', () => {
    const input = baseInput({
      cadence: 'daily',
      windowStart: '2026-04-22T00:00:00.000Z',
      windowEnd: '2026-04-22T23:59:59.999Z',
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: [
              inWindowEvent('alice', '2026-04-22T09:00:00.000Z'),
              inWindowEvent('alice', '2026-04-22T10:00:00.000Z'),
              inWindowEvent('alice', '2026-04-22T11:00:00.000Z'),
            ],
            allTimeDaily30: 2,  // < 3
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    expect(findRule(evaluateRules(input), 'personal_best')).toBeUndefined();
  });

  it('does NOT appear when cadence is weekly (daily-only rule)', () => {
    const input = baseInput({
      cadence: 'weekly',
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: Array.from({ length: 5 }, (_, i) =>
              inWindowEvent('alice', `2026-04-2${i + 0}T09:00:00.000Z`)
            ),
            allTimeDaily30: 3,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    expect(findRule(evaluateRules(input), 'personal_best')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 5 — Leaderboard win
// ---------------------------------------------------------------------------

describe('leaderboard_win rule', () => {
  it('triggers when |N-M| ≥ 3 AND min ≤ max/2', () => {
    // Alice: 6, Bob: 0. Diff=6 ≥ 3. min(0) ≤ max(6)/2 = 3 ✓
    const input = baseInput({
      cadence: 'daily',
      windowStart: '2026-04-22T00:00:00.000Z',
      windowEnd: '2026-04-22T23:59:59.999Z',
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: Array.from({ length: 6 }, (_, i) =>
              inWindowEvent('alice', `2026-04-22T0${i + 1}:00:00.000Z`)
            ),
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    const lb = findRule(evaluateRules(input), 'leaderboard_win');
    expect(lb).toBeDefined();
    expect(lb!.fills.winner).toBe('Alice');
    expect(lb!.fills.loser).toBe('Bob');
    expect(lb!.fills.N).toBe(6);
    expect(lb!.fills.M).toBe(0);
  });

  it('does NOT trigger when gap=3 but min > max/2 (close enough to not warrant noise)', () => {
    // Alice: 5, Bob: 2. Diff=3 ≥ 3 ✓. But min(2) > max(5)/2=2.5? No: 2 ≤ 2.5 ✓
    // Let's find a case where min > max/2: Alice: 4, Bob: 3. Diff=1 < 3. No trigger trivially.
    // Alice: 6, Bob: 4. Diff=2 < 3 → no trigger.
    // Alice: 9, Bob: 6. Diff=3 ≥ 3. min=6 vs max/2=4.5 → 6 > 4.5 → NO trigger.
    const input = baseInput({
      cadence: 'daily',
      windowStart: '2026-04-22T00:00:00.000Z',
      windowEnd: '2026-04-22T23:59:59.999Z',
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: Array.from({ length: 9 }, (_, i) =>
              inWindowEvent('alice', `2026-04-22T0${i + 1}:00:00.000Z`)
            ),
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: Array.from({ length: 6 }, (_, i) =>
              inWindowEvent('bob', `2026-04-22T${String(i + 10).padStart(2, '0')}:00:00.000Z`)
            ),
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    expect(findRule(evaluateRules(input), 'leaderboard_win')).toBeUndefined();
  });

  it('does NOT trigger when gap < 3', () => {
    // Alice: 5, Bob: 3. Diff=2 < 3 → no trigger.
    const input = baseInput({
      cadence: 'daily',
      windowStart: '2026-04-22T00:00:00.000Z',
      windowEnd: '2026-04-22T23:59:59.999Z',
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: Array.from({ length: 5 }, (_, i) =>
              inWindowEvent('alice', `2026-04-22T0${i + 1}:00:00.000Z`)
            ),
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: Array.from({ length: 3 }, (_, i) =>
              inWindowEvent('bob', `2026-04-22T${String(i + 10).padStart(2, '0')}:00:00.000Z`)
            ),
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    expect(findRule(evaluateRules(input), 'leaderboard_win')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 6 — Wow gain (weekly-only)
// ---------------------------------------------------------------------------

describe('wow_gain rule', () => {
  it('triggers on weekly when familyTotal ≥ 1.2 × prior AND prior ≥ 5', () => {
    // Prior = 10, window total = 12 (≥ 1.2 × 10 = 12 ✓)
    const input = baseInput({
      cadence: 'weekly',
      priorWeek: { familyTotal: 10 },
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: Array.from({ length: 7 }, (_, i) =>
              inWindowEvent('alice', `2026-04-2${i}T09:00:00.000Z`)
            ),
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: Array.from({ length: 5 }, (_, i) =>
              inWindowEvent('bob', `2026-04-2${i}T10:00:00.000Z`)
            ),
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    const wow = findRule(evaluateRules(input), 'wow_gain');
    expect(wow).toBeDefined();
    expect(wow!.fills.N).toBe(12);
  });

  it('does NOT trigger when prior < 5 (noise guard)', () => {
    const input = baseInput({
      cadence: 'weekly',
      priorWeek: { familyTotal: 4 },
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: Array.from({ length: 10 }, (_, i) =>
              inWindowEvent('alice', `2026-04-2${i % 7}T09:00:00.000Z`)
            ),
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    expect(findRule(evaluateRules(input), 'wow_gain')).toBeUndefined();
  });

  it('does NOT appear when cadence is daily', () => {
    const input = baseInput({
      cadence: 'daily',
      priorWeek: { familyTotal: 10 },
    });
    expect(findRule(evaluateRules(input), 'wow_gain')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 7 — Midweek comeback (weekly-only)
// ---------------------------------------------------------------------------

describe('midweek_comeback rule', () => {
  it('triggers when midweek leader ≠ final leader and final gap ≥ 1', () => {
    // Midweek: Bob ahead. Final: Alice ahead.
    const input = baseInput({
      cadence: 'weekly',
      midweekState: { byUserId: { alice: 2, bob: 5 } },
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: Array.from({ length: 8 }, (_, i) =>
              inWindowEvent('alice', `2026-04-2${i % 7}T09:00:00.000Z`)
            ),
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: Array.from({ length: 6 }, (_, i) =>
              inWindowEvent('bob', `2026-04-2${i % 7}T10:00:00.000Z`)
            ),
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    const mc = findRule(evaluateRules(input), 'midweek_comeback');
    expect(mc).toBeDefined();
    expect(mc!.fills.winner).toBe('Alice');
  });

  it('does NOT trigger when same leader at midweek and end', () => {
    const input = baseInput({
      cadence: 'weekly',
      midweekState: { byUserId: { alice: 5, bob: 2 } },
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: Array.from({ length: 8 }, (_, i) =>
              inWindowEvent('alice', `2026-04-2${i % 7}T09:00:00.000Z`)
            ),
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: Array.from({ length: 6 }, (_, i) =>
              inWindowEvent('bob', `2026-04-2${i % 7}T10:00:00.000Z`)
            ),
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    expect(findRule(evaluateRules(input), 'midweek_comeback')).toBeUndefined();
  });

  it('does NOT appear when cadence is daily', () => {
    const input = baseInput({
      cadence: 'daily',
      midweekState: { byUserId: { alice: 1, bob: 5 } },
    });
    expect(findRule(evaluateRules(input), 'midweek_comeback')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 8 — Category sweep (weekly-only)
// ---------------------------------------------------------------------------

describe('category_sweep rule', () => {
  it('triggers when credits appear on all 7 days of the week', () => {
    // Mon–Sun in the window: Apr 20–26
    const events = ['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23',
                    '2026-04-24', '2026-04-25', '2026-04-26'].map((d) =>
      inWindowEvent('alice', `${d}T09:00:00.000Z`)
    );
    const input = baseInput({
      cadence: 'weekly',
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: events,
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    expect(findRule(evaluateRules(input), 'category_sweep')).toBeDefined();
  });

  it('does NOT trigger when one day is missing', () => {
    // Only 6 days (missing Sunday Apr 26)
    const events = ['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23',
                    '2026-04-24', '2026-04-25'].map((d) =>
      inWindowEvent('alice', `${d}T09:00:00.000Z`)
    );
    const input = baseInput({
      cadence: 'weekly',
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: events,
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    expect(findRule(evaluateRules(input), 'category_sweep')).toBeUndefined();
  });

  it('does NOT appear when cadence is daily', () => {
    const events = ['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23',
                    '2026-04-24', '2026-04-25', '2026-04-26'].map((d) =>
      inWindowEvent('alice', `${d}T09:00:00.000Z`)
    );
    const input = baseInput({
      cadence: 'daily',
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: events,
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    expect(findRule(evaluateRules(input), 'category_sweep')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 9 — Project progress
// ---------------------------------------------------------------------------

describe('project_progress rule', () => {
  it('triggers when projectCloses has entries', () => {
    const input = baseInput({
      projectCloses: [
        { projectId: 'p1', projectName: 'Basement reno', count: 4, byUserId: 'alice' },
      ],
    });
    const pp = findRule(evaluateRules(input), 'project_progress');
    expect(pp).toBeDefined();
    expect(pp!.fills.projectName).toBe('Basement reno');
  });

  it('does NOT trigger when projectCloses is empty', () => {
    expect(findRule(evaluateRules(baseInput()), 'project_progress')).toBeUndefined();
  });

  it('picks the project with the most closes', () => {
    const input = baseInput({
      projectCloses: [
        { projectId: 'p1', projectName: 'Small project', count: 2, byUserId: 'alice' },
        { projectId: 'p2', projectName: 'Big project', count: 5, byUserId: 'bob' },
      ],
    });
    const pp = findRule(evaluateRules(input), 'project_progress');
    expect(pp!.fills.projectName).toBe('Big project');
  });
});

// ---------------------------------------------------------------------------
// Rule 10 — Trip momentum
// ---------------------------------------------------------------------------

describe('trip_momentum rule', () => {
  it('triggers when tripStopsAdded has entries', () => {
    const input = baseInput({
      tripStopsAdded: [
        { tripId: 't1', tripName: 'Italy 2026', count: 3, byUserId: 'alice' },
      ],
    });
    const tm = findRule(evaluateRules(input), 'trip_momentum');
    expect(tm).toBeDefined();
    expect(tm!.fills.tripName).toBe('Italy 2026');
  });

  it('does NOT trigger when tripStopsAdded is empty', () => {
    expect(findRule(evaluateRules(baseInput()), 'trip_momentum')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 11 — Receipt sweep
// ---------------------------------------------------------------------------

describe('receipt_sweep rule', () => {
  it('triggers when count ≥ 5', () => {
    const input = baseInput({
      transactionsCategorized: { count: 5, byUserId: 'alice' },
    });
    const rs = findRule(evaluateRules(input), 'receipt_sweep');
    expect(rs).toBeDefined();
    expect(rs!.fills.count).toBe(5);
  });

  it('does NOT trigger when count < 5', () => {
    const input = baseInput({
      transactionsCategorized: { count: 4, byUserId: null },
    });
    expect(findRule(evaluateRules(input), 'receipt_sweep')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// cadence filtering
// ---------------------------------------------------------------------------

describe('cadence filtering', () => {
  it('daily cadence excludes weekly-only rules', () => {
    const input = baseInput({
      cadence: 'daily',
      priorWeek: { familyTotal: 10 },
      midweekState: { byUserId: { alice: 1, bob: 5 } },
    });
    const candidates = evaluateRules(input);
    expect(candidates.filter((c) => c.cadenceTag === 'weekly')).toHaveLength(0);
  });

  it('weekly cadence excludes daily-only rules', () => {
    const input = baseInput({
      cadence: 'weekly',
      perUser: new Map([
        [
          'alice',
          {
            creditEvents: Array.from({ length: 5 }, (_, i) =>
              inWindowEvent('alice', `2026-04-2${i}T09:00:00.000Z`)
            ),
            allTimeDaily30: 3,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
        [
          'bob',
          {
            creditEvents: [],
            allTimeDaily30: 0,
            currentStreak: 0,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    const candidates = evaluateRules(input);
    expect(candidates.filter((c) => c.cadenceTag === 'daily')).toHaveLength(0);
  });
});
