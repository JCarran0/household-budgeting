import { Button, Group, Modal, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertCircle, IconTrash } from '@tabler/icons-react';
import { CATEGORY_LABELS } from './accountCategories';
import type { ManualAccount } from '../../../../shared/types';

export interface DeleteManualAccountModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  target: ManualAccount | null;
}

export function DeleteManualAccountModal({
  opened,
  onClose,
  onConfirm,
  isPending,
  target,
}: DeleteManualAccountModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Delete Manual Account" centered>
      <Stack gap="md">
        <Group>
          <ThemeIcon color="red" variant="light" size="xl" radius="xl">
            <IconAlertCircle size={24} />
          </ThemeIcon>
          <div style={{ flex: 1 }}>
            <Text size="sm" fw={600}>
              Are you sure you want to delete this account?
            </Text>
            {target && (
              <Text size="sm" c="dimmed">
                {target.name} ({CATEGORY_LABELS[target.category]})
              </Text>
            )}
          </div>
        </Group>
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
            Delete Account
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
