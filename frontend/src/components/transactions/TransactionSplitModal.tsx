import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  Button,
  Text,
  Badge,
  NumberInput,
  Select,
  TextInput,
  Divider,
  Alert,
  ActionIcon,
  Card,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { 
  IconAlertCircle, 
  IconPlus, 
  IconTrash,
  IconCategory,
  IconScissors 
} from '@tabler/icons-react';
import { api } from '../../lib/api';
import type { Transaction } from '../../../../shared/types';

interface TransactionSplitModalProps {
  opened: boolean;
  onClose: () => void;
  transaction: Transaction | null;
}

interface SplitItem {
  id: string;
  amount: number;
  categoryId: string;
  description: string;
}

interface SplitFormValues {
  splits: SplitItem[];
}

export function TransactionSplitModal({ 
  opened, 
  onClose, 
  transaction 
}: TransactionSplitModalProps) {
  const queryClient = useQueryClient();
  const [remainingAmount, setRemainingAmount] = useState(0);

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    enabled: opened,
  });

  // Build category options
  const categoryOptions = React.useMemo(() => {
    if (!categories || categories.length === 0) {
      return [];
    }
    
    return categories
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
  }, [categories]);

  const form = useForm<SplitFormValues>({
    initialValues: {
      splits: []
    },
    validate: {
      splits: {
        amount: (value) => value <= 0 ? 'Amount must be positive' : null,
        categoryId: (value) => !value ? 'Category is required' : null,
      }
    }
  });

  // Initialize form when transaction changes
  useEffect(() => {
    if (transaction && opened) {
      const initialAmount = Math.abs(transaction.amount);
      setRemainingAmount(initialAmount);
      
      // Start with two split items
      form.setValues({
        splits: [
          {
            id: crypto.randomUUID(),
            amount: initialAmount / 2,
            categoryId: transaction.categoryId || '',
            description: '',
          },
          {
            id: crypto.randomUUID(),
            amount: initialAmount / 2,
            categoryId: '',
            description: '',
          }
        ]
      });
    }
  }, [transaction, opened, form]);

  // Update remaining amount when splits change
  useEffect(() => {
    if (transaction) {
      const totalSplit = form.values.splits.reduce((sum, split) => sum + (split.amount || 0), 0);
      setRemainingAmount(Math.abs(transaction.amount) - totalSplit);
    }
  }, [form.values.splits, transaction]);

  // Split transaction mutation
  const splitMutation = useMutation({
    mutationFn: ({ transactionId, splits }: { 
      transactionId: string; 
      splits: Array<{ amount: number; categoryId?: string; description?: string; tags?: string[] }> 
    }) => api.splitTransaction(transactionId, splits),
    onSuccess: () => {
      notifications.show({
        title: 'Transaction Split',
        message: 'Transaction has been split successfully',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onClose();
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to split transaction',
        color: 'red',
      });
    },
  });

  const handleSubmit = async (values: SplitFormValues) => {
    if (!transaction) return;

    // Check if amounts match
    const totalSplit = values.splits.reduce((sum, split) => sum + split.amount, 0);
    if (Math.abs(totalSplit - Math.abs(transaction.amount)) > 0.01) {
      notifications.show({
        title: 'Invalid Split',
        message: 'Split amounts must equal the original transaction amount',
        color: 'red',
      });
      return;
    }

    // Prepare splits for API
    const splits = values.splits.map(split => ({
      amount: split.amount,
      categoryId: split.categoryId,
      description: split.description || undefined,
    }));

    await splitMutation.mutateAsync({
      transactionId: transaction.id,
      splits,
    });
  };

  const addSplit = () => {
    form.insertListItem('splits', {
      id: crypto.randomUUID(),
      amount: remainingAmount > 0 ? remainingAmount : 0,
      categoryId: '',
      description: '',
    });
  };

  const removeSplit = (index: number) => {
    form.removeListItem('splits', index);
  };

  if (!transaction) return null;

  const isLoading = splitMutation.isPending;
  const canSplit = form.values.splits.length >= 2;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconScissors size={20} />
          <Text>Split Transaction</Text>
        </Group>
      }
      size="lg"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          {/* Original Transaction Info */}
          <Card withBorder>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">Original Transaction</Text>
                <Text fw={600}>{transaction.merchantName || transaction.name}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">Total Amount</Text>
                <Badge size="lg" color={transaction.amount > 0 ? 'red' : 'green'}>
                  ${Math.abs(transaction.amount).toFixed(2)}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">Date</Text>
                <Text>{transaction.date}</Text>
              </Group>
            </Stack>
          </Card>

          <Divider />

          {/* Split Items */}
          <Stack>
            <Group justify="space-between">
              <Title order={5}>Split Into</Title>
              <Badge 
                color={Math.abs(remainingAmount) < 0.01 ? 'green' : 'red'}
                size="lg"
              >
                Remaining: ${remainingAmount.toFixed(2)}
              </Badge>
            </Group>

            {form.values.splits.map((split, index) => (
              <Card key={split.id} withBorder p="sm">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Split #{index + 1}</Text>
                    {form.values.splits.length > 2 && (
                      <ActionIcon 
                        color="red" 
                        variant="subtle"
                        onClick={() => removeSplit(index)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </Group>

                  <Group grow>
                    <NumberInput
                      label="Amount"
                      placeholder="0.00"
                      prefix="$"
                      decimalScale={2}
                      min={0.01}
                      max={Math.abs(transaction.amount)}
                      {...form.getInputProps(`splits.${index}.amount`)}
                    />

                    <Select
                      label="Category"
                      placeholder="Select category"
                      data={categoryOptions}
                      searchable
                      leftSection={<IconCategory size={16} />}
                      {...form.getInputProps(`splits.${index}.categoryId`)}
                    />
                  </Group>

                  <TextInput
                    label="Description (optional)"
                    placeholder="What is this split for?"
                    {...form.getInputProps(`splits.${index}.description`)}
                  />
                </Stack>
              </Card>
            ))}

            <Button
              variant="light"
              leftSection={<IconPlus size={16} />}
              onClick={addSplit}
              disabled={Math.abs(remainingAmount) < 0.01}
            >
              Add Another Split
            </Button>
          </Stack>

          {Math.abs(remainingAmount) > 0.01 && (
            <Alert icon={<IconAlertCircle size={16} />} color="yellow">
              Split amounts must equal the original transaction amount.
              You have ${Math.abs(remainingAmount).toFixed(2)} remaining to allocate.
            </Alert>
          )}

          {!canSplit && (
            <Alert icon={<IconAlertCircle size={16} />} color="blue">
              Add at least 2 splits to divide this transaction.
            </Alert>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              loading={isLoading}
              disabled={Math.abs(remainingAmount) > 0.01 || !canSplit}
            >
              Split Transaction
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}