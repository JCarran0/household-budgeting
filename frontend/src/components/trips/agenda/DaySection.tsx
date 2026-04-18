import {
  ActionIcon,
  Badge,
  Button,
  Collapse,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { format } from 'date-fns';
import type { Stop } from '../../../../../shared/types';
import { StopCard } from './StopCard';

interface DaySectionProps {
  /** ISO date YYYY-MM-DD */
  date: string;
  /** Position within the trip (1 = trip.startDate). Null for pre-trip days. */
  dayIndex: number | null;
  /** Stops happening on this day (excluding Stay banners and base-change transits). */
  stops: Stop[];
  collapsed: boolean;
  onToggle: () => void;
  isToday: boolean;
  isOutsideNominalRange: boolean;
  onAddStop?: (defaultDate: string) => void;
  onEditStop?: (stop: Stop) => void;
  onDeleteStop?: (stop: Stop) => void;
}

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDayHeader(iso: string): string {
  try {
    return format(parseLocal(iso), 'EEE, MMM d');
  } catch {
    return iso;
  }
}

function summarize(stops: Stop[]): string {
  if (stops.length === 0) return 'Nothing planned';
  const first = stops[0];
  const firstLabel = first.type === 'transit' ? 'Transit' : first.name;
  if (stops.length === 1) return firstLabel;
  return `${firstLabel} + ${stops.length - 1} more`;
}

/**
 * Partition stops into timed (sorted ascending by time) and untimed (sorted by
 * sortOrder). Untimed stops are what users can drag to reorder (REQ-025).
 */
function partitionStops(stops: Stop[]): { timed: Stop[]; untimed: Stop[] } {
  const timed: Stop[] = [];
  const untimed: Stop[] = [];
  for (const s of stops) {
    if (s.time) timed.push(s);
    else untimed.push(s);
  }
  timed.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  untimed.sort((a, b) => a.sortOrder - b.sortOrder);
  return { timed, untimed };
}

export function DaySection({
  date,
  dayIndex,
  stops,
  collapsed,
  onToggle,
  isToday,
  isOutsideNominalRange,
  onAddStop,
  onEditStop,
  onDeleteStop,
}: DaySectionProps) {
  const { timed, untimed } = partitionStops(stops);

  const header = formatDayHeader(date);
  const dayLabel = dayIndex !== null && dayIndex > 0 ? `Day ${dayIndex}` : null;

  return (
    <Stack
      gap="xs"
      style={{
        opacity: isOutsideNominalRange ? 0.6 : 1,
        borderLeft: isToday
          ? '3px solid var(--mantine-color-blue-filled)'
          : '3px solid transparent',
        paddingLeft: 'var(--mantine-spacing-sm)',
      }}
    >
      <UnstyledButton
        onClick={onToggle}
        aria-expanded={!collapsed}
        style={{ width: '100%' }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <ActionIcon component="div" variant="transparent" size="sm" aria-hidden>
              {collapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
            </ActionIcon>
            <Text
              fw={600}
              size="sm"
              c={isToday ? 'blue' : undefined}
            >
              {header}
            </Text>
            {dayLabel && (
              <Text size="xs" c="dimmed">
                · {dayLabel}
              </Text>
            )}
            {isToday && (
              <Badge size="xs" color="blue" variant="light">
                Today
              </Badge>
            )}
            {isOutsideNominalRange && (
              <Badge size="xs" color="gray" variant="light">
                Outside range
              </Badge>
            )}
          </Group>
          {collapsed && (
            <Text size="xs" c="dimmed" truncate style={{ minWidth: 0, flex: 1, textAlign: 'right' }}>
              {summarize(stops)}
            </Text>
          )}
        </Group>
      </UnstyledButton>

      <Collapse in={!collapsed}>
        <Stack gap="xs" pl="lg">
          {timed.map((stop) => (
            <StopCard
              key={stop.id}
              stop={stop}
              onEdit={onEditStop}
              onDelete={onDeleteStop}
            />
          ))}

          {/* Untimed stops are drag-reorderable within this day */}
          <Droppable droppableId={`day:${date}`} type="stop">
            {(provided) => (
              <Stack
                gap="xs"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {untimed.map((stop, index) => (
                  <Draggable key={stop.id} draggableId={stop.id} index={index}>
                    {(dragProvided) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                      >
                        <StopCard
                          stop={stop}
                          onEdit={onEditStop}
                          onDelete={onDeleteStop}
                          dragHandleProps={dragProvided.dragHandleProps}
                          showDragHandle
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </Stack>
            )}
          </Droppable>

          {stops.length === 0 && (
            <Group justify="center" py="sm">
              <Text size="sm" c="dimmed">
                Nothing planned
              </Text>
              {onAddStop && (
                <Button
                  variant="subtle"
                  size="compact-xs"
                  leftSection={<IconPlus size={12} />}
                  onClick={() => onAddStop(date)}
                >
                  Add stop
                </Button>
              )}
            </Group>
          )}

          {stops.length > 0 && onAddStop && (
            <Group justify="flex-start" pt={4}>
              <Button
                variant="subtle"
                size="compact-xs"
                leftSection={<IconPlus size={12} />}
                onClick={() => onAddStop(date)}
              >
                Add stop
              </Button>
            </Group>
          )}
        </Stack>
      </Collapse>
    </Stack>
  );
}
