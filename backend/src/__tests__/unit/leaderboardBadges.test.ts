/**
 * Unit tests for pure badge derivation (shared/utils/leaderboardBadges).
 */

import { computeEarnedBadges } from '../../shared/utils/leaderboardBadges';
import type { CreditEvent } from '../../shared/utils/leaderboardStreaks';
import type { BadgeId } from '../../shared/types';

const TZ = 'America/New_York';

/**
 * Build an event with a concrete HH:MM so we can assert on ordering.
 * All day-math is in America/New_York; noon UTC = 08:00 EDT, well within
 * the same local day whether DST or not.
 */
function evt(dateTime: string): CreditEvent {
  return { userId: 'u1', completedAt: dateTime };
}

function earnedIds(events: CreditEvent[]): BadgeId[] {
  return computeEarnedBadges(events, {}, TZ).map((b) => b.id);
}

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
    const result = computeEarnedBadges(events, {}, TZ);
    const b = result.find((b) => b.id === 'volume_5');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe('2026-04-19T18:00:00Z');
  });

  it('20 in a day → volume_5, volume_10, volume_20 all earned with 5th/10th/20th timestamps', () => {
    const events: CreditEvent[] = [];
    // 20 events at minute offsets 0..19 within 10:00Z hour-anchor.
    const base = new Date('2026-04-19T10:00:00.000Z').getTime();
    for (let i = 0; i < 20; i++) {
      events.push({ userId: 'u1', completedAt: new Date(base + i * 60_000).toISOString() });
    }
    const result = computeEarnedBadges(events, {}, TZ);
    const byId = Object.fromEntries(result.map((b) => [b.id, b.earnedAt]));
    expect(byId.volume_5).toBe(new Date(base + 4 * 60_000).toISOString());
    expect(byId.volume_10).toBe(new Date(base + 9 * 60_000).toISOString());
    expect(byId.volume_20).toBe(new Date(base + 19 * 60_000).toISOString());
  });

  it('many spread across days with no day reaching 10 → only volume_5', () => {
    const events: CreditEvent[] = [];
    // 4 days × 5 events each = 20 events, max 5 per day
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
    // Monday: 5 events
    for (let i = 0; i < 5; i++) {
      events.push(evt(`2026-04-13T${String(14 + i).padStart(2, '0')}:00:00Z`));
    }
    // Tuesday: 20 events
    const tueBase = new Date('2026-04-14T10:00:00.000Z').getTime();
    for (let i = 0; i < 20; i++) {
      events.push({ userId: 'u1', completedAt: new Date(tueBase + i * 60_000).toISOString() });
    }
    const result = computeEarnedBadges(events, {}, TZ);
    const byId = Object.fromEntries(result.map((b) => [b.id, b.earnedAt]));
    expect(byId.volume_5).toBe('2026-04-13T18:00:00Z');
    expect(byId.volume_10).toBe(new Date(tueBase + 9 * 60_000).toISOString());
    expect(byId.volume_20).toBe(new Date(tueBase + 19 * 60_000).toISOString());
  });
});

describe('computeEarnedBadges — CONSISTENCY', () => {
  it('3 distinct days in a week → no badges', () => {
    const events = [
      evt('2026-04-13T15:00:00Z'), // Mon
      evt('2026-04-15T15:00:00Z'), // Wed
      evt('2026-04-17T15:00:00Z'), // Fri
    ];
    const ids = earnedIds(events);
    expect(ids).not.toContain('consistency_4');
  });

  it('4 distinct days in a week → consistency_4 earnedAt = 4th-day first event', () => {
    const events = [
      evt('2026-04-13T15:00:00Z'), // Mon
      evt('2026-04-14T15:00:00Z'), // Tue
      evt('2026-04-15T15:00:00Z'), // Wed
      evt('2026-04-16T15:00:00Z'), // Thu (tip)
    ];
    const result = computeEarnedBadges(events, {}, TZ);
    const b = result.find((b) => b.id === 'consistency_4');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe('2026-04-16T15:00:00Z');
  });

  it('credits on all 7 days of a single ISO week → all three consistency tiers earned', () => {
    const events = [
      evt('2026-04-13T15:00:00Z'), // Mon
      evt('2026-04-14T15:00:00Z'), // Tue
      evt('2026-04-15T15:00:00Z'), // Wed
      evt('2026-04-16T15:00:00Z'), // Thu
      evt('2026-04-17T15:00:00Z'), // Fri
      evt('2026-04-18T15:00:00Z'), // Sat
      evt('2026-04-19T15:00:00Z'), // Sun
    ];
    const ids = earnedIds(events);
    expect(ids).toContain('consistency_4');
    expect(ids).toContain('consistency_5');
    expect(ids).toContain('consistency_7');
  });

  it('Sun + next Mon are in different ISO weeks — does not consolidate into one', () => {
    const events = [
      evt('2026-04-19T15:00:00Z'), // Sun — week A
      evt('2026-04-20T15:00:00Z'), // Mon — week B
    ];
    const result = computeEarnedBadges(events, {}, TZ);
    expect(result.find((b) => b.id === 'consistency_4')).toBeUndefined();
  });
});

describe('computeEarnedBadges — STREAK (via milestones param)', () => {
  it('{7} → only streak_7 earned, uses the supplied earnedAt', () => {
    const stamp = '2026-04-10T12:00:00.000Z';
    const result = computeEarnedBadges(
      [evt('2026-04-10T12:00:00.000Z')],
      { 7: stamp },
      TZ
    );
    const b = result.find((r) => r.id === 'streak_7');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe(stamp);
    expect(result.find((r) => r.id === 'streak_30')).toBeUndefined();
  });

  it('{7, 30, 100} → all three streak tiers earned', () => {
    const result = computeEarnedBadges(
      [evt('2026-04-19T12:00:00.000Z')],
      { 7: '2025-01-07T08:00:00.000Z', 30: '2025-01-30T08:00:00.000Z', 100: '2025-04-09T08:00:00.000Z' },
      TZ
    );
    const ids = result.map((b) => b.id);
    expect(ids).toContain('streak_7');
    expect(ids).toContain('streak_30');
    expect(ids).toContain('streak_100');
  });
});

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
    const result = computeEarnedBadges(events, {}, TZ);
    const b = result.find((b) => b.id === 'lifetime_10');
    expect(b).toBeDefined();
    expect(b!.earnedAt).toBe('2026-04-10T15:00:00Z');
  });

  it('1001 events → all five lifetime tiers earned', () => {
    const events: CreditEvent[] = [];
    // Synthesize 1001 distinct ascending ISO stamps by incrementing seconds
    // off a single base day. Will produce the same local day across all
    // events, so volume_10 also fires — we only assert lifetime tiers here.
    const base = new Date('2024-01-01T00:00:00.000Z').getTime();
    for (let i = 0; i < 1001; i++) {
      events.push({ userId: 'u1', completedAt: new Date(base + i * 1000).toISOString() });
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
    const result = computeEarnedBadges(events, {}, TZ);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].earnedAt <= result[i].earnedAt).toBe(true);
    }
  });
});
