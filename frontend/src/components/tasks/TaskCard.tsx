import { Card, Text, Group, Badge, Avatar, Tooltip, ThemeIcon, Box } from '@mantine/core';
import { IconCalendar, IconCircleCheck } from '@tabler/icons-react';
import { format, isPast, parseISO } from 'date-fns';
import type { StoredTask, FamilyMember } from '../../../../shared/types';

interface TaskCardProps {
  task: StoredTask;
  members: FamilyMember[];
  onClick: () => void;
}

function SubTaskProgress({ subTasks }: { subTasks: StoredTask['subTasks'] }) {
  if (!subTasks || subTasks.length === 0) return null;
  const completed = subTasks.filter((s) => s.completed).length;

  return (
    <Tooltip label={`${completed}/${subTasks.length} sub-tasks done`}>
      <Group gap={3} wrap="nowrap">
        {subTasks.map((st) => (
          <Box
            key={st.id}
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: st.completed
                ? 'var(--mantine-color-green-6)'
                : 'transparent',
              border: st.completed
                ? '1.5px solid var(--mantine-color-green-6)'
                : '1.5px solid var(--mantine-color-dark-3)',
            }}
          />
        ))}
      </Group>
    </Tooltip>
  );
}

export function TaskCard({ task, members, onClick }: TaskCardProps) {
  const assignee = members.find((m) => m.userId === task.assigneeId);
  const isOverdue = task.dueDate && task.status !== 'done' && task.status !== 'cancelled'
    && isPast(parseISO(task.dueDate));
  const isPersonal = task.scope === 'personal';
  const isDone = task.status === 'done';

  return (
    <Card
      shadow="xs"
      padding="xs"
      radius="sm"
      withBorder
      onClick={onClick}
      style={{
        cursor: 'pointer',
        opacity: isPersonal && !isDone ? 0.75 : isDone ? 0.65 : 1,
        borderLeft: isPersonal ? '3px solid var(--mantine-color-violet-6)' : undefined,
      }}
    >
      <Group gap="xs" wrap="nowrap" align="flex-start">
        {isDone && (
          <ThemeIcon size="sm" radius="xl" color="green" variant="filled" mt={2}>
            <IconCircleCheck size={14} />
          </ThemeIcon>
        )}
        <Text size="sm" fw={500} lineClamp={2} td={isDone ? 'line-through' : undefined} style={{ flex: 1 }}>
          {task.title}
        </Text>
      </Group>

      {task.subTasks && task.subTasks.length > 0 && (
        <Group mt={4}>
          <SubTaskProgress subTasks={task.subTasks} />
        </Group>
      )}

      <Group gap="xs" mt={4}>
        {assignee && (
          <Tooltip label={assignee.displayName}>
            <Avatar size="xs" radius="xl" color="blue">
              {assignee.displayName.charAt(0).toUpperCase()}
            </Avatar>
          </Tooltip>
        )}

        {task.dueDate && (
          <Badge
            size="xs"
            variant="light"
            color={isOverdue ? 'red' : 'gray'}
            leftSection={<IconCalendar size={10} />}
          >
            {format(parseISO(task.dueDate), 'MMM d')}
          </Badge>
        )}

        {isPersonal && (
          <Badge size="xs" variant="outline" color="violet">
            Personal
          </Badge>
        )}

        {task.tags && task.tags.length > 0 && task.tags.map((tag) => (
          <Badge key={tag} size="xs" variant="light" color="teal">
            {tag}
          </Badge>
        ))}
      </Group>
    </Card>
  );
}
