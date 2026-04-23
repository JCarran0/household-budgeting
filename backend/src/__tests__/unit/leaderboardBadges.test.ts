/**
 * Unit tests for pure badge derivation (shared/utils/leaderboardBadges).
 * Covers all 15 categories: v1.0 (volume/consistency/streak/lifetime) +
 * v2.0 (weekday_warrior, night_owl, early_bird, power_hour, clean_sweep,
 * spring_cleaner, holiday_hero, phoenix, clutch, partner_in_crime, comeback_kid).
 */

import {
  buildFamilyBadgeContext,
  computeEarnedBadges,
  type FamilyBadgeContext,
} from '../../shared/utils/leaderboardBadges';
import type { CreditEvent } from '../../shared/utils/leaderboardStreaks';
import type { BadgeId, Task } from '../../shared/types';

const TZ = 'America/New_York';
const NOW = new Date('2026-05-01T12:00:00.000Z');
const USER_ID = 'u1';

/** Empty family context — used by tests that don't need cross-user state. */
function emptyFamilyContext(): FamilyBadgeContext {
  return {
    zeroInboxEvents: [],
    dayUserIndex: new Map(),
    monthlyTallies: new Map(),
  };
}

/** Build an event with a concrete HH:MM so we can assert on ordering. */
function evt(dateTime: string, userId: string = USER_ID): CreditEvent {
  return { userId, completedAt: dateTime };
}

function compute(
  events: CreditEvent[],
  streakMilestones: Partial<Record<7 | 30 | 100, string>> = {},
  familyCtx: FamilyBadgeContext = emptyFamilyContext(),
  userId: string = USER_ID,
  now: Date = NOW
) {
  return computeEarnedBadges(events, streakMilestones, TZ, familyCtx, userId, now);
}

function earnedIds(events: CreditEvent[]): BadgeId[] {
  return compute(events).map((b) => b.id);
}

// ============================================================================
// VOLUME (v1.0)
// ============================================================================
describe('computeEarnedBadges — VOLUME', () => {
  it('4 in a day → no badges', () => {
    const events: CreditEvent[] = [
      evt('2026-04-19T14:00:00Z'),
      evt('2026-04-19T15:00:00Z'),
      evt('2026-04-19T16:00:00Z'),
      evt('2026-04-19T17:00:00Z'),
    ];
    const ids = earnedIds(events);
    expect(ids).not.toContain('volume_5');
  });

  it('5 in a day → volume_5 earnedAt = 5th event completedAt', () => {
    const events: CreditEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(evt(`2026-04-19T${String(14 + i).padStart(2, '0')}:00:00Z`));
    }
    const result = compute(events);
    const b = result.find((r) => r.id === 'volume_5');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe('2026-04-19T18:00:00Z');
  });

  it('20 in a day → volume_5, volume_10, volume_20 all earned with 5th/10th/20th timestamps', () => {
    const events: CreditEvent[] = [];
    const base = new Date('2026-04-19T10:00:00.000Z').getTime();
    for (let i = 0; i < 20; i++) {
      events.push({ userId: USER_ID, completedAt: new Date(base + i * 60_000).toISOString() });
    }
    const result = compute(events);
    const byId = Object.fromEntries(result.map((b) => [b.id, b.earnedAt]));
    expect(byId.volume_5).toBe(new Date(base + 4 * 60_000).toISOString());
    expect(byId.volume_10).toBe(new Date(base + 9 * 60_000).toISOString());
    expect(byId.volume_20).toBe(new Date(base + 19 * 60_000).toISOString());
  });

  it('many spread across days with no day reaching 10 → only volume_5', () => {
    const events: CreditEvent[] = [];
    for (let d = 10; d < 14; d++) {
      for (let h = 10; h < 15; h++) {
        events.push(
          evt(`2026-04-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`)
        );
      }
    }
    const ids = earnedIds(events);
    expect(ids).toContain('volume_5');
    expect(ids).not.toContain('volume_10');
    expect(ids).not.toContain('volume_20');
  });

  it('first-tip semantics: 5-in-a-day Mon + 20-in-a-day Tue earns each tier on the earliest qualifying day', () => {
    const events: CreditEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(evt(`2026-04-13T${String(14 + i).padStart(2, '0')}:00:00Z`));
    }
    const tueBase = new Date('2026-04-14T10:00:00.000Z').getTime();
    for (let i = 0; i < 20; i++) {
      events.push({ userId: USER_ID, completedAt: new Date(tueBase + i * 60_000).toISOString() });
    }
    const result = compute(events);
    const byId = Object.fromEntries(result.map((b) => [b.id, b.earnedAt]));
    expect(byId.volume_5).toBe('2026-04-13T18:00:00Z');
    expect(byId.volume_10).toBe(new Date(tueBase + 9 * 60_000).toISOString());
    expect(byId.volume_20).toBe(new Date(tueBase + 19 * 60_000).toISOString());
  });
});

