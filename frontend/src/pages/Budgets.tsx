import { useState, useMemo } from 'react';
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
  Grid,
  Card,
  ThemeIcon,
  ActionIcon,
  Tooltip,
  Tabs,
} from '@mantine/core';
import { MonthPickerInput, type DatePickerValue } from '@mantine/dates';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconCopy,
  IconChartBar,
  IconAlertCircle,
  IconCurrencyDollar,
  IconTrendingUp,
  IconTrendingDown,
  IconChevronLeft,
  IconChevronRight,
  IconRefresh,
} from '@tabler/icons-react';
import { format, addMonths, subMonths, startOfMonth } from 'date-fns';
import { api } from '../lib/api';
import { BudgetGrid } from '../components/budgets/BudgetGrid';
import { BudgetForm } from '../components/budgets/BudgetForm';
import { BudgetComparison } from '../components/budgets/BudgetComparison';
import type { MonthlyBudget } from '../../../shared/types';

export function Budgets() {
  const [selectedDate, setSelectedDate] = useState<Date>(startOfMonth(new Date()));
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingBudget, setEditingBudget] = useState<MonthlyBudget | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>('budget');
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

  // Fetch transactions for the month to calculate actuals
  const { data: transactionData } = useQuery({
    queryKey: ['transactions', selectedMonth],
    queryFn: () => api.getTransactions({
      startDate: format(selectedDate, 'yyyy-MM-01'),
      endDate: format(addMonths(selectedDate, 1), 'yyyy-MM-01'),
    }),
    enabled: activeTab === 'comparison',
  });

  // Calculate actuals from transactions
  const actuals = useMemo<Record<string, number>>(() => {
    if (!transactionData?.transactions) return {};
    
    const actualsByCategory: Record<string, number> = {};
    transactionData.transactions.forEach(transaction => {
      if (transaction.categoryId && !transaction.isHidden) {
        const amount = Math.abs(transaction.amount);
        actualsByCategory[transaction.categoryId] = 
          (actualsByCategory[transaction.categoryId] || 0) + amount;
      }
    });
    
    return actualsByCategory;
  }, [transactionData]);

  // Fetch budget comparison
  const { data: comparisonData, isLoading: comparisonLoading } = useQuery({
    queryKey: ['budgets', 'comparison', selectedMonth, actuals],
    queryFn: () => api.getBudgetComparison(selectedMonth, actuals),
    enabled: activeTab === 'comparison' && Object.keys(actuals).length > 0,
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
    setSelectedDate(subMonths(selectedDate, 1));
  };

  const handleNextMonth = (): void => {
    setSelectedDate(addMonths(selectedDate, 1));
  };

  const handleCopyFromPreviousMonth = (): void => {
    const previousMonth = format(subMonths(selectedDate, 1), 'yyyy-MM');
    if (window.confirm(`Copy all budgets from ${format(subMonths(selectedDate, 1), 'MMMM yyyy')} to ${displayMonth}?`)) {
      copyMutation.mutate({ fromMonth: previousMonth, toMonth: selectedMonth });
    }
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

  if (budgetsLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  const hasBudgets = budgetData && budgetData.budgets.length > 0;
  const totalBudget = budgetData?.total || 0;
  const totalActual = comparisonData?.totals.actual || 0;
  const totalRemaining = comparisonData?.totals.remaining || 0;

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
                onChange={(date: DatePickerValue) => date && setSelectedDate(date)}
                size="md"
                styles={{ input: { width: 200, textAlign: 'center' } }}
              />
              
              <ActionIcon onClick={handleNextMonth} size="lg" variant="default">
                <IconChevronRight size={16} />
              </ActionIcon>
            </Group>

            <Group>
              <Tooltip label="Copy budgets from previous month">
                <Button
                  variant="light"
                  leftSection={<IconCopy size={16} />}
                  onClick={handleCopyFromPreviousMonth}
                  loading={copyMutation.isPending}
                >
                  Copy from Previous
                </Button>
              </Tooltip>
              
              <Tooltip label="Refresh data">
                <ActionIcon onClick={() => refetchBudgets()} size="lg" variant="default">
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <Grid mb="lg">
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Card>
                <Group gap="xs">
                  <ThemeIcon color="blue" variant="light" size="lg">
                    <IconCurrencyDollar size={20} />
                  </ThemeIcon>
                  <div>
                    <Text size="xs" c="dimmed">Total Budget</Text>
                    <Text fw={600} size="lg">${totalBudget.toFixed(2)}</Text>
                  </div>
                </Group>
              </Card>
            </Grid.Col>
            
            {activeTab === 'comparison' && (
              <>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <Card>
                    <Group gap="xs">
                      <ThemeIcon 
                        color={totalActual > totalBudget ? "red" : "green"} 
                        variant="light" 
                        size="lg"
                      >
                        {totalActual > totalBudget ? 
                          <IconTrendingUp size={20} /> : 
                          <IconTrendingDown size={20} />
                        }
                      </ThemeIcon>
                      <div>
                        <Text size="xs" c="dimmed">Total Spent</Text>
                        <Text fw={600} size="lg">${totalActual.toFixed(2)}</Text>
                      </div>
                    </Group>
                  </Card>
                </Grid.Col>
                
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <Card>
                    <Group gap="xs">
                      <ThemeIcon 
                        color={totalRemaining < 0 ? "red" : "green"} 
                        variant="light" 
                        size="lg"
                      >
                        <IconChartBar size={20} />
                      </ThemeIcon>
                      <div>
                        <Text size="xs" c="dimmed">Remaining</Text>
                        <Text 
                          fw={600} 
                          size="lg"
                          c={totalRemaining < 0 ? "red" : undefined}
                        >
                          ${Math.abs(totalRemaining).toFixed(2)}
                          {totalRemaining < 0 && " over"}
                        </Text>
                      </div>
                    </Group>
                  </Card>
                </Grid.Col>
              </>
            )}
          </Grid>

          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="budget" leftSection={<IconCurrencyDollar size={16} />}>
                Budget Setup
              </Tabs.Tab>
              <Tabs.Tab value="comparison" leftSection={<IconChartBar size={16} />}>
                Budget vs Actual
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
                    <Button
                      variant="light"
                      leftSection={<IconCopy size={16} />}
                      onClick={handleCopyFromPreviousMonth}
                      loading={copyMutation.isPending}
                    >
                      Copy from Previous Month
                    </Button>
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
                />
              ) : (
                <Alert icon={<IconAlertCircle size={16} />} color="yellow">
                  No transaction data available for comparison
                </Alert>
              )}
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