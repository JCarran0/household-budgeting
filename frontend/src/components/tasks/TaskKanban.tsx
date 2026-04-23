import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Group,
  Menu,
  MultiSelect,
  SimpleGrid,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import {
  IconChevronDown,
  IconPlus,
  IconSettings,
} from '@tabler/icons-react';
import type { UseMutateFunction } from '@tanstack/react-query';
import { KanbanColumn } from './KanbanColumn';
import { SnoozedColumn } from './SnoozedColumn';
import {
  BOARD_COLUMNS,
  SNOOZED_DROPPABLE_ID,
  bySnoozeAsc,
  isSnoozed,
  matchesBoardFilters,
  sortBoardForRender,
  spliceBoardForDrop,
} from './boardOrdering';
import { computeSortOrder } from '../../../../shared/utils/taskSortOrder';
import type {
  FamilyMember,
  StoredTask,
  StoredTaskTemplate,
  TaskStatus,
} from '../../../../shared/types';

export interface TaskKanbanProps {
  /** Server-sourced board tasks — synced into local state for optimistic DnD. */
  serverBoardTasks: StoredTask[];
  members: FamilyMember[];
  templates: StoredTaskTemplate[];

  /** Filter state owned by the parent (shared with the header + Checklist view). */
  filterAssignee: string | null;
  filterScope: string;
  filterTags: string[];
  onFilterTagsChange: (tags: string[]) => void;

  /** Show the synthetic Snoozed column to the left of Todo. */
  showSnoozed: boolean;

  /** Open the create / template management modals (owned by parent). */
  onOpenCreate: () => void;
  onOpenTemplates: () => void;
  onQuickCreateFromTemplate: (template: StoredTaskTemplate) => void;

  /** Task selection — open detail / edit modals on the parent. */
  onEditTask: (task: StoredTask) => void;
  onTaskClick: (task: StoredTask) => void;

  /** Mutation.mutate handles — TaskKanban fires them during DnD. */
  snoozeMutate: UseMutateFunction<StoredTask, Error, { id: string; snoozedUntil: string | null }>;
  statusMutate: UseMutateFunction<StoredTask, Error, { id: string; status: TaskStatus }>;
  reorderMutate: UseMutateFunction<StoredTask, Error, { id: string; status: TaskStatus; sortOrder: number }>;

  /** Invalidation callbacks — parent owns the QueryClient. */
  invalidateTasks: () => void;
  invalidateLeaderboard: () => void;
  invalidateBoard: () => void;
}

export function TaskKanban({
  serverBoardTasks,
  members,
  templates,
  filterAssignee,
  filterScope,
  filterTags,
  onFilterTagsChange,
  showSnoozed,
  onOpenCreate,
  onOpenTemplates,
  onQuickCreateFromTemplate,
  onEditTask,
  onTaskClick,
  snoozeMutate,
  statusMutate,
  reorderMutate,
  invalidateTasks,
  invalidateLeaderboard,
  invalidateBoard,
}: TaskKanbanProps) {
  // Local state for board data — drives rendering so drag updates are
  // synchronous. Synced from React Query whenever the server data changes.
  //
  // IMPORTANT: sort once on receipt, then preserve render order through local
  // mutations (splice). If we re-sorted on every render, pangea-dnd's drop
  // animation would race with the re-ordering and the dragged item would
  // briefly snap back to its source position before React re-rendered it.
  const [boardTasks, setBoardTasks] = useState<StoredTask[]>([]);
  useEffect(() => {
    setBoardTasks(sortBoardForRender(serverBoardTasks));
  }, [serverBoardTasks]);

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
    // status change — route through statusMutate instead.
    const isTerminalDrop = newStatus === 'done' || newStatus === 'cancelled';

    const previousBoard = boardTasks;

    if (isTerminalDrop) {
      // Optimistic: drop the task into the destination column so the render
      // doesn't snap back during the request. The server refetch on success
      // will restore the canonical ordering.
      setBoardTasks((prev) =>
        spliceBoardForDrop(prev, taskId, newStatus, task.sortOrder, result.destination!.index),
      );

      statusMutate(
        { id: taskId, status: newStatus },
        {
          onSuccess: (updatedTask) => {
            setBoardTasks((prev) =>
              prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
            );
            invalidateLeaderboard();
            invalidateBoard();
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

    reorderMutate(
      { id: taskId, status: newStatus, sortOrder: newSortOrder },
      {
        onSuccess: (updatedTask) => {
          // Replace the optimistic record with the canonical server record —
          // in-place, preserving array order.
          setBoardTasks((prev) =>
            prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
          );
          if (task.status !== newStatus) {
            invalidateLeaderboard();
          }
        },
        onError: () => {
          setBoardTasks(previousBoard);
          notifications.show({ message: 'Failed to move task', color: 'red' });
        },
      },
    );
  };

  return (
    <>
      {/* Filters + Create */}
      <Group gap="sm" mb="md" justify="space-between" wrap="wrap">
        <Group gap="sm" wrap="wrap">
          {allTags.length > 0 && (
            <MultiSelect
              placeholder="Tags"
              size="xs"
              clearable
              value={filterTags}
              onChange={onFilterTagsChange}
              data={allTags}
              w={200}
            />
          )}
        </Group>

        {/* Split button: Create + template dropdown */}
        <Button.Group>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onOpenCreate}>
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
                  <Menu.Item key={t.id} onClick={() => onQuickCreateFromTemplate(t)}>
                    {t.name}
                  </Menu.Item>
                ))
              )}
              <Menu.Divider />
              <Menu.Item leftSection={<IconSettings size={14} />} onClick={onOpenTemplates}>
                Manage Templates...
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Button.Group>
      </Group>

      {/* Kanban Board — stacks vertically on mobile, columns on ≥ sm. */}
      <DragDropContext onDragEnd={onDragEnd}>
        <SimpleGrid
          cols={{ base: 1, sm: showSnoozed ? 4 : 3 }}
          spacing="md"
          verticalSpacing="md"
        >
          {/* Snoozed column renders to the LEFT of Todo when the toggle is on. */}
          {showSnoozed && (
            <SnoozedColumn
              tasks={snoozedTasks}
              members={members}
              onTaskClick={onTaskClick}
              onUnsnooze={(taskId) => snoozeMutate({ id: taskId, snoozedUntil: null })}
              onEdit={onEditTask}
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
              onTaskClick={onTaskClick}
              onSnooze={(taskId, snoozedUntil) =>
                snoozeMutate({ id: taskId, snoozedUntil })
              }
              onCancel={(taskId) => statusMutate(
                { id: taskId, status: 'cancelled' },
                { onSuccess: invalidateTasks }
              )}
              onEdit={onEditTask}
            />
          ))}
        </SimpleGrid>
      </DragDropContext>
    </>
  );
}
