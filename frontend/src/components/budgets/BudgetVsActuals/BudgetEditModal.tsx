import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  List,
  Modal,
  NumberInput,
  Stack,
  Switch,
  Table,
  Text,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { format, parse } from 'date-fns';
import type { Category } from '../../../../../shared/types';
import { api, type CreateBudgetDto, type UpdateCategoryDto } from '../../../lib/api';
import { getApiErrorMessage } from '../../../lib/api/errors';
import { formatCurrency } from '../../../utils/formatters';
import { isBudgetableCategory } from '../../../../../shared/utils/categoryHelpers';

interface BudgetEditModalProps {
  opened: boolean;
  onClose: () => void;
  category: Category;
  initialMonth: string; // YYYY-MM
  /**
   * Existing per-month raw budgets for this category, keyed by YYYY-MM.
   * Drives the confirmation modal's before/after table and overwrite flags.
   * Pass the category-specific slice out of composition.budgetsByCategoryByMonth.
   */
  existingBudgetsByMonth: Map<string, number>;
  /** Whether the BvA Use Rollover toggle is currently on. Drives the callout. */
  useRolloverToggleOn: boolean;
}

interface ConfirmContext {
  scope: 'single' | 'multi';
  targetMonths: string[]; // months that will be written
  amount: number;
}

function monthLabel(month: string): string {
  const date = parse(`${month}-01`, 'yyyy-MM-dd', new Date());
  return format(date, 'MMMM yyyy');
}

function shortMonthLabel(month: string): string {
  const date = parse(`${month}-01`, 'yyyy-MM-dd', new Date());
  return format(date, 'MMM yyyy');
}

/**
 * Target-specific rollover subtree-conflict check — mirrors the backend
 * categoryService logic. Given the target's id and the full category list,
 * returns the ids of ancestor or descendant categories that would conflict
 * if `targetId` is flagged isRollover=true.
 */
function findConflictsForTarget(targetId: string, categories: Category[]): string[] {
  const target = categories.find(c => c.id === targetId);
  if (!target) return [];
  const conflicts: string[] = [];
  if (target.parentId) {
    const parent = categories.find(c => c.id === target.parentId);
    if (parent?.isRollover) conflicts.push(parent.id);
  }
  for (const c of categories) {
    if (c.parentId === targetId && c.isRollover) conflicts.push(c.id);
  }
  return conflicts;
}

/**
 * Row-level inline budget editor for BvA (BRD §5).
 *
 * Two mutually-exclusive budget save paths:
 *   - Update the selected month only (createOrUpdateBudget).
 *   - Update every strictly-later month of the same calendar year
 *     (batchUpdateBudgets). Always overwrites — the confirmation modal's
 *     before/after table is the safety net (REQ-041).
 *
 * The Rollover toggle is **independent of the budget save path** — flipping
 * it auto-saves via api.updateCategory immediately, without requiring the
 * user to update any budgets. Pre-flight conflict detection opens a nested
 * confirmation dialog when turning rollover ON would violate subtree
 * exclusivity; the save then includes resolveRolloverConflicts: true.
 *
 * Invalidates the shared budget cache keys (+ ['categories'] for rollover
 * changes) so BvA, YearlyBudgetGrid, and the Categories page all reflect
 * the changes next render.
 */
