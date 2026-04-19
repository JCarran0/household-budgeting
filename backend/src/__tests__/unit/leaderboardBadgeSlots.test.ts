/**
 * Unit tests for `selectBadgeSlots` — the per-row slot selection used by
 * `BadgeSlotArea`. Returns only earned badges; never produces ghosts.
 */

import {
  selectBadgeSlots,
  isFinalTierBadge,
} from '../../shared/utils/leaderboardBadgeSlots';
import type { EarnedBadge } from '../../shared/types';

describe('selectBadgeSlots', () => {
  it('0 earned → empty array (row renders nothing)', () => {
    expect(selectBadgeSlots([])).toEqual([]);
  });

  it('1 earned → single slot for that badge', () => {
    const earned: EarnedBadge[] = [
      { id: 'consistency_4', earnedAt: '2026-04-10T12:00:00.000Z' },
    ];
    const slots = selectBadgeSlots(earned);
    expect(slots).toHaveLength(1);
    expect(slots[0].def.id).toBe('consistency_4');
    expect(slots[0].earnedAt).toBe('2026-04-10T12:00:00.000Z');
  });

  it('picks highest-tier per category', () => {
    const earned: EarnedBadge[] = [
      { id: 'volume_5', earnedAt: '2026-04-01T12:00:00Z' },
      { id: 'volume_10', earnedAt: '2026-04-02T12:00:00Z' },
      { id: 'volume_20', earnedAt: '2026-04-03T12:00:00Z' },
    ];
    const slots = selectBadgeSlots(earned);
    expect(slots).toHaveLength(1);
    expect(slots[0].def.id).toBe('volume_20');
  });

  it('4 categories earned → consistency dropped first; max 3 returned', () => {
    const earned: EarnedBadge[] = [
      { id: 'volume_5', earnedAt: '2026-04-01T12:00:00Z' },
      { id: 'consistency_4', earnedAt: '2026-04-15T12:00:00Z' }, // most recent — dropped
      { id: 'streak_7', earnedAt: '2026-04-10T12:00:00Z' },
      { id: 'lifetime_10', earnedAt: '2026-04-12T12:00:00Z' },
    ];
    const slots = selectBadgeSlots(earned);
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot.def.category).not.toBe('consistency');
    }
  });

  it('ordering after consistency drop is earnedAt DESC', () => {
    const earned: EarnedBadge[] = [
      { id: 'volume_5', earnedAt: '2026-04-01T12:00:00Z' },
      { id: 'consistency_4', earnedAt: '2026-04-15T12:00:00Z' },
      { id: 'streak_7', earnedAt: '2026-04-10T12:00:00Z' },
      { id: 'lifetime_10', earnedAt: '2026-04-12T12:00:00Z' },
    ];
    const slots = selectBadgeSlots(earned);
    expect(slots.map((s) => s.def.id)).toEqual(['lifetime_10', 'streak_7', 'volume_5']);
  });

  it('exactly 3 categories earned → no drop, ordered by recency DESC', () => {
    const earned: EarnedBadge[] = [
      { id: 'volume_5', earnedAt: '2026-04-01T12:00:00Z' },
      { id: 'streak_7', earnedAt: '2026-04-10T12:00:00Z' },
      { id: 'lifetime_10', earnedAt: '2026-04-05T12:00:00Z' },
    ];
    const slots = selectBadgeSlots(earned);
    expect(slots.map((s) => s.def.id)).toEqual(['streak_7', 'lifetime_10', 'volume_5']);
  });
});

describe('isFinalTierBadge', () => {
  it('true for the highest-threshold badge in each category', () => {
    expect(isFinalTierBadge('volume_20')).toBe(true);
    expect(isFinalTierBadge('consistency_7')).toBe(true);
    expect(isFinalTierBadge('streak_100')).toBe(true);
    expect(isFinalTierBadge('lifetime_1000')).toBe(true);
  });

  it('false for non-max tiers', () => {
    expect(isFinalTierBadge('volume_5')).toBe(false);
    expect(isFinalTierBadge('volume_10')).toBe(false);
    expect(isFinalTierBadge('consistency_4')).toBe(false);
    expect(isFinalTierBadge('streak_30')).toBe(false);
    expect(isFinalTierBadge('lifetime_500')).toBe(false);
  });
});
