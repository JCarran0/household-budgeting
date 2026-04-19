/**
 * Per-row badge slot area for the leaderboard.
 *
 * Selection rule:
 *   1. For each category, pick the user's highest-tier earned badge.
 *   2. If all 4 categories are represented, drop Consistency first.
 *   3. Tie-break by earnedAt DESC; trim to at most 3.
 *
 * Rows render fewer than 3 badges when the user has fewer than 3 categories
 * earned. Ghost ???? placeholders live only in the per-member detail modal.
 *
 * Click handling lives on the parent row — this component is purely visual.
 */

import { Group, Tooltip } from '@mantine/core';
import type { EarnedBadge } from '../../../../shared/types';
import { selectBadgeSlots } from '../../../../shared/utils/leaderboardBadgeSlots';
import { BadgeIcon } from './BadgeIcon';

const ROW_MIN_HEIGHT = 28;

interface BadgeSlotAreaProps {
  earnedBadges: EarnedBadge[];
}

export function BadgeSlotArea({ earnedBadges }: BadgeSlotAreaProps) {
  const slots = selectBadgeSlots(earnedBadges);
  return (
    <Group gap={4} wrap="nowrap" style={{ minHeight: ROW_MIN_HEIGHT }}>
      {slots.map((slot) => (
        <Tooltip
          key={slot.def.id}
          label={slot.def.description}
          withArrow
          openDelay={200}
        >
          <span>
            <BadgeIcon id={slot.def.id} size="md" glyphSize="sm" />
          </span>
        </Tooltip>
      ))}
    </Group>
  );
}