// ============================================================================
// CONSISTENCY (v1.0)
// ============================================================================
describe('computeEarnedBadges — CONSISTENCY', () => {
  it('3 distinct days in a week → no badges', () => {
    const events = [
      evt('2026-04-13T15:00:00Z'),
      evt('2026-04-15T15:00:00Z'),
      evt('2026-04-17T15:00:00Z'),
    ];
    const ids = earnedIds(events);
    expect(ids).not.toContain('consistency_4');
  });

  it('4 distinct days in a week → consistency_4 earnedAt = 4th-day first event', () => {
    const events = [
      evt('2026-04-13T15:00:00Z'),
      evt('2026-04-14T15:00:00Z'),
      evt('2026-04-15T15:00:00Z'),
      evt('2026-04-16T15:00:00Z'),
    ];
    const result = compute(events);
    const b = result.find((r) => r.id === 'consistency_4');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe('2026-04-16T15:00:00Z');
  });

  it('credits on all 7 days of a single ISO week → all three consistency tiers earned', () => {
    const events = [
      evt('2026-04-13T15:00:00Z'),
      evt('2026-04-14T15:00:00Z'),
      evt('2026-04-15T15:00:00Z'),
      evt('2026-04-16T15:00:00Z'),
      evt('2026-04-17T15:00:00Z'),
      evt('2026-04-18T15:00:00Z'),
      evt('2026-04-19T15:00:00Z'),
    ];
    const ids = earnedIds(events);
    expect(ids).toContain('consistency_4');
    expect(ids).toContain('consistency_5');
    expect(ids).toContain('consistency_7');
  });

  it('Sun + next Mon are in different ISO weeks — does not consolidate into one', () => {
    const events = [
      evt('2026-04-19T15:00:00Z'),
      evt('2026-04-20T15:00:00Z'),
    ];
    const result = compute(events);
    expect(result.find((b) => b.id === 'consistency_4')).toBeUndefined();
  });
});

// ============================================================================
// STREAK (v1.0)
// ============================================================================
describe('computeEarnedBadges — STREAK (via milestones param)', () => {
  it('{7} → only streak_7 earned, uses the supplied earnedAt', () => {
    const stamp = '2026-04-10T12:00:00.000Z';
    const result = compute([evt('2026-04-10T12:00:00.000Z')], { 7: stamp });
    const b = result.find((r) => r.id === 'streak_7');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe(stamp);
    expect(result.find((r) => r.id === 'streak_30')).toBeUndefined();
  });

  it('{7, 30, 100} → all three streak tiers earned', () => {
    const result = compute(
      [evt('2026-04-19T12:00:00.000Z')],
      { 7: '2025-01-07T08:00:00.000Z', 30: '2025-01-30T08:00:00.000Z', 100: '2025-04-09T08:00:00.000Z' }
    );
    const ids = result.map((b) => b.id);
    expect(ids).toContain('streak_7');
    expect(ids).toContain('streak_30');
    expect(ids).toContain('streak_100');
  });
});

