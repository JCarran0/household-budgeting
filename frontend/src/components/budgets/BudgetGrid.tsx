import React from 'react';
import {
  Table,
  Text,
  NumberInput,
  ActionIcon,
  Group,
  Badge,
  Tooltip,
  Title,
} from '@mantine/core';
import { IconEdit, IconTrash, IconDeviceFloppy, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { api } from '../../lib/api';
import { formatCurrency } from '../../utils/formatters';
import type { MonthlyBudget, Category } from '../../../../shared/types';
import { 
  isIncomeCategoryWithCategories, 
  isTransferCategory 
} from '../../../../shared/utils/categoryHelpers';

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

function BudgetRow({ budget, category, onDelete, onUpdate }: BudgetRowProps) {
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

  // Display orphaned budgets as "Unknown Category"
  const isOrphaned = !category;
  const displayName = isOrphaned ? 'Unknown Category' : category.name;

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <Text fw={500} c={isOrphaned ? 'dimmed' : undefined}>
            {displayName}
          </Text>
          {isOrphaned && (
            <Badge size="xs" variant="light" color="red">
              Orphaned
            </Badge>
          )}
          {category?.isHidden && (
            <Badge size="xs" variant="light" color="gray">
              Hidden
            </Badge>
          )}
          {category?.isRollover && (
            <Badge size="xs" variant="light" color="yellow">
              Rollover
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
          <Text fw={500}>{formatCurrency(budget.amount)}</Text>
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
              {!isOrphaned && (
                <Tooltip label="Quick edit">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={() => setIsEditing(true)}
                  >
                    <IconEdit size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              <Tooltip label={isOrphaned ? "Delete orphaned budget" : "Delete budget"}>
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

  // Filter out budgets for hidden categories (including subcategories of hidden parents)
  // But KEEP orphaned budgets (where category doesn't exist) so they can be deleted
  const visibleBudgets = budgets.filter(budget => {
    const category = categories.find(c => c.id === budget.categoryId);
    
    // Keep orphaned budgets so they can be deleted
    if (!category) return true;
    
    // Hide if category is directly hidden
    if (category.isHidden) return false;
    
    // Hide if parent category is hidden
    if (category.parentId) {
      const parent = categories.find(p => p.id === category.parentId);
      if (parent?.isHidden) return false;
    }
    
    return true;
  });

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
    modals.openConfirmModal({
      title: 'Delete Budget',
      children: (
        <Text size="sm">
          Are you sure you want to delete this budget? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteMutation.mutate(budgetId),
    });
  };

  // Separate orphaned budgets from categorized budgets
  const orphanedBudgets = visibleBudgets.filter(budget => 
    !categories.find(c => c.id === budget.categoryId)
  );
  
  // Group budgets by type (Income, Expense, Transfer)
  const budgetsByType = visibleBudgets.reduce<{
    income: MonthlyBudget[],
    expense: MonthlyBudget[],
    transfer: MonthlyBudget[]
  }>((acc, budget) => {
    const category = categories.find(c => c.id === budget.categoryId);
    if (category) {
      if (isIncomeCategoryWithCategories(budget.categoryId, categories)) {
        acc.income.push(budget);
      } else if (isTransferCategory(budget.categoryId)) {
        acc.transfer.push(budget);
      } else {
        acc.expense.push(budget);
      }
    }
    return acc;
  }, { income: [], expense: [], transfer: [] });
  
  // Helper function to group budgets by parent category within each type
  const groupBudgetsByParent = (budgets: MonthlyBudget[]): Record<string, MonthlyBudget[]> => {
    return budgets.reduce<Record<string, MonthlyBudget[]>>((acc, budget) => {
      const category = categories.find(c => c.id === budget.categoryId);
      if (category) {
        const parentId = category.parentId || category.id;
        if (!acc[parentId]) acc[parentId] = [];
        acc[parentId].push(budget);
      }
      return acc;
    }, {});
  };

  const incomeBudgetsByParent = groupBudgetsByParent(budgetsByType.income);
  const expenseBudgetsByParent = groupBudgetsByParent(budgetsByType.expense);
  const transferBudgetsByParent = groupBudgetsByParent(budgetsByType.transfer);
  
  // Get parent categories for each type
  const incomeParentCategories = categories.filter(cat => 
    !cat.parentId && incomeBudgetsByParent[cat.id]
  );
  const expenseParentCategories = categories.filter(cat => 
    !cat.parentId && expenseBudgetsByParent[cat.id]
  );
  const transferParentCategories = categories.filter(cat => 
    !cat.parentId && transferBudgetsByParent[cat.id]
  );

  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Category</Table.Th>
          <Table.Th>Budget Amount</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {/* Income Section */}
        {incomeParentCategories.length > 0 && (
          <>
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Title order={5} c="green" mb="xs">Income</Title>
              </Table.Td>
            </Table.Tr>
            {incomeParentCategories.map(parent => (
              <React.Fragment key={`income-${parent.id}`}>
                {/* Parent category budgets */}
                {incomeBudgetsByParent[parent.id]
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
                {incomeBudgetsByParent[parent.id]
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
              </React.Fragment>
            ))}
          </>
        )}

        {/* Expense Section */}
        {expenseParentCategories.length > 0 && (
          <>
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Title order={5} c="red" mb="xs">Expenses</Title>
              </Table.Td>
            </Table.Tr>
            {expenseParentCategories.map(parent => (
              <React.Fragment key={`expense-${parent.id}`}>
                {/* Parent category budgets */}
                {expenseBudgetsByParent[parent.id]
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
                {expenseBudgetsByParent[parent.id]
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
              </React.Fragment>
            ))}
          </>
        )}

        {/* Transfer Section */}
        {transferParentCategories.length > 0 && (
          <>
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Title order={5} c="blue" mb="xs">Transfers</Title>
              </Table.Td>
            </Table.Tr>
            {transferParentCategories.map(parent => (
              <React.Fragment key={`transfer-${parent.id}`}>
                {/* Parent category budgets */}
                {transferBudgetsByParent[parent.id]
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
                {transferBudgetsByParent[parent.id]
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
              </React.Fragment>
            ))}
          </>
        )}
          
        {/* Orphaned budgets (categories that no longer exist) */}
        {orphanedBudgets.length > 0 && (
          <>
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Title order={5} c="gray" mb="xs">Unknown Categories</Title>
              </Table.Td>
            </Table.Tr>
            {orphanedBudgets.map(budget => (
              <BudgetRow
                key={budget.id}
                budget={budget}
                category={undefined}
                month={month}
                onEdit={onEdit}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
              />
            ))}
          </>
        )}
      </Table.Tbody>
    </Table>
  );
}