import { useMemo } from 'react';
import {
  Table,
  Text,
  Progress,
  Badge,
  Group,
  Stack,
  Paper,
  Title,
  ThemeIcon,
  Tooltip,
  Button,
  Box,
} from '@mantine/core';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconAlertCircle,
  IconDownload,
  IconCheck,
} from '@tabler/icons-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import type { BudgetComparisonResponse } from '../../lib/api';
import type { Category, BudgetComparison as BudgetComparisonType } from '../../../../shared/types';
import { TransactionPreviewTrigger } from '../transactions/TransactionPreviewTrigger';

interface BudgetComparisonProps {
  comparison: BudgetComparisonResponse;
  categories: Category[];
}

interface HierarchicalComparison {
  categoryId: string;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  isOverBudget: boolean;
  budgetType?: 'income' | 'expense';
  isIncomeCategory?: boolean;
  isParent?: boolean;
  isChild?: boolean;
  parentId?: string | null;
  isCalculated?: boolean;  // Flag for aggregated parents
  childrenIds?: string[];  // Track which children contributed to totals
  originalBudget?: number; // Store original parent budget before aggregation
  originalActual?: number; // Store original parent actual before aggregation
}

export function BudgetComparison({ comparison, categories }: BudgetComparisonProps) {
  const getCategoryName = (categoryId: string): string => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return 'Unknown Category';
    
    if (category.parentId) {
      const parent = categories.find(c => c.id === category.parentId);
      return parent ? `${parent.name} → ${category.name}` : category.name;
    }
    
    return category.name;
  };

  const getProgressColor = (percentUsed: number, isIncomeCategory: boolean = false): string => {
    if (isIncomeCategory) {
      // For income: higher percentage is better (inverse logic)
      if (percentUsed >= 100) return 'green'; // Meeting or exceeding target
      if (percentUsed >= 80) return 'yellow'; // Close to target
      if (percentUsed >= 50) return 'orange'; // Concerning shortfall
      return 'red'; // Significant shortfall
    } else {
      // For expenses: lower percentage is better (normal logic)
      if (percentUsed <= 50) return 'green';
      if (percentUsed <= 80) return 'yellow';
      if (percentUsed <= 100) return 'orange';
      return 'red';
    }
  };

  const exportToCSV = (): void => {
    const headers = ['Category', 'Budgeted', 'Actual', 'Remaining', 'Percent Used', 'Status'];
    const rows = comparison.comparisons.map(comp => [
      getCategoryName(comp.categoryId),
      comp.budgeted.toFixed(2),
      comp.actual.toFixed(2),
      comp.remaining.toFixed(2),
      `${comp.percentUsed}%`,
      comp.isOverBudget ? 'Over Budget' : 'On Track'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-comparison-${comparison.month}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Calculate date range for the budget month
  const dateRange = useMemo(() => {
    const [year, month] = comparison.month.split('-').map(Number);
    const monthDate = new Date(year, month - 1, 1);
    return {
      startDate: format(startOfMonth(monthDate), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(monthDate), 'yyyy-MM-dd'),
    };
  }, [comparison.month]);

  // Sort comparisons by variance (most over budget first)
  const sortedComparisons = [...comparison.comparisons].sort((a, b) => {
    if (a.isOverBudget && !b.isOverBudget) return -1;
    if (!a.isOverBudget && b.isOverBudget) return 1;
    return a.remaining - b.remaining;
  });

  // Enhanced hierarchical organization with smart parent aggregation
  const hierarchicalComparisons = useMemo(() => {
    // Helper function to calculate enhanced parent totals
    const calculateParentTotals = (
      parentId: string, 
      children: HierarchicalComparison[], 
      existingParent?: HierarchicalComparison
    ): HierarchicalComparison => {
      const childBudgetSum = children.reduce((sum, child) => sum + child.budgeted, 0);
      const childActualSum = children.reduce((sum, child) => sum + child.actual, 0);
      
      const budgeted = existingParent 
        ? Math.max(childBudgetSum, existingParent.budgeted)
        : childBudgetSum;
      
      const actual = existingParent 
        ? childActualSum + existingParent.actual
        : childActualSum;
      
      const remaining = budgeted - actual;
      const percentUsed = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;
      
      return {
        categoryId: parentId,
        budgeted,
        actual,
        remaining,
        percentUsed,
        isOverBudget: actual > budgeted,
        isParent: true,
        isCalculated: !existingParent || (childBudgetSum > 0), // Flag if this includes child data
        childrenIds: children.map(c => c.categoryId),
        originalBudget: existingParent?.budgeted,
        originalActual: existingParent?.actual,
        parentId: null,
      };
    };

    // Build category hierarchy maps
    const parentCategoryIds = new Set<string>();
    const childrenByParent = new Map<string, HierarchicalComparison[]>();
    const existingParentComparisons = new Map<string, HierarchicalComparison>();
    
    // First pass: identify all parents and group children
    categories.forEach(category => {
      if (category.parentId) {
        parentCategoryIds.add(category.parentId);
      }
    });
    
    // Second pass: separate comparisons into parents and children
    const childComparisons: HierarchicalComparison[] = [];
    sortedComparisons.forEach(comp => {
      const category = categories.find(c => c.id === comp.categoryId);
      const compWithHierarchy: HierarchicalComparison = {
        ...comp,
        parentId: category?.parentId || null,
        budgetType: (comp as BudgetComparisonType).budgetType || 'expense',
        isIncomeCategory: (comp as BudgetComparisonType).isIncomeCategory || false,
      };
      
      if (category?.parentId) {
        // It's a child category
        if (!childrenByParent.has(category.parentId)) {
          childrenByParent.set(category.parentId, []);
        }
        childrenByParent.get(category.parentId)!.push({
          ...compWithHierarchy,
          isChild: true,
        });
        childComparisons.push(compWithHierarchy);
      } else if (parentCategoryIds.has(comp.categoryId)) {
        // It's a parent category that has children
        existingParentComparisons.set(comp.categoryId, {
          ...compWithHierarchy,
          isParent: true,
        });
      } else {
        // It's a standalone category (no parent, no children)
        existingParentComparisons.set(comp.categoryId, {
          ...compWithHierarchy,
          isParent: false,
          isChild: false,
        });
      }
    });
    
    // Third pass: calculate enhanced parent totals and build final hierarchy
    const finalResult: HierarchicalComparison[] = [];
    const processedParents = new Set<string>();
    
    // Process all parent categories (both existing and missing)
    parentCategoryIds.forEach(parentId => {
      const children = childrenByParent.get(parentId) || [];
      if (children.length === 0) return; // Skip parents with no children in budget data
      
      const existingParent = existingParentComparisons.get(parentId);
      const enhancedParent = calculateParentTotals(parentId, children, existingParent);
      
      finalResult.push(enhancedParent);
      processedParents.add(parentId);
      
      // Sort children by variance within each parent group
      children.sort((a, b) => {
        if (a.isOverBudget && !b.isOverBudget) return -1;
        if (!a.isOverBudget && b.isOverBudget) return 1;
        return a.remaining - b.remaining;
      });
      
      // Add all children immediately after their parent
      finalResult.push(...children);
    });
    
    // Add standalone categories (no parent, no children)
    existingParentComparisons.forEach((comp, categoryId) => {
      if (!processedParents.has(categoryId) && !childComparisons.some(c => c.categoryId === categoryId)) {
        finalResult.push(comp);
      }
    });
    
    return finalResult;
  }, [sortedComparisons, categories]);

  return (
    <Stack gap="lg">
      <Paper p="md" withBorder>
        <Group justify="space-between" mb="md">
          <Title order={4}>Budget Performance Summary</Title>
          <Button
            variant="light"
            size="sm"
            leftSection={<IconDownload size={16} />}
            onClick={exportToCSV}
          >
            Export CSV
          </Button>
        </Group>
        
        <Group grow>
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Total Budgeted</Text>
            <Text size="xl" fw={600}>
              ${comparison.totals.budgeted.toFixed(2)}
            </Text>
          </Stack>
          
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Total Spent</Text>
            <Text 
              size="xl" 
              fw={600}
              c={comparison.totals.isOverBudget ? 'red' : undefined}
            >
              ${comparison.totals.actual.toFixed(2)}
            </Text>
          </Stack>
          
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Remaining</Text>
            <Text 
              size="xl" 
              fw={600}
              c={comparison.totals.remaining < 0 ? 'red' : 'green'}
            >
              {comparison.totals.remaining < 0 ? '-' : ''}
              ${Math.abs(comparison.totals.remaining).toFixed(2)}
            </Text>
          </Stack>
          
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Overall Usage</Text>
            <Group gap="xs">
              <Text size="xl" fw={600}>
                {comparison.totals.percentUsed}%
              </Text>
              {comparison.totals.isOverBudget ? (
                <ThemeIcon color="red" size="sm">
                  <IconAlertCircle size={16} />
                </ThemeIcon>
              ) : (
                <ThemeIcon color="green" size="sm">
                  <IconCheck size={16} />
                </ThemeIcon>
              )}
            </Group>
          </Stack>
        </Group>
        
        <Progress
          value={Math.min(comparison.totals.percentUsed, 100)}
          color={getProgressColor(comparison.totals.percentUsed, false)} // Totals use expense logic for now
          size="lg"
          mt="md"
          striped={comparison.totals.isOverBudget}
          animated={comparison.totals.isOverBudget}
        />
      </Paper>

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Category</Table.Th>
            <Table.Th>Budgeted</Table.Th>
            <Table.Th>Actual</Table.Th>
            <Table.Th>Remaining</Table.Th>
            <Table.Th>Progress</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {hierarchicalComparisons.map((comp) => {
            const category = categories.find(c => c.id === comp.categoryId);
            const categoryName = category ? (
              comp.isChild && category.parentId ? category.name : getCategoryName(comp.categoryId)
            ) : 'Unknown Category';
            const progressColor = getProgressColor(comp.percentUsed, comp.isIncomeCategory);
            
            // Enhanced category name with budget type indicator
            const budgetTypeIcon = comp.isIncomeCategory ? '💰 ' : '💳 ';
            const displayName = budgetTypeIcon + categoryName;
            
            const tooltipText = comp.isCalculated && comp.isParent
              ? "Aggregated total from subcategories - click to view all related transactions"
              : "Click to view transactions";
            
            return (
              <Table.Tr key={comp.categoryId}>
                <Table.Td>
                  <Box pl={comp.isChild ? 24 : 0}>
                    <TransactionPreviewTrigger
                      categoryId={comp.categoryId}
                      categoryName={getCategoryName(comp.categoryId)}
                      dateRange={dateRange}
                      showTooltip={true}
                      tooltipText={tooltipText}
                    >
                      <Text 
                        fw={comp.isParent ? 600 : 500}
                        size={comp.isChild ? 'sm' : 'md'}
                        style={{ 
                          cursor: 'pointer',
                          textDecoration: 'none',
                          transition: 'all 0.2s ease',
                          fontStyle: comp.isCalculated ? 'italic' : 'normal',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = 'underline';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = 'none';
                        }}
                      >
                        {displayName}
                      </Text>
                    </TransactionPreviewTrigger>
                  </Box>
                </Table.Td>
                
                <Table.Td>
                  <Text>${comp.budgeted.toFixed(2)}</Text>
                </Table.Td>
                
                <Table.Td>
                  <Text fw={500}>${comp.actual.toFixed(2)}</Text>
                </Table.Td>
                
                <Table.Td>
                  <Text 
                    fw={500}
                    c={comp.remaining < 0 ? 'red' : 'green'}
                  >
                    {comp.remaining < 0 ? '-' : ''}
                    ${Math.abs(comp.remaining).toFixed(2)}
                  </Text>
                </Table.Td>
                
                <Table.Td>
                  <Stack gap={4}>
                    <Progress
                      value={Math.min(comp.percentUsed, 100)}
                      color={progressColor}
                      size="sm"
                      striped={comp.isOverBudget}
                    />
                    <Text size="xs" c="dimmed" ta="center">
                      {comp.percentUsed}%
                    </Text>
                  </Stack>
                </Table.Td>
                
                <Table.Td>
                  {comp.isIncomeCategory ? (
                    // Income category logic: over budget = good, under budget = bad
                    comp.isOverBudget ? (
                      <Tooltip label={`${100 - comp.percentUsed}% below income target`}>
                        <Badge
                          color="red"
                          variant="light"
                          leftSection={<IconTrendingDown size={12} />}
                        >
                          Below Target
                        </Badge>
                      </Tooltip>
                    ) : comp.percentUsed < 80 ? (
                      <Tooltip label={`Only ${comp.percentUsed}% of income target reached`}>
                        <Badge
                          color="yellow"
                          variant="light"
                          leftSection={<IconAlertCircle size={12} />}
                        >
                          Needs Attention
                        </Badge>
                      </Tooltip>
                    ) : (
                      <Tooltip label={`${comp.percentUsed}% of income target reached`}>
                        <Badge
                          color="green"
                          variant="light"
                          leftSection={<IconTrendingUp size={12} />}
                        >
                          On Target
                        </Badge>
                      </Tooltip>
                    )
                  ) : (
                    // Expense category logic: normal budget logic
                    comp.isOverBudget ? (
                      <Tooltip label={`${comp.percentUsed - 100}% over budget`}>
                        <Badge
                          color="red"
                          variant="light"
                          leftSection={<IconTrendingUp size={12} />}
                        >
                          Over Budget
                        </Badge>
                      </Tooltip>
                    ) : comp.percentUsed > 80 ? (
                      <Tooltip label="Approaching budget limit">
                      <Badge
                        color="yellow"
                        variant="light"
                        leftSection={<IconAlertCircle size={12} />}
                      >
                        Warning
                      </Badge>
                    </Tooltip>
                    ) : (
                      <Tooltip label={`${100 - comp.percentUsed}% remaining`}>
                        <Badge
                          color="green"
                          variant="light"
                          leftSection={<IconTrendingDown size={12} />}
                        >
                          On Track
                        </Badge>
                      </Tooltip>
                    )
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}