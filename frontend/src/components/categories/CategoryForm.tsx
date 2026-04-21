import React, { useEffect, useState } from 'react';
import {
  Modal,
  TextInput,
  Textarea,
  Select,
  Checkbox,
  Button,
  Stack,
  Group,
  Text,
  List,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type CreateCategoryDto, type UpdateCategoryDto } from '../../lib/api';
import type { Category } from '../../../../shared/types';
import { isBudgetableCategory } from '../../../../shared/utils/categoryHelpers';

interface CategoryFormProps {
  opened: boolean;
  onClose: () => void;
  category: Category | null;
  onSuccess: () => void;
}

interface FormValues {
  name: string;
  parentId: string | null;
  description: string;
  isHidden: boolean;
  isRollover: boolean;
  isSavings: boolean;
}

/**
 * Target-specific rollover conflict check — mirrors the backend logic in
 * categoryService.updateCategory. Returns the ids of ancestor/descendant
 * categories that would conflict if `targetId` is flagged isRollover=true.
 *
 * Frontend is convenience (REQ-019). The server validation runs on submit
 * regardless; this only spares a round-trip when we can confidently open
 * the confirmation modal directly.
 */
function findConflictsForTarget(
  targetId: string,
  categories: Category[],
): string[] {
  const target = categories.find(c => c.id === targetId);
  if (!target) return [];
  const conflicts: string[] = [];
  if (target.parentId) {
    const parent = categories.find(c => c.id === target.parentId);
    if (parent?.isRollover) conflicts.push(parent.id);
  }
  for (const c of categories) {
    if (c.parentId === targetId && c.isRollover) conflicts.push(c.id);
  }
  return conflicts;
}

interface ApiErrorDetails {
  conflictingCategoryIds?: string[];
  relation?: 'ancestor' | 'descendant' | 'mixed';
}

interface ApiErrorShape {
  response?: {
    data?: {
      error?: string;
      code?: string;
      details?: ApiErrorDetails;
    };
  };
}

function getErrorCode(err: unknown): string | undefined {
  return (err as ApiErrorShape)?.response?.data?.code;
}
function getErrorDetails(err: unknown): ApiErrorDetails {
  return (err as ApiErrorShape)?.response?.data?.details ?? {};
}
function getErrorMessage(err: unknown): string | undefined {
  return (err as ApiErrorShape)?.response?.data?.error;
}