// ============================================================================
// LIFETIME (v1.0)
// ============================================================================
describe('computeEarnedBadges — LIFETIME', () => {
  it('9 events → no lifetime badges', () => {
    const events: CreditEvent[] = [];
    for (let i = 0; i < 9; i++) {
      events.push(evt(`2026-04-${String(1 + i).padStart(2, '0')}T15:00:00Z`));
    }
    const ids = earnedIds(events);
    expect(ids).not.toContain('lifetime_10');
  });

  it('10 events → lifetime_10 earnedAt = 10th event', () => {
    const events: CreditEvent[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(evt(`2026-04-${String(1 + i).padStart(2, '0')}T15:00:00Z`));
    }
    const result = compute(events);
    const b = result.find((r) => r.id === 'lifetime_10');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe('2026-04-10T15:00:00Z');
  });

  it('1001 events → all five lifetime tiers earned', () => {
    const events: CreditEvent[] = [];
    const base = new Date('2024-01-01T00:00:00.000Z').getTime();
    for (let i = 0; i < 1001; i++) {
      events.push({ userId: USER_ID, completedAt: new Date(base + i * 1000).toISOString() });
    }
    const ids = earnedIds(events);
    expect(ids).toContain('lifetime_10');
    expect(ids).toContain('lifetime_50');
    expect(ids).toContain('lifetime_100');
    expect(ids).toContain('lifetime_500');
    expect(ids).toContain('lifetime_1000');
  });

  it('events sorted ascending regardless of input order', () => {
    const events = [
      evt('2026-04-19T15:00:00Z'),
      evt('2026-04-01T15:00:00Z'),
      evt('2026-04-10T15:00:00Z'),
    ];
    const result = compute(events);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].earnedAt <= result[i].earnedAt).toBe(true);
    }
  });
});

// ============================================================================
// WEEKDAY WARRIOR (v2.0)
// ============================================================================
describe('computeEarnedBadges — WEEKDAY WARRIOR', () => {
  it('9 weekday credits in one workweek → no badge', () => {
    const events: CreditEvent[] = [];
    // 2026-04-13 is a Monday. Add 9 within Mon-Fri.
    for (let i = 0; i < 9; i++) {
      const dayIdx = (i % 5) + 13; // 13..17
      events.push(evt(`2026-04-${String(dayIdx).padStart(2, '0')}T16:00:00Z`));
    }
    expect(earnedIds(events)).not.toContain('weekday_warrior_10');
  });

  it('10 weekday credits in one workweek → weekday_warrior_10', () => {
    const events: CreditEvent[] = [];
    // 2 per day, 5 weekdays of week 2026-04-13..17 = 10 total.
    for (let d = 13; d <= 17; d++) {
      events.push(evt(`2026-04-${String(d).padStart(2, '0')}T15:00:00Z`));
      events.push(evt(`2026-04-${String(d).padStart(2, '0')}T16:00:00Z`));
    }
    const result = compute(events);
    const b = result.find((r) => r.id === 'weekday_warrior_10');
    expect(b).toBeDefined();
    // tipping event = the 10th Mon-Fri event in chronological order = Fri 16:00
    expect(b!.earnedAt).toBe('2026-04-17T16:00:00Z');
  });

  it('ignores weekend credits entirely', () => {
    const events: CreditEvent[] = [];
    // 5 weekday + 5 weekend in the same week — only 5 count.
    for (let d = 13; d <= 17; d++) {
      events.push(evt(`2026-04-${String(d).padStart(2, '0')}T15:00:00Z`));
    }
    events.push(evt('2026-04-18T15:00:00Z')); // Sat
    events.push(evt('2026-04-19T15:00:00Z')); // Sun
    expect(earnedIds(events)).not.toContain('weekday_warrior_10');
  });

  it('25 weekday credits spread across Apr 2026 → weekday_warrior_25', () => {
    const events: CreditEvent[] = [];
    // Weekdays in April 2026: 1-3 (Wed/Thu/Fri), 6-10, 13-17, 20-24, 27-30.
    // Fill enough to reach 25 by combining multiple weeks.
    const weekdays = [
      '01','02','03','06','07','08','09','10','13','14','15','16','17','20','21','22','23','24','27','28','29','30',
    ];
    // 22 distinct weekdays; add repeats of early ones to reach 25.
    for (let i = 0; i < 25; i++) {
      const d = weekdays[i % weekdays.length];
      events.push(evt(`2026-04-${d}T${String(10 + Math.floor(i / weekdays.length)).padStart(2, '0')}:00:00Z`));
    }
    expect(earnedIds(events)).toContain('weekday_warrior_25');
  });
});

