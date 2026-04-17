/**
 * TaskActionCardEditForm — full task form for the ActionCard edit mode.
 *
 * Per D-11 in BRD: Edit opens the complete form (every field the schema
 * accepts), not just the LLM-proposed fields. This lets the user add an
 * assignee, change the scope, etc. without navigating to the Tasks page.
 *
 * The form intentionally mirrors the structure of TaskFormModal in Tasks.tsx
 * so the field set stays in sync. Both are ultimately validated against the
 * same createTaskSchema on the backend.
 */
import { useState, useEffect } from 'react';
import {
  Stack,
  TextInput,
  Textarea,
  Select,
  SegmentedControl,
  TagsInput,
  Button,
  Group,
  Text,
  ActionIcon,
  CloseButton,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { IconArrowUp, IconArrowDown } from '@tabler/icons-react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import type { FamilyMember, TaskScope } from '../../../../../shared/types';

export interface TaskActionCardEditFormValues {
  title: string;
  description?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  scope?: TaskScope;
  tags?: string[];
  subTasks?: { title: string }[];
}

interface TaskActionCardEditFormProps {
  /** Pre-filled values from the LLM proposal */
  initialValues: Record<string, unknown>;
  onSubmit: (values: TaskActionCardEditFormValues) => void;
  onCancel: () => void;
  loading: boolean;
}

export function TaskActionCardEditForm({
  initialValues,
  onSubmit,
  onCancel,
  loading,
}: TaskActionCardEditFormProps) {
  const [tags, setTags] = useState<string[]>(
    Array.isArray(initialValues.tags) ? (initialValues.tags as string[]) : []
  );
  const [subTaskTitles, setSubTaskTitles] = useState<string[]>(() => {
    if (Array.isArray(initialValues.subTasks)) {
      return (initialValues.subTasks as Array<{ title?: string; id?: string }>)
        .map((st) => (typeof st === 'string' ? st : (st.title ?? '')))
        .filter(Boolean);
    }
    return [];
  });
  const [newSubTask, setNewSubTask] = useState('');

  const { data: familyData } = useQuery({
    queryKey: ['family'],
    queryFn: () => api.getFamily(),
  });
  const members: FamilyMember[] = familyData?.family?.members ?? [];

  const parsedDueDate = (() => {
    if (!initialValues.dueDate || typeof initialValues.dueDate !== 'string') return null;
    const d = new Date(initialValues.dueDate);
    return isNaN(d.getTime()) ? null : d;
  })();

  const form = useForm({
    initialValues: {
      title: typeof initialValues.title === 'string' ? initialValues.title : '',
      description: typeof initialValues.description === 'string' ? initialValues.description : '',
      assigneeId: typeof initialValues.assigneeId === 'string' ? initialValues.assigneeId : '',
      dueDate: parsedDueDate as Date | null,
      scope: (typeof initialValues.scope === 'string'
        ? initialValues.scope
        : 'family') as TaskScope,
    },
    validate: {
      title: (v) => (v.trim().length === 0 ? 'Title is required' : null),
    },
  });

  // Re-sync when initialValues change (e.g., parent provides updated proposal)
  useEffect(() => {
    form.setValues({
      title: typeof initialValues.title === 'string' ? initialValues.title : '',
      description: typeof initialValues.description === 'string' ? initialValues.description : '',
      assigneeId: typeof initialValues.assigneeId === 'string' ? initialValues.assigneeId : '',
      dueDate: parsedDueDate,
      scope: (typeof initialValues.scope === 'string'
        ? initialValues.scope
        : 'family') as TaskScope,
    });
    setTags(Array.isArray(initialValues.tags) ? (initialValues.tags as string[]) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]);

  const handleSubmit = form.onSubmit((values) => {
    onSubmit({
      title: values.title,
      description: values.description || undefined,
      assigneeId: values.assigneeId || null,
      dueDate: values.dueDate ? format(values.dueDate, 'yyyy-MM-dd') : null,
      scope: values.scope,
      tags: tags.length > 0 ? tags : undefined,
      subTasks: subTaskTitles.length > 0
        ? subTaskTitles.map((t) => ({ title: t }))
        : undefined,
    });
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
    <form onSubmit={handleSubmit}>
      <Stack gap="xs">
        <TextInput
          label="Title"
          required
          maxLength={200}
          size="sm"
          {...form.getInputProps('title')}
        />
        <Textarea
          label="Description"
          maxLength={2000}
          autosize
          minRows={2}
          maxRows={4}
          size="sm"
          {...form.getInputProps('description')}
        />
        <Select
          label="Assignee"
          data={assigneeData}
          size="sm"
          {...form.getInputProps('assigneeId')}
        />
        <DatePickerInput
          label="Due Date"
          clearable
          size="sm"
          {...form.getInputProps('dueDate')}
        />
        <SegmentedControl
          fullWidth
          size="xs"
          value={form.values.scope}
          onChange={(v) => form.setFieldValue('scope', v as TaskScope)}
          data={[
            { label: 'Family', value: 'family' },
            { label: 'Personal', value: 'personal' },
          ]}
        />
        <TagsInput
          label="Tags"
          size="sm"
          value={tags}
          onChange={setTags}
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
                  onClick={() =>
                    setSubTaskTitles((prev) => prev.filter((_, idx) => idx !== i))
                  }
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
              <Button
                size="xs"
                variant="light"
                onClick={addSubTask}
                disabled={!newSubTask.trim()}
              >
                Add
              </Button>
            </Group>
          </Stack>
        </div>

        <Group gap="xs" mt="xs">
          <Button type="submit" size="xs" loading={loading}>
            Confirm
          </Button>
          <Button size="xs" variant="subtle" color="gray" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
