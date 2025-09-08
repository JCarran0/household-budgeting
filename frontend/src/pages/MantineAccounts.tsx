import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ExtendedPlaidAccount } from '../lib/api';
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
  Menu,
  Modal,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconRefresh,
  IconCreditCard,
  IconCheck,
  IconX,
  IconDots,
  IconTrash,
  IconAlertCircle,
  IconEdit,
} from '@tabler/icons-react';
import { AccountNicknameModal } from '../components/accounts/AccountNicknameModal';
import { formatCurrency } from '../utils/formatters';

export function MantineAccounts() {
  const queryClient = useQueryClient();
  const [syncingAccount, setSyncingAccount] = useState<string | null>(null);
  const [accountToDisconnect, setAccountToDisconnect] = useState<{
    id: string;
    name: string;
    institution: string;
  } | null>(null);
  const [opened, { open, close }] = useDisclosure(false);
  const [editingAccount, setEditingAccount] = useState<ExtendedPlaidAccount | null>(null);
  const [nicknameModalOpened, { open: openNicknameModal, close: closeNicknameModal }] = useDisclosure(false);

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
    onError: (error: unknown) => {
      setSyncingAccount(null);
      notifications.show({
        title: 'Sync Failed',
        message: (error as { message?: string })?.message || 'Failed to sync transactions',
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (accountId: string) => api.disconnectAccount(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      close();
      notifications.show({
        title: 'Account Disconnected',
        message: 'The account has been successfully disconnected',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error: unknown) => {
      notifications.show({
        title: 'Disconnect Failed',
        message: (error as { message?: string })?.message || 'Failed to disconnect account',
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
    syncMutation.mutate(undefined as unknown as string);
  };

  const handleDisconnectClick = (account: { id: string; name: string; institution: string }) => {
    setAccountToDisconnect({
      id: account.id,
      name: account.name,
      institution: account.institution,
    });
    open();
  };

  const handleConfirmDisconnect = () => {
    if (accountToDisconnect) {
      disconnectMutation.mutate(accountToDisconnect.id);
    }
  };

  const handleEditNickname = (account: ExtendedPlaidAccount) => {
    setEditingAccount(account);
    openNicknameModal();
  };

  const handleCloseNicknameModal = () => {
    closeNicknameModal();
    setEditingAccount(null);
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
                    <Group gap="xs" align="center">
                      <Text size="lg" fw={600}>
                        {account.nickname || account.name}
                      </Text>
                      <Tooltip label="Edit nickname">
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          onClick={() => handleEditNickname(account)}
                        >
                          <IconEdit size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {account.nickname ? 'Official: ' : ''}{account.officialName || account.accountName || account.name}
                      {account.mask && ` ••${account.mask}`}
                    </Text>
                    <Group gap="xs" mt={4}>
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
                <Group gap="xs">
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
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" size="lg">
                        <IconDots size={18} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={16} />}
                        onClick={() => handleDisconnectClick(account)}
                      >
                        Disconnect Account
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
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
                      {formatCurrency(account.currentBalance)}
                    </Text>
                    {account.availableBalance !== null && 
                     account.availableBalance !== account.currentBalance && (
                      <Text size="sm" c="dimmed">
                        Available: {formatCurrency(account.availableBalance)}
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
      <Modal
        opened={opened}
        onClose={close}
        title="Disconnect Account"
        centered
      >
        <Stack gap="md">
          <Group>
            <ThemeIcon color="red" variant="light" size="xl" radius="xl">
              <IconAlertCircle size={24} />
            </ThemeIcon>
            <div style={{ flex: 1 }}>
              <Text size="sm" fw={600}>
                Are you sure you want to disconnect this account?
              </Text>
              {accountToDisconnect && (
                <Text size="sm" c="dimmed">
                  {accountToDisconnect.name} from {accountToDisconnect.institution}
                </Text>
              )}
            </div>
          </Group>
          
          <Text size="sm" c="dimmed">
            This will stop syncing transactions from this account. Your existing
            transaction history will be preserved, but you won't receive new
            transactions unless you reconnect the account.
          </Text>

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleConfirmDisconnect}
              loading={disconnectMutation.isPending}
              leftSection={<IconTrash size={16} />}
            >
              Disconnect Account
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Nickname Edit Modal */}
      <AccountNicknameModal
        account={editingAccount}
        opened={nicknameModalOpened}
        onClose={handleCloseNicknameModal}
      />
    </Stack>
  );
}