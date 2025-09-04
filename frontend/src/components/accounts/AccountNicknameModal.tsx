import { useState, useEffect } from 'react';
import { Modal, TextInput, Button, Group, Text, Stack } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api } from '../../lib/api';
import type { ExtendedPlaidAccount } from '../../lib/api';

interface AccountNicknameModalProps {
  account: ExtendedPlaidAccount | null;
  opened: boolean;
  onClose: () => void;
}

export function AccountNicknameModal({ account, opened, onClose }: AccountNicknameModalProps) {
  const [nickname, setNickname] = useState('');
  const queryClient = useQueryClient();

  // Update nickname when account changes
  useEffect(() => {
    if (account) {
      setNickname(account.nickname || '');
    }
  }, [account]);

  const updateMutation = useMutation({
    mutationFn: ({ accountId, nickname }: { accountId: string; nickname: string | null }) =>
      api.updateAccountNickname(accountId, nickname),
    onSuccess: () => {
      notifications.show({
        title: 'Success',
        message: 'Account nickname updated',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      onClose();
    },
    onError: (error: unknown) => {
      notifications.show({
        title: 'Error',
        message: (error as Error).message || 'Failed to update nickname',
        color: 'red',
      });
    },
  });

  const handleSave = () => {
    if (!account) return;
    
    // Send null if nickname is empty (to clear it)
    const nicknameToSave = nickname.trim() || null;
    updateMutation.mutate({ accountId: account.id, nickname: nicknameToSave });
  };

  const handleClear = () => {
    setNickname('');
  };

  if (!account) return null;

  const officialName = account.officialName || account.accountName || account.name;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit Account Nickname"
      size="md"
    >
      <Stack gap="md">
        <div>
          <Text size="sm" c="dimmed">Official Name</Text>
          <Text fw={500}>{officialName}</Text>
          {account.mask && (
            <Text size="sm" c="dimmed">••••{account.mask}</Text>
          )}
        </div>

        <TextInput
          label="Nickname"
          placeholder="Enter a custom nickname for this account"
          value={nickname}
          onChange={(e) => setNickname(e.currentTarget.value)}
          maxLength={50}
          description={`${nickname.length}/50 characters`}
        />

        <Group justify="space-between">
          <Button
            variant="subtle"
            color="gray"
            onClick={handleClear}
            disabled={!nickname}
          >
            Clear
          </Button>
          <Group>
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              loading={updateMutation.isPending}
            >
              Save
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}