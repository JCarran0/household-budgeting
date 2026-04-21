import { Paper, Stack, Text, Title } from '@mantine/core';
import { useBvaIIUrlState } from './useBvaIIUrlState';
import { useDismissedParentIds } from './useDismissedParentIds';

interface BudgetVsActualsIIProps {
  /** Currently-selected month, shared with the parent Budgets page. */
  selectedMonth: string; // YYYY-MM
  /** Whether this tab is currently active. Used to gate fetches. */
  active: boolean;
}

/**
 * BvA II — accordion-first, rollover-aware Budget vs. Actuals view.
 *
 * Phase 1 scaffold: URL state + dismissed-set hooks are wired; rendering logic
 * and data fetching land in later phases.
 *
 * @see BUDGET-VS-ACTUALS-II-BRD.md
 */
export function BudgetVsActualsII({ selectedMonth, active }: BudgetVsActualsIIProps) {
  const urlState = useBvaIIUrlState();
  const dismissed = useDismissedParentIds();

  if (!active) return null;

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
        <Text size="sm">Accordion + data layer coming in subsequent phases.</Text>
      </Stack>
    </Paper>
  );
}
