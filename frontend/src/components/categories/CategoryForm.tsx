import React, { useEffect } from 'react';
import {
  Modal,
  TextInput,
  Select,
  Checkbox,
  Button,
  Stack,
  Group,
  Text,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type CreateCategoryDto, type UpdateCategoryDto } from '../../lib/api';
import type { Category } from '../../../../shared/types';

interface CategoryFormProps {
  opened: boolean;
  onClose: () => void;
  category: Category | null;
  onSuccess: () => void;
}

interface FormValues {
  name: string;
  parentId: string | null;
  isHidden: boolean;
  isSavings: boolean;
}

// Removed PLAID_CATEGORIES constant - no longer needed

export function CategoryForm({ opened, onClose, category, onSuccess }: CategoryFormProps) {
  const isEdit = !!category;

  // Fetch parent categories for dropdown
  const { data: parentCategories, isLoading: loadingParents } = useQuery({
    queryKey: ['categories', 'parents'],
    queryFn: async () => {
      const result = await api.getParentCategories();
      return result;
    },
    enabled: opened,
  });

  const form = useForm<FormValues>({
    initialValues: {
      name: '',
      parentId: null,
      isHidden: false,
      isSavings: false,
    },
    validate: {
      name: (value) => {
        if (!value.trim()) return 'Category name is required';
        if (value.length > 100) return 'Category name must be less than 100 characters';
        return null;
      },
    },
  });

  // Reset form when modal opens/closes or category changes
  useEffect(() => {
    if (opened) {
      if (category) {
        form.setValues({
          name: category.name,
          parentId: category.parentId,
          isHidden: category.isHidden,
          isSavings: category.isSavings,
        });
      } else {
        form.reset();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, category]); // Removed form from dependencies to prevent infinite loop

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
        message: (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create category',
        color: 'red',
      });
    },
  });

  // Update mutation
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
      onSuccess();
    },
    onError: (error: unknown) => {
      notifications.show({
        title: 'Error',
        message: (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update category',
        color: 'red',
      });
    },
  });

  const handleSubmit = (values: FormValues): void => {
    if (isEdit) {
      // For updates, only send changed fields
      const updates: UpdateCategoryDto = {};
      if (values.name !== category.name) updates.name = values.name;
      if (values.isHidden !== category.isHidden) updates.isHidden = values.isHidden;
      if (values.isSavings !== category.isSavings) updates.isSavings = values.isSavings;
      
      if (Object.keys(updates).length > 0) {
        updateMutation.mutate(updates);
      } else {
        onClose();
      }
    } else {
      createMutation.mutate({
        ...values,
        plaidCategory: null, // Always null for user-created categories
      } as CreateCategoryDto);
    }
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

  // Show parent selector only when creating a new category (not when editing)
  const showParentSelector = !isEdit;

  return (
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

          {showParentSelector && (
            <Select
              label="Parent Category"
              placeholder="Select parent category (optional)"
              data={parentOptions}
              clearable
              searchable
              {...form.getInputProps('parentId')}
              description="Leave empty to create a top-level category"
              disabled={loadingParents}
            />
          )}

          <Stack gap="xs">
            <Text size="sm" fw={500}>Options</Text>
            
            <Checkbox
              label="Hidden Category"
              {...form.getInputProps('isHidden', { type: 'checkbox' })}
              description="Hide this category from budget calculations"
            />

            <Checkbox
              label="Savings Category"
              {...form.getInputProps('isSavings', { type: 'checkbox' })}
              description="Mark as savings for future rollover features"
            />
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
  );
}