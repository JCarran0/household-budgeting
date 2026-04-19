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
  Checkbox,
  MultiSelect,
  CloseButton,
  TagsInput,
  Switch,
  ScrollArea,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { DragDropContext, Droppable, type DropResult } from '@hello-pangea/dnd';
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
  IconArrowUp,
  IconArrowDown,
} from '@tabler/icons-react';
import { format, parseISO } from 'date-fns';
import { api } from '../lib/api';
import { parseDateString } from '../utils/formatters';
import { playCompletionChime } from '../utils/completionSound';
import { useAuthStore } from '../stores/authStore';
import { KanbanColumn } from '../components/tasks/KanbanColumn';
import { TaskCard } from '../components/tasks/TaskCard';
import { ChecklistView } from '../components/tasks/ChecklistView';
import { LeaderboardPanel } from '../components/tasks/LeaderboardPanel';
import { DailyQuoteStrip } from '../components/DailyQuoteStrip';
import { BadgeHeroModal } from '../components/tasks/BadgeHeroModal';
import { useNewBadgeCelebrations } from '../hooks/useNewBadgeCelebrations';
import { userColor } from '../utils/userColor';
import { UserColorDot } from '../components/common/UserColorDot';
import { computeSortOrder } from '../../../shared/utils/taskSortOrder';
import type {
  StoredTask,
  TaskStatus,
  TaskScope,
  FamilyMember,
  CreateTaskDto,
  UpdateTaskDto,
  StoredTaskTemplate,
  CreateTaskTemplateDto,
  SubTask,
} from '../../../shared/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rendered Kanban columns (v2.0: Cancelled column retired). */
const BOARD_COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'todo', label: 'Todo', color: 'blue' },
  { status: 'started', label: 'Started', color: 'yellow' },
  { status: 'done', label: 'Done', color: 'green' },
];

/** Droppable id for the synthetic Snoozed column (not a TaskStatus). */
const SNOOZED_DROPPABLE_ID = '__snoozed__';