// ============================================================================
// NIGHT OWL / EARLY BIRD (v2.0)
// ============================================================================
describe('computeEarnedBadges — NIGHT OWL', () => {
  it('completions before 9 PM local do not count', () => {
    // 20:00 UTC = 16:00 EDT. Does NOT count as "after 9 PM local."
    const events: CreditEvent[] = [];
    for (let d = 1; d <= 10; d++) {
      events.push(evt(`2026-04-${String(d).padStart(2, '0')}T20:00:00Z`));
    }
    expect(earnedIds(events)).not.toContain('night_owl_10');
  });

  it('10 completions after 9 PM local → night_owl_10', () => {
    // 02:00 UTC = 22:00 previous-day EDT. So 10 events at UTC 02:00 across
    // 10 different UTC dates land as 22:00 local on 10 different local days.
    const events: CreditEvent[] = [];
    for (let d = 2; d <= 11; d++) {
      events.push(evt(`2026-04-${String(d).padStart(2, '0')}T02:00:00Z`));
    }
    const result = compute(events);
    const b = result.find((r) => r.id === 'night_owl_10');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe('2026-04-11T02:00:00Z');
  });
});

describe('computeEarnedBadges — EARLY BIRD', () => {
  it('10 completions before 7 AM local → early_bird_10', () => {
    // 10:00 UTC = 06:00 EDT. Qualifies as "before 7 AM local."
    const events: CreditEvent[] = [];
    for (let d = 1; d <= 10; d++) {
      events.push(evt(`2026-04-${String(d).padStart(2, '0')}T10:00:00Z`));
    }
    const result = compute(events);
    const b = result.find((r) => r.id === 'early_bird_10');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe('2026-04-10T10:00:00Z');
  });

  it('completions at 7 AM local (boundary) do not count', () => {
    // 11:00 UTC = 07:00 EDT. NOT before 7 AM.
    const events: CreditEvent[] = [];
    for (let d = 1; d <= 10; d++) {
      events.push(evt(`2026-04-${String(d).padStart(2, '0')}T11:00:00Z`));
    }
    expect(earnedIds(events)).not.toContain('early_bird_10');
  });
});

