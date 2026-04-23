import { Badge, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Droppable } from '@hello-pangea/dnd';
import { TaskCard } from './TaskCard';
import { SNOOZED_DROPPABLE_ID } from './boardOrdering';
import type { StoredTask, FamilyMember } from '../../../../shared/types';

export interface SnoozedColumnProps {
  tasks: StoredTask[];
  members: FamilyMember[];
  onTaskClick: (task: StoredTask) => void;
  onUnsnooze: (taskId: string) => void;
  onEdit?: (task: StoredTask) => void;
}

export function SnoozedColumn({ tasks, members, onTaskClick, onUnsnooze, onEdit }: SnoozedColumnProps) {
  // On mobile, columns stack vertically — a fixed-height inner scroll area
  // would nest scrolling awkwardly. Let the page scroll naturally instead.
  const isMobile = useMediaQuery('(max-width: 48em)', false, { getInitialValueInEffect: false }) ?? false;
  return (
    <div style={{ minWidth: 0 }}>
      <Group gap="xs" mb="xs">
        <Text fw={600} size="sm">Snoozed</Text>
        <Badge size="sm" variant="light" color="indigo" circle>
          {tasks.length}
        </Badge>
      </Group>
      <Droppable droppableId={SNOOZED_DROPPABLE_ID} isDropDisabled>
        {(provided) => (
          <ScrollArea
            h={isMobile ? undefined : 'calc(100vh - 280px)'}
            type="auto"
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              background: 'var(--mantine-color-dark-7)',
              borderRadius: 'var(--mantine-radius-sm)',
              padding: 'var(--mantine-spacing-xs)',
              minHeight: 100,
            }}
          >
            <Stack gap="xs">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  members={members}
                  onClick={() => onTaskClick(task)}
                  onSnooze={(id, val) => { if (val === null) onUnsnooze(id); }}
                  onEdit={onEdit}
                  isSnoozedView
                />
              ))}
              {provided.placeholder}
            </Stack>
          </ScrollArea>
        )}
      </Droppable>
    </div>
  );
}