/** Full status → {label, color} map for badges and history filter options. */
const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: 'Todo', color: 'blue' },
  started: { label: 'Started', color: 'yellow' },
  done: { label: 'Done', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

/** Legacy export for places that still want the array form. */
const COLUMNS = (Object.keys(STATUS_META) as TaskStatus[]).map((status) => ({
  status,
  label: STATUS_META[status].label,
  color: STATUS_META[status].color,
}));

// ---------------------------------------------------------------------------
// Sorting helpers (v2.0)
// ---------------------------------------------------------------------------

/** A task is "currently snoozed" if snoozedUntil is set and in the future. */
function isSnoozed(task: StoredTask): boolean {
  if (!task.snoozedUntil) return false;
  return new Date(task.snoozedUntil).getTime() > Date.now();
}

/** sortOrder ASC — for todo/started columns. Stable, handles undefined. */
function bySortOrderAsc(a: StoredTask, b: StoredTask): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

/** completedAt DESC — for the Done column. */
function byCompletedAtDesc(a: StoredTask, b: StoredTask): number {
  const ab = a.completedAt ?? '';
  const bb = b.completedAt ?? '';
  return bb.localeCompare(ab);
}

/** snoozedUntil ASC — for the Snoozed column (nearest expiry first). */
function bySnoozeAsc(a: StoredTask, b: StoredTask): number {
  return (a.snoozedUntil ?? '').localeCompare(b.snoozedUntil ?? '');
}

/**
 * Predicate for the Board view filter bar (assignee + scope + tags). Shared
 * between the render-time filter and the post-create "hidden by filters"
 * detection so they can't drift.
 */
function matchesBoardFilters(
  t: StoredTask,
  filterAssignee: string | null,
  filterScope: string,
  filterTags: string[],
): boolean {
  if (filterAssignee === '__unassigned__') {
    if (t.assigneeId !== null) return false;
  } else if (filterAssignee && t.assigneeId !== filterAssignee) {
    return false;
  }
  if (filterScope === 'family' && t.scope !== 'family') return false;
  if (filterScope === 'personal' && t.scope !== 'personal') return false;
  if (filterTags.length > 0) {
    const taskTags = t.tags ?? [];
    if (!filterTags.every((tag) => taskTags.includes(tag))) return false;
  }
  return true;
}

/**
 * Sort the full flat board array into render order:
 *   status group (todo → started → done → cancelled), then per-column rule.
 * Done once on server data receipt; subsequent local mutations splice rather
 * than re-sort to avoid racing pangea-dnd's drop animation.
 */
const STATUS_GROUP_ORDER: Record<TaskStatus, number> = {
  todo: 0,
  started: 1,
  done: 2,
  cancelled: 3,
};
function sortBoardForRender(tasks: StoredTask[]): StoredTask[] {
  const next = [...tasks];
  next.sort((a, b) => {
    if (a.status !== b.status) {
      return STATUS_GROUP_ORDER[a.status] - STATUS_GROUP_ORDER[b.status];
    }
    if (a.status === 'done' || a.status === 'cancelled') {
      return byCompletedAtDesc(a, b);
    }
    return bySortOrderAsc(a, b);
  });
  return next;
}

/**
 * Splice a task into its new position in the flat board array, producing an
 * array whose render order matches pangea-dnd's post-drop expectation.
 *
 * `destinationIndex` is the index within the destination column as rendered
 * (snoozed items excluded, user filters NOT applied — see caller).
 */
function spliceBoardForDrop(
  prev: StoredTask[],
  taskId: string,
  newStatus: TaskStatus,
  newSortOrder: number,
  destinationIndex: number,
): StoredTask[] {
  const without: StoredTask[] = [];
  let removed: StoredTask | null = null;
  for (const t of prev) {
    if (t.id === taskId) removed = t;
    else without.push(t);
  }
  if (!removed) return prev;

  const updated: StoredTask = { ...removed, status: newStatus, sortOrder: newSortOrder };

  // Walk `without`, counting items that render in the destination column,
  // and find the insertion point matching `destinationIndex`.
  let seenInColumn = 0;
  let insertAt = without.length; // default: end of array
  for (let i = 0; i < without.length; i++) {
    const t = without[i];
    if (t.status !== newStatus) continue;
    if (isSnoozed(t)) continue;
    if (seenInColumn === destinationIndex) {
      insertAt = i;
      break;
    }
    seenInColumn++;
  }
  // If we filled the column without hitting destinationIndex, insert after the
  // last item of that column (preserves group contiguity).
  if (insertAt === without.length && seenInColumn > 0 && seenInColumn <= destinationIndex) {
    for (let i = without.length - 1; i >= 0; i--) {
      if (without[i].status === newStatus && !isSnoozed(without[i])) {
        insertAt = i + 1;
        break;
      }
    }
  }

  return [...without.slice(0, insertAt), updated, ...without.slice(insertAt)];
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function Tasks() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  // View state
  const [view, setView] = useState<'board' | 'history'>('board');
  // v2.0 — board presentation (kanban vs. flat checklist), persisted per user
  const [boardMode, setBoardMode] = useState<'kanban' | 'checklist'>(() => {
    try {
      const stored = localStorage.getItem('tasks.view');
      return stored === 'checklist' ? 'checklist' : 'kanban';
    } catch { return 'kanban'; }
  });
  const setBoardModePersisted = (next: 'kanban' | 'checklist') => {
    setBoardMode(next);
    try { localStorage.setItem('tasks.view', next); } catch { /* ignore */ }
  };
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [filterScope, setFilterScope] = useState<string>('all');
  const [filterTags, setFilterTags] = useState<string[]>([]);

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

  // v2.0 — Show-snoozed toggle (per-user, persisted). Default ON — snoozed
  // surface via the left-of-Todo column and users can turn it off.
  const [showSnoozed, setShowSnoozed] = useState(() => {
    try {
      const stored = localStorage.getItem('tasks.kanban.showSnoozed');
      // Treat only an explicit 'false' as off; anything else (unset or 'true')
      // starts on so first-time users see the snoozed column immediately.
      return stored !== 'false';
    } catch {
      return true;
    }
  });
  const toggleShowSnoozed = (next: boolean) => {
    setShowSnoozed(next);
    try { localStorage.setItem('tasks.kanban.showSnoozed', next ? 'true' : 'false'); }
    catch { /* ignore */ }
  };

  // ---------- Queries ----------

  const { data: familyData } = useQuery({
    queryKey: ['family'],
    queryFn: () => api.getFamily(),
  });
  const members: FamilyMember[] = familyData?.family?.members ?? [];

  const { data: serverBoardTasks = [], isLoading: boardLoading, error: boardError } = useQuery({
    queryKey: ['tasks', 'board', { includeSnoozed: showSnoozed }],
    queryFn: () => api.getBoardTasks({ includeSnoozed: showSnoozed }),
  });

  // Local state for board data — drives rendering so drag updates are synchronous.
  // Synced from React Query whenever the server data changes.
  //
  // IMPORTANT: sort once on receipt, then preserve render order through local
  // mutations (splice). If we re-sorted on every render, pangea-dnd's drop
  // animation would race with the re-ordering and the dragged item would
  // briefly snap back to its source position before React re-rendered it.
  const [boardTasks, setBoardTasks] = useState<StoredTask[]>([]);
  useEffect(() => {
    setBoardTasks(sortBoardForRender(serverBoardTasks));
  }, [serverBoardTasks]);

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => api.getTasks(),
    enabled: view === 'history' || leaderboardOpen,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['taskTemplates'],
    queryFn: () => api.getTaskTemplates(),
  });

  const { data: leaderboard } = useQuery({
    queryKey: ['tasks', 'leaderboard'],
    queryFn: () => api.getLeaderboard(Intl.DateTimeFormat().resolvedOptions().timeZone),
  });

  const { pendingHero, dismissHero } = useNewBadgeCelebrations(
    leaderboard,
    currentUser?.id,
  );

  // ---------- Mutations ----------

  const invalidateTasks = () => {
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateTaskDto) => api.createTask(data),
    onSuccess: (createdTask) => {
      invalidateTasks();
      closeCreate();
      const visible = matchesBoardFilters(createdTask, filterAssignee, filterScope, filterTags);
      if (visible) {
        notifications.show({ message: 'Task created', color: 'green' });
      } else {
        const notifId = 'task-created-hidden';
        notifications.show({
          id: notifId,
          color: 'green',
          autoClose: 8000,
          message: (
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <Text size="sm">Task created — hidden by current filters</Text>
              <Button
                size="compact-xs"
                variant="white"
                onClick={() => {
                  setFilterAssignee(null);
                  setFilterScope('all');
                  setFilterTags([]);
                  notifications.hide(notifId);
                }}
              >
                Clear filters
              </Button>
            </Group>
          ),
        });
      }
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
    onSuccess: (updated) => {
      if (updated.status === 'done') playCompletionChime();
    },
  });

  const reorderMutation = useMutation({
    mutationFn: ({ id, status, sortOrder }: { id: string; status: TaskStatus; sortOrder: number }) =>
      api.reorderTask(id, status, sortOrder),
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, snoozedUntil }: { id: string; snoozedUntil: string | null }) =>
      api.snoozeTask(id, snoozedUntil),
    onSuccess: () => {
      invalidateTasks();
    },
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
    const destinationId = result.destination.droppableId;
    const taskId = result.draggableId;

    // Drops onto the synthetic Snoozed column are disallowed — snooze happens
    // via the card kebab menu.
    if (destinationId === SNOOZED_DROPPABLE_ID) return;

    const newStatus = destinationId as TaskStatus;
    const task = boardTasks.find((t) => t.id === taskId);
    if (!task) return;

    // Done / cancelled columns are canonically ordered server-side
    // (by `completedAt` / `cancelledAt` DESC respectively) and the reorder
    // endpoint explicitly rejects them. A drop into those columns is a pure
    // status change — route through statusMutation instead.
    const isTerminalDrop = newStatus === 'done' || newStatus === 'cancelled';

    const previousBoard = boardTasks;

    if (isTerminalDrop) {
      // Optimistic: drop the task into the destination column so the render
      // doesn't snap back during the request. The server refetch on success
      // will restore the canonical ordering.
      setBoardTasks((prev) =>
        spliceBoardForDrop(prev, taskId, newStatus, task.sortOrder, result.destination!.index),
      );

      statusMutation.mutate(
        { id: taskId, status: newStatus },
        {
          onSuccess: (updatedTask) => {
            setBoardTasks((prev) =>
              prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
            );
            void queryClient.invalidateQueries({ queryKey: ['tasks', 'leaderboard'] });
            void queryClient.invalidateQueries({ queryKey: ['tasks', 'board'] });
          },
          onError: () => {
            setBoardTasks(previousBoard);
            notifications.show({ message: 'Failed to move task', color: 'red' });
          },
        },
      );
      return;
    }

    // Neighbors are taken from the destination column AS CURRENTLY RENDERED
    // (boardTasks is already in render order; drop the dragged task from that
    // slice). This guarantees the sortOrder math lines up with pangea's index.
    const destinationIndex = result.destination.index;
    const destinationColumn = boardTasks.filter(
      (t) => t.id !== taskId && t.status === newStatus && !isSnoozed(t),
    );

    const before = destinationColumn[destinationIndex - 1]?.sortOrder ?? null;
    const after = destinationColumn[destinationIndex]?.sortOrder ?? null;
    const newSortOrder = computeSortOrder(before, after);

    // Optimistic: splice the task to its new position (not a re-sort). This is
    // what pangea-dnd expects post-drop — re-sorting via sortForColumn would
    // race the drop animation and make the card briefly bounce back.
    setBoardTasks((prev) =>
      spliceBoardForDrop(prev, taskId, newStatus, newSortOrder, destinationIndex),
    );

    reorderMutation.mutate(
      { id: taskId, status: newStatus, sortOrder: newSortOrder },
      {
        onSuccess: (updatedTask) => {
          // Replace the optimistic record with the canonical server record —
          // in-place, preserving array order.
          setBoardTasks((prev) =>
            prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
          );
          if (task.status !== newStatus) {
            void queryClient.invalidateQueries({ queryKey: ['tasks', 'leaderboard'] });
          }
        },
        onError: () => {
          setBoardTasks(previousBoard);
          notifications.show({ message: 'Failed to move task', color: 'red' });
        },
      },
    );
  };

  // ---------- Filtering ----------

  const filteredBoardTasks = useMemo(() => {
    return boardTasks.filter((t) => matchesBoardFilters(t, filterAssignee, filterScope, filterTags));
  }, [boardTasks, filterAssignee, filterScope, filterTags]);

  // Collect all unique tags across board tasks for the filter dropdown
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const t of boardTasks) {
      for (const tag of t.tags ?? []) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  }, [boardTasks]);

  const snoozedTasks = useMemo(
    () => filteredBoardTasks.filter((t) => isSnoozed(t)).sort(bySnoozeAsc),
    [filteredBoardTasks],
  );

  // Partition filtered tasks by column, preserving their order in boardTasks.
  // (boardTasks is already in render order — see the useEffect above.) No
  // per-column re-sort here: doing so would race pangea-dnd's drop animation.
  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, StoredTask[]> = {
      todo: [],
      started: [],
      done: [],
      cancelled: [],
    };
    for (const task of filteredBoardTasks) {
      if (isSnoozed(task)) continue; // render in the snoozed column instead
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
      description: template.defaultDescription || undefined,
      scope: template.defaultScope,
      assigneeId: template.defaultAssigneeId,
      tags: template.defaultTags?.length ? template.defaultTags : undefined,
      subTasks: template.defaultSubTasks?.length
        ? template.defaultSubTasks.map((title) => ({ title }))
        : undefined,
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
          {view === 'board' && (
            <Select
              placeholder="Assignee"
              size="xs"
              clearable
              value={filterAssignee}
              onChange={setFilterAssignee}
              data={assigneeOptions}
              w={150}
            />
          )}
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(v) => setView(v as 'board' | 'history')}
            data={[
              { label: 'Board', value: 'board' },
              { label: 'History', value: 'history' },
            ]}
          />
          {view === 'board' && (
            <>
              <SegmentedControl
                size="xs"
                value={boardMode}
                onChange={(v) => setBoardModePersisted(v as 'kanban' | 'checklist')}
                data={[
                  { label: 'Kanban', value: 'kanban' },
                  { label: 'Checklist', value: 'checklist' },
                ]}
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
              <Switch
                size="xs"
                label="Show snoozed"
                checked={showSnoozed}
                onChange={(e) => toggleShowSnoozed(e.currentTarget.checked)}
              />
            </>
          )}
        </Group>
      </Group>

      {/* Daily quote strip */}
      <DailyQuoteStrip />

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
            <LeaderboardPanel leaderboard={leaderboard} tasks={allTasks} />
          </Collapse>
        </Paper>
      )}

      {view === 'board' && boardMode === 'checklist' ? (
        <ChecklistView
          tasks={filteredBoardTasks}
          members={members}
          onEdit={(t) => setEditingTask(t)}
          quickCreateDefaults={{
            assigneeId:
              filterAssignee === '__unassigned__'
                ? null
                : (filterAssignee ?? currentUser?.id ?? null),
            scope:
              filterScope === 'family'
                ? 'family'
                : filterScope === 'personal'
                ? 'personal'
                : undefined,
            tags: filterTags,
          }}
        />
      ) : view === 'board' ? (
        <>
          {/* Filters + Create */}
          <Group gap="sm" mb="md" justify="space-between">
            <Group gap="sm">
              {allTags.length > 0 && (
                <MultiSelect
                  placeholder="Tags"
                  size="xs"
                  clearable
                  value={filterTags}
                  onChange={setFilterTags}
                  data={allTags}
                  w={200}
                />
              )}
            </Group>

            {/* Split button: Create + template dropdown */}
            <Button.Group>
              <Button size="xs" leftSection={<IconPlus size={14} />} onClick={openCreate}>
                Create Task
              </Button>
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <Button size="xs" px="xs" variant="filled">
                    <IconChevronDown size={14} />
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

          {/* Kanban Board */}
          <DragDropContext onDragEnd={onDragEnd}>
            <Group align="flex-start" gap="md" wrap="nowrap" style={{ overflowX: 'auto' }}>
              {/* Snoozed column renders to the LEFT of Todo when the toggle is on. */}
              {showSnoozed && (
                <SnoozedColumn
                  tasks={snoozedTasks}
                  members={members}
                  onTaskClick={setDetailTask}
                  onUnsnooze={(taskId) => snoozeMutation.mutate({ id: taskId, snoozedUntil: null })}
                  onEdit={(task) => setEditingTask(task)}
                />
              )}
              {BOARD_COLUMNS.map((col) => (
                <KanbanColumn
                  key={col.status}
                  status={col.status}
                  label={col.label}
                  color={col.color}
                  tasks={tasksByStatus[col.status]}
                  members={members}
                  onTaskClick={setDetailTask}
                  onSnooze={(taskId, snoozedUntil) =>
                    snoozeMutation.mutate({ id: taskId, snoozedUntil })
                  }
                  onCancel={(taskId) => statusMutation.mutate(
                    { id: taskId, status: 'cancelled' },
                    { onSuccess: invalidateTasks }
                  )}
                  onEdit={(task) => setEditingTask(task)}
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
        onSubmit={(data) => createMutation.mutate(data as CreateTaskDto)}
        members={members}
        loading={createMutation.isPending}
        title="Create Task"
        currentUserId={currentUser?.id ?? null}
        createDefaults={{
          assigneeId:
            filterAssignee === '__unassigned__'
              ? null
              : (filterAssignee ?? currentUser?.id ?? null),
          scope:
            filterScope === 'family'
              ? 'family'
              : filterScope === 'personal'
              ? 'personal'
              : undefined,
          tags: filterTags,
        }}
      />

      {/* Edit Task Modal */}
      <TaskFormModal
        opened={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSubmit={(data) => {
          if (!editingTask) return;
          updateMutation.mutate({ id: editingTask.id, data: data as UpdateTaskDto }, {
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
        onSubTaskToggle={(taskId, subTaskId, completed) => {
          if (!detailTask) return;
          const updatedSubTasks = (detailTask.subTasks ?? []).map((st) =>
            st.id === subTaskId ? { ...st, completed } : st
          );
          // Optimistically update the detail modal
          setDetailTask({ ...detailTask, subTasks: updatedSubTasks });
          updateMutation.mutate({ id: taskId, data: { subTasks: updatedSubTasks } });
        }}
      />

      {/* Template Management Modal */}
      <TemplateManagementModal
        opened={templateOpened}
        onClose={closeTemplates}
        templates={templates}
        members={members}
      />

      {/* Final-tier badge unlock — manual dismiss, no auto-close */}
      <BadgeHeroModal
        opened={pendingHero !== null}
        onClose={dismissHero}
        badge={pendingHero}
        displayName={currentUser?.displayName ?? ''}
      />
    </Container>
  );
}

// ---------------------------------------------------------------------------
// Snoozed Column — read-only position, sorted by snoozedUntil ASC
// ---------------------------------------------------------------------------

interface SnoozedColumnProps {
  tasks: StoredTask[];
  members: FamilyMember[];
  onTaskClick: (task: StoredTask) => void;
  onUnsnooze: (taskId: string) => void;
  onEdit?: (task: StoredTask) => void;
}

function SnoozedColumn({ tasks, members, onTaskClick, onUnsnooze, onEdit }: SnoozedColumnProps) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <Group gap="xs" mb="xs">
        <Text fw={600} size="sm">Snoozed</Text>
        <Badge size="sm" variant="light" color="indigo" circle>
          {tasks.length}
        </Badge>
      </Group>
      <Droppable droppableId={SNOOZED_DROPPABLE_ID} isDropDisabled>
        {(provided) => (
          <ScrollArea
            h="calc(100vh - 280px)"
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

// ---------------------------------------------------------------------------
// Task Form Modal (create/edit)
// ---------------------------------------------------------------------------

export type TaskFormSubmitData = CreateTaskDto | UpdateTaskDto;

export interface TaskFormModalProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (data: TaskFormSubmitData) => void;
  members: FamilyMember[];
  loading: boolean;
  title: string;
  initialValues?: StoredTask;
  currentUserId?: string | null;
  /** Tags that are locked (pre-populated and non-removable). Used when
   *  creating a task from a project's Tasks tab. */
  lockedTags?: string[];
  /**
   * Optional pre-fills for create mode (ignored when editing). Used to inherit
   * the Board filter values so a freshly created task doesn't immediately
   * disappear from the filtered view. Each field is an override — omit to fall
   * back to the existing defaults (assignee → currentUserId; scope → 'family';
   * tags → []).
   */
  createDefaults?: {
    assigneeId?: string | null;
    scope?: TaskScope;
    tags?: string[];
  };
}

export function TaskFormModal({ opened, onClose, onSubmit, members, loading, title, initialValues, currentUserId, lockedTags, createDefaults }: TaskFormModalProps) {
  const [tags, setTags] = useState<string[]>(initialValues?.tags ?? []);
  const [subTaskTitles, setSubTaskTitles] = useState<string[]>(
    initialValues?.subTasks?.map((s) => s.title) ?? []
  );
  const [newSubTask, setNewSubTask] = useState('');
  const submitModeRef = React.useRef<'create' | 'start'>('create');

  const form = useForm<{
    title: string;
    description: string;
    assigneeId: string;
    dueDate: string | null;
    scope: TaskScope;
  }>({
    initialValues: {
      title: initialValues?.title ?? '',
      description: initialValues?.description ?? '',
      // On create, prefer createDefaults.assigneeId (including `null` for
      // Unassigned) when provided; else fall back to currentUserId. On edit,
      // preserve the stored assignee.
      assigneeId: initialValues
        ? (initialValues.assigneeId ?? '')
        : (createDefaults && 'assigneeId' in createDefaults
            ? (createDefaults.assigneeId ?? '')
            : (currentUserId ?? '')),
      // Store YYYY-MM-DD directly — Mantine v8 DatePickerInput works natively
      // with date strings, avoiding the UTC-shift off-by-one that a Date
      // round-trip introduces.
      dueDate: initialValues?.dueDate ?? null,
      scope: (initialValues?.scope ?? createDefaults?.scope ?? 'family') as TaskScope,
    },
  });

  // Reset form when modal opens with new initial values
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (opened) {
      form.setValues({
        title: initialValues?.title ?? '',
        description: initialValues?.description ?? '',
        assigneeId: initialValues
          ? (initialValues.assigneeId ?? '')
          : (createDefaults && 'assigneeId' in createDefaults
              ? (createDefaults.assigneeId ?? '')
              : (currentUserId ?? '')),
        dueDate: initialValues?.dueDate ?? null,
        scope: (initialValues?.scope ?? createDefaults?.scope ?? 'family') as TaskScope,
      });
      // Tags: lockedTags + existing (edit) or createDefaults.tags (create), deduped
      const locked = lockedTags ?? [];
      const existing = initialValues?.tags ?? [];
      const defaults = initialValues ? [] : (createDefaults?.tags ?? []);
      const merged = Array.from(new Set([...locked, ...existing, ...defaults]));
      setTags(merged);
      setSubTaskTitles(initialValues?.subTasks?.map((s) => s.title) ?? []);
      setNewSubTask('');
      submitModeRef.current = 'create';
    }
  }, [opened, initialValues, lockedTags]);

  const handleSubmit = form.onSubmit((values) => {
    const isEdit = !!initialValues;
    if (isEdit) {
      // When editing, preserve sub-task IDs and completed status for existing items
      const existingSubTasks = initialValues?.subTasks ?? [];
      const updatedSubTasks: SubTask[] = subTaskTitles.map((st, i) => {
        const existing = existingSubTasks[i];
        if (existing && existing.title === st) {
          return existing;
        }
        return existing
          ? { ...existing, title: st }
          : { id: crypto.randomUUID(), title: st, completed: false, completedAt: null, completedBy: null };
      });
      onSubmit({
        title: values.title,
        description: values.description || undefined,
        assigneeId: values.assigneeId || null,
        dueDate: values.dueDate ?? null,
        scope: values.scope,
        tags: tags.length > 0 ? tags : [],
        subTasks: updatedSubTasks,
      });
    } else {
      const startMode = submitModeRef.current === 'start';
      onSubmit({
        title: values.title,
        description: values.description || undefined,
        assigneeId: startMode ? (currentUserId ?? null) : (values.assigneeId || null),
        dueDate: values.dueDate ?? null,
        scope: values.scope,
        tags: tags.length > 0 ? tags : undefined,
        subTasks: subTaskTitles.length > 0
          ? subTaskTitles.map((t) => ({ title: t }))
          : undefined,
        ...(startMode ? { status: 'started' as const } : {}),
      });
    }
  });

  const addSubTask = () => {
    const trimmed = newSubTask.trim();
    if (trimmed) {
      setSubTaskTitles((prev) => [...prev, trimmed]);
      setNewSubTask('');
    }
  };

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
            highlightToday
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
          <TagsInput
            label="Tags"
            value={tags}
            onChange={(newTags) => {
              // Prevent removal of locked tags
              const locked = lockedTags ?? [];
              const withLocked = Array.from(new Set([...locked, ...newTags]));
              setTags(withLocked);
            }}
            placeholder="Type and press Enter to add"
          />

          {/* Sub-tasks */}
          <div>
            <Text size="sm" fw={500} mb={4}>Sub-tasks</Text>
            <Stack gap={4}>
              {subTaskTitles.map((st, i) => (
                <Group key={i} gap="xs">
                  <Text size="sm" style={{ flex: 1 }}>{st}</Text>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    disabled={i === 0}
                    onClick={() => setSubTaskTitles((prev) => {
                      const next = [...prev];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      return next;
                    })}
                  >
                    <IconArrowUp size={12} />
                  </ActionIcon>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    disabled={i === subTaskTitles.length - 1}
                    onClick={() => setSubTaskTitles((prev) => {
                      const next = [...prev];
                      [next[i], next[i + 1]] = [next[i + 1], next[i]];
                      return next;
                    })}
                  >
                    <IconArrowDown size={12} />
                  </ActionIcon>
                  <CloseButton
                    size="xs"
                    onClick={() => setSubTaskTitles((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                </Group>
              ))}
              <Group gap="xs">
                <TextInput
                  size="xs"
                  placeholder="Add a sub-task..."
                  value={newSubTask}
                  onChange={(e) => setNewSubTask(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSubTask();
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <Button size="xs" variant="light" onClick={addSubTask} disabled={!newSubTask.trim()}>
                  Add
                </Button>
              </Group>
            </Stack>
          </div>

          {initialValues ? (
            <Button type="submit" loading={loading} fullWidth mt="sm">
              Save Changes
            </Button>
          ) : (
            <Group grow mt="sm">
              <Button
                type="submit"
                loading={loading}
                leftSection={<IconPlus size={14} />}
                onClick={() => { submitModeRef.current = 'create'; }}
              >
                Create Task
              </Button>
              <Button
                type="submit"
                color="yellow"
                loading={loading}
                disabled={!currentUserId}
                leftSection={<IconPlayerPlay size={14} />}
                onClick={() => { submitModeRef.current = 'start'; }}
              >
                Start Task
              </Button>
            </Group>
          )}
        </Stack>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Task Detail Modal
// ---------------------------------------------------------------------------

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
    <Modal
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
        <Modal
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
        </Modal>

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
    </Modal>
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
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTags, setTemplateTags] = useState<string[]>([]);
  const [templateSubTasks, setTemplateSubTasks] = useState<string[]>([]);
  const [newTemplateSubTask, setNewTemplateSubTask] = useState('');

  const form = useForm({
    initialValues: {
      name: '',
      defaultDescription: '',
      defaultAssigneeId: '',
      defaultScope: 'family' as TaskScope,
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingTemplateId(null);
    form.reset();
    setTemplateTags([]);
    setTemplateSubTasks([]);
    setNewTemplateSubTask('');
  };

  const startEditing = (t: StoredTaskTemplate) => {
    setEditingTemplateId(t.id);
    setShowForm(true);
    form.setValues({
      name: t.name,
      defaultDescription: t.defaultDescription ?? '',
      defaultAssigneeId: t.defaultAssigneeId ?? '',
      defaultScope: t.defaultScope,
    });
    setTemplateTags(t.defaultTags ?? []);
    setTemplateSubTasks(t.defaultSubTasks ?? []);
    setNewTemplateSubTask('');
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateTaskTemplateDto) => api.createTaskTemplate(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
      resetForm();
      notifications.show({ message: 'Template created', color: 'green' });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateTaskTemplate>[1] }) =>
      api.updateTaskTemplate(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['taskTemplates'] });
      resetForm();
      notifications.show({ message: 'Template updated', color: 'green' });
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
    const payload = {
      name: values.name,
      defaultDescription: values.defaultDescription || undefined,
      defaultAssigneeId: values.defaultAssigneeId || null,
      defaultScope: values.defaultScope,
      defaultTags: templateTags.length > 0 ? templateTags : [],
      defaultSubTasks: templateSubTasks.length > 0 ? templateSubTasks : [],
    };

    if (editingTemplateId) {
      updateTemplateMutation.mutate({ id: editingTemplateId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  });

  const addTemplateSubTask = () => {
    const trimmed = newTemplateSubTask.trim();
    if (trimmed) {
      setTemplateSubTasks((prev) => [...prev, trimmed]);
      setNewTemplateSubTask('');
    }
  };

  const assigneeData = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({ value: m.userId, label: m.displayName })),
  ];

  const isSaving = createMutation.isPending || updateTemplateMutation.isPending;

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
                {t.defaultTags && t.defaultTags.length > 0 && ` · Tags: ${t.defaultTags.join(', ')}`}
                {t.defaultSubTasks && t.defaultSubTasks.length > 0 && ` · ${t.defaultSubTasks.length} sub-tasks`}
              </Text>
            </div>
            <Group gap={4}>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={() => startEditing(t)}
              >
                <IconEdit size={14} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => deleteMutation.mutate(t.id)}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          </Group>
        ))}

        {showForm ? (
          <Paper withBorder p="sm">
            <Text size="sm" fw={600} mb="xs">
              {editingTemplateId ? 'Edit Template' : 'New Template'}
            </Text>
            <form onSubmit={handleSubmit}>
              <Stack gap="xs">
                <TextInput
                  label="Template Name"
                  required
                  maxLength={100}
                  placeholder="e.g., Laundry"
                  {...form.getInputProps('name')}
                />
                <Textarea
                  label="Default Description"
                  maxLength={2000}
                  autosize
                  minRows={2}
                  maxRows={4}
                  {...form.getInputProps('defaultDescription')}
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
                <TagsInput
                  label="Default Tags"
                  value={templateTags}
                  onChange={setTemplateTags}
                  placeholder="Type and press Enter to add"
                />
                <div>
                  <Text size="sm" fw={500} mb={4}>Default Sub-tasks</Text>
                  <Stack gap={4}>
                    {templateSubTasks.map((st, i) => (
                      <Group key={i} gap="xs">
                        <Text size="sm" style={{ flex: 1 }}>{st}</Text>
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          disabled={i === 0}
                          onClick={() => setTemplateSubTasks((prev) => {
                            const next = [...prev];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            return next;
                          })}
                        >
                          <IconArrowUp size={12} />
                        </ActionIcon>
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          disabled={i === templateSubTasks.length - 1}
                          onClick={() => setTemplateSubTasks((prev) => {
                            const next = [...prev];
                            [next[i], next[i + 1]] = [next[i + 1], next[i]];
                            return next;
                          })}
                        >
                          <IconArrowDown size={12} />
                        </ActionIcon>
                        <CloseButton
                          size="xs"
                          onClick={() => setTemplateSubTasks((prev) => prev.filter((_, idx) => idx !== i))}
                        />
                      </Group>
                    ))}
                    <Group gap="xs">
                      <TextInput
                        size="xs"
                        placeholder="Add a sub-task..."
                        value={newTemplateSubTask}
                        onChange={(e) => setNewTemplateSubTask(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addTemplateSubTask();
                          }
                        }}
                        style={{ flex: 1 }}
                      />
                      <Button size="xs" variant="light" onClick={addTemplateSubTask} disabled={!newTemplateSubTask.trim()}>
                        Add
                      </Button>
                    </Group>
                  </Stack>
                </div>
                <Group gap="xs">
                  <Button type="submit" size="xs" loading={isSaving}>
                    {editingTemplateId ? 'Save Changes' : 'Save'}
                  </Button>
                  <Button size="xs" variant="subtle" onClick={resetForm}>
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
            onClick={() => { resetForm(); setShowForm(true); }}
          >
            Add Template
          </Button>
        )}
      </Stack>
    </Modal>
  );
}
