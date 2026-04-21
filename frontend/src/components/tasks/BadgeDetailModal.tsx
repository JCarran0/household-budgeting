/**
 * Per-member badge detail modal — full 13-badge grid grouped by category.
 *
 * Earned badges show glyph + tooltip (description + earned date).
 * Unearned badges render as ???? placeholders with NO tooltip (REQ-L-012) —
 * their category header gives just enough directional signal.
 */

import {
  Group,
  Stack,
  Avatar,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { ResponsiveModal } from '../ResponsiveModal';
import { format, parseISO } from 'date-fns';
import type { BadgeCategory, BadgeDefinition, LeaderboardEntry } from '../../../../shared/types';
import { BADGE_CATALOG } from '../../../../shared/types';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './badgeCatalog';
import { BadgeIcon } from './BadgeIcon';
import { userColor } from '../../utils/userColor';

const BADGE_TILE_WIDTH = 72;

interface BadgeDetailModalProps {
  opened: boolean;
  onClose: () => void;
  entry: LeaderboardEntry;
}

function badgesByCategory(category: BadgeCategory): BadgeDefinition[] {
  return BADGE_CATALOG.filter((b) => b.category === category).sort(
    (a, b) => a.order - b.order
  );
}

export function BadgeDetailModal({ opened, onClose, entry }: BadgeDetailModalProps) {
  const earnedMap = new Map(entry.earnedBadges.map((b) => [b.id, b.earnedAt]));

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm">
          <Avatar size="md" radius="xl" color={userColor(entry)}>
            {entry.displayName.charAt(0).toUpperCase()}
          </Avatar>
          <Stack gap={0}>
            <Text fw={600}>{entry.displayName}</Text>
            <Text size="xs" c="dimmed">
              {entry.earnedBadges.length} of {BADGE_CATALOG.length} earned
            </Text>
          </Stack>
        </Group>
      }
      size="md"
      centered
    >
      <Stack gap="md">
        {CATEGORY_ORDER.map((cat) => {
          const defs = badgesByCategory(cat);
          return (
            <Stack key={cat} gap={6}>
              <Text fw={600} size="xs" tt="uppercase" c="dimmed">
                {CATEGORY_LABELS[cat]}
              </Text>
              <Group gap="sm" wrap="wrap">
                {defs.map((def) => {
                  const earnedAt = earnedMap.get(def.id);
                  if (earnedAt !== undefined) {
                    const when = format(parseISO(earnedAt), 'MMM d, yyyy');
                    return (
                      <Tooltip
                        key={def.id}
                        label={`${def.description} — Earned ${when}`}
                        withArrow
                        openDelay={200}
                      >
                        <Stack gap={2} align="center" style={{ width: BADGE_TILE_WIDTH }}>
                          <BadgeIcon id={def.id} size={44} glyphSize="lg" />
                          <Text size="xs" ta="center" lineClamp={1}>
                            {def.label}
                          </Text>
                        </Stack>
                      </Tooltip>
                    );
                  }
                  return (
                    <Stack key={def.id} gap={2} align="center" style={{ width: BADGE_TILE_WIDTH }}>
                      <ThemeIcon variant="light" color="gray" radius="xl" size={44}>
                        <Text size="sm" c="dimmed" fw={700} lh={1}>
                          ????
                        </Text>
                      </ThemeIcon>
                      <Text size="xs" ta="center" c="dimmed">
                        ????
                      </Text>
                    </Stack>
                  );
                })}
              </Group>
            </Stack>
          );
        })}
      </Stack>
    </ResponsiveModal>
  );
}
