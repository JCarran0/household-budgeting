import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Menu,
  Paper,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import { formatCurrency } from '../../utils/formatters';
import { CATEGORY_ICON_MAP, CATEGORY_LABELS } from './accountCategories';
import type { ManualAccount } from '../../../../shared/types';

export interface ManualAccountCardProps {
  account: ManualAccount;
  onEdit: (account: ManualAccount) => void;
  onDelete: (account: ManualAccount) => void;
}

export function ManualAccountCard({ account, onEdit, onDelete }: ManualAccountCardProps) {
  const CategoryIcon = CATEGORY_ICON_MAP[account.category];
  const tone = account.isAsset ? 'teal' : 'orange';

  return (
    <Card padding="lg" radius="md" withBorder>
      <Group justify="space-between" mb="md">
        <Group>
          <ThemeIcon color={tone} variant="light" size="xl" radius="md">
            <CategoryIcon size={24} />
          </ThemeIcon>
          <div>
            <Text size="lg" fw={600}>{account.name}</Text>
            <Group gap="xs" mt={4}>
              <Badge color={tone} variant="light" size="sm">
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
            <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Account menu">
              <IconDots size={18} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconEdit size={16} />} onClick={() => onEdit(account)}>
              Edit Account
            </Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => onDelete(account)}
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
}
