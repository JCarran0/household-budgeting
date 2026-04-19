/**
 * Celebration pipeline for a newly earned badge:
 *   1. Fanfare (Web Audio synth — no asset pipeline)
 *   2. Confetti (canvas-confetti, one palette v1)
 *   3. Toast (Mantine notification)
 *
 * Called from `useNewBadgeCelebrations` once per newly-detected earnedAt.
 */

import confetti from 'canvas-confetti';
import { notifications } from '@mantine/notifications';
import type { BadgeDefinition } from '../../../shared/types';
import { BADGE_DISPLAY } from '../components/tasks/badgeCatalog';
import { playBadgeFanfare } from './completionSound';

export function celebrateBadgeUnlock(
  badge: BadgeDefinition,
  origin?: { x: number; y: number }
): void {
  playBadgeFanfare();

  confetti({
    particleCount: 80,
    spread: 60,
    startVelocity: 35,
    origin: origin ?? { x: 0.5, y: 0.35 },
  });

  const display = BADGE_DISPLAY[badge.id];
  notifications.show({
    title: `${display.glyph} ${badge.label} unlocked!`,
    message: badge.description,
    color: display.color,
    autoClose: 6000,
  });
}
