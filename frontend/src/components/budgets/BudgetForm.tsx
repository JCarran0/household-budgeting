import React, { useEffect } from 'react';
import {
  Modal,
  Select,
  NumberInput,
  Button,
  Stack,
  Group,
  Text,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type CreateBudgetDto } from '../../lib/api';
import type { MonthlyBudget, Category } from '../../../../shared/types';

interface BudgetFormProps {
  opened: boolean;
  onClose: () => void;
  budget: MonthlyBudget | null;
  month: string;
  categories: Category[];
  onSuccess: () => void;
}

interface FormValues {
  categoryId: string;
  amount: number;
}

export function BudgetForm({ 
  opened, 
  onClose, 
  budget, 
  month, 
  categories, 
  onSuccess 
}: BudgetFormProps) {
  const isEdit = !!budget;

  const form = useForm<FormValues>({
    initialValues: {
      categoryId: '',
      amount: 0,
    },
    validate: {
      categoryId: (value) => {
        if (!value) return 'Category is required';
        return null;
      },
      amount: (value) => {
        if (value <= 0) return 'Amount must be greater than 0';
        if (value > 1000000) return 'Amount is too large';
        return null;
      },
    },
  });

  // Reset form when modal opens/closes or budget changes
  useEffect(() => {
    if (opened) {
      if (budget) {
        form.setValues({
          categoryId: budget.categoryId,
          amount: budget.amount,
        });
      } else {
        form.reset();
      }
    }
  }, [opened, budget, form]);

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: (data: CreateBudgetDto) => api.createOrUpdateBudget(data),
    onSuccess: () => {
      notifications.show({
        title: 'Success',
        message: isEdit ? 'Budget updated successfully' : 'Budget created successfully',
        color: 'green',
      });
      onSuccess();
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error.response?.data?.error || 'Failed to save budget',
        color: 'red',
      });
    },
  });

  const handleSubmit = (values: FormValues): void => {
    saveMutation.mutate({
      categoryId: values.categoryId,
      month,
      amount: values.amount,
    });
  };

  // Build category options with hierarchy
  const categoryOptions = React.useMemo(() => {
    if (!categories || categories.length === 0) {
      return [];
    }
    
    try {
      const options = categories
        .filter(cat => !cat.isHidden) // Don't show hidden categories
        .map(cat => {
          const parentCategory = cat.parentId ? 
            categories.find(p => p.id === cat.parentId) : null;
          
          // Ensure we return a valid option object
          return {
            value: cat.id || '',
            label: parentCategory ? `${parentCategory.name} → ${cat.name}` : cat.name || '',
            // Note: Mantine Select doesn't support 'group' directly in option objects
            // group: parentCategory?.name,
          };
        })
        .filter(opt => opt.value && opt.label) // Filter out any invalid options
        .sort((a, b) => {
          // Sort alphabetically by label
          return a.label.localeCompare(b.label);
        });
      return options;
    } catch (error) {
      console.error('[BudgetForm] Error building category options:', error);
      return [];
    }
  }, [categories]);

  const selectedCategory = categories?.find(c => c.id === form.values.categoryId);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Edit Budget' : 'Create Budget'}
      size="md"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <Select
            label="Category"
            placeholder={categoryOptions.length > 0 ? "Select a category" : "No categories available"}
            data={categoryOptions}
            searchable
            required
            disabled={isEdit || categoryOptions.length === 0}
            {...form.getInputProps('categoryId')}
            description={
              isEdit ? 'Category cannot be changed when editing' : 
              categoryOptions.length === 0 ? 'Please create categories first' : undefined
            }
          />

          {selectedCategory?.isSavings && (
            <Text size="sm" c="yellow" fw={500}>
              This is a savings category - unused budget will roll over to next month
            </Text>
          )}

          <NumberInput
            label="Budget Amount"
            placeholder="Enter budget amount"
            prefix="$"
            min={0}
            max={1000000}
            step={10}
            required
            thousandSeparator=","
            decimalScale={2}
            {...form.getInputProps('amount')}
            description={`Monthly budget for ${month}`}
          />

          <Group justify="space-between" mt="xs">
            <Text size="sm" c="dimmed">
              Month: {month}
            </Text>
            {isEdit && (
              <Text size="sm" c="dimmed">
                Current: ${budget.amount.toFixed(2)}
              </Text>
            )}
          </Group>

          <Group justify="flex-end" mt="md">
            <Button 
              variant="default" 
              onClick={onClose} 
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              loading={saveMutation.isPending}
            >
              {isEdit ? 'Update' : 'Create'} Budget
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}