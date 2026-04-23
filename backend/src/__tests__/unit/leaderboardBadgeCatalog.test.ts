/**
 * Catalog integrity tests — every BadgeId in the union appears exactly once in
 * BADGE_CATALOG; every category has ≥1 badge; required v2.0 fields populated.
 */

import {
  BADGE_CATALOG,
  type BadgeCategory,
  type BadgeId,
} from '../../shared/types';

const EXPECTED_CATEGORIES: BadgeCategory[] = [
  'volume',
  'consistency',
  'streak',
  'lifetime',
  'weekday_warrior',
  'night_owl',
  'early_bird',
  'power_hour',
  'clean_sweep',
  'spring_cleaner',
  'holiday_hero',
  'phoenix',
  'clutch',
  'partner_in_crime',
  'comeback_kid',
];

describe('BADGE_CATALOG', () => {
  it('has exactly 48 entries', () => {
    expect(BADGE_CATALOG).toHaveLength(48);
  });

  it('has no duplicate ids', () => {
    const seen = new Set<BadgeId>();
    for (const def of BADGE_CATALOG) {
      expect(seen.has(def.id)).toBe(false);
      seen.add(def.id);
    }
  });

  it('covers all 15 categories with ≥1 entry each', () => {
    const byCategory = new Map<BadgeCategory, number>();
    for (const def of BADGE_CATALOG) {
      byCategory.set(def.category, (byCategory.get(def.category) ?? 0) + 1);
    }
    for (const cat of EXPECTED_CATEGORIES) {
      expect(byCategory.get(cat) ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('every entry has required v2.0 fields populated', () => {
    for (const def of BADGE_CATALOG) {
      expect(def.tier).toBeGreaterThanOrEqual(1);
      expect(def.tier).toBeLessThanOrEqual(5);
      expect(def.shippedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(def.celebrationCopy).toMatch(/\{displayName\}/);
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
    }
  });

  it('tiers within a category are contiguous starting at 1', () => {
    const tiersByCategory = new Map<BadgeCategory, Set<number>>();
    for (const def of BADGE_CATALOG) {
      let set = tiersByCategory.get(def.category);
      if (!set) {
        set = new Set();
        tiersByCategory.set(def.category, set);
      }
      set.add(def.tier);
    }
    for (const [cat, tiers] of tiersByCategory.entries()) {
      const sorted = Array.from(tiers).sort((a, b) => a - b);
      for (let i = 0; i < sorted.length; i++) {
        expect(sorted[i]).toBe(i + 1);
      }
      expect(sorted.length).toBeGreaterThanOrEqual(1);
      expect(sorted.length).toBeLessThanOrEqual(5);
      // spot-check no accidental gaps
      expect(cat).toBeTruthy();
    }
  });

  it('expected tier distribution: volume 3, consistency 3, streak 3, lifetime 5, clean_sweep 4, all others 3', () => {
    const expected: Record<BadgeCategory, number> = {
      volume: 3,
      consistency: 3,
      streak: 3,
      lifetime: 5,
      weekday_warrior: 3,
      night_owl: 3,
      early_bird: 3,
      power_hour: 3,
      clean_sweep: 4,
      spring_cleaner: 3,
      holiday_hero: 3,
      phoenix: 3,
      clutch: 3,
      partner_in_crime: 3,
      comeback_kid: 3,
    };
    const actual = new Map<BadgeCategory, number>();
    for (const def of BADGE_CATALOG) {
      actual.set(def.category, (actual.get(def.category) ?? 0) + 1);
    }
    for (const [cat, count] of Object.entries(expected) as [BadgeCategory, number][]) {
      expect(actual.get(cat)).toBe(count);
    }
  });
});
