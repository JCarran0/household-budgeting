/**
 * UI-only metadata for badges. The canonical `BADGE_CATALOG` lives in
 * `shared/types` — this file just holds display-order + label tables keyed
 * by category. The v2.0 medal visual is driven by `MedalBadge` (chassis +
 * emblem); there is no longer a per-badge glyph map.
 */

import type { BadgeCategory } from '../../../../shared/types';

export const CATEGORY_LABELS: Record<BadgeCategory, string> = {
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

/** Display order used across the row slots and the modal sections. */
export const CATEGORY_ORDER: readonly BadgeCategory[] = [
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
] as const;
