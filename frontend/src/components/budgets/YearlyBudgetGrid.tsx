import {
  Table,
  Text,
  NumberInput,
  Group,
  Badge,
  Box,
  ScrollArea,
  Loader,
  Center,
  Stack,
  ThemeIcon,
} from '@mantine/core';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useDebouncedValue } from '@mantine/hooks';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../utils/formatters';
import type { MonthlyBudget, Category } from '../../../../shared/types';

interface CreateBudgetDto {
  categoryId: string;
  month: string;
  amount: number;
}
import {
  isIncomeCategoryWithCategories,
  isTransferCategory,
  isBudgetableCategory
} from '../../../../shared/utils/categoryHelpers';

interface YearlyBudgetGridProps {
  budgets: MonthlyBudget[];
  categories: Category[];
  year: number;
  isLoading?: boolean;
}

interface CategoryBudgetData {
  category: Category;
  budgets: Record<string, number>; // month -> amount
  isParent: boolean;
  isChild: boolean;
  children?: CategoryBudgetData[];
}

interface EditingCell {
  categoryId: string;
  month: string;
  value: number;
}

const MONTHS = [
  { key: '01', name: 'Jan' },
  { key: '02', name: 'Feb' },
  { key: '03', name: 'Mar' },
  { key: '04', name: 'Apr' },
  { key: '05', name: 'May' },
  { key: '06', name: 'Jun' },
  { key: '07', name: 'Jul' },
  { key: '08', name: 'Aug' },
  { key: '09', name: 'Sep' },
  { key: '10', name: 'Oct' },
  { key: '11', name: 'Nov' },
  { key: '12', name: 'Dec' },
];

