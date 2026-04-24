import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  Card,
  Center,
  Code,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { api } from '../../lib/api';
import type { AccountOwnerMapping } from '../../../../shared/types';
import { UserColorDot } from '../common/UserColorDot';

export function AccountOwnerMappingsSection() {
  const queryClient = useQueryClient();
  const [editingMapping, setEditingMapping] = useState<AccountOwnerMapping | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const { data: familyData } = useQuery({
    queryKey: ['family'],
    queryFn: () => api.getFamily(),
  });

  const { data: mappingsData, isLoading } = useQuery({
    queryKey: ['account-owner-mappings'],
    queryFn: () => api.getAccountOwnerMappings(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAccountOwnerMapping(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-owner-mappings'] });
      notifications.show({ message: 'Mapping deleted', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Failed to delete mapping', color: 'red' });
    },
  });

  const handleDelete = (mapping: AccountOwnerMapping) => {
    modals.openConfirmModal({
      title: 'Delete card owner mapping',
      children: (
        <Text size="sm">
          Remove the mapping for card <strong>{mapping.cardIdentifier}</strong> ({mapping.displayName})?
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteMutation.mutate(mapping.id),
    });
  };

  const members = familyData?.family?.members || [];

  return (
    <Card withBorder>
      <Group justify="space-between" mb="md">
        <Title order={4}>Card Owner Mappings</Title>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={() => setAddModalOpen(true)}
        >
          Add Mapping
        </Button>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Map the last 4 digits of a card number to a family member name.
        This controls the &quot;Purchased by&quot; display on transactions.
      </Text>

      {isLoading ? (
        <Center py="md"><Loader size="sm" /></Center>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Card Identifier</Table.Th>
              <Table.Th>Display Name</Table.Th>
              <Table.Th>Linked Member</Table.Th>
              <Table.Th style={{ width: 80 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(mappingsData?.mappings || []).map((mapping) => {
              const linkedMember = members.find(m => m.userId === mapping.linkedUserId);
              return (
                <Table.Tr key={mapping.id}>
                  <Table.Td><Code>{mapping.cardIdentifier}</Code></Table.Td>
                  <Table.Td>{mapping.displayName}</Table.Td>
                  <Table.Td>
                    {linkedMember ? (
                      <Group gap="xs" wrap="nowrap">
                        <UserColorDot user={linkedMember} />
                        <Text size="sm">{linkedMember.displayName}</Text>
                      </Group>
                    ) : (
                      <Text size="sm" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Tooltip label="Edit">
                        <ActionIcon variant="subtle" size="sm" onClick={() => setEditingMapping(mapping)}>
                          <IconPencil size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleDelete(mapping)}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {(!mappingsData?.mappings || mappingsData.mappings.length === 0) && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text c="dimmed" ta="center" size="sm">No mappings configured</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <MappingFormModal
        opened={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        members={members}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['account-owner-mappings'] })}
      />

      <MappingFormModal
        opened={!!editingMapping}
        onClose={() => setEditingMapping(null)}
        mapping={editingMapping ?? undefined}
        members={members}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['account-owner-mappings'] });
          setEditingMapping(null);
        }}
      />
    </Card>
  );
}

export function MappingFormModal({
  opened,
  onClose,
  mapping,
  members,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  mapping?: AccountOwnerMapping;
  members: Array<{ userId: string; displayName: string }>;
  onSaved: () => void;
}) {
  const [cardIdentifier, setCardIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [linkedUserId, setLinkedUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset form when modal opens or mapping changes
  useEffect(() => {
    if (opened) {
      setCardIdentifier(mapping?.cardIdentifier ?? '');
      setDisplayName(mapping?.displayName ?? '');
      setLinkedUserId(mapping?.linkedUserId ?? null);
    }
  }, [opened, mapping]);

  const handleSave = async () => {
    if (!cardIdentifier.trim() || !displayName.trim()) return;
    setSaving(true);
    try {
      if (mapping) {
        await api.updateAccountOwnerMapping(mapping.id, {
          cardIdentifier: cardIdentifier.trim(),
          displayName: displayName.trim(),
          linkedUserId,
        });
      } else {
        await api.createAccountOwnerMapping({
          cardIdentifier: cardIdentifier.trim(),
          displayName: displayName.trim(),
          ...(linkedUserId ? { linkedUserId } : {}),
        });
      }
      onSaved();
      onClose();
      notifications.show({ message: mapping ? 'Mapping updated' : 'Mapping created', color: 'green' });
    } catch {
      notifications.show({ message: 'Failed to save mapping', color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={mapping ? 'Edit Card Owner Mapping' : 'Add Card Owner Mapping'}
      key={mapping?.id || 'new'}
    >
      <Stack gap="sm">
        <TextInput
          label="Card Identifier"
          description="Last 4 digits of the card number"
          placeholder="1234"
          value={cardIdentifier}
          onChange={(e) => setCardIdentifier(e.currentTarget.value)}
          maxLength={20}
          required
        />
        <TextInput
          label="Display Name"
          placeholder="e.g., Jared"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
          required
        />
        <Select
          label="Linked Family Member"
          description="Optional — link this card to a family member"
          placeholder="Not linked"
          clearable
          data={members.map(m => ({ value: m.userId, label: m.displayName }))}
          value={linkedUserId}
          onChange={setLinkedUserId}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!cardIdentifier.trim() || !displayName.trim()}
          >
            {mapping ? 'Update' : 'Create'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
