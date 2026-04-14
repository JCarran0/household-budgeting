import { useState, useEffect } from 'react';
import { Notification } from '@mantine/core';
import { IconWifiOff } from '@tabler/icons-react';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <Notification
      withCloseButton={false}
      color="orange"
      style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, maxWidth: 360 }}
      title="You're offline"
      icon={<IconWifiOff size={18} />}
    >
      Connect to the internet to sync your budget data.
    </Notification>
  );
}
