import { Button, Center, Paper, Stack, Text, ThemeIcon, Group, Anchor } from '@mantine/core';
import { IconBed, IconPlane, IconTemplate } from '@tabler/icons-react';

interface ItineraryEmptyStateProps {
  onAddStay: () => void;
  onFlyFirst: () => void;
  onUseTemplate: () => void;
}

/**
 * First-run empty state for the Itinerary tab (REQ-038 / REQ-039).
 * Stay-first because a Stay anchors the day-by-day agenda — without one,
 * everything else floats in uncovered days.
 */
export function ItineraryEmptyState({
  onAddStay,
  onFlyFirst,
  onUseTemplate,
}: ItineraryEmptyStateProps) {
  return (
    <Center py="xl">
      <Paper p="xl" radius="md" withBorder style={{ maxWidth: 480, textAlign: 'center' }}>
        <Stack align="center" gap="md">
          <ThemeIcon size={64} radius="xl" variant="light" color="blue">
            <IconBed size={32} />
          </ThemeIcon>
          <Stack align="center" gap={4}>
            <Text fw={600} size="lg">
              Where are you staying?
            </Text>
            <Text size="sm" c="dimmed">
              Adding a place to stay anchors your trip.
            </Text>
          </Stack>
          <Button size="md" onClick={onAddStay} leftSection={<IconBed size={16} />}>
            + Add a Stay
          </Button>
          <Group gap="xs" justify="center">
            <Anchor component="button" size="sm" onClick={onFlyFirst}>
              <Group gap={4}>
                <IconPlane size={14} />
                <span>I'm flying first</span>
              </Group>
            </Anchor>
            <Text size="sm" c="dimmed">
              ·
            </Text>
            <Anchor component="button" size="sm" onClick={onUseTemplate}>
              <Group gap={4}>
                <IconTemplate size={14} />
                <span>Use template</span>
              </Group>
            </Anchor>
          </Group>
        </Stack>
      </Paper>
    </Center>
  );
}
