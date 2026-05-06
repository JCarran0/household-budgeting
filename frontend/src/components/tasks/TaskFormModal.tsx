import React, { useState } from 'react';
import {
  Avatar,
  Button,
  Group,
  Menu,
  Stack,
  TextInput,
  Textarea,
  Select,
  SegmentedControl,
  TagsInput,
  ActionIcon,
  CloseButton,
  Text,
  Tooltip,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import {
  IconPlus,
  IconPlayerPlay,
  IconArrowUp,
  IconArrowDown,
  IconUserCircle,
  IconCheck,
} from '@tabler/icons-react';
import { ResponsiveModal } from '../ResponsiveModal';
import { userColor, userAvatarStyle } from '../../utils/userColor';
import type {
  StoredTask,
  TaskScope,
  FamilyMember,
  CreateTaskDto,
  UpdateTaskDto,
  SubTask,
} from '../../../../shared/types';

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

/**
 * Local form-state shape for a subtask row. Holds the editable fields the
 * user can change in this modal (title, per-row assignee). On submit we
 * either map back to the wire `SubTask` (edit) or `{ title }[]` (create).
 */
interface SubtaskDraft {
  title: string;
  assigneeId: string | null;
}

export function TaskFormModal({ opened, onClose, onSubmit, members, loading, title, initialValues, currentUserId, lockedTags, createDefaults }: TaskFormModalProps) {
  const [tags, setTags] = useState<string[]>(initialValues?.tags ?? []);
  const [subTaskDrafts, setSubTaskDrafts] = useState<SubtaskDraft[]>(
    initialValues?.subTasks?.map((s) => ({ title: s.title, assigneeId: s.assigneeId ?? null })) ?? []
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

  // Reset form when modal opens with new initial values. Intentionally narrow
  // deps — adding `form`, `createDefaults`, `currentUserId` would re-fire the
  // reset on every render and wipe mid-edit user input.
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
      setSubTaskDrafts(
        initialValues?.subTasks?.map((s) => ({ title: s.title, assigneeId: s.assigneeId ?? null })) ?? []
      );
      setNewSubTask('');
      submitModeRef.current = 'create';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initialValues, lockedTags]);

  const handleSubmit = form.onSubmit((values) => {
    const isEdit = !!initialValues;
    if (isEdit) {
      // When editing, preserve sub-task IDs and completion stamps for
      // existing items by index. New rows beyond the existing length get a
      // fresh UUID and start uncompleted/null-stamped.
      const existingSubTasks = initialValues?.subTasks ?? [];
      const updatedSubTasks: SubTask[] = subTaskDrafts.map((draft, i) => {
        const existing = existingSubTasks[i];
        if (existing) {
          return { ...existing, title: draft.title, assigneeId: draft.assigneeId };
        }
        return {
          id: crypto.randomUUID(),
          title: draft.title,
          completed: false,
          assigneeId: draft.assigneeId,
          completedAt: null,
          completedBy: null,
        };
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
        // Per-row assigneeId on create is intentionally dropped: CreateTaskDto
        // accepts only `{ title }[]` for subtasks. Users assign people via
        // Edit after the task exists. Keeps the create wire shape unchanged.
        subTasks: subTaskDrafts.length > 0
          ? subTaskDrafts.map((d) => ({ title: d.title }))
          : undefined,
        ...(startMode ? { status: 'started' as const } : {}),
      });
    }
  });

  const addSubTask = () => {
    const trimmed = newSubTask.trim();
    if (trimmed) {
      setSubTaskDrafts((prev) => [...prev, { title: trimmed, assigneeId: null }]);
      setNewSubTask('');
    }
  };

  const setSubTaskAssignee = (index: number, assigneeId: string | null) => {
    setSubTaskDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, assigneeId } : d))
    );
  };

  const assigneeData = [
    { value: '', label: 'Unassigned' },
    ...members.map((m) => ({ value: m.userId, label: m.displayName })),
  ];

  return (
    <ResponsiveModal opened={opened} onClose={onClose} title={title} size="md">
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
              {subTaskDrafts.map((draft, i) => {
                const assignee = members.find((m) => m.userId === draft.assigneeId) ?? null;
                return (
                  <Group key={i} gap="xs" wrap="nowrap">
                    <Text size="sm" style={{ flex: 1 }}>{draft.title}</Text>
                    <Menu position="bottom-end" withinPortal shadow="md" width={200}>
                      <Menu.Target>
                        <Tooltip label={assignee ? `Assignee: ${assignee.displayName}` : 'Assign sub-task'}>
                          <ActionIcon
                            size="sm"
                            variant={assignee ? 'filled' : 'subtle'}
                            color={assignee ? userColor(assignee) : 'gray'}
                            style={assignee ? userAvatarStyle(assignee) : undefined}
                            aria-label="Assign sub-task"
                          >
                            {assignee ? (
                              <Avatar
                                variant="filled"
                                size="xs"
                                radius="xl"
                                color={userColor(assignee)}
                                style={userAvatarStyle(assignee)}
                              >
                                {assignee.displayName.charAt(0).toUpperCase()}
                              </Avatar>
                            ) : (
                              <IconUserCircle size={16} />
                            )}
                          </ActionIcon>
                        </Tooltip>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          onClick={() => setSubTaskAssignee(i, null)}
                          rightSection={draft.assigneeId === null ? <IconCheck size={12} /> : null}
                        >
                          Unassigned
                        </Menu.Item>
                        <Menu.Divider />
                        {members.map((m) => (
                          <Menu.Item
                            key={m.userId}
                            onClick={() => setSubTaskAssignee(i, m.userId)}
                            leftSection={
                              <Avatar variant="filled" size="xs" radius="xl" color={userColor(m)} style={userAvatarStyle(m)}>
                                {m.displayName.charAt(0).toUpperCase()}
                              </Avatar>
                            }
                            rightSection={draft.assigneeId === m.userId ? <IconCheck size={12} /> : null}
                          >
                            {m.displayName}
                          </Menu.Item>
                        ))}
                      </Menu.Dropdown>
                    </Menu>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      disabled={i === 0}
                      onClick={() => setSubTaskDrafts((prev) => {
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
                      disabled={i === subTaskDrafts.length - 1}
                      onClick={() => setSubTaskDrafts((prev) => {
                        const next = [...prev];
                        [next[i], next[i + 1]] = [next[i + 1], next[i]];
                        return next;
                      })}
                    >
                      <IconArrowDown size={12} />
                    </ActionIcon>
                    <CloseButton
                      size="xs"
                      onClick={() => setSubTaskDrafts((prev) => prev.filter((_, idx) => idx !== i))}
                    />
                  </Group>
                );
              })}
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
    </ResponsiveModal>
  );
}
