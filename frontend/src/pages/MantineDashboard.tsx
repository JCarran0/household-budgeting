import {
  Card,
  Text,
  Title,
  Group,
  Stack,
  Button,
  SimpleGrid,
  ThemeIcon,
  Center,
  Loader,
  Tooltip,
} from '@mantine/core';
import { useMemo } from 'react';
import {
  IconPlus,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { calculateActualTotals } from '../../../shared/utils/budgetCalculations';
import { calculateSavings } from '../../../shared/utils/transactionCalculations';
import { computeYearEndForecast } from '../../../shared/utils/cashflowForecast';
import { etMonthString, parseMonthKey, firstDayOfMonth, lastDayOfMonth } from '../../../shared/utils/easternTime';
import { buildDashboardStats } from '../utils/dashboardStats';
import { DashboardAlerts } from '../components/dashboard/DashboardAlerts';
import { BudgetStatusCard } from '../components/dashboard/BudgetStatusCard';
import { IncomeVsSpendingCard } from '../components/dashboard/IncomeVsSpendingCard';
import { RecentTransactionsCard } from '../components/dashboard/RecentTransactionsCard';

export function MantineDashboard() {
  const user = useAuthStore((s) => s.user);

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  const { data: manualAccounts } = useQuery({
    queryKey: ['manualAccounts'],
    queryFn: api.getManualAccounts,
  });

  // Fetch recent transactions for display (limit 10)
  const { data: recentTransactionData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => api.getTransactions({ limit: 10 }),
  });

  // Anchor all "today" reads to ET so users see consistent buckets regardless
  // of where they open the app from.
  const currentMonthKey = useMemo(() => etMonthString(), []);
  const { year: currentYear, monthIndex: currentMonthIndex } = useMemo(
    () => parseMonthKey(currentMonthKey),
    [currentMonthKey],
  );
  const { data: monthlyTransactionData } = useQuery({
    queryKey: ['transactions', currentMonthKey],
    queryFn: () => api.getTransactions({
      startDate: firstDayOfMonth(currentYear, currentMonthIndex),
      endDate: lastDayOfMonth(currentYear, currentMonthIndex),
    }),
  });

  // Fetch categories for calculation utilities
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: api.getCategories,
  });

  const { data: uncategorizedData } = useQuery({
    queryKey: ['transactions', 'uncategorized', 'count'],
    queryFn: api.getUncategorizedCount,
  });

  // Fetch current month's budgets to show actual budget vs spending
  const { data: budgetData } = useQuery({
    queryKey: ['budgets', 'month', currentMonthKey],
    queryFn: () => api.getMonthlyBudgets(currentMonthKey),
  });

  // Fetch yearly budgets to drive year-end forecast (shared with Reports → Cash Flow).
  const { data: yearlyBudgetData } = useQuery({
    queryKey: ['budgets', 'year', currentYear],
    queryFn: () => api.getYearlyBudgets(currentYear),
  });

  // Fetch full-year transactions for the forecast helper. The earlier ytd
  // query stops at "today"; the helper needs Jan 1..Dec 31 so future-month
  // transactions (rare but possible — pre-posted entries) are included.
  const { data: yearlyTransactionData } = useQuery({
    queryKey: ['transactions', 'year', currentYear],
    queryFn: () => api.getTransactions({
      startDate: `${currentYear}-01-01`,
      endDate: `${currentYear}-12-31`,
      limit: 10000,
    }),
  });

  const isLoading = accountsLoading || transactionsLoading;

  // Calculate net worth: assets minus liabilities (linked + manual accounts)
  const linkedBalance = accounts?.reduce((sum, account) => {
    const balance = account.currentBalance || 0;
    const isLiability = account.type === 'loan' || account.type === 'credit';
    return sum + (isLiability ? -balance : balance);
  }, 0) || 0;

  const manualBalance = manualAccounts?.reduce((sum, account) => {
    return sum + (account.isAsset ? account.currentBalance : -account.currentBalance);
  }, 0) || 0;

  const totalBalance = linkedBalance + manualBalance;

  // Available balance: only count asset accounts (not loans)
  const totalAvailable = accounts?.reduce((sum, account) => {
    const available = account.availableBalance || account.currentBalance || 0;
    const isLiability = account.type === 'loan' || account.type === 'credit';
    // Only include assets in "available" calculation
    return sum + (isLiability ? 0 : available);
  }, 0) || 0;

  const recentTransactions = recentTransactionData?.transactions || [];

  // Calculate monthly income and spending using shared utilities
  const actualTotals = useMemo(() => {
    if (!monthlyTransactionData?.transactions || !categories) {
      return { income: 0, expense: 0, transfer: 0, total: 0 };
    }

    return calculateActualTotals(monthlyTransactionData.transactions, categories, { excludeHidden: true });
  }, [monthlyTransactionData, categories]);

  const monthlySavings = useMemo(() => {
    if (!monthlyTransactionData?.transactions || !categories) return 0;
    return calculateSavings(
      monthlyTransactionData.transactions as unknown as import('../../../shared/utils/transactionCalculations').TransactionForCalculation[],
      categories
    );
  }, [monthlyTransactionData, categories]);

  const monthlySpending = actualTotals.expense - monthlySavings;
  const monthlyIncome = actualTotals.income;

  const projectedTotals = useMemo(() => {
    if (!yearlyTransactionData?.transactions || !yearlyBudgetData || !categories) {
      return null;
    }
    const forecast = computeYearEndForecast({
      year: currentYear,
      transactions: yearlyTransactionData.transactions,
      budgets: yearlyBudgetData.budgets,
      categories,
    });
    const futureMonths = forecast.cells.filter(c => c.mode === 'budgeted').length;
    const hasBudget =
      forecast.future.income !== 0 ||
      forecast.future.spending !== 0 ||
      forecast.future.savings !== 0;
    return { forecast, futureMonths, hasBudget };
  }, [yearlyTransactionData, yearlyBudgetData, categories, currentYear]);

  // Calculate budget progress - compare spending against actual expense budget only
  const totalBudget = budgetData?.totals?.expense || 0;
  const hasBudget = totalBudget > 0;
  const budgetProgress = hasBudget ? (monthlySpending / totalBudget) * 100 : 0;

  // For income vs spending comparison (when no budget exists)
  const spendingVsIncomeProgress = monthlyIncome > 0 ? (monthlySpending / monthlyIncome) * 100 : 0;

  const stats = buildDashboardStats({
    totalBalance,
    linkedBalance,
    manualBalance,
    totalAvailable,
    monthlySpending,
    monthlyIncome,
    monthlySavings,
    actualTotals,
    projectedTotals,
  });

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="lg" px="lg">
      {/* Header */}
      <Group justify="space-between">
        <div>
          <Title order={2}>Dashboard</Title>
          <Text c="dimmed" size="sm">Welcome back{user?.displayName ? ` ${user.displayName}` : ''}, {accounts?.length ? 'here\'s your financial overview' : 'let\'s get started'}</Text>
        </div>
        {accounts && accounts.length === 0 && (
          <Button
            component={Link}
            to="/accounts"
            leftSection={<IconPlus size={16} />}
            variant="gradient"
            gradient={{ from: 'yellow', to: 'orange' }}
          >
            Connect Account
          </Button>
        )}
      </Group>

      <DashboardAlerts accounts={accounts} uncategorizedData={uncategorizedData} />

      {/* Stats Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: stats.length > 4 ? 5 : 4 }} spacing="lg">
        {stats.map((stat) => (
          <Card key={stat.title} padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs" wrap="nowrap">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                {stat.title}
              </Text>
              <ThemeIcon color={stat.color} variant="light" size="lg" radius="md" style={{ flexShrink: 0 }}>
                <stat.icon size={18} />
              </ThemeIcon>
            </Group>
            <Tooltip
              label={
                <Text size="xs" style={{ whiteSpace: 'pre-line', fontFamily: 'var(--mantine-font-family-monospace)' }}>
                  {stat.formula}
                </Text>
              }
              multiline
              w={360}
              openDelay={300}
              closeDelay={200}
              withArrow
            >
              <Text size="xl" fw={700} mb={5} style={{ cursor: 'help' }}>
                {stat.value}
              </Text>
            </Tooltip>
            <Text size="xs" c="dimmed">
              {stat.description}
            </Text>
          </Card>
        ))}
      </SimpleGrid>

      {/* Budget Status - Show actual budget vs spending when budget exists */}
      {hasBudget ? (
        <BudgetStatusCard
          monthlySpending={monthlySpending}
          totalBudget={totalBudget}
          budgetProgress={budgetProgress}
        />
      ) : monthlyIncome > 0 ? (
        <IncomeVsSpendingCard
          monthlySpending={monthlySpending}
          monthlyIncome={monthlyIncome}
          spendingVsIncomeProgress={spendingVsIncomeProgress}
        />
      ) : null}

      <RecentTransactionsCard transactions={recentTransactions} />
    </Stack>
  );
}
