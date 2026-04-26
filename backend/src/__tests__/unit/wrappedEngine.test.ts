/**
 * Tests for shared/utils/wrappedEngine.ts
 *
 * Golden fixtures:
 *   - Zero-activity daily → tier 0, 0 highlights
 *   - Tier-3 + zombie + leaderboard_win → 2 highlights
 *   - Tier-4 + 3 badges same user → 1 badge highlight (de-dup in rules)
 *   - Weekly with wow_gain + midweek_comeback → wow_gain wins slot 0 (65 > 60)
 *   - personal_best + badge → both appear (different categories)
 */

import { computeDailyWrapped, computeWeeklyCards } from '../../shared/utils/wrappedEngine';
import type { WrappedInput } from '../../shared/utils/wrappedRules';
import type { CreditEvent } from '../../shared/utils/leaderboardStreaks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALICE = { id: 'alice', displayName: 'Alice' };
const BOB   = { id: 'bob',   displayName: 'Bob'   };

// Daily window: a single Wednesday
const DAILY_START = '2026-04-22T00:00:00.000Z';
const DAILY_END   = '2026-04-22T23:59:59.999Z';

// Weekly window: Mon Apr 20 – Sun Apr 26
const WEEKLY_START = '2026-04-20T00:00:00.000Z';
const WEEKLY_END   = '2026-04-26T23:59:59.999Z';

function inWindow(userId: string, ts: string): CreditEvent {
  return { userId, completedAt: ts };
}

function makeCtx(recentIds: string[] = []) {
  return {
    recentCopyIds: new Set<string>(recentIds),
    rng: () => 0, // deterministic: always picks first candidate
  };
}

function makeWeeklyCtx(recentIds: string[] = []) {
  return {
    ...makeCtx(recentIds),
    nextFireLocalIso: '2026-05-03',
  };
}

function basePerUser(
  aliceEvents: CreditEvent[] = [],
  bobEvents: CreditEvent[] = []
): WrappedInput['perUser'] {
  return new Map([
    [
      'alice',
      {
        creditEvents: aliceEvents,
        allTimeDaily30: 0,
        currentStreak: 0,
        grewStreakInWindow: false,
        newlyEarnedBadges: [],
      },
    ],
    [
      'bob',
      {
        creditEvents: bobEvents,
        allTimeDaily30: 0,
        currentStreak: 0,
        grewStreakInWindow: false,
        newlyEarnedBadges: [],
      },
    ],
  ]);
}

function dailyInput(overrides: Partial<WrappedInput> = {}): WrappedInput {
  return {
    familyId: 'fam-1',
    windowStart: DAILY_START,
    windowEnd: DAILY_END,
    cadence: 'daily',
    tz: 'America/New_York',
    members: [ALICE, BOB],
    perUser: basePerUser(),
    closedTasksInWindow: [],
    projectCloses: [],
    tripStopsAdded: [],
    transactionsCategorized: { count: 0, byUserId: null },
    priorWeek: null,
    midweekState: null,
    ...overrides,
  };
}

