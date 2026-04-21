import { useEffect, useMemo } from 'react';
import {
  Stack,
  Group,
  Button,
  TextInput,
  Textarea,
  Select,
  NumberInput,
  ActionIcon,
  Text,
  Code,
} from '@mantine/core';
import { ResponsiveModal } from '../ResponsiveModal';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX, IconPlus } from '@tabler/icons-react';
import { format } from 'date-fns';
import { api } from '../../lib/api';
import { useCategoryOptions } from '../../hooks/useCategoryOptions';
import { formatCurrency } from '../../utils/formatters';
import { LineItemEditor } from './LineItemEditor';
import type {
  ProjectSummary,
  ProjectCategoryBudgetInput,
  ProjectLineItemInput,
  CreateProjectDto,
  UpdateProjectDto,
} from '../../../../shared/types';
import { generateProjectTag } from '../../../../shared/utils/projectHelpers';

interface ProjectFormValues {
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  totalBudget: number | string;
  notes: string;
  categoryBudgets: ProjectCategoryBudgetInput[];
}

// Mantine 8's DatePickerInput returns YYYY-MM-DD strings on change but our
// form state may still hold the initial Date object. Piping a string through
// date-fns `format` reparses it as UTC midnight and shifts the day back in
// any timezone west of UTC — pass strings through untouched.
function pickerToYmd(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return format(value, 'yyyy-MM-dd');
}

interface ProjectFormModalProps {
  opened: boolean;
  onClose: () => void;
  project: ProjectSummary | null; // null = create mode
}

