import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { PlaidButton } from '../components/PlaidButton';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import {
  Stack,
  Group,
  Title,
  Text,
  Card,
  Button,
  Badge,
  Loader,
  Center,
  SimpleGrid,
  ThemeIcon,
  Paper,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconRefresh,
  IconCreditCard,
  IconCheck,
  IconX,
} from '@tabler/icons-react';

export function MantineAccounts() {
  const queryClient = useQueryClient();
  const [syncingAccount, setSyncingAccount] = useState<string | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  const syncMutation = useMutation({
    mutationFn: (accountId: string) => api.syncTransactions(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setSyncingAccount(null);
      notifications.show({
        title: 'Success',
        message: 'Transactions synced successfully',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error: any) => {
      setSyncingAccount(null);
      notifications.show({
        title: 'Sync Failed',
        message: error.message || 'Failed to sync transactions',
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  const handleSync = (accountId: string) => {
    setSyncingAccount(accountId);
    syncMutation.mutate(accountId);
  };

  const handleSyncAll = () => {
    setSyncingAccount('all');
    syncMutation.mutate(undefined as any);
  };

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Connected Accounts</Title>
          <Text c="dimmed" size="sm">
            Manage your bank and credit card connections
          </Text>
        </div>
        {accounts && accounts.length > 0 && (
          <Group>
            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={handleSyncAll}
              loading={syncingAccount === 'all'}
              variant="default"
            >
              Sync All
            </Button>
            <PlaidButton />
          </Group>
        )}
      </Group>

      {accounts && accounts.length > 0 ? (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          {accounts.map((account) => (
            <Card key={account.id} padding="lg" radius="md" withBorder>
              <Group justify="space-between" mb="md">
                <Group>
                  <ThemeIcon color="blue" variant="light" size="xl" radius="md">
                    <IconCreditCard size={24} />
                  </ThemeIcon>
                  <div>
                    <Text size="lg" fw={600}>{account.name}</Text>
                    <Group gap="xs">
                      <Badge color="blue" variant="light" size="sm">
                        {account.type}
                      </Badge>
                      {account.subtype && (
                        <Badge color="gray" variant="light" size="sm">
                          {account.subtype}
                        </Badge>
                      )}
                    </Group>
                  </div>
                </Group>
                <Tooltip label="Sync transactions">
                  <ActionIcon
                    variant="light"
                    color="blue"
                    size="lg"
                    onClick={() => handleSync(account.id)}
                    loading={syncingAccount === account.id}
                  >
                    <IconRefresh size={18} />
                  </ActionIcon>
                </Tooltip>
              </Group>

              <Paper p="md" radius="md" withBorder>
                <Group justify="space-between">
                  <div>
                    <Text size="sm" c="dimmed">Institution</Text>
                    <Text fw={500}>{account.institution}</Text>
                    {account.mask && (
                      <Text size="sm" c="dimmed">****{account.mask}</Text>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Text size="sm" c="dimmed">Current Balance</Text>
                    <Text size="xl" fw={700}>
                      ${account.currentBalance.toFixed(2)}
                    </Text>
                    {account.availableBalance !== null && 
                     account.availableBalance !== account.currentBalance && (
                      <Text size="sm" c="dimmed">
                        Available: ${account.availableBalance.toFixed(2)}
                      </Text>
                    )}
                  </div>
                </Group>
              </Paper>

              <Text size="xs" c="dimmed" mt="md">
                Last synced:{' '}
                {account.lastSynced
                  ? formatDistanceToNow(new Date(account.lastSynced), { addSuffix: true })
                  : 'Never'}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <Center>
          <Card padding="xl" radius="md" withBorder style={{ maxWidth: 400, width: '100%' }}>
            <Stack align="center" gap="md">
              <ThemeIcon color="gray" variant="light" size={80} radius="xl">
                <IconCreditCard size={40} />
              </ThemeIcon>
              <Text size="lg" fw={600}>No accounts connected</Text>
              <Text size="sm" c="dimmed" ta="center">
                Connect your bank accounts to start tracking your finances.
              </Text>
              <PlaidButton />
            </Stack>
          </Card>
        </Center>
      )}
    </Stack>
  );
}