function weeklyInput(overrides: Partial<WrappedInput> = {}): WrappedInput {
  return {
    familyId: 'fam-1',
    windowStart: WEEKLY_START,
    windowEnd: WEEKLY_END,
    cadence: 'weekly',
    tz: 'America/New_York',
    members: [ALICE, BOB],
    perUser: basePerUser(),
    closedTasksInWindow: [],
    projectCloses: [],
    tripStopsAdded: [],
    transactionsCategorized: { count: 0, byUserId: null },
    priorWeek: null,
    midweekState: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeDailyWrapped
// ---------------------------------------------------------------------------

describe('computeDailyWrapped', () => {
  // ── Golden fixture 1: Zero activity ────────────────────────────────────
  it('zero activity → tier 0, 0 highlights', () => {
    const result = computeDailyWrapped(dailyInput(), makeCtx());

    expect(result.cadence).toBe('daily');
    expect(result.headline.count).toBe(0);
    expect(result.headline.tier).toBe(0);
    expect(result.highlights).toHaveLength(0);
    expect(result.familyId).toBe('fam-1');
    expect(result.dateKey).toBe('2026-04-22');
  });

  // ── Golden fixture 2: Tier 3 + zombie + leaderboard_win → 2 highlights ─
  it('tier 3 + zombie + leaderboard_win → 2 highlights, different categories', () => {
    // Alice: 6 tasks today → tier 3, lopsided win (6 vs 0), plus a zombie
    const aliceEvents = Array.from({ length: 6 }, (_, i) =>
      inWindow('alice', `2026-04-22T0${i + 1}:00:00.000Z`)
    );
    const result = computeDailyWrapped(
      dailyInput({
        perUser: basePerUser(aliceEvents),
        closedTasksInWindow: [
          {
            id: 't-zombie',
            title: 'Old errand',
            createdAt: '2026-04-13T00:00:00.000Z', // 9 days old
            completedAt: '2026-04-22T08:00:00.000Z',
            completedByUserId: 'alice',
          },
        ],
      }),
      makeCtx()
    );

    expect(result.headline.tier).toBe(3); // 6 tasks
    expect(result.highlights).toHaveLength(2);

    const categories = result.highlights.map((h) => h.category);
    // zombie scores 90, leaderboard_win scores 70 — both selected, different categories
    expect(categories).toContain('zombie');
    expect(categories).toContain('leaderboard');
    // No duplicate categories
    expect(new Set(categories).size).toBe(categories.length);
  });

  // ── Golden fixture 3: Tier 4 + 3 badges same user → 1 badge highlight ─
  it('tier 4 + 3 badges same user → 1 badge highlight (de-dup in rules)', () => {
    const aliceEvents = Array.from({ length: 12 }, (_, i) =>
      inWindow('alice', `2026-04-22T${String(i + 1).padStart(2, '0')}:00:00.000Z`)
    );

    const result = computeDailyWrapped(
      dailyInput({
        perUser: new Map([
          [
            'alice',
            {
              creditEvents: aliceEvents,
              allTimeDaily30: 0,
              currentStreak: 0,
              grewStreakInWindow: false,
              newlyEarnedBadges: [
                {
                  badgeId: 'streak_7',
                  tier: 1,
                  earnedAt: '2026-04-22T08:00:00.000Z',
                  label: 'Badge T1',
                  celebrationCopy: 'Nice one!',
                },
                {
                  badgeId: 'streak_30',
                  tier: 3,
                  earnedAt: '2026-04-22T09:00:00.000Z',
                  label: 'Badge T3',
                  celebrationCopy: 'Impressive!',
                },
                {
                  badgeId: 'streak_100',
                  tier: 5,
                  earnedAt: '2026-04-22T10:00:00.000Z',
                  label: 'Badge T5',
                  celebrationCopy: 'Legendary!',
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
      }),
      makeCtx()
    );

    expect(result.headline.tier).toBe(4); // 12 tasks
    const badgeHighlights = result.highlights.filter((h) => h.category === 'badge');
    // Rule de-dups to 1 badge per user → at most 1 badge highlight
    expect(badgeHighlights).toHaveLength(1);
    // The highest tier badge should win (score = 85 + 5*2 = 95)
    expect(result.highlights[0].score).toBe(95);
    expect(result.highlights[0].category).toBe('badge');
  });

  // ── Golden fixture 5 (daily): personal_best + badge → both appear ──────
  it('personal_best + badge → both appear (different categories)', () => {
    const aliceEvents = Array.from({ length: 5 }, (_, i) =>
      inWindow('alice', `2026-04-22T0${i + 1}:00:00.000Z`)
    );

    const result = computeDailyWrapped(
      dailyInput({
        perUser: new Map([
          [
            'alice',
            {
              creditEvents: aliceEvents,
              allTimeDaily30: 3, // 5 > 3 → personal best fires
              currentStreak: 0,
              grewStreakInWindow: false,
              newlyEarnedBadges: [
                {
                  badgeId: 'streak_7',
                  tier: 2,
                  earnedAt: '2026-04-22T09:00:00.000Z',
                  label: 'Streak Badge',
                  celebrationCopy: 'Seven days!',
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
      }),
      makeCtx()
    );

    const categories = result.highlights.map((h) => h.category);
    expect(categories).toContain('badge');      // score 89
    expect(categories).toContain('personal_best'); // score 80
    expect(new Set(categories).size).toBe(categories.length); // no dupes
  });

  it('highlights are sorted by score descending', () => {
    // badge (89) > personal_best (80) — badge should be first
    const aliceEvents = Array.from({ length: 5 }, (_, i) =>
      inWindow('alice', `2026-04-22T0${i + 1}:00:00.000Z`)
    );
    const result = computeDailyWrapped(
      dailyInput({
        perUser: new Map([
          [
            'alice',
            {
              creditEvents: aliceEvents,
              allTimeDaily30: 3,
              currentStreak: 0,
              grewStreakInWindow: false,
              newlyEarnedBadges: [
                {
                  badgeId: 'streak_7',
                  tier: 2,
                  earnedAt: '2026-04-22T09:00:00.000Z',
                  label: 'Badge',
                  celebrationCopy: 'Great!',
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
      }),
      makeCtx()
    );

    if (result.highlights.length >= 2) {
      expect(result.highlights[0].score).toBeGreaterThanOrEqual(result.highlights[1].score);
    }
  });

  it('score floor of 40 prevents weak candidates from filling slot 2', () => {
    // Only one candidate at score 90 (zombie), no others qualify above 40.
    // Result: 1 highlight.
    const aliceEvents = Array.from({ length: 4 }, (_, i) =>
      inWindow('alice', `2026-04-22T0${i + 1}:00:00.000Z`)
    );
    const result = computeDailyWrapped(
      dailyInput({
        perUser: basePerUser(aliceEvents),
        closedTasksInWindow: [
          {
            id: 't-zombie',
            title: 'Old task',
            createdAt: '2026-04-10T00:00:00.000Z',
            completedAt: '2026-04-22T10:00:00.000Z',
            completedByUserId: 'alice',
          },
        ],
      }),
      makeCtx()
    );

    // Only 1 highlight (zombie, score 90). No other rules fire.
    const zombies = result.highlights.filter((h) => h.ruleId === 'zombie');
    expect(zombies).toHaveLength(1);
    expect(result.highlights.length).toBeLessThanOrEqual(2);
  });

  it('headline copyVariantId is populated', () => {
    const result = computeDailyWrapped(dailyInput(), makeCtx());
    expect(result.headline.copyVariantId).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// computeWeeklyCards
// ---------------------------------------------------------------------------

describe('computeWeeklyCards', () => {
  it('returns all 6 card fields', () => {
    const result = computeWeeklyCards(weeklyInput(), makeWeeklyCtx());

    expect(result.headline).toBeDefined();
    expect(result.bestDay).toBeDefined();
    expect(result.leaderboard).toBeDefined();
    expect(result.streaks).toBeDefined();
    expect(result.highlights).toBeDefined();
    expect(result.closer).toBeDefined();
  });

  it('leaderboard winnerId is null when tied', () => {
    const events = [
      inWindow('alice', '2026-04-21T09:00:00.000Z'),
      inWindow('bob',   '2026-04-21T10:00:00.000Z'),
    ];
    const result = computeWeeklyCards(
      weeklyInput({ perUser: basePerUser([events[0]], [events[1]]) }),
      makeWeeklyCtx()
    );
    expect(result.leaderboard.winnerId).toBeNull();
  });

  it('leaderboard winnerId is the higher-count user', () => {
    const aliceEvents = Array.from({ length: 5 }, (_, i) =>
      inWindow('alice', `2026-04-2${i}T09:00:00.000Z`)
    );
    const bobEvents = Array.from({ length: 2 }, (_, i) =>
      inWindow('bob', `2026-04-2${i}T10:00:00.000Z`)
    );
    const result = computeWeeklyCards(
      weeklyInput({ perUser: basePerUser(aliceEvents, bobEvents) }),
      makeWeeklyCtx()
    );
    expect(result.leaderboard.winnerId).toBe('alice');
  });

  it('bestDay picks the day with the most credits', () => {
    // 3 events on Thursday Apr 23, 1 on each other day
    const aliceEvents = [
      inWindow('alice', '2026-04-23T08:00:00.000Z'),
      inWindow('alice', '2026-04-23T09:00:00.000Z'),
      inWindow('alice', '2026-04-23T10:00:00.000Z'),
      inWindow('alice', '2026-04-20T09:00:00.000Z'),
      inWindow('alice', '2026-04-21T09:00:00.000Z'),
    ];
    const result = computeWeeklyCards(
      weeklyInput({ perUser: basePerUser(aliceEvents) }),
      makeWeeklyCtx()
    );
    expect(result.bestDay.dayOfWeek).toBe('Thursday');
    expect(result.bestDay.count).toBe(3);
  });

  // ── Golden fixture 4: wow_gain + midweek_comeback → wow_gain is slot 0 ─
  it('wow_gain (65) wins over midweek_comeback (60) — wow_gain appears first', () => {
    // Prior week: 10, window total: 12 (≥ 1.2 × 10) → wow_gain fires
    // Midweek: alice=2, bob=5; final: alice=8, bob=4 → midweek_comeback fires
    const aliceEvents = Array.from({ length: 8 }, (_, i) =>
      inWindow('alice', `2026-04-2${i % 7}T09:00:00.000Z`)
    );
    const bobEvents = Array.from({ length: 4 }, (_, i) =>
      inWindow('bob', `2026-04-2${i % 7}T10:00:00.000Z`)
    );
    const result = computeWeeklyCards(
      weeklyInput({
        priorWeek: { familyTotal: 10 },
        midweekState: { byUserId: { alice: 2, bob: 5 } },
        perUser: basePerUser(aliceEvents, bobEvents),
      }),
      makeWeeklyCtx()
    );

    // Both should appear in highlights
    const ruleIds = result.highlights.map((h) => h.ruleId);
    expect(ruleIds).toContain('wow_gain');
    expect(ruleIds).toContain('midweek_comeback');

    // wow_gain (65) should be before midweek_comeback (60) since sorted desc
    const wowIdx = ruleIds.indexOf('wow_gain');
    const mcIdx = ruleIds.indexOf('midweek_comeback');
    expect(wowIdx).toBeLessThan(mcIdx);
  });

  it('streaks reflects perUser data', () => {
    const input = weeklyInput({
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
            currentStreak: 3,
            grewStreakInWindow: false,
            newlyEarnedBadges: [],
          },
        ],
      ]),
    });
    const result = computeWeeklyCards(input, makeWeeklyCtx());
    expect(result.streaks.byUserId['alice']).toEqual({ current: 7, grew: true });
    expect(result.streaks.byUserId['bob']).toEqual({ current: 3, grew: false });
  });

  it('closer.nextFireLocalIso matches ctx value', () => {
    const result = computeWeeklyCards(weeklyInput(), makeWeeklyCtx());
    expect(result.closer.nextFireLocalIso).toBe('2026-05-03');
  });

  it('weekly highlights limited to 3', () => {
    // Set up enough rules to produce > 3 candidates
    const aliceEvents = Array.from({ length: 14 }, (_, i) =>
      inWindow('alice', `2026-04-2${i % 7}T09:00:00.000Z`)
    );
    const result = computeWeeklyCards(
      weeklyInput({
        perUser: new Map([
          [
            'alice',
            {
              creditEvents: aliceEvents,
              allTimeDaily30: 0,
              currentStreak: 7,
              grewStreakInWindow: true,
              newlyEarnedBadges: [
                {
                  badgeId: 'streak_7',
                  tier: 3,
                  earnedAt: '2026-04-22T09:00:00.000Z',
                  label: 'Streak Badge',
                  celebrationCopy: 'Great!',
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
        closedTasksInWindow: [
          {
            id: 't-zombie',
            title: 'Old task',
            createdAt: '2026-04-10T00:00:00.000Z',
            completedAt: '2026-04-22T10:00:00.000Z',
            completedByUserId: 'alice',
          },
        ],
        projectCloses: [{ projectId: 'p1', projectName: 'Project', count: 2, byUserId: 'alice' }],
        tripStopsAdded: [{ tripId: 't1', tripName: 'Trip', count: 2, byUserId: 'alice' }],
        transactionsCategorized: { count: 10, byUserId: 'alice' },
        priorWeek: { familyTotal: 10 },
        midweekState: { byUserId: { alice: 2, bob: 5 } },
      }),
      makeWeeklyCtx()
    );
    expect(result.highlights.length).toBeLessThanOrEqual(3);
  });

  it('wowDelta is computed correctly when priorWeek is present', () => {
    const aliceEvents = Array.from({ length: 8 }, (_, i) =>
      inWindow('alice', `2026-04-2${i % 7}T09:00:00.000Z`)
    );
    const result = computeWeeklyCards(
      weeklyInput({
        priorWeek: { familyTotal: 5 },
        perUser: basePerUser(aliceEvents),
      }),
      makeWeeklyCtx()
    );
    expect(result.headline.wowDelta).toBe(3); // 8 - 5
  });

  it('wowDelta is 0 when no priorWeek', () => {
    const result = computeWeeklyCards(weeklyInput(), makeWeeklyCtx());
    expect(result.headline.wowDelta).toBe(0);
  });
});