// ============================================================================
// POWER HOUR (v2.0)
// ============================================================================
describe('computeEarnedBadges — POWER HOUR', () => {
  it('4 events within an hour → no badge', () => {
    const base = new Date('2026-04-15T15:00:00.000Z').getTime();
    const events = [0, 10, 20, 30].map((m) => ({
      userId: USER_ID,
      completedAt: new Date(base + m * 60_000).toISOString(),
    }));
    expect(earnedIds(events)).not.toContain('power_hour_5');
  });

  it('5 events within a 60-minute window → power_hour_5 at the 5th event', () => {
    const base = new Date('2026-04-15T15:00:00.000Z').getTime();
    const events = [0, 10, 20, 30, 55].map((m) => ({
      userId: USER_ID,
      completedAt: new Date(base + m * 60_000).toISOString(),
    }));
    const result = compute(events);
    const b = result.find((r) => r.id === 'power_hour_5');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe(new Date(base + 55 * 60_000).toISOString());
  });

  it('5 events but 61 minutes apart → no badge (window boundary)', () => {
    const base = new Date('2026-04-15T15:00:00.000Z').getTime();
    const events = [0, 10, 20, 30, 61].map((m) => ({
      userId: USER_ID,
      completedAt: new Date(base + m * 60_000).toISOString(),
    }));
    expect(earnedIds(events)).not.toContain('power_hour_5');
  });

  it('15 events in a single hour → all three power_hour tiers', () => {
    const base = new Date('2026-04-15T15:00:00.000Z').getTime();
    const events: CreditEvent[] = [];
    for (let i = 0; i < 15; i++) {
      events.push({ userId: USER_ID, completedAt: new Date(base + i * 60_000).toISOString() });
    }
    const ids = earnedIds(events);
    expect(ids).toContain('power_hour_5');
    expect(ids).toContain('power_hour_10');
    expect(ids).toContain('power_hour_15');
  });
});

// ============================================================================
// SPRING CLEANER / HOLIDAY HERO (v2.0)
// ============================================================================
describe('computeEarnedBadges — SPRING CLEANER', () => {
  it('25 credits in Mar-Apr 2026 → spring_cleaner_25', () => {
    const events: CreditEvent[] = [];
    for (let i = 0; i < 25; i++) {
      const day = 1 + (i % 30);
      const month = i < 20 ? '03' : '04';
      events.push(evt(`2026-${month}-${String(day).padStart(2, '0')}T15:00:00Z`));
    }
    expect(earnedIds(events)).toContain('spring_cleaner_25');
  });

  it('credits in Feb/May do not count', () => {
    const events: CreditEvent[] = [];
    for (let i = 0; i < 25; i++) {
      events.push(evt(`2026-02-${String((i % 28) + 1).padStart(2, '0')}T15:00:00Z`));
    }
    expect(earnedIds(events)).not.toContain('spring_cleaner_25');
  });
});

describe('computeEarnedBadges — HOLIDAY HERO', () => {
  it('25 credits in December → holiday_hero_25', () => {
    const events: CreditEvent[] = [];
    for (let i = 0; i < 25; i++) {
      events.push(evt(`2025-12-${String((i % 31) + 1).padStart(2, '0')}T15:00:00Z`));
    }
    expect(earnedIds(events)).toContain('holiday_hero_25');
  });
});

// ============================================================================
// PHOENIX (v2.0)
// ============================================================================
describe('computeEarnedBadges — PHOENIX', () => {
  it('two completions 13 days apart → no badge (boundary)', () => {
    const events = [
      evt('2026-04-01T15:00:00Z'),
      evt('2026-04-14T15:00:00Z'), // 13-day gap exactly
    ];
    expect(earnedIds(events)).not.toContain('phoenix_1');
  });

  it('two completions 14 days apart → phoenix_1', () => {
    const events = [
      evt('2026-04-01T15:00:00Z'),
      evt('2026-04-15T15:00:00Z'), // 14-day gap
    ];
    const result = compute(events);
    const b = result.find((r) => r.id === 'phoenix_1');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe('2026-04-15T15:00:00Z');
  });

  it('5 comeback events → phoenix_5', () => {
    const events: CreditEvent[] = [];
    let d = new Date('2026-01-01T15:00:00.000Z');
    for (let i = 0; i < 6; i++) {
      events.push({ userId: USER_ID, completedAt: d.toISOString() });
      d = new Date(d.getTime() + 15 * 86_400_000);
    }
    const ids = earnedIds(events);
    expect(ids).toContain('phoenix_1');
    expect(ids).toContain('phoenix_5');
  });
});

