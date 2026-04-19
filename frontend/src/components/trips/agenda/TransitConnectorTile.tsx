import { ActionIcon, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { format } from 'date-fns';
import type { TransitStop } from '../../../../../shared/types';
import { transitIcon } from './stopIcons';

const MODE_LABEL: Record<TransitStop['mode'], string> = {
  drive: 'Drive',
  flight: 'Flight',
  train: 'Train',
  walk: 'Walk',
  shuttle: 'Shuttle',
  other: 'Transit',
};

interface TransitConnectorTileProps {
  transit: TransitStop;
  onEdit?: (transit: TransitStop) => void;
  onDelete?: (transit: TransitStop) => void;
}

function formatDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-').map(Number);
    return format(new Date(y, m - 1, d), 'EEE, MMM d');
  } catch {
    return iso;
  }
}

function formatDuration(min: number | null): string | null {
  if (min === null || min <= 0) return null;
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Full-width tile rendered between two Stay chapters for a base-change Transit
 * (REQ-026). The visual emphasis signals "you are moving bases" vs. an inline
 * day-trip excursion.
 */
export function TransitConnectorTile({ transit, onEdit, onDelete }: TransitConnectorTileProps) {
  const Icon = transitIcon(transit.mode);
  const from = transit.fromLocation?.label ?? null;
  const to = transit.toLocation?.label ?? null;
  const duration = formatDuration(transit.durationMinutes);

  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      data-stop-id={transit.id}
      style={{
        borderStyle: 'dashed',
        background: 'var(--mantine-color-dark-7)',
      }}
    >
      <Group justify="space-between" wrap="nowrap" align="center">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Icon size={20} style={{ color: 'var(--mantine-color-gray-5)' }} />
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} size="sm">
                {MODE_LABEL[transit.mode]}
              </Text>
              <Text size="xs" c="dimmed">
                {formatDate(transit.date)}
                {transit.time ? ` · ${transit.time}` : ''}
                {duration ? ` · ${duration}` : ''}
              </Text>
            </Group>
            {(from || to) && (
              <Text size="xs" c="dimmed" truncate>
                {from ?? '…'} → {to ?? '…'}
              </Text>
            )}
          </Stack>
        </Group>
        <Group gap={4} wrap="nowrap">
          {onEdit && (
            <Tooltip label="Edit transit">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="blue"
                onClick={() => onEdit(transit)}
                aria-label="Edit transit"
              >
                <IconEdit size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip label="Delete transit">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                onClick={() => onDelete(transit)}
                aria-label="Delete transit"
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
    </Paper>
  );
}
