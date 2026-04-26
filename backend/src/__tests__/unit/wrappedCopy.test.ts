/**
 * Tests for shared/utils/wrappedCopy.ts
 *
 * Covers:
 *   - Pool count snapshots (fail loudly if variants are accidentally deleted)
 *   - pickVariant exhaustion fallback (all ids recent → still returns something)
 *   - pickVariant respects recentIds filtering
 *   - PUSH_BODIES presence
 */

import {
  HEADLINE_TIER_POOLS,
  HIGHLIGHT_POOLS,
  WEEKLY_CARD_COPY,
  PUSH_BODIES,
  pickVariant,
  type CopyVariant,
} from '../../shared/utils/wrappedCopy';
import type { WrappedRuleId } from '../../shared/types';

// ---------------------------------------------------------------------------
// Pool count snapshots
// ---------------------------------------------------------------------------

describe('HEADLINE_TIER_POOLS', () => {
  it('has exactly 5 tiers (0–4)', () => {
    expect(HEADLINE_TIER_POOLS).toHaveLength(5);
    const tiers = HEADLINE_TIER_POOLS.map((p) => p.tier);
    expect(tiers).toEqual([0, 1, 2, 3, 4]);
  });

  it('every tier has ≥8 variants', () => {
    for (const pool of HEADLINE_TIER_POOLS) {
      expect(pool.variants.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('no duplicate ids within any tier', () => {
    for (const pool of HEADLINE_TIER_POOLS) {
      const ids = pool.variants.map((v) => v.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('all ids globally unique across tiers', () => {
    const allIds = HEADLINE_TIER_POOLS.flatMap((p) => p.variants.map((v) => v.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe('HIGHLIGHT_POOLS', () => {
  const RULE_IDS: WrappedRuleId[] = [
    'zombie',
    'badge',
    'streak_milestone',
    'personal_best',
    'leaderboard_win',
    'wow_gain',
    'midweek_comeback',
    'category_sweep',
    'project_progress',
    'trip_momentum',
    'receipt_sweep',
  ];

  it('has an entry for every WrappedRuleId (11 rules)', () => {
    for (const id of RULE_IDS) {
      expect(HIGHLIGHT_POOLS[id]).toBeDefined();
    }
  });

  it('every rule has ≥5 variants', () => {
    for (const id of RULE_IDS) {
      expect(HIGHLIGHT_POOLS[id].length).toBeGreaterThanOrEqual(5);
    }
  });

  it('no duplicate ids within any rule pool', () => {
    for (const id of RULE_IDS) {
      const ids = HIGHLIGHT_POOLS[id].map((v) => v.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('WEEKLY_CARD_COPY', () => {
  const POOLS: Array<keyof typeof WEEKLY_CARD_COPY> = [
    'bestDay',
    'leaderboardPlayful',
    'leaderboardTied',
    'streakStatus',
    'closer',
  ];

  it('has all required pools', () => {
    for (const key of POOLS) {
      expect(WEEKLY_CARD_COPY[key]).toBeDefined();
    }
  });

  it('every pool has ≥5 variants', () => {
    for (const key of POOLS) {
      expect(WEEKLY_CARD_COPY[key].length).toBeGreaterThanOrEqual(5);
    }
  });
});

// ---------------------------------------------------------------------------
// pickVariant
// ---------------------------------------------------------------------------

describe('pickVariant', () => {
  const POOL: CopyVariant[] = [
    { id: 'a', template: 'Alpha' },
    { id: 'b', template: 'Beta' },
    { id: 'c', template: 'Gamma' },
  ];

  /** Deterministic RNG that always returns 0 → picks first candidate. */
  const firstRng = () => 0;

  /** Deterministic RNG that always returns just under 1 → picks last candidate. */
  const lastRng = () => 0.9999;

  it('avoids recently-used ids', () => {
    const recentIds = new Set(['a', 'b']);
    const result = pickVariant(POOL, recentIds, firstRng);
    expect(result.id).toBe('c');
  });

  it('falls back to full pool when all ids are recent (exhaustion)', () => {
    const allRecent = new Set(POOL.map((v) => v.id));
    // Should still return something from the full pool.
    const result = pickVariant(POOL, allRecent, firstRng);
    expect(POOL.some((v) => v.id === result.id)).toBe(true);
  });

  it('exhaustion fallback picks from the full pool with rng', () => {
    const allRecent = new Set(POOL.map((v) => v.id));
    const result = pickVariant(POOL, allRecent, lastRng);
    // lastRng → floor(0.9999 * 3) = 2 → POOL[2]
    expect(result.id).toBe('c');
  });

  it('when no ids are recent, returns an item from the full pool', () => {
    const result = pickVariant(POOL, new Set(), firstRng);
    expect(result.id).toBe('a');
  });

  it('with a single-item pool, always returns that item', () => {
    const single: CopyVariant[] = [{ id: 'only', template: 'Only' }];
    const recentAll = new Set(['only']);
    const result = pickVariant(single, recentAll, firstRng);
    expect(result.id).toBe('only');
  });

  it('does not mutate the pool or recentIds set', () => {
    const recentIds = new Set(['a']);
    const originalSize = recentIds.size;
    const originalPoolLength = POOL.length;
    pickVariant(POOL, recentIds, firstRng);
    expect(recentIds.size).toBe(originalSize);
    expect(POOL.length).toBe(originalPoolLength);
  });
});

// ---------------------------------------------------------------------------
// PUSH_BODIES
// ---------------------------------------------------------------------------

describe('PUSH_BODIES', () => {
  it('tier0 is defined and non-empty', () => {
    expect(PUSH_BODIES.tier0).toBeTruthy();
  });

  it('tierNonZero contains {N} and {H} tokens', () => {
    expect(PUSH_BODIES.tierNonZero).toContain('{N}');
    expect(PUSH_BODIES.tierNonZero).toContain('{H}');
  });
});
