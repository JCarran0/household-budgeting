import React, { useState } from 'react';
import {
  Button,
  Group,
  Stack,
  TextInput,
  Textarea,
  Select,
  SegmentedControl,
  TagsInput,
  ActionIcon,
  CloseButton,
  Text,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import {
  IconPlus,
  IconPlayerPlay,
  IconArrowUp,
  IconArrowDown,
} from '@tabler/icons-react';
import { ResponsiveModal } from '../ResponsiveModal';
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
      setSubTaskTitles(initialValues?.subTasks?.map((s) => s.title) ?? []);
      setNewSubTask('');
      submitModeRef.current = 'create';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    </ResponsiveModal>
  );
}
