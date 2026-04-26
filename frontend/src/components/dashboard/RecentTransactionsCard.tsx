import {
  Button,
  Card,
  Center,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconCash,
} from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatters';
import type { Transaction } from '../../../../shared/types';

interface RecentTransactionsCardProps {
  transactions: Transaction[];
}

export function RecentTransactionsCard({ transactions }: RecentTransactionsCardProps) {
  return (
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

      {transactions.length > 0 ? (
        <Stack gap="xs">
          {transactions.slice(0, 5).map((transaction) => (
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
  );
}
