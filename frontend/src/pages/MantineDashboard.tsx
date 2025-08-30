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
  Loader
} from '@mantine/core';
import { 
  IconCash, 
  IconWallet, 
  IconTrendingDown, 
  IconTrendingUp,
  IconCreditCard,
  IconPlus,
  IconArrowUpRight,
  IconArrowDownRight
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';

export function MantineDashboard() {
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  const { data: transactionData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => api.getTransactions({ limit: 10 }),
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

  const spendingProgress = monthlyIncome > 0 ? (monthlySpending / monthlyIncome) * 100 : 0;

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
      value: `$${totalBalance.toFixed(2)}`,
      icon: IconWallet,
      color: 'yellow',
      description: 'All accounts combined',
    },
    {
      title: 'Available',
      value: `$${totalAvailable.toFixed(2)}`,
      icon: IconCash,
      color: 'green',
      description: 'Ready to spend',
    },
    {
      title: 'Monthly Spending',
      value: `$${monthlySpending.toFixed(2)}`,
      icon: IconTrendingDown,
      color: 'red',
      description: 'This month',
    },
    {
      title: 'Monthly Income',
      value: `$${monthlyIncome.toFixed(2)}`,
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
            <Text size="xl" fw={700} mb={5}>
              {stat.value}
            </Text>
            <Text size="xs" c="dimmed">
              {stat.description}
            </Text>
          </Card>
        ))}
      </SimpleGrid>

      {/* Spending Progress */}
      {monthlyIncome > 0 && (
        <Card padding="lg" radius="md" withBorder>
          <Text size="sm" fw={500} mb="md">Monthly Budget Status</Text>
          <Progress.Root size="xl" mb="md">
            <Progress.Section value={spendingProgress} color={spendingProgress > 80 ? 'red' : 'yellow'}>
              <Progress.Label>{spendingProgress.toFixed(0)}%</Progress.Label>
            </Progress.Section>
          </Progress.Root>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Spent ${monthlySpending.toFixed(2)} of ${monthlyIncome.toFixed(2)} income
            </Text>
            <Badge color={spendingProgress > 80 ? 'red' : 'green'}>
              {spendingProgress > 80 ? 'Over Budget' : 'On Track'}
            </Badge>
          </Group>
        </Card>
      )}

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
                          <Text size="sm" fw={500}>{account.name}</Text>
                          <Text size="xs" c="dimmed">
                            {account.institutionName} • ••{account.mask}
                          </Text>
                        </div>
                      </Group>
                      <div style={{ textAlign: 'right' }}>
                        <Text size="sm" fw={600}>
                          ${account.currentBalance?.toFixed(2) || '0.00'}
                        </Text>
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
                    <Text
                      size="sm"
                      fw={600}
                      c={transaction.amount < 0 ? 'red' : 'green'}
                    >
                      {transaction.amount < 0 ? '-' : '+'}$
                      {Math.abs(transaction.amount).toFixed(2)}
                    </Text>
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