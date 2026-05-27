import {
  Table,
  ActionIcon,
  Group,
  Text,
  Center,
  Stack,
  Button,
  Card,
  SegmentedControl,
  Menu,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconTrash, IconShoppingBag, IconDots } from '@tabler/icons-react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../utils/formatters';
import type { StoredWishlistItem, WishlistStatus } from '../../../../shared/types';

// ---------------------------------------------------------------------------
// Status segmented control (quick-toggle in the row)
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Agreed', value: 'AGREED' },
  { label: 'Rejected', value: 'REJECTED' },
];

interface StatusToggleProps {
  item: StoredWishlistItem;
}

function StatusToggle({ item }: StatusToggleProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (status: WishlistStatus) =>
      api.updateWishlistItem(item.id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    },
    onError: () => {
      notifications.show({
        title: 'Failed to update status',
        message: 'An error occurred. Please try again.',
        color: 'red',
      });
    },
  });

  return (
    <SegmentedControl
      size="xs"
      data={STATUS_OPTIONS}
      value={item.status}
      onChange={(v) => mutation.mutate(v as WishlistStatus)}
      disabled={mutation.isPending}
    />
  );
}

// ---------------------------------------------------------------------------
// WishlistTable props
// ---------------------------------------------------------------------------

interface WishlistTableProps {
  items: StoredWishlistItem[];
  /** categoryId → display label (parent → child or name) */
  categoryLabels: Map<string, string>;
  onEdit: (item: StoredWishlistItem) => void;
  onAddNew: () => void;
}

// ---------------------------------------------------------------------------
// Delete helper (used by both desktop and mobile rows)
// ---------------------------------------------------------------------------

function useDeleteItem() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => api.deleteWishlistItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      notifications.show({
        title: 'Item deleted',
        message: 'Wishlist item removed.',
        color: 'green',
      });
    },
    onError: () => {
      notifications.show({
        title: 'Failed to delete',
        message: 'An error occurred. Please try again.',
        color: 'red',
      });
    },
  });

  const confirmDelete = (item: StoredWishlistItem) => {
    modals.openConfirmModal({
      title: 'Delete wishlist item?',
      children: (
        <Text size="sm">
          Remove <strong>{item.name}</strong>? This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => mutation.mutate(item.id),
    });
  };

  return { confirmDelete, isPending: mutation.isPending };
}

// ---------------------------------------------------------------------------
// Mobile card layout
// ---------------------------------------------------------------------------

function MobileCard({
  item,
  categoryLabel,
  onEdit,
}: {
  item: StoredWishlistItem;
  categoryLabel: string;
  onEdit: (item: StoredWishlistItem) => void;
}) {
  const { confirmDelete } = useDeleteItem();

  return (
    <Card withBorder padding="sm" radius="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size="sm" truncate>
            {item.name}
          </Text>
          <Text size="xs" c="dimmed">
            {categoryLabel} · {item.estimatedMonth}
          </Text>
          <Text size="sm" fw={500}>
            {formatCurrency(item.estimatedAmount, true)}
          </Text>
        </Stack>
        <Menu withinPortal position="bottom-end" shadow="sm">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" size="sm">
              <IconDots size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => onEdit(item)}>
              Edit
            </Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => confirmDelete(item)}
            >
              Delete
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <StatusToggle item={item} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function WishlistTable({ items, categoryLabels, onEdit, onAddNew }: WishlistTableProps) {
  const isMobile = useMediaQuery('(max-width: 48em)', false, { getInitialValueInEffect: false });
  const { confirmDelete } = useDeleteItem();

  if (items.length === 0) {
    return (
      <Center py="xl">
        <Stack align="center" gap="md">
          <IconShoppingBag size={48} color="var(--mantine-color-dimmed)" />
          <Text c="dimmed">No wishlist items yet. Add one to get started.</Text>
          <Button onClick={onAddNew}>Add Wishlist Item</Button>
        </Stack>
      </Center>
    );
  }

  if (isMobile) {
    return (
      <Stack gap="xs">
        {items.map((item) => (
          <MobileCard
            key={item.id}
            item={item}
            categoryLabel={categoryLabels.get(item.categoryId) ?? item.categoryId}
            onEdit={onEdit}
          />
        ))}
      </Stack>
    );
  }

  return (
    <Table striped highlightOnHover withTableBorder withColumnBorders>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>Amount</Table.Th>
          <Table.Th>Month</Table.Th>
          <Table.Th>Category</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th style={{ width: 80 }}>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {items.map((item) => (
          <Table.Tr key={item.id}>
            <Table.Td>
              <Text size="sm" fw={500}>
                {item.name}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{formatCurrency(item.estimatedAmount, true)}</Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{item.estimatedMonth}</Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{categoryLabels.get(item.categoryId) ?? item.categoryId}</Text>
            </Table.Td>
            <Table.Td>
              <StatusToggle item={item} />
            </Table.Td>
            <Table.Td>
              <Group gap="xs" justify="center">
                <Tooltip label="Edit" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="blue"
                    onClick={() => onEdit(item)}
                    aria-label={`Edit ${item.name}`}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Delete" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => confirmDelete(item)}
                    aria-label={`Delete ${item.name}`}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
