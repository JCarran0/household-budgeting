import { useState } from 'react';
import {
  ActionIcon,
  Button,
  CloseButton,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IconArrowDown,
  IconArrowUp,
  IconEdit,
  IconPin,
  IconPinFilled,
  IconPlayerPlayFilled,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { api } from '../../lib/api';
import { ResponsiveModal } from '../ResponsiveModal';
import type {
  CreateTaskTemplateDto,
  FamilyMember,
  StoredTaskTemplate,
  TaskScope,
} from '../../../../shared/types';

export interface TemplateManagementModalProps {
  opened: boolean;
  onClose: () => void;
  templates: StoredTaskTemplate[];
  members: FamilyMember[];
  onQuickCreateFromTemplate: (template: StoredTaskTemplate) => void;
}

export function TemplateManagementModal({ opened, onClose, templates, members, onQuickCreateFromTemplate }: TemplateManagementModalProps) {
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
    <ResponsiveModal opened={opened} onClose={onClose} title="Manage Task Templates" size="md">
      <Stack gap="md">
        {templates.length === 0 && !showForm && (
          <Text size="sm" c="dimmed">
            No templates yet. Create one to enable one-tap task creation.
          </Text>
        )}

        {templates.map((t) => (
          <Group key={t.id} justify="space-between" wrap="nowrap">
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500}>{t.name}</Text>
              <Text size="xs" c="dimmed">
                {t.defaultScope === 'personal' ? 'Personal' : 'Family'}
                {t.defaultAssigneeId && ` · ${members.find((m) => m.userId === t.defaultAssigneeId)?.displayName ?? 'Unknown'}`}
                {t.defaultTags && t.defaultTags.length > 0 && ` · Tags: ${t.defaultTags.join(', ')}`}
                {t.defaultSubTasks && t.defaultSubTasks.length > 0 && ` · ${t.defaultSubTasks.length} sub-tasks`}
              </Text>
            </div>
            <Group gap={4} wrap="nowrap">
              <ActionIcon
                variant="subtle"
                size="sm"
                title="Create task from this template"
                onClick={() => {
                  onQuickCreateFromTemplate(t);
                  onClose();
                }}
              >
                <IconPlayerPlayFilled size={14} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                size="sm"
                color={t.pinned ? 'yellow' : 'gray'}
                title={t.pinned ? 'Unpin from quick-create dropdown' : 'Pin to quick-create dropdown'}
                onClick={() =>
                  updateTemplateMutation.mutate({ id: t.id, data: { pinned: !t.pinned } })
                }
              >
                {t.pinned ? <IconPinFilled size={14} /> : <IconPin size={14} />}
              </ActionIcon>
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
    </ResponsiveModal>
  );
}
