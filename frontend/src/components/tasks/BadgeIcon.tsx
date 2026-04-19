/**
 * Shared visual presentation for an earned badge. Renders a circular tile
 * with the badge's glyph; final-tier badges get the special gold gradient
 * + soft halo treatment that persists every time the badge is shown.
 */

import { ThemeIcon, Text, type MantineSize } from '@mantine/core';
import type { BadgeId } from '../../../../shared/types';
import { isFinalTierBadge } from '../../../../shared/utils/leaderboardBadgeSlots';
import { BADGE_DISPLAY } from './badgeCatalog';

interface BadgeIconProps {
  id: BadgeId;
  /** ThemeIcon size — accepts named tokens or pixels. */
  size?: MantineSize | number;
  /** Text glyph size — Mantine `Text` only accepts the named tokens. */
  glyphSize?: MantineSize;
}

const GOLD_HALO_BOX_SHADOW =
  '0 0 0 2px rgba(255, 215, 0, 0.45), 0 4px 12px rgba(255, 165, 0, 0.35)';

export function BadgeIcon({ id, size = 'md', glyphSize = 'sm' }: BadgeIconProps) {
  const display = BADGE_DISPLAY[id];
  const final = isFinalTierBadge(id);

  if (final) {
    return (
      <ThemeIcon
        variant="gradient"
        gradient={{ from: 'yellow.4', to: 'orange.6', deg: 135 }}
        radius="xl"
        size={size}
        style={{ boxShadow: GOLD_HALO_BOX_SHADOW }}
      >
        <Text size={glyphSize} lh={1}>
          {display.glyph}
        </Text>
      </ThemeIcon>
    );
  }

  return (
    <ThemeIcon variant="light" color={display.color} radius="xl" size={size}>
      <Text size={glyphSize} lh={1}>
        {display.glyph}
      </Text>
    </ThemeIcon>
  );
}