export function BudgetEditModal({
  opened,
  onClose,
  category,
  initialMonth,
  existingBudgetsByMonth,
  useRolloverToggleOn,
}: BudgetEditModalProps) {
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [amount, setAmount] = useState<number | ''>(() => existingBudgetsByMonth.get(initialMonth) ?? '');
  const [confirm, setConfirm] = useState<ConfirmContext | null>(null);
  // Pending rollover-ON confirmation (conflict case); null = no pending ask.
  const [pendingRolloverConflict, setPendingRolloverConflict] = useState<{
    conflictingIds: string[];
  } | null>(null);

  // Full category list for conflict pre-flight and to read the live
  // isRollover (server-authoritative) for the switch.
  const { data: allCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    enabled: opened,
  });

  const liveCategory: Category = useMemo(
    () => allCategories?.find(c => c.id === category.id) ?? category,
    [allCategories, category],
  );

  useEffect(() => {
    if (opened) {
      setSelectedMonth(initialMonth);
      setAmount(existingBudgetsByMonth.get(initialMonth) ?? '');
      setConfirm(null);
      setPendingRolloverConflict(null);
    }
  }, [opened, initialMonth, existingBudgetsByMonth]);

  const handleMonthChange = (next: string) => {
    setSelectedMonth(next);
    setAmount(existingBudgetsByMonth.get(next) ?? '');
  };

  const selectedYear = selectedMonth.slice(0, 4);
  const selectedMonthIdx = Number(selectedMonth.slice(5, 7));
  const isDecember = selectedMonthIdx === 12;

  const futureMonthsOfYear: string[] = useMemo(() => {
    const result: string[] = [];
    for (let i = selectedMonthIdx + 1; i <= 12; i++) {
      result.push(`${selectedYear}-${String(i).padStart(2, '0')}`);
    }
    return result;
  }, [selectedMonthIdx, selectedYear]);

  const currentMonthBudget = existingBudgetsByMonth.get(selectedMonth);
  const rolloverToggleDisabled = !isBudgetableCategory(category.id, allCategories ?? []);

  const startConfirm = (scope: 'single' | 'multi') => {
    const value = amount === '' ? 0 : amount;
    const targetMonths = scope === 'single' ? [selectedMonth] : futureMonthsOfYear;
    setConfirm({ scope, amount: value, targetMonths });
  };

  const singleMutation = useMutation({
    mutationFn: (dto: CreateBudgetDto) => api.createOrUpdateBudget(dto),
  });
  const multiMutation = useMutation({
    mutationFn: (updates: CreateBudgetDto[]) => api.batchUpdateBudgets(updates),
  });
  const categoryMutation = useMutation({
    mutationFn: (updates: UpdateCategoryDto) => api.updateCategory(category.id, updates),
  });

  const budgetSaving = singleMutation.isPending || multiMutation.isPending;
  const rolloverSaving = categoryMutation.isPending;

  const invalidateBudgetQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
      queryClient.invalidateQueries({ queryKey: ['bva'] }),
    ]);
  };

  const saveRollover = async (newValue: boolean, resolveConflicts: boolean) => {
    try {
      const updates: UpdateCategoryDto = { isRollover: newValue };
      if (resolveConflicts) updates.resolveRolloverConflicts = true;
      await categoryMutation.mutateAsync(updates);
      // Rollover changes affect the Rollover column math + the Categories
      // page, and the bva transactions/composition cache depends on the
      // flag too.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['bva'] }),
      ]);
      notifications.show({
        title: 'Category updated',
        message: `Rollover ${newValue ? 'enabled' : 'disabled'} for ${category.name}.`,
        color: 'green',
      });
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: getApiErrorMessage(err, 'Failed to update rollover'),
        color: 'red',
      });
    }
  };

  const handleRolloverToggle = async (nextChecked: boolean) => {
    if (!nextChecked) {
      // Turning off is always safe — never a subtree conflict.
      await saveRollover(false, false);
      return;
    }
    // Turning on — pre-flight subtree-conflict check. Matches the backend's
    // categoryService logic; server re-validates on submit.
    if (!allCategories) return;
    const conflicts = findConflictsForTarget(category.id, allCategories);
    if (conflicts.length > 0) {
      setPendingRolloverConflict({ conflictingIds: conflicts });
      return;
    }
    await saveRollover(true, false);
  };

  const handleConfirmRolloverResolve = async () => {
    if (!pendingRolloverConflict) return;
    await saveRollover(true, true);
    setPendingRolloverConflict(null);
  };

  const handleCancelRolloverResolve = () => {
    setPendingRolloverConflict(null);
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.scope === 'single') {
        await singleMutation.mutateAsync({
          categoryId: category.id,
          month: selectedMonth,
          amount: confirm.amount,
        });
      } else {
        const updates: CreateBudgetDto[] = confirm.targetMonths.map(month => ({
          categoryId: category.id,
          month,
          amount: confirm.amount,
        }));
        await multiMutation.mutateAsync(updates);
      }
      await invalidateBudgetQueries();
      notifications.show({
        title: 'Budget updated',
        message: `${category.name} — ${confirm.targetMonths.length} month${confirm.targetMonths.length === 1 ? '' : 's'} saved.`,
        color: 'green',
      });
      onClose();
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: getApiErrorMessage(err, 'Failed to update budget'),
        color: 'red',
      });
    }
  };

  const singleLabel = `Update ${format(parse(`${selectedMonth}-01`, 'yyyy-MM-dd', new Date()), 'MMMM')} Budget`;
  const multiLabel = `Update all future ${selectedYear} budgets`;

  const selectedDate = useMemo(
    () => parse(`${selectedMonth}-01`, 'yyyy-MM-dd', new Date()),
    [selectedMonth],
  );

  const conflictingCategories = useMemo<Category[]>(() => {
    if (!pendingRolloverConflict || !allCategories) return [];
    return pendingRolloverConflict.conflictingIds
      .map(id => allCategories.find(c => c.id === id))
      .filter((c): c is Category => Boolean(c));
  }, [pendingRolloverConflict, allCategories]);

  const formatCategoryLabel = (c: Category): string => {
    if (!c.parentId) return c.name;
    const parent = allCategories?.find(p => p.id === c.parentId);
    return parent ? `${parent.name} → ${c.name}` : c.name;
  };

  return (
    <>
    <Modal
      opened={opened}
      onClose={onClose}
      title={confirm ? 'Confirm budget change' : `Edit ${category.name} budget`}
      size="lg"
    >
      {confirm === null ? (
        <Stack>
          <Group gap="xs">
            <Badge variant="light">{category.isIncome ? 'Income' : category.isSavings ? 'Savings' : 'Spending'}</Badge>
            {liveCategory.isRollover && <Badge variant="light" color="grape">Rollover</Badge>}
          </Group>
          {category.parentId && (
            <Text size="sm" c="dimmed">Child of: {category.parentId}</Text>
          )}

          <MonthPickerInput
            label="Month"
            value={selectedDate}
            onChange={(v) => {
              if (!v) return;
              handleMonthChange(String(v).slice(0, 7));
            }}
            valueFormat="MMMM YYYY"
          />

          <NumberInput
            label="Amount"
            placeholder="0.00"
            prefix="$"
            decimalScale={2}
            fixedDecimalScale
            min={0}
            value={amount}
            onChange={(v) => {
              if (v === '' || v === null || v === undefined) {
                setAmount('');
                return;
              }
              const n = typeof v === 'number' ? v : Number(v);
              setAmount(Number.isFinite(n) ? n : '');
            }}
          />

          <Text size="xs" c="dimmed">
            Current budget for {monthLabel(selectedMonth)}: {currentMonthBudget !== undefined ? formatCurrency(currentMonthBudget) : '(unset)'}
          </Text>

          {/* Rollover toggle auto-saves on change (independent of the budget
              save buttons). Conflict confirmation opens in a nested modal
              when turning ON would violate subtree exclusivity. */}
          <Switch
            label="Rollover budget"
            description="Surpluses and deficits carry month-to-month within the calendar year. Resets January 1. Toggling auto-saves."
            checked={liveCategory.isRollover}
            onChange={(e) => handleRolloverToggle(e.currentTarget.checked)}
            disabled={rolloverToggleDisabled || rolloverSaving}
          />

          {liveCategory.isRollover && useRolloverToggleOn && (
            <Alert icon={<IconInfoCircle size={16} />} color="grape" variant="light">
              FYI: This change will trigger a recalculation of rollover amounts.
            </Alert>
          )}

          <Group justify="space-between" mt="md">
            <Button variant="default" onClick={onClose} disabled={budgetSaving}>Cancel</Button>
            <Group>
              <Button
                variant="light"
                onClick={() => startConfirm('single')}
                disabled={amount === ''}
              >
                {singleLabel}
              </Button>
              <Button
                onClick={() => startConfirm('multi')}
                disabled={amount === '' || isDecember}
                title={isDecember ? `No future months remaining in ${selectedYear}` : undefined}
              >
                {multiLabel}
              </Button>
            </Group>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <Text>
            You are about to update {confirm.targetMonths.length} budget{confirm.targetMonths.length === 1 ? '' : 's'} for{' '}
            <b>{category.name}</b>.
          </Text>

          {liveCategory.isRollover && (
            <Alert icon={<IconAlertCircle size={16} />} color="grape" variant="light">
              FYI: This change will trigger a recalculation of rollover amounts.
            </Alert>
          )}

          <Table withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Month</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Current</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>New</Table.Th>
                <Table.Th>Notes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {confirm.targetMonths.map(month => {
                const before = existingBudgetsByMonth.get(month);
                const hasExisting = before !== undefined;
                const isOverwrite = hasExisting && before !== confirm.amount;
                return (
                  <Table.Tr key={month}>
                    <Table.Td>{shortMonthLabel(month)}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      {hasExisting ? formatCurrency(before) : <Text size="sm" c="dimmed" component="span">(unset)</Text>}
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{formatCurrency(confirm.amount)}</Table.Td>
                    <Table.Td>
                      {isOverwrite && (
                        <Badge color="orange" variant="light" size="sm">
                          ← existing value will be overwritten
                        </Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>

          <Box>
            {confirm.targetMonths.some(m => {
              const b = existingBudgetsByMonth.get(m);
              return b !== undefined && b !== confirm.amount;
            }) && (
              <Text size="sm" c="orange" mt={4}>
                Some months above have existing budgets that will be overwritten.
              </Text>
            )}
          </Box>

          <Group justify="space-between" mt="md">
            <Button variant="default" onClick={() => setConfirm(null)} disabled={budgetSaving}>
              Back
            </Button>
            <Button onClick={handleConfirm} loading={budgetSaving}>
              Confirm
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>

    <Modal
      opened={pendingRolloverConflict !== null}
      onClose={handleCancelRolloverResolve}
      title="Resolve rollover conflict"
      size="md"
    >
      {pendingRolloverConflict && (
        <Stack>
          <Text>
            Flagging <b>{category.name}</b> as a rollover budget will unflag{' '}
            {conflictingCategories.length === 1 ? '1 related category' : `${conflictingCategories.length} related categories`}:
          </Text>
          <List>
            {conflictingCategories.map(c => (
              <List.Item key={c.id}>{formatCategoryLabel(c)}</List.Item>
            ))}
          </List>
          <Text size="sm" c="dimmed">
            Only one category per parent/child chain can use rollover.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={handleCancelRolloverResolve} disabled={rolloverSaving}>
              Cancel
            </Button>
            <Button color="red" onClick={handleConfirmRolloverResolve} loading={rolloverSaving}>
              Unflag and continue
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
    </>
  );
}
