/**
 * Checklist view row components (v2.1 — Google Keep–style redesign).
 *
 * Exported row variants:
 *   - TaskRow       — top-level active task (todo or started)
 *   - CompletedRow  — done task (strikethrough, static check, kebab)
 *   - SubtaskRow    — binary subtask (checkbox + inline title + delete)
 *   - DraftRow      — a single in-progress new row (top-level or subtask)
 *   - GhostRow      — the static "Add a task…" placeholder at the bottom
 *
 * All state + mutation logic lives in ChecklistView — rows just render and
 * emit events.
 */

import { useState, useRef, useEffect, forwardRef, useImperativeHandle, type KeyboardEvent } from 'react';
import {
  Group,
  TextInput,
  ActionIcon,
  Menu,
  Button,
  Text,
  Badge,
  Avatar,
  Tooltip,
  Checkbox,
  Modal,
  Stack,
  Box,
  ThemeIcon,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconDotsVertical,
  IconBellZ,
  IconBellOff,
  IconBan,
  IconEdit,
  IconGripVertical,
  IconCalendar,
  IconHammer,
  IconCheck,
  IconPlayerPlay,
  IconArrowBackUp,
  IconUserCircle,
  IconX,
  IconRefresh,
  IconPlus,
} from '@tabler/icons-react';
import { format, parseISO, formatDistanceToNowStrict, isPast } from 'date-fns';
import type { StoredTask, FamilyMember, SubTask } from '../../../../shared/types';
import { resolveSnoozeDate } from '../../../../shared/utils/taskSnooze';
import { isProjectTag } from '../../../../shared/utils/projectHelpers';
import { userColor } from '../../utils/userColor';
import { useProjectTagLookup } from '../../hooks/useProjectTagLookup';

// =============================================================================
// Callbacks — passed down to every row variant that needs them
// =============================================================================

export interface RowCallbacks {
  // Status transitions
  onStart: (task: StoredTask) => void;       // todo → started
  onComplete: (task: StoredTask) => void;    // * → done
  onMoveToTodo: (task: StoredTask) => void;  // started → todo
  onReopen: (task: StoredTask) => void;      // done → started
  onCancel: (task: StoredTask) => void;      // → cancelled

  // Metadata
  onAssigneeChange: (task: StoredTask, userId: string | null) => void;
  onDueDateChange: (task: StoredTask, date: string | null) => void;
  onSnooze: (task: StoredTask, snoozedUntil: string | null) => void;

  // Title edits
  onTitleChange: (task: StoredTask, title: string) => void;

  // Entry flow
  onEnterAtRow: (task: StoredTask) => void;

  // Full edit modal
  onEdit: (task: StoredTask) => void;

  // Project chip navigation
  onProjectClick?: (projectTag: string) => void;

  // Subtasks
  onSubtaskToggle: (task: StoredTask, subtaskId: string, completed: boolean) => void;
  onSubtaskTitleChange: (task: StoredTask, subtaskId: string, title: string) => void;
  onSubtaskDelete: (task: StoredTask, subtaskId: string) => void;
  onEnterAtSubtask: (task: StoredTask, subtaskId: string) => void;
}

// =============================================================================
// Title input — shared inline-editable text field used by most row variants
// =============================================================================

export interface TitleInputHandle {
  focus(): void;
  select(): void;
}

interface TitleInputProps {
  value: string;
  placeholder?: string;
  strikethrough?: boolean;
  disabled?: boolean;
  onCommit: (title: string) => void;
  onEnter?: () => void;
  onTab?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onEscape?: () => void;
}

const TitleInput = forwardRef<TitleInputHandle, TitleInputProps>(function TitleInput(
  { value, placeholder, strikethrough, disabled, onCommit, onEnter, onTab, onEscape },
  ref,
) {
  const [draft, setDraft] = useState(value);
  const committedRef = useRef(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resync when external value changes (e.g., server mutation lands)
  useEffect(() => {
    if (value !== committedRef.current) {
      setDraft(value);
      committedRef.current = value;
    }
  }, [value]);

  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current?.focus();
      const len = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(len, len);
    },
    select() {
      inputRef.current?.select();
    },
  }), []);

  const commit = () => {
    if (draft !== committedRef.current) {
      committedRef.current = draft;
      onCommit(draft);
    }
  };

  return (
    <TextInput
      ref={inputRef}
      variant="unstyled"
      size="sm"
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          onEnter?.();
        } else if (e.key === 'Tab') {
          onTab?.(e);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
          onEscape?.();
        }
      }}
      styles={{
        input: {
          textDecoration: strikethrough ? 'line-through' : undefined,
          color: strikethrough ? 'var(--mantine-color-dimmed)' : undefined,
          paddingLeft: 4,
          paddingRight: 4,
        },
      }}
      style={{ flex: 1, minWidth: 0 }}
    />
  );
});

