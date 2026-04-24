import { Button, Group, Modal, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertCircle, IconTrash } from '@tabler/icons-react';

export interface DisconnectAccountTarget {
  id: string;
  name: string;
  institution: string;
}

export interface DisconnectAccountModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  target: DisconnectAccountTarget | null;
}

export function DisconnectAccountModal({
  opened,
  onClose,
  onConfirm,
  isPending,
  target,
}: DisconnectAccountModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Disconnect Account" centered>
      <Stack gap="md">
        <Group>
          <ThemeIcon color="red" variant="light" size="xl" radius="xl">
            <IconAlertCircle size={24} />
          </ThemeIcon>
          <div style={{ flex: 1 }}>
            <Text size="sm" fw={600}>
              Are you sure you want to disconnect this account?
            </Text>
            {target && (
              <Text size="sm" c="dimmed">
                {target.name} from {target.institution}
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
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={onConfirm}
            loading={isPending}
            leftSection={<IconTrash size={16} />}
          >
            Disconnect Account
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
