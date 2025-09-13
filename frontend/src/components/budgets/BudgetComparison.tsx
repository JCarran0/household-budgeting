import { useMemo, useState } from 'react';
import {
  Table,
  Text,
  Progress,
  Badge,
  Group,
  Stack,
  Paper,
  Title,
  Tooltip,
  Button,
  Box,
} from '@mantine/core';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconAlertCircle,
  IconDownload,
  IconBug,
  IconBugOff,
} from '@tabler/icons-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import type { BudgetComparisonResponse } from '../../lib/api';
import type { Category, BudgetComparison as BudgetComparisonType } from '../../../../shared/types';
import { TransactionPreviewTrigger } from '../transactions/TransactionPreviewTrigger';
import { formatCurrency } from '../../utils/formatters';
import {
  isIncomeCategoryHierarchical,
  isTransferCategory,
  createCategoryLookup
} from '../../../../shared/utils/categoryHelpers';
import { BudgetDebugger } from './BudgetDebugger';

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
  // Using shared formatCurrency utility from utils/formatters
  const [showDebugger, setShowDebugger] = useState(false);
  
  // Calculate income and expense totals for cashflow
  const { incomeTotal, expenseTotal, budgetedCashflow, actualCashflow } = useMemo(() => {
    let budgetedIncome = 0;
    let actualIncome = 0;
    let budgetedExpense = 0;
    let actualExpense = 0;

    // Create category lookup for hierarchical income detection
    const categoryLookup = createCategoryLookup(categories);

    // Build a set of child category IDs to exclude from totals
    const childCategoryIds = new Set<string>();
    categories.forEach(category => {
      if (category.parentId) {
        childCategoryIds.add(category.id);
      }
    });

    comparison.comparisons.forEach(comp => {
      // Skip child categories to avoid double-counting
      // (parent totals already include children in the backend)
      if (childCategoryIds.has(comp.categoryId)) {
        return;
      }

      const typedComp = comp as BudgetComparisonType;
      // Use hierarchical income detection to properly classify income categories
      const isIncome = typedComp.isIncomeCategory ||
        isIncomeCategoryHierarchical(comp.categoryId, categoryLookup);

      if (isIncome) {
        budgetedIncome += comp.budgeted;
        actualIncome += comp.actual;
      } else {
        budgetedExpense += comp.budgeted;
        actualExpense += comp.actual;
      }
    });

    return {
      incomeTotal: { budgeted: budgetedIncome, actual: actualIncome },
      expenseTotal: { budgeted: budgetedExpense, actual: actualExpense },
      budgetedCashflow: budgetedIncome - budgetedExpense,
      actualCashflow: actualIncome - actualExpense,
    };
  }, [comparison, categories]);

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

  const exportToTSV = (): void => {
    // Create category lookup for efficient hierarchical checks
    const categoryLookup = createCategoryLookup(categories);
    
    // Helper function to escape TSV values
    const escapeTSV = (value: string | null | undefined): string => {
      if (value == null) return '';
      const str = String(value);
      // Replace tabs and newlines with spaces for TSV format
      return str.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '');
    };
    
    const headers = ['Category', 'Type', 'Category Hidden', 'Category Rollover', 'Budgeted', 'Actual', 'Remaining', 'Percent Used', 'Status'];
    const rows = comparison.comparisons.map(comp => {
      // Find the category for property lookups
      const category = categories.find(c => c.id === comp.categoryId);
      
      // Determine category type - use existing isIncomeCategory from comparison if available, otherwise calculate
      const typedComp = comp as BudgetComparisonType;
      const categoryType = typedComp.isIncomeCategory || isIncomeCategoryHierarchical(comp.categoryId, categoryLookup) ? 'Income' :
        isTransferCategory(comp.categoryId) ? 'Transfer' : 'Expense';
      
      // Get category properties
      const categoryHidden = category?.isHidden ? 'Yes' : 'No';
      const categoryRollover = category?.isRollover ? 'Yes' : 'No';
      
      return [
        escapeTSV(getCategoryName(comp.categoryId)),
        escapeTSV(categoryType),
        escapeTSV(categoryHidden),
        escapeTSV(categoryRollover),
        escapeTSV(comp.budgeted.toFixed(2)),
        escapeTSV(comp.actual.toFixed(2)),
        escapeTSV(comp.remaining.toFixed(2)),
        escapeTSV(`${comp.percentUsed}%`),
        escapeTSV(comp.isOverBudget ? 'Over Budget' : 'On Track')
      ].join('\t');
    });

    const tsvContent = [
      headers.join('\t'),
      ...rows
    ].join('\n');

    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-comparison-${comparison.month}.tsv`;
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
      
      // Determine if this is an income category based on children or existing parent
      const isIncomeCategory = existingParent?.isIncomeCategory || 
        (children.length > 0 && children[0].isIncomeCategory) || false;
      
      // Calculate budgeted amount based on category type
      let budgeted: number;
      if (isIncomeCategory) {
        // Income: additive approach - parent budget adds to children
        budgeted = existingParent
          ? childBudgetSum + existingParent.budgeted
          : childBudgetSum;
      } else {
        // Expense: additive approach - parent budget adds to children
        budgeted = existingParent
          ? childBudgetSum + existingParent.budgeted
          : childBudgetSum;
      }
      
      // Actual is always additive for both income and expense
      const actual = existingParent 
        ? childActualSum + existingParent.actual
        : childActualSum;
      
      // Calculate remaining and over budget based on category type
      let remaining: number;
      let isOverBudget: boolean;
      
      if (isIncomeCategory) {
        // Income: positive remaining = exceeding target (good)
        remaining = actual - budgeted;
        isOverBudget = actual < budgeted; // Under target is "over budget" for income
      } else {
        // Expense: positive remaining = under budget (good)
        remaining = budgeted - actual;
        isOverBudget = actual > budgeted;
      }
      
      const percentUsed = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;
      
      return {
        categoryId: parentId,
        budgeted,
        actual,
        remaining,
        percentUsed,
        isOverBudget,
        budgetType: isIncomeCategory ? 'income' : 'expense',
        isIncomeCategory,
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
          <Group>
            <Button
              variant="light"
              size="sm"
              leftSection={showDebugger ? <IconBugOff size={16} /> : <IconBug size={16} />}
              onClick={() => setShowDebugger(!showDebugger)}
              color={showDebugger ? "orange" : "gray"}
            >
              {showDebugger ? "Hide Debug" : "Debug"}
            </Button>
            <Button
              variant="light"
              size="sm"
              leftSection={<IconDownload size={16} />}
              onClick={exportToTSV}
            >
              Export TSV
            </Button>
          </Group>
        </Group>
        
        <Group grow>
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Budgeted Cashflow</Text>
            <Text 
              size="xl" 
              fw={600}
              c={budgetedCashflow < 0 ? 'red' : 'green'}
            >
              {budgetedCashflow < 0 ? '-' : '+'}
              {formatCurrency(budgetedCashflow)}
            </Text>
          </Stack>
          
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Actual Cashflow</Text>
            <Text 
              size="xl" 
              fw={600}
              c={actualCashflow < 0 ? 'red' : 'green'}
            >
              {actualCashflow < 0 ? '-' : '+'}
              {formatCurrency(actualCashflow)}
            </Text>
          </Stack>
          
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Income vs Budget</Text>
            <Text 
              size="xl" 
              fw={600}
              c={incomeTotal.budgeted === 0 ? 'dimmed' : 
                incomeTotal.actual < incomeTotal.budgeted ? 'orange' : 'green'}
            >
              {incomeTotal.budgeted === 0 ? 'N/A' : 
                `${Math.round((incomeTotal.actual / incomeTotal.budgeted) * 100)}%`}
            </Text>
          </Stack>
          
          <Stack gap="xs">
            <Text size="sm" c="dimmed">Spending vs Budget</Text>
            <Text 
              size="xl" 
              fw={600}
              c={expenseTotal.budgeted === 0 ? 'dimmed' : 
                expenseTotal.actual > expenseTotal.budgeted ? 'red' : 'green'}
            >
              {expenseTotal.budgeted === 0 ? 'N/A' : 
                `${Math.round((expenseTotal.actual / expenseTotal.budgeted) * 100)}%`}
            </Text>
          </Stack>
        </Group>
        
        <Progress
          value={Math.min(comparison.totals.percentUsed, 100)}
          color={getProgressColor(comparison.totals.percentUsed, false)} // Totals use expense logic for now
          size="lg"
          mt="md"
        />
      </Paper>

      {/* Debug component to analyze calculation differences */}
      {showDebugger && (
        <BudgetDebugger comparison={comparison} categories={categories} />
      )}

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
                  <Text>{formatCurrency(comp.budgeted)}</Text>
                </Table.Td>
                
                <Table.Td>
                  <Text fw={500}>{formatCurrency(comp.actual)}</Text>
                </Table.Td>
                
                <Table.Td>
                  <Text 
                    fw={500}
                    c={comp.isIncomeCategory 
                      ? (comp.remaining >= 0 ? 'green' : 'red')  // Income: positive = good, negative = bad
                      : (comp.remaining >= 0 ? 'green' : 'red')  // Expense: positive = good, negative = bad
                    }
                  >
                    {comp.remaining < 0 ? '-' : '+'}
                    {formatCurrency(comp.remaining)}
                  </Text>
                </Table.Td>
                
                <Table.Td>
                  <Stack gap={4}>
                    <Progress
                      value={Math.min(comp.percentUsed, 100)}
                      color={progressColor}
                      size="sm"
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
                    comp.percentUsed > 102 ? (
                      <Tooltip label={`${comp.percentUsed - 100}% over budget`}>
                        <Badge
                          color="red"
                          variant="light"
                          leftSection={<IconTrendingUp size={12} />}
                        >
                          Over Budget
                        </Badge>
                      </Tooltip>
                    ) : comp.percentUsed > 100 ? (
                      <Tooltip label={`${comp.percentUsed - 100}% over budget (within 2% tolerance)`}>
                        <Badge
                          color="yellow"
                          variant="light"
                          leftSection={<IconAlertCircle size={12} />}
                        >
                          Warning
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