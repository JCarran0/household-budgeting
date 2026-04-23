/**
 * Per-row badge slot area for the leaderboard.
 *
 * Score-based selection (BRD §5.1 / plan D29): highest-scoring earned badge
 * per category is the representative; top 3 representatives by
 * `rarity + recencyBoost` populate the row. Fewer than 3 earned categories
 * = fewer rendered medals — no ghost placeholders on the row (D30).
 *
 * The caller passes `now` so recency boost is stable within a single render.
 */

import { Group, Text, Tooltip } from '@mantine/core';
import { BADGE_CATALOG, type EarnedBadge } from '../../../../shared/types';
import { selectBadgeSlots } from '../../../../shared/utils/leaderboardBadgeSlots';
import { MedalBadge } from './MedalBadge';

const ROW_MIN_HEIGHT = 32;
const ROW_MEDAL_SIZE = 32;

interface BadgeSlotAreaProps {
  earnedBadges: EarnedBadge[];
  now: Date;
}

export function BadgeSlotArea({ earnedBadges, now }: BadgeSlotAreaProps) {
  const slots = selectBadgeSlots(earnedBadges, now);
  const total = BADGE_CATALOG.length;
  const earned = earnedBadges.length;
  return (
    <Group gap={6} wrap="nowrap" justify="center" style={{ minHeight: ROW_MIN_HEIGHT }}>
      {slots.map((slot) => (
        <MedalBadge
          key={slot.def.id}
          tier={slot.def.tier}
          emblem={slot.def.category}
          size={ROW_MEDAL_SIZE}
          halo="auto"
          tooltip={slot.def.description}
        />
      ))}
      {earned > 0 && (
        <Tooltip label={`${earned} of ${total} earned`} withArrow openDelay={200}>
          <Text size="xs" c="dimmed" fw={500} style={{ cursor: 'help' }}>
            {earned}
          </Text>
        </Tooltip>
      )}
    </Group>
  );
}
