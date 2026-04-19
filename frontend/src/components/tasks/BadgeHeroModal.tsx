/**
 * Hero modal shown when a user unlocks a final-tier badge — the four
 * once-in-a-lifetime moments per category. Stays open until the user
 * dismisses it explicitly (no auto-close), so the moment lands.
 */

import { Button, Modal, Stack, Text, Title } from '@mantine/core';
import type { BadgeDefinition } from '../../../../shared/types';
import { BadgeIcon } from './BadgeIcon';

interface BadgeHeroModalProps {
  opened: boolean;
  onClose: () => void;
  badge: BadgeDefinition | null;
  displayName: string;
}

export function BadgeHeroModal({
  opened,
  onClose,
  badge,
  displayName,
}: BadgeHeroModalProps) {
  if (!badge) return null;
  return (
    <Modal
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
        <BadgeIcon id={badge.id} size={120} glyphSize="xl" />
        <Stack align="center" gap={4}>
          <Title order={2} ta="center">
            {badge.label}
          </Title>
          <Text ta="center" c="dimmed">
            {displayName}, {badge.description.toLowerCase()}.
          </Text>
        </Stack>
        <Button
          fullWidth
          variant="gradient"
          gradient={{ from: 'yellow.5', to: 'orange.6', deg: 135 }}
          onClick={onClose}
        >
          Heck yeah!
        </Button>
      </Stack>
    </Modal>
  );
}