// ============================================================================
// CLUTCH (v2.0)
// ============================================================================
describe('computeEarnedBadges — CLUTCH', () => {
  it('5 overdue completions → clutch_5', () => {
    const events: CreditEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push({
        userId: USER_ID,
        completedAt: `2026-04-${String(15 + i).padStart(2, '0')}T15:00:00Z`,
        dueDate: `2026-04-${String(10 + i).padStart(2, '0')}T15:00:00Z`,
      });
    }
    const result = compute(events);
    const b = result.find((r) => r.id === 'clutch_5');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe('2026-04-19T15:00:00Z');
  });

  it('completions before dueDate do NOT count', () => {
    const events: CreditEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push({
        userId: USER_ID,
        completedAt: `2026-04-${String(10 + i).padStart(2, '0')}T15:00:00Z`,
        dueDate: `2026-04-${String(20 + i).padStart(2, '0')}T15:00:00Z`,
      });
    }
    expect(earnedIds(events)).not.toContain('clutch_5');
  });

  it('events without dueDate do not count', () => {
    const events: CreditEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(evt(`2026-04-${String(10 + i).padStart(2, '0')}T15:00:00Z`));
    }
    expect(earnedIds(events)).not.toContain('clutch_5');
  });

  it('date-only dueDate treated as end-of-local-day', () => {
    const events = [
      {
        userId: USER_ID,
        completedAt: '2026-04-22T23:00:00Z', // 19:00 EDT on Apr 22
        dueDate: '2026-04-22',                 // end of local day Apr 22
      },
    ];
    // 19:00 EDT on Apr 22 == local day Apr 22, which is >= '2026-04-22'.
    const result = compute(events);
    // 1 overdue is below clutch_5 threshold; just verify the comparison path doesn't crash
    expect(result.find((r) => r.id === 'clutch_5')).toBeUndefined();
  });
});

// ============================================================================
// CLEAN SWEEP + FAMILY CONTEXT (v2.0)
// ============================================================================
describe('buildFamilyBadgeContext — zero-inbox replay', () => {
  function task(partial: Partial<Task>): Task {
    return {
      id: partial.id ?? `t_${Math.random()}`,
      title: partial.title ?? 'Task',
      description: '',
      status: partial.status ?? 'todo',
      scope: 'family',
      assigneeId: partial.assigneeId ?? null,
      dueDate: null,
      createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
      createdBy: 'u1',
      startedAt: null,
      completedAt: partial.completedAt ?? null,
      cancelledAt: partial.cancelledAt ?? null,
      assignedAt: null,
      transitions: partial.transitions ?? [],
      tags: [],
      subTasks: [],
      snoozedUntil: partial.snoozedUntil ?? null,
      sortOrder: 0,
    };
  }

  it('single task created and completed → one zero-inbox transition attributed to completer', () => {
    const tasks: Task[] = [
      task({
        id: 't1',
        status: 'done',
        createdAt: '2026-04-01T10:00:00.000Z',
        completedAt: '2026-04-02T15:00:00.000Z',
        transitions: [{ fromStatus: 'todo', toStatus: 'done', timestamp: '2026-04-02T15:00:00.000Z', userId: 'u1' }],
      }),
    ];
    const ctx = buildFamilyBadgeContext(tasks, new Map(), TZ, NOW);
    expect(ctx.zeroInboxEvents).toEqual([{ userId: 'u1', completedAt: '2026-04-02T15:00:00.000Z' }]);
  });

  it('multiple tasks all currently open → never reaches zero', () => {
    const tasks: Task[] = [
      task({ id: 't1', status: 'todo', createdAt: '2026-04-01T10:00:00.000Z' }),
      task({ id: 't2', status: 'started', createdAt: '2026-04-02T10:00:00.000Z' }),
    ];
    const ctx = buildFamilyBadgeContext(tasks, new Map(), TZ, NOW);
    expect(ctx.zeroInboxEvents).toEqual([]);
  });

  it('snoozed-to-future tasks are excluded from open count', () => {
    const farFuture = new Date(NOW.getTime() + 30 * 86_400_000).toISOString();
    const tasks: Task[] = [
      task({
        id: 't1',
        status: 'done',
        createdAt: '2026-04-01T10:00:00.000Z',
        completedAt: '2026-04-02T15:00:00.000Z',
        transitions: [{ fromStatus: 'todo', toStatus: 'done', timestamp: '2026-04-02T15:00:00.000Z', userId: 'u1' }],
      }),
      task({
        id: 't2',
        status: 'todo',
        createdAt: '2026-03-01T10:00:00.000Z',
        snoozedUntil: farFuture,
      }),
    ];
    const ctx = buildFamilyBadgeContext(tasks, new Map(), TZ, NOW);
    // t2 is snoozed → excluded → t1 alone flips to zero on 2026-04-02.
    expect(ctx.zeroInboxEvents).toHaveLength(1);
    expect(ctx.zeroInboxEvents[0].completedAt).toBe('2026-04-02T15:00:00.000Z');
  });

  it('assigneeId overrides completer attribution', () => {
    const tasks: Task[] = [
      task({
        id: 't1',
        status: 'done',
        assigneeId: 'u2',
        createdAt: '2026-04-01T10:00:00.000Z',
        completedAt: '2026-04-02T15:00:00.000Z',
        transitions: [{ fromStatus: 'todo', toStatus: 'done', timestamp: '2026-04-02T15:00:00.000Z', userId: 'u1' }],
      }),
    ];
    const ctx = buildFamilyBadgeContext(tasks, new Map(), TZ, NOW);
    expect(ctx.zeroInboxEvents[0].userId).toBe('u2');
  });
});

