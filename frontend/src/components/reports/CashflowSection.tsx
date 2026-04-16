import {
  Grid,
  Paper,
  Text,
  Center,
  Group,
  Switch,
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
  netFlow: number;
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
  includeSavingsInNet: boolean;
  onToggleSavingsInNet: () => void;
}

export function CashflowSection({ cashFlowChartData, budgetVsActualData, includeSavingsInNet, onToggleSavingsInNet }: CashflowSectionProps) {
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
          <Group justify="space-between" mb="md">
            <Text size="lg" fw={600}>Income vs Expenses</Text>
            <Group gap="xs">
              <Text size="sm" c="dimmed">Include savings in net:</Text>
              <Switch
                checked={includeSavingsInNet}
                onChange={onToggleSavingsInNet}
                size="sm"
              />
            </Group>
          </Group>
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
