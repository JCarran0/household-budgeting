import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ExtendedPlaidAccount } from '../lib/api';
import { getApiErrorMessage } from '../lib/api/errors';
import { PlaidButton } from '../components/PlaidButton';
import { usePlaid } from '../hooks/usePlaidLink';
import { useState } from 'react';
import {
  Stack,
  Group,
  Title,
  Text,
  Card,
  Button,
  Loader,
  Center,
  SimpleGrid,
  ThemeIcon,
  Tabs,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconRefresh,
  IconCreditCard,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconPlus,
  IconWallet,
  IconLink,
} from '@tabler/icons-react';
import { AccountNicknameModal } from '../components/accounts/AccountNicknameModal';
import { ManualAccountModal } from '../components/accounts/ManualAccountModal';
import { ConnectedAccountCard } from '../components/accounts/ConnectedAccountCard';
import { ManualAccountCard } from '../components/accounts/ManualAccountCard';
import { DisconnectAccountModal } from '../components/accounts/DisconnectAccountModal';
import { DeleteManualAccountModal } from '../components/accounts/DeleteManualAccountModal';
import type { ManualAccount } from '../../../shared/types';

export function MantineAccounts() {
  const queryClient = useQueryClient();
  const { openPlaidUpdate } = usePlaid();
  const [syncingAccount, setSyncingAccount] = useState<string | null>(null);
  const [accountToDisconnect, setAccountToDisconnect] = useState<{
    id: string;
    name: string;
    institution: string;
  } | null>(null);
  const [opened, { open, close }] = useDisclosure(false);
  const [editingAccount, setEditingAccount] = useState<ExtendedPlaidAccount | null>(null);
  const [nicknameModalOpened, { open: openNicknameModal, close: closeNicknameModal }] = useDisclosure(false);
  const [manualModalOpened, { open: openManualModal, close: closeManualModal }] = useDisclosure(false);
  const [editingManualAccount, setEditingManualAccount] = useState<ManualAccount | null>(null);
  const [manualAccountToDelete, setManualAccountToDelete] = useState<ManualAccount | null>(null);
  const [deleteManualOpened, { open: openDeleteManual, close: closeDeleteManual }] = useDisclosure(false);
  const [accountsTab, setAccountsTab] = useState(() => localStorage.getItem('accounts-active-tab') || 'connected');

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  const { data: manualAccounts } = useQuery({
    queryKey: ['manualAccounts'],
    queryFn: api.getManualAccounts,
  });

  const syncAccountMutation = useMutation({
    mutationFn: (accountId: string) => api.syncAccountTransactions(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setSyncingAccount(null);
      notifications.show({
        title: 'Success',
        message: 'Account synced successfully',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    },
    onError: (error: unknown) => {
      setSyncingAccount(null);
      notifications.show({
        title: 'Sync Failed',
        message: getApiErrorMessage(error, 'Failed to sync account'),
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: () => api.syncTransactions(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setSyncingAccount(null);

      if (data.warning) {
        notifications.show({
          title: 'Sync Partially Completed',
          message: data.warning,
          color: 'yellow',
          icon: <IconAlertCircle size={16} />,
          autoClose: 10000,
        });
      } else {
        notifications.show({
          title: 'Success',
          message: 'All accounts synced successfully',
          color: 'green',
          icon: <IconCheck size={16} />,
        });
      }
    },
    onError: (error: unknown) => {
      setSyncingAccount(null);
      notifications.show({
        title: 'Sync Failed',
        message: getApiErrorMessage(error, 'Failed to sync accounts'),
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
        message: getApiErrorMessage(error, 'Failed to disconnect account'),
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  const deleteManualMutation = useMutation({
    mutationFn: (id: string) => api.deleteManualAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manualAccounts'] });
      closeDeleteManual();
      notifications.show({
        title: 'Account Deleted',
        message: 'Manual account has been deleted',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete manual account',
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  const handleSync = (accountId: string) => {
    setSyncingAccount(accountId);
    syncAccountMutation.mutate(accountId);
  };

  const handleSyncAll = () => {
    setSyncingAccount('all');
    syncAllMutation.mutate();
  };

  const handleDisconnectClick = (account: { id: string; name: string; institution: string }) => {
    setAccountToDisconnect(account);
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

  const handleEditManualAccount = (account: ManualAccount) => {
    setEditingManualAccount(account);
    openManualModal();
  };

  const handleCloseManualModal = () => {
    closeManualModal();
    setEditingManualAccount(null);
  };

  const handleAddManualAccount = () => {
    setEditingManualAccount(null);
    openManualModal();
  };

  const handleDeleteManualClick = (account: ManualAccount) => {
    setManualAccountToDelete(account);
    openDeleteManual();
  };

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="lg" px="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Accounts</Title>
          <Text c="dimmed" size="sm">
            Manage linked and manual accounts
          </Text>
        </div>
      </Group>

      <Tabs
        value={accountsTab}
        onChange={(val) => {
          const tab = val || 'connected';
          setAccountsTab(tab);
          localStorage.setItem('accounts-active-tab', tab);
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="connected" leftSection={<IconLink size={16} />}>
            Connected{accounts && accounts.length > 0 ? ` (${accounts.length})` : ''}
          </Tabs.Tab>
          <Tabs.Tab value="manual" leftSection={<IconWallet size={16} />}>
            Manual{manualAccounts && manualAccounts.length > 0 ? ` (${manualAccounts.length})` : ''}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="connected" pt="lg">
          <Stack gap="lg">
            {accounts && accounts.length > 0 && (
              <Group justify="flex-end">
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

            {accounts && accounts.length > 0 ? (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                {accounts.map((account) => (
                  <ConnectedAccountCard
                    key={account.id}
                    account={account}
                    isSyncing={syncingAccount === account.id}
                    onSync={handleSync}
                    onReauth={openPlaidUpdate}
                    onEditNickname={handleEditNickname}
                    onDisconnect={handleDisconnectClick}
                  />
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
        </Tabs.Panel>

        <Tabs.Panel value="manual" pt="lg">
          <Stack gap="lg">
            <Group justify="flex-end">
              <Button leftSection={<IconPlus size={16} />} onClick={handleAddManualAccount}>
                Add Account
              </Button>
            </Group>

            {manualAccounts && manualAccounts.length > 0 ? (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                {manualAccounts.map((account) => (
                  <ManualAccountCard
                    key={account.id}
                    account={account}
                    onEdit={handleEditManualAccount}
                    onDelete={handleDeleteManualClick}
                  />
                ))}
              </SimpleGrid>
            ) : (
              <Center>
                <Card padding="xl" radius="md" withBorder style={{ maxWidth: 400, width: '100%' }}>
                  <Stack align="center" gap="md">
                    <ThemeIcon color="gray" variant="light" size={80} radius="xl">
                      <IconWallet size={40} />
                    </ThemeIcon>
                    <Text size="lg" fw={600}>No manual accounts</Text>
                    <Text size="sm" c="dimmed" ta="center">
                      Add assets like your home, vehicles, or retirement accounts to get a complete net worth picture.
                    </Text>
                    <Button leftSection={<IconPlus size={16} />} onClick={handleAddManualAccount}>
                      Add Account
                    </Button>
                  </Stack>
                </Card>
              </Center>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <DeleteManualAccountModal
        opened={deleteManualOpened}
        onClose={closeDeleteManual}
        onConfirm={() => manualAccountToDelete && deleteManualMutation.mutate(manualAccountToDelete.id)}
        isPending={deleteManualMutation.isPending}
        target={manualAccountToDelete}
      />

      <DisconnectAccountModal
        opened={opened}
        onClose={close}
        onConfirm={handleConfirmDisconnect}
        isPending={disconnectMutation.isPending}
        target={accountToDisconnect}
      />

      <AccountNicknameModal
        account={editingAccount}
        opened={nicknameModalOpened}
        onClose={handleCloseNicknameModal}
      />

      <ManualAccountModal
        opened={manualModalOpened}
        onClose={handleCloseManualModal}
        account={editingManualAccount}
      />
    </Stack>
  );
}
