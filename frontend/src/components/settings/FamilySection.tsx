import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Center,
  Code,
  CopyButton,
  Divider,
  Group,
  Loader,
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
import {
  IconCheck,
  IconCopy,
  IconDeviceFloppy,
  IconTrash,
  IconUserPlus,
} from '@tabler/icons-react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api';
import type { Family } from '../../../../shared/types';
import { UserColorDot } from '../common/UserColorDot';

export function FamilySection() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: familyData, isLoading } = useQuery({
    queryKey: ['family'],
    queryFn: () => api.getFamily(),
  });

  const family: Family | undefined = familyData?.family;

  if (isLoading) {
    return (
      <Card withBorder>
        <Title order={4} mb="md">Family</Title>
        <Center py="md"><Loader size="sm" /></Center>
      </Card>
    );
  }

  if (!family) {
    return (
      <Card withBorder>
        <Title order={4} mb="md">Family</Title>
        <Text c="dimmed">No family found</Text>
      </Card>
    );
  }

  return (
    <Card withBorder>
      <Title order={4} mb="md">Family</Title>
      <Stack gap="md">
        <FamilyNameEditor family={family} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['family'] })} />
        <Divider />
        <MemberList family={family} currentUserId={user?.id} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['family'] })} />
        <Divider />
        <InviteSection />
      </Stack>
    </Card>
  );
}

function FamilyNameEditor({ family, onUpdate }: { family: Family; onUpdate: () => void }) {
  const [name, setName] = useState(family.name);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.updateFamilyName(name.trim());
      onUpdate();
      notifications.show({ message: 'Family name updated', color: 'green' });
    } catch {
      notifications.show({ message: 'Failed to update family name', color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Group align="flex-end">
      <TextInput
        label="Family Name"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        style={{ flex: 1 }}
      />
      <Button
        size="sm"
        leftSection={<IconDeviceFloppy size={16} />}
        onClick={handleSave}
        loading={saving}
        disabled={!name.trim() || name.trim() === family.name}
      >
        Save
      </Button>
    </Group>
  );
}

function MemberList({ family, currentUserId, onUpdate }: { family: Family; currentUserId?: string; onUpdate: () => void }) {
  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.removeFamilyMember(userId),
    onSuccess: () => {
      onUpdate();
      notifications.show({ message: 'Member removed', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Failed to remove member', color: 'red' });
    },
  });

  const handleRemove = (userId: string, displayName: string) => {
    modals.openConfirmModal({
      title: 'Remove family member',
      children: (
        <Text size="sm">
          Are you sure you want to remove <strong>{displayName}</strong> from the family?
          They will need a new invitation to rejoin.
        </Text>
      ),
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => removeMutation.mutate(userId),
    });
  };

  return (
    <>
      <Text fw={500} size="sm">Members</Text>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Joined</Table.Th>
            <Table.Th style={{ width: 60 }} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {family.members.map((member) => (
            <Table.Tr key={member.userId}>
              <Table.Td>
                <Group gap="xs" wrap="nowrap">
                  <UserColorDot user={member} />
                  <span>
                    {member.displayName}
                    {member.userId === currentUserId && (
                      <Text span c="dimmed" size="xs"> (you)</Text>
                    )}
                  </span>
                </Group>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {new Date(member.joinedAt).toLocaleDateString()}
                </Text>
              </Table.Td>
              <Table.Td>
                {family.members.length > 1 && member.userId !== currentUserId && (
                  <Tooltip label="Remove member">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => handleRemove(member.userId, member.displayName)}
                      loading={removeMutation.isPending}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}

function InviteSection() {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () => api.createInvitation(),
    onSuccess: (data) => {
      setInviteCode(data.invitation.code);
      setExpiresAt(data.invitation.expiresAt);
    },
    onError: () => {
      notifications.show({ message: 'Failed to create invitation', color: 'red' });
    },
  });

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Text fw={500} size="sm">Invite a Member</Text>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconUserPlus size={14} />}
          onClick={() => inviteMutation.mutate()}
          loading={inviteMutation.isPending}
        >
          Generate Code
        </Button>
      </Group>

      {inviteCode && (
        <Alert variant="light" color="blue">
          <Stack gap="xs">
            <Text size="sm">Share this code with the person you want to invite:</Text>
            <Group>
              <Code style={{ fontSize: '1.1rem', letterSpacing: '0.1em' }}>{inviteCode}</Code>
              <CopyButton value={inviteCode}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Copied!' : 'Copy code'}>
                    <ActionIcon variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy}>
                      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
            {expiresAt && (
              <Text size="xs" c="dimmed">
                Expires {new Date(expiresAt).toLocaleString()}
              </Text>
            )}
            <Text size="xs" c="dimmed">
              They will enter this code during registration to join your family.
            </Text>
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}
