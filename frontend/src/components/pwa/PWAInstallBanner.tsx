import { useEffect, useState, useCallback } from 'react';
import { Notification, Button, Group } from '@mantine/core';
import { IconDownload, IconX } from '@tabler/icons-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Already installed — standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setDeferredPrompt(null);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  return (
    <Notification
      withCloseButton={false}
      style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 1000, maxWidth: 360 }}
      title="Install Budget App"
      icon={<IconDownload size={18} />}
    >
      Install for a better experience with quick access from your home screen.
      <Group mt="xs" gap="xs">
        <Button
          size="xs"
          variant="filled"
          leftSection={<IconDownload size={14} />}
          onClick={handleInstall}
        >
          Install
        </Button>
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconX size={14} />}
          onClick={handleDismiss}
        >
          Not now
        </Button>
      </Group>
    </Notification>
  );
}
