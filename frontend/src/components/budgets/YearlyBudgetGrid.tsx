import {
  Table,
  Text,
  NumberInput,
  Group,
  Badge,
  Box,
  Loader,
  Center,
  Stack,
  ThemeIcon,
  Button,
} from '@mantine/core';
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  const [debouncedUpdates] = useDebouncedValue(pendingUpdates, 5000);
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [lastEditTime, setLastEditTime] = useState<number>(0);
  const processingRef = useRef<boolean>(false);
  const batchModeTimerRef = useRef<number | null>(null);
  const queryClient = useQueryClient();

  // Stable batch update function
  const performBatchUpdate = useCallback(async (updates: CreateBudgetDto[]) => {
    if (processingRef.current || updates.length === 0) return;

    processingRef.current = true;
    try {
      const data = await api.batchUpdateBudgets(updates);

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
    } catch {
      notifications.show({
        id: 'budget-error', // Use ID to prevent duplicates
        title: 'Save Failed',
        message: 'Failed to save budget changes',
        color: 'red',
        autoClose: 3000,
      });
    } finally {
      processingRef.current = false;
    }
  }, [queryClient, year]);

  // Manual save function
  const handleManualSave = useCallback(() => {
    if (pendingUpdates.size > 0) {
      const updates = Array.from(pendingUpdates.values());
      performBatchUpdate(updates);
    }
  }, [pendingUpdates, performBatchUpdate]);

  // Process debounced updates
  useEffect(() => {
    if (debouncedUpdates.size > 0) {
      const updates = Array.from(debouncedUpdates.values());
      performBatchUpdate(updates);
    }
  }, [debouncedUpdates, performBatchUpdate]);

  // Global keyboard shortcut for manual save (Ctrl/Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave]);

  // Cleanup batch mode timer on unmount
  useEffect(() => {
    return () => {
      if (batchModeTimerRef.current) {
        window.clearTimeout(batchModeTimerRef.current);
      }
    };
  }, []);

  // Detect batch editing patterns
  const detectBatchMode = useCallback(() => {
    const now = Date.now();
    const timeSinceLastEdit = now - lastEditTime;

    // If this is a second edit within 3 seconds, enter batch mode
    if (timeSinceLastEdit < 3000 && timeSinceLastEdit > 0) {
      setIsBatchMode(true);
    }

    setLastEditTime(now);

    // Clear existing timer
    if (batchModeTimerRef.current) {
      window.clearTimeout(batchModeTimerRef.current);
    }

    // Exit batch mode after 10 seconds of inactivity
    batchModeTimerRef.current = window.setTimeout(() => {
      setIsBatchMode(false);
    }, 10000);
  }, [lastEditTime]);

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

  // Helper function to get all editable cells in order
  const getAllEditableCells = useMemo(() => {
    const cells: { categoryId: string; month: string }[] = [];

    // Get flattened category data in display order
    const flatCategories: CategoryBudgetData[] = [];
    categoryBudgetData.forEach(data => {
      flatCategories.push(data);
      if (data.children) {
        flatCategories.push(...data.children);
      }
    });

    // Add all cells in row-major order (category by category, then months)
    flatCategories.forEach(data => {
      MONTHS.forEach(month => {
        cells.push({ categoryId: data.category.id, month: month.key });
      });
    });

    return cells;
  }, [categoryBudgetData]);

  // Navigation helpers
  const findNextCell = useCallback((currentCategoryId: string, currentMonth: string, direction: 'next' | 'prev') => {
    const cells = getAllEditableCells;
    const currentIndex = cells.findIndex(
      cell => cell.categoryId === currentCategoryId && cell.month === currentMonth
    );

    if (currentIndex === -1) return null;

    const nextIndex = direction === 'next'
      ? currentIndex + 1
      : currentIndex - 1;

    if (nextIndex >= 0 && nextIndex < cells.length) {
      return cells[nextIndex];
    }

    return null;
  }, [getAllEditableCells]);

  const navigateToCell = useCallback((categoryId: string, month: string, currentValue?: number) => {
    // Find the current value for the target cell
    const targetCategoryData = categoryBudgetData
      .flatMap(data => [data, ...(data.children || [])])
      .find(data => data.category.id === categoryId);

    const value = currentValue ?? (targetCategoryData?.budgets[month] || 0);

    setEditingCell({ categoryId, month, value });
  }, [categoryBudgetData]);

  const handleCellEdit = useCallback((categoryId: string, month: string, value: number) => {
    const monthKey = `${year}-${month}`;
    const updateKey = `${categoryId}_${monthKey}`;

    setEditingCell({ categoryId, month, value });

    // Detect batch editing patterns
    detectBatchMode();

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
  }, [year, detectBatchMode]);

  const renderCategoryRow = (data: CategoryBudgetData) => {
    const { category, budgets: categoryBudgets, isParent, isChild } = data;

    // Get category type icon
    const isIncomeCategory = isIncomeCategoryWithCategories(category.id, categories);
    const budgetTypeIcon = isIncomeCategory ? '💰 ' :
                          isTransferCategory(category.id) ? '🔄 ' : '💳 ';

    const displayName = budgetTypeIcon + category.name;

    return (
      <Table.Tr key={category.id}>
        <Table.Td
          style={{
            position: 'sticky',
            left: 0,
            background: 'var(--mantine-color-body)',
            zIndex: 2,
            minWidth: 200,
            maxWidth: 200,
            width: 200,
          }}
        >
          <Box pl={isChild ? 24 : 0}>
            <Group gap="xs" wrap="nowrap">
              <Text
                fw={isParent ? 600 : 500}
                size="xs"
                c={category.isHidden ? 'dimmed' : undefined}
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
                title={displayName}
              >
                {displayName}
              </Text>
              {category.isHidden && (
                <Badge size="xs" variant="light" color="gray">
                  Hidden
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
                    if (!editingCell) return;

                    if (e.key === 'Tab') {
                      e.preventDefault();
                      // Save current cell first
                      handleCellEdit(editingCell.categoryId, editingCell.month, editingCell.value);

                      // Navigate to next/previous cell
                      const direction = e.shiftKey ? 'prev' : 'next';
                      const nextCell = findNextCell(editingCell.categoryId, editingCell.month, direction);

                      if (nextCell) {
                        navigateToCell(nextCell.categoryId, nextCell.month);
                      } else {
                        setEditingCell(null);
                      }
                    } else if (e.key === 'Enter') {
                      handleCellEdit(editingCell.categoryId, editingCell.month, editingCell.value);

                      // Navigate to cell below (next row, same column)
                      const nextCell = findNextCell(editingCell.categoryId, editingCell.month, 'next');
                      if (nextCell) {
                        navigateToCell(nextCell.categoryId, nextCell.month);
                      } else {
                        setEditingCell(null);
                      }
                    } else if (e.key === 'Escape') {
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
                    padding: '2px',
                    borderRadius: '4px',
                    backgroundColor: hasPendingUpdate ? 'var(--mantine-color-yellow-light)' : 'transparent',
                    position: 'relative'
                  }}
                  onClick={() => setEditingCell({ categoryId: category.id, month: month.key, value: currentValue })}
                >
                  <Text size="xs" fw={currentValue > 0 ? 500 : 400} c={currentValue > 0 ? undefined : 'dimmed'}>
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
      <Table.ScrollContainer minWidth={1200} maxHeight="calc(100vh - 300px)">
        <Table
          striped
          highlightOnHover
          stickyHeader
          styles={{
            table: {
              fontSize: '12px',
            },
            th: {
              fontSize: '12px',
              padding: '6px 8px',
            },
            td: {
              padding: '4px 8px',
            },
          }}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ position: 'sticky', left: 0, background: 'var(--mantine-color-body)', zIndex: 3 }}>
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
      </Table.ScrollContainer>

      {pendingUpdates.size > 0 && (
        <Group justify="center" gap="md">
          {isBatchMode ? (
            <Badge variant="filled" color="blue" size="md">
              🚀 Batch Editing Mode - {pendingUpdates.size} change{pendingUpdates.size !== 1 ? 's' : ''} pending
            </Badge>
          ) : (
            <Badge variant="light" color="yellow" size="sm">
              {pendingUpdates.size} pending update{pendingUpdates.size !== 1 ? 's' : ''} - auto-saving in 5 seconds...
            </Badge>
          )}
          <Button
            size={isBatchMode ? "sm" : "xs"}
            variant={isBatchMode ? "filled" : "light"}
            color="green"
            leftSection={<IconDeviceFloppy size={14} />}
            onClick={handleManualSave}
            loading={processingRef.current}
          >
            {isBatchMode ? "Save All Changes" : "Save Now"}
          </Button>
        </Group>
      )}
    </Stack>
  );
}