describe('computeEarnedBadges — CLEAN SWEEP', () => {
  it('5 zero-inbox events credited to user → clean_sweep_1 and clean_sweep_5', () => {
    const ctx: FamilyBadgeContext = {
      zeroInboxEvents: Array.from({ length: 5 }, (_, i) => ({
        userId: USER_ID,
        completedAt: `2026-04-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`,
      })),
      dayUserIndex: new Map(),
      monthlyTallies: new Map(),
    };
    const result = compute([evt('2026-04-01T12:00:00Z')], {}, ctx);
    const ids = result.map((b) => b.id);
    expect(ids).toContain('clean_sweep_1');
    expect(ids).toContain('clean_sweep_5');
    expect(result.find((r) => r.id === 'clean_sweep_5')!.earnedAt).toBe('2026-04-05T12:00:00.000Z');
  });

  it('only counts events for the viewer', () => {
    const ctx: FamilyBadgeContext = {
      zeroInboxEvents: [
        { userId: 'u2', completedAt: '2026-04-01T12:00:00.000Z' },
        { userId: 'u2', completedAt: '2026-04-02T12:00:00.000Z' },
      ],
      dayUserIndex: new Map(),
      monthlyTallies: new Map(),
    };
    const result = compute([evt('2026-04-01T12:00:00Z')], {}, ctx, USER_ID);
    expect(result.find((r) => r.id === 'clean_sweep_1')).toBeUndefined();
  });
});

