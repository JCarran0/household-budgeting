import { useMemo } from 'react';
import { Paper, Title, Text, Stack, Group, Badge, Divider } from '@mantine/core';
import type { BudgetComparisonResponse } from '../../lib/api';
import type { Category, BudgetComparison as BudgetComparisonType } from '../../../../shared/types';
import { formatCurrency } from '../../utils/formatters';

interface BudgetDebuggerProps {
  comparison: BudgetComparisonResponse;
  categories: Category[];
}

export function BudgetDebugger({ comparison, categories }: BudgetDebuggerProps) {
  const debugData = useMemo(() => {
    // Build category hierarchy map
    const categoryMap = new Map(categories.map(cat => [cat.id, cat]));
    const childCategoryIds = new Set(categories.filter(cat => cat.parentId).map(cat => cat.id));
    const parentCategoryIds = new Set(categories.filter(cat => !cat.parentId).map(cat => cat.id));

    // Analyze each comparison
    const comparisonAnalysis = comparison.comparisons.map(comp => {
      const category = categoryMap.get(comp.categoryId);
      const typedComp = comp as BudgetComparisonType;

      return {
        ...comp,
        category,
        isParent: parentCategoryIds.has(comp.categoryId),
        isChild: childCategoryIds.has(comp.categoryId),
        parentId: category?.parentId || null,
        parentName: category?.parentId ? categoryMap.get(category.parentId)?.name : null,
        isIncomeCategory: typedComp.isIncomeCategory || (category && category.id.startsWith('INCOME')),
        isTransferCategory: category?.id.startsWith('TRANSFER_') || false,
        isHiddenCategory: category?.isHidden || false
      };
    });

    // Calculate widget totals (current implementation)
    let widgetBudgetedIncome = 0;
    let widgetActualIncome = 0;
    let widgetBudgetedExpense = 0;
    let widgetActualExpense = 0;

    comparison.comparisons.forEach(comp => {
      // Skip child categories to avoid double-counting
      if (childCategoryIds.has(comp.categoryId)) {
        return;
      }

      const category = categories.find(c => c.id === comp.categoryId);
      const typedComp = comp as BudgetComparisonType;
      const isIncome = typedComp.isIncomeCategory ||
        (category && category.id.startsWith('INCOME'));

      if (isIncome) {
        widgetBudgetedIncome += comp.budgeted;
        widgetActualIncome += comp.actual;
      } else {
        widgetBudgetedExpense += comp.budgeted;
        widgetActualExpense += comp.actual;
      }
    });

    // Calculate totals by summing ALL comparisons (no filtering)
    let allBudgetedIncome = 0;
    let allActualIncome = 0;
    let allBudgetedExpense = 0;
    let allActualExpense = 0;

    comparison.comparisons.forEach(comp => {
      const category = categories.find(c => c.id === comp.categoryId);
      const typedComp = comp as BudgetComparisonType;
      const isIncome = typedComp.isIncomeCategory ||
        (category && category.id.startsWith('INCOME'));

      if (isIncome) {
        allBudgetedIncome += comp.budgeted;
        allActualIncome += comp.actual;
      } else {
        allBudgetedExpense += comp.budgeted;
        allActualExpense += comp.actual;
      }
    });

    // Calculate totals by summing only PARENT/STANDALONE categories
    let parentOnlyBudgetedIncome = 0;
    let parentOnlyActualIncome = 0;
    let parentOnlyBudgetedExpense = 0;
    let parentOnlyActualExpense = 0;

    comparison.comparisons.forEach(comp => {
      const category = categories.find(c => c.id === comp.categoryId);
      // Only include if it's not a child category
      if (!category?.parentId) {
        const typedComp = comp as BudgetComparisonType;
        const isIncome = typedComp.isIncomeCategory ||
          (category && category.id.startsWith('INCOME'));

        if (isIncome) {
          parentOnlyBudgetedIncome += comp.budgeted;
          parentOnlyActualIncome += comp.actual;
        } else {
          parentOnlyBudgetedExpense += comp.budgeted;
          parentOnlyActualExpense += comp.actual;
        }
      }
    });

    return {
      comparisonAnalysis,
      categoryHierarchy: {
        totalCategories: categories.length,
        parentCategories: parentCategoryIds.size,
        childCategories: childCategoryIds.size,
        totalComparisons: comparison.comparisons.length
      },
      calculations: {
        widgetTotals: {
          income: { budgeted: widgetBudgetedIncome, actual: widgetActualIncome },
          expense: { budgeted: widgetBudgetedExpense, actual: widgetActualExpense },
          total: {
            budgeted: widgetBudgetedIncome + widgetBudgetedExpense,
            actual: widgetActualIncome + widgetActualExpense
          }
        },
        allInclusiveTotals: {
          income: { budgeted: allBudgetedIncome, actual: allActualIncome },
          expense: { budgeted: allBudgetedExpense, actual: allActualExpense },
          total: {
            budgeted: allBudgetedIncome + allBudgetedExpense,
            actual: allActualIncome + allActualExpense
          }
        },
        parentOnlyTotals: {
          income: { budgeted: parentOnlyBudgetedIncome, actual: parentOnlyActualIncome },
          expense: { budgeted: parentOnlyBudgetedExpense, actual: parentOnlyActualExpense },
          total: {
            budgeted: parentOnlyBudgetedIncome + parentOnlyBudgetedExpense,
            actual: parentOnlyActualIncome + parentOnlyActualExpense
          }
        },
        backendTotals: comparison.totals
      }
    };
  }, [comparison, categories]);

  // Log data to console for copying
  console.log('🔍 BUDGET DEBUG DATA:', {
    rawComparison: comparison,
    categories: categories,
    debugAnalysis: debugData
  });

  return (
    <Paper p="lg" withBorder style={{ backgroundColor: '#fff3cd', borderColor: '#ffeaa7' }}>
      <Stack gap="md">
        <Group>
          <Title order={4} c="orange">🔍 Budget Calculation Debugger</Title>
          <Badge color="orange" variant="light">Debug Mode</Badge>
        </Group>

        <Text size="sm" c="dimmed">
          This component analyzes budget calculations and logs detailed data to console.
          Check browser dev tools console for full data export.
        </Text>

        <Divider />

        {/* Category Hierarchy Analysis */}
        <Stack gap="xs">
          <Title order={5}>Category Hierarchy</Title>
          <Group>
            <Text size="sm">Total Categories: <strong>{debugData.categoryHierarchy.totalCategories}</strong></Text>
            <Text size="sm">Parents: <strong>{debugData.categoryHierarchy.parentCategories}</strong></Text>
            <Text size="sm">Children: <strong>{debugData.categoryHierarchy.childCategories}</strong></Text>
            <Text size="sm">Comparisons: <strong>{debugData.categoryHierarchy.totalComparisons}</strong></Text>
          </Group>
        </Stack>

        <Divider />

        {/* Calculation Comparison */}
        <Stack gap="xs">
          <Title order={5}>Calculation Methods Comparison</Title>

          <Group grow>
            <Paper p="sm" withBorder>
              <Title order={6} c="blue">Widget Totals (Current Fix)</Title>
              <Text size="sm">Income: {formatCurrency(debugData.calculations.widgetTotals.income.budgeted)} / {formatCurrency(debugData.calculations.widgetTotals.income.actual)}</Text>
              <Text size="sm">Expense: {formatCurrency(debugData.calculations.widgetTotals.expense.budgeted)} / {formatCurrency(debugData.calculations.widgetTotals.expense.actual)}</Text>
              <Text size="sm" fw={600}>Total: {formatCurrency(debugData.calculations.widgetTotals.total.budgeted)} / {formatCurrency(debugData.calculations.widgetTotals.total.actual)}</Text>
            </Paper>

            <Paper p="sm" withBorder>
              <Title order={6} c="green">All Categories</Title>
              <Text size="sm">Income: {formatCurrency(debugData.calculations.allInclusiveTotals.income.budgeted)} / {formatCurrency(debugData.calculations.allInclusiveTotals.income.actual)}</Text>
              <Text size="sm">Expense: {formatCurrency(debugData.calculations.allInclusiveTotals.expense.budgeted)} / {formatCurrency(debugData.calculations.allInclusiveTotals.expense.actual)}</Text>
              <Text size="sm" fw={600}>Total: {formatCurrency(debugData.calculations.allInclusiveTotals.total.budgeted)} / {formatCurrency(debugData.calculations.allInclusiveTotals.total.actual)}</Text>
            </Paper>

            <Paper p="sm" withBorder>
              <Title order={6} c="purple">Parent/Standalone Only</Title>
              <Text size="sm">Income: {formatCurrency(debugData.calculations.parentOnlyTotals.income.budgeted)} / {formatCurrency(debugData.calculations.parentOnlyTotals.income.actual)}</Text>
              <Text size="sm">Expense: {formatCurrency(debugData.calculations.parentOnlyTotals.expense.budgeted)} / {formatCurrency(debugData.calculations.parentOnlyTotals.expense.actual)}</Text>
              <Text size="sm" fw={600}>Total: {formatCurrency(debugData.calculations.parentOnlyTotals.total.budgeted)} / {formatCurrency(debugData.calculations.parentOnlyTotals.total.actual)}</Text>
            </Paper>

            <Paper p="sm" withBorder>
              <Title order={6} c="red">Backend Totals</Title>
              <Text size="sm">Budget: {formatCurrency(debugData.calculations.backendTotals.budgeted)}</Text>
              <Text size="sm">Actual: {formatCurrency(debugData.calculations.backendTotals.actual)}</Text>
              <Text size="sm">Remaining: {formatCurrency(debugData.calculations.backendTotals.remaining)}</Text>
              <Text size="sm">Percent: {debugData.calculations.backendTotals.percentUsed}%</Text>
            </Paper>
          </Group>
        </Stack>

        <Divider />

        {/* Category Breakdown */}
        <Stack gap="xs">
          <Title order={5}>Category Analysis</Title>
          <Stack gap={4}>
            {debugData.comparisonAnalysis.map((comp) => (
              <Group key={comp.categoryId} gap="xs">
                <Badge
                  size="xs"
                  color={comp.isParent ? 'blue' : comp.isChild ? 'orange' : 'gray'}
                  variant="light"
                >
                  {comp.isParent ? 'Parent' : comp.isChild ? 'Child' : 'Standalone'}
                </Badge>
                <Badge
                  size="xs"
                  color={comp.isIncomeCategory ? 'green' : 'red'}
                  variant="light"
                >
                  {comp.isIncomeCategory ? 'Income' : 'Expense'}
                </Badge>
                {comp.isHiddenCategory && (
                  <Badge size="xs" color="gray" variant="filled">Hidden</Badge>
                )}
                <Text size="sm" style={{ minWidth: '200px' }}>
                  {comp.category?.name || comp.categoryId}
                  {comp.parentName && (
                    <Text component="span" size="xs" c="dimmed"> (under {comp.parentName})</Text>
                  )}
                </Text>
                <Text size="sm" style={{ minWidth: '100px' }}>
                  {formatCurrency(comp.budgeted)} / {formatCurrency(comp.actual)}
                </Text>
              </Group>
            ))}
          </Stack>
        </Stack>

        <Divider />

        <Text size="xs" c="dimmed">
          💡 Check browser console for full data export. Copy the logged object to share with debugging.
        </Text>
      </Stack>
    </Paper>
  );
}