// =============================================================================
// TaskRow — top-level active task (todo or started)
// =============================================================================

export interface TaskRowProps {
  task: StoredTask;
  members: FamilyMember[];
  dragHandleProps?: Record<string, unknown>;
  callbacks: RowCallbacks;
}

export const TaskRow = forwardRef<TitleInputHandle, TaskRowProps>(function TaskRow(
  { task, members, dragHandleProps, callbacks },
  ref,
) {
  const isStarted = task.status === 'started';
  const actionLabel = isStarted ? 'Done' : 'Start';
  const actionIcon = isStarted ? <IconCheck size={12} /> : <IconPlayerPlay size={12} />;
  const actionColor = isStarted ? 'green' : 'blue';
  const onActionClick = () => (isStarted ? callbacks.onComplete(task) : callbacks.onStart(task));

  return (
    <Group wrap="nowrap" gap="xs" px={4} py={4} align="center"
      role="listitem"
      style={{ borderRadius: 'var(--mantine-radius-sm)' }}
    >
      {dragHandleProps && (
        <ActionIcon variant="transparent" size="xs" c="dimmed" {...dragHandleProps} aria-label="Drag">
          <IconGripVertical size={14} />
        </ActionIcon>
      )}

      <Button
        size="xs"
        variant="light"
        color={actionColor}
        leftSection={actionIcon}
        onClick={onActionClick}
        style={{ minWidth: 96, flexShrink: 0 }}
      >
        {actionLabel}
      </Button>

      <TitleInput
        ref={ref}
        value={task.title}
        placeholder="Task…"
        onCommit={(title) => callbacks.onTitleChange(task, title)}
        onEnter={() => callbacks.onEnterAtRow(task)}
      />

      <TaskMetadataChips task={task} members={members} onProjectClick={callbacks.onProjectClick} />

      <TaskKebabMenu task={task} members={members} callbacks={callbacks} />
    </Group>
  );
});

// =============================================================================
// CompletedRow — done task
// =============================================================================

export interface CompletedRowProps {
  task: StoredTask;
  members: FamilyMember[];
  callbacks: RowCallbacks;
}

