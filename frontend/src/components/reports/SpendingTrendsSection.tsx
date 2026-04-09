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

// Color palette for charts — sourced from centralized color config
const COLORS = defaultPalette.chart.series;

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

interface CustomLineTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; dataKey: string; color: string }>;
  label?: string;
}

function CustomLineTooltip({ active, payload, label }: CustomLineTooltipProps) {
  if (active && payload && payload.length > 0) {
    const activeItems = payload.filter(item => item.value > 0);
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
  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Text size="lg" fw={600} mb="md">Spending by Category Over Time</Text>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={spendingTrendsData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <RechartsTooltip content={<CustomLineTooltip />} />
            <Legend />
            {categoryNames.map((category, index) => (
              <Line
                key={category}
                type="monotone"
                dataKey={category}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Paper>

      {/* Budget vs Actual Spending */}
      {budgetVsActualData && budgetVsActualData.length > 0 && (
        <Paper withBorder p="md">
          <Text size="lg" fw={600} mb="md">Planned vs Actual Spending</Text>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={budgetVsActualData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <RechartsTooltip content={<CustomAreaTooltip />} />
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
        </Paper>
      )}
    </Stack>
  );
}
