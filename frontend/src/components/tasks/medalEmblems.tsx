/**
 * Per-category SVG emblems for the leaderboard medal system. 15 categories +
 * a `ghost` variant for untouched-category placeholders. Emblems inherit
 * `currentColor` so the MedalBadge chassis controls fill, and scale cleanly
 * from 28px (row slot) to 240px (hero modal) via viewBox.
 *
 * Lucide/Tabler-style path data hand-simplified to keep the emblem library
 * inline and tree-shakeable. Swapping to designed artwork is a zero-code
 * change — replace the paths.
 */

import type { ReactElement, ReactNode } from 'react';
import type { BadgeCategory } from '../../../../shared/types';

export type EmblemKey = BadgeCategory | 'ghost';

interface MedalEmblemProps {
  emblem: EmblemKey;
  size: number;
}

const STROKE = 'currentColor';
const STROKE_WIDTH = 1.8;

function wrap(children: ReactNode, size: number): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={STROKE}
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function MedalEmblem({ emblem, size }: MedalEmblemProps): ReactElement {
  switch (emblem) {
    case 'volume':
      // Lightning bolt
      return wrap(<path d="M13 2 L4 14 h7 l-1 8 l9-12 h-7 l1-8 z" />, size);

    case 'consistency':
      // Calendar-check
      return wrap(
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10 h18" />
          <path d="M8 3 v4" />
          <path d="M16 3 v4" />
          <path d="M9 15 l2 2 l4-4" />
        </>,
        size
      );

    case 'streak':
      // Flame
      return wrap(
        <path d="M12 2 c3 4 6 6 6 11 a6 6 0 0 1 -12 0 c0-3 2-4 3-7 c1 2 2 2 3 4 z" />,
        size
      );

    case 'lifetime':
      // Trophy
      return wrap(
        <>
          <path d="M6 4 h12 v4 a6 6 0 0 1 -12 0 z" />
          <path d="M6 6 h-2 a2 2 0 0 0 0 4 h2" />
          <path d="M18 6 h2 a2 2 0 0 1 0 4 h-2" />
          <path d="M10 14 h4 v3 h-4 z" />
          <path d="M8 20 h8" />
        </>,
        size
      );

    case 'weekday_warrior':
      // Briefcase
      return wrap(
        <>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7 V5 a2 2 0 0 1 2-2 h2 a2 2 0 0 1 2 2 V7" />
          <path d="M3 12 h18" />
        </>,
        size
      );

    case 'night_owl':
      // Crescent moon
      return wrap(<path d="M20 14 a8 8 0 1 1 -10-10 a6 6 0 0 0 10 10 z" />, size);

    case 'early_bird':
      // Sunrise
      return wrap(
        <>
          <path d="M3 18 h18" />
          <path d="M5 14 a7 7 0 0 1 14 0" />
          <path d="M12 4 V2" />
          <path d="M5 8 L3.5 6.5" />
          <path d="M19 8 L20.5 6.5" />
        </>,
        size
      );

    case 'power_hour':
      // Stopwatch
      return wrap(
        <>
          <circle cx="12" cy="14" r="7" />
          <path d="M12 14 V10" />
          <path d="M12 14 L15 14" />
          <path d="M10 3 h4" />
          <path d="M12 3 V5" />
        </>,
        size
      );

    case 'clean_sweep':
      // Broom
      return wrap(
        <>
          <path d="M3 21 L10 14" />
          <path d="M14 10 L21 3" />
          <path d="M9 15 L15 9 l-1-1 l-6 6 z" fill={STROKE} />
          <path d="M8 16 L4 21" />
          <path d="M10 18 L7 21" />
          <path d="M12 20 L10 21" />
        </>,
        size
      );

    case 'spring_cleaner':
      // Sprout
      return wrap(
        <>
          <path d="M12 20 V10" />
          <path d="M12 10 a6 6 0 0 0 -6 -6 a6 6 0 0 0 6 6 z" />
          <path d="M12 10 a6 6 0 0 1 6 -4 a6 6 0 0 1 -6 4 z" />
        </>,
        size
      );

    case 'holiday_hero':
      // Evergreen + star
      return wrap(
        <>
          <path d="M12 3 L6 10 h3 L5 15 h4 L4 20 h16 l-5-5 h4 l-4-5 h3 z" />
          <circle cx="12" cy="4" r="0.8" fill={STROKE} />
        </>,
        size
      );

    case 'phoenix':
      // Flame-rising / upward feather
      return wrap(
        <>
          <path d="M12 2 L6 10 l4-1 l-3 7 l5-1 l-2 7 l6-8 l-4 1 l3-7 l-5 1 z" />
        </>,
        size
      );

    case 'clutch':
      // Hourglass
      return wrap(
        <>
          <path d="M6 3 h12" />
          <path d="M6 21 h12" />
          <path d="M6 3 c0 5 12 5 12 18" />
          <path d="M18 3 c0 5 -12 5 -12 18" />
        </>,
        size
      );

    case 'partner_in_crime':
      // Handshake / two people
      return wrap(
        <>
          <circle cx="7" cy="7" r="3" />
          <circle cx="17" cy="7" r="3" />
          <path d="M2 20 c0-4 3-6 5-6 s2 1 5 1 s3-1 5-1 c2 0 5 2 5 6" />
        </>,
        size
      );

    case 'comeback_kid':
      // Curved comeback arrow
      return wrap(
        <>
          <path d="M4 16 c0-6 4-10 10-10 h4" />
          <path d="M16 3 l4 3 l-4 3" />
          <path d="M8 20 L4 16 l4-4" />
        </>,
        size
      );

    case 'ghost':
    default:
      // Question marks
      return wrap(
        <>
          <path d="M9 9 a3 3 0 1 1 6 0 c0 2 -3 2 -3 5" />
          <circle cx="12" cy="17" r="0.8" fill={STROKE} />
        </>,
        size
      );
  }
}
