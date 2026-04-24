import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Menu,
  Paper,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCreditCard,
  IconDots,
  IconEdit,
  IconLogin,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { formatCurrency } from '../../utils/formatters';
import type { ExtendedPlaidAccount } from '../../lib/api';

export interface ConnectedAccountCardProps {
  account: ExtendedPlaidAccount;
  isSyncing: boolean;
  onSync: (accountId: string) => void;
  onReauth: (accountId: string) => void;
  onEditNickname: (account: ExtendedPlaidAccount) => void;
  onDisconnect: (account: { id: string; name: string; institution: string }) => void;
}

export function ConnectedAccountCard({
  account,
  isSyncing,
  onSync,
  onReauth,
  onEditNickname,
  onDisconnect,
}: ConnectedAccountCardProps) {
  const requiresReauth = account.status === 'requires_reauth';

  return (
    <Card
      padding="lg"
      radius="md"
      withBorder
      style={requiresReauth ? { borderColor: 'var(--mantine-color-orange-6)', borderWidth: 2 } : undefined}
    >
      {requiresReauth && (
        <Badge color="orange" variant="filled" size="sm" mb="sm" leftSection={<IconAlertCircle size={12} />}>
          Sign-in Required
        </Badge>
      )}
      <Group justify="space-between" mb="md">
        <Group>
          <ThemeIcon color={requiresReauth ? 'orange' : 'blue'} variant="light" size="xl" radius="md">
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
                  onClick={() => onEditNickname(account)}
                  aria-label="Edit nickname"
                >
                  <IconEdit size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <Text size="xs" c="dimmed">
              {account.nickname ? 'Official: ' : ''}
              {account.officialName || account.accountName || account.name}
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
              onClick={() => onSync(account.id)}
              loading={isSyncing}
              aria-label="Sync transactions"
            >
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Account menu">
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {requiresReauth && (
                <Menu.Item
                  color="orange"
                  leftSection={<IconLogin size={16} />}
                  onClick={() => onReauth(account.id)}
                >
                  Sign in to Bank
                </Menu.Item>
              )}
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={() =>
                  onDisconnect({ id: account.id, name: account.name, institution: account.institution })
                }
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
  );
}
