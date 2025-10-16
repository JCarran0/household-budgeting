import {
  Grid,
  Card,
  Text,
  Title,
  Group,
  Stack,
  Button,
  Badge,
  Progress,
  SimpleGrid,
  Paper,
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
  IconCreditCard,
  IconPlus,
  IconArrowUpRight,
  IconArrowDownRight,
  IconAlertCircle,
  IconCategory
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/formatters';
import { calculateActualTotals } from '../../../shared/utils/budgetCalculations';
import { format, startOfMonth, addMonths } from 'date-fns';

export function MantineDashboard() {
  const navigate = useNavigate();
  
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  // Fetch recent transactions for display (limit 10)
  const { data: recentTransactionData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => api.getTransactions({ limit: 10 }),
  });

  // Fetch current month's transactions for accurate calculations
  const currentDate = new Date();
  const currentMonth = startOfMonth(currentDate);
  const { data: monthlyTransactionData } = useQuery({
    queryKey: ['transactions', format(currentMonth, 'yyyy-MM')],
    queryFn: () => api.getTransactions({
      startDate: format(currentMonth, 'yyyy-MM-01'),
      endDate: format(addMonths(currentMonth, 1).getTime() - 1, 'yyyy-MM-dd'),
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
  const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM format
  const { data: budgetData } = useQuery({
    queryKey: ['budgets', 'month', currentMonthStr],
    queryFn: () => api.getMonthlyBudgets(currentMonthStr),
  });

  const isLoading = accountsLoading || transactionsLoading;

  // Calculate net worth: assets minus liabilities
  // Loan accounts (mortgage, auto, student) and credit cards are liabilities
  const totalBalance = accounts?.reduce((sum, account) => {
    const balance = account.currentBalance || 0;
    const isLiability = account.type === 'loan' || account.type === 'credit';
    // For liabilities, subtract the balance (what you owe)
    // For assets, add the balance (what you have)
    return sum + (isLiability ? -balance : balance);
  }, 0) || 0;

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

  const monthlySpending = actualTotals.expense;
  const monthlyIncome = actualTotals.income;

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
    },
    {
      title: 'Available',
      value: formatCurrency(totalAvailable),
      exactValue: formatCurrency(totalAvailable, true),
      icon: IconCash,
      color: 'green',
      description: 'In asset accounts',
    },
    {
      title: 'Monthly Spending',
      value: formatCurrency(monthlySpending),
      exactValue: formatCurrency(monthlySpending, true),
      icon: IconTrendingDown,
      color: 'red',
      description: 'This month',
    },
    {
      title: 'Monthly Income',
      value: formatCurrency(monthlyIncome),
      exactValue: formatCurrency(monthlyIncome, true),
      icon: IconTrendingUp,
      color: 'blue',
      description: 'This month',
    },
  ];

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <div>
          <Title order={2}>Dashboard</Title>
          <Text c="dimmed" size="sm">Welcome back, {accounts?.[0]?.name ? 'here\'s your financial overview' : 'let\'s get started'}</Text>
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
          onClick={() => navigate('/transactions')}
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
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
        {stats.map((stat) => (
          <Card key={stat.title} padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                {stat.title}
              </Text>
              <ThemeIcon color={stat.color} variant="light" size="lg" radius="md">
                <stat.icon size={18} />
              </ThemeIcon>
            </Group>
            <Tooltip 
              label={stat.exactValue} 
              openDelay={500}
              closeDelay={200}
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
        <Card padding="lg" radius="md" withBorder>
          <Text size="sm" fw={500} mb="md">Monthly Budget Status</Text>
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
          <Text size="sm" fw={500} mb="md">Income vs Spending</Text>
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

      <Grid gutter="lg">
        {/* Accounts Section */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card padding="lg" radius="md" h="100%" withBorder>
            <Group justify="space-between" mb="md">
              <Text size="lg" fw={600}>Connected Accounts</Text>
              <Button
                component={Link}
                to="/accounts"
                variant="subtle"
                size="xs"
              >
                View all
              </Button>
            </Group>

            {accounts && accounts.length > 0 ? (
              <Stack gap="sm">
                {accounts.slice(0, 3).map((account) => (
                  <Paper key={account.id} p="md" radius="md" withBorder>
                    <Group justify="space-between">
                      <Group>
                        <ThemeIcon color="blue" variant="light" size="lg" radius="md">
                          <IconCreditCard size={18} />
                        </ThemeIcon>
                        <div>
                          <Text size="sm" fw={500}>{account.officialName || account.accountName}</Text>
                          <Text size="xs" c="dimmed">
                            {account.institutionName} • ••{account.mask}
                          </Text>
                        </div>
                      </Group>
                      <div style={{ textAlign: 'right' }}>
                        <Tooltip label={formatCurrency(account.currentBalance || 0, true)} openDelay={500}>
                          <Text size="sm" fw={600} style={{ cursor: 'help' }}>
                            {formatCurrency(account.currentBalance || 0)}
                          </Text>
                        </Tooltip>
                        <Badge size="xs" variant="dot">
                          {account.type}
                        </Badge>
                      </div>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Center h={200}>
                <Stack align="center" gap="xs">
                  <ThemeIcon color="gray" variant="light" size={60} radius="xl">
                    <IconCreditCard size={30} />
                  </ThemeIcon>
                  <Text c="dimmed" size="sm">No accounts connected</Text>
                  <Button
                    component={Link}
                    to="/accounts"
                    variant="light"
                    size="xs"
                  >
                    Connect Account
                  </Button>
                </Stack>
              </Center>
            )}
          </Card>
        </Grid.Col>

        {/* Recent Transactions */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card padding="lg" radius="md" h="100%" withBorder>
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
        </Grid.Col>
      </Grid>
    </Stack>
  );
}