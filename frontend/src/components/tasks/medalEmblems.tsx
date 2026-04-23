/**
 * Per-category emblem glyphs for the leaderboard medal system — 15 categories
 * + a `ghost` variant for untouched-category placeholders. OS-rendered emoji
 * chosen to match the "character/charm" of the v1 (pre-v2) badges, now
 * scaled against the coin-bevel chassis in MedalBadge.
 *
 * Rendering is a plain span with font-size=size; emoji are multi-color and
 * ignore `color`, so the chassis no longer tints them. If emoji rendering
 * proves inconsistent across OSes, swap this module for an SVG icon pack —
 * the `MedalEmblem` contract (emblem + size → ReactElement) stays stable.
 */

import type { ReactElement } from 'react';
import type { BadgeCategory } from '../../../../shared/types';

export type EmblemKey = BadgeCategory | 'ghost';

interface MedalEmblemProps {
  emblem: EmblemKey;
  size: number;
}

const CATEGORY_GLYPH: Record<EmblemKey, string> = {
  volume: '⚡',
  consistency: '📅',
  streak: '🔥',
  lifetime: '🏆',
  weekday_warrior: '🛡️',
  night_owl: '🦉',
  early_bird: '🐦',
  power_hour: '⏱️',
  clean_sweep: '🧹',
  spring_cleaner: '🌱',
  holiday_hero: '🎄',
  phoenix: '🐦‍🔥',
  clutch: '🎯',
  partner_in_crime: '🤝',
  comeback_kid: '💫',
  ghost: '?',
};

export function MedalEmblem({ emblem, size }: MedalEmblemProps): ReactElement {
  const glyph = CATEGORY_GLYPH[emblem];
  return (
    <span
      aria-hidden="true"
      style={{
        // Emoji render at roughly font-size; line-height 1 removes baseline
        // padding so glyph vertical-centers inside the medal.
        fontSize: size,
        lineHeight: 1,
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      {glyph}
    </span>
  );
}
