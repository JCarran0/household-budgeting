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
import { hasExpiringConsent, hasStaleTransactions } from './accountHealth';
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
  // An Item-level failure the user cannot clear by signing in again. Kept
  // distinct from requiresReauth so we warn without giving a false instruction
  // — telling someone to re-authenticate when that won't help is worse than
  // saying nothing (TD-022).
  const isDegraded = account.status === 'error';
  const needsAttention = requiresReauth || isDegraded;
  const attentionColor = requiresReauth ? 'orange' : 'yellow';

  return (
    <Card
      padding="lg"
      radius="md"
      withBorder
      style={
        needsAttention
          ? { borderColor: `var(--mantine-color-${attentionColor}-6)`, borderWidth: 2 }
          : undefined
      }
    >
      {needsAttention && (
        <Badge color={attentionColor} variant="filled" size="sm" mb="sm" leftSection={<IconAlertCircle size={12} />}>
          {requiresReauth ? 'Sign-in Required' : 'Connection Issue'}
        </Badge>
      )}
      <Group justify="space-between" mb="md">
        <Group>
          <ThemeIcon color={needsAttention ? attentionColor : 'blue'} variant="light" size="xl" radius="md">
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
              {/*
                Always available, not just when status === 'requires_reauth'.
                An Item can stop delivering transactions while Plaid still reports
                it healthy (no Item error, valid consent), which leaves the account
                'active' and used to hide this action — the one remedy — exactly
                when it was needed. The orange badge/border stay gated on
                requiresReauth so the alert keeps its meaning; only the action is
                ungated. Re-linking on demand is also how you refresh a consent
                window before it lapses.
              */}
              <Menu.Item
                color={requiresReauth ? 'orange' : undefined}
                leftSection={<IconLogin size={16} />}
                onClick={() => onReauth(account.id)}
              >
                Sign in to Bank
              </Menu.Item>
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

      {/*
        Plaid's own transaction-pull recency, shown only when it has gone stale.
        "Last synced" below cannot surface this: it records when we called
        Plaid, which keeps succeeding even while the institution has stopped
        delivering. That gap is what hid a 19-day outage (TD-021).
      */}
      {hasStaleTransactions(account) && (
        <Text size="xs" c="orange" fw={500} mt="md">
          No new transactions from the bank since{' '}
          {formatDistanceToNow(new Date(account.lastTransactionUpdate!), { addSuffix: true })} — try
          "Sign in to Bank" if this looks wrong.
        </Text>
      )}

      {hasExpiringConsent(account) && (
        <Text size="xs" c="orange" fw={500} mt={hasStaleTransactions(account) ? 4 : 'md'}>
          Bank access expires{' '}
          {formatDistanceToNow(new Date(account.consentExpirationTime!), { addSuffix: true })} — sign
          in again to keep syncing.
        </Text>
      )}

      <Text size="xs" c="dimmed" mt="md">
        Last synced:{' '}
        {account.lastSynced
          ? formatDistanceToNow(new Date(account.lastSynced), { addSuffix: true })
          : 'Never'}
      </Text>
    </Card>
  );
}
