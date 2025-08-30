import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  TextInput,
  Select,
  MultiSelect,
  Button,
  Text,
  Badge,
  NumberInput,
  Textarea,
  Switch,
  Divider,
  Alert,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconTag, IconCategory } from '@tabler/icons-react';
import { api } from '../../lib/api';
import type { Transaction, Category } from '../../../../shared/types';

interface TransactionEditModalProps {
  opened: boolean;
  onClose: () => void;
  transaction: Transaction | null;
}

interface EditFormValues {
  categoryId: string;
  tags: string[];
  notes: string;
  isHidden: boolean;
}

export function TransactionEditModal({ 
  opened, 
  onClose, 
  transaction 
}: TransactionEditModalProps) {
  const queryClient = useQueryClient();
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: api.getCategories,
    enabled: opened,
  });

  // Fetch all transactions to extract unique tags
  const { data: allTransactionsData } = useQuery({
    queryKey: ['all-transactions-tags'],
    queryFn: () => api.getTransactions({ limit: 1000 }),
    enabled: opened,
  });

  // Extract unique tags from all transactions
  useEffect(() => {
    if (allTransactionsData?.transactions) {
      const tags = new Set<string>();
      allTransactionsData.transactions.forEach(t => {
        t.tags?.forEach(tag => tags.add(tag));
      });
      setAvailableTags(Array.from(tags));
    }
  }, [allTransactionsData]);

  const form = useForm<EditFormValues>({
    initialValues: {
      categoryId: '',
      tags: [],
      notes: '',
      isHidden: false,
    },
  });

  // Reset form when transaction changes
  useEffect(() => {
    if (transaction && opened) {
      form.setValues({
        categoryId: transaction.categoryId || '',
        tags: transaction.tags || [],
        notes: transaction.notes || '',
        isHidden: transaction.isHidden || false,
      });
    }
  }, [transaction, opened]);

  // Update category mutation
  const updateCategoryMutation = useMutation({
    mutationFn: ({ transactionId, categoryId }: { transactionId: string; categoryId: string }) =>
      api.updateTransactionCategory(transactionId, categoryId),
    onSuccess: () => {
      notifications.show({
        title: 'Category Updated',
        message: 'Transaction category has been updated',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to update category',
        color: 'red',
      });
    },
  });

  // Add tags mutation
  const addTagsMutation = useMutation({
    mutationFn: ({ transactionId, tags }: { transactionId: string; tags: string[] }) =>
      api.addTransactionTags(transactionId, tags),
    onSuccess: () => {
      notifications.show({
        title: 'Tags Updated',
        message: 'Transaction tags have been updated',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to update tags',
        color: 'red',
      });
    },
  });

  const handleSubmit = async (values: EditFormValues) => {
    if (!transaction) return;

    try {
      // Update category if changed
      if (values.categoryId && values.categoryId !== transaction.categoryId) {
        await updateCategoryMutation.mutateAsync({
          transactionId: transaction.id,
          categoryId: values.categoryId,
        });
      }

      // Update tags if changed
      const currentTags = transaction.tags || [];
      const tagsChanged = 
        values.tags.length !== currentTags.length ||
        values.tags.some(tag => !currentTags.includes(tag));
      
      if (tagsChanged) {
        await addTagsMutation.mutateAsync({
          transactionId: transaction.id,
          tags: values.tags,
        });
      }

      onClose();
    } catch (error) {
      console.error('Error updating transaction:', error);
    }
  };

  if (!transaction) return null;

  // Build category options
  const categoryOptions = React.useMemo(() => {
    if (!categories || categories.length === 0) {
      return [];
    }
    
    const options = categories
      .filter(cat => !cat.isHidden)
      .map(cat => {
        const parentCategory = cat.parentId
          ? categories.find(p => p.id === cat.parentId)
          : null;
        return {
          value: cat.id || '',
          label: parentCategory 
            ? `${parentCategory.name} → ${cat.name}` 
            : cat.name || '',
        };
      })
      .filter(opt => opt.value && opt.label)
      .sort((a, b) => a.label.localeCompare(b.label));
    
    console.log('[TransactionEditModal] Category options:', options);
    return options;
  }, [categories]);

  // Build tag options (existing tags + ability to create new ones)
  const tagOptions = availableTags.map(tag => ({
    value: tag,
    label: tag,
  }));

  const isLoading = updateCategoryMutation.isPending || addTagsMutation.isPending;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit Transaction"
      size="lg"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          {/* Transaction Details (Read-only) */}
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Merchant</Text>
              <Text fw={500}>{transaction.merchantName || transaction.name}</Text>
            </Group>
            
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Amount</Text>
              <Text fw={500} c={transaction.amount > 0 ? 'red' : 'green'}>
                ${Math.abs(transaction.amount).toFixed(2)}
              </Text>
            </Group>
            
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Date</Text>
              <Text fw={500}>{transaction.date}</Text>
            </Group>
            
            {transaction.accountName && (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">Account</Text>
                <Badge variant="light">{transaction.accountName}</Badge>
              </Group>
            )}
          </Stack>

          <Divider />

          {/* Editable Fields */}
          <Select
            label="Category"
            placeholder={categoryOptions.length > 0 ? "Select a category" : "No categories available"}
            data={categoryOptions}
            searchable
            clearable
            disabled={categoryOptions.length === 0}
            leftSection={<IconCategory size={16} />}
            {...form.getInputProps('categoryId')}
            description={
              categoryOptions.length === 0 
                ? "Please create categories first" 
                : "Assign a budget category to this transaction"
            }
          />

          <MultiSelect
            label="Tags"
            placeholder="Add tags"
            data={tagOptions}
            searchable
            creatable
            clearable
            leftSection={<IconTag size={16} />}
            {...form.getInputProps('tags')}
            description="Add tags for better organization"
            getCreateLabel={(value) => `+ Create "${value}"`}
          />

          <Textarea
            label="Notes"
            placeholder="Add notes about this transaction"
            rows={3}
            {...form.getInputProps('notes')}
            description="Add any additional information"
          />

          <Switch
            label="Hide from budgets"
            {...form.getInputProps('isHidden', { type: 'checkbox' })}
            description="Exclude this transaction from budget calculations"
          />

          {transaction.isSplit && (
            <Alert icon={<IconAlertCircle size={16} />} color="blue">
              This is a split transaction. Editing will affect all splits.
            </Alert>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading}>
              Save Changes
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}