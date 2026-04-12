import { Card, Text, Group, Badge, Avatar, Tooltip, ThemeIcon } from '@mantine/core';
import { IconCalendar, IconCircleCheck } from '@tabler/icons-react';
import { format, isPast, parseISO } from 'date-fns';
import type { StoredTask, FamilyMember } from '../../../../shared/types';

interface TaskCardProps {
  task: StoredTask;
  members: FamilyMember[];
  onClick: () => void;
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
      </Group>
    </Card>
  );
}
