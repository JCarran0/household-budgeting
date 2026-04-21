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
  /** Whether the BvA II Use Rollover toggle is currently on. Drives the callout. */
  useRolloverToggleOn: boolean;
}

interface ConfirmContext {
  scope: 'single' | 'multi';
  targetMonths: string[]; // months that will be written
  amount: number;
  /** null when the rollover flag isn't changing; object otherwise. */
  rolloverChange: { newValue: boolean; conflictingIds: string[] } | null;
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
 * categoryService logic and the equivalent helper in CategoryForm. Given the
 * target's id and the full category list, returns the ids of ancestor or
 * descendant categories that would conflict if `targetId` is flagged
 * isRollover=true. Frontend is convenience (REQ-019); the server validates on
 * submit regardless.
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

interface ApiErrorShape {
  response?: {
    data?: {
      error?: string;
      code?: string;
    };
  };
}
function getErrorMessage(err: unknown): string | undefined {
  return (err as ApiErrorShape)?.response?.data?.error;
}

/**
 * Row-level inline budget editor for BvA II (BRD §5).
 *
 * Two mutually-exclusive save paths:
 *   - Update the selected month only (createOrUpdateBudget).
 *   - Update every strictly-later month of the same calendar year
 *     (batchUpdateBudgets). Always overwrites — the confirmation modal's
 *     before/after table is the safety net (REQ-041).
 *
 * Also lets the user flip the category's `isRollover` flag inline (no need
 * to bounce to the Categories page). Subtree-conflict pre-flight uses the
 * local category cache; the confirmation step surfaces the conflict list
 * and the save path sends `resolveRolloverConflicts: true` when the user
 * confirms. Backend still validates on submit.
 *
 * Invalidates the shared budget cache keys so BvA II, the existing BvA tab,
 * and YearlyBudgetGrid all reflect the change next render. Also invalidates
 * ['categories'] when the rollover flag changes.
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
  const [isRolloverForm, setIsRolloverForm] = useState<boolean>(category.isRollover);
  const [confirm, setConfirm] = useState<ConfirmContext | null>(null);

  // Need the full category list so we can pre-flight subtree conflicts.
  // Cache key matches the BvA II component's query so this is usually a hit.
  const { data: allCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    enabled: opened,
  });

  useEffect(() => {
    if (opened) {
      setSelectedMonth(initialMonth);
      setAmount(existingBudgetsByMonth.get(initialMonth) ?? '');
      setIsRolloverForm(category.isRollover);
      setConfirm(null);
    }
  }, [opened, initialMonth, existingBudgetsByMonth, category.isRollover]);

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

  const rolloverChangedInForm = isRolloverForm !== category.isRollover;
  const rolloverToggleDisabled = !isBudgetableCategory(category.id, allCategories ?? []);

  const startConfirm = (scope: 'single' | 'multi') => {
    const value = amount === '' ? 0 : amount;
    const targetMonths = scope === 'single' ? [selectedMonth] : futureMonthsOfYear;

    let rolloverChange: ConfirmContext['rolloverChange'] = null;
    if (rolloverChangedInForm) {
      let conflictingIds: string[] = [];
      if (isRolloverForm && allCategories) {
        // Only turning rollover ON can conflict (subtree exclusivity).
        conflictingIds = findConflictsForTarget(category.id, allCategories);
      }
      rolloverChange = { newValue: isRolloverForm, conflictingIds };
    }

    setConfirm({ scope, amount: value, targetMonths, rolloverChange });
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

  const saving = singleMutation.isPending || multiMutation.isPending || categoryMutation.isPending;

  const invalidateRelatedQueries = async (rolloverAlsoChanged: boolean) => {
    // BvA II + existing BvA + YearlyBudgetGrid all care about these.
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
      queryClient.invalidateQueries({ queryKey: ['bva-ii'] }),
    ];
    if (rolloverAlsoChanged) {
      invalidations.push(queryClient.invalidateQueries({ queryKey: ['categories'] }));
    }
    await Promise.all(invalidations);
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    try {
      // 1. Rollover flag update (if changed) — must precede budget save so
      //    rollover math is correct by the time caches invalidate.
      if (confirm.rolloverChange) {
        const updates: UpdateCategoryDto = { isRollover: confirm.rolloverChange.newValue };
        if (confirm.rolloverChange.conflictingIds.length > 0) {
          updates.resolveRolloverConflicts = true;
        }
        await categoryMutation.mutateAsync(updates);
      }

      // 2. Budget save
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

      await invalidateRelatedQueries(confirm.rolloverChange !== null);
      notifications.show({
        title: 'Budget updated',
        message: `${category.name} — ${confirm.targetMonths.length} month${confirm.targetMonths.length === 1 ? '' : 's'} saved${confirm.rolloverChange ? `, rollover ${confirm.rolloverChange.newValue ? 'enabled' : 'disabled'}` : ''}.`,
        color: 'green',
      });
      onClose();
    } catch (err) {
      const message = getErrorMessage(err) ?? 'Failed to update budget';
      notifications.show({ title: 'Error', message, color: 'red' });
    }
  };

  const singleLabel = `Update ${format(parse(`${selectedMonth}-01`, 'yyyy-MM-dd', new Date()), 'MMMM')} Budget`;
  const multiLabel = `Update all future ${selectedYear} budgets`;

  const selectedDate = useMemo(
    () => parse(`${selectedMonth}-01`, 'yyyy-MM-dd', new Date()),
    [selectedMonth],
  );

  // Look up conflicting category display info so the confirmation modal can
  // show names + parent path instead of raw ids.
  const conflictingCategories = useMemo<Category[]>(() => {
    if (!confirm?.rolloverChange || !allCategories) return [];
    return confirm.rolloverChange.conflictingIds
      .map(id => allCategories.find(c => c.id === id))
      .filter((c): c is Category => Boolean(c));
  }, [confirm, allCategories]);

  const formatCategoryLabel = (c: Category): string => {
    if (!c.parentId) return c.name;
    const parent = allCategories?.find(p => p.id === c.parentId);
    return parent ? `${parent.name} → ${c.name}` : c.name;
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={confirm ? 'Confirm changes' : `Edit ${category.name} budget`}
      size="lg"
    >
      {confirm === null ? (
        <Stack>
          <Group gap="xs">
            <Badge variant="light">{category.isIncome ? 'Income' : category.isSavings ? 'Savings' : 'Spending'}</Badge>
            {isRolloverForm && <Badge variant="light" color="grape">Rollover</Badge>}
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

          <Switch
            label="Rollover budget"
            description="Surpluses and deficits carry month-to-month within the calendar year. Resets January 1."
            checked={isRolloverForm}
            onChange={(e) => setIsRolloverForm(e.currentTarget.checked)}
            disabled={rolloverToggleDisabled}
          />

          {(category.isRollover || isRolloverForm) && useRolloverToggleOn && (
            <Alert icon={<IconInfoCircle size={16} />} color="grape" variant="light">
              FYI: This change will trigger a recalculation of rollover amounts.
            </Alert>
          )}

          <Group justify="space-between" mt="md">
            <Button variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
            <Group>
              <Button
                variant="light"
                onClick={() => startConfirm('single')}
                disabled={amount === '' && !rolloverChangedInForm}
              >
                {singleLabel}
              </Button>
              <Button
                onClick={() => startConfirm('multi')}
                disabled={(amount === '' && !rolloverChangedInForm) || isDecember}
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

          {confirm.rolloverChange && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color={confirm.rolloverChange.conflictingIds.length > 0 ? 'orange' : 'grape'}
              variant="light"
            >
              <Stack gap={4}>
                <Text size="sm">
                  <b>Rollover will be turned {confirm.rolloverChange.newValue ? 'ON' : 'OFF'}</b> for this category.
                </Text>
                {confirm.rolloverChange.conflictingIds.length > 0 && (
                  <>
                    <Text size="sm">
                      This will also unflag{' '}
                      {conflictingCategories.length === 1 ? '1 related category' : `${conflictingCategories.length} related categories`}{' '}
                      (only one per parent/child chain can use rollover):
                    </Text>
                    <List size="sm" withPadding>
                      {conflictingCategories.map(c => (
                        <List.Item key={c.id}>{formatCategoryLabel(c)}</List.Item>
                      ))}
                    </List>
                  </>
                )}
              </Stack>
            </Alert>
          )}

          {(category.isRollover || confirm.rolloverChange?.newValue) && (
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
            <Button variant="default" onClick={() => setConfirm(null)} disabled={saving}>
              Back
            </Button>
            <Button onClick={handleConfirm} loading={saving}>
              Confirm
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
