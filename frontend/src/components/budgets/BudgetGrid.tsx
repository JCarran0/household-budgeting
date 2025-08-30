import {
  Table,
  Text,
  NumberInput,
  ActionIcon,
  Group,
  Progress,
  Badge,
  Tooltip,
  Stack,
} from '@mantine/core';
import { IconEdit, IconTrash, IconDeviceFloppy, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api } from '../../lib/api';
import type { MonthlyBudget, Category } from '../../../../shared/types';

interface BudgetGridProps {
  budgets: MonthlyBudget[];
  categories: Category[];
  month: string;
  onEdit: (budget: MonthlyBudget) => void;
}

interface BudgetRowProps {
  budget: MonthlyBudget;
  category: Category | undefined;
  month: string;
  onEdit: (budget: MonthlyBudget) => void;
  onDelete: (budgetId: string) => void;
  onUpdate: (budgetId: string, amount: number) => void;
}

function BudgetRow({ budget, category, month, onEdit, onDelete, onUpdate }: BudgetRowProps) {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editAmount, setEditAmount] = useState<number>(budget.amount);

  const handleSave = (): void => {
    if (editAmount !== budget.amount && editAmount > 0) {
      onUpdate(budget.id, editAmount);
    }
    setIsEditing(false);
  };

  const handleCancel = (): void => {
    setEditAmount(budget.amount);
    setIsEditing(false);
  };

  if (!category) return null;

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <Text fw={500}>{category.name}</Text>
          {category.isHidden && (
            <Badge size="xs" variant="light" color="gray">
              Hidden
            </Badge>
          )}
          {category.isSavings && (
            <Badge size="xs" variant="light" color="yellow">
              Savings
            </Badge>
          )}
        </Group>
      </Table.Td>
      
      <Table.Td width={200}>
        {isEditing ? (
          <NumberInput
            value={editAmount}
            onChange={(value) => setEditAmount(Number(value))}
            min={0}
            step={10}
            prefix="$"
            size="sm"
            styles={{ input: { width: 120 } }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
          />
        ) : (
          <Text fw={500}>${budget.amount.toFixed(2)}</Text>
        )}
      </Table.Td>
      
      <Table.Td width={100}>
        <Group gap={4}>
          {isEditing ? (
            <>
              <Tooltip label="Save">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="green"
                  onClick={handleSave}
                >
                  <IconDeviceFloppy size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Cancel">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={handleCancel}
                >
                  <IconX size={16} />
                </ActionIcon>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip label="Quick edit">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  onClick={() => setIsEditing(true)}
                >
                  <IconEdit size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Delete budget">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  onClick={() => onDelete(budget.id)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

export function BudgetGrid({ budgets, categories, month, onEdit }: BudgetGridProps) {
  const queryClient = useQueryClient();

  // Update budget mutation
  const updateMutation = useMutation({
    mutationFn: ({ categoryId, amount }: { categoryId: string; amount: number }) =>
      api.createOrUpdateBudget({ categoryId, month, amount }),
    onSuccess: () => {
      notifications.show({
        title: 'Budget Updated',
        message: 'Budget amount has been updated',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'month', month] });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to update budget',
        color: 'red',
      });
    },
  });

  // Delete budget mutation
  const deleteMutation = useMutation({
    mutationFn: api.deleteBudget,
    onSuccess: () => {
      notifications.show({
        title: 'Budget Deleted',
        message: 'Budget has been removed',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'month', month] });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete budget',
        color: 'red',
      });
    },
  });

  const handleUpdate = (budgetId: string, amount: number): void => {
    const budget = budgets.find(b => b.id === budgetId);
    if (budget) {
      updateMutation.mutate({ categoryId: budget.categoryId, amount });
    }
  };

  const handleDelete = (budgetId: string): void => {
    if (window.confirm('Are you sure you want to delete this budget?')) {
      deleteMutation.mutate(budgetId);
    }
  };

  // Group budgets by parent category
  const budgetsByParent = budgets.reduce<Record<string, MonthlyBudget[]>>((acc, budget) => {
    const category = categories.find(c => c.id === budget.categoryId);
    if (category) {
      const parentId = category.parentId || category.id;
      if (!acc[parentId]) acc[parentId] = [];
      acc[parentId].push(budget);
    }
    return acc;
  }, {});

  // Get parent categories that have budgets
  const parentCategories = categories.filter(cat => 
    !cat.parentId && budgetsByParent[cat.id]
  );

  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Category</Table.Th>
          <Table.Th width={200}>Budget Amount</Table.Th>
          <Table.Th width={100}>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {parentCategories.map(parent => (
          <Stack key={parent.id} gap={0}>
            {/* Parent category budgets */}
            {budgetsByParent[parent.id]
              .filter(b => b.categoryId === parent.id)
              .map(budget => (
                <BudgetRow
                  key={budget.id}
                  budget={budget}
                  category={parent}
                  month={month}
                  onEdit={onEdit}
                  onDelete={handleDelete}
                  onUpdate={handleUpdate}
                />
              ))}
            
            {/* Subcategory budgets */}
            {budgetsByParent[parent.id]
              .filter(b => b.categoryId !== parent.id)
              .map(budget => {
                const subcategory = categories.find(c => c.id === budget.categoryId);
                return (
                  <BudgetRow
                    key={budget.id}
                    budget={budget}
                    category={subcategory}
                    month={month}
                    onEdit={onEdit}
                    onDelete={handleDelete}
                    onUpdate={handleUpdate}
                  />
                );
              })}
          </Stack>
        ))}
        
        {/* Budgets without parent categories */}
        {budgets
          .filter(budget => {
            const category = categories.find(c => c.id === budget.categoryId);
            return category && !category.parentId && !budgetsByParent[category.id];
          })
          .map(budget => {
            const category = categories.find(c => c.id === budget.categoryId);
            return (
              <BudgetRow
                key={budget.id}
                budget={budget}
                category={category}
                month={month}
                onEdit={onEdit}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
              />
            );
          })}
      </Table.Tbody>
    </Table>
  );
}