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
  RingProgress,
  Loader,
  Alert,
  Tooltip
} from '@mantine/core';
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

export function MantineDashboard() {
  const navigate = useNavigate();
  
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  const { data: transactionData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => api.getTransactions({ limit: 10 }),
  });

  const { data: uncategorizedData } = useQuery({
    queryKey: ['transactions', 'uncategorized', 'count'],
    queryFn: api.getUncategorizedCount,
  });

  // Fetch current month's budgets to show actual budget vs spending
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
  const { data: budgetData } = useQuery({
    queryKey: ['budgets', 'month', currentMonth],
    queryFn: () => api.getMonthlyBudgets(currentMonth),
  });

  const isLoading = accountsLoading || transactionsLoading;

  const totalBalance = accounts?.reduce(
    (sum, account) => sum + (account.currentBalance || 0),
    0
  ) || 0;

  const totalAvailable = accounts?.reduce(
    (sum, account) => sum + (account.availableBalance || account.currentBalance || 0),
    0
  ) || 0;

  const recentTransactions = transactionData?.transactions || [];

  const monthlySpending = recentTransactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const monthlyIncome = recentTransactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  // Calculate budget progress - compare spending against actual budget, not income
  const totalBudget = budgetData?.total || 0;
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
      title: 'Total Balance',
      value: formatCurrency(totalBalance),
      exactValue: formatCurrency(totalBalance, true),
      icon: IconWallet,
      color: 'yellow',
      description: 'All accounts combined',
    },
    {
      title: 'Available',
      value: formatCurrency(totalAvailable),
      exactValue: formatCurrency(totalAvailable, true),
      icon: IconCash,
      color: 'green',
      description: 'Ready to spend',
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
                          <IconArrowDownRight size={14} />
                        ) : (
                          <IconArrowUpRight size={14} />
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