export function CompletedRow({ task, members, callbacks }: CompletedRowProps) {
  return (
    <Group wrap="nowrap" gap="xs" px={4} py={4} align="center"
      role="listitem"
      style={{ borderRadius: 'var(--mantine-radius-sm)', opacity: 0.7 }}
    >
      <Box style={{ width: 96, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <ThemeIcon size="sm" radius="xl" color="green" variant="light">
          <IconCheck size={14} />
        </ThemeIcon>
      </Box>

      <TitleInput
        value={task.title}
        strikethrough
        onCommit={(title) => callbacks.onTitleChange(task, title)}
      />

      <TaskMetadataChips task={task} members={members} onProjectClick={callbacks.onProjectClick} />

      <TaskKebabMenu task={task} members={members} callbacks={callbacks} />
    </Group>
  );
}

// =============================================================================
// SubtaskRow — binary subtask
// =============================================================================

export interface SubtaskRowProps {
  parent: StoredTask;
  subtask: SubTask;
  callbacks: RowCallbacks;
}

export const SubtaskRow = forwardRef<TitleInputHandle, SubtaskRowProps>(function SubtaskRow(
  { parent, subtask, callbacks },
  ref,
) {
  return (
    <Group wrap="nowrap" gap="xs" pl="xl" pr={4} py={2} align="center" role="listitem"
      style={{
        borderLeft: '2px solid var(--mantine-color-dark-5)',
        marginLeft: 'calc(1rem + 4px)',
      }}
    >
      <Checkbox
        size="sm"
        checked={subtask.completed}
        onChange={(e) => callbacks.onSubtaskToggle(parent, subtask.id, e.currentTarget.checked)}
        aria-label="Subtask complete"
      />
      <TitleInput
        ref={ref}
        value={subtask.title}
        placeholder="Sub-task…"
        strikethrough={subtask.completed}
        onCommit={(title) => callbacks.onSubtaskTitleChange(parent, subtask.id, title)}
        onEnter={() => callbacks.onEnterAtSubtask(parent, subtask.id)}
      />
      <ActionIcon
        variant="subtle"
        size="sm"
        c="dimmed"
        onClick={() => callbacks.onSubtaskDelete(parent, subtask.id)}
        aria-label="Delete subtask"
      >
        <IconX size={12} />
      </ActionIcon>
    </Group>
  );
});

// =============================================================================
// DraftRow — the single in-progress new row (top-level or subtask)
// =============================================================================

export type DraftKind = 'top' | 'subtask';

export interface DraftRowProps {
  kind: DraftKind;
  onSubmit: (value: string) => void;
  onTab: () => void;
  onShiftTab: () => void;
  onEnterEmpty: () => void;
  onBlurEmpty: () => void;
  showIndentButtons?: boolean;  // mobile fallback
}

export const DraftRow = forwardRef<TitleInputHandle, DraftRowProps>(function DraftRow(
  { kind, onSubmit, onTab, onShiftTab, onEnterEmpty, onBlurEmpty, showIndentButtons },
  ref,
) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus() { inputRef.current?.focus(); },
    select() { inputRef.current?.select(); },
  }), []);

  // Autofocus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const trimmed = value.trim();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (trimmed) {
        onSubmit(trimmed);
        setValue('');
      } else {
        onEnterEmpty();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (!trimmed) {
        if (e.shiftKey) onShiftTab();
        else onTab();
      }
      // Non-empty Tab/Shift-Tab: swallow (per D21 — no reparent of existing content).
    } else if (e.key === 'Escape') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleBlur = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setValue('');
    } else {
      onBlurEmpty();
    }
  };

  const isSubtask = kind === 'subtask';

  return (
    <Group
      wrap="nowrap"
      gap="xs"
      pl={isSubtask ? 'xl' : 4}
      pr={4}
      py={isSubtask ? 2 : 4}
      align="center"
      style={{
        borderLeft: isSubtask ? '2px dashed var(--mantine-color-dark-5)' : undefined,
        marginLeft: isSubtask ? 'calc(1rem + 4px)' : undefined,
      }}
    >
      {/* Left-hand slot: mirror TaskRow action slot width so input aligns */}
      {!isSubtask && <Box style={{ width: 96, flexShrink: 0 }} />}
      {isSubtask && <IconPlus size={14} style={{ opacity: 0.4 }} />}

      <TextInput
        ref={inputRef}
        variant="unstyled"
        size="sm"
        value={value}
        placeholder={isSubtask ? 'New sub-task' : 'New task'}
        onChange={(e) => setValue(e.currentTarget.value)}
        onKeyDown={handleKey}
        onBlur={handleBlur}
        style={{ flex: 1, minWidth: 0 }}
        styles={{ input: { paddingLeft: 4, paddingRight: 4 } }}
      />

      {showIndentButtons && (
        <Group gap={2} wrap="nowrap">
          <ActionIcon
            size="xs"
            variant="subtle"
            aria-label="Outdent"
            onClick={() => onShiftTab()}
            disabled={!isSubtask}
          >
            <IconArrowBackUp size={12} />
          </ActionIcon>
          <ActionIcon
            size="xs"
            variant="subtle"
            aria-label="Indent"
            onClick={() => onTab()}
            disabled={isSubtask}
          >
            <IconArrowBackUp size={12} style={{ transform: 'scaleX(-1)' }} />
          </ActionIcon>
        </Group>
      )}
    </Group>
  );
});

// =============================================================================
// GhostRow — static placeholder at the bottom of the active list
// =============================================================================

export interface GhostRowProps {
  onActivate: () => void;
}

export function GhostRow({ onActivate }: GhostRowProps) {
  return (
    <Group
      wrap="nowrap"
      gap="xs"
      px={4}
      py={4}
      align="center"
      onClick={onActivate}
      tabIndex={0}
      role="button"
      aria-label="Add a task"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onActivate(); }}
      style={{
        cursor: 'text',
        borderRadius: 'var(--mantine-radius-sm)',
        color: 'var(--mantine-color-dimmed)',
      }}
    >
      <Box style={{ width: 96, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <IconPlus size={14} style={{ opacity: 0.6 }} />
      </Box>
      <Text size="sm" c="dimmed">Add a task…</Text>
    </Group>
  );
}

