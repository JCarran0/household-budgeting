import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Stack,
  TextInput,
  Group,
  Paper,
  Text,
  Accordion,
  ActionIcon,
  Button,
} from '@mantine/core';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { IconArrowBarRight, IconArrowBarToLeft } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api } from '../../lib/api';
import { computeSortOrder } from '../../../../shared/utils/taskSortOrder';
import type {
  StoredTask,
  FamilyMember,
  TaskStatus,
  UpdateTaskDto,
  CreateTaskDto,
} from '../../../../shared/types';
import { ChecklistRow } from './ChecklistRow';

export interface ChecklistViewProps {
  tasks: StoredTask[];
  members: FamilyMember[];
  onEdit: (task: StoredTask) => void;
}

/**
 * Checklist view — flat list with quick-entry input.
 *
 * Active (todo + started) render at the top in sortOrder ASC.
 * Done tasks (within 14d window per board rules) render in a collapsed
 * "Completed (N)" accordion below.
 * Cancelled and currently-snoozed tasks are filtered out entirely.
 */
export function ChecklistView({ tasks, members, onEdit }: ChecklistViewProps) {
  const queryClient = useQueryClient();

  const [completedExpanded, setCompletedExpanded] = useState(() => {
    try { return localStorage.getItem('tasks.checklist.completedExpanded') === 'true'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('tasks.checklist.completedExpanded', completedExpanded ? 'true' : 'false'); }
    catch { /* ignore */ }
  }, [completedExpanded]);

  // Quick entry state: either 'top' (top-level task) or { mode: 'subtask', parentId }
  type EntryMode = { kind: 'top' } | { kind: 'subtask'; parentId: string };
  const [entryMode, setEntryMode] = useState<EntryMode>({ kind: 'top' });
  const [entryValue, setEntryValue] = useState('');
  const entryInputRef = useRef<HTMLInputElement>(null);

  // --------- Client-side grouping ---------
  // Snoozed tasks are filtered out entirely — they don't surface in checklist.
  const { active, completed } = useMemo(() => {
    const now = Date.now();
    const activeArr: StoredTask[] = [];
    const completedArr: StoredTask[] = [];
    for (const t of tasks) {
      const snoozed = t.snoozedUntil && new Date(t.snoozedUntil).getTime() > now;
      if (snoozed) continue;
      if (t.status === 'cancelled') continue;
      if (t.status === 'done') { completedArr.push(t); continue; }
      activeArr.push(t);
    }
    activeArr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    completedArr.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    return { active: activeArr, completed: completedArr };
  }, [tasks]);

  // --------- Mutations ---------
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tasks'] });

  const createMutation = useMutation({
    mutationFn: (dto: CreateTaskDto) => api.createTask(dto),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskDto }) => api.updateTask(id, data),
    onSuccess: invalidate,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status, startedAt }: { id: string; status: TaskStatus; startedAt?: string }) =>
      api.updateTaskStatus(id, status, startedAt ? { startedAt } : {}),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'leaderboard'] });
    },
  });
  const snoozeMutation = useMutation({
    mutationFn: ({ id, snoozedUntil }: { id: string; snoozedUntil: string | null }) =>
      api.snoozeTask(id, snoozedUntil),
    onSuccess: invalidate,
  });
  const reorderMutation = useMutation({
    mutationFn: ({ id, status, sortOrder }: { id: string; status: TaskStatus; sortOrder: number }) =>
      api.reorderTask(id, status, sortOrder),
    // NOTE: no auto-invalidate — we apply optimistic sortOrder locally via
    // the queryClient cache (see onDragEnd) to keep pangea-dnd's drop
    // animation in sync with the rendered list.
  });

  // --------- Handlers ---------

  const handleEntrySubmit = () => {
    const trimmed = entryValue.trim();
    if (!trimmed) return;

    if (entryMode.kind === 'top') {
      createMutation.mutate({ title: trimmed }, {
        onSuccess: () => { setEntryValue(''); entryInputRef.current?.focus(); },
      });
    } else {
      const parent = tasks.find((t) => t.id === entryMode.parentId);
      if (!parent) return;
      const updatedSubTasks = [
        ...(parent.subTasks ?? []),
        { id: crypto.randomUUID(), title: trimmed, completed: false },
      ];
      updateMutation.mutate(
        { id: parent.id, data: { subTasks: updatedSubTasks } },
        { onSuccess: () => { setEntryValue(''); entryInputRef.current?.focus(); } }
      );
    }
  };

  const handleEntryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEntrySubmit();
    } else if (e.key === 'Escape') {
      setEntryValue('');
      setEntryMode({ kind: 'top' });
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Outdent: back to top-level
        if (entryMode.kind === 'subtask') setEntryMode({ kind: 'top' });
      } else {
        // Indent: subtask mode under the first (top) active task
        if (entryMode.kind === 'top' && active.length > 0) {
          setEntryMode({ kind: 'subtask', parentId: active[0].id });
        }
      }
    }
  };

  const onStartedToggle = (task: StoredTask, started: boolean) => {
    // started checkbox toggles between todo ↔ started
    statusMutation.mutate({ id: task.id, status: started ? 'started' : 'todo' });
  };

  const onDoneToggle = (task: StoredTask, done: boolean) => {
    if (done) {
      // synthetic startedAt stamp if task was todo (startedAt was null)
      const opts: { startedAt?: string } = {};
      if (!task.startedAt) opts.startedAt = new Date().toISOString();
      statusMutation.mutate({ id: task.id, status: 'done', ...opts });
    } else {
      statusMutation.mutate({ id: task.id, status: 'started' });
    }
  };

  const onTitleSave = (task: StoredTask, title: string) => {
    updateMutation.mutate({ id: task.id, data: { title } });
  };

  const onMetadataSave = (
    task: StoredTask,
    patch: { assigneeId?: string | null; dueDate?: string | null }
  ) => {
    updateMutation.mutate({ id: task.id, data: patch });
  };

  const onSnooze = (task: StoredTask, snoozedUntil: string | null) => {
    snoozeMutation.mutate({ id: task.id, snoozedUntil });
  };

  const onCancel = (task: StoredTask) => {
    statusMutation.mutate({ id: task.id, status: 'cancelled' });
  };

  const onSubTaskToggle = (task: StoredTask, subTaskId: string, completed: boolean) => {
    const updatedSubTasks = (task.subTasks ?? []).map((st) =>
      st.id === subTaskId ? { ...st, completed } : st
    );
    updateMutation.mutate({ id: task.id, data: { subTasks: updatedSubTasks } });
  };

  // Drag reorder within active list.
  //
  // We optimistically patch the React Query cache so the rendered list reflects
  // the new sortOrder immediately — pangea-dnd's drop animation then lines up
  // with the post-drop position instead of briefly snapping back.
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const fromIdx = result.source.index;
    const toIdx = result.destination.index;
    if (fromIdx === toIdx) return;

    const task = active[fromIdx];
    if (!task) return;

    // Compute neighbors in the destination position (excluding dragged task)
    const without = active.filter((_, i) => i !== fromIdx);
    const before = without[toIdx - 1]?.sortOrder ?? null;
    const after = without[toIdx]?.sortOrder ?? null;
    const newSortOrder = computeSortOrder(before, after);

    // Optimistic cache update — patch every board-board query's cached data.
    // We update sortOrder on the moved task so the `active` memo re-sorts it
    // into the dropped position on the next render.
    const snapshot = queryClient.getQueriesData<StoredTask[]>({ queryKey: ['tasks', 'board'] });
    queryClient.setQueriesData<StoredTask[]>({ queryKey: ['tasks', 'board'] }, (prev) =>
      prev ? prev.map((t) => (t.id === task.id ? { ...t, sortOrder: newSortOrder } : t)) : prev
    );

    reorderMutation.mutate(
      { id: task.id, status: task.status, sortOrder: newSortOrder },
      {
        onSuccess: (updatedTask) => {
          queryClient.setQueriesData<StoredTask[]>({ queryKey: ['tasks', 'board'] }, (prev) =>
            prev ? prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)) : prev
          );
        },
        onError: () => {
          // Roll back the cache to what it was before the optimistic patch.
          for (const [key, data] of snapshot) {
            queryClient.setQueryData(key, data);
          }
          notifications.show({ message: 'Failed to reorder task', color: 'red' });
        },
      }
    );
  };

  return (
    <Paper withBorder p="sm" radius="sm">
      {/* Quick entry */}
      <Group gap="xs" mb="sm" align="center" pl={entryMode.kind === 'subtask' ? 'xl' : 0}>
        <ActionIcon
          variant="subtle"
          size="sm"
          disabled={entryMode.kind === 'top' || active.length === 0}
          aria-label="Outdent"
          onClick={() => setEntryMode({ kind: 'top' })}
        >
          <IconArrowBarToLeft size={14} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          size="sm"
          disabled={entryMode.kind !== 'top' || active.length === 0}
          aria-label="Indent"
          onClick={() => active[0] && setEntryMode({ kind: 'subtask', parentId: active[0].id })}
        >
          <IconArrowBarRight size={14} />
        </ActionIcon>
        <TextInput
          ref={entryInputRef}
          size="sm"
          style={{ flex: 1 }}
          placeholder={
            entryMode.kind === 'top'
              ? 'Add a task… (Enter to save, Tab to indent)'
              : 'Add a sub-task… (Shift-Tab to outdent)'
          }
          value={entryValue}
          onChange={(e) => setEntryValue(e.currentTarget.value)}
          onKeyDown={handleEntryKeyDown}
        />
        <Button size="xs" onClick={handleEntrySubmit} disabled={!entryValue.trim()}>
          Add
        </Button>
      </Group>

      {/* Active list */}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="checklist-active">
          {(provided) => (
            <Stack gap={4} ref={provided.innerRef} {...provided.droppableProps}>
              {active.length === 0 && (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  Nothing active. Add one above.
                </Text>
              )}
              {active.map((task, index) => (
                <Draggable key={task.id} draggableId={task.id} index={index}>
                  {(dragProvided) => (
                    <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                      <ChecklistRow
                        task={task}
                        members={members}
                        dragHandleProps={dragProvided.dragHandleProps as unknown as Record<string, unknown> | undefined}
                        onStartedToggle={onStartedToggle}
                        onDoneToggle={onDoneToggle}
                        onTitleSave={onTitleSave}
                        onMetadataSave={onMetadataSave}
                        onSnooze={onSnooze}
                        onCancel={onCancel}
                        onEdit={onEdit}
                        onSubTaskToggle={onSubTaskToggle}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </Stack>
          )}
        </Droppable>
      </DragDropContext>

      {/* Completed accordion */}
      {completed.length > 0 && (
        <Accordion
          mt="md"
          value={completedExpanded ? 'completed' : null}
          onChange={(v) => setCompletedExpanded(v === 'completed')}
        >
          <Accordion.Item value="completed">
            <Accordion.Control>
              <Text size="sm" fw={500}>Completed ({completed.length})</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={4}>
                {completed.map((task) => (
                  <ChecklistRow
                    key={task.id}
                    task={task}
                    members={members}
                    onStartedToggle={onStartedToggle}
                    onDoneToggle={onDoneToggle}
                    onTitleSave={onTitleSave}
                    onMetadataSave={onMetadataSave}
                    onSnooze={onSnooze}
                    onCancel={onCancel}
                    onEdit={onEdit}
                    onSubTaskToggle={onSubTaskToggle}
                  />
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}
    </Paper>
  );
}
