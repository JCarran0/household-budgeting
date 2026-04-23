import { useMemo, useState } from 'react';
import {
  Badge,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { format, parseISO } from 'date-fns';
import { UserColorDot } from '../common/UserColorDot';
import { COLUMNS } from './boardOrdering';
import type { StoredTask, FamilyMember } from '../../../../shared/types';

export interface TaskHistoryViewProps {
  tasks: StoredTask[];
  members: FamilyMember[];
  onTaskClick: (task: StoredTask) => void;
}

export function TaskHistoryView({ tasks, members, onTaskClick }: TaskHistoryViewProps) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<string>('all');

  const getMember = (userId: string | null) =>
    userId ? members.find((m) => m.userId === userId) : undefined;
  const getMemberName = (userId: string | null) => {
    if (!userId) return 'Unassigned';
    return members.find((m) => m.userId === userId)?.displayName ?? userId;
  };

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
        if (statusFilter && t.status !== statusFilter) return false;
        if (assigneeFilter === '__unassigned__' && t.assigneeId !== null) return false;
        if (assigneeFilter && assigneeFilter !== '__unassigned__' && t.assigneeId !== assigneeFilter) return false;
        if (scopeFilter === 'family' && t.scope !== 'family') return false;
        if (scopeFilter === 'personal' && t.scope !== 'personal') return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [tasks, statusFilter, assigneeFilter, scopeFilter]);

  const assigneeOptions = [
    { value: '', label: 'All' },
    { value: '__unassigned__', label: 'Unassigned' },
    ...members.map((m) => ({ value: m.userId, label: m.displayName })),
  ];

  return (
    <Stack gap="md">
      <Group gap="sm">
        <Select
          placeholder="Status"
          size="xs"
          clearable
          value={statusFilter}
          onChange={setStatusFilter}
          data={COLUMNS.map((c) => ({ value: c.status, label: c.label }))}
          w={130}
        />
        <Select
          placeholder="Assignee"
          size="xs"
          clearable
          value={assigneeFilter}
          onChange={setAssigneeFilter}
          data={assigneeOptions}
          w={150}
        />
        <SegmentedControl
          size="xs"
          value={scopeFilter}
          onChange={setScopeFilter}
          data={[
            { label: 'All', value: 'all' },
            { label: 'Family', value: 'family' },
            { label: 'Personal', value: 'personal' },
          ]}
        />
        <Text size="xs" c="dimmed">{filtered.length} tasks</Text>
      </Group>

      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Title</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Assignee</Table.Th>
            <Table.Th>Created</Table.Th>
            <Table.Th>Completed</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filtered.map((task) => (
            <Table.Tr
              key={task.id}
              onClick={() => onTaskClick(task)}
              style={{ cursor: 'pointer' }}
            >
              <Table.Td>
                <Group gap="xs">
                  <Text size="sm">{task.title}</Text>
                  {task.scope === 'personal' && (
                    <Badge size="xs" variant="outline" color="violet">Personal</Badge>
                  )}
                </Group>
              </Table.Td>
              <Table.Td>
                <Badge
                  size="xs"
                  color={COLUMNS.find((c) => c.status === task.status)?.color}
                >
                  {task.status}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Group gap="xs" wrap="nowrap">
                  {task.assigneeId && <UserColorDot user={getMember(task.assigneeId)} />}
                  <Text size="sm">{getMemberName(task.assigneeId)}</Text>
                </Group>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{format(parseISO(task.createdAt), 'MMM d, yyyy')}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  {task.completedAt
                    ? format(parseISO(task.completedAt), 'MMM d, yyyy')
                    : task.cancelledAt
                      ? format(parseISO(task.cancelledAt), 'MMM d, yyyy')
                      : '—'}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
