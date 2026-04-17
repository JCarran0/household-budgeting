import { useState, useEffect } from 'react';
import {
  Alert,
  Button,
  Group,
  Stack,
  Text,
  Badge,
  Loader,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBell,
  IconBellOff,
  IconAlertCircle,
  IconBellCheck,
} from '@tabler/icons-react';
import { api } from '../../lib/api';

// ---------------------------------------------------------------------------
// VAPID key helper
// ---------------------------------------------------------------------------

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NotificationPermissionProps {
  /** Called when a subscription is successfully registered or removed */
  onSubscriptionChange?: (subscribed: boolean) => void;
}

export function NotificationPermission({ onSubscriptionChange }: NotificationPermissionProps) {
  // Guard: Notification API not supported (SSR, old browser)
  if (typeof Notification === 'undefined') {
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="gray" variant="light">
        Push notifications are not supported by this browser.
      </Alert>
    );
  }

  return <NotificationPermissionInner onSubscriptionChange={onSubscriptionChange} />;
}

function NotificationPermissionInner({
  onSubscriptionChange,
}: NotificationPermissionProps) {
  const [permissionState, setPermissionState] = useState<NotificationPermission>(
    Notification.permission,
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(true);

  // Check whether this device already has an active push subscription
  useEffect(() => {
    let cancelled = false;

    async function checkExistingSubscription() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setCheckingSubscription(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) {
          setIsSubscribed(existing !== null);
        }
      } catch {
        // Non-fatal — just assume not subscribed
      } finally {
        if (!cancelled) setCheckingSubscription(false);
      }
    }

    void checkExistingSubscription();
    return () => { cancelled = true; };
  }, []);

  const handleEnable = async () => {
    setIsLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermissionState(result);

      if (result !== 'granted') {
        setIsLoading(false);
        return;
      }

      // Push API guard
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        notifications.show({
          message: 'Push notifications are not supported in this browser.',
          color: 'orange',
        });
        setIsLoading(false);
        return;
      }

      // Fetch VAPID public key
      let publicKey: string;
      try {
        const response = await api.notifications.getVapidPublicKey();
        publicKey = response.publicKey;
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 503) {
          notifications.show({
            message: 'Push notifications not configured on server.',
            color: 'orange',
          });
        } else {
          notifications.show({
            message: 'Failed to retrieve server push key.',
            color: 'red',
          });
        }
        setIsLoading(false);
        return;
      }

      // Subscribe via Push API
      const registration = await navigator.serviceWorker.ready;
      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to backend
      const subscriptionJSON = pushSubscription.toJSON() as {
        endpoint?: string;
        expirationTime?: number | null;
        keys?: { p256dh?: string; auth?: string };
      };

      if (
        !subscriptionJSON.endpoint ||
        !subscriptionJSON.keys?.p256dh ||
        !subscriptionJSON.keys?.auth
      ) {
        notifications.show({ message: 'Invalid subscription data.', color: 'red' });
        setIsLoading(false);
        return;
      }

      await api.notifications.subscribe({
        endpoint: subscriptionJSON.endpoint,
        expirationTime: subscriptionJSON.expirationTime ?? null,
        keys: {
          p256dh: subscriptionJSON.keys.p256dh,
          auth: subscriptionJSON.keys.auth,
        },
      });

      setIsSubscribed(true);
      onSubscriptionChange?.(true);
      notifications.show({
        message: 'Notifications enabled for this device.',
        color: 'green',
      });
    } catch {
      notifications.show({
        message: 'Failed to enable notifications. Please try again.',
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async () => {
    setIsLoading(true);
    try {
      if (!('serviceWorker' in navigator)) {
        setIsLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await api.notifications.unsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
      onSubscriptionChange?.(false);
      notifications.show({
        message: 'Notifications disabled for this device.',
        color: 'green',
      });
    } catch {
      notifications.show({
        message: 'Failed to disable notifications.',
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingSubscription) {
    return <Loader size="xs" />;
  }

  // --- Denied ---
  if (permissionState === 'denied') {
    return (
      <Alert icon={<IconBellOff size={16} />} color="orange" variant="light">
        Notifications are blocked in browser settings. To enable them, update your
        browser permissions for this site.
      </Alert>
    );
  }

  // --- Granted & subscribed ---
  if (permissionState === 'granted' && isSubscribed) {
    return (
      <Group>
        <Badge color="green" leftSection={<IconBellCheck size={12} />} variant="light">
          This device is subscribed
        </Badge>
        <Button
          size="xs"
          variant="subtle"
          color="red"
          leftSection={<IconBellOff size={14} />}
          onClick={handleDisable}
          loading={isLoading}
        >
          Disable on this device
        </Button>
      </Group>
    );
  }

  // --- Granted but not subscribed ---
  if (permissionState === 'granted' && !isSubscribed) {
    return (
      <Group>
        <Badge color="orange" leftSection={<IconBellOff size={12} />} variant="light">
          Not subscribed on this device
        </Badge>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconBell size={14} />}
          onClick={handleEnable}
          loading={isLoading}
        >
          Subscribe this device
        </Button>
      </Group>
    );
  }

  // --- Default (not yet asked) ---
  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        Enable push notifications to receive alerts about sync failures, budget
        thresholds, and large transactions — even when the app is closed.
      </Text>
      <Group>
        <Button
          size="sm"
          leftSection={<IconBell size={16} />}
          onClick={handleEnable}
          loading={isLoading}
        >
          Enable Notifications
        </Button>
      </Group>
    </Stack>
  );
}