// =============================================================================
// TaskMetadataChips — renders chips only when values are set
// =============================================================================

interface TaskMetadataChipsProps {
  task: StoredTask;
  members: FamilyMember[];
  onProjectClick?: (projectTag: string) => void;
}

function TaskMetadataChips({ task, members, onProjectClick }: TaskMetadataChipsProps) {
  const projectTagLookup = useProjectTagLookup();
  const assignee = members.find((m) => m.userId === task.assigneeId) ?? null;
  const snoozed = !!task.snoozedUntil && new Date(task.snoozedUntil).getTime() > Date.now();
  const isOverdue =
    !!task.dueDate &&
    task.status !== 'done' &&
    task.status !== 'cancelled' &&
    isPast(parseISO(task.dueDate));

  const projectTag = (task.tags ?? []).find(isProjectTag);
  const projectMeta = projectTag ? projectTagLookup.get(projectTag) : undefined;
  const projectChipLabel = projectMeta?.name ?? projectTag;

  return (
    <>
      {assignee && (
        <Tooltip label={assignee.displayName}>
          <Avatar size="xs" radius="xl" color={userColor(assignee)}>
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
      {snoozed && task.snoozedUntil && (
        <Badge size="xs" variant="light" color="indigo" leftSection={<IconBellZ size={10} />}>
          {formatDistanceToNowStrict(new Date(task.snoozedUntil), { addSuffix: true })}
        </Badge>
      )}
      {projectChipLabel && projectTag && (
        <Tooltip label="Go to project">
          <Badge
            size="xs"
            variant="filled"
            color="orange"
            leftSection={<IconHammer size={9} />}
            style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onProjectClick?.(projectTag); }}
          >
            {projectChipLabel}
          </Badge>
        </Tooltip>
      )}
    </>
  );
}

// =============================================================================
// TaskKebabMenu — all metadata setters + status reversal paths
// =============================================================================

interface TaskKebabMenuProps {
  task: StoredTask;
  members: FamilyMember[];
  callbacks: RowCallbacks;
}

