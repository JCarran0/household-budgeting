import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import type { Transaction } from '../../../shared/types';
import {
  Stack,
  Group,
  Title,
  Text,
  Card,
  TextInput,
  Select,
  Button,
  Badge,
  Loader,
  Center,
  Paper,
  Collapse,
  Grid,
  NumberInput,
  ThemeIcon,
  Box,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import {
  IconSearch,
  IconFilter,
  IconCalendar,
  IconArrowUpRight,
  IconArrowDownRight,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';

export function MantineTransactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    return {
      startDate: startOfMonth(subMonths(now, 1)),
      endDate: endOfMonth(now),
    };
  });
  const [opened, { toggle }] = useDisclosure(false);
  const [amountFilter, setAmountFilter] = useState({ min: null as number | null, max: null as number | null });

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  const { data: transactionData, isLoading } = useQuery({
    queryKey: ['transactions', selectedAccount, dateRange],
    queryFn: () =>
      api.getTransactions({
        accountId: selectedAccount === 'all' ? undefined : selectedAccount,
        startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
        endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
      }),
  });

  const filteredTransactions = useMemo(() => {
    if (!transactionData?.transactions) return [];
    
    return transactionData.transactions.filter((transaction) => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (
          !transaction.name.toLowerCase().includes(search) &&
          !transaction.merchantName?.toLowerCase().includes(search) &&
          !transaction.category?.some(cat => cat.toLowerCase().includes(search))
        ) {
          return false;
        }
      }

      const amount = Math.abs(transaction.amount);
      if (amountFilter.min && amount < amountFilter.min) return false;
      if (amountFilter.max && amount > amountFilter.max) return false;

      return true;
    });
  }, [transactionData?.transactions, searchTerm, amountFilter]);

  const groupedTransactions = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    
    filteredTransactions.forEach((transaction) => {
      const date = format(new Date(transaction.date), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(transaction);
    });
    
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredTransactions]);

  const totalSpent = filteredTransactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalEarned = filteredTransactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const accountOptions = useMemo(() => {
    const options = [{ value: 'all', label: 'All Accounts' }];
    if (accounts && accounts.length > 0) {
      accounts.forEach(acc => {
        if (acc && acc.id && acc.name) {
          options.push({ value: acc.id, label: acc.name });
        }
      });
    }
    return options;
  }, [accounts]);

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Transactions</Title>
        <Text c="dimmed" size="sm">
          View and manage your transaction history
        </Text>
      </div>

      <Group>
        <TextInput
          flex={1}
          placeholder="Search transactions..."
          leftSection={<IconSearch size={16} />}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Button
          leftSection={<IconFilter size={16} />}
          rightSection={opened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          onClick={toggle}
          variant="default"
        >
          Filters
        </Button>
      </Group>

      <Collapse in={opened}>
        <Card padding="lg" radius="md" withBorder>
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Select
                label="Account"
                placeholder="Select account"
                data={accountOptions}
                value={selectedAccount}
                onChange={(value) => setSelectedAccount(value || 'all')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <DateInput
                label="Start Date"
                placeholder="Select start date"
                value={dateRange.startDate}
                onChange={(value: string | Date | null) => {
                  if (value && value instanceof Date) {
                    setDateRange(prev => ({ ...prev, startDate: value }));
                  }
                }}
                leftSection={<IconCalendar size={16} />}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <DateInput
                label="End Date"
                placeholder="Select end date"
                value={dateRange.endDate}
                onChange={(value: string | Date | null) => {
                  if (value && value instanceof Date) {
                    setDateRange(prev => ({ ...prev, endDate: value }));
                  }
                }}
                leftSection={<IconCalendar size={16} />}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Group grow>
                <NumberInput
                  label="Min Amount"
                  placeholder="0"
                  value={amountFilter.min || ''}
                  onChange={(value) => setAmountFilter(prev => ({ ...prev, min: typeof value === 'number' ? value : null }))}
                  min={0}
                />
                <NumberInput
                  label="Max Amount"
                  placeholder="1000"
                  value={amountFilter.max || ''}
                  onChange={(value) => setAmountFilter(prev => ({ ...prev, max: typeof value === 'number' ? value : null }))}
                  min={0}
                />
              </Group>
            </Grid.Col>
          </Grid>
        </Card>
      </Collapse>

      <Card padding="lg" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <div>
            <Text size="lg" fw={600}>
              {filteredTransactions.length} Transactions
            </Text>
            <Text size="sm" c="dimmed">
              {format(dateRange.startDate, 'MMM d, yyyy')} -{' '}
              {format(dateRange.endDate, 'MMM d, yyyy')}
            </Text>
          </div>
          <Paper p="md" radius="md" withBorder>
            <Group gap="xl">
              <div>
                <Text size="xs" c="dimmed">Total Spent</Text>
                <Text size="lg" fw={700} c="red">
                  -${totalSpent.toFixed(2)}
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Total Earned</Text>
                <Text size="lg" fw={700} c="green">
                  +${totalEarned.toFixed(2)}
                </Text>
              </div>
            </Group>
          </Paper>
        </Group>

        {groupedTransactions.length > 0 ? (
          <Stack gap="sm">
            {groupedTransactions.map(([date, transactions]) => (
              <Box key={date}>
                <Paper p="xs" radius="md" bg="dark.6" mb="xs">
                  <Text size="sm" fw={600}>
                    {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                  </Text>
                </Paper>
                <Stack gap="xs">
                  {transactions.map((transaction) => (
                    <Paper key={transaction.id} p="md" radius="md" withBorder>
                      <Group justify="space-between">
                        <Group>
                          <ThemeIcon
                            color={transaction.amount < 0 ? 'red' : 'green'}
                            variant="light"
                            size="md"
                            radius="xl"
                          >
                            {transaction.amount < 0 ? (
                              <IconArrowDownRight size={16} />
                            ) : (
                              <IconArrowUpRight size={16} />
                            )}
                          </ThemeIcon>
                          <div style={{ flex: 1 }}>
                            <Text size="sm" fw={500}>
                              {transaction.merchantName || transaction.name}
                            </Text>
                            <Group gap="xs">
                              <Text size="xs" c="dimmed">
                                {transaction.category?.join(' > ') || 'Uncategorized'}
                              </Text>
                              {transaction.pending && (
                                <Badge color="yellow" size="xs" variant="dot">
                                  Pending
                                </Badge>
                              )}
                            </Group>
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
                    </Paper>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        ) : (
          <Center py="xl">
            <Text c="dimmed">No transactions found</Text>
          </Center>
        )}
      </Card>
    </Stack>
  );
}