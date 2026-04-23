/**
 * Confetti-only celebration helper for badge unlocks (BRD §5 / plan D38).
 *
 * Audio + notification side effects moved to `useBadgeHeroQueue` — this
 * helper is purely visual. Pattern escalates by tier:
 *   - 1-2: centered upper cone
 *   - 3:   dual-cannon from left + right screen edges
 *   - 4:   dual-cannon + center burst from above
 *   - 5:   dual-cannon + center burst + a second wave (incl. 360° explosion)
 * `isFinal` applies a 1.4× particle multiplier on top so the last modal in
 * a cascade still hits harder than the same tier mid-cascade.
 */

import confetti from 'canvas-confetti';
import type { Options as ConfettiOptions } from 'canvas-confetti';
import type { Finish, Tier } from '../../../shared/utils/leaderboardBadgeSlots';

const PALETTE_BY_FINISH: Record<Finish, string[]> = {
  bronze: ['#b07a42', '#e0a870', '#8a5822', '#f4c79c'],
  silver: ['#c9ccd1', '#e6e8eb', '#8a8f99', '#ffffff'],
  gold: ['#e7b93a', '#f2d061', '#a87c18', '#fff3c0'],
  platinum: ['#e4ecf3', '#c7d3dc', '#a1b4c2', '#ffffff'],
  legendary: ['#ff6ec7', '#7bdff2', '#ffe66d', '#b48bff', '#fff3b3'],
};

/*
 * Mantine Modal renders at z-index 200+ with a blurred 70%-opacity overlay;
 * canvas-confetti defaults to z-index 100, so without this the confetti
 * fires but is obscured entirely by the overlay. 9999 clears everything.
 */
const CONFETTI_Z_INDEX = 9999;

function burst(opts: ConfettiOptions): void {
  confetti({ ...opts, zIndex: CONFETTI_Z_INDEX });
}

function scaled(count: number, isFinal: boolean): number {
  return Math.round(count * (isFinal ? 1.4 : 1));
}

export function celebrateConfetti(
  finish: Finish,
  tier: Tier,
  isFinal: boolean
): void {
  const colors = PALETTE_BY_FINISH[finish];

  // Tier 1-2: modest centered cone from upper area.
  if (tier <= 2) {
    burst({
      particleCount: scaled(90, isFinal),
      spread: 75,
      startVelocity: 40,
      origin: { x: 0.5, y: 0.3 },
      colors,
      ticks: 200,
    });
    return;
  }

  // Tier 3+: dual side-cannon — shot from left & right bottom corners up
  // and inward, covering the full screen width.
  const sideCount = tier === 3 ? 90 : tier === 4 ? 110 : 130;
  burst({
    particleCount: scaled(sideCount, isFinal),
    angle: 60,
    spread: tier >= 4 ? 75 : 65,
    startVelocity: 60,
    origin: { x: 0, y: 0.75 },
    colors,
    ticks: 280,
  });
  burst({
    particleCount: scaled(sideCount, isFinal),
    angle: 120,
    spread: tier >= 4 ? 75 : 65,
    startVelocity: 60,
    origin: { x: 1, y: 0.75 },
    colors,
    ticks: 280,
  });

  // Tier 4+: add a wide center-top burst for vertical density.
  if (tier >= 4) {
    burst({
      particleCount: scaled(140, isFinal),
      spread: 110,
      startVelocity: 45,
      origin: { x: 0.5, y: 0.25 },
      colors,
      ticks: 260,
    });
  }

  // Tier 5: a second wave after 350ms — the cascade crescendo.
  if (tier >= 5) {
    window.setTimeout(() => {
      burst({
        particleCount: scaled(100, isFinal),
        angle: 60,
        spread: 80,
        startVelocity: 55,
        origin: { x: 0, y: 0.75 },
        colors,
      });
      burst({
        particleCount: scaled(100, isFinal),
        angle: 120,
        spread: 80,
        startVelocity: 55,
        origin: { x: 1, y: 0.75 },
        colors,
      });
      // 360° center explosion for the legendary finale.
      burst({
        particleCount: scaled(220, isFinal),
        spread: 360,
        startVelocity: 30,
        origin: { x: 0.5, y: 0.5 },
        colors,
        ticks: 320,
      });
    }, 350);

    // Streamers cascade: 1s delay so it begins while the confetti is still
    // in the air. Particles are oversized squares with low startVelocity +
    // reduced gravity + drift — they fall as a gentle curtain from 6 points
    // across the top, staggered 90ms apart for a left-to-right sweep.
    window.setTimeout(() => {
      const columns = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85];
      columns.forEach((x, i) => {
        window.setTimeout(() => {
          burst({
            particleCount: scaled(32, isFinal),
            angle: 270,
            spread: 55,
            startVelocity: 18,
            gravity: 0.6,
            drift: (Math.random() - 0.5) * 1.6,
            ticks: 520,
            origin: { x, y: -0.05 },
            scalar: 1.5,
            shapes: ['square'],
            colors,
          });
        }, i * 90);
      });
    }, 1000);
  }
}

/**
 * Back-compat re-export under the old name. Prefer `celebrateConfetti`.
 */
export const celebrateBadgeUnlock = celebrateConfetti;
