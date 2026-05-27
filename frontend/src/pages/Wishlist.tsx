import { useState, useMemo } from 'react';
import { Container, Title, Group, Button, Text, Loader, Center, Alert } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconAlertCircle, IconShoppingBag } from '@tabler/icons-react';
import { api } from '../lib/api';
import { useCategoryOptions } from '../hooks/useCategoryOptions';
import { WishlistTable } from '../components/wishlist/WishlistTable';
import { WishlistItemModal } from '../components/wishlist/WishlistItemModal';
import { sortWishlistItems } from '../components/wishlist/wishlistSort';
import { formatCategoryPath } from '../../../shared/utils/categoryHelpers';
import type { StoredWishlistItem } from '../../../shared/types';

export function Wishlist() {
  const [editItem, setEditItem] = useState<StoredWishlistItem | undefined>(undefined);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  const {
    data: items,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['wishlist'],
    queryFn: () => api.getWishlistItems(),
  });

  const { categories } = useCategoryOptions({ enabled: true });

  const sortedItems = useMemo(
    () => sortWishlistItems(items ?? []),
    [items],
  );

  const categoryLabels = useMemo((): Map<string, string> => {
    if (!categories) return new Map();
    return new Map(
      categories.map((cat) => [cat.id, formatCategoryPath(cat.id, categories)]),
    );
  }, [categories]);

  const handleAddNew = () => {
    setEditItem(undefined);
    openModal();
  };

  const handleEdit = (item: StoredWishlistItem) => {
    setEditItem(item);
    openModal();
  };

  const handleClose = () => {
    closeModal();
    setEditItem(undefined);
  };

  return (
    <Container size="xl" py="md">
      <Group justify="space-between" align="center" mb="lg">
        <Group gap="sm">
          <IconShoppingBag size={28} />
          <Title order={2}>Wishlist</Title>
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={handleAddNew}>
          Add Wishlist Item
        </Button>
      </Group>

      {isLoading && (
        <Center py="xl">
          <Loader />
        </Center>
      )}

      {isError && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
          <Text>Failed to load wishlist items. Please try again.</Text>
        </Alert>
      )}

      {!isLoading && !isError && (
        <WishlistTable
          items={sortedItems}
          categoryLabels={categoryLabels}
          onEdit={handleEdit}
          onAddNew={handleAddNew}
        />
      )}

      <WishlistItemModal
        item={editItem}
        opened={modalOpened}
        onClose={handleClose}
      />
    </Container>
  );
}
