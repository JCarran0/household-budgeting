import {
  Card,
  Text,
  Title,
  Group,
  Stack,
  Button,
  Badge,
  Progress,
  SimpleGrid,
  ThemeIcon,
  Center,
  Loader,
  Alert,
  Tooltip
} from '@mantine/core';
import { useMemo } from 'react';
import {
  IconCash,
  IconWallet,
  IconTrendingDown,
  IconTrendingUp,
  IconPlus,
  IconArrowUpRight,
  IconArrowDownRight,
  IconAlertCircle,
  IconCategory,
  IconChartLine,
  IconBuildingBank,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useFilterStore } from '../stores/filterStore';
import { formatCurrency } from '../utils/formatters';
import { calculateActualTotals } from '../../../shared/utils/budgetCalculations';
import { calculateSavings } from '../../../shared/utils/transactionCalculations';
import { computeYearEndForecast } from '../../../shared/utils/cashflowForecast';
import { etMonthString, parseMonthKey, firstDayOfMonth, lastDayOfMonth } from '../../../shared/utils/easternTime';

export function MantineDashboard() {
  const navigate = useNavigate();
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

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  const stats = [
    {
      title: 'Net Worth',
      value: formatCurrency(totalBalance),
      exactValue: formatCurrency(totalBalance, true),
      icon: IconWallet,
      color: totalBalance >= 0 ? 'yellow' : 'red',
      description: 'Assets minus liabilities',
      formula: [
        'Assets − Liabilities, across linked + manual accounts.',
        `Linked (assets − loans/credit): ${formatCurrency(linkedBalance, true)}`,
        `Manual (assets − liabilities): ${formatCurrency(manualBalance, true)}`,
        `Total: ${formatCurrency(totalBalance, true)}`,
      ].join('\n'),
    },
    {
      title: 'Financial Assets',
      value: formatCurrency(totalAvailable),
      exactValue: formatCurrency(totalAvailable, true),
      icon: IconCash,
      color: 'green',
      description: 'Cash + investments in linked accounts',
      formula: [
        'Sum of available balance (or current if available is null) for asset',
        'accounts only — loans and credit cards are excluded.',
        '',
        'Currently includes linked accounts only. Manually-entered assets',
        '(including financial ones like a manual savings account) are not',
        'counted here, though they do count toward Net Worth.',
        '',
        `Total: ${formatCurrency(totalAvailable, true)}`,
      ].join('\n'),
    },
    {
      title: 'Monthly Spending',
      value: formatCurrency(monthlySpending),
      exactValue: formatCurrency(monthlySpending, true),
      icon: IconTrendingDown,
      color: 'red',
      description: 'This month',
      formula: [
        'Expenses − Savings contributions for the current month.',
        'Excludes transfers and hidden categories.',
        `Expenses: ${formatCurrency(actualTotals.expense, true)}`,
        `Savings:  ${formatCurrency(monthlySavings, true)}`,
        `Spending: ${formatCurrency(monthlySpending, true)}`,
      ].join('\n'),
    },
    {
      title: 'Monthly Savings',
      value: formatCurrency(monthlySavings),
      exactValue: formatCurrency(monthlySavings, true),
      icon: IconBuildingBank,
      color: 'teal',
      description: 'Savings this month',
      formula: [
        'Sum of transactions in categories flagged as Savings (isSavings),',
        'for the current month. Excludes transfers and hidden categories.',
        `Total: ${formatCurrency(monthlySavings, true)}`,
      ].join('\n'),
    },
    {
      title: 'Monthly Income',
      value: formatCurrency(monthlyIncome),
      exactValue: formatCurrency(monthlyIncome, true),
      icon: IconTrendingUp,
      color: 'blue',
      description: 'This month',
      formula: [
        'Sum of transactions in income categories for the current month.',
        'Excludes transfers and hidden categories.',
        `Total: ${formatCurrency(monthlyIncome, true)}`,
      ].join('\n'),
    },
    ...(projectedTotals ? (() => {
      const { forecast, futureMonths, hasBudget } = projectedTotals;
      const totals = forecast.totals;
      const ytd = forecast.ytd;
      const future = forecast.future;
      const ytdMonths = forecast.cells.filter(c => c.mode === 'actual').length;
      return [
        {
          title: 'Projected Savings',
          value: formatCurrency(totals.savings),
          exactValue: formatCurrency(totals.savings, true),
          icon: IconBuildingBank,
          color: totals.savings >= 0 ? 'teal' : 'red',
          description: hasBudget
            ? `${ytdMonths}mo actual + ${futureMonths}mo budgeted`
            : 'Based on YTD actuals only',
          formula: [
            'YTD actual savings + sum of budgeted savings for current and future months.',
            'Savings = transactions in categories flagged as Savings (isSavings).',
            'Excludes transfers and hidden categories.',
            'Refunds and reversals net within bucket (signed).',
            '',
            `YTD actuals (${ytdMonths} closed months):`,
            `  Savings: ${formatCurrency(ytd.savings, true)}`,
            '',
            hasBudget
              ? `Budgeted (${futureMonths} months — current + future, from yearly budgets):`
              : `No budgets set for remaining months — projection is YTD only.`,
            ...(hasBudget ? [
              `  Savings: ${formatCurrency(future.savings, true)}`,
            ] : []),
            '',
            `Projected: ${formatCurrency(totals.savings, true)}`,
          ].join('\n'),
        },
        {
          title: 'Projected Net Cashflow',
          value: formatCurrency(totals.netCashflow),
          exactValue: formatCurrency(totals.netCashflow, true),
          icon: IconChartLine,
          color: totals.netCashflow >= 0 ? 'teal' : 'red',
          description: hasBudget
            ? `${ytdMonths}mo actual + ${futureMonths}mo budgeted`
            : 'Based on YTD actuals only',
          formula: [
            'YTD actual + budgeted Net Cashflow for current and future months.',
            'Net Cashflow = Income − Spending − Savings.',
            'Spending excludes savings, transfers, and hidden categories.',
            'Refunds and reversals net within bucket (signed).',
            '',
            `YTD actuals (${ytdMonths} closed months):`,
            `  Income:   ${formatCurrency(ytd.income, true)}`,
            `  Spending: ${formatCurrency(ytd.spending, true)}`,
            `  Savings:  ${formatCurrency(ytd.savings, true)}`,
            `  Net:      ${formatCurrency(ytd.netCashflow, true)}`,
            '',
            hasBudget
              ? `Budgeted (${futureMonths} months — current + future, from yearly budgets):`
              : `No budgets set for remaining months — projection is YTD only.`,
            ...(hasBudget ? [
              `  Income:   ${formatCurrency(future.income, true)}`,
              `  Spending: ${formatCurrency(future.spending, true)}`,
              `  Savings:  ${formatCurrency(future.savings, true)}`,
              `  Net:      ${formatCurrency(future.netCashflow, true)}`,
            ] : []),
            '',
            `Projected: ${formatCurrency(totals.netCashflow, true)}`,
          ].join('\n'),
        },
      ];
    })() : []),
  ];

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

      {/* Accounts Needing Sign-in Alert */}
      {accounts && accounts.filter(a => a.status === 'requires_reauth').length > 0 && (
        <Alert
          icon={<IconAlertCircle size={20} />}
          title="Bank Sign-in Required"
          color="orange"
          variant="filled"
          styles={{
            root: { cursor: 'pointer' },
          }}
          onClick={() => navigate('/accounts')}
        >
          <Text size="sm">
            {accounts.filter(a => a.status === 'requires_reauth').length === 1
              ? `${accounts.find(a => a.status === 'requires_reauth')?.nickname || accounts.find(a => a.status === 'requires_reauth')?.name} requires you to sign in again to continue syncing.`
              : `${accounts.filter(a => a.status === 'requires_reauth').length} accounts require you to sign in again to continue syncing.`}
            {' '}Click here to sign in.
          </Text>
        </Alert>
      )}

      {/* Uncategorized Transactions Alert */}
      {uncategorizedData && uncategorizedData.count > 0 && (
        <Alert
          icon={<IconAlertCircle size={20} />}
          title="Uncategorized Transactions"
          color={uncategorizedData.count > 10 ? 'red' : 'orange'}
          variant="filled"
          styles={{
            root: { cursor: 'pointer' },
          }}
          onClick={() => {
            useFilterStore.getState().resetTransactionFilters();
            useFilterStore.getState().setTransactionFilters({ onlyUncategorized: true });
            navigate('/transactions');
          }}
        >
          <Group justify="space-between">
            <Text size="sm">
              You have {uncategorizedData.count} uncategorized transaction{uncategorizedData.count !== 1 ? 's' : ''}
              {' '}({Math.round((uncategorizedData.count / uncategorizedData.total) * 100)}% of total).
              Click here to categorize them.
            </Text>
            <Button
              size="xs"
              variant="white"
              color={uncategorizedData.count > 10 ? 'red' : 'orange'}
              leftSection={<IconCategory size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                navigate('/categories');
              }}
            >
              Manage Categories
            </Button>
          </Group>
        </Alert>
      )}

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
        <Card
          component={Link}
          to="/budgets?view=bva"
          padding="lg"
          radius="md"
          withBorder
          style={{ display: 'block', textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
        >
          <Group justify="space-between" mb="md">
            <Text size="sm" fw={500}>Monthly Budget Status</Text>
            <Tooltip
              label={
                <Text size="xs" style={{ whiteSpace: 'pre-line', fontFamily: 'var(--mantine-font-family-monospace)' }}>
                  {[
                    'Progress = Spending ÷ Expense budget × 100.',
                    'Spending excludes savings, transfers, and hidden categories.',
                    'Expense budget is the sum of non-income, non-transfer budgets',
                    'for the current month (savings categories included as expense here).',
                    '',
                    `Spending: ${formatCurrency(monthlySpending, true)}`,
                    `Budget:   ${formatCurrency(totalBudget, true)}`,
                    `Progress: ${budgetProgress.toFixed(1)}%`,
                  ].join('\n')}
                </Text>
              }
              multiline
              w={360}
              openDelay={300}
              withArrow
            >
              <Text size="xs" c="dimmed" style={{ cursor: 'help' }}>How is this calculated?</Text>
            </Tooltip>
          </Group>
          <Progress.Root size="xl" mb="md">
            <Progress.Section value={budgetProgress} color={budgetProgress > 100 ? 'red' : budgetProgress > 80 ? 'orange' : 'green'}>
              <Progress.Label>{budgetProgress.toFixed(0)}%</Progress.Label>
            </Progress.Section>
          </Progress.Root>
          <Group justify="space-between">
            <Tooltip label={`Spent ${formatCurrency(monthlySpending, true)} of ${formatCurrency(totalBudget, true)} budgeted`} openDelay={500}>
              <Text size="sm" c="dimmed" style={{ cursor: 'help' }}>
                Spent {formatCurrency(monthlySpending)} of {formatCurrency(totalBudget)} budgeted
              </Text>
            </Tooltip>
            <Badge color={budgetProgress > 100 ? 'red' : budgetProgress > 80 ? 'orange' : 'green'}>
              {budgetProgress > 100 ? 'Over Budget' : budgetProgress > 80 ? 'Near Limit' : 'On Track'}
            </Badge>
          </Group>
        </Card>
      ) : monthlyIncome > 0 ? (
        // Show income vs spending when no budget exists
        <Card padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="md">
            <Text size="sm" fw={500}>Income vs Spending</Text>
            <Tooltip
              label={
                <Text size="xs" style={{ whiteSpace: 'pre-line', fontFamily: 'var(--mantine-font-family-monospace)' }}>
                  {[
                    'Progress = Spending ÷ Income × 100.',
                    'Both exclude transfers and hidden categories.',
                    'Spending also excludes savings contributions.',
                    '',
                    `Spending: ${formatCurrency(monthlySpending, true)}`,
                    `Income:   ${formatCurrency(monthlyIncome, true)}`,
                    `Progress: ${spendingVsIncomeProgress.toFixed(1)}%`,
                  ].join('\n')}
                </Text>
              }
              multiline
              w={360}
              openDelay={300}
              withArrow
            >
              <Text size="xs" c="dimmed" style={{ cursor: 'help' }}>How is this calculated?</Text>
            </Tooltip>
          </Group>
          <Progress.Root size="xl" mb="md">
            <Progress.Section value={spendingVsIncomeProgress} color={spendingVsIncomeProgress > 100 ? 'red' : spendingVsIncomeProgress > 80 ? 'orange' : 'green'}>
              <Progress.Label>{spendingVsIncomeProgress.toFixed(0)}%</Progress.Label>
            </Progress.Section>
          </Progress.Root>
          <Group justify="space-between">
            <Tooltip label={`Spent ${formatCurrency(monthlySpending, true)} of ${formatCurrency(monthlyIncome, true)} income`} openDelay={500}>
              <Text size="sm" c="dimmed" style={{ cursor: 'help' }}>
                Spent {formatCurrency(monthlySpending)} of {formatCurrency(monthlyIncome)} income
              </Text>
            </Tooltip>
            <Badge color={spendingVsIncomeProgress > 100 ? 'red' : spendingVsIncomeProgress > 80 ? 'orange' : 'green'}>
              {spendingVsIncomeProgress > 100 ? 'Overspending' : spendingVsIncomeProgress > 80 ? 'High Spending' : 'Within Income'}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" mt="xs">
            <Link to="/budgets" style={{ color: 'inherit' }}>Create a budget</Link> to track spending against targets
          </Text>
        </Card>
      ) : null}

      {/* Recent Transactions */}
      <Card padding="lg" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <Text size="lg" fw={600}>Recent Activity</Text>
          <Button
            component={Link}
            to="/transactions"
            variant="subtle"
            size="xs"
          >
            View all
          </Button>
        </Group>

        {recentTransactions.length > 0 ? (
          <Stack gap="xs">
            {recentTransactions.slice(0, 5).map((transaction) => (
              <Group key={transaction.id} justify="space-between" py="xs">
                <Group gap="sm">
                  <ThemeIcon
                    color={transaction.amount < 0 ? 'red' : 'green'}
                    variant="light"
                    size="sm"
                    radius="xl"
                  >
                    {transaction.amount < 0 ? (
                      <IconArrowUpRight size={14} />
                    ) : (
                      <IconArrowDownRight size={14} />
                    )}
                  </ThemeIcon>
                  <div>
                    <Text size="sm" lineClamp={1}>
                      {transaction.merchantName || transaction.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatDistanceToNow(new Date(transaction.date), { addSuffix: true })}
                    </Text>
                  </div>
                </Group>
                <Tooltip label={formatCurrency(Math.abs(transaction.amount), true)} openDelay={500}>
                  <Text
                    size="sm"
                    fw={600}
                    c={transaction.amount < 0 ? 'red' : 'green'}
                    style={{ cursor: 'help' }}
                  >
                    {transaction.amount < 0 ? '-' : '+'}
                    {formatCurrency(Math.abs(transaction.amount)).replace('$', '')}
                  </Text>
                </Tooltip>
              </Group>
            ))}
          </Stack>
        ) : (
          <Center h={200}>
            <Stack align="center" gap="xs">
              <ThemeIcon color="gray" variant="light" size={60} radius="xl">
                <IconCash size={30} />
              </ThemeIcon>
              <Text c="dimmed" size="sm">No transactions yet</Text>
            </Stack>
          </Center>
        )}
      </Card>
    </Stack>
  );
}