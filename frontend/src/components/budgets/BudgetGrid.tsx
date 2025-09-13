import {
  Table,
  Text,
  NumberInput,
  ActionIcon,
  Group,
  Badge,
  Tooltip,
  Box,
} from '@mantine/core';
import { IconEdit, IconTrash, IconDeviceFloppy, IconX } from '@tabler/icons-react';
import { useState, useMemo } from 'react';
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
  const isSubcategory = category?.parentId !== undefined;
  const isParent = !isSubcategory;
  const isVirtual = budget.id.startsWith('virtual-'); // Check if this is a virtual parent

  // Get budget type icon and determine category name like BudgetComparison
  let budgetTypeIcon = '💳 '; // Default to expense icon
  let displayName = isOrphaned ? 'Unknown Category' : category.name;

  if (!isOrphaned) {
    // Determine if it's income category
    const isIncomeCategory = isIncomeCategoryWithCategories(category.id, [category]);
    budgetTypeIcon = isIncomeCategory ? '💰 ' :
                     isTransferCategory(category.id) ? '🔄 ' : '💳 ';

    // For subcategories, show just the name (parent info will be in hierarchy)
    displayName = category.name;
  }

  const fullDisplayName = budgetTypeIcon + displayName;

  return (
    <Table.Tr>
      <Table.Td>
        <Box pl={isSubcategory ? 24 : 0}>
          <Group gap="xs">
            <Text
              fw={isParent ? 600 : 500}
              size={isSubcategory ? 'sm' : 'md'}
              c={isOrphaned ? 'dimmed' : isVirtual ? 'blue' : undefined}
              fs={isVirtual ? 'italic' : undefined}
            >
              {fullDisplayName}
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
        </Box>
      </Table.Td>
      
      <Table.Td width={200}>
        {isVirtual ? (
          <Text c="dimmed" fs="italic">No budget set</Text>
        ) : isEditing ? (
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
          {isVirtual ? (
            // Virtual parents have no actions
            null
          ) : isEditing ? (
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

  // Create hierarchical organization similar to BudgetComparison
  const hierarchicalBudgets = useMemo(() => {
    // Separate orphaned budgets
    const orphanedBudgets = visibleBudgets.filter(budget =>
      !categories.find(c => c.id === budget.categoryId)
    );

    // Group by parent category
    const parentCategoryIds = new Set<string>();
    const childrenByParent = new Map<string, MonthlyBudget[]>();
    const parentBudgets = new Map<string, MonthlyBudget>();
    const standaloneBudgets: MonthlyBudget[] = [];

    // Identify parents and group children
    categories.forEach(category => {
      if (category.parentId) {
        parentCategoryIds.add(category.parentId);
      }
    });

    // Separate budgets into parents and children
    visibleBudgets.forEach(budget => {
      const category = categories.find(c => c.id === budget.categoryId);
      if (!category) return; // Skip orphaned budgets

      if (category.parentId) {
        // It's a child category
        if (!childrenByParent.has(category.parentId)) {
          childrenByParent.set(category.parentId, []);
        }
        childrenByParent.get(category.parentId)!.push(budget);
      } else if (parentCategoryIds.has(budget.categoryId)) {
        // It's a parent category that has children
        parentBudgets.set(budget.categoryId, budget);
      } else {
        // It's a standalone category (no parent, no children)
        standaloneBudgets.push(budget);
      }
    });

    // Helper function to get category type for sorting
    const getCategoryType = (budget: MonthlyBudget): string => {
      if (isIncomeCategoryWithCategories(budget.categoryId, categories)) return 'income';
      if (isTransferCategory(budget.categoryId)) return 'transfer';
      return 'expense';
    };

    // Helper function to get category name for sorting
    const getCategoryName = (budget: MonthlyBudget): string => {
      const category = categories.find(c => c.id === budget.categoryId);
      return category?.name || '';
    };

    // Sort parent categories by type and name
    const sortedParentCategories = Array.from(parentCategoryIds)
      .map(parentId => ({
        parentId,
        category: categories.find(c => c.id === parentId)!,
        budget: parentBudgets.get(parentId),
        children: childrenByParent.get(parentId) || []
      }))
      .filter(item => item.children.length > 0) // Only include parents with children that have budgets
      .sort((a, b) => {
        // Sort by type first
        const typeA = isIncomeCategoryWithCategories(a.parentId, categories) ? 'income' :
                     isTransferCategory(a.parentId) ? 'transfer' : 'expense';
        const typeB = isIncomeCategoryWithCategories(b.parentId, categories) ? 'income' :
                     isTransferCategory(b.parentId) ? 'transfer' : 'expense';

        const typeOrder = { income: 1, expense: 2, transfer: 3 };
        if (typeA !== typeB) {
          return typeOrder[typeA as keyof typeof typeOrder] - typeOrder[typeB as keyof typeof typeOrder];
        }

        // Then by name
        return a.category.name.localeCompare(b.category.name);
      });

    // Sort standalone categories by type and name
    const sortedStandaloneBudgets = standaloneBudgets.sort((a, b) => {
      const typeA = getCategoryType(a);
      const typeB = getCategoryType(b);

      const typeOrder = { income: 1, expense: 2, transfer: 3 };
      if (typeA !== typeB) {
        return typeOrder[typeA as keyof typeof typeOrder] - typeOrder[typeB as keyof typeof typeOrder];
      }

      return getCategoryName(a).localeCompare(getCategoryName(b));
    });

    // Build final hierarchy
    const finalResult: MonthlyBudget[] = [];

    // Add parent categories with their children
    sortedParentCategories.forEach(({ parentId, budget, children }) => {
      // Always show parent category if it has children with budgets
      // If parent has no budget, create a "virtual" parent for display only
      if (budget) {
        // Parent has its own budget
        finalResult.push(budget);
      } else if (children.length > 0) {
        // Parent has no budget but has children with budgets - create virtual parent for hierarchy display
        const virtualParent: MonthlyBudget = {
          id: `virtual-${parentId}`,
          categoryId: parentId,
          month: children[0].month,
          amount: 0, // Virtual parent has no budget amount
        };
        finalResult.push(virtualParent);
      }

      // Sort and add children
      children
        .sort((a, b) => getCategoryName(a).localeCompare(getCategoryName(b)))
        .forEach(child => finalResult.push(child));
    });

    // Add standalone categories
    finalResult.push(...sortedStandaloneBudgets);

    // Add orphaned budgets at the end
    finalResult.push(...orphanedBudgets);

    return finalResult;
  }, [visibleBudgets, categories]);

  // Diagnostic information about category structure
  const diagnosticInfo = useMemo(() => {
    const parentCategories = categories.filter(c => !c.parentId);
    const childCategories = categories.filter(c => c.parentId);
    const categoriesWithBudgets = categories.filter(c =>
      visibleBudgets.some(b => b.categoryId === c.id)
    );

    return {
      totalCategories: categories.length,
      parentCategories: parentCategories.length,
      childCategories: childCategories.length,
      categoriesWithBudgets: categoriesWithBudgets.length,
      hierarchicalStructure: parentCategories.map(parent => ({
        parent: parent.name,
        children: childCategories
          .filter(child => child.parentId === parent.id)
          .map(child => child.name)
      })).filter(item => item.children.length > 0)
    };
  }, [categories, visibleBudgets]);

  return (
    <div>
      {/* Temporary diagnostic panel */}
      <div style={{
        background: '#f0f0f0',
        padding: '10px',
        margin: '10px 0',
        borderRadius: '4px',
        fontSize: '12px'
      }}>
        <strong>Category Structure Diagnostic:</strong><br/>
        Total Categories: {diagnosticInfo.totalCategories}<br/>
        Parent Categories: {diagnosticInfo.parentCategories}<br/>
        Child Categories: {diagnosticInfo.childCategories}<br/>
        Categories with Budgets: {diagnosticInfo.categoriesWithBudgets}<br/>
        {diagnosticInfo.hierarchicalStructure.length > 0 ? (
          <>
            <strong>Hierarchical Structure:</strong><br/>
            {diagnosticInfo.hierarchicalStructure.map((item, index) => (
              <div key={index}>
                {item.parent}: [{item.children.join(', ')}]
              </div>
            ))}
          </>
        ) : (
          <strong style={{color: 'orange'}}>No hierarchical structure found - all categories are standalone</strong>
        )}
      </div>

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Category</Table.Th>
            <Table.Th>Budget Amount</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {hierarchicalBudgets.map((budget) => {
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
    </div>
  );
}