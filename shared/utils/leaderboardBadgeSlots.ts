/**
 * Row-slot selection + tier helpers for the leaderboard badge system.
 *
 * Score-based per-category representative selection (BRD §5.1 / plan D29):
 *   score = rarity(tier) + recencyBoost(earnedAt, now)
 *   rarity = [1, 2, 4, 8, 16][tier - 1]
 *   recencyBoost = MAX_BOOST * exp(-daysSinceEarnedAt / TAU_DAYS)
 *
 * Consumer picks the top 3 representatives; no ghost placeholders on the row.
 */

import {
  BADGE_CATALOG,
  type BadgeCategory,
  type BadgeDefinition,
  type BadgeId,
  type EarnedBadge,
} from '../types';

export type Tier = 1 | 2 | 3 | 4 | 5;
export type Finish = 'bronze' | 'silver' | 'gold' | 'platinum' | 'legendary';

export interface EarnedSlot {
  def: BadgeDefinition;
  earnedAt: string;
  score: number;
}

/** Recency boost config. Exposed for tests; tune post-launch. */
export const RECENCY_BOOST_CONFIG = {
  maxBoost: 10,
  tauDays: 7,
} as const;

const RARITY_BY_TIER: Readonly<Record<Tier, number>> = {
  1: 1,
  2: 2,
  3: 4,
  4: 8,
  5: 16,
};

const FINISH_BY_TIER: Readonly<Record<Tier, Finish>> = {
  1: 'bronze',
  2: 'silver',
  3: 'gold',
  4: 'platinum',
  5: 'legendary',
};

const FINISH_NAME: Readonly<Record<Finish, string>> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  legendary: 'Legendary',
};

const CATEGORY_NAME: Readonly<Record<BadgeCategory, string>> = {
  volume: 'Volume',
  consistency: 'Consistency',
  streak: 'Streak',
  lifetime: 'Lifetime',
  weekday_warrior: 'Weekday Warrior',
  night_owl: 'Night Owl',
  early_bird: 'Early Bird',
  power_hour: 'Power Hour',
  clean_sweep: 'Clean Sweep',
  spring_cleaner: 'Spring Cleaner',
  holiday_hero: 'Holiday Hero',
  phoenix: 'Phoenix',
  clutch: 'Clutch',
  partner_in_crime: 'Partner in Crime',
  comeback_kid: 'Comeback Kid',
};

const CATALOG_BY_ID = new Map<BadgeId, BadgeDefinition>(
  BADGE_CATALOG.map((b) => [b.id, b])
);

export function getBadgeDefinition(id: BadgeId): BadgeDefinition | undefined {
  return CATALOG_BY_ID.get(id);
}

export function getBadgeTier(id: BadgeId): Tier {
  const def = CATALOG_BY_ID.get(id);
  return def ? def.tier : 1;
}

export function getBadgeFinish(tier: Tier): Finish {
  return FINISH_BY_TIER[tier];
}

export function getBadgeRarity(tier: Tier): number {
  return RARITY_BY_TIER[tier];
}

export function getFinishName(finish: Finish): string {
  return FINISH_NAME[finish];
}

export function getCategoryName(category: BadgeCategory): string {
  return CATEGORY_NAME[category];
}

/** Auto-label: displayName override, else "{Category} {Finish}". */
export function getAutoLabel(def: BadgeDefinition): string {
  if (def.displayName) return def.displayName;
  return `${getCategoryName(def.category)} ${getFinishName(getBadgeFinish(def.tier))}`;
}

function computeScore(def: BadgeDefinition, earnedAt: string, now: Date): number {
  const rarity = getBadgeRarity(def.tier);
  const earnedMs = new Date(earnedAt).getTime();
  const daysSince = Math.max(0, (now.getTime() - earnedMs) / 86_400_000);
  const { maxBoost, tauDays } = RECENCY_BOOST_CONFIG;
  const recencyBoost = maxBoost * Math.exp(-daysSince / tauDays);
  return rarity + recencyBoost;
}

/**
 * Score-based row-slot selection (D29). Pick highest-scoring earned badge per
 * category as the representative; return top 3 representatives by score;
 * tie-break earnedAt DESC.
 */
export function selectBadgeSlots(earned: EarnedBadge[], now: Date): EarnedSlot[] {
  if (earned.length === 0) return [];

  const bestByCategory = new Map<BadgeCategory, EarnedSlot>();
  for (const e of earned) {
    const def = CATALOG_BY_ID.get(e.id);
    if (!def) continue;
    const score = computeScore(def, e.earnedAt, now);
    const existing = bestByCategory.get(def.category);
    if (
      existing === undefined ||
      score > existing.score ||
      (score === existing.score && e.earnedAt > existing.earnedAt)
    ) {
      bestByCategory.set(def.category, { def, earnedAt: e.earnedAt, score });
    }
  }

  const reps = Array.from(bestByCategory.values());
  reps.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.earnedAt !== b.earnedAt) return a.earnedAt < b.earnedAt ? 1 : -1;
    return 0;
  });

  return reps.slice(0, 3);
}
