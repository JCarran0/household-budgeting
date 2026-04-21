import { useMemo } from 'react';
import { Center, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, parse } from 'date-fns';
import { api } from '../../../lib/api';
import { useBvaIIUrlState } from './useBvaIIUrlState';
import { useDismissedParentIds } from './useDismissedParentIds';
import { composeBvaII } from '../../../../../shared/utils/bvaIIDataComposition';

interface BudgetVsActualsIIProps {
  /** Currently-selected month, shared with the parent Budgets page. YYYY-MM. */
  selectedMonth: string;
  /** Whether this tab is currently active. Gates fetches + expensive compute. */
  active: boolean;
}

/**
 * BvA II — accordion-first, rollover-aware Budget vs. Actuals view.
 *
 * @see BUDGET-VS-ACTUALS-II-BRD.md
 */
export function BudgetVsActualsII({ selectedMonth, active }: BudgetVsActualsIIProps) {
  const urlState = useBvaIIUrlState();
  const dismissed = useDismissedParentIds();

  const selectedYear = Number(selectedMonth.slice(0, 4));
  const selectedDate = useMemo(() => parse(`${selectedMonth}-01`, 'yyyy-MM-dd', new Date()), [selectedMonth]);
  const ytdEnd = useMemo(() => format(endOfMonth(selectedDate), 'yyyy-MM-dd'), [selectedDate]);

  // Shared categories query — identical key to other tabs so cache hits cross-tab.
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    enabled: active,
  });

  // Yearly budgets — shared with YearlyBudgetGrid's cache key for free cross-tab hit.
  const { data: yearlyBudgetData, isLoading: budgetsLoading } = useQuery({
    queryKey: ['budgets', 'year', selectedYear],
    queryFn: () => api.getYearlyBudgets(selectedYear),
    enabled: active,
  });

  // YTD transactions for the active year up to and including the selected month.
  const { data: ytdTransactionData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['bva-ii', 'transactions', selectedYear, selectedMonth],
    queryFn: () => api.getTransactions({
      startDate: `${selectedYear}-01-01`,
      endDate: ytdEnd,
    }),
    enabled: active,
  });

  const composition = useMemo(() => {
    if (!categories || !yearlyBudgetData || !ytdTransactionData) return null;
    return composeBvaII({
      categories,
      yearlyBudgets: yearlyBudgetData.budgets,
      yearlyTransactions: ytdTransactionData.transactions,
      selectedMonth,
      useRollover: urlState.rollover,
    });
  }, [categories, yearlyBudgetData, ytdTransactionData, selectedMonth, urlState.rollover]);

  if (!active) return null;

  const loading = budgetsLoading || transactionsLoading || !categories;

  return (
    <Paper p="md" withBorder>
      <Stack gap="xs">
        <Title order={3}>Budget vs. Actuals II</Title>
        <Text c="dimmed" size="sm">
          Month: {selectedMonth} · Rollover: {urlState.rollover ? 'on' : 'off'} ·
          Types: {urlState.types.size === 3 ? 'all' : Array.from(urlState.types).join(', ') || 'none'} ·
          Variance: {urlState.variance} ·
          Dismissed: {dismissed.dismissedIds.size} ·
          Show dismissed: {dismissed.showDismissed ? 'yes' : 'no'}
        </Text>

        {loading ? (
          <Center p="md"><Loader /></Center>
        ) : composition ? (
          <Text size="sm">
            Composed {composition.trees.size} parent tree{composition.trees.size === 1 ? '' : 's'}
            {urlState.rollover ? ` · ${composition.effectiveBudgetsForMonth.size} effective budget entries` : ''}.
            Accordion rendering lands in Phase 3.
          </Text>
        ) : (
          <Text size="sm" c="dimmed">No data.</Text>
        )}
      </Stack>
    </Paper>
  );
}
