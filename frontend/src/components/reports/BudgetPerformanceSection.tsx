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
  Accordion,
} from '@mantine/core';
import { formatCurrency } from '../../utils/formatters';
import {
  buildPeriodRollup,
  classifyTreeBudgetState,
  type PeriodTreeRollup,
} from '../../../../shared/utils/budgetCalculations';
import { TransactionPreviewTrigger } from '../transactions';
import type { Category, MonthlyBudget } from '../../../../shared/types';

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
  // Step 1 — build the per-tree period rollup once. Variance widgets and the
  // Spending Composition widget both consume this. Filters (transfers/hidden/
  // savings) are applied inside buildCategoryTreeAggregation so excluded
  // categories never contribute to parent totals.
  const periodTrees = useMemo<Map<string, PeriodTreeRollup> | null>(() => {
    if (!budgetMonthlyData || !categories || !trendsData) return null;

    const trendsByMonth = new Map<string, Map<string, number>>();
    trendsData.trends?.forEach(t => {
      let monthMap = trendsByMonth.get(t.month);
      if (!monthMap) { monthMap = new Map(); trendsByMonth.set(t.month, monthMap); }
      monthMap.set(t.categoryId, (monthMap.get(t.categoryId) ?? 0) + t.amount);
    });

    const monthlyData = budgetMonthlyData.map(monthData => {
      const monthBudgets: MonthlyBudget[] = monthData.budgets.map(b => ({
        id: `${monthData.month}-${b.categoryId}`,
        categoryId: b.categoryId,
        month: monthData.month,
        amount: b.amount,
      }));
      return {
        month: monthData.month,
        budgets: monthBudgets,
        actuals: trendsByMonth.get(monthData.month) ?? new Map<string, number>(),
      };
    });

    return buildPeriodRollup(categories, monthlyData, {
      excludeSavings: true, excludeTransfers: true, excludeHidden: true,
    });
  }, [budgetMonthlyData, trendsData, categories]);

  // Step 2 — variance widgets (REQ-009/010/011). Expense-only.
  const variance = useMemo(() => {
    if (!periodTrees || !budgetMonthlyData) return null;
    const totalMonthsInRange = budgetMonthlyData.length;
    const expenseTrees = Array.from(periodTrees.values()).filter(t => !t.isIncome);

    // Widget 1: Budget Accuracy Score
    let totalBudgeted = 0;
    let totalActualForBudgeted = 0;
    for (const t of expenseTrees) {
      if (t.effectiveBudget > 0) {
        totalBudgeted += t.effectiveBudget;
        totalActualForBudgeted += t.effectiveActual;
      }
    }
    const accuracyScore = totalBudgeted > 0
      ? Math.max(0, 100 - Math.abs((totalActualForBudgeted - totalBudgeted) / totalBudgeted * 100))
      : 0;

    // Widget 2: Top 10 Budget Gaps
    const budgetGaps = expenseTrees
      .filter(t => t.effectiveBudget > 0)
      .map(t => ({
        categoryId: t.parentId,
        categoryName: t.parentName,
        childCategoryIds: t.childIds,
        budgeted: t.effectiveBudget,
        actual: t.effectiveActual,
        gap: t.effectiveActual - t.effectiveBudget,
        percentUsed: (t.effectiveActual / t.effectiveBudget) * 100,
      }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 10);

    // Widget 3: Consistently Over-Budget (per-month signal preserved by buildPeriodRollup)
    const overBudgetThreshold = Math.min(3, totalMonthsInRange);
    const consistentlyOver = expenseTrees
      .filter(t => t.monthsOverBudget >= overBudgetThreshold)
      .map(t => ({
        categoryId: t.parentId,
        categoryName: t.parentName,
        monthsOverBudget: t.monthsOverBudget,
        monthsWithBudget: t.monthsWithBudget,
        totalOverspend: t.effectiveActual - t.effectiveBudget,
      }))
      .sort((a, b) => b.monthsOverBudget - a.monthsOverBudget);

    // Widget 4: Unused Budgets (REQ-011 — child spending counts toward parent threshold)
    const unusedBudgets = expenseTrees
      .filter(t => t.effectiveBudget > 0 && (t.effectiveActual / t.effectiveBudget) < 0.1)
      .map(t => ({
        categoryId: t.parentId,
        categoryName: t.parentName,
        childCategoryIds: t.childIds,
        budgeted: t.effectiveBudget,
        actual: t.effectiveActual,
        percentUsed: (t.effectiveActual / t.effectiveBudget) * 100,
      }))
      .sort((a, b) => a.percentUsed - b.percentUsed);

    // Widget 5: Unbudgeted Spending (REQ-010 three-case rule).
    // Using inline join here rather than formatCategoryPath because we already
    // have the parent name on the tree object — avoids an extra category lookup
    // per row at render time.
    const treePath = (t: PeriodTreeRollup, childName: string): string => `${t.parentName} \u2192 ${childName}`;
    const unbudgetedSpending: { categoryId: string; categoryName: string; childCategoryIds: string[]; actual: number }[] = [];
    for (const t of expenseTrees) {
      const state = classifyTreeBudgetState(t);
      if (state === 'parent_budgeted') continue;

      if (state === 'child_budgeted_only') {
        for (const child of t.children) {
          if (child.actual > 0 && child.budgeted === 0) {
            unbudgetedSpending.push({ categoryId: child.categoryId, categoryName: treePath(t, child.categoryName), childCategoryIds: [], actual: child.actual });
          }
        }
        if (t.directActual > 0) {
          unbudgetedSpending.push({ categoryId: t.parentId, categoryName: `${t.parentName} (direct)`, childCategoryIds: [], actual: t.directActual });
        }
        continue;
      }

      // 'unbudgeted' — no node in tree has a budget
      if (t.effectiveActual <= 0) continue;
      const childrenWithSpending = t.children.filter(c => c.actual > 0);
      if (childrenWithSpending.length === 0) {
        unbudgetedSpending.push({ categoryId: t.parentId, categoryName: t.parentName, childCategoryIds: t.childIds, actual: t.effectiveActual });
      } else {
        for (const child of childrenWithSpending) {
          unbudgetedSpending.push({ categoryId: child.categoryId, categoryName: treePath(t, child.categoryName), childCategoryIds: [], actual: child.actual });
        }
        if (t.directActual > 0) {
          unbudgetedSpending.push({ categoryId: t.parentId, categoryName: `${t.parentName} (direct)`, childCategoryIds: [], actual: t.directActual });
        }
      }
    }
    unbudgetedSpending.sort((a, b) => b.actual - a.actual);

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
  }, [periodTrees, budgetMonthlyData]);

  // Step 3 — Spending Composition widget (BRD §2.3, independent of variance per REQ-016).
  const spendingComposition = useMemo(() => {
    if (!periodTrees) return null;
    const out: {
      parentId: string;
      parentName: string;
      effectiveBudget: number;
      effectiveActual: number;
      leaves: { categoryId: string; categoryName: string; actual: number; percentOfParentActual: number }[];
    }[] = [];
    for (const t of periodTrees.values()) {
      if (t.isIncome) continue;
      if (t.effectiveBudget <= 0) continue;
      const childrenWithSpending = t.children.filter(c => c.actual > 0);
      if (childrenWithSpending.length === 0) continue;

      const leaves = childrenWithSpending.map(child => ({
        categoryId: child.categoryId,
        categoryName: child.categoryName,
        actual: child.actual,
        percentOfParentActual: t.effectiveActual > 0 ? (child.actual / t.effectiveActual) * 100 : 0,
      }));
      if (t.directActual > 0) {
        leaves.push({
          categoryId: t.parentId,
          categoryName: '(direct)',
          actual: t.directActual,
          percentOfParentActual: t.effectiveActual > 0 ? (t.directActual / t.effectiveActual) * 100 : 0,
        });
      }
      leaves.sort((a, b) => b.actual - a.actual);
      out.push({
        parentId: t.parentId,
        parentName: t.parentName,
        effectiveBudget: t.effectiveBudget,
        effectiveActual: t.effectiveActual,
        leaves,
      });
    }
    out.sort((a, b) => b.effectiveActual - a.effectiveActual);
    return out;
  }, [periodTrees]);

  // Combined object the JSX still expects.
  const budgetHealthData = useMemo(() => {
    if (!variance || !spendingComposition) return null;
    return { ...variance, spendingComposition };
  }, [variance, spendingComposition]);

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
                      additionalCategoryIds={row.childCategoryIds}
                      dateRange={{ startDate, endDate }}
                      timeRangeFilter={timeRange}
                      tooltipText={row.childCategoryIds.length > 0
                        ? `Click to preview transactions across ${row.categoryName} and ${row.childCategoryIds.length} subcategor${row.childCategoryIds.length === 1 ? 'y' : 'ies'}`
                        : "Click to preview transactions"}
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
                          additionalCategoryIds={row.childCategoryIds}
                          dateRange={{ startDate, endDate }}
                          timeRangeFilter={timeRange}
                          tooltipText={row.childCategoryIds.length > 0
                            ? `Click to preview transactions across ${row.categoryName} and ${row.childCategoryIds.length} subcategor${row.childCategoryIds.length === 1 ? 'y' : 'ies'}`
                            : "Click to preview transactions"}
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
                <Table.Tr key={row.categoryId + row.categoryName}>
                  <Table.Td>
                    <Text size="sm">{row.categoryName}</Text>
                  </Table.Td>
                  <Table.Td>
                    <TransactionPreviewTrigger
                      categoryId={row.categoryId}
                      categoryName={row.categoryName}
                      additionalCategoryIds={row.childCategoryIds.length > 0 ? row.childCategoryIds : undefined}
                      dateRange={{ startDate, endDate }}
                      timeRangeFilter={timeRange}
                      tooltipText={row.childCategoryIds.length > 0
                        ? `Click to preview transactions across ${row.categoryName} and ${row.childCategoryIds.length} subcategor${row.childCategoryIds.length === 1 ? 'y' : 'ies'}`
                        : "Click to preview transactions"}
                    >
                      <Text size="sm" c="orange" fw={500} style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
                        {formatCurrency(row.actual)}
                      </Text>
                    </TransactionPreviewTrigger>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {/* Widget 6: Spending Composition */}
      <Paper withBorder p="md">
        <Text size="lg" fw={600} mb={4}>Spending Composition</Text>
        <Text size="sm" c="dimmed" mb="md">
          Within categories you budgeted at the parent level, how did your spending break down across subcategories?
          Click a row to expand its breakdown.
        </Text>
        {budgetHealthData.spendingComposition.length === 0 ? (
          <Text c="dimmed" size="sm">No budgeted parent categories with subcategory spending in this period.</Text>
        ) : (
          <Accordion variant="separated" multiple chevronPosition="left">
            {budgetHealthData.spendingComposition.map(tree => (
              <Accordion.Item key={tree.parentId} value={tree.parentId}>
                <Accordion.Control>
                  <Group justify="space-between" align="baseline" wrap="nowrap" gap="md">
                    <Text size="sm" fw={600}>{tree.parentName}</Text>
                    <Group gap="xs" wrap="nowrap">
                      <Text size="xs" c="dimmed">Budget</Text>
                      <Text size="sm" fw={500}>{formatCurrency(tree.effectiveBudget)}</Text>
                      <Text size="xs" c="dimmed">·</Text>
                      <Text size="xs" c="dimmed">Spent</Text>
                      <Text size="sm" fw={500}>{formatCurrency(tree.effectiveActual)}</Text>
                      <Badge size="xs" variant="light" color="gray">
                        {tree.leaves.length} subcategor{tree.leaves.length === 1 ? 'y' : 'ies'}
                      </Badge>
                    </Group>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Subcategory</Table.Th>
                        <Table.Th>Spent</Table.Th>
                        <Table.Th style={{ minWidth: 160 }}>% of Spending</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {tree.leaves.map(leaf => (
                        <Table.Tr key={leaf.categoryId + leaf.categoryName}>
                          <Table.Td>
                            <Text size="sm" c={leaf.categoryName === '(direct)' ? 'dimmed' : undefined}>
                              {leaf.categoryName}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <TransactionPreviewTrigger
                              categoryId={leaf.categoryId}
                              categoryName={leaf.categoryName === '(direct)' ? `${tree.parentName} (direct)` : leaf.categoryName}
                              dateRange={{ startDate, endDate }}
                              timeRangeFilter={timeRange}
                              tooltipText="Click to preview transactions"
                            >
                              <Text size="sm" style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>
                                {formatCurrency(leaf.actual)}
                              </Text>
                            </TransactionPreviewTrigger>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" align="center">
                              <Progress.Root size="sm" style={{ flex: 1 }}>
                                <Progress.Section value={Math.min(100, leaf.percentOfParentActual)} color="blue" />
                              </Progress.Root>
                              <Text size="xs" w={40} ta="right">{leaf.percentOfParentActual.toFixed(0)}%</Text>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </Paper>
    </Stack>
  );
}
