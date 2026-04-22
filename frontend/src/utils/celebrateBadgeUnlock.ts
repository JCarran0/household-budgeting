/**
 * Confetti-only celebration helper for badge unlocks (BRD §5 / plan D38).
 *
 * Audio + notification side effects moved to `useBadgeHeroQueue` — this
 * helper is now purely visual. The final modal of a queue gets a bigger
 * burst with a finish-tinted palette; non-final modals get a smaller burst.
 */

import confetti from 'canvas-confetti';
import type { Finish } from '../../../shared/utils/leaderboardBadgeSlots';

const PALETTE_BY_FINISH: Record<Finish, string[]> = {
  bronze: ['#b07a42', '#e0a870', '#8a5822', '#f4c79c'],
  silver: ['#c9ccd1', '#e6e8eb', '#8a8f99', '#ffffff'],
  gold: ['#e7b93a', '#f2d061', '#a87c18', '#fff3c0'],
  platinum: ['#e4ecf3', '#c7d3dc', '#a1b4c2', '#ffffff'],
  legendary: ['#ff6ec7', '#7bdff2', '#ffe66d', '#b48bff', '#fff3b3'],
};

export function celebrateConfetti(
  finish: Finish,
  isFinal: boolean,
  origin?: { x: number; y: number }
): void {
  const colors = PALETTE_BY_FINISH[finish];
  confetti({
    particleCount: isFinal ? 160 : 60,
    spread: isFinal ? 90 : 55,
    startVelocity: isFinal ? 45 : 32,
    origin: origin ?? { x: 0.5, y: 0.35 },
    colors,
    ticks: isFinal ? 220 : 150,
  });
}

/**
 * Back-compat re-export under the old name for any lingering callers. Prefer
 * `celebrateConfetti` in new code.
 */
export const celebrateBadgeUnlock = celebrateConfetti;