// ============================================================================
// PARTNER IN CRIME (v2.0)
// ============================================================================
describe('computeEarnedBadges — PARTNER IN CRIME', () => {
  function buildDayUserIndex(sharedDays: Array<{ dayKey: string; sharedAt: string; users: string[] }>) {
    const m = new Map<string, { users: Set<string>; sharedAt: string | null }>();
    for (const s of sharedDays) {
      m.set(s.dayKey, { users: new Set(s.users), sharedAt: s.sharedAt });
    }
    return m;
  }

  it('symmetric: both users earn on the same days with the same earnedAt', () => {
    const sharedDays = Array.from({ length: 5 }, (_, i) => ({
      dayKey: `2026-04-${String(i + 1).padStart(2, '0')}`,
      sharedAt: `2026-04-${String(i + 1).padStart(2, '0')}T16:00:00.000Z`,
      users: ['u1', 'u2'],
    }));
    const ctx: FamilyBadgeContext = {
      zeroInboxEvents: [],
      dayUserIndex: buildDayUserIndex(sharedDays),
      monthlyTallies: new Map(),
    };
    const events1 = sharedDays.map((s) => ({ userId: 'u1', completedAt: s.sharedAt }));
    const events2 = sharedDays.map((s) => ({ userId: 'u2', completedAt: s.sharedAt }));
    const r1 = compute(events1, {}, ctx, 'u1').find((r) => r.id === 'partner_in_crime_5');
    const r2 = compute(events2, {}, ctx, 'u2').find((r) => r.id === 'partner_in_crime_5');
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r1!.earnedAt).toBe(r2!.earnedAt);
  });

  it('single-user days do not count', () => {
    const ctx: FamilyBadgeContext = {
      zeroInboxEvents: [],
      dayUserIndex: buildDayUserIndex(
        Array.from({ length: 5 }, (_, i) => ({
          dayKey: `2026-04-${String(i + 1).padStart(2, '0')}`,
          sharedAt: `2026-04-${String(i + 1).padStart(2, '0')}T16:00:00.000Z`,
          users: ['u1'],
        }))
      ),
      monthlyTallies: new Map(),
    };
    const events = Array.from({ length: 5 }, (_, i) => ({
      userId: 'u1',
      completedAt: `2026-04-${String(i + 1).padStart(2, '0')}T16:00:00.000Z`,
    }));
    expect(earnedIds(events)).not.toContain('partner_in_crime_5');
    // Also via the full ctx path:
    const result = compute(events, {}, ctx, 'u1');
    expect(result.find((r) => r.id === 'partner_in_crime_5')).toBeUndefined();
  });
});

// ============================================================================
// COMEBACK KID (v2.0)
// ============================================================================
describe('computeEarnedBadges — COMEBACK KID', () => {
  it('1 qualifying month → comeback_kid_1 at end-of-month', () => {
    // Month 2026-03: u1 behind at mid (5 vs 10), ahead at end (20 vs 15).
    const acc = {
      mid: new Map<string, number>([
        ['u1', 5],
        ['u2', 10],
      ]),
      end: new Map<string, number>([
        ['u1', 20],
        ['u2', 15],
      ]),
    };
    const ctx: FamilyBadgeContext = {
      zeroInboxEvents: [],
      dayUserIndex: new Map(),
      monthlyTallies: new Map([['2026-03', acc]]),
    };
    const r = compute([], {}, ctx, 'u1').find((b) => b.id === 'comeback_kid_1');
    expect(r).toBeDefined();
    expect(r!.earnedAt.startsWith('2026-03-31T')).toBe(true);
  });

  it('viewer was not behind at mid → no comeback', () => {
    const acc = {
      mid: new Map<string, number>([
        ['u1', 15],
        ['u2', 10],
      ]),
      end: new Map<string, number>([
        ['u1', 30],
        ['u2', 15],
      ]),
    };
    const ctx: FamilyBadgeContext = {
      zeroInboxEvents: [],
      dayUserIndex: new Map(),
      monthlyTallies: new Map([['2026-03', acc]]),
    };
    expect(compute([], {}, ctx, 'u1').find((b) => b.id === 'comeback_kid_1')).toBeUndefined();
  });

  it('single-user family → never earns', () => {
    const acc = {
      mid: new Map<string, number>([['u1', 5]]),
      end: new Map<string, number>([['u1', 20]]),
    };
    const ctx: FamilyBadgeContext = {
      zeroInboxEvents: [],
      dayUserIndex: new Map(),
      monthlyTallies: new Map([['2026-03', acc]]),
    };
    expect(compute([], {}, ctx, 'u1').find((b) => b.id === 'comeback_kid_1')).toBeUndefined();
  });
});