export function YearlyBudgetGrid({ budgets, categories, year, isLoading }: YearlyBudgetGridProps) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, CreateBudgetDto>>(new Map());
  const [debouncedUpdates] = useDebouncedValue(pendingUpdates, 1000);
  const queryClient = useQueryClient();

  // Batch update mutation
  const batchUpdateMutation = useMutation({
    mutationFn: (updates: CreateBudgetDto[]) => api.batchUpdateBudgets(updates),
    onSuccess: (data) => {
      // Only show notification if we actually updated budgets
      if (data.budgets && data.budgets.length > 0) {
        notifications.show({
          id: 'budget-update', // Use ID to prevent duplicates
          title: 'Budgets Saved',
          message: `Updated ${data.budgets.length} budget${data.budgets.length === 1 ? '' : 's'}`,
          color: 'green',
          icon: <IconDeviceFloppy size={16} />,
          autoClose: 2000,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['budgets', 'year', year] });
      setPendingUpdates(new Map());
    },
    onError: () => {
      notifications.show({
        id: 'budget-error', // Use ID to prevent duplicates
        title: 'Save Failed',
        message: 'Failed to save budget changes',
        color: 'red',
        autoClose: 3000,
      });
    },
  });

  // Process debounced updates
  useEffect(() => {
    if (debouncedUpdates.size > 0 && !batchUpdateMutation.isPending) {
      const updates = Array.from(debouncedUpdates.values());
      batchUpdateMutation.mutate(updates);
    }
  }, [debouncedUpdates, batchUpdateMutation]);

  // Organize categories hierarchically and create budget data
  const categoryBudgetData = useMemo<CategoryBudgetData[]>(() => {
    // Filter to only budgetable categories (exclude transfers)
    const budgetableCategories = categories.filter(cat =>
      isBudgetableCategory(cat.id, categories)
    );

    // Create budget lookup by category and month
    const budgetLookup = new Map<string, number>();
    budgets.forEach(budget => {
      const key = `${budget.categoryId}_${budget.month}`;
      budgetLookup.set(key, budget.amount);
    });

    // Group categories into parents and children
    const parentCategories = budgetableCategories.filter(cat => !cat.parentId);
    const childCategories = budgetableCategories.filter(cat => cat.parentId);
    const childrenByParent = new Map<string, Category[]>();

    childCategories.forEach(child => {
      if (child.parentId) {
        if (!childrenByParent.has(child.parentId)) {
          childrenByParent.set(child.parentId, []);
        }
        childrenByParent.get(child.parentId)!.push(child);
      }
    });

    // Create category budget data
    const createCategoryData = (category: Category, isChild = false): CategoryBudgetData => {
      const budgets: Record<string, number> = {};

      // Get budgets for all months of the year
      MONTHS.forEach(month => {
        const monthKey = `${year}-${month.key}`;
        const budgetKey = `${category.id}_${monthKey}`;
        budgets[month.key] = budgetLookup.get(budgetKey) || 0;
      });

      return {
        category,
        budgets,
        isParent: !isChild && childrenByParent.has(category.id),
        isChild,
      };
    };

    const result: CategoryBudgetData[] = [];

    // Sort categories by type (income first, then expense, then others)
    const sortedParents = parentCategories.sort((a, b) => {
      const typeA = isIncomeCategoryWithCategories(a.id, categories) ? 'income' :
                   isTransferCategory(a.id) ? 'transfer' : 'expense';
      const typeB = isIncomeCategoryWithCategories(b.id, categories) ? 'income' :
                   isTransferCategory(b.id) ? 'transfer' : 'expense';

      const typeOrder = { income: 1, expense: 2, transfer: 3 };
      if (typeA !== typeB) {
        return typeOrder[typeA as keyof typeof typeOrder] - typeOrder[typeB as keyof typeof typeOrder];
      }

      return a.name.localeCompare(b.name);
    });

    // Add parent categories with their children
    sortedParents.forEach(parent => {
      const parentData = createCategoryData(parent);
      const children = childrenByParent.get(parent.id) || [];

      if (children.length > 0) {
        parentData.children = children
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(child => createCategoryData(child, true));
      }

      result.push(parentData);
    });

    return result;
  }, [categories, budgets, year]);

  const handleCellEdit = useCallback((categoryId: string, month: string, value: number) => {
    const monthKey = `${year}-${month}`;
    const updateKey = `${categoryId}_${monthKey}`;

    setEditingCell({ categoryId, month, value });

    // Update pending updates
    setPendingUpdates(prev => {
      const newUpdates = new Map(prev);
      if (value === 0) {
        newUpdates.delete(updateKey);
      } else {
        newUpdates.set(updateKey, {
          categoryId,
          month: monthKey,
          amount: value,
        });
      }
      return newUpdates;
    });
  }, [year]);

  const renderCategoryRow = (data: CategoryBudgetData) => {
    const { category, budgets: categoryBudgets, isParent, isChild } = data;

    // Get category type icon
    const isIncomeCategory = isIncomeCategoryWithCategories(category.id, categories);
    const budgetTypeIcon = isIncomeCategory ? '💰 ' :
                          isTransferCategory(category.id) ? '🔄 ' : '💳 ';

    const displayName = budgetTypeIcon + category.name;

    return (
      <Table.Tr key={category.id}>
        <Table.Td style={{ position: 'sticky', left: 0, background: 'var(--mantine-color-body)', zIndex: 1 }}>
          <Box pl={isChild ? 24 : 0}>
            <Group gap="xs">
              <Text
                fw={isParent ? 600 : 500}
                size={isChild ? 'sm' : 'md'}
                c={category.isHidden ? 'dimmed' : undefined}
              >
                {displayName}
              </Text>
              {category.isHidden && (
                <Badge size="xs" variant="light" color="gray">
                  Hidden
                </Badge>
              )}
              {category.isRollover && (
                <Badge size="xs" variant="light" color="yellow">
                  Rollover
                </Badge>
              )}
            </Group>
          </Box>
        </Table.Td>

        {MONTHS.map((month) => {
          const currentValue = categoryBudgets[month.key] || 0;
          const isEditing = editingCell?.categoryId === category.id && editingCell?.month === month.key;
          const hasPendingUpdate = pendingUpdates.has(`${category.id}_${year}-${month.key}`);

          return (
            <Table.Td key={month.key} width={100}>
              {isEditing ? (
                <NumberInput
                  value={editingCell.value}
                  onChange={(value) => {
                    if (editingCell) {
                      setEditingCell({ ...editingCell, value: Number(value) || 0 });
                    }
                  }}
                  onBlur={() => {
                    if (editingCell) {
                      handleCellEdit(editingCell.categoryId, editingCell.month, editingCell.value);
                      setEditingCell(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      if (e.key === 'Enter' && editingCell) {
                        handleCellEdit(editingCell.categoryId, editingCell.month, editingCell.value);
                      }
                      setEditingCell(null);
                    }
                  }}
                  min={0}
                  step={10}
                  prefix="$"
                  size="xs"
                  styles={{ input: { textAlign: 'center' } }}
                  autoFocus
                />
              ) : (
                <Box
                  style={{
                    cursor: 'pointer',
                    textAlign: 'center',
                    padding: '4px',
                    borderRadius: '4px',
                    backgroundColor: hasPendingUpdate ? 'var(--mantine-color-yellow-light)' : 'transparent',
                    position: 'relative'
                  }}
                  onClick={() => setEditingCell({ categoryId: category.id, month: month.key, value: currentValue })}
                >
                  <Text size="sm" fw={currentValue > 0 ? 500 : 400} c={currentValue > 0 ? undefined : 'dimmed'}>
                    {currentValue > 0 ? formatCurrency(currentValue) : '—'}
                  </Text>
                  {hasPendingUpdate && (
                    <ThemeIcon
                      size="xs"
                      variant="light"
                      color="yellow"
                      style={{ position: 'absolute', top: -2, right: -2 }}
                    >
                      <IconDeviceFloppy size={8} />
                    </ThemeIcon>
                  )}
                </Box>
              )}
            </Table.Td>
          );
        })}
      </Table.Tr>
    );
  };

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ position: 'sticky', left: 0, background: 'var(--mantine-color-body)', zIndex: 2 }}>
                Category
              </Table.Th>
              {MONTHS.map((month) => (
                <Table.Th key={month.key} style={{ textAlign: 'center', minWidth: 100 }}>
                  {month.name}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {categoryBudgetData.map((data) => [
              renderCategoryRow(data),
              ...(data.children?.map((child) => renderCategoryRow(child)) || [])
            ]).flat()}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {pendingUpdates.size > 0 && (
        <Group justify="center">
          <Badge variant="light" color="yellow" size="sm">
            {pendingUpdates.size} pending update{pendingUpdates.size !== 1 ? 's' : ''} - saving automatically...
          </Badge>
        </Group>
      )}
    </Stack>
  );
}