import { useRegisterSW } from 'virtual:pwa-register/react';
import { Paper, Text, Button, Group, Stack } from '@mantine/core';
import { IconRefresh, IconX } from '@tabler/icons-react';
import { useState } from 'react';

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const [updating, setUpdating] = useState(false);

  if (!needRefresh) return null;

  const handleRefresh = async () => {
    setUpdating(true);
    try {
      await updateServiceWorker(true);
      // Fallback: if controllerchange doesn't fire within 2s, force reload
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error('[PWA] updateServiceWorker failed, forcing reload:', err);
      window.location.reload();
    }
  };

  return (
    <Paper
      withBorder
      shadow="md"
      p="md"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 1000,
        maxWidth: 360,
      }}
    >
      <Stack gap="xs">
        <Text fw={600}>Update available</Text>
        <Text size="sm" c="dimmed">A new version is available.</Text>
        <Group gap="xs">
          <Button
            size="xs"
            variant="filled"
            leftSection={<IconRefresh size={14} />}
            loading={updating}
            onClick={handleRefresh}
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
      </Stack>
    </Paper>
  );
}
