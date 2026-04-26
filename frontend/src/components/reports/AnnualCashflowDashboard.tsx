import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Paper,
  Stack,
  Group,
  Title,
  Text,
  Table,
  Tooltip,
  Loader,
  Center,
  Badge,
} from '@mantine/core';
import { api } from '../../lib/api';
import { computeYearEndForecast, type YearForecastCell } from '../../../../shared/utils/cashflowForecast';
import { etMonthString } from '../../../../shared/utils/easternTime';
import { formatCurrency } from '../../utils/formatters';

const ROW_DEFS = [
  { key: 'income' as const, label: 'Income', color: 'green' as const },
  { key: 'spending' as const, label: 'Spending', color: 'red' as const },
  { key: 'savings' as const, label: 'Savings', color: 'teal' as const },
];

export function AnnualCashflowDashboard() {
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const yearStr = String(year);
  const currentMonthKey = useMemo(() => etMonthString(now), [now]);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: api.getCategories,
  });

  const { data: yearlyBudgetData, isLoading: budgetsLoading } = useQuery({
    queryKey: ['budgets', 'year', year],
    queryFn: () => api.getYearlyBudgets(year),
  });

  const { data: yearlyTxData, isLoading: txLoading } = useQuery({
    queryKey: ['annualCashflow', 'transactions', year],
    queryFn: () => api.getTransactions({
      startDate: `${yearStr}-01-01`,
      endDate: `${yearStr}-12-31`,
      limit: 10000,
    }),
  });

  const isLoading = budgetsLoading || txLoading || !categories;

  const forecast = useMemo(() => {
    if (!categories || !yearlyBudgetData || !yearlyTxData) return null;
    return computeYearEndForecast({
      year,
      asOf: now,
      transactions: yearlyTxData.transactions,
      budgets: yearlyBudgetData.budgets,
      categories,
    });
  }, [categories, yearlyBudgetData, yearlyTxData, year, now]);

  if (isLoading || !forecast) {
    return (
      <Paper withBorder p="md">
        <Center h={120}><Loader /></Center>
      </Paper>
    );
  }

  const { cells, totals } = forecast;
  const currentCol = cells.find(c => c.monthKey === currentMonthKey);
  const valueOf = (cell: YearForecastCell, key: 'income' | 'spending' | 'savings'): number => cell[key];

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Stack gap={2}>
            <Title order={4}>{year} Forecast — Actuals + Budgeted</Title>
            <Text size="xs" c="dimmed">
              Always shows the current calendar year. Past months use actuals;
              {' '}
              {currentCol ? `${currentCol.monthLabel} and later` : 'current and future months'} use budgeted (V1: current month treated as future).
            </Text>
          </Stack>
          <Group gap={6}>
            <Badge size="sm" variant="light" color="gray">Actual</Badge>
            <Badge size="sm" variant="filled" color="blue">Budgeted</Badge>
          </Group>
        </Group>

        <Table.ScrollContainer minWidth={1100}>
          <Table withTableBorder withColumnBorders striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ minWidth: 130 }}>&nbsp;</Table.Th>
                <Table.Th style={{ textAlign: 'right', minWidth: 110, background: 'var(--mantine-color-default-hover)' }}>
                  Year-End Total
                </Table.Th>
                {cells.map(col => (
                  <Table.Th
                    key={col.monthKey}
                    style={{
                      textAlign: 'right',
                      minWidth: 70,
                      opacity: col.mode === 'actual' ? 0.85 : 1,
                    }}
                  >
                    <Stack gap={0} align="flex-end">
                      <Text size="xs" fw={col.monthKey === currentMonthKey ? 700 : 500}>
                        {col.monthLabel}
                      </Text>
                      <Text size="9px" c="dimmed" tt="uppercase">
                        {col.mode}
                      </Text>
                    </Stack>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {ROW_DEFS.map(row => {
                const total = totals[row.key];
                return (
                  <Table.Tr key={row.label}>
                    <Table.Td>
                      <Group gap="xs">
                        <Badge color={row.color} variant="dot" size="sm" />
                        <Text size="sm" fw={500}>{row.label}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right', fontWeight: 600, background: 'var(--mantine-color-default-hover)' }}>
                      {formatCurrency(total)}
                    </Table.Td>
                    {cells.map(cell => (
                      <Table.Td
                        key={cell.monthKey}
                        style={{
                          textAlign: 'right',
                          color: cell.mode === 'actual' ? 'var(--mantine-color-dimmed)' : undefined,
                        }}
                      >
                        <Text size="sm">{formatCurrency(valueOf(cell, row.key))}</Text>
                      </Table.Td>
                    ))}
                  </Table.Tr>
                );
              })}
              <Table.Tr style={{ borderTop: '2px solid var(--mantine-color-default-border)' }}>
                <Table.Td>
                  <Tooltip label="Net Cashflow = Income − Spending − Savings" withArrow>
                    <Text size="sm" fw={700}>Net Cashflow</Text>
                  </Tooltip>
                </Table.Td>
                <Table.Td
                  style={{
                    textAlign: 'right',
                    fontWeight: 700,
                    background: 'var(--mantine-color-default-hover)',
                    color: totals.netCashflow >= 0 ? 'var(--mantine-color-green-7)' : 'var(--mantine-color-red-7)',
                  }}
                >
                  {formatCurrency(totals.netCashflow)}
                </Table.Td>
                {cells.map(cell => (
                  <Table.Td
                    key={cell.monthKey}
                    style={{
                      textAlign: 'right',
                      fontWeight: 600,
                      color: cell.netCashflow >= 0 ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)',
                      opacity: cell.mode === 'actual' ? 0.85 : 1,
                    }}
                  >
                    <Text size="sm">{formatCurrency(cell.netCashflow)}</Text>
                  </Table.Td>
                ))}
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>
    </Paper>
  );
}
