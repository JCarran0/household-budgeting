import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Container,
  Title,
  Group,
  Button,
  Select,
  SegmentedControl,
  Loader,
  Center,
  Alert,
  Text,
  Switch,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle } from '@tabler/icons-react';
import { api } from '../lib/api';
import { playCompletionChime } from '../utils/completionSound';
import { useAuthStore } from '../stores/authStore';
import { ChecklistView } from '../components/tasks/ChecklistView';
import { TaskLeaderboard } from '../components/tasks/TaskLeaderboard';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';
import { TaskHistoryView } from '../components/tasks/TaskHistoryView';
import { TemplateManagementModal } from '../components/tasks/TemplateManagementModal';
import { TaskKanban } from '../components/tasks/TaskKanban';
import { DailyQuoteStrip } from '../components/DailyQuoteStrip';
import { BadgeHeroModal } from '../components/tasks/BadgeHeroModal';
import { useNewBadgeCelebrations } from '../hooks/useNewBadgeCelebrations';
import { EASTERN_TIME_ZONE } from '../../../shared/utils/easternTime';
import { matchesBoardFilters } from '../components/tasks/boardOrdering';
import type {
  StoredTask,
  TaskStatus,
  FamilyMember,
  CreateTaskDto,
  UpdateTaskDto,
  StoredTaskTemplate,
} from '../../../shared/types';

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function Tasks() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  // View state — all four persisted per user (REQ-055). Keys shared across
  // desktop and mobile; tasks are the same tasks regardless of device.
  const [view, setViewState] = useState<'board' | 'history'>(() => {
    try {
      return localStorage.getItem('tasks.page') === 'history' ? 'history' : 'board';
    } catch { return 'board'; }
  });
  const setView = (next: 'board' | 'history') => {
    setViewState(next);
    try { localStorage.setItem('tasks.page', next); } catch { /* ignore */ }
  };

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

  const [filterAssignee, setFilterAssigneeState] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem('tasks.filter.assignee');
      return raw && raw !== '' ? raw : null;
    } catch { return null; }
  });
  const setFilterAssignee = (next: string | null) => {
    setFilterAssigneeState(next);
    try {
      if (next === null || next === '') localStorage.removeItem('tasks.filter.assignee');
      else localStorage.setItem('tasks.filter.assignee', next);
    } catch { /* ignore */ }
  };

  const [filterScope, setFilterScopeState] = useState<string>(() => {
    try {
      const raw = localStorage.getItem('tasks.filter.scope');
      return raw === 'family' || raw === 'personal' ? raw : 'all';
    } catch { return 'all'; }
  });
  const setFilterScope = (next: string) => {
    setFilterScopeState(next);
    try { localStorage.setItem('tasks.filter.scope', next); } catch { /* ignore */ }
  };

  const [filterTags, setFilterTagsState] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('tasks.filter.tags');
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch { return []; }
  });
  const setFilterTags = (next: string[]) => {
    setFilterTagsState(next);
    try { localStorage.setItem('tasks.filter.tags', JSON.stringify(next)); } catch { /* ignore */ }
  };

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

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => api.getTasks(),
    enabled: view === 'history' || leaderboardOpen,
  });

  // REQ-055 hydration cleanup: once the first board fetch lands, drop any
  // persisted tag filters referencing tags that no longer exist on any task.
  // One-shot — not a continuous policy. If the user re-adds the tag later,
  // the persisted set is whatever they had at that point.
  const tagsHydratedRef = useRef(false);
  useEffect(() => {
    if (tagsHydratedRef.current || boardLoading) return;
    tagsHydratedRef.current = true;
    setFilterTagsState((current) => {
      if (current.length === 0) return current;
      const liveTags = new Set<string>();
      for (const t of serverBoardTasks) {
        for (const tag of t.tags ?? []) liveTags.add(tag);
      }
      const cleaned = current.filter((tag) => liveTags.has(tag));
      if (cleaned.length === current.length) return current;
      try { localStorage.setItem('tasks.filter.tags', JSON.stringify(cleaned)); } catch { /* ignore */ }
      return cleaned;
    });
  }, [boardLoading, serverBoardTasks]);

  const { data: templates = [] } = useQuery({
    queryKey: ['taskTemplates'],
    queryFn: () => api.getTaskTemplates(),
  });

  const { data: leaderboard } = useQuery({
    queryKey: ['tasks', 'leaderboard'],
    // Always bucket in ET so users see consistent streaks/badges regardless
    // of the browser's resolved timezone (e.g. when traveling).
    queryFn: () => api.getLeaderboard(EASTERN_TIME_ZONE),
  });

  const { current: pendingHeroUnlock, dismiss: dismissHero, queue: heroQueue } =
    useNewBadgeCelebrations(leaderboard, currentUser?.id);

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

  // ---------- Filtered tasks for ChecklistView (kanban view filters internally) ----------

  const filteredBoardTasks = useMemo(
    () => serverBoardTasks.filter((t) => matchesBoardFilters(t, filterAssignee, filterScope, filterTags)),
    [serverBoardTasks, filterAssignee, filterScope, filterTags],
  );

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
      {/* Header — wraps onto multiple lines on mobile. */}
      <Group justify="space-between" mb="md" wrap="wrap" gap="xs">
        <Group wrap="wrap" gap="xs">
          <Title order={2}>Tasks</Title>
          {view === 'board' && (
            <Select
              placeholder="Assignee"
              size="xs"
              clearable
              value={filterAssignee}
              onChange={setFilterAssignee}
              data={assigneeOptions}
              w={140}
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
      <TaskLeaderboard
        leaderboard={leaderboard}
        tasks={allTasks}
        heroQueue={heroQueue}
        open={leaderboardOpen}
        onToggleOpen={toggleLeaderboard}
      />


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
        <TaskKanban
          serverBoardTasks={serverBoardTasks}
          members={members}
          templates={templates}
          filterAssignee={filterAssignee}
          filterScope={filterScope}
          filterTags={filterTags}
          onFilterTagsChange={setFilterTags}
          showSnoozed={showSnoozed}
          onOpenCreate={openCreate}
          onOpenTemplates={openTemplates}
          onQuickCreateFromTemplate={quickCreateFromTemplate}
          onEditTask={(t) => setEditingTask(t)}
          onTaskClick={setDetailTask}
          snoozeMutate={snoozeMutation.mutate}
          statusMutate={statusMutation.mutate}
          reorderMutate={reorderMutation.mutate}
          invalidateTasks={invalidateTasks}
          invalidateLeaderboard={() => void queryClient.invalidateQueries({ queryKey: ['tasks', 'leaderboard'] })}
          invalidateBoard={() => void queryClient.invalidateQueries({ queryKey: ['tasks', 'board'] })}
        />
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

      {/* Badge unlock — manual dismiss, no auto-close. Every tier gets a hero modal. */}
      <BadgeHeroModal
        opened={pendingHeroUnlock !== null}
        onClose={dismissHero}
        unlock={pendingHeroUnlock}
        displayName={currentUser?.displayName ?? ''}
      />
    </Container>
  );
}

