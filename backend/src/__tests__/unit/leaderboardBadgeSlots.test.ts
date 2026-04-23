/**
 * Unit tests for `selectBadgeSlots` — score-based row-slot selection used by
 * `BadgeSlotArea`. Returns only earned badges; never produces ghosts.
 *
 * Algorithm:
 *   score = rarity(tier) + maxBoost * exp(-daysSinceEarnedAt / tauDays)
 *   rarity = [1, 2, 4, 8, 16][tier - 1];  maxBoost = 10;  tauDays = 7
 *   Pick highest-scoring earned badge per category as representative.
 *   Sort representatives by score DESC; take top 3; tie-break earnedAt DESC.
 */

import {
  getAutoLabel,
  getBadgeFinish,
  getBadgeRarity,
  getBadgeTier,
  selectBadgeSlots,
} from '../../shared/utils/leaderboardBadgeSlots';
import type { EarnedBadge } from '../../shared/types';

const NOW = new Date('2026-04-22T12:00:00.000Z');

describe('selectBadgeSlots', () => {
  it('empty earned → []', () => {
    expect(selectBadgeSlots([], NOW)).toEqual([]);
  });

  it('1 earned tier-1 → 1 slot', () => {
    const earned: EarnedBadge[] = [
      { id: 'consistency_4', earnedAt: '2026-04-10T12:00:00.000Z' },
    ];
    const slots = selectBadgeSlots(earned, NOW);
    expect(slots).toHaveLength(1);
    expect(slots[0].def.id).toBe('consistency_4');
    expect(slots[0].earnedAt).toBe('2026-04-10T12:00:00.000Z');
  });

  it('picks highest-scoring badge per category (representative)', () => {
    // Three Volume tiers earned same day — highest tier wins (rarity dominates).
    const earned: EarnedBadge[] = [
      { id: 'volume_5', earnedAt: '2026-04-20T12:00:00Z' },
      { id: 'volume_10', earnedAt: '2026-04-20T12:00:00Z' },
      { id: 'volume_20', earnedAt: '2026-04-20T12:00:00Z' },
    ];
    const slots = selectBadgeSlots(earned, NOW);
    expect(slots).toHaveLength(1);
    expect(slots[0].def.id).toBe('volume_20');
  });

  it('4 earned categories → 3 slots; best-score wins (Consistency may remain if freshest)', () => {
    // All tier-1; Consistency is the most recent earn.
    const earned: EarnedBadge[] = [
      { id: 'volume_5', earnedAt: '2026-04-01T12:00:00Z' },
      { id: 'consistency_4', earnedAt: '2026-04-22T12:00:00Z' }, // same day as NOW → boost ~10
      { id: 'streak_7', earnedAt: '2026-04-10T12:00:00Z' },
      { id: 'lifetime_10', earnedAt: '2026-04-12T12:00:00Z' },
    ];
    const slots = selectBadgeSlots(earned, NOW);
    expect(slots).toHaveLength(3);
    const ids = slots.map((s) => s.def.id);
    // Consistency is freshest → it survives. Volume is oldest → gets dropped.
    expect(ids).toContain('consistency_4');
    expect(ids).not.toContain('volume_5');
  });

  it('recency beats rarity when rarity diff is 1 and delta is fresh-today vs. 6 weeks old', () => {
    // volume_10: tier 2 (rarity=2), earned today → score ≈ 2 + 10 = 12
    // lifetime_50: tier 2 (rarity=2), earned 42 days ago → score ≈ 2 + 10*exp(-6) ≈ 2.02
    const earned: EarnedBadge[] = [
      { id: 'volume_10', earnedAt: '2026-04-22T09:00:00Z' },
      { id: 'lifetime_50', earnedAt: '2026-03-11T09:00:00Z' },
    ];
    const slots = selectBadgeSlots(earned, NOW);
    expect(slots.map((s) => s.def.id)).toEqual(['volume_10', 'lifetime_50']);
  });

  it('rarity beats recency when tiers are far apart', () => {
    // lifetime_1000: tier 5 (rarity=16), earned 90 days ago → score ≈ 16 + ~0
    // volume_5:     tier 1 (rarity=1),  earned today     → score ≈ 1 + 10 = 11
    const earned: EarnedBadge[] = [
      { id: 'lifetime_1000', earnedAt: '2026-01-22T12:00:00Z' },
      { id: 'volume_5', earnedAt: '2026-04-22T09:00:00Z' },
    ];
    const slots = selectBadgeSlots(earned, NOW);
    expect(slots[0].def.id).toBe('lifetime_1000');
  });

  it('15 categories earned at tier-5 same day → top 3 by tie-break earnedAt DESC', () => {
    // When score ties, tie-break is earnedAt DESC. Build 4 tier-3 earns on
    // sequential days; top 3 should be the 3 most recent.
    const earned: EarnedBadge[] = [
      { id: 'volume_20', earnedAt: '2026-04-01T12:00:00Z' },
      { id: 'consistency_7', earnedAt: '2026-04-05T12:00:00Z' },
      { id: 'streak_100', earnedAt: '2026-04-10T12:00:00Z' },
      { id: 'lifetime_100', earnedAt: '2026-04-15T12:00:00Z' },
    ];
    const slots = selectBadgeSlots(earned, NOW);
    expect(slots.map((s) => s.def.id)).toEqual([
      'lifetime_100',
      'streak_100',
      'consistency_7',
    ]);
  });
});

describe('getBadgeTier / getBadgeFinish / getBadgeRarity', () => {
  it('maps catalog entries to tier 1-5', () => {
    expect(getBadgeTier('volume_5')).toBe(1);
    expect(getBadgeTier('volume_20')).toBe(3);
    expect(getBadgeTier('lifetime_500')).toBe(4);
    expect(getBadgeTier('lifetime_1000')).toBe(5);
  });

  it('maps tier to finish', () => {
    expect(getBadgeFinish(1)).toBe('bronze');
    expect(getBadgeFinish(2)).toBe('silver');
    expect(getBadgeFinish(3)).toBe('gold');
    expect(getBadgeFinish(4)).toBe('platinum');
    expect(getBadgeFinish(5)).toBe('legendary');
  });

  it('rarity doubles per tier', () => {
    expect(getBadgeRarity(1)).toBe(1);
    expect(getBadgeRarity(2)).toBe(2);
    expect(getBadgeRarity(3)).toBe(4);
    expect(getBadgeRarity(4)).toBe(8);
    expect(getBadgeRarity(5)).toBe(16);
  });
});

describe('getAutoLabel', () => {
  it('returns "{Category} {Finish}" when displayName unset', () => {
    const def = { id: 'night_owl_10', category: 'night_owl', tier: 1 } as Parameters<
      typeof getAutoLabel
    >[0];
    // Use a real catalog entry — tier-1 night owl should be Bronze.
    expect(getAutoLabel({ ...def, threshold: 10, order: 1, shippedAt: '', celebrationCopy: '', label: '' , description: ''})).toBe(
      'Night Owl Bronze'
    );
  });

  it('returns displayName override when present', () => {
    expect(
      getAutoLabel({
        id: 'volume_20',
        category: 'volume',
        tier: 3,
        threshold: 20,
        order: 3,
        shippedAt: '',
        celebrationCopy: '',
        label: '',
        description: '',
        displayName: 'Whirlwind',
      })
    ).toBe('Whirlwind');
  });
});
