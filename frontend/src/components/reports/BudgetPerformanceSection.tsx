import { useMemo } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  Grid,
  Table,
  Badge,
  Center,
  Loader,
  Progress,
  RingProgress,
} from '@mantine/core';
import { formatCurrency } from '../../utils/formatters';
import { isExpenseCategoryExplicit, isTransferCategory } from '../../../../shared/utils/categoryHelpers';
import { TransactionPreviewTrigger } from '../transactions';
import type { Category } from '../../../../shared/types';

interface Budget {
  categoryId: string;
  amount: number;
}

interface MonthlyBudgetData {
  monthKey: string;
  month: string;
  budgets: Budget[];
  total: number;
}

interface TrendItem {
  categoryId: string;
  categoryName: string;
  month: string;
  amount: number;
}

interface TrendsData {
  trends: TrendItem[];
}

interface BudgetPerformanceSectionProps {
  budgetMonthlyData: MonthlyBudgetData[] | undefined;
  budgetLoading: boolean;
  trendsLoading: boolean;
  trendsData: TrendsData | undefined;
  categories: Category[] | undefined;
  startDate: string;
  endDate: string;
  timeRange: string;
}

export function BudgetPerformanceSection({
  budgetMonthlyData,
  budgetLoading,
  trendsLoading,
  trendsData,
  categories,
  startDate,
  endDate,
  timeRange,
}: BudgetPerformanceSectionProps) {
  // Compute budget health metrics from existing fetched data
  const budgetHealthData = useMemo(() => {
    if (!budgetMonthlyData || !categories || !trendsData) return null;

    // Determine how many months are in the range (for adjusting "consistently over" threshold)
    const totalMonthsInRange = budgetMonthlyData.length;

    // Helper: check if a category is a pure expense category (not income, not transfer, not hidden)
    const isExpense = (categoryId: string): boolean => {
      const cat = categories.find(c => c.id === categoryId);
      if (!cat || cat.isHidden) return false;
      if (isTransferCategory(categoryId)) return false;
      return isExpenseCategoryExplicit(categoryId, categories);
    };

    // Helper: build a human-readable name (parent → child)
    const getCategoryName = (categoryId: string): string => {
      const cat = categories.find(c => c.id === categoryId);
      if (!cat) return categoryId;
      const parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null;
      return parent ? `${parent.name} \u2192 ${cat.name}` : cat.name;
    };

    // Aggregate per-category budget and actual data across all months
    const categoryAgg = new Map<string, {
      budgeted: number;
      actual: number;
      monthsOverBudget: number;
      monthsWithBudget: number;
    }>();

    // Accumulate budgeted amounts from budgetMonthlyData
    budgetMonthlyData.forEach(monthData => {
      monthData.budgets.forEach(budget => {
        const existing = categoryAgg.get(budget.categoryId) ?? {
          budgeted: 0, actual: 0, monthsOverBudget: 0, monthsWithBudget: 0,
        };
        existing.budgeted += budget.amount;
        existing.monthsWithBudget += 1;
        categoryAgg.set(budget.categoryId, existing);
      });
    });

    // Accumulate actual spending from trendsData and track per-month over-budget
    trendsData.trends?.forEach(trend => {
      const existing = categoryAgg.get(trend.categoryId) ?? {
        budgeted: 0, actual: 0, monthsOverBudget: 0, monthsWithBudget: 0,
      };
      existing.actual += trend.amount;

      // Check if this specific month exceeded the budget for this category
      const monthBudget = budgetMonthlyData.find(m => m.month === trend.month);
      const budgetForCat = monthBudget?.budgets.find(b => b.categoryId === trend.categoryId);
      if (budgetForCat && trend.amount > budgetForCat.amount) {
        existing.monthsOverBudget += 1;
      }

      categoryAgg.set(trend.categoryId, existing);
    });

    // ---- Widget 1: Budget Accuracy Score ----
    let totalBudgeted = 0;
    let totalActualForBudgeted = 0;
    categoryAgg.forEach((data, id) => {
      if (data.budgeted > 0 && isExpense(id)) {
        totalBudgeted += data.budgeted;
        totalActualForBudgeted += data.actual;
      }
    });
    const accuracyScore = totalBudgeted > 0
      ? Math.max(0, 100 - Math.abs((totalActualForBudgeted - totalBudgeted) / totalBudgeted * 100))
      : 0;

    // ---- Widget 2: Top 10 Budget Gaps ----
    const budgetGaps = Array.from(categoryAgg.entries())
      .filter(([id, data]) => data.budgeted > 0 && isExpense(id))
      .map(([id, data]) => ({
        categoryId: id,
        categoryName: getCategoryName(id),
        budgeted: data.budgeted,
        actual: data.actual,
        gap: data.actual - data.budgeted,
        percentUsed: data.budgeted > 0 ? (data.actual / data.budgeted) * 100 : 0,
      }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 10);

    // ---- Widget 3: Consistently Over-Budget ----
    const overBudgetThreshold = Math.min(3, totalMonthsInRange);
    const consistentlyOver = Array.from(categoryAgg.entries())
      .filter(([id, data]) => data.monthsOverBudget >= overBudgetThreshold && isExpense(id))
      .map(([id, data]) => ({
        categoryId: id,
        categoryName: getCategoryName(id),
        monthsOverBudget: data.monthsOverBudget,
        monthsWithBudget: data.monthsWithBudget,
        totalOverspend: data.actual - data.budgeted,
      }))
      .sort((a, b) => b.monthsOverBudget - a.monthsOverBudget);

    // ---- Widget 4: Unused Budgets (<10% spent) ----
    const unusedBudgets = Array.from(categoryAgg.entries())
      .filter(([id, data]) => data.budgeted > 0 && (data.actual / data.budgeted) < 0.1 && isExpense(id))
      .map(([id, data]) => ({
        categoryId: id,
        categoryName: getCategoryName(id),
        budgeted: data.budgeted,
        actual: data.actual,
        percentUsed: (data.actual / data.budgeted) * 100,
      }))
      .sort((a, b) => a.percentUsed - b.percentUsed);

    // ---- Widget 5: Unbudgeted Spending ----
    const unbudgetedSpending = Array.from(categoryAgg.entries())
      .filter(([id, data]) => data.budgeted === 0 && data.actual > 0 && isExpense(id))
      .map(([id, data]) => ({
        categoryId: id,
        categoryName: getCategoryName(id),
        actual: data.actual,
      }))
      .sort((a, b) => b.actual - a.actual);

    return {
      accuracyScore,
      totalBudgeted,
      totalActual: totalActualForBudgeted,
      budgetGaps,
      consistentlyOver,
      unusedBudgets,
      unbudgetedSpending,
      overBudgetThreshold,
    };
  }, [budgetMonthlyData, trendsData, categories]);

  if (budgetLoading || trendsLoading) {
    return (
      <Center h={200}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (!budgetHealthData) {
    return (
      <Center h={200}>
        <Text c="dimmed">No budget data available for the selected period.</Text>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      {/* Widget 1: Budget Accuracy Score */}
      <Paper withBorder p="md">
        <Text size="lg" fw={600} mb="md">Budget Accuracy</Text>
        <Group align="center" gap="xl">
          <RingProgress
            size={120}
            thickness={12}
            roundCaps
            sections={[{
              value: Math.min(100, budgetHealthData.accuracyScore),
              color: budgetHealthData.accuracyScore >= 90 ? 'green'
                : budgetHealthData.accuracyScore >= 70 ? 'yellow'
                : 'red',
            }]}
            label={
              <Text
                ta="center"
                fw={700}
                size="lg"
                c={budgetHealthData.accuracyScore >= 90 ? 'green'
                  : budgetHealthData.accuracyScore >= 70 ? 'yellow'
                  : 'red'}
              >
                {budgetHealthData.accuracyScore.toFixed(0)}%
              </Text>
            }
          />
          <Stack gap={4}>
            <Text size="sm" c="dimmed">How closely actual spending matched your budget</Text>
            <Text size="sm">
              <strong>Total budgeted:</strong> {formatCurrency(budgetHealthData.totalBudgeted)}
            </Text>
            <Text size="sm">
              <strong>Total actual:</strong> {formatCurrency(budgetHealthData.totalActual)}
            </Text>
            <Text size="sm">
              <strong>Variance:</strong>{' '}
              <Text component="span" c={budgetHealthData.totalActual <= budgetHealthData.totalBudgeted ? 'green' : 'red'} fw={500}>
                {budgetHealthData.totalActual <= budgetHealthData.totalBudgeted ? '-' : '+'}
                {formatCurrency(Math.abs(budgetHealthData.totalActual - budgetHealthData.totalBudgeted))}
              </Text>
            </Text>
          </Stack>
        </Group>
      </Paper>

      {/* Widget 2: Top 10 Budget Gaps */}
      <Paper withBorder p="md">
        <Text size="lg" fw={600} mb="md">Top Budget Gaps</Text>
        <Text size="sm" c="dimmed" mb="md">
          Categories with the largest difference between actual spending and budget (sorted by overspend).
        </Text>
        {budgetHealthData.budgetGaps.length === 0 ? (
          <Text c="dimmed" size="sm">No categories with budgets found for this period.</Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>Category</Table.Th>
                <Table.Th>Budgeted</Table.Th>
                <Table.Th>Actual</Table.Th>
                <Table.Th>Gap</Table.Th>
                <Table.Th style={{ minWidth: 160 }}>% Used</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {budgetHealthData.budgetGaps.map((row, idx) => (
                <Table.Tr key={row.categoryId}>
                  <Table.Td>
                    <Text size="sm" c="dimmed">{idx + 1}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{row.categoryName}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatCurrency(row.budgeted)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <TransactionPreviewTrigger
                      categoryId={row.categoryId}
                      categoryName={row.categoryName}
                      dateRange={{ startDate, endDate }}
                      timeRangeFilter={timeRange}
                      tooltipText="Click to preview transactions"
                    >
                      <Text size="sm" c={row.actual > row.budgeted ? 'red' : 'green'} fw={500} style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
                        {formatCurrency(row.actual)}
                      </Text>
                    </TransactionPreviewTrigger>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={row.gap > 0 ? 'red' : 'green'} fw={500}>
                      {row.gap > 0 ? '+' : ''}{formatCurrency(row.gap)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" align="center">
                      <Progress.Root size="sm" style={{ flex: 1 }}>
                        <Progress.Section
                          value={Math.min(100, row.percentUsed)}
                          color={row.percentUsed > 100 ? 'yellow' : row.percentUsed > 80 ? 'yellow' : 'green'}
                        />
                        {row.percentUsed > 100 && (
                          <Progress.Section
                            value={Math.min(100, row.percentUsed - 100)}
                            color="red"
                          />
                        )}
                      </Progress.Root>
                      <Text size="xs" w={40} ta="right">
                        {row.percentUsed.toFixed(0)}%
                      </Text>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {/* Widget 3 + 4 side by side */}
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="md" h="100%">
            <Text size="lg" fw={600} mb={4}>Consistently Over Budget</Text>
            <Text size="sm" c="dimmed" mb="md">
              Categories exceeding budget in {budgetHealthData.overBudgetThreshold}+ month(s).
            </Text>
            {budgetHealthData.consistentlyOver.length === 0 ? (
              <Stack gap={4}>
                <Text c="green" size="sm" fw={500}>No categories are consistently over budget!</Text>
                <Text c="dimmed" size="xs">Great job staying on track.</Text>
              </Stack>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Category</Table.Th>
                    <Table.Th>Months Over</Table.Th>
                    <Table.Th>Total Overspend</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {budgetHealthData.consistentlyOver.map(row => (
                    <Table.Tr key={row.categoryId}>
                      <Table.Td>
                        <Text size="sm">{row.categoryName}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color="red" variant="light" size="sm">
                          {row.monthsOverBudget}/{row.monthsWithBudget} mo
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c={row.totalOverspend > 0 ? 'red' : 'green'} fw={500}>
                          {row.totalOverspend > 0 ? '+' : '-'}{formatCurrency(Math.abs(row.totalOverspend))}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="md" h="100%">
            <Text size="lg" fw={600} mb={4}>Unused Budgets</Text>
            <Text size="sm" c="dimmed" mb="md">
              Categories with less than 10% of the budget spent — consider reallocating.
            </Text>
            {budgetHealthData.unusedBudgets.length === 0 ? (
              <Text c="dimmed" size="sm">No significantly underused budgets this period.</Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Category</Table.Th>
                    <Table.Th>Budgeted</Table.Th>
                    <Table.Th>Actual</Table.Th>
                    <Table.Th>% Used</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {budgetHealthData.unusedBudgets.map(row => (
                    <Table.Tr key={row.categoryId}>
                      <Table.Td>
                        <Text size="sm">{row.categoryName}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{formatCurrency(row.budgeted)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <TransactionPreviewTrigger
                          categoryId={row.categoryId}
                          categoryName={row.categoryName}
                          dateRange={{ startDate, endDate }}
                          timeRangeFilter={timeRange}
                          tooltipText="Click to preview transactions"
                        >
                          <Text size="sm" style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
                            {formatCurrency(row.actual)}
                          </Text>
                        </TransactionPreviewTrigger>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {row.percentUsed.toFixed(1)}%
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </Grid.Col>
      </Grid>

      {/* Widget 5: Unbudgeted Spending */}
      <Paper withBorder p="md">
        <Text size="lg" fw={600} mb={4}>Unbudgeted Spending</Text>
        <Text size="sm" c="dimmed" mb="md">
          Categories with actual spending but no budget set — consider adding a budget for these.
        </Text>
        {budgetHealthData.unbudgetedSpending.length === 0 ? (
          <Text c="green" size="sm" fw={500}>All spending categories have budgets assigned.</Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Category</Table.Th>
                <Table.Th>Total Spent</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {budgetHealthData.unbudgetedSpending.map(row => (
                <Table.Tr key={row.categoryId}>
                  <Table.Td>
                    <Text size="sm">{row.categoryName}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="orange" fw={500}>
                      {formatCurrency(row.actual)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
