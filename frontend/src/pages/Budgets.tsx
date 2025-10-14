import { useState, useMemo, useEffect, useCallback } from 'react';
import { useBudgetFilters } from '../hooks/usePersistedFilters';
import {
  Container,
  Title,
  Paper,
  Group,
  Button,
  Stack,
  Loader,
  Center,
  Alert,
  Text,
  ThemeIcon,
  ActionIcon,
  Tooltip,
  Tabs,
  Menu,
  ScrollArea,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import {
  IconPlus,
  IconCopy,
  IconChartBar,
  IconAlertCircle,
  IconCurrencyDollar,
  IconChevronLeft,
  IconChevronRight,
  IconRefresh,
  IconFilterOff,
  IconChevronDown,
  IconCalendar,
} from '@tabler/icons-react';
import { format, addMonths, subMonths, startOfMonth, parseISO } from 'date-fns';
import { api } from '../lib/api';
import { BudgetGrid } from '../components/budgets/BudgetGrid';
import { BudgetForm } from '../components/budgets/BudgetForm';
import { BudgetComparison } from '../components/budgets/BudgetComparison';
import { BudgetSummaryCards } from '../components/budgets/BudgetSummaryCards';
import { YearlyBudgetGrid } from '../components/budgets/YearlyBudgetGrid';
// Error boundaries available for use when needed
// import { FinancialErrorBoundary, FormErrorBoundary, AsyncErrorBoundary } from '../components/ErrorBoundary';
import type { MonthlyBudget } from '../../../shared/types';
import {
  isBudgetableCategory
} from '../../../shared/utils/categoryHelpers';
import {
  getHiddenCategoryIds,
  calculateBudgetTotals,
  calculateActualTotals
} from '../../../shared/utils/budgetCalculations';

export function Budgets() {
  // Use persisted filters from localStorage
  const {
    selectedDate: storedDate,
    activeTab,
    setSelectedDate: setStoredDate,
    setActiveTab,
    resetFilters: resetStoredFilters,
  } = useBudgetFilters();
  
  // Use local state that syncs with store
  const [selectedDate, setSelectedDate] = useState<Date>(storedDate);
  
  // Sync local state with store when store changes
  useEffect(() => {
    setSelectedDate(storedDate);
  }, [storedDate]);
  
  // Update both local state and store when date changes
  const handleDateChange = useCallback((date: Date | string) => {
    let dateObj: Date;
    if (typeof date === 'string') {
      // Parse the date string properly to avoid timezone issues
      // MonthPickerInput returns 'YYYY-MM-DD' format
      const [year, month, day] = date.split('-').map(Number);
      // Create date using local timezone (month is 0-indexed in JS Date)
      dateObj = new Date(year, month - 1, day || 1);
    } else {
      dateObj = date;
    }
    
    setSelectedDate(dateObj);
    setStoredDate(dateObj);
  }, [setStoredDate]);
  
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingBudget, setEditingBudget] = useState<MonthlyBudget | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const queryClient = useQueryClient();

  const selectedMonth = format(selectedDate, 'yyyy-MM');
  const displayMonth = format(selectedDate, 'MMMM yyyy');

  // Fetch monthly budgets
  const { data: budgetData, isLoading: budgetsLoading, refetch: refetchBudgets } = useQuery({
    queryKey: ['budgets', 'month', selectedMonth],
    queryFn: () => api.getMonthlyBudgets(selectedMonth),
  });

  // Fetch categories for budget creation
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const result = await api.getCategories();
      return result;
    },
  });

  // Fetch transactions for the month to calculate actuals (always enabled for unified summary)
  const { data: transactionData } = useQuery({
    queryKey: ['transactions', selectedMonth],
    queryFn: () => api.getTransactions({
      startDate: format(selectedDate, 'yyyy-MM-01'),
      endDate: format(addMonths(startOfMonth(selectedDate), 1).getTime() - 1, 'yyyy-MM-dd'),
    }),
  });

  // Calculate actuals from transactions using shared utilities
  const actuals = useMemo<Record<string, number>>(() => {
    if (!transactionData?.transactions || !categories) return {};

    // Filter transactions to only budgetable ones (excludes transfers) with hidden categories excluded
    const filteredTransactions = transactionData.transactions.filter(transaction => {
      // Exclude hidden transactions
      if (transaction.isHidden || !transaction.categoryId) {
        return false;
      }

      // Include budgetable transactions (excludes transfers)
      return isBudgetableCategory(transaction.categoryId, categories);
    });

    // Use shared utility to get hidden category IDs
    const hiddenCategoryIds = getHiddenCategoryIds(categories);

    const actualsByCategory: Record<string, number> = {};
    filteredTransactions.forEach(transaction => {
      // Exclude transactions in hidden categories
      if (transaction.categoryId && !hiddenCategoryIds.has(transaction.categoryId)) {
        const amount = Math.abs(transaction.amount);
        actualsByCategory[transaction.categoryId] =
          (actualsByCategory[transaction.categoryId] || 0) + amount;
      }
    });

    return actualsByCategory;
  }, [transactionData, categories]);

  // Fetch budget comparison
  const { data: comparisonData, isLoading: comparisonLoading } = useQuery({
    queryKey: ['budgets', 'comparison', selectedMonth, actuals],
    queryFn: () => api.getBudgetComparison(selectedMonth, actuals),
    enabled: activeTab === 'comparison' && Object.keys(actuals).length > 0,
  });

  // Fetch yearly budgets
  const { data: yearlyBudgetData, isLoading: yearlyBudgetsLoading } = useQuery({
    queryKey: ['budgets', 'year', selectedYear],
    queryFn: () => api.getYearlyBudgets(selectedYear),
    enabled: activeTab === 'yearly',
  });

  // Copy budgets mutation
  const copyMutation = useMutation({
    mutationFn: ({ fromMonth, toMonth }: { fromMonth: string; toMonth: string }) =>
      api.copyBudgets(fromMonth, toMonth),
    onSuccess: (data) => {
      notifications.show({
        title: 'Budgets Copied',
        message: data.message,
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'month', selectedMonth] });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to copy budgets',
        color: 'red',
      });
    },
  });

  const handlePreviousMonth = (): void => {
    handleDateChange(subMonths(selectedDate, 1));
  };

  const handleNextMonth = (): void => {
    handleDateChange(addMonths(selectedDate, 1));
  };

  const handlePreviousYear = (): void => {
    setSelectedYear(selectedYear - 1);
  };

  const handleNextYear = (): void => {
    setSelectedYear(selectedYear + 1);
  };

  // Fetch available budget months
  const { data: availableMonths, isLoading: monthsLoading } = useQuery({
    queryKey: ['budgets', 'available-months'],
    queryFn: api.getAvailableBudgetMonths,
  });

  const handleCopyFromMonth = (fromMonth: string): void => {
    const fromDate = parseISO(fromMonth + '-01');
    const fromDisplayMonth = format(fromDate, 'MMMM yyyy');
    modals.openConfirmModal({
      title: 'Copy Budgets',
      children: (
        <Text size="sm">
          Copy all budgets from {fromDisplayMonth} to {displayMonth}?
        </Text>
      ),
      labels: { confirm: 'Copy', cancel: 'Cancel' },
      confirmProps: { color: 'blue' },
      onConfirm: () => copyMutation.mutate({ fromMonth, toMonth: selectedMonth }),
    });
  };

  const handleEdit = (budget: MonthlyBudget): void => {
    setEditingBudget(budget);
    setIsFormOpen(true);
  };

  const handleFormClose = (): void => {
    setIsFormOpen(false);
    setEditingBudget(null);
  };

  const handleFormSuccess = (): void => {
    handleFormClose();
    queryClient.invalidateQueries({ queryKey: ['budgets'] });
  };

  // Calculate income and expense budgets using shared utilities
  const budgetTotals = useMemo(() => {
    if (!budgetData?.budgets || !categories) {
      return { income: 0, expense: 0, transfer: 0, total: 0 };
    }

    return calculateBudgetTotals(budgetData.budgets, categories, { excludeHidden: true });
  }, [budgetData, categories]);

  const budgetedIncome = budgetTotals.income;
  const budgetedSpending = budgetTotals.expense;

  // Calculate actual income and spending using shared utilities
  const actualTotals = useMemo(() => {
    if (!transactionData?.transactions || !categories) {
      return { income: 0, expense: 0, transfer: 0, total: 0 };
    }

    return calculateActualTotals(transactionData.transactions, categories, { excludeHidden: true });
  }, [transactionData, categories]);

  const actualIncome = actualTotals.income;
  const actualSpending = actualTotals.expense;

  if (budgetsLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  const hasBudgets = budgetData && budgetData.budgets.length > 0;

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={2}>Monthly Budget</Title>
          <Group>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setIsFormOpen(true)}
            >
              Add Budget
            </Button>
          </Group>
        </Group>

        <Paper p="md" shadow="xs">
          <Group justify="space-between" mb="md">
            <Group>
              <ActionIcon onClick={handlePreviousMonth} size="lg" variant="default">
                <IconChevronLeft size={16} />
              </ActionIcon>
              
              <MonthPickerInput
                value={selectedDate}
                onChange={(date) => {
                  if (date) {
                    handleDateChange(date);
                  }
                }}
                size="md"
                styles={{ input: { width: 200, textAlign: 'center' } }}
                clearable={false}
                popoverProps={{ withinPortal: true }}
              />
              
              <ActionIcon onClick={handleNextMonth} size="lg" variant="default">
                <IconChevronRight size={16} />
              </ActionIcon>
            </Group>

            <Group>
              <Menu shadow="md" width={260} position="bottom-end">
                <Menu.Target>
                  <Button
                    variant="light"
                    leftSection={<IconCopy size={16} />}
                    rightSection={<IconChevronDown size={16} />}
                    loading={copyMutation.isPending || monthsLoading}
                  >
                    Copy from Previous
                  </Button>
                </Menu.Target>

                <Menu.Dropdown>
                  {availableMonths && availableMonths.length > 0 ? (
                    <>
                      <Menu.Label>Select a month to copy from</Menu.Label>
                      <ScrollArea h={300} type="auto">
                        {availableMonths
                          .filter(m => m.month !== selectedMonth)
                          .slice(0, 12)
                          .map((monthData, index) => {
                            const monthDate = parseISO(monthData.month + '-01');
                            const displayName = format(monthDate, 'MMMM yyyy');
                            const isRecommended = index === 0;
                            
                            return (
                              <Menu.Item
                                key={monthData.month}
                                onClick={() => handleCopyFromMonth(monthData.month)}
                                rightSection={
                                  <Text size="xs" c="dimmed">
                                    {monthData.count} {monthData.count === 1 ? 'budget' : 'budgets'}
                                  </Text>
                                }
                              >
                                <Group gap="xs">
                                  <Text size="sm">{displayName}</Text>
                                  {isRecommended && (
                                    <Text size="xs" c="blue" fw={500}>
                                      (Most Recent)
                                    </Text>
                                  )}
                                </Group>
                              </Menu.Item>
                            );
                          })}
                      </ScrollArea>
                    </>
                  ) : (
                    <Menu.Item disabled>
                      <Text size="sm" c="dimmed">No previous budgets available</Text>
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
              
              <Tooltip label="Refresh data">
                <ActionIcon onClick={() => refetchBudgets()} size="lg" variant="default">
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
              
              <Tooltip label="Reset to current month">
                <ActionIcon
                  onClick={() => {
                    const currentMonth = startOfMonth(new Date());
                    handleDateChange(currentMonth);
                    resetStoredFilters();
                    notifications.show({
                      title: 'View Reset',
                      message: 'Reset to current month view',
                      color: 'blue',
                    });
                  }}
                  size="lg"
                  variant="default"
                >
                  <IconFilterOff size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <BudgetSummaryCards
            budgetedIncome={budgetedIncome}
            actualIncome={actualIncome}
            budgetedSpending={budgetedSpending}
            actualSpending={actualSpending}
          />

          <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'budget')}>
            <Tabs.List>
              <Tabs.Tab value="budget" leftSection={<IconCurrencyDollar size={16} />}>
                Budget Setup
              </Tabs.Tab>
              <Tabs.Tab value="comparison" leftSection={<IconChartBar size={16} />}>
                Budget vs Actual
              </Tabs.Tab>
              <Tabs.Tab value="yearly" leftSection={<IconCalendar size={16} />}>
                Yearly View
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="budget" pt="md">
              {hasBudgets ? (
                <BudgetGrid
                  budgets={budgetData.budgets}
                  categories={categories || []}
                  month={selectedMonth}
                  onEdit={handleEdit}
                />
              ) : (
                <Paper p="xl" ta="center" withBorder>
                  <ThemeIcon size={60} radius="xl" variant="light" color="gray" mx="auto" mb="md">
                    <IconCurrencyDollar size={30} />
                  </ThemeIcon>
                  <Title order={3} mb="sm">No Budget Set</Title>
                  <Text c="dimmed" mb="lg">
                    Create your first budget for {displayMonth}
                  </Text>
                  <Group justify="center">
                    <Menu shadow="md" width={260} position="bottom-start">
                      <Menu.Target>
                        <Button
                          variant="light"
                          leftSection={<IconCopy size={16} />}
                          rightSection={<IconChevronDown size={16} />}
                          loading={copyMutation.isPending || monthsLoading}
                        >
                          Copy from Previous Month
                        </Button>
                      </Menu.Target>
                      
                      <Menu.Dropdown>
                        {availableMonths && availableMonths.length > 0 ? (
                          <>
                            <Menu.Label>Select a month to copy from</Menu.Label>
                            <ScrollArea h={300} type="auto">
                              {availableMonths
                                .filter(m => m.month !== selectedMonth)
                                .slice(0, 12)
                                .map((monthData, index) => {
                                  const monthDate = parseISO(monthData.month + '-01');
                                  const displayName = format(monthDate, 'MMMM yyyy');
                                  const isRecommended = index === 0;
                                  
                                  return (
                                    <Menu.Item
                                      key={monthData.month}
                                      onClick={() => handleCopyFromMonth(monthData.month)}
                                      rightSection={
                                        <Text size="xs" c="dimmed">
                                          {monthData.count} {monthData.count === 1 ? 'budget' : 'budgets'}
                                        </Text>
                                      }
                                    >
                                      <Group gap="xs">
                                        <Text size="sm">{displayName}</Text>
                                        {isRecommended && (
                                          <Text size="xs" c="blue" fw={500}>
                                            (Most Recent)
                                          </Text>
                                        )}
                                      </Group>
                                    </Menu.Item>
                                  );
                                })}
                            </ScrollArea>
                          </>
                        ) : (
                          <Menu.Item disabled>
                            <Text size="sm" c="dimmed">No previous budgets available</Text>
                          </Menu.Item>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                    <Button
                      leftSection={<IconPlus size={16} />}
                      onClick={() => setIsFormOpen(true)}
                    >
                      Create Budget
                    </Button>
                  </Group>
                </Paper>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="comparison" pt="md">
              {comparisonLoading ? (
                <Center h={200}>
                  <Loader />
                </Center>
              ) : comparisonData ? (
                <BudgetComparison
                  comparison={comparisonData}
                  categories={categories || []}
                  budgetedIncome={budgetedIncome}
                  actualIncome={actualIncome}
                  budgetedSpending={budgetedSpending}
                  actualSpending={actualSpending}
                />
              ) : (
                <Alert icon={<IconAlertCircle size={16} />} color="yellow">
                  No transaction data available for comparison
                </Alert>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="yearly" pt="md">
              <Stack gap="md">
                <Group justify="space-between">
                  <Group>
                    <ActionIcon onClick={handlePreviousYear} size="lg" variant="default">
                      <IconChevronLeft size={16} />
                    </ActionIcon>

                    <Text size="lg" fw={600}>
                      {selectedYear}
                    </Text>

                    <ActionIcon onClick={handleNextYear} size="lg" variant="default">
                      <IconChevronRight size={16} />
                    </ActionIcon>
                  </Group>

                  <Group>
                    <Tooltip label="Reset to current year">
                      <ActionIcon
                        onClick={() => {
                          setSelectedYear(new Date().getFullYear());
                          notifications.show({
                            title: 'View Reset',
                            message: 'Reset to current year view',
                            color: 'blue',
                          });
                        }}
                        size="lg"
                        variant="default"
                      >
                        <IconFilterOff size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>

                {yearlyBudgetsLoading ? (
                  <Center h={400}>
                    <Loader size="lg" />
                  </Center>
                ) : (
                  <YearlyBudgetGrid
                    budgets={yearlyBudgetData?.budgets || []}
                    categories={categories || []}
                    year={selectedYear}
                    isLoading={yearlyBudgetsLoading}
                  />
                )}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Paper>

        <BudgetForm
          opened={isFormOpen}
          onClose={handleFormClose}
          budget={editingBudget}
          month={selectedMonth}
          categories={categories || []}
          onSuccess={handleFormSuccess}
        />
      </Stack>
    </Container>
  );
}