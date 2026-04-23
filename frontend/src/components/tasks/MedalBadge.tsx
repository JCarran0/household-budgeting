/**
 * MedalBadge — CSS-sculpted metallic disc + SVG emblem.
 *
 * One parameterized component used everywhere badges render: row slots, detail
 * modal tiles, hero modal. Finish palette is tier-driven (Bronze/Silver/Gold/
 * Platinum/Legendary). `animate='hero'` adds entry spin + ambient shimmer +
 * glow-pulse halo + tier-5 sparkle particles. Reduced-motion is handled by
 * the CSS module.
 *
 * No per-badge asset files. Swapping to commissioned art = swap the emblem
 * SVG in `medalEmblems.tsx`; the chassis stays.
 */

import { Tooltip } from '@mantine/core';
import { useEffect, useRef } from 'react';
import {
  getBadgeFinish,
  type Finish,
  type Tier,
} from '../../../../shared/utils/leaderboardBadgeSlots';
import { MedalEmblem, type EmblemKey } from './medalEmblems';
import classes from './MedalBadge.module.css';

export type MedalHalo = 'none' | 'auto' | 'legendary';
export type MedalAnimate = 'static' | 'hero';

interface MedalBadgeProps {
  tier: Tier;
  emblem: EmblemKey;
  size: number;
  halo?: MedalHalo;
  animate?: MedalAnimate;
  tooltip?: string;
  onClick?: () => void;
  /**
   * Force the muted "ghost" treatment regardless of tier — used by
   * untouched-category `????` placeholders in the detail modal.
   */
  ghost?: boolean;
}

interface FinishPalette {
  base: string;      // mid gradient stop
  edge: string;      // outer rim
  highlight: string; // inner glossy highlight
  emblem: string;    // emblem stroke color
}

/*
 * Neutral warm-cream face across all tiers — the tier story is told by the
 * rim ring (`edge`) only, keeping the chassis a consistent "coin" across
 * the catalog. Emblem glyphs are rendered as OS emoji (see medalEmblems.tsx)
 * which don't inherit text color, so `emblem` is unused at render time but
 * retained for API compatibility. Escalation still reads via halo (3+) +
 * pulse (5) + sparkles (5). `highlight` feeds the legendary halo radial and
 * the sparkle fill — tier-tinted so the effects layer still escalates.
 */
const NEUTRAL_FACE = '#f1e3c4';
const NEUTRAL_EMBLEM = '#3a2510';

const FINISH_PALETTES: Record<Finish, FinishPalette> = {
  bronze: {
    base: NEUTRAL_FACE,
    edge: '#c47a3a',
    highlight: '#ffd4bf',
    emblem: NEUTRAL_EMBLEM,
  },
  silver: {
    base: NEUTRAL_FACE,
    edge: '#7a8896',
    highlight: '#dde4ec',
    emblem: NEUTRAL_EMBLEM,
  },
  gold: {
    base: NEUTRAL_FACE,
    edge: '#d4a017',
    highlight: '#ffe29a',
    emblem: NEUTRAL_EMBLEM,
  },
  platinum: {
    base: NEUTRAL_FACE,
    edge: '#6a5ab8',
    highlight: '#cac0f0',
    emblem: NEUTRAL_EMBLEM,
  },
  legendary: {
    base: NEUTRAL_FACE,
    edge: '#c72e7a',
    highlight: '#ffb8a8',
    emblem: NEUTRAL_EMBLEM,
  },
};

const GHOST_PALETTE: FinishPalette = {
  base: '#e2e4e8',
  edge: '#a8acb3',
  highlight: '#f3f4f6',
  emblem: '#6b7280',
};

/**
 * Tier-5 sparkle particles. Positions are relative to the -20%/+120% sparkle
 * overlay; each particle has a staggered animation-delay.
 */
const SPARKLE_POSITIONS: Array<{ cx: number; cy: number; r: number; delay: number }> = [
  { cx: 14, cy: 14, r: 1.4, delay: 0.0 },
  { cx: 86, cy: 22, r: 1.6, delay: 0.3 },
  { cx: 92, cy: 68, r: 1.2, delay: 0.6 },
  { cx: 72, cy: 92, r: 1.5, delay: 0.9 },
  { cx: 22, cy: 90, r: 1.3, delay: 1.2 },
  { cx: 6, cy: 52, r: 1.4, delay: 1.5 },
];

export function MedalBadge({
  tier,
  emblem,
  size,
  halo = 'none',
  animate = 'static',
  tooltip,
  onClick,
  ghost = false,
}: MedalBadgeProps) {
  const finish = getBadgeFinish(tier);
  const palette = ghost ? GHOST_PALETTE : FINISH_PALETTES[finish];
  const effectiveHalo: MedalHalo = ghost ? 'none' : halo === 'auto' ? (tier >= 3 ? 'auto' : 'none') : halo;
  const showSparkles = animate === 'hero' && tier === 5 && !ghost;
  const emblemSize = Math.round(size * 0.62);
  const rootRef = useRef<HTMLSpanElement>(null);

  // Remove .entering after animation so subsequent re-renders don't replay.
  useEffect(() => {
    if (animate !== 'hero' || !rootRef.current) return;
    const el = rootRef.current;
    const t = window.setTimeout(() => {
      el.classList.remove(classes.entering);
    }, 900);
    return () => window.clearTimeout(t);
  }, [animate]);

  const rootClass = [
    classes.root,
    onClick ? classes.clickable : '',
    effectiveHalo !== 'none' ? classes.halo : '',
    effectiveHalo === 'legendary' ? classes.haloLegendary : '',
    animate === 'hero' ? classes.hero : '',
    animate === 'hero' ? classes.entering : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Custom properties consumed by the CSS module. Cast once via `as` since
  // React.CSSProperties doesn't know about arbitrary `--*` keys.
  const rootStyle = {
    width: size,
    height: size,
    '--finish-base': palette.base,
    '--finish-edge': palette.edge,
    '--finish-highlight': palette.highlight,
    '--finish-emblem': palette.emblem,
  } as React.CSSProperties;

  const content = (
    <span
      ref={rootRef}
      className={rootClass}
      style={rootStyle}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <span className={classes.emblem}>
        <MedalEmblem emblem={ghost ? 'ghost' : emblem} size={emblemSize} />
      </span>
      {showSparkles && (
        <svg
          className={classes.sparkles}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {SPARKLE_POSITIONS.map((p, i) => (
            <circle
              key={i}
              className={classes.sparkle}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              style={{ animationDelay: `${p.delay}s` }}
            />
          ))}
        </svg>
      )}
    </span>
  );

  if (tooltip) {
    return (
      <Tooltip label={tooltip} withArrow openDelay={200}>
        {content}
      </Tooltip>
    );
  }
  return content;
}
