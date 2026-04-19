/**
 * Checklist view (v2.1 — Google Keep–style).
 *
 * Flat list of active tasks + a single in-progress draft row + trailing
 * ghost row + collapsed "Completed (N)" accordion below.
 *
 * See docs/features/TASK-MANAGEMENT-BRD.md §3.2 and
 *     docs/features/TASK-MANAGEMENT-ENHANCEMENTS-PLAN.yaml Phase 6
 * for the interaction model.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Stack,
  Paper,
  Text,
  Accordion,
  Box,
} from '@mantine/core';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { computeSortOrder, topOfColumn } from '../../../../shared/utils/taskSortOrder';
import type {
  StoredTask,
  FamilyMember,
  TaskStatus,
  UpdateTaskDto,
  CreateTaskDto,
  SubTask,
} from '../../../../shared/types';
import {
  TaskRow,
  CompletedRow,
  SubtaskRow,
  DraftRow,
  GhostRow,
  type RowCallbacks,
} from './ChecklistRow';

// =============================================================================
// Public API
// =============================================================================

export interface ChecklistViewProps {
  tasks: StoredTask[];
  members: FamilyMember[];
  onEdit: (task: StoredTask) => void;
}

// =============================================================================
// Draft state model
//
// A single "draft" is in-progress at any time. When anchored to a task that
// was just created, its `afterTaskId` / `parentTaskId` points at the new task.
// Server-assigned ids win out over optimistic temp ids — see createMutation.
// =============================================================================

type Draft =
  | { kind: 'top'; afterTaskId: string | null }
  | { kind: 'subtask'; parentTaskId: string };

export function ChecklistView({ tasks, members, onEdit }: ChecklistViewProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [completedExpanded, setCompletedExpanded] = useState(() => {
    try { return localStorage.getItem('tasks.checklist.completedExpanded') === 'true'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('tasks.checklist.completedExpanded', completedExpanded ? 'true' : 'false'); }
    catch { /* ignore */ }
  }, [completedExpanded]);

  const [snoozedExpanded, setSnoozedExpanded] = useState(() => {
    try { return localStorage.getItem('tasks.checklist.snoozedExpanded') === 'true'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('tasks.checklist.snoozedExpanded', snoozedExpanded ? 'true' : 'false'); }
    catch { /* ignore */ }
  }, [snoozedExpanded]);

  const [draft, setDraft] = useState<Draft | null>(null);
  // Bumped whenever we want to force-remount DraftRow (re-autofocus).
  const [draftNonce, setDraftNonce] = useState(0);
  const bumpDraft = () => setDraftNonce((n) => n + 1);

  // --------- Group + sort tasks ---------
  const { active, snoozed, completed } = useMemo(() => {
    const now = Date.now();
    const activeArr: StoredTask[] = [];
    const snoozedArr: StoredTask[] = [];
    const completedArr: StoredTask[] = [];
    for (const t of tasks) {
      const isSnoozed = t.snoozedUntil && new Date(t.snoozedUntil).getTime() > now;
      if (isSnoozed) { snoozedArr.push(t); continue; }
      if (t.status === 'cancelled') continue;
      if (t.status === 'done') { completedArr.push(t); continue; }
      activeArr.push(t);
    }
    activeArr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    snoozedArr.sort((a, b) =>
      (a.snoozedUntil ?? '').localeCompare(b.snoozedUntil ?? ''),
    );
    completedArr.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    return { active: activeArr, snoozed: snoozedArr, completed: completedArr };
  }, [tasks]);

  // --------- Mutations ---------

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskDto }) => api.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => {
      notifications.show({ message: 'Failed to save task', color: 'red' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
      startedAt,
    }: {
      id: string;
      status: TaskStatus;
      startedAt?: string;
    }) => api.updateTaskStatus(id, status, startedAt ? { startedAt } : {}),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', 'board'] });
      const snapshot = queryClient.getQueriesData<StoredTask[]>({ queryKey: ['tasks', 'board'] });
      queryClient.setQueriesData<StoredTask[]>(
        { queryKey: ['tasks', 'board'] },
        (prev) =>
          prev
            ? prev.map((t) => (t.id === id ? { ...t, status } : t))
            : prev,
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) {
        for (const [key, data] of ctx.snapshot) queryClient.setQueryData(key, data);
      }
      notifications.show({ message: 'Failed to change status', color: 'red' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'leaderboard'] });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, snoozedUntil }: { id: string; snoozedUntil: string | null }) =>
      api.snoozeTask(id, snoozedUntil),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const reorderMutation = useMutation({
    mutationFn: ({
      id,
      status,
      sortOrder,
    }: {
      id: string;
      status: TaskStatus;
      sortOrder: number;
    }) => api.reorderTask(id, status, sortOrder),
  });

  type CreateVars = { dto: CreateTaskDto; tempId: string };
  type CreateCtx = { snapshotQueries: [readonly unknown[], StoredTask[] | undefined][] };

  const createMutation = useMutation<StoredTask, Error, CreateVars, CreateCtx>({
    mutationFn: ({ dto }) => api.createTask(dto),
    onMutate: async ({ dto, tempId }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', 'board'] });
      const snapshotQueries = queryClient.getQueriesData<StoredTask[]>({
        queryKey: ['tasks', 'board'],
      });
      const now = new Date().toISOString();
      const sortOrder =
        typeof dto.sortOrder === 'number' ? dto.sortOrder : topOfColumn(null);
      const optimistic: StoredTask = {
        id: tempId,
        familyId: '',
        title: dto.title,
        description: dto.description ?? '',
        status: dto.status ?? 'todo',
        scope: dto.scope ?? 'family',
        assigneeId: dto.assigneeId ?? null,
        dueDate: dto.dueDate ?? null,
        createdAt: now,
        createdBy: '',
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        assignedAt: null,
        transitions: [],
        tags: dto.tags ?? [],
        subTasks: (dto.subTasks ?? []).map((s) => ({
          id: crypto.randomUUID(),
          title: s.title,
          completed: false,
        })),
        snoozedUntil: null,
        sortOrder,
      };
      queryClient.setQueriesData<StoredTask[]>(
        { queryKey: ['tasks', 'board'] },
        (prev) => (prev ? [...prev, optimistic] : [optimistic]),
      );
      return { snapshotQueries };
    },
    onSuccess: (serverTask, { tempId }) => {
      queryClient.setQueriesData<StoredTask[]>(
        { queryKey: ['tasks', 'board'] },
        (prev) => (prev ? prev.map((t) => (t.id === tempId ? serverTask : t)) : prev),
      );
      // If the draft is anchored to the optimistic temp id, swap to server id.
      setDraft((d) => {
        if (d && d.kind === 'top' && d.afterTaskId === tempId) {
          return { kind: 'top', afterTaskId: serverTask.id };
        }
        if (d && d.kind === 'subtask' && d.parentTaskId === tempId) {
          return { kind: 'subtask', parentTaskId: serverTask.id };
        }
        return d;
      });
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshotQueries) {
        for (const [key, data] of ctx.snapshotQueries) {
          queryClient.setQueryData(key, data);
        }
      }
      notifications.show({ message: 'Failed to create task', color: 'red' });
    },
  });

  // --------- sortOrder computation for insertions ---------
  //
  // When inserting a new task directly below an existing task T at the same
  // (top-level) scope, compute midpoint between T.sortOrder and the next
  // top-level task's sortOrder. If T is the last one, use T.sortOrder + 1.
  // If no anchor (insert at top), use topOfColumn of current minimum.

  const computeNewTopLevelSortOrder = useCallback(
    (afterTaskId: string | null): number => {
      if (afterTaskId === null) {
        const min = active.length > 0 ? active[0].sortOrder : null;
        return topOfColumn(min);
      }
      const idx = active.findIndex((t) => t.id === afterTaskId);
      if (idx === -1) {
        const min = active.length > 0 ? active[0].sortOrder : null;
        return topOfColumn(min);
      }
      const before = active[idx].sortOrder;
      const afterTask = active[idx + 1];
      return computeSortOrder(before, afterTask ? afterTask.sortOrder : null);
    },
    [active],
  );

  // --------- Helpers ---------

  const lastTopLevelId = active.length > 0 ? active[active.length - 1].id : null;

  const startGhostDraft = () => {
    setDraft({ kind: 'top', afterTaskId: lastTopLevelId });
    bumpDraft();
  };

  const patchStatus = useCallback(
    (task: StoredTask, status: TaskStatus, extra?: { startedAt?: string }) => {
      statusMutation.mutate({ id: task.id, status, ...(extra ?? {}) });
    },
    [statusMutation],
  );

  const submitDraft = (value: string) => {
    if (!draft) return;
    const trimmed = value.trim();
    if (!trimmed) return;

    if (draft.kind === 'top') {
      const tempId = `tmp-${crypto.randomUUID()}`;
      const sortOrder = computeNewTopLevelSortOrder(draft.afterTaskId);
      // Anchor the NEXT draft to this new task before we mutate so the focus
      // lands in the right place after remount.
      setDraft({ kind: 'top', afterTaskId: tempId });
      bumpDraft();
      createMutation.mutate({ dto: { title: trimmed, status: 'todo', sortOrder }, tempId });
    } else {
      const parent = tasks.find((t) => t.id === draft.parentTaskId);
      if (!parent) return;
      const newSub: SubTask = {
        id: crypto.randomUUID(),
        title: trimmed,
        completed: false,
      };
      const next = [...(parent.subTasks ?? []), newSub];
      // Optimistic cache patch
      queryClient.setQueriesData<StoredTask[]>(
        { queryKey: ['tasks', 'board'] },
        (prev) =>
          prev
            ? prev.map((t) => (t.id === parent.id ? { ...t, subTasks: next } : t))
            : prev,
      );
      updateMutation.mutate({ id: parent.id, data: { subTasks: next } });
      // Keep draft on same parent — next Enter adds another subtask.
      bumpDraft();
    }
  };

  const onDraftTab = () => {
    if (!draft) return;
    if (draft.kind === 'top' && draft.afterTaskId) {
      setDraft({ kind: 'subtask', parentTaskId: draft.afterTaskId });
      bumpDraft();
    }
  };

  const onDraftShiftTab = () => {
    if (!draft) return;
    if (draft.kind === 'subtask') {
      setDraft({ kind: 'top', afterTaskId: draft.parentTaskId });
      bumpDraft();
    }
  };

  const onDraftEnterEmpty = () => {
    if (!draft) return;
    if (draft.kind === 'subtask') {
      setDraft({ kind: 'top', afterTaskId: draft.parentTaskId });
      bumpDraft();
    }
    // Empty top-level + Enter → no-op (Escape to exit).
  };

  const onDraftBlurEmpty = () => {
    setDraft(null);
  };

  // --------- Row callbacks ---------

  const callbacks: RowCallbacks = useMemo(() => ({
    onStart: (task) => patchStatus(task, 'started'),
    onComplete: (task) => {
      const extra: { startedAt?: string } = {};
      if (!task.startedAt) extra.startedAt = new Date().toISOString();
      patchStatus(task, 'done', extra);
    },
    onMoveToTodo: (task) => patchStatus(task, 'todo'),
    onReopen: (task) => patchStatus(task, 'started'),
    onCancel: (task) => patchStatus(task, 'cancelled'),

    onAssigneeChange: (task, userId) => {
      updateMutation.mutate({ id: task.id, data: { assigneeId: userId } });
    },
    onDueDateChange: (task, date) => {
      updateMutation.mutate({ id: task.id, data: { dueDate: date } });
    },
    onSnooze: (task, snoozedUntil) => {
      snoozeMutation.mutate({ id: task.id, snoozedUntil });
    },

    onTitleChange: (task, title) => {
      if (title.trim() === task.title.trim()) return;
      updateMutation.mutate({ id: task.id, data: { title: title.trim() } });
    },

    onEnterAtRow: (task) => {
      setDraft({ kind: 'top', afterTaskId: task.id });
      bumpDraft();
    },

    onEdit: (task) => onEdit(task),

    onProjectClick: (projectTag: string) => {
      navigate(`/projects?tag=${encodeURIComponent(projectTag)}`);
    },

    onSubtaskToggle: (task, subtaskId, completed) => {
      const next = (task.subTasks ?? []).map((s) =>
        s.id === subtaskId ? { ...s, completed } : s,
      );
      queryClient.setQueriesData<StoredTask[]>(
        { queryKey: ['tasks', 'board'] },
        (prev) => (prev ? prev.map((t) => (t.id === task.id ? { ...t, subTasks: next } : t)) : prev),
      );
      updateMutation.mutate({ id: task.id, data: { subTasks: next } });
    },

    onSubtaskTitleChange: (task, subtaskId, title) => {
      const next = (task.subTasks ?? []).map((s) =>
        s.id === subtaskId ? { ...s, title: title.trim() } : s,
      );
      updateMutation.mutate({ id: task.id, data: { subTasks: next } });
    },

    onSubtaskDelete: (task, subtaskId) => {
      const next = (task.subTasks ?? []).filter((s) => s.id !== subtaskId);
      queryClient.setQueriesData<StoredTask[]>(
        { queryKey: ['tasks', 'board'] },
        (prev) => (prev ? prev.map((t) => (t.id === task.id ? { ...t, subTasks: next } : t)) : prev),
      );
      updateMutation.mutate({ id: task.id, data: { subTasks: next } });
    },

    onEnterAtSubtask: (task) => {
      setDraft({ kind: 'subtask', parentTaskId: task.id });
      bumpDraft();
    },
  }), [navigate, onEdit, patchStatus, queryClient, snoozeMutation, updateMutation]);

  // --------- Drag-reorder (top-level only) ---------

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const fromIdx = result.source.index;
    const toIdx = result.destination.index;
    if (fromIdx === toIdx) return;

    const task = active[fromIdx];
    if (!task) return;

    const without = active.filter((_, i) => i !== fromIdx);
    const before = without[toIdx - 1]?.sortOrder ?? null;
    const afterN = without[toIdx]?.sortOrder ?? null;
    const newSortOrder = computeSortOrder(before, afterN);

    // Optimistic cache patch (matches the pattern used in Kanban v2.0 — avoids
    // pangea drop animation racing the render re-sort).
    const snapshot = queryClient.getQueriesData<StoredTask[]>({ queryKey: ['tasks', 'board'] });
    queryClient.setQueriesData<StoredTask[]>(
      { queryKey: ['tasks', 'board'] },
      (prev) =>
        prev ? prev.map((t) => (t.id === task.id ? { ...t, sortOrder: newSortOrder } : t)) : prev,
    );

    reorderMutation.mutate(
      { id: task.id, status: task.status, sortOrder: newSortOrder },
      {
        onSuccess: (updated) => {
          queryClient.setQueriesData<StoredTask[]>(
            { queryKey: ['tasks', 'board'] },
            (prev) =>
              prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev,
          );
        },
        onError: () => {
          for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
          notifications.show({ message: 'Failed to reorder task', color: 'red' });
        },
      },
    );
  };

  // --------- Render helpers ---------

  const draftAtTopLevelAfter = (taskId: string) =>
    draft?.kind === 'top' && draft.afterTaskId === taskId;
  const draftSubtaskOf = (taskId: string) =>
    draft?.kind === 'subtask' && draft.parentTaskId === taskId;

  const showIndentButtons = isMobile ?? false;

  return (
    <Paper withBorder p="sm" radius="sm">
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="checklist-active">
          {(provided) => (
            <Stack gap={2} ref={provided.innerRef} {...provided.droppableProps}>
              {active.length === 0 && !draft && (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  Nothing to do yet. Click below to add a task.
                </Text>
              )}

              {/* Top-anchored draft when list is empty and user promoted from subtask */}
              {draft?.kind === 'top' && draft.afterTaskId === null && (
                <DraftRow
                  key={`draft-${draftNonce}`}
                  kind="top"
                  onSubmit={submitDraft}
                  onTab={onDraftTab}
                  onShiftTab={onDraftShiftTab}
                  onEnterEmpty={onDraftEnterEmpty}
                  onBlurEmpty={onDraftBlurEmpty}
                  showIndentButtons={showIndentButtons}
                />
              )}

              {active.map((task, index) => (
                <Box key={task.id}>
                  <Draggable draggableId={task.id} index={index}>
                    {(dragProvided) => (
                      <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}>
                        <TaskRow
                          task={task}
                          members={members}
                          callbacks={callbacks}
                          dragHandleProps={
                            dragProvided.dragHandleProps as unknown as
                              | Record<string, unknown>
                              | undefined
                          }
                        />
                      </div>
                    )}
                  </Draggable>

                  {(task.subTasks ?? []).map((st) => (
                    <SubtaskRow key={st.id} parent={task} subtask={st} callbacks={callbacks} />
                  ))}

                  {draftSubtaskOf(task.id) && (
                    <DraftRow
                      key={`draft-${draftNonce}`}
                      kind="subtask"
                      onSubmit={submitDraft}
                      onTab={onDraftTab}
                      onShiftTab={onDraftShiftTab}
                      onEnterEmpty={onDraftEnterEmpty}
                      onBlurEmpty={onDraftBlurEmpty}
                      showIndentButtons={showIndentButtons}
                    />
                  )}

                  {/* Top-level draft anchored to this task renders AFTER its
                      subtasks — clicking the ghost row (or pressing Enter on
                      a parent task) should keep the cursor visually at the
                      bottom of the subtree, not wedged between parent and
                      children. */}
                  {draftAtTopLevelAfter(task.id) && (
                    <DraftRow
                      key={`draft-${draftNonce}`}
                      kind="top"
                      onSubmit={submitDraft}
                      onTab={onDraftTab}
                      onShiftTab={onDraftShiftTab}
                      onEnterEmpty={onDraftEnterEmpty}
                      onBlurEmpty={onDraftBlurEmpty}
                      showIndentButtons={showIndentButtons}
                    />
                  )}
                </Box>
              ))}

              {provided.placeholder}

              {/* Ghost row — only when no draft is open */}
              {!draft && <GhostRow onActivate={startGhostDraft} />}
            </Stack>
          )}
        </Droppable>
      </DragDropContext>

      {snoozed.length > 0 && (
        <Accordion
          mt="md"
          value={snoozedExpanded ? 'snoozed' : null}
          onChange={(v) => setSnoozedExpanded(v === 'snoozed')}
        >
          <Accordion.Item value="snoozed">
            <Accordion.Control>
              <Text size="sm" fw={500}>Snoozed ({snoozed.length})</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={2}>
                {snoozed.map((task) => (
                  <Box key={task.id}>
                    <TaskRow task={task} members={members} callbacks={callbacks} />
                    {(task.subTasks ?? []).map((st) => (
                      <SubtaskRow key={st.id} parent={task} subtask={st} callbacks={callbacks} />
                    ))}
                  </Box>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

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
              <Stack gap={2}>
                {completed.map((task) => (
                  <CompletedRow key={task.id} task={task} members={members} callbacks={callbacks} />
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}
    </Paper>
  );
}
