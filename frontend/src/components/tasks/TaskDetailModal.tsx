import React, { useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Stack,
  Text,
  Timeline,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconCheck,
  IconBan,
  IconArrowBackUp,
  IconEdit,
  IconTrash,
} from '@tabler/icons-react';
import { format, parseISO } from 'date-fns';
import { ResponsiveModal } from '../ResponsiveModal';
import { UserColorDot } from '../common/UserColorDot';
import { userColor } from '../../utils/userColor';
import { parseDateString } from '../../utils/formatters';
import { COLUMNS } from './boardOrdering';
import type {
  StoredTask,
  TaskStatus,
  FamilyMember,
} from '../../../../shared/types';

export interface TaskDetailModalProps {
  task: StoredTask | null;
  onClose: () => void;
  members: FamilyMember[];
  onStatusChange: (status: TaskStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSubTaskToggle: (taskId: string, subTaskId: string, completed: boolean) => void;
}

export function TaskDetailModal({ task, onClose, members, onStatusChange, onEdit, onDelete, onSubTaskToggle }: TaskDetailModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!task) return null;

  const getMember = (userId: string) => members.find((m) => m.userId === userId);
  const getMemberName = (userId: string) => getMember(userId)?.displayName ?? userId;

  const statusActions: { label: string; status: TaskStatus; icon: React.ReactNode; color: string }[] = [];
  if (task.status !== 'started') statusActions.push({ label: 'Start', status: 'started', icon: <IconPlayerPlay size={14} />, color: 'yellow' });
  if (task.status !== 'done') statusActions.push({ label: 'Complete', status: 'done', icon: <IconCheck size={14} />, color: 'green' });
  if (task.status !== 'cancelled') statusActions.push({ label: 'Cancel', status: 'cancelled', icon: <IconBan size={14} />, color: 'gray' });
  if (task.status !== 'todo') statusActions.push({ label: 'Back to Todo', status: 'todo', icon: <IconArrowBackUp size={14} />, color: 'blue' });

  const subTasks = task.subTasks ?? [];

  return (
    <ResponsiveModal
      opened={!!task}
      onClose={() => { onClose(); setConfirmDelete(false); }}
      title={task.title}
      size="lg"
    >
      <Stack gap="md">
        {/* Status & metadata */}
        <Group gap="xs" wrap="wrap">
          <Badge color={COLUMNS.find((c) => c.status === task.status)?.color}>{task.status}</Badge>
          <Badge variant="outline" color={task.scope === 'personal' ? 'violet' : 'blue'}>
            {task.scope}
          </Badge>
          {task.assigneeId && (
            <Badge variant="light" color={userColor(getMember(task.assigneeId))}>
              {getMemberName(task.assigneeId)}
            </Badge>
          )}
          {task.dueDate && (
            <Badge variant="light" color="gray">
              Due {format(parseDateString(task.dueDate), 'MMM d, yyyy')}
            </Badge>
          )}
          {(task.tags ?? []).map((tag) => (
            <Badge key={tag} variant="light" color="teal">{tag}</Badge>
          ))}
        </Group>

        {task.description && (
          <Text size="sm" c="dimmed">{task.description}</Text>
        )}

        {/* Sub-tasks */}
        {subTasks.length > 0 && (
          <div>
            <Text fw={600} size="sm" mb={4}>
              Sub-tasks ({subTasks.filter((s) => s.completed).length}/{subTasks.length})
            </Text>
            <Stack gap={4}>
              {subTasks.map((st) => (
                <Checkbox
                  key={st.id}
                  label={st.title}
                  checked={st.completed}
                  onChange={(e) => onSubTaskToggle(task.id, st.id, e.currentTarget.checked)}
                  size="sm"
                />
              ))}
            </Stack>
          </div>
        )}

        {/* Status change buttons */}
        <Group gap="xs">
          {statusActions.map((action) => (
            <Button
              key={action.status}
              size="xs"
              variant="light"
              color={action.color}
              leftSection={action.icon}
              onClick={() => {
                if (action.status === 'cancelled') {
                  setConfirmCancel(true);
                  return;
                }
                onStatusChange(action.status);
              }}
            >
              {action.label}
            </Button>
          ))}
        </Group>

        {/* Cancel confirmation */}
        <ResponsiveModal
          opened={confirmCancel}
          onClose={() => setConfirmCancel(false)}
          title="Cancel this task?"
          size="sm"
          withinPortal
        >
          <Stack gap="sm">
            <Text size="sm">It will move to Task History.</Text>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setConfirmCancel(false)}>
                Keep task
              </Button>
              <Button
                color="red"
                onClick={() => {
                  onStatusChange('cancelled');
                  setConfirmCancel(false);
                }}
              >
                Cancel task
              </Button>
            </Group>
          </Stack>
        </ResponsiveModal>

        {/* Transition timeline */}
        <Text fw={600} size="sm">History</Text>
        <Timeline active={task.transitions.length - 1} bulletSize={20} lineWidth={2}>
          {[...task.transitions].reverse().map((t, i) => (
            <Timeline.Item
              key={i}
              title={
                <Group gap={6} wrap="nowrap" component="span">
                  <UserColorDot user={getMember(t.userId)} size={8} tooltip={false} />
                  <Text size="xs">
                    <Text span fw={600}>{getMemberName(t.userId)}</Text>
                    {' '}
                    {t.fromStatus
                      ? `moved from ${t.fromStatus} to ${t.toStatus}`
                      : `created as ${t.toStatus}`
                    }
                  </Text>
                </Group>
              }
            >
              <Text size="xs" c="dimmed">
                {format(parseISO(t.timestamp), 'MMM d, yyyy h:mm a')}
              </Text>
            </Timeline.Item>
          ))}
        </Timeline>

        {/* Actions */}
        <Group justify="space-between" mt="sm">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconEdit size={14} />}
            onClick={onEdit}
          >
            Edit
          </Button>

          {confirmDelete ? (
            <Group gap="xs">
              <Text size="xs" c="red">Delete this task?</Text>
              <Button size="xs" color="red" onClick={onDelete}>Yes, delete</Button>
              <Button size="xs" variant="outline" onClick={() => setConfirmDelete(false)}>
                No
              </Button>
            </Group>
          ) : (
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          )}
        </Group>
      </Stack>
    </ResponsiveModal>
  );
}