function TaskKebabMenu({ task, members, callbacks }: TaskKebabMenuProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [customSnoozeOpen, setCustomSnoozeOpen] = useState(false);
  const [customSnoozeDate, setCustomSnoozeDate] = useState<Date | null>(null);

  const isDone = task.status === 'done';
  const isStarted = task.status === 'started';

  const snoozeAllowed = !isDone && task.status !== 'cancelled';

  const handleSnoozeOption = (option: 'tomorrow' | 'next_week' | 'next_month') => {
    const iso = resolveSnoozeDate(option, new Date(), new Date().getTimezoneOffset());
    callbacks.onSnooze(task, iso);
  };

  const confirmCustomSnooze = () => {
    if (!customSnoozeDate) return;
    const ymd = format(customSnoozeDate, 'yyyy-MM-dd');
    const iso = resolveSnoozeDate('custom', new Date(), new Date().getTimezoneOffset(), ymd);
    callbacks.onSnooze(task, iso);
    setCustomSnoozeOpen(false);
    setCustomSnoozeDate(null);
  };

  return (
    <>
      <Menu position="bottom-end" withinPortal shadow="md" width={220}>
        <Menu.Target>
          <ActionIcon variant="subtle" size="sm" aria-label="Row actions">
            <IconDotsVertical size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {/* Assignee */}
          <Menu.Sub>
            <Menu.Sub.Target>
              <Menu.Sub.Item leftSection={<IconUserCircle size={14} />}>
                Assign to…
              </Menu.Sub.Item>
            </Menu.Sub.Target>
            <Menu.Sub.Dropdown>
              <Menu.Item
                onClick={() => callbacks.onAssigneeChange(task, null)}
                rightSection={task.assigneeId === null ? <IconCheck size={12} /> : null}
              >
                Unassigned
              </Menu.Item>
              <Menu.Divider />
              {members.map((m) => (
                <Menu.Item
                  key={m.userId}
                  onClick={() => callbacks.onAssigneeChange(task, m.userId)}
                  leftSection={
                    <Avatar size="xs" radius="xl" color={userColor(m)}>
                      {m.displayName.charAt(0).toUpperCase()}
                    </Avatar>
                  }
                  rightSection={task.assigneeId === m.userId ? <IconCheck size={12} /> : null}
                >
                  {m.displayName}
                </Menu.Item>
              ))}
            </Menu.Sub.Dropdown>
          </Menu.Sub>

          {/* Due date */}
          <Menu.Item leftSection={<IconCalendar size={14} />} onClick={() => setDueDateOpen(true)}>
            {task.dueDate ? `Due ${format(parseISO(task.dueDate), 'MMM d, yyyy')}` : 'Due date…'}
          </Menu.Item>

          {/* Snooze */}
          {snoozeAllowed && (
            <Menu.Sub>
              <Menu.Sub.Target>
                <Menu.Sub.Item leftSection={<IconBellZ size={14} />}>
                  Snooze
                </Menu.Sub.Item>
              </Menu.Sub.Target>
              <Menu.Sub.Dropdown>
                <Menu.Item onClick={() => handleSnoozeOption('tomorrow')}>Tomorrow</Menu.Item>
                <Menu.Item onClick={() => handleSnoozeOption('next_week')}>Next week</Menu.Item>
                <Menu.Item onClick={() => handleSnoozeOption('next_month')}>Next month</Menu.Item>
                <Menu.Divider />
                <Menu.Item onClick={() => setCustomSnoozeOpen(true)}>Custom…</Menu.Item>
              </Menu.Sub.Dropdown>
            </Menu.Sub>
          )}

          {/* Wake now — only if currently snoozed */}
          {task.snoozedUntil && new Date(task.snoozedUntil).getTime() > Date.now() && (
            <Menu.Item
              leftSection={<IconBellOff size={14} />}
              onClick={() => callbacks.onSnooze(task, null)}
            >
              Wake now
            </Menu.Item>
          )}

          <Menu.Divider />

          {/* Backwards status moves */}
          {isStarted && (
            <Menu.Item
              leftSection={<IconArrowBackUp size={14} />}
              onClick={() => callbacks.onMoveToTodo(task)}
            >
              Move to todo
            </Menu.Item>
          )}
          {isDone && (
            <Menu.Item
              leftSection={<IconRefresh size={14} />}
              onClick={() => callbacks.onReopen(task)}
            >
              Reopen
            </Menu.Item>
          )}

          {/* Edit */}
          <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => callbacks.onEdit(task)}>
            Edit…
          </Menu.Item>

          {/* Cancel */}
          {!isDone && task.status !== 'cancelled' && (
            <>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconBan size={14} />}
                onClick={() => setConfirmCancel(true)}
              >
                Cancel task
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>

      {/* Due date modal */}
      <Modal
        opened={dueDateOpen}
        onClose={() => setDueDateOpen(false)}
        title="Due date"
        size="sm"
        withinPortal
      >
        <Stack gap="sm">
          <DatePickerInput
            label="Due date"
            value={task.dueDate ? new Date(task.dueDate) : null}
            onChange={(val) => {
              const iso = val ? format(new Date(val), 'yyyy-MM-dd') : null;
              callbacks.onDueDateChange(task, iso);
            }}
            clearable
            popoverProps={{ withinPortal: true }}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDueDateOpen(false)}>Done</Button>
          </Group>
        </Stack>
      </Modal>

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
            <Button variant="subtle" onClick={() => setConfirmCancel(false)}>Keep task</Button>
            <Button
              color="red"
              onClick={() => { callbacks.onCancel(task); setConfirmCancel(false); }}
            >
              Cancel task
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Custom snooze */}
      <Modal
        opened={customSnoozeOpen}
        onClose={() => { setCustomSnoozeOpen(false); setCustomSnoozeDate(null); }}
        title="Snooze until…"
        size="sm"
        withinPortal
      >
        <Stack gap="sm">
          <DatePickerInput
            label="Wake date"
            value={customSnoozeDate}
            onChange={(val) => setCustomSnoozeDate(val ? new Date(val) : null)}
            minDate={new Date()}
            popoverProps={{ withinPortal: true }}
          />
          <Text size="xs" c="dimmed">Task will reappear at 6am local.</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => { setCustomSnoozeOpen(false); setCustomSnoozeDate(null); }}>
              Cancel
            </Button>
            <Button disabled={!customSnoozeDate} onClick={confirmCustomSnooze}>
              Snooze
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
