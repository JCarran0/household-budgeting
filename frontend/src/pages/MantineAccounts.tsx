import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ExtendedPlaidAccount } from '../lib/api';
import { PlaidButton } from '../components/PlaidButton';
import { usePlaid } from '../hooks/usePlaidLink';
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
  Tabs,
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
  IconLogin,
  IconPlus,
  IconHome2,
  IconCar,
  IconPigMoney,
  IconChartLine,
  IconCurrencyDollar,
  IconCurrencyBitcoin,
  IconWallet,
  IconReceipt,
  IconLink,
} from '@tabler/icons-react';
import { AccountNicknameModal } from '../components/accounts/AccountNicknameModal';
import { ManualAccountModal } from '../components/accounts/ManualAccountModal';
import { formatCurrency } from '../utils/formatters';
import type { ManualAccount, ManualAccountCategory } from '../../../shared/types';

const CATEGORY_ICON_MAP: Record<ManualAccountCategory, typeof IconWallet> = {
  real_estate: IconHome2,
  vehicle: IconCar,
  retirement: IconPigMoney,
  brokerage: IconChartLine,
  cash: IconCurrencyDollar,
  crypto: IconCurrencyBitcoin,
  other_asset: IconWallet,
  mortgage: IconHome2,
  auto_loan: IconCar,
  student_loan: IconReceipt,
  personal_loan: IconReceipt,
  other_liability: IconReceipt,
};

