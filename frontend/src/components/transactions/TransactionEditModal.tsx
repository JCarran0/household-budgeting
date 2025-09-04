import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  TextInput,
  Select,
  TagsInput,
  Button,
  Text,
  Badge,
  Textarea,
  Switch,
  Divider,
  Alert,
  Loader,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconTag, IconCategory } from '@tabler/icons-react';
import { api } from '../../lib/api';
import type { Transaction } from '../../../../shared/types';

interface TransactionEditModalProps {
  opened: boolean;
  onClose: () => void;
  transaction: Transaction | null;
}

interface EditFormValues {
  description: string;
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
  const { data: categories, isLoading: categoriesLoading, error: categoriesError } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    enabled: opened,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
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
      description: '',
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
        description: transaction.userDescription || transaction.name || '',
        categoryId: transaction.categoryId || '',
        tags: transaction.tags || [],
        notes: transaction.notes || '',
        isHidden: transaction.isHidden || false,
      });
    }
  }, [transaction, opened, form]);

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
      queryClient.invalidateQueries({ queryKey: ['transactions', 'uncategorized', 'count'] });
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
      queryClient.invalidateQueries({ queryKey: ['transactions', 'uncategorized', 'count'] });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to update tags',
        color: 'red',
      });
    },
  });

  // Update description mutation
  const updateDescriptionMutation = useMutation({
    mutationFn: ({ transactionId, description }: { transactionId: string; description: string | null }) =>
      api.updateTransactionDescription(transactionId, description),
    onSuccess: () => {
      notifications.show({
        title: 'Description Updated',
        message: 'Transaction description has been updated',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', 'uncategorized', 'count'] });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to update description',
        color: 'red',
      });
    },
  });

  // Build category options - MUST be before any conditional returns
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
    
    return options;
  }, [categories]);

  // Build tag options (existing tags)
  const tagOptions = availableTags.map(tag => tag);

  const isLoading = updateCategoryMutation.isPending || addTagsMutation.isPending || updateDescriptionMutation.isPending;

  const handleSubmit = async (values: EditFormValues) => {
    if (!transaction) return;

    try {
      // Update description if changed
      const currentDescription = transaction.userDescription || transaction.name || '';
      const descriptionChanged = values.description !== currentDescription;
      if (descriptionChanged) {
        // If description matches original name, clear userDescription
        const newDescription = values.description === transaction.name ? null : values.description;
        await updateDescriptionMutation.mutateAsync({
          transactionId: transaction.id,
          description: newDescription,
        });
      }

      // Update category if changed (handle null/undefined properly)
      const categoryChanged = values.categoryId !== (transaction.categoryId || '');
      if (values.categoryId && categoryChanged) {
        await updateCategoryMutation.mutateAsync({
          transactionId: transaction.id,
          categoryId: values.categoryId,
        });
      }

      // Update tags if changed - check both directions for differences
      const currentTags = transaction.tags || [];
      const tagsChanged = 
        values.tags.length !== currentTags.length ||
        values.tags.some(tag => !currentTags.includes(tag)) ||
        currentTags.some(tag => !values.tags.includes(tag));
      
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

  // Early return MUST be after all hooks
  if (!transaction) return null;

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
          <TextInput
            label="Description"
            placeholder={transaction.name}
            {...form.getInputProps('description')}
            description={
              transaction.userDescription 
                ? "Custom description (clear to use original)" 
                : "Leave blank to use original description"
            }
          />

          {categoriesError && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              Failed to load categories: {(categoriesError as Error).message}
            </Alert>
          )}
          
          <Select
            label="Category"
            placeholder={
              categoriesLoading 
                ? "Loading categories..." 
                : categoriesError
                  ? "Failed to load categories"
                : categoryOptions.length > 0 
                  ? "Select a category" 
                  : "No categories available"
            }
            data={categoryOptions}
            searchable
            clearable
            disabled={categoriesLoading || !!categoriesError || categoryOptions.length === 0}
            leftSection={categoriesLoading ? <Loader size={16} /> : <IconCategory size={16} />}
            {...form.getInputProps('categoryId')}
            description={
              categoriesLoading
                ? "Loading categories..."
                : categoriesError
                  ? "Error loading categories"
                : categoryOptions.length === 0 
                  ? "Please create categories first" 
                  : "Assign a budget category to this transaction"
            }
          />

          <TagsInput
            label="Tags"
            placeholder="Type and press Enter to add tags"
            data={tagOptions}
            clearable
            leftSection={<IconTag size={16} />}
            value={form.values.tags}
            onChange={(value) => form.setFieldValue('tags', value)}
            error={form.errors.tags}
            description="Press Enter to add tags"
            maxDropdownHeight={200}
            allowDuplicates={false}
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