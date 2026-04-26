import {
  Grid,
  Paper,
  Text,
  Center,
  Group,
  Stack,
  Divider,
  Badge,
} from '@mantine/core';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { defaultPalette } from '../../theme';
import { createNearestLineTooltip, useChartMouseTracker } from './NearestLineTooltip';

interface CashFlowChartEntry {
  month: string;
  income: number;
  expenses: number;
  savings: number;
}

interface BudgetVsActualEntry {
  month: string;
  budgetedIncome: number;
  actualIncome: number;
  budgetedExpenses: number;
  actualExpenses: number;
  budgetedNetFlow: number;
  actualNetFlow: number;
}

interface CashflowSectionProps {
  cashFlowChartData: CashFlowChartEntry[];
  budgetVsActualData: BudgetVsActualEntry[] | null;
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  netIncome: number;
}

export function CashflowSection({ cashFlowChartData, budgetVsActualData, totalIncome, totalExpenses, totalSavings, netIncome }: CashflowSectionProps) {
  const incomeExpenseTracker = useChartMouseTracker();
  const cashFlowTracker = useChartMouseTracker();

  const CHART_HEIGHT = 300;

  const incomeExpenseYMax = Math.max(
    ...cashFlowChartData.flatMap(d => [d.income, d.expenses]),
    1,
  );
  const IncomeExpenseTooltip = createNearestLineTooltip(incomeExpenseTracker.mouseYRef, incomeExpenseYMax, CHART_HEIGHT);

  const cashFlowYMax = budgetVsActualData
    ? Math.max(...budgetVsActualData.flatMap(d => [d.budgetedNetFlow, d.actualNetFlow]), 1)
    : 1;
  const CashFlowTooltip = createNearestLineTooltip(cashFlowTracker.mouseYRef, cashFlowYMax, CHART_HEIGHT);

  return (
    <Grid>
      <Grid.Col span={12}>
        <Paper withBorder p="md">
          <Text size="lg" fw={600} mb="md">Cash Flow Summary</Text>

          {/* Three-line summary: Income / Spending / Savings / Net */}
          <Stack gap={4} mb="md">
            <Group justify="space-between">
              <Group gap="xs">
                <Badge color="green" variant="dot" size="sm" />
                <Text size="sm" c="dimmed">Income</Text>
              </Group>
              <Text size="sm" fw={500} c="green">+${Math.round(totalIncome).toLocaleString()}</Text>
            </Group>
            <Group justify="space-between">
              <Group gap="xs">
                <Badge color="red" variant="dot" size="sm" />
                <Text size="sm" c="dimmed">Spending</Text>
              </Group>
              <Text size="sm" fw={500} c="red">-${Math.round(totalExpenses).toLocaleString()}</Text>
            </Group>
            <Group justify="space-between">
              <Group gap="xs">
                <Badge color="teal" variant="dot" size="sm" />
                <Text size="sm" c="dimmed">Savings</Text>
              </Group>
              <Text size="sm" fw={500} c="teal">
                {totalSavings > 0 ? `-$${Math.round(totalSavings).toLocaleString()}` : '$0'}
                {totalSavings === 0 && <Text span size="xs" c="dimmed"> (no savings categories)</Text>}
              </Text>
            </Group>
            <Divider my={4} />
            <Group justify="space-between">
              <Text size="sm" fw={600}>Net Cashflow</Text>
              <Text size="sm" fw={600} c={netIncome >= 0 ? 'green' : 'red'}>
                {netIncome >= 0 ? '+' : '-'}${Math.round(Math.abs(netIncome)).toLocaleString()}
              </Text>
            </Group>
          </Stack>

          {cashFlowChartData.length > 0 ? (
            <div {...incomeExpenseTracker.containerProps}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <AreaChart data={cashFlowChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <RechartsTooltip content={<IncomeExpenseTooltip />} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke={defaultPalette.chart.income}
                    fill={defaultPalette.chart.income}
                    fillOpacity={0.6}
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    stroke={defaultPalette.chart.expense}
                    fill={defaultPalette.chart.expense}
                    fillOpacity={0.6}
                  />
                  <Area
                    type="monotone"
                    dataKey="savings"
                    stroke="#20c997"
                    fill="#20c997"
                    fillOpacity={0.6}
                    name="Savings"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Center h={CHART_HEIGHT}>
              <Text c="dimmed">No data available for the selected period</Text>
            </Center>
          )}
        </Paper>
      </Grid.Col>

      {/* Budget vs Actual Dashboard */}
      {budgetVsActualData && budgetVsActualData.length > 0 && (
        <Grid.Col span={12}>
          <Paper withBorder p="md">
            <Text size="lg" fw={600} mb="md">Planned vs Actual Cash Flow</Text>
            <div {...cashFlowTracker.containerProps}>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <AreaChart data={budgetVsActualData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <RechartsTooltip content={<CashFlowTooltip />} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="budgetedNetFlow"
                    stroke={defaultPalette.chart.budgeted}
                    fill={defaultPalette.chart.budgeted}
                    fillOpacity={0.6}
                    name="Planned Net Flow"
                  />
                  <Area
                    type="monotone"
                    dataKey="actualNetFlow"
                    stroke={defaultPalette.chart.income}
                    fill={defaultPalette.chart.income}
                    fillOpacity={0.6}
                    name="Actual Net Flow"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Paper>
        </Grid.Col>
      )}
    </Grid>
  );
}
