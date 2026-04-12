import React, { useState, useMemo, useEffect } from 'react';
import {
  Container,
  Title,
  Group,
  Button,
  Select,
  SegmentedControl,
  Stack,
  Loader,
  Center,
  Alert,
  Modal,
  TextInput,
  Textarea,
  Menu,
  ActionIcon,
  Text,
  Badge,
  Timeline,
  Collapse,
  Paper,
  Table,
  Avatar,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import {
  IconPlus,
  IconChevronDown,
  IconAlertCircle,
  IconSettings,
  IconTrash,
  IconTrophy,
  IconChevronUp,
  IconEdit,
  IconCheck,
  IconPlayerPlay,
  IconBan,
  IconArrowBackUp,
} from '@tabler/icons-react';
import { format, parseISO } from 'date-fns';
import { api } from '../lib/api';
import { KanbanColumn } from '../components/tasks/KanbanColumn';
import type {
  StoredTask,
  TaskStatus,
  TaskScope,
  FamilyMember,
  CreateTaskDto,
  UpdateTaskDto,
  StoredTaskTemplate,
  CreateTaskTemplateDto,
  LeaderboardResponse,
} from '../../../shared/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'todo', label: 'Todo', color: 'blue' },
  { status: 'started', label: 'Started', color: 'yellow' },
  { status: 'done', label: 'Done', color: 'green' },
  { status: 'cancelled', label: 'Cancelled', color: 'gray' },
];

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function Tasks() {
  const queryClient = useQueryClient();

  // View state
  const [view, setView] = useState<'board' | 'history'>('board');
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [filterScope, setFilterScope] = useState<string>('all');

  // Modals
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [detailTask, setDetailTask] = useState<StoredTask | null>(null);
  const [templateOpened, { open: openTemplates, close: closeTemplates }] = useDisclosure(false);
  const [editingTask, setEditingTask] = useState<StoredTask | null>(null);

  // Leaderboard
  const [leaderboardOpen, setLeaderboardOpen] = useState(() => {
    try { return localStorage.getItem('tasks-leaderboard') !== 'collapsed'; }
    catch { return true; }
  });

  // ---------- Queries ----------

  const { data: familyData } = useQuery({
    queryKey: ['family'],
    queryFn: () => api.getFamily(),
  });
  const members: FamilyMember[] = familyData?.family?.members ?? [];

  const { data: serverBoardTasks = [], isLoading: boardLoading, error: boardError } = useQuery({
    queryKey: ['tasks', 'board'],
    queryFn: () => api.getBoardTasks(),
  });

  // Local state for board data — drives rendering so drag updates are synchronous.
  // Synced from React Query whenever the server data changes.
  const [boardTasks, setBoardTasks] = useState<StoredTask[]>([]);
  useEffect(() => {
    setBoardTasks(serverBoardTasks);
  }, [serverBoardTasks]);

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => api.getTasks(),
    enabled: view === 'history',
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['taskTemplates'],
    queryFn: () => api.getTaskTemplates(),
  });

  const { data: leaderboard } = useQuery({
    queryKey: ['tasks', 'leaderboard'],
    queryFn: () => api.getLeaderboard(Intl.DateTimeFormat().resolvedOptions().timeZone),
  });

  // ---------- Mutations ----------

  const invalidateTasks = () => {
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateTaskDto) => api.createTask(data),
    onSuccess: () => {
      invalidateTasks();
      closeCreate();
      notifications.show({ message: 'Task created', color: 'green' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskDto }) => api.updateTask(id, data),
    onSuccess: () => {
      invalidateTasks();
      notifications.show({ message: 'Task updated', color: 'green' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api.updateTaskStatus(id, status),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      invalidateTasks();
      setDetailTask(null);
      notifications.show({ message: 'Task deleted', color: 'red' });
    },
  });

  // ---------- Drag handler ----------

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as TaskStatus;
    const taskId = result.draggableId;
    const task = boardTasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // Synchronous local state update — the card moves immediately
    const previousBoard = boardTasks;
    setBoardTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    statusMutation.mutate(
      { id: taskId, status: newStatus },
      {
        onSuccess: (updatedTask) => {
          // Replace optimistic placeholder with full server response
          setBoardTasks((prev) =>
            prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
          );
          void queryClient.invalidateQueries({ queryKey: ['tasks', 'leaderboard'] });
        },
        onError: () => {
          setBoardTasks(previousBoard);
        },
      },
    );
  };

  // ---------- Filtering ----------

  const filteredBoardTasks = useMemo(() => {
    return boardTasks.filter((t) => {
      if (filterAssignee === '__unassigned__') {
        if (t.assigneeId !== null) return false;
      } else if (filterAssignee && t.assigneeId !== filterAssignee) {
        return false;
      }
      if (filterScope === 'family' && t.scope !== 'family') return false;
      if (filterScope === 'personal' && t.scope !== 'personal') return false;
      return true;
    });
  }, [boardTasks, filterAssignee, filterScope]);

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, StoredTask[]> = { todo: [], started: [], done: [], cancelled: [] };
    for (const task of filteredBoardTasks) {
      map[task.status].push(task);
    }
    return map;
  }, [filteredBoardTasks]);

  // ---------- Assignee options for filters ----------

  const assigneeOptions = useMemo(() => [
    { value: '', label: 'All' },
    { value: '__unassigned__', label: 'Unassigned' },
    ...members.map((m) => ({ value: m.userId, label: m.displayName })),
  ], [members]);

  // ---------- Quick create from template ----------

  const quickCreateFromTemplate = (template: StoredTaskTemplate) => {
    createMutation.mutate({
      title: template.name,
      scope: template.defaultScope,
      assigneeId: template.defaultAssigneeId,
    });
  };

  // ---------- Leaderboard toggle ----------

  const toggleLeaderboard = () => {
    const next = !leaderboardOpen;
    setLeaderboardOpen(next);
    try { localStorage.setItem('tasks-leaderboard', next ? 'open' : 'collapsed'); }
    catch { /* ignore */ }
  };

  // ---------- Render ----------

  if (boardLoading) {
    return <Center h={400}><Loader /></Center>;
  }

  if (boardError) {
    return (
      <Container>
        <Alert icon={<IconAlertCircle />} title="Error loading tasks" color="red">
          {boardError instanceof Error ? boardError.message : 'Unknown error'}
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid p="md">
      {/* Header */}
      <Group justify="space-between" mb="md">
        <Group>
          <Title order={2}>Tasks</Title>
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(v) => setView(v as 'board' | 'history')}
            data={[
              { label: 'Board', value: 'board' },
              { label: 'History', value: 'history' },
            ]}
          />
        </Group>

        <Group>
          {/* Split button: Create + template dropdown */}
          <Button.Group>
            <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Create Task
            </Button>
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button px="xs" variant="filled">
                  <IconChevronDown size={16} />
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {templates.length === 0 ? (
                  <Menu.Item disabled>
                    <Text size="xs" c="dimmed">No templates yet</Text>
                  </Menu.Item>
                ) : (
                  templates.map((t) => (
                    <Menu.Item key={t.id} onClick={() => quickCreateFromTemplate(t)}>
                      {t.name}
                    </Menu.Item>
                  ))
                )}
                <Menu.Divider />
                <Menu.Item leftSection={<IconSettings size={14} />} onClick={openTemplates}>
                  Manage Templates...
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Button.Group>
        </Group>
      </Group>

      {/* Leaderboard */}
      {leaderboard && (
        <Paper withBorder p="sm" mb="md" radius="sm">
          <Group
            justify="space-between"
            onClick={toggleLeaderboard}
            style={{ cursor: 'pointer' }}
          >
            <Group gap="xs">
              <IconTrophy size={18} color="var(--mantine-color-yellow-5)" />
              <Text fw={600} size="sm">Leaderboard</Text>
            </Group>
            {leaderboardOpen ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </Group>
          <Collapse in={leaderboardOpen}>
            <LeaderboardPanel leaderboard={leaderboard} />
          </Collapse>
        </Paper>
      )}

      {view === 'board' ? (
        <>
          {/* Filters */}
          <Group gap="sm" mb="md">
            <Select
              placeholder="Assignee"
              size="xs"
              clearable
              value={filterAssignee}
              onChange={setFilterAssignee}
              data={assigneeOptions}
              w={150}
            />
            <SegmentedControl
              size="xs"
              value={filterScope}
              onChange={setFilterScope}
              data={[
                { label: 'All', value: 'all' },
                { label: 'Family', value: 'family' },
                { label: 'Personal', value: 'personal' },
              ]}
            />
          </Group>

          {/* Kanban Board */}
          <DragDropContext onDragEnd={onDragEnd}>
            <Group align="flex-start" gap="md" wrap="nowrap" style={{ overflowX: 'auto' }}>
              {COLUMNS.map((col) => (
                <KanbanColumn
                  key={col.status}
                  status={col.status}
                  label={col.label}
                  color={col.color}
                  tasks={tasksByStatus[col.status]}
                  members={members}
                  onTaskClick={setDetailTask}
                />
              ))}
            </Group>
          </DragDropContext>
        </>
      ) : (
        <TaskHistoryView tasks={allTasks} members={members} onTaskClick={setDetailTask} />
      )}

      {/* Create Task Modal */}
      <TaskFormModal
        opened={createOpened}
        onClose={closeCreate}
        onSubmit={(data) => createMutation.mutate(data)}
        members={members}
        loading={createMutation.isPending}
        title="Create Task"
      />

      {/* Edit Task Modal */}
      <TaskFormModal
        opened={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSubmit={(data) => {
          if (!editingTask) return;
          updateMutation.mutate({ id: editingTask.id, data }, {
            onSuccess: () => {
              setEditingTask(null);
              // Refresh detail if open
              if (detailTask?.id === editingTask.id) {
                const updated = { ...detailTask, ...data } as StoredTask;
                setDetailTask(updated);
              }
            },
          });
        }}
        members={members}
        loading={updateMutation.isPending}
        title="Edit Task"
        initialValues={editingTask ?? undefined}
      />

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={detailTask}
        onClose={() => setDetailTask(null)}
        members={members}
        onStatusChange={(status) => {
          if (!detailTask) return;
          statusMutation.mutate(
            { id: detailTask.id, status },
            {
              onSuccess: (updatedTask) => {
                setDetailTask(updatedTask);
                invalidateTasks();
              },
            },
          );
        }}
        onEdit={() => {
          if (detailTask) {
            setEditingTask(detailTask);
            setDetailTask(null);
          }
        }}
        onDelete={() => {
          if (detailTask) deleteMutation.mutate(detailTask.id);
        }}
      />

      {/* Template Management Modal */}
      <TemplateManagementModal
        opened={templateOpened}
        onClose={closeTemplates}
        templates={templates}
        members={members}
      />
    </Container>
  );
}

// ---------------------------------------------------------------------------
// Task Form Modal (create/edit)
// ---------------------------------------------------------------------------

interface TaskFormModalProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTaskDto) => void;
  members: FamilyMember[];
  loading: boolean;
  title: string;
  initialValues?: StoredTask;
}