export function CategoryForm({ opened, onClose, category, onSuccess }: CategoryFormProps) {
  const isEdit = !!category;

  // Fetch parent categories for dropdown
  const { data: parentCategories, isLoading: loadingParents } = useQuery({
    queryKey: ['categories', 'parents'],
    queryFn: () => api.getParentCategories(),
    enabled: opened,
  });

  // Fetch all categories to check children and compute rollover conflicts
  const { data: allCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    enabled: opened,
  });

  const hasChildren = isEdit && allCategories?.some(c => c.parentId === category?.id);
  const isTransferTarget = isEdit && category ? !isBudgetableCategory(category.id, allCategories ?? []) : false;

  const form = useForm<FormValues>({
    initialValues: {
      name: '',
      parentId: null,
      description: '',
      isHidden: false,
      isRollover: false,
      isSavings: false,
    },
    validate: {
      name: (value) => {
        if (!value.trim()) return 'Category name is required';
        if (value.length > 100) return 'Category name must be less than 100 characters';
        return null;
      },
      description: (value) => {
        if (value && value.length > 500) return 'Description must be less than 500 characters';
        return null;
      },
    },
  });

  // Conflict confirmation state. `pendingUpdates` captures the full set of
  // field diffs at the moment conflict was detected, so retry with
  // resolveRolloverConflicts=true preserves every other change the user made.
  const [conflictState, setConflictState] = useState<{
    conflictingIds: string[];
    pendingUpdates: UpdateCategoryDto;
  } | null>(null);

  // Reset form and conflict modal when modal opens/closes or category changes
  useEffect(() => {
    if (opened) {
      setConflictState(null);
      if (category) {
        form.setValues({
          name: category.name,
          parentId: category.parentId,
          description: category.description || '',
          isHidden: category.isHidden,
          isRollover: category.isRollover,
          isSavings: category.isSavings ?? false,
        });
      } else {
        form.reset();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, category]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateCategoryDto) => api.createCategory(data),
    onSuccess: () => {
      notifications.show({
        title: 'Success',
        message: 'Category created successfully',
        color: 'green',
      });
      onSuccess();
    },
    onError: (error: unknown) => {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to create category',
        color: 'red',
      });
    },
  });

  // Update mutation with structured-error handling for rollover conflicts.
  const updateMutation = useMutation({
    mutationFn: (data: UpdateCategoryDto) => {
      if (!category) throw new Error('No category to update');
      return api.updateCategory(category.id, data);
    },
    onSuccess: () => {
      notifications.show({
        title: 'Success',
        message: 'Category updated successfully',
        color: 'green',
      });
      setConflictState(null);
      onSuccess();
    },
    onError: (error: unknown, variables) => {
      const code = getErrorCode(error);

      if (code === 'ROLLOVER_SUBTREE_CONFLICT') {
        const details = getErrorDetails(error);
        const ids = details.conflictingCategoryIds ?? [];
        // Open the confirmation modal with the conflicting ids and retain the
        // full pending update so the retry carries every user-initiated change.
        setConflictState({ conflictingIds: ids, pendingUpdates: variables });
        return;
      }

      if (code === 'ROLLOVER_NOT_BUDGETABLE') {
        // Defensive — the checkbox is disabled for transfers, so this shouldn't
        // fire from the UI. Show inline-style notification and revert the flag.
        form.setFieldValue('isRollover', false);
        notifications.show({
          title: 'Rollover not allowed',
          message: 'Rollover cannot be set on transfer categories.',
          color: 'red',
        });
        return;
      }

      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to update category',
        color: 'red',
      });
    },
  });

  const handleSubmit = (values: FormValues): void => {
    if (isEdit) {
      // For updates, only send changed fields
      const updates: UpdateCategoryDto = {};
      if (values.name !== category.name) updates.name = values.name;
      if (values.description !== (category.description || '')) updates.description = values.description || undefined;
      if (values.parentId !== category.parentId) updates.parentId = values.parentId;
      if (values.isHidden !== category.isHidden) updates.isHidden = values.isHidden;
      if (values.isRollover !== category.isRollover) updates.isRollover = values.isRollover;
      if (values.isSavings !== (category.isSavings ?? false)) updates.isSavings = values.isSavings;

      if (Object.keys(updates).length === 0) {
        onClose();
        return;
      }

      // Pre-flight: when the user is turning on rollover, check the local
      // category cache for subtree conflicts and open the confirmation modal
      // directly. Saves a round-trip. Backend still validates on submit.
      if (updates.isRollover === true && allCategories) {
        const conflicts = findConflictsForTarget(category.id, allCategories);
        if (conflicts.length > 0) {
          setConflictState({ conflictingIds: conflicts, pendingUpdates: updates });
          return;
        }
      }

      updateMutation.mutate(updates);
    } else {
      createMutation.mutate({
        name: values.name,
        parentId: values.parentId,
        description: values.description || undefined,
        isHidden: values.isHidden,
        isRollover: values.isRollover,
        isSavings: values.isSavings,
      });
    }
  };

  const handleConfirmResolve = () => {
    if (!conflictState) return;
    updateMutation.mutate({
      ...conflictState.pendingUpdates,
      resolveRolloverConflicts: true,
    });
  };

  const handleCancelConflict = () => {
    // Revert the isRollover checkbox to its saved value so the user doesn't
    // believe the change took effect.
    if (category) {
      form.setFieldValue('isRollover', category.isRollover);
    }
    setConflictState(null);
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  // Filter out the current category from parent options (to prevent circular reference)
  const parentOptions = React.useMemo(() => {
    if (!parentCategories || parentCategories.length === 0) {
      return [];
    }

    const options = parentCategories
      .filter(cat => !category || cat.id !== category.id)
      .map(cat => ({
        value: cat.id,
        label: cat.name,
      }));

    return options;
  }, [parentCategories, category]);

  const rolloverCheckbox = (
    <Checkbox
      label="Rollover budget"
      {...form.getInputProps('isRollover', { type: 'checkbox' })}
      description="Surpluses and deficits carry month-to-month within the calendar year. Resets January 1."
      disabled={isTransferTarget}
    />
  );

  // Look up the conflicting category display info from the query cache so
  // the modal shows names + parent path instead of raw ids.
  const conflictingCategories = React.useMemo(() => {
    if (!conflictState || !allCategories) return [];
    return conflictState.conflictingIds
      .map(id => allCategories.find(c => c.id === id))
      .filter((c): c is Category => Boolean(c));
  }, [conflictState, allCategories]);

  const formatCategoryLabel = (c: Category): string => {
    if (!c.parentId) return c.name;
    const parent = allCategories?.find(p => p.id === c.parentId);
    return parent ? `${parent.name} → ${c.name}` : c.name;
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={isEdit ? 'Edit Category' : 'Create Category'}
        size="md"
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput
              label="Category Name"
              placeholder="e.g., Transportation"
              required
              {...form.getInputProps('name')}
            />

            <Textarea
              label="Description"
              placeholder="Optional description for this category"
              rows={3}
              maxLength={500}
              {...form.getInputProps('description')}
              description={`${form.values.description.length}/500 characters`}
            />

            <Select
              label="Parent Category"
              placeholder="Select parent category (optional)"
              data={parentOptions}
              clearable
              searchable
              {...form.getInputProps('parentId')}
              description={hasChildren
                ? "Cannot change parent for a category that has subcategories"
                : "Leave empty to make a top-level category"}
              disabled={loadingParents || !!hasChildren}
            />

            <Stack gap="xs">
              <Text size="sm" fw={500}>Options</Text>

              <Checkbox
                label="Hidden Category"
                {...form.getInputProps('isHidden', { type: 'checkbox' })}
                description="Hide this category from budget calculations"
              />

              {isTransferTarget ? (
                <Tooltip label="Transfers cannot use rollover." withArrow>
                  <div>{rolloverCheckbox}</div>
                </Tooltip>
              ) : (
                rolloverCheckbox
              )}

              {!form.values.parentId && (!isEdit || !category?.parentId) && (
                <Checkbox
                  label="Savings Category"
                  {...form.getInputProps('isSavings', { type: 'checkbox' })}
                  description="Mark as savings/investment (excluded from spending totals)"
                />
              )}
            </Stack>

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" loading={isLoading}>
                {isEdit ? 'Update' : 'Create'} Category
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={conflictState !== null}
        onClose={handleCancelConflict}
        title="Resolve rollover conflict"
        size="md"
      >
        {conflictState && category && (
          <Stack>
            <Text>
              Flagging <b>{category.name}</b> as a rollover budget will unflag{' '}
              {conflictingCategories.length === 1 ? '1 related category' : `${conflictingCategories.length} related categories`}:
            </Text>
            <List>
              {conflictingCategories.map(c => (
                <List.Item key={c.id}>{formatCategoryLabel(c)}</List.Item>
              ))}
            </List>
            <Text size="sm" c="dimmed">
              Only one category per parent/child chain can use rollover.
            </Text>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={handleCancelConflict} disabled={isLoading}>
                Cancel
              </Button>
              <Button color="red" onClick={handleConfirmResolve} loading={isLoading}>
                Unflag and continue
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