export function ProjectFormModal({ opened, onClose, project }: ProjectFormModalProps) {
  const queryClient = useQueryClient();
  const isEdit = project !== null;

  const { options: categoryOptions, isLoading: categoriesLoading } = useCategoryOptions({
    enabled: opened,
  });

  const form = useForm<ProjectFormValues>({
    initialValues: {
      name: '',
      startDate: null,
      endDate: null,
      totalBudget: '',
      notes: '',
      categoryBudgets: [],
    },
    validate: {
      name: (value) => (value.trim().length === 0 ? 'Name is required' : null),
      startDate: (value) => (value === null ? 'Start date is required' : null),
      endDate: (value, values) => {
        if (value === null) return 'End date is required';
        if (values.startDate && value < values.startDate) {
          return 'End date must be on or after start date';
        }
        return null;
      },
      totalBudget: (value, values) => {
        const categorySum = values.categoryBudgets
          .filter((cb) => cb.categoryId !== '' && cb.amount > 0)
          .reduce((sum, cb) => sum + cb.amount, 0);
        if (categorySum === 0) return null;
        if (value === '' || value === null) {
          return `Total budget is required when category budgets are set (${formatCurrency(categorySum)})`;
        }
        const total = Number(value);
        if (isNaN(total)) return null;
        if (categorySum > total) {
          return `Total budget must be at least ${formatCurrency(categorySum)} (sum of category budgets)`;
        }
        return null;
      },
    },
  });

  useEffect(() => {
    if (!opened) return;
    if (isEdit && project) {
      const [startYear, startMonth, startDay] = project.startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = project.endDate.split('-').map(Number);
      form.setValues({
        name: project.name,
        startDate: new Date(startYear, startMonth - 1, startDay),
        endDate: new Date(endYear, endMonth - 1, endDay),
        totalBudget: project.totalBudget ?? '',
        notes: project.notes ?? '',
        categoryBudgets: project.categoryBudgets ?? [],
      });
    } else {
      form.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, project]);

  const tagPreview = useMemo(() => {
    const { name, startDate } = form.values;
    if (!name.trim() || !startDate) return null;
    return generateProjectTag(name.trim(), pickerToYmd(startDate));
  }, [form.values]);

  const createMutation = useMutation({
    mutationFn: (data: CreateProjectDto) => api.createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      notifications.show({
        title: 'Project created',
        message: 'Your project has been saved.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      onClose();
    },
    onError: () => {
      notifications.show({
        title: 'Failed to create project',
        message: 'An error occurred. Please try again.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectDto }) =>
      api.updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      notifications.show({
        title: 'Project updated',
        message: 'Your changes have been saved.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      onClose();
    },
    onError: () => {
      notifications.show({
        title: 'Failed to update project',
        message: 'An error occurred. Please try again.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (values: ProjectFormValues) => {
    if (!values.startDate || !values.endDate) return;

    const startDateStr = pickerToYmd(values.startDate);
    const endDateStr = pickerToYmd(values.endDate);
    const totalBudget =
      values.totalBudget === '' || values.totalBudget === null
        ? null
        : Number(values.totalBudget);
    // Strip line items with blank names, then drop category rows that have
    // neither an amount nor meaningful line items. Rows with amount=0 and
    // named line items are valid: user is estimating purely via line items
    // while keeping D2 (amount stays authoritative, zero means "not set").
    const categoryBudgets = values.categoryBudgets
      .map((cb) => ({
        ...cb,
        lineItems: (cb.lineItems ?? []).filter((li) => li.name.trim() !== ''),
      }))
      .filter(
        (cb) => cb.categoryId !== '' && (cb.amount > 0 || cb.lineItems.length > 0),
      );

    if (isEdit && project) {
      updateMutation.mutate({
        id: project.id,
        data: {
          name: values.name.trim(),
          startDate: startDateStr,
          endDate: endDateStr,
          totalBudget,
          notes: values.notes.trim(),
          categoryBudgets,
        },
      });
    } else {
      createMutation.mutate({
        name: values.name.trim(),
        startDate: startDateStr,
        endDate: endDateStr,
        totalBudget,
        notes: values.notes.trim(),
        categoryBudgets,
      });
    }
  };

  const addCategoryBudget = () => {
    form.setFieldValue('categoryBudgets', [
      ...form.values.categoryBudgets,
      { categoryId: '', amount: 0 },
    ]);
  };

  const removeCategoryBudget = (index: number) => {
    form.setFieldValue(
      'categoryBudgets',
      form.values.categoryBudgets.filter((_, i) => i !== index),
    );
  };

  const updateCategoryBudget = (
    index: number,
    field: keyof ProjectCategoryBudgetInput,
    value: string | number,
  ) => {
    const updated = form.values.categoryBudgets.map((cb, i) =>
      i === index ? { ...cb, [field]: value } : cb,
    );
    form.setFieldValue('categoryBudgets', updated);
  };

  const setLineItemsFor = (index: number, items: ProjectLineItemInput[]) => {
    const updated = form.values.categoryBudgets.map((cb, i) =>
      i === index ? { ...cb, lineItems: items } : cb,
    );
    form.setFieldValue('categoryBudgets', updated);
  };

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Edit Project' : 'Create Project'}
      size="lg"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="sm">
          <TextInput
            label="Project Name"
            placeholder="Kitchen Renovation 2026"
            required
            {...form.getInputProps('name')}
          />

          {tagPreview && (
            <Text size="sm" c="dimmed">
              Tag: <Code>{tagPreview}</Code>
            </Text>
          )}

          <Group grow>
            <DatePickerInput
              label="Start Date"
              placeholder="Pick start date"
              required
              valueFormat="MMM D, YYYY"
              highlightToday
              {...form.getInputProps('startDate')}
            />
            <DatePickerInput
              label="End Date"
              placeholder="Pick end date"
              required
              valueFormat="MMM D, YYYY"
              highlightToday
              minDate={form.values.startDate ?? undefined}
              {...form.getInputProps('endDate')}
            />
          </Group>

          <NumberInput
            label="Total Budget"
            placeholder="Optional"
            min={0}
            decimalScale={2}
            prefix="$"
            {...form.getInputProps('totalBudget')}
          />

          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Category Budgets
              </Text>
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={12} />}
                onClick={addCategoryBudget}
                disabled={categoriesLoading}
              >
                Add Category
              </Button>
            </Group>

            {form.values.categoryBudgets.map((cb, index) => (
              <Stack
                key={index}
                gap="xs"
                style={{
                  borderLeft: '2px solid var(--mantine-color-orange-3)',
                  paddingLeft: 8,
                }}
              >
                <Group gap="xs">
                  <Select
                    style={{ flex: 2 }}
                    placeholder="Select category"
                    data={categoryOptions}
                    value={cb.categoryId || null}
                    onChange={(val) =>
                      updateCategoryBudget(index, 'categoryId', val ?? '')
                    }
                    searchable
                    clearable
                  />
                  <NumberInput
                    style={{ flex: 1 }}
                    placeholder="Amount"
                    min={0}
                    decimalScale={2}
                    prefix="$"
                    value={cb.amount}
                    onChange={(val) =>
                      updateCategoryBudget(index, 'amount', Number(val) || 0)
                    }
                  />
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    onClick={() => removeCategoryBudget(index)}
                    aria-label="Remove category budget"
                  >
                    <IconX size={16} />
                  </ActionIcon>
                </Group>

                <LineItemEditor
                  lineItems={cb.lineItems ?? []}
                  amount={cb.amount}
                  onChange={(items) => setLineItemsFor(index, items)}
                />
              </Stack>
            ))}
          </Stack>

          <Textarea
            label="Notes"
            placeholder="Project notes, contractor details, materials..."
            autosize
            minRows={2}
            maxRows={6}
            {...form.getInputProps('notes')}
          />

          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              {isEdit ? 'Save Changes' : 'Create Project'}
            </Button>
          </Group>
        </Stack>
      </form>
    </ResponsiveModal>
  );
}
