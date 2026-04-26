import {
  Paper,
  Text,
  Stack,
} from '@mantine/core';
import {
  LineChart,
  Line,
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

// Color palette for charts — sourced from centralized color config
const COLORS = defaultPalette.chart.series;

interface BudgetVsActualEntry {
  month: string;
  budgetedIncome: number;
  actualIncome: number;
  budgetedExpenses: number;
  actualExpenses: number;
  budgetedNetCashflow: number;
  actualNetCashflow: number;
}

interface SpendingTrendsSectionProps {
  spendingTrendsData: Array<{ month: string; [category: string]: number | string }>;
  categoryNames: string[];
  budgetVsActualData: BudgetVsActualEntry[] | null;
}

export function SpendingTrendsSection({
  spendingTrendsData,
  categoryNames,
  budgetVsActualData,
}: SpendingTrendsSectionProps) {
  const spendingTracker = useChartMouseTracker();
  const budgetActualTracker = useChartMouseTracker();

  const SPENDING_HEIGHT = 400;
  const BUDGET_ACTUAL_HEIGHT = 300;

  const spendingYMax = Math.max(
    ...spendingTrendsData.flatMap(d =>
      categoryNames.map(cat => (typeof d[cat] === 'number' ? d[cat] : 0))
    ),
    1,
  );
  const SpendingTooltip = createNearestLineTooltip(spendingTracker.mouseYRef, spendingYMax, SPENDING_HEIGHT);

  const budgetActualYMax = budgetVsActualData
    ? Math.max(...budgetVsActualData.flatMap(d => [d.budgetedExpenses, d.actualExpenses]), 1)
    : 1;
  const BudgetActualTooltip = createNearestLineTooltip(budgetActualTracker.mouseYRef, budgetActualYMax, BUDGET_ACTUAL_HEIGHT);

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Text size="lg" fw={600} mb="md">Spending by Category Over Time</Text>
        <div {...spendingTracker.containerProps}>
          <ResponsiveContainer width="100%" height={SPENDING_HEIGHT}>
            <LineChart data={spendingTrendsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <RechartsTooltip content={<SpendingTooltip />} />
              <Legend />
              {categoryNames.map((category, index) => (
                <Line
                  key={category}
                  type="monotone"
                  dataKey={category}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Paper>

      {/* Budget vs Actual Spending */}
      {budgetVsActualData && budgetVsActualData.length > 0 && (
        <Paper withBorder p="md">
          <Text size="lg" fw={600} mb="md">Planned vs Actual Spending</Text>
          <div {...budgetActualTracker.containerProps}>
            <ResponsiveContainer width="100%" height={BUDGET_ACTUAL_HEIGHT}>
              <AreaChart data={budgetVsActualData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <RechartsTooltip content={<BudgetActualTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="budgetedExpenses"
                  stroke={defaultPalette.chart.plannedSpending}
                  fill={defaultPalette.chart.plannedSpending}
                  fillOpacity={0.6}
                  name="Planned Spending"
                />
                <Area
                  type="monotone"
                  dataKey="actualExpenses"
                  stroke={defaultPalette.chart.actualSpending}
                  fill={defaultPalette.chart.actualSpending}
                  fillOpacity={0.6}
                  name="Actual Spending"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Paper>
      )}
    </Stack>
  );
}
