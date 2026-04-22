/**
 * Hero modal shown when a user unlocks a badge (every tier — BRD §4.5 /
 * REQ-L-015). Stays open until the user dismisses it. Rendered at most one
 * at a time; the queue hook orchestrates sequencing between modals.
 *
 * Visual: 240px metallic MedalBadge at hero size with scale-rotate entry +
 * ambient shimmer + glow-pulse halo + tier-5 sparkle particles. Audio +
 * confetti are fired by the queue hook when this modal's `unlock` changes.
 */

import { Button, Stack, Text, Title } from '@mantine/core';
import { ResponsiveModal } from '../ResponsiveModal';
import { getAutoLabel } from '../../../../shared/utils/leaderboardBadgeSlots';
import { MedalBadge } from './MedalBadge';
import type { QueuedHeroUnlock } from '../../hooks/useBadgeHeroQueue';

const HERO_MEDAL_SIZE = 240;

interface BadgeHeroModalProps {
  opened: boolean;
  onClose: () => void;
  unlock: QueuedHeroUnlock | null;
  displayName: string;
}

function interpolateCelebrationCopy(template: string, displayName: string): string {
  return template.replace(/\{displayName\}/g, displayName);
}

export function BadgeHeroModal({
  opened,
  onClose,
  unlock,
  displayName,
}: BadgeHeroModalProps) {
  if (!unlock) return null;
  const { def } = unlock;
  const label = getAutoLabel(def);
  const body = interpolateCelebrationCopy(def.celebrationCopy, displayName);

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape
      centered
      size="sm"
      overlayProps={{ blur: 4, backgroundOpacity: 0.7 }}
      transitionProps={{ transition: 'pop', duration: 250 }}
    >
      <Stack align="center" gap="md" py="md">
        <MedalBadge
          tier={def.tier}
          emblem={def.category}
          size={HERO_MEDAL_SIZE}
          halo={def.tier >= 3 ? 'auto' : 'none'}
          animate="hero"
        />
        <Stack align="center" gap={6}>
          <Title order={2} ta="center">
            {displayName}, you&rsquo;ve earned {label}!
          </Title>
          <Text ta="center" c="dimmed" px="xs">
            {body}
          </Text>
        </Stack>
        <Button
          fullWidth
          variant="gradient"
          gradient={{ from: 'yellow.5', to: 'orange.6', deg: 135 }}
          onClick={onClose}
        >
          {def.tier === 5 ? 'Heck YES!' : 'Heck yeah!'}
        </Button>
      </Stack>
    </ResponsiveModal>
  );
}
