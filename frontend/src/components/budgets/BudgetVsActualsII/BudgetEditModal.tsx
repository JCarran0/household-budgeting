import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { format, parse } from 'date-fns';
import type { Category } from '../../../../../shared/types';
import { api, type CreateBudgetDto } from '../../../lib/api';
import { formatCurrency } from '../../../utils/formatters';

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
 * Row-level inline budget editor for BvA II (BRD §5).
 *
 * Two mutually-exclusive save paths:
 *   - Update the selected month only (createOrUpdateBudget).
 *   - Update every strictly-later month of the same calendar year
 *     (batchUpdateBudgets). Always overwrites — the confirmation modal's
 *     before/after table is the safety net (REQ-041).
 *
 * Invalidates the shared budget cache keys so BvA II, the existing BvA tab,
 * and YearlyBudgetGrid all reflect the change next render.
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

  useEffect(() => {
    if (opened) {
      setSelectedMonth(initialMonth);
      setAmount(existingBudgetsByMonth.get(initialMonth) ?? '');
      setConfirm(null);
    }
  }, [opened, initialMonth, existingBudgetsByMonth]);

  // When the user changes the month picker, re-seed the amount from the
  // existing budget for that month so overwriting isn't surprising.
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

  const saving = singleMutation.isPending || multiMutation.isPending;

  const invalidateRelatedQueries = async () => {
    // BvA II + existing BvA + YearlyBudgetGrid all care about these.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
      queryClient.invalidateQueries({ queryKey: ['bva-ii'] }),
    ]);
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
      await invalidateRelatedQueries();
      notifications.show({
        title: 'Budget updated',
        message: `${category.name} — ${confirm.targetMonths.length} month${confirm.targetMonths.length === 1 ? '' : 's'} saved.`,
        color: 'green',
      });
      onClose();
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update budget';
      notifications.show({ title: 'Error', message, color: 'red' });
    }
  };

  const singleLabel = `Update ${format(parse(`${selectedMonth}-01`, 'yyyy-MM-dd', new Date()), 'MMMM')} Budget`;
  const multiLabel = `Update all future ${selectedYear} budgets`;

  // MonthPickerInput needs a Date; we keep the canonical string in state.
  const selectedDate = useMemo(
    () => parse(`${selectedMonth}-01`, 'yyyy-MM-dd', new Date()),
    [selectedMonth],
  );

  return (
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
            {category.isRollover && <Badge variant="light" color="grape">Rollover</Badge>}
          </Group>
          {category.parentId && (
            <Text size="sm" c="dimmed">Child of: {category.parentId}</Text>
          )}

          <MonthPickerInput
            label="Month"
            value={selectedDate}
            onChange={(v) => {
              if (!v) return;
              // Mantine's MonthPickerInput returns a string (DateValue) in v8;
              // take the YYYY-MM prefix regardless.
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
              // Mantine NumberInput delivers number | string | '' depending on
              // whether the user is mid-edit, using formatting, or has cleared
              // the field. Coerce to a number when possible; empty = unset.
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

          {category.isRollover && useRolloverToggleOn && (
            <Alert icon={<IconInfoCircle size={16} />} color="grape" variant="light">
              Changing this budget will recompute rollover balance for all prior months of the current calendar year.
            </Alert>
          )}

          <Group justify="space-between" mt="md">
            <Button variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
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

          {category.isRollover && (
            <Alert icon={<IconAlertCircle size={16} />} color="grape" variant="light">
              This category uses rollover. Changing budgets will recompute rollover balance for all affected months.
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

