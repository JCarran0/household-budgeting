import { ActionIcon, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconBed, IconEdit } from '@tabler/icons-react';
import type { StayStop } from '../../../../../shared/types';
import { PlacePhotoThumb } from './PlacePhotoThumb';

interface StayBannerProps {
  stay: StayStop;
  /** Total nights the stay covers (inclusive). */
  totalNights: number;
  onEdit?: (stay: StayStop) => void;
}

/**
 * Rendered once per unique Stay, positioned above the first day the Stay
 * covers. Days within the Stay do not repeat the banner (REQ-023).
 */
export function StayBanner({ stay, totalNights, onEdit }: StayBannerProps) {
  const nightsLabel = totalNights === 1 ? '1 night' : `${totalNights} nights`;

  return (
    <Paper
      radius="md"
      p="sm"
      withBorder
      data-stop-id={stay.id}
      style={{
        background: 'var(--mantine-color-blue-light)',
        borderColor: 'var(--mantine-color-blue-outline)',
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          {stay.location.photoName ? (
            <PlacePhotoThumb
              photoName={stay.location.photoName}
              attribution={stay.location.photoAttribution ?? null}
              size={48}
              alt={stay.name}
            />
          ) : (
            <IconBed size={20} color="var(--mantine-color-blue-filled)" />
          )}
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text fw={600} truncate>
              {stay.name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {stay.location.label} · {nightsLabel}
            </Text>
          </Stack>
        </Group>
        {onEdit && (
          <Tooltip label="Edit stay">
            <ActionIcon
              variant="subtle"
              color="blue"
              onClick={() => onEdit(stay)}
              aria-label="Edit stay"
            >
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Paper>
  );
}
