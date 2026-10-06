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
  Anchor,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconTrash, IconShoppingBag, IconDots, IconExternalLink } from '@tabler/icons-react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../utils/formatters';
import { hostLabel, isRenderableUrl } from './wishlistUrls';
import { StoredImage } from '../common/StoredImage';
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
// Links cell
// ---------------------------------------------------------------------------

/**
 * Renders an item's reference links, labelled by hostname so the destination is
 * visible before the click.
 *
 * SECURITY: `isRenderableUrl` re-checks the scheme the server already enforced.
 * A stored string is only ever turned into an href if it is http(s), so a value
 * that reached the file some other way cannot become a `javascript:` link.
 * `noopener noreferrer` keeps the destination from getting a handle on this
 * window or a Referer header.
 */
function WishlistLinks({ urls }: { urls: string[] }) {
  const renderable = urls.filter(isRenderableUrl);
  if (renderable.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }

  return (
    <Stack gap={2}>
      {renderable.map((url) => (
        <Tooltip key={url} label={url} withArrow multiline maw={320}>
          <Anchor
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <IconExternalLink size={12} />
            {hostLabel(url)}
          </Anchor>
        </Tooltip>
      ))}
    </Stack>
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
// Note
// ---------------------------------------------------------------------------

/**
 * Renders an item's note as a secondary line under its name. Deliberately not
 * its own column: a free-text note is the widest thing on the row, and an
 * eighth column would squeeze every other one. Truncated to a single line with
 * the full text in a tooltip.
 */
function WishlistNote({ notes }: { notes?: string }) {
  const trimmed = notes?.trim();
  if (!trimmed) return null;

  return (
    <Tooltip label={trimmed} withArrow multiline maw={360} position="bottom-start">
      <Text size="xs" c="dimmed" truncate data-testid="wishlist-note">
        {trimmed}
      </Text>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

const THUMB_SIZE = 40;

/**
 * The item's first photo, opening the item on click (no separate lightbox in
 * v1). Renders nothing for items without a photo, so rows that have none look
 * exactly as they did before images existed.
 */
function WishlistThumb({ item, onEdit }: { item: StoredWishlistItem; onEdit: (item: StoredWishlistItem) => void }) {
  const image = item.images?.[0];
  if (!image) return null;

  return (
    <UnstyledButton
      onClick={() => onEdit(item)}
      aria-label={`Open ${item.name}`}
      style={{ flexShrink: 0, lineHeight: 0 }}
    >
      <StoredImage imageId={image.id} alt={item.name} width={THUMB_SIZE} height={THUMB_SIZE} />
    </UnstyledButton>
  );
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
        <WishlistThumb item={item} onEdit={onEdit} />
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size="sm" truncate>
            {item.name}
          </Text>
          <WishlistNote notes={item.notes} />
          <Text size="xs" c="dimmed">
            {categoryLabel} · {item.estimatedMonth}
          </Text>
          <Text size="sm" fw={500}>
            {formatCurrency(item.estimatedAmount, true)}
          </Text>
          {(item.urls ?? []).length > 0 && <WishlistLinks urls={item.urls ?? []} />}
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
          <Table.Th>Links</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th style={{ width: 80 }}>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {items.map((item) => (
          <Table.Tr key={item.id}>
            <Table.Td style={{ maxWidth: 260 }}>
              <Group gap="sm" wrap="nowrap" align="center">
                <WishlistThumb item={item} onEdit={onEdit} />
                <Stack gap={0} style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500}>
                    {item.name}
                  </Text>
                  <WishlistNote notes={item.notes} />
                </Stack>
              </Group>
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
              <WishlistLinks urls={item.urls ?? []} />
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
