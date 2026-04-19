import { Stack, Text, Badge, Group, ScrollArea } from '@mantine/core';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import type { StoredTask, FamilyMember } from '../../../../shared/types';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  status: string;
  label: string;
  color: string;
  tasks: StoredTask[];
  members: FamilyMember[];
  onTaskClick: (task: StoredTask) => void;
  /** v2.0 — invoked from the card kebab menu. */
  onSnooze?: (taskId: string, snoozedUntil: string | null) => void;
  onCancel?: (taskId: string) => void;
  onEdit?: (task: StoredTask) => void;
}

export function KanbanColumn({
  status,
  label,
  color,
  tasks,
  members,
  onTaskClick,
  onSnooze,
  onCancel,
  onEdit,
}: KanbanColumnProps) {
  // Done column is auto-sorted (completedAt DESC) on the server/parent; disable
  // drag-reorder *within* Done by passing isDragDisabled on each draggable.
  const reorderDisabled = status === 'done';

  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <Group gap="xs" mb="xs">
        <Text fw={600} size="sm">{label}</Text>
        <Badge size="sm" variant="light" color={color} circle>
          {tasks.length}
        </Badge>
      </Group>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <ScrollArea
            h="calc(100vh - 280px)"
            type="auto"
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              background: snapshot.isDraggingOver
                ? 'var(--mantine-color-dark-5)'
                : 'var(--mantine-color-dark-7)',
              borderRadius: 'var(--mantine-radius-sm)',
              padding: 'var(--mantine-spacing-xs)',
              minHeight: 100,
            }}
          >
            <Stack gap="xs">
              {tasks.map((task, index) => (
                <Draggable
                  key={task.id}
                  draggableId={task.id}
                  index={index}
                  isDragDisabled={reorderDisabled}
                >
                  {(dragProvided) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      {...dragProvided.dragHandleProps}
                    >
                      <TaskCard
                        task={task}
                        members={members}
                        onClick={() => onTaskClick(task)}
                        onSnooze={onSnooze}
                        onCancel={onCancel}
                        onEdit={onEdit}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </Stack>
          </ScrollArea>
        )}
      </Droppable>
    </div>
  );
}
