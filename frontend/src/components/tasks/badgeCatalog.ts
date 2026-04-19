/**
 * UI-only display metadata for badges. Paired with the canonical
 * `BADGE_CATALOG` in `shared/types` — this file decorates each badge id with
 * a glyph + color for presentation. Server never sees this module.
 *
 * Real artwork is a zero-code-change follow-up: swap the `glyph` fields for
 * SVG imports.
 */

import type { BadgeCategory, BadgeId } from '../../../../shared/types';

export const BADGE_DISPLAY: Record<BadgeId, { glyph: string; color: string }> = {
  volume_5:      { glyph: '⚡',    color: 'yellow' },
  volume_10:     { glyph: '⚡⚡',  color: 'yellow' },
  volume_20:     { glyph: '⚡⚡⚡', color: 'orange' },
  consistency_4: { glyph: '📅',    color: 'blue' },
  consistency_5: { glyph: '📅✨',  color: 'blue' },
  consistency_7: { glyph: '🌟',    color: 'indigo' },
  streak_7:      { glyph: '🔥',    color: 'orange' },
  streak_30:     { glyph: '🔥🔥',  color: 'red' },
  streak_100:    { glyph: '💯',    color: 'red' },
  lifetime_10:   { glyph: '🏅',    color: 'teal' },
  lifetime_50:   { glyph: '🥉',    color: 'teal' },
  lifetime_100:  { glyph: '🥈',    color: 'cyan' },
  lifetime_500:  { glyph: '🥇',    color: 'cyan' },
  lifetime_1000: { glyph: '🏆',    color: 'grape' },
};

export const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  volume: 'Volume',
  consistency: 'Consistency',
  streak: 'Streak',
  lifetime: 'Lifetime',
};

/** Display order used across the row slots and the modal sections. */
export const CATEGORY_ORDER: readonly BadgeCategory[] = [
  'volume',
  'consistency',
  'streak',
  'lifetime',
] as const;