function TaskFormModal({ opened, onClose, onSubmit, members, loading, title, initialValues }: TaskFormModalProps) {
  const form = useForm({
    initialValues: {
      title: initialValues?.title ?? '',
      description: initialValues?.description ?? '',
      assigneeId: initialValues?.assigneeId ?? '',
      dueDate: initialValues?.dueDate ? new Date(initialValues.dueDate) : null,
      scope: (initialValues?.scope ?? 'family') as TaskScope,
    },
  });

  // Reset form when modal opens with new initial values
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (opened) {
      form.setValues({
        title: initialValues?.title ?? '',
        description: initialValues?.description ?? '',
        assigneeId: initialValues?.assigneeId ?? '',
        dueDate: initialValues?.dueDate ? new Date(initialValues.dueDate) : null,
        scope: (initialValues?.scope ?? 'family') as TaskScope,
      });
    }
  }, [opened, initialValues]);

  const handleSubmit = form.onSubmit((values) => {
    onSubmit({
      title: values.title,
      description: values.description || undefined,
      assigneeId: values.assigneeId || null,
      dueDate: values.dueDate ? format(values.dueDate, 'yyyy-MM-dd') : null,
      scope: values.scope,
    });
  });

  const assigneeData = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({ value: m.userId, label: m.displayName })),
  ];

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          <TextInput
            label="Title"
            required
            maxLength={200}
            {...form.getInputProps('title')}
          />
          <Textarea
            label="Description"
            maxLength={2000}
            autosize
            minRows={2}
            maxRows={5}
            {...form.getInputProps('description')}
          />
          <Select
            label="Assignee"
            data={assigneeData}
            {...form.getInputProps('assigneeId')}
          />
          <DatePickerInput
            label="Due Date"
            clearable
            {...form.getInputProps('dueDate')}
          />
          <SegmentedControl
            fullWidth
            value={form.values.scope}
            onChange={(v) => form.setFieldValue('scope', v as TaskScope)}
            data={[
              { label: 'Family', value: 'family' },
              { label: 'Personal', value: 'personal' },
            ]}
          />
          <Button type="submit" loading={loading} fullWidth mt="sm">
            {initialValues ? 'Save Changes' : 'Create Task'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Task Detail Modal
// ---------------------------------------------------------------------------

interface TaskDetailModalProps {
  task: StoredTask | null;
  onClose: () => void;
  members: FamilyMember[];
  onStatusChange: (status: TaskStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function TaskDetailModal({ task, onClose, members, onStatusChange, onEdit, onDelete }: TaskDetailModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!task) return null;

  const getMemberName = (userId: string) =>
    members.find((m) => m.userId === userId)?.displayName ?? userId;

  const statusActions: { label: string; status: TaskStatus; icon: React.ReactNode; color: string }[] = [];
  if (task.status !== 'started') statusActions.push({ label: 'Start', status: 'started', icon: <IconPlayerPlay size={14} />, color: 'yellow' });
  if (task.status !== 'done') statusActions.push({ label: 'Complete', status: 'done', icon: <IconCheck size={14} />, color: 'green' });
  if (task.status !== 'cancelled') statusActions.push({ label: 'Cancel', status: 'cancelled', icon: <IconBan size={14} />, color: 'gray' });
  if (task.status !== 'todo') statusActions.push({ label: 'Back to Todo', status: 'todo', icon: <IconArrowBackUp size={14} />, color: 'blue' });

  return (
    <Modal
      opened={!!task}
      onClose={() => { onClose(); setConfirmDelete(false); }}
      title={task.title}
      size="lg"
    >
      <Stack gap="md">
        {/* Status & metadata */}
        <Group gap="xs">
          <Badge color={COLUMNS.find((c) => c.status === task.status)?.color}>{task.status}</Badge>
          <Badge variant="outline" color={task.scope === 'personal' ? 'violet' : 'blue'}>
            {task.scope}
          </Badge>
          {task.assigneeId && (
            <Badge variant="light">{getMemberName(task.assigneeId)}</Badge>
          )}
          {task.dueDate && (
            <Badge variant="light" color="gray">
              Due {format(parseISO(task.dueDate), 'MMM d, yyyy')}
            </Badge>
          )}
        </Group>

        {task.description && (
          <Text size="sm" c="dimmed">{task.description}</Text>
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
              onClick={() => onStatusChange(action.status)}
            >
              {action.label}
            </Button>
          ))}
        </Group>

        {/* Transition timeline */}
        <Text fw={600} size="sm">History</Text>
        <Timeline active={task.transitions.length - 1} bulletSize={20} lineWidth={2}>
          {[...task.transitions].reverse().map((t, i) => (
            <Timeline.Item
              key={i}
              title={
                <Text size="xs">
                  <Text span fw={600}>{getMemberName(t.userId)}</Text>
                  {' '}
                  {t.fromStatus
                    ? `moved from ${t.fromStatus} to ${t.toStatus}`
                    : `created as ${t.toStatus}`
                  }
                </Text>
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
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard Panel
// ---------------------------------------------------------------------------

interface LeaderboardPanelProps {
  leaderboard: LeaderboardResponse;
}

function LeaderboardPanel({ leaderboard }: LeaderboardPanelProps) {
  if (leaderboard.entries.length === 0) {
    return <Text size="sm" c="dimmed" mt="xs">No data yet</Text>;
  }

  const maxToday = Math.max(...leaderboard.entries.map((e) => e.completedToday));
  const maxWeek = Math.max(...leaderboard.entries.map((e) => e.completedThisWeek));
  const maxMonth = Math.max(...leaderboard.entries.map((e) => e.completedThisMonth));

  return (
    <Table mt="xs" horizontalSpacing="sm" verticalSpacing={4}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Member</Table.Th>
          <Table.Th ta="center">Today</Table.Th>
          <Table.Th ta="center">This Week</Table.Th>
          <Table.Th ta="center">This Month</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {leaderboard.entries.map((entry) => (
          <Table.Tr key={entry.userId}>
            <Table.Td>
              <Group gap="xs">
                <Avatar size="xs" radius="xl" color="blue">
                  {entry.displayName.charAt(0).toUpperCase()}
                </Avatar>
                <Text size="sm">{entry.displayName}</Text>
              </Group>
            </Table.Td>
            <Table.Td ta="center">
              <Text size="sm" fw={entry.completedToday === maxToday && maxToday > 0 ? 700 : 400}
                c={entry.completedToday === maxToday && maxToday > 0 ? 'yellow' : undefined}>
                {entry.completedToday}
              </Text>
            </Table.Td>
            <Table.Td ta="center">
              <Text size="sm" fw={entry.completedThisWeek === maxWeek && maxWeek > 0 ? 700 : 400}
                c={entry.completedThisWeek === maxWeek && maxWeek > 0 ? 'yellow' : undefined}>
                {entry.completedThisWeek}
              </Text>
            </Table.Td>
            <Table.Td ta="center">
              <Text size="sm" fw={entry.completedThisMonth === maxMonth && maxMonth > 0 ? 700 : 400}
                c={entry.completedThisMonth === maxMonth && maxMonth > 0 ? 'yellow' : undefined}>
                {entry.completedThisMonth}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Task History View
// ---------------------------------------------------------------------------

interface TaskHistoryViewProps {
  tasks: StoredTask[];
  members: FamilyMember[];
  onTaskClick: (task: StoredTask) => void;
}

function TaskHistoryView({ tasks, members, onTaskClick }: TaskHistoryViewProps) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<string>('all');

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
                <Text size="sm">{getMemberName(task.assigneeId)}</Text>
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

// ---------------------------------------------------------------------------
// Template Management Modal
// ---------------------------------------------------------------------------

interface TemplateManagementModalProps {
  opened: boolean;
  onClose: () => void;
  templates: StoredTaskTemplate[];
  members: FamilyMember[];
}

function TemplateManagementModal({ opened, onClose, templates, members }: TemplateManagementModalProps) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const form = useForm({
    initialValues: {
      name: '',
      defaultAssigneeId: '',
      defaultScope: 'family' as TaskScope,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateTaskTemplateDto) => api.createTaskTemplate(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
      form.reset();
      setShowForm(false);
      notifications.show({ message: 'Template created', color: 'green' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTaskTemplate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
      notifications.show({ message: 'Template deleted', color: 'red' });
    },
  });

  const handleSubmit = form.onSubmit((values) => {
    createMutation.mutate({
      name: values.name,
      defaultAssigneeId: values.defaultAssigneeId || null,
      defaultScope: values.defaultScope,
    });
  });

  const assigneeData = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({ value: m.userId, label: m.displayName })),
  ];

  return (
    <Modal opened={opened} onClose={onClose} title="Manage Task Templates" size="md">
      <Stack gap="md">
        {templates.length === 0 && !showForm && (
          <Text size="sm" c="dimmed">
            No templates yet. Create one to enable one-tap task creation.
          </Text>
        )}

        {templates.map((t) => (
          <Group key={t.id} justify="space-between">
            <div>
              <Text size="sm" fw={500}>{t.name}</Text>
              <Text size="xs" c="dimmed">
                {t.defaultScope === 'personal' ? 'Personal' : 'Family'}
                {t.defaultAssigneeId && ` · ${members.find((m) => m.userId === t.defaultAssigneeId)?.displayName ?? 'Unknown'}`}
              </Text>
            </div>
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={() => deleteMutation.mutate(t.id)}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        ))}

        {showForm ? (
          <Paper withBorder p="sm">
            <form onSubmit={handleSubmit}>
              <Stack gap="xs">
                <TextInput
                  label="Template Name"
                  required
                  maxLength={100}
                  placeholder="e.g., Laundry"
                  {...form.getInputProps('name')}
                />
                <Select
                  label="Default Assignee"
                  data={assigneeData}
                  {...form.getInputProps('defaultAssigneeId')}
                />
                <SegmentedControl
                  fullWidth
                  value={form.values.defaultScope}
                  onChange={(v) => form.setFieldValue('defaultScope', v as TaskScope)}
                  data={[
                    { label: 'Family', value: 'family' },
                    { label: 'Personal', value: 'personal' },
                  ]}
                />
                <Group gap="xs">
                  <Button type="submit" size="xs" loading={createMutation.isPending}>
                    Save
                  </Button>
                  <Button size="xs" variant="subtle" onClick={() => { setShowForm(false); form.reset(); }}>
                    Cancel
                  </Button>
                </Group>
              </Stack>
            </form>
          </Paper>
        ) : (
          <Button
            variant="light"
            leftSection={<IconPlus size={14} />}
            size="xs"
            onClick={() => setShowForm(true)}
          >
            Add Template
          </Button>
        )}
      </Stack>
    </Modal>
  );
}