const CATEGORY_LABELS: Record<ManualAccountCategory, string> = {
  real_estate: 'Real Estate',
  vehicle: 'Vehicle',
  retirement: 'Retirement',
  brokerage: 'Brokerage',
  cash: 'Cash / Savings',
  crypto: 'Crypto',
  other_asset: 'Other Asset',
  mortgage: 'Mortgage',
  auto_loan: 'Auto Loan',
  student_loan: 'Student Loan',
  personal_loan: 'Personal Loan',
  other_liability: 'Other Liability',
};

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

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: api.getAccounts,
  });

  const { data: manualAccounts } = useQuery({
    queryKey: ['manualAccounts'],
    queryFn: api.getManualAccounts,
  });

  const handleReauth = (accountId: string) => {
    openPlaidUpdate(accountId);
  };

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
        message: (error as { message?: string })?.message || 'Failed to sync account',
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
        message: (error as { message?: string })?.message || 'Failed to sync accounts',
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

      <Tabs defaultValue="connected">
        <Tabs.List>
          <Tabs.Tab value="connected" leftSection={<IconLink size={16} />}>
            Connected{accounts && accounts.length > 0 ? ` (${accounts.length})` : ''}
          </Tabs.Tab>
          <Tabs.Tab value="manual" leftSection={<IconWallet size={16} />}>
            Manual{manualAccounts && manualAccounts.length > 0 ? ` (${manualAccounts.length})` : ''}
          </Tabs.Tab>
        </Tabs.List>

        {/* Connected Accounts Tab */}
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
                  <Card
                    key={account.id}
                    padding="lg"
                    radius="md"
                    withBorder
                    style={account.status === 'requires_reauth' ? { borderColor: 'var(--mantine-color-orange-6)', borderWidth: 2 } : undefined}
                  >
                    {account.status === 'requires_reauth' && (
                      <Badge color="orange" variant="filled" size="sm" mb="sm" leftSection={<IconAlertCircle size={12} />}>
                        Sign-in Required
                      </Badge>
                    )}
                    <Group justify="space-between" mb="md">
                      <Group>
                        <ThemeIcon color={account.status === 'requires_reauth' ? 'orange' : 'blue'} variant="light" size="xl" radius="md">
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
                            {account.status === 'requires_reauth' && (
                              <Menu.Item
                                color="orange"
                                leftSection={<IconLogin size={16} />}
                                onClick={() => handleReauth(account.id)}
                              >
                                Sign in to Bank
                              </Menu.Item>
                            )}
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
          </Stack>
        </Tabs.Panel>

        {/* Manual Accounts Tab */}
        <Tabs.Panel value="manual" pt="lg">
          <Stack gap="lg">
            <Group justify="flex-end">
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={handleAddManualAccount}
              >
                Add Account
              </Button>
            </Group>

            {manualAccounts && manualAccounts.length > 0 ? (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                {manualAccounts.map((account) => {
                  const CategoryIcon = CATEGORY_ICON_MAP[account.category];
                  return (
                    <Card key={account.id} padding="lg" radius="md" withBorder>
                      <Group justify="space-between" mb="md">
                        <Group>
                          <ThemeIcon
                            color={account.isAsset ? 'teal' : 'orange'}
                            variant="light"
                            size="xl"
                            radius="md"
                          >
                            <CategoryIcon size={24} />
                          </ThemeIcon>
                          <div>
                            <Text size="lg" fw={600}>{account.name}</Text>
                            <Group gap="xs" mt={4}>
                              <Badge
                                color={account.isAsset ? 'teal' : 'orange'}
                                variant="light"
                                size="sm"
                              >
                                {account.isAsset ? 'Asset' : 'Liability'}
                              </Badge>
                              <Badge color="gray" variant="light" size="sm">
                                {CATEGORY_LABELS[account.category]}
                              </Badge>
                            </Group>
                          </div>
                        </Group>
                        <Menu position="bottom-end" withinPortal>
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" size="lg">
                              <IconDots size={18} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconEdit size={16} />}
                              onClick={() => handleEditManualAccount(account)}
                            >
                              Edit Account
                            </Menu.Item>
                            <Menu.Item
                              color="red"
                              leftSection={<IconTrash size={16} />}
                              onClick={() => {
                                setManualAccountToDelete(account);
                                openDeleteManual();
                              }}
                            >
                              Delete Account
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>

                      <Paper p="md" radius="md" withBorder>
                        <Group justify="space-between">
                          <div>
                            <Text size="sm" c="dimmed">Category</Text>
                            <Text fw={500}>{CATEGORY_LABELS[account.category]}</Text>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <Text size="sm" c="dimmed">Current Value</Text>
                            <Text size="xl" fw={700}>
                              {formatCurrency(account.currentBalance)}
                            </Text>
                          </div>
                        </Group>
                      </Paper>

                      {account.notes && (
                        <Text size="xs" c="dimmed" mt="md">
                          {account.notes}
                        </Text>
                      )}

                      <Text size="xs" c="dimmed" mt={account.notes ? 'xs' : 'md'}>
                        Last updated:{' '}
                        {formatDistanceToNow(new Date(account.updatedAt), { addSuffix: true })}
                      </Text>
                    </Card>
                  );
                })}
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
                    <Button
                      leftSection={<IconPlus size={16} />}
                      onClick={handleAddManualAccount}
                    >
                      Add Account
                    </Button>
                  </Stack>
                </Card>
              </Center>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {/* Delete Manual Account Confirmation */}
      <Modal
        opened={deleteManualOpened}
        onClose={closeDeleteManual}
        title="Delete Manual Account"
        centered
      >
        <Stack gap="md">
          <Group>
            <ThemeIcon color="red" variant="light" size="xl" radius="xl">
              <IconAlertCircle size={24} />
            </ThemeIcon>
            <div style={{ flex: 1 }}>
              <Text size="sm" fw={600}>
                Are you sure you want to delete this account?
              </Text>
              {manualAccountToDelete && (
                <Text size="sm" c="dimmed">
                  {manualAccountToDelete.name} ({CATEGORY_LABELS[manualAccountToDelete.category]})
                </Text>
              )}
            </div>
          </Group>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeDeleteManual}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => manualAccountToDelete && deleteManualMutation.mutate(manualAccountToDelete.id)}
              loading={deleteManualMutation.isPending}
              leftSection={<IconTrash size={16} />}
            >
              Delete Account
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Disconnect Linked Account Confirmation */}
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

      {/* Manual Account Create/Edit Modal */}
      <ManualAccountModal
        opened={manualModalOpened}
        onClose={handleCloseManualModal}
        account={editingManualAccount}
      />
    </Stack>
  );
}
