import {
  Table,
  Text,
  Group,
  Badge,
  Box,
  Loader,
  Center,
  Stack,
  Button,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useDebouncedValue } from '@mantine/hooks';
import { IconDeviceFloppy, IconChevronLeft, IconChevronRight, IconFilterOff } from '@tabler/icons-react';
import { api } from '../../lib/api';
import type { MonthlyBudget, Category } from '../../../../shared/types';
import { YearlyBudgetCell, type EditingCell } from './YearlyBudgetCell';

interface CreateBudgetDto {
  categoryId: string;
  month: string;
  amount: number;
  notes?: string;
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
  onPreviousYear: () => void;
  onNextYear: () => void;
  onResetYear: () => void;
}

interface CategoryBudgetData {
  category: Category;
  budgets: Record<string, number>; // month -> amount
  notes: Record<string, string>; // month -> notes (empty string when none)
  isParent: boolean;
  isChild: boolean;
  children?: CategoryBudgetData[];
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

export function YearlyBudgetGrid({
  budgets,
  categories,
  year,
  isLoading,
  onPreviousYear,
  onNextYear,
  onResetYear,
}: YearlyBudgetGridProps) {
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
    const notesLookup = new Map<string, string>();
    budgets.forEach(budget => {
      const key = `${budget.categoryId}_${budget.month}`;
      budgetLookup.set(key, budget.amount);
      if (budget.notes) {
        notesLookup.set(key, budget.notes);
      }
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
      const notes: Record<string, string> = {};

      // Get budgets for all months of the year
      MONTHS.forEach(month => {
        const monthKey = `${year}-${month.key}`;
        const budgetKey = `${category.id}_${monthKey}`;
        budgets[month.key] = budgetLookup.get(budgetKey) || 0;
        notes[month.key] = notesLookup.get(budgetKey) || '';
      });

      return {
        category,
        budgets,
        notes,
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

    setEditingCell({ categoryId, month, value, originalValue: value });
  }, [categoryBudgetData]);

  const handleCellEdit = useCallback((categoryId: string, month: string, value: number, originalValue: number) => {
    if (value === originalValue) {
      // No change — don't queue a pending update
      return;
    }

    const monthKey = `${year}-${month}`;
    const updateKey = `${categoryId}_${monthKey}`;

    // Detect batch editing patterns
    detectBatchMode();

    // Update pending updates — preserve any notes already queued for this cell
    setPendingUpdates(prev => {
      const newUpdates = new Map(prev);
      const existing = prev.get(updateKey);
      newUpdates.set(updateKey, {
        ...(existing ?? {}),
        categoryId,
        month: monthKey,
        amount: value,
      });
      return newUpdates;
    });
  }, [year, detectBatchMode]);

  const handleNoteEdit = useCallback((categoryId: string, month: string, notes: string, currentAmount: number) => {
    const monthKey = `${year}-${month}`;
    const updateKey = `${categoryId}_${monthKey}`;

    detectBatchMode();

    setPendingUpdates(prev => {
      const newUpdates = new Map(prev);
      const existing = prev.get(updateKey);
      newUpdates.set(updateKey, {
        ...(existing ?? {}),
        categoryId,
        month: monthKey,
        amount: existing?.amount ?? currentAmount,
        notes,
      });
      return newUpdates;
    });
  }, [year, detectBatchMode]);

  const commitEditingCell = useCallback(() => {
    if (!editingCell) return;
    handleCellEdit(editingCell.categoryId, editingCell.month, editingCell.value, editingCell.originalValue);
  }, [editingCell, handleCellEdit]);

  const moveToCell = useCallback(
    (direction: 'next' | 'prev') => {
      if (!editingCell) return;
      commitEditingCell();
      const next = findNextCell(editingCell.categoryId, editingCell.month, direction);
      if (next) navigateToCell(next.categoryId, next.month);
      else setEditingCell(null);
    },
    [editingCell, commitEditingCell, findNextCell, navigateToCell],
  );

  const renderCategoryRow = (data: CategoryBudgetData) => {
    const { category, budgets: categoryBudgets, notes: categoryNotes, isParent, isChild } = data;

    const budgetTypeIcon = isIncomeCategoryWithCategories(category.id, categories) ? '💰 ' : isTransferCategory(category.id) ? '🔄 ' : '💳 ';
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
          const serverValue = categoryBudgets[month.key] || 0;
          const serverNote = categoryNotes[month.key] || '';
          const isEditing = editingCell?.categoryId === category.id && editingCell?.month === month.key;
          const updateKey = `${category.id}_${year}-${month.key}`;
          const pendingUpdate = pendingUpdates.get(updateKey);
          const hasPendingUpdate = pendingUpdate !== undefined;
          const currentValue = hasPendingUpdate ? pendingUpdate.amount : serverValue;
          const effectiveNote = pendingUpdate && 'notes' in pendingUpdate
            ? pendingUpdate.notes ?? ''
            : serverNote;

          return (
            <YearlyBudgetCell
              key={month.key}
              categoryId={category.id}
              categoryName={category.name}
              monthKey={month.key}
              monthName={month.name}
              currentValue={currentValue}
              effectiveNote={effectiveNote}
              hasPendingUpdate={hasPendingUpdate}
              isEditing={isEditing}
              editingCell={editingCell}
              onBeginEdit={setEditingCell}
              onChangeEditingValue={(value) => editingCell && setEditingCell({ ...editingCell, value })}
              onCommitEdit={() => { commitEditingCell(); setEditingCell(null); }}
              onCancelEdit={() => setEditingCell(null)}
              onTab={(shift) => moveToCell(shift ? 'prev' : 'next')}
              onEnter={() => moveToCell('next')}
              onSaveNote={(notes) => handleNoteEdit(category.id, month.key, notes, currentValue)}
            />
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
      {/* Sticky year picker controls */}
      <Group
        justify="space-between"
        style={{
          position: 'sticky',
          top: 0,
          background: 'var(--mantine-color-body)',
          zIndex: 100,
          padding: '12px 0',
        }}
      >
        <Group>
          <ActionIcon onClick={onPreviousYear} size="lg" variant="default">
            <IconChevronLeft size={16} />
          </ActionIcon>

          <Text size="lg" fw={600}>
            {year}
          </Text>

          <ActionIcon onClick={onNextYear} size="lg" variant="default">
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>

        <Group>
          <Tooltip label="Reset to current year">
            <ActionIcon onClick={onResetYear} size="lg" variant="default">
              <IconFilterOff size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Box
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 250px)',
          position: 'relative',
        }}
      >
        <Table
          striped
          highlightOnHover
          styles={{
            table: {
              fontSize: '12px',
              minWidth: 1200,
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
          <Table.Thead
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              backgroundColor: 'var(--mantine-color-body)',
            }}
          >
            <Table.Tr>
              <Table.Th style={{ position: 'sticky', left: 0, backgroundColor: 'var(--mantine-color-body)', zIndex: 100 }}>
                Category
              </Table.Th>
              {MONTHS.map((month) => (
                <Table.Th
                  key={month.key}
                  style={{
                    textAlign: 'center',
                    minWidth: 100,
                    backgroundColor: 'var(--mantine-color-body)',
                  }}
                >
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
      </Box>

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