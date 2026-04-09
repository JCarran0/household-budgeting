import {
  Grid,
  Paper,
  Text,
  Center,
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

interface CashFlowChartEntry {
  month: string;
  income: number;
  expenses: number;
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

interface CustomAreaTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; dataKey: string }>;
  label?: string;
}

function CustomAreaTooltip({ active, payload, label }: CustomAreaTooltipProps) {
  if (active && payload && payload.length > 0) {
    const activeItems = payload.filter(item => item.value !== undefined && item.value !== null);
    if (activeItems.length === 1) {
      const data = activeItems[0];
      return (
        <Paper p="xs" withBorder shadow="sm">
          <Text size="sm" fw={600}>{label}</Text>
          <Text size="xs" c="dimmed">
            {data.dataKey}: ${data.value.toFixed(0)}
          </Text>
        </Paper>
      );
    } else if (activeItems.length > 1) {
      return (
        <Paper p="xs" withBorder shadow="sm">
          <Text size="sm" fw={600}>{label}</Text>
          {activeItems.map((item, index) => (
            <Text key={index} size="xs" c="dimmed">
              {item.dataKey}: ${item.value.toFixed(0)}
            </Text>
          ))}
        </Paper>
      );
    }
  }
  return null;
}

interface CashflowSectionProps {
  cashFlowChartData: CashFlowChartEntry[];
  budgetVsActualData: BudgetVsActualEntry[] | null;
}

export function CashflowSection({ cashFlowChartData, budgetVsActualData }: CashflowSectionProps) {
  return (
    <Grid>
      <Grid.Col span={12}>
        <Paper withBorder p="md">
          <Text size="lg" fw={600} mb="md">Income vs Expenses</Text>
          {cashFlowChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={cashFlowChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <RechartsTooltip content={<CustomAreaTooltip />} />
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
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Center h={300}>
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
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={budgetVsActualData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <RechartsTooltip content={<CustomAreaTooltip />} />
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
          </Paper>
        </Grid.Col>
      )}
    </Grid>
  );
}
