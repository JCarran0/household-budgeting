/**
 * Selects up to 3 earned badge slots per leaderboard row (BRD §5.1 / plan D7).
 *
 * Rule:
 *   1. Pick the user's highest-tier earned badge per category.
 *   2. If earned in all 4 categories, drop Consistency first.
 *   3. Recency tie-break on earnedAt DESC.
 *   4. Trim to at most 3.
 *
 * Rows render fewer than 3 slots when the user has fewer than 3 categories
 * earned — the row never shows ghost placeholders. Unearned-badge ghosts are
 * shown only in the per-member detail modal.
 */

import { BADGE_CATALOG, type BadgeCategory, type BadgeDefinition, type BadgeId, type EarnedBadge } from '../types';

export interface EarnedSlot {
  def: BadgeDefinition;
  earnedAt: string;
}

const CATALOG_BY_ID = new Map<BadgeId, BadgeDefinition>(
  BADGE_CATALOG.map((b) => [b.id, b])
);

/** Per-category max threshold (used to identify "final tier" badges). */
const MAX_THRESHOLD_BY_CATEGORY: Record<BadgeCategory, number> = (() => {
  const out: Record<BadgeCategory, number> = {
    volume: 0,
    consistency: 0,
    streak: 0,
    lifetime: 0,
  };
  for (const def of BADGE_CATALOG) {
    if (def.threshold > out[def.category]) out[def.category] = def.threshold;
  }
  return out;
})();

/**
 * True when the badge is the highest-tier badge in its category — used to
 * trigger the special "hero" celebration + gold visual treatment.
 */
export function isFinalTierBadge(id: BadgeId): boolean {
  const def = CATALOG_BY_ID.get(id);
  if (!def) return false;
  return def.threshold === MAX_THRESHOLD_BY_CATEGORY[def.category];
}

export function selectBadgeSlots(earned: EarnedBadge[]): EarnedSlot[] {
  const bestByCategory = new Map<BadgeCategory, EarnedSlot>();
  for (const e of earned) {
    const def = CATALOG_BY_ID.get(e.id);
    if (!def) continue;
    const existing = bestByCategory.get(def.category);
    if (existing === undefined || def.threshold > existing.def.threshold) {
      bestByCategory.set(def.category, { def, earnedAt: e.earnedAt });
    }
  }

  let slots = Array.from(bestByCategory.values());

  if (slots.length === 4) {
    slots = slots.filter((s) => s.def.category !== 'consistency');
  }

  slots.sort((a, b) => (a.earnedAt < b.earnedAt ? 1 : a.earnedAt > b.earnedAt ? -1 : 0));
  return slots.slice(0, 3);
}
