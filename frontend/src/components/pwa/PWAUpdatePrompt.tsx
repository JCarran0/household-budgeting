import { useRegisterSW } from 'virtual:pwa-register/react';
import { Notification, Button, Group } from '@mantine/core';
import { IconRefresh, IconX } from '@tabler/icons-react';

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <Notification
      withCloseButton={false}
      style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1000, maxWidth: 360 }}
      title="Update available"
      icon={<IconRefresh size={18} />}
    >
      A new version is available.
      <Group mt="xs" gap="xs">
        <Button
          size="xs"
          variant="filled"
          leftSection={<IconRefresh size={14} />}
          onClick={() => updateServiceWorker(true)}
        >
          Refresh
        </Button>
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconX size={14} />}
          onClick={() => setNeedRefresh(false)}
        >
          Dismiss
        </Button>
      </Group>
    </Notification>
  );
}
