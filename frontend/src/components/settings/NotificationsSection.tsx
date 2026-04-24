import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Center,
  Divider,
  Group,
  Loader,
  NumberInput,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBell, IconDeviceFloppy } from '@tabler/icons-react';
import { api } from '../../lib/api';
import type { NotificationPreferences } from '../../../../shared/types';
import { NotificationPermission } from '../pwa/NotificationPermission';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  syncFailures: false,
  budgetAlerts: false,
  budgetAlertThreshold: 80,
  largeTransactions: false,
  largeTransactionThreshold: 500,
  billReminders: false,
};

export function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.notifications.getPreferences()
      .then((data) => {
        if (!cancelled) {
          setPrefs(data);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.notifications.updatePreferences(prefs);
      setPrefs(updated);
      notifications.show({ message: 'Notification preferences saved', color: 'green' });
    } catch {
      notifications.show({ message: 'Failed to save notification preferences', color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    // new Notification() is blocked on Android Chrome — must use SW registration
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('Test notification', {
        body: 'Family Tracker notifications are working!',
        icon: '/icons/icon-192x192.png',
      });
    } else {
      new Notification('Test notification', {
        body: 'Family Tracker notifications are working!',
        icon: '/icons/icon-192x192.png',
      });
    }
  };

  const canSendTest =
    typeof Notification !== 'undefined' && Notification.permission === 'granted';

  return (
    <Card withBorder>
      <Title order={4} mb="md">Notifications</Title>
      <Stack gap="md">
        {/* Device subscription status */}
        <NotificationPermission />

        <Divider />

        {/* Preference switches */}
        {!loaded ? (
          <Center py="sm"><Loader size="sm" /></Center>
        ) : (
          <Stack gap="sm">
            <Text fw={500} size="sm">Notification Types</Text>

            <Switch
              label="Sync failures"
              description="Alert when a bank account needs re-authentication"
              checked={prefs.syncFailures}
              onChange={(e) => setPrefs((p) => ({ ...p, syncFailures: e.currentTarget.checked }))}
            />

            <Stack gap="xs">
              <Switch
                label="Budget alerts"
                description="Alert when spending approaches your budget limit"
                checked={prefs.budgetAlerts}
                onChange={(e) => setPrefs((p) => ({ ...p, budgetAlerts: e.currentTarget.checked }))}
              />
              {prefs.budgetAlerts && (
                <NumberInput
                  label="Budget alert threshold (%)"
                  description="Alert when you've used this percentage of your budget"
                  value={prefs.budgetAlertThreshold}
                  onChange={(value) =>
                    setPrefs((p) => ({
                      ...p,
                      budgetAlertThreshold: typeof value === 'number' ? value : p.budgetAlertThreshold,
                    }))
                  }
                  min={1}
                  max={100}
                  suffix="%"
                  style={{ maxWidth: 200 }}
                />
              )}
            </Stack>

            <Stack gap="xs">
              <Switch
                label="Large transactions"
                description="Alert when a large transaction posts"
                checked={prefs.largeTransactions}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, largeTransactions: e.currentTarget.checked }))
                }
              />
              {prefs.largeTransactions && (
                <NumberInput
                  label="Large transaction threshold ($)"
                  description="Alert for transactions above this amount"
                  value={prefs.largeTransactionThreshold}
                  onChange={(value) =>
                    setPrefs((p) => ({
                      ...p,
                      largeTransactionThreshold:
                        typeof value === 'number' ? value : p.largeTransactionThreshold,
                    }))
                  }
                  min={0}
                  prefix="$"
                  style={{ maxWidth: 200 }}
                />
              )}
            </Stack>

            <Switch
              label="Bill reminders"
              description="Alert for upcoming bills (coming soon)"
              checked={prefs.billReminders}
              disabled
              onChange={(e) =>
                setPrefs((p) => ({ ...p, billReminders: e.currentTarget.checked }))
              }
            />
          </Stack>
        )}

        <Group justify="flex-end" mt="xs">
          {canSendTest && (
            <Button
              size="sm"
              variant="light"
              leftSection={<IconBell size={16} />}
              onClick={handleTestNotification}
            >
              Send test notification
            </Button>
          )}
          <Button
            size="sm"
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSave}
            loading={saving}
            disabled={!loaded}
          >
            Save Preferences
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
