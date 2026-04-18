import { ActionIcon, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import {
  IconEdit,
  IconTrash,
  IconGripVertical,
} from '@tabler/icons-react';
import type { CSSProperties, HTMLAttributes } from 'react';
import type { Stop, StopLocation, TransitMode } from '../../../../../shared/types';
import { stopIcon } from './stopIcons';

const MODE_LABEL: Record<TransitMode, string> = {
  drive: 'Drive',
  flight: 'Flight',
  train: 'Train',
  walk: 'Walk',
  shuttle: 'Shuttle',
  other: 'Transit',
};

interface StopCardProps {
  stop: Stop;
  onEdit?: (stop: Stop) => void;
  onDelete?: (stop: Stop) => void;
  /** Drag handle props from @hello-pangea/dnd, when the card is reorderable. */
  dragHandleProps?: HTMLAttributes<HTMLDivElement> | null;
  /** Whether to show the drag handle (only untimed stops are draggable). */
  showDragHandle?: boolean;
}

function locationLabel(loc: StopLocation | null): string | null {
  if (!loc) return null;
  return loc.label;
}

function primaryText(stop: Stop): string {
  if (stop.type === 'transit') {
    return MODE_LABEL[stop.mode];
  }
  return stop.name;
}

function secondaryText(stop: Stop): string | null {
  if (stop.type === 'transit') {
    const from = locationLabel(stop.fromLocation);
    const to = locationLabel(stop.toLocation);
    if (from && to) return `${from} → ${to}`;
    if (to) return `→ ${to}`;
    if (from) return `from ${from}`;
    return null;
  }
  if (stop.type === 'stay') {
    return locationLabel(stop.location);
  }
  return locationLabel(stop.location);
}

export function StopCard({
  stop,
  onEdit,
  onDelete,
  dragHandleProps,
  showDragHandle,
}: StopCardProps) {
  const Icon = stopIcon(stop);
  const time = stop.time;
  const secondary = secondaryText(stop);

  const cardStyle: CSSProperties = {
    paddingInline: 'var(--mantine-spacing-sm)',
    paddingBlock: 'var(--mantine-spacing-xs)',
  };

  return (
    <Paper withBorder radius="md" style={cardStyle}>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        {showDragHandle && (
          <div
            {...(dragHandleProps ?? {})}
            aria-label="Reorder stop"
            style={{
              cursor: 'grab',
              color: 'var(--mantine-color-dimmed)',
              paddingTop: 2,
              touchAction: 'none',
            }}
          >
            <IconGripVertical size={14} />
          </div>
        )}

        <Icon
          size={18}
          style={{ color: 'var(--mantine-color-blue-5)', marginTop: 2, flexShrink: 0 }}
        />

        <div style={{ width: 56, flexShrink: 0 }}>
          <Text size="sm" c={time ? undefined : 'dimmed'} fw={time ? 500 : 400}>
            {time ?? '—'}
          </Text>
        </div>

        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500} truncate>
            {primaryText(stop)}
          </Text>
          {secondary && (
            <Text size="xs" c="dimmed" truncate>
              {secondary}
            </Text>
          )}
          {stop.notes && (
            <Text size="xs" c="dimmed" lineClamp={2} style={{ fontStyle: 'italic' }}>
              {stop.notes}
            </Text>
          )}
        </Stack>

        <Group gap={4} wrap="nowrap" style={{ alignSelf: 'center' }}>
          {onEdit && (
            <Tooltip label="Edit stop">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="blue"
                onClick={() => onEdit(stop)}
                aria-label="Edit stop"
              >
                <IconEdit size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip label="Delete stop">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                onClick={() => onDelete(stop)}
                aria-label="Delete stop"
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
