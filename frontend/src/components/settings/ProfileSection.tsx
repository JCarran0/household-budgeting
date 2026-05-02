import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconDeviceFloppy } from '@tabler/icons-react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api';
import { USER_COLOR_PALETTE, userColor, type UserColor } from '../../utils/userColor';

export function ProfileSection() {
  const { user, updateDisplayName, updateColor } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [color, setColor] = useState<UserColor>(userColor(user));
  const [saving, setSaving] = useState(false);

  const currentColor = userColor(user);
  const nameChanged = displayName.trim() !== (user?.displayName || '');
  const colorChanged = color !== currentColor;
  const canSave = !!displayName.trim() && (nameChanged || colorChanged);

  const handleSave = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      await api.updateProfile(displayName.trim(), colorChanged ? color : undefined);
      if (nameChanged) updateDisplayName(displayName.trim());
      if (colorChanged) updateColor(color);
      notifications.show({ message: 'Profile updated', color: 'green' });
    } catch {
      notifications.show({ message: 'Failed to update profile', color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card withBorder>
      <Title order={4} mb="md">Profile</Title>
      <Stack gap="sm">
        <TextInput
          label="Username"
          value={user?.username || ''}
          readOnly
          variant="filled"
        />
        <TextInput
          label="Display Name"
          description="How you appear to other family members"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
        />
        <div>
          <Text size="sm" fw={500}>Identity color</Text>
          <Text size="xs" c="dimmed" mb="xs">
            Shown next to your name throughout the app so it's easy to tell family members apart.
          </Text>
          <Group gap="sm">
            {USER_COLOR_PALETTE.map((c) => {
              const selected = c === color;
              return (
                <Tooltip key={c} label={c} withArrow>
                  <ActionIcon
                    variant="filled"
                    color={c}
                    radius="xl"
                    size="xl"
                    aria-label={`Choose ${c}`}
                    aria-pressed={selected}
                    onClick={() => setColor(c)}
                    style={{
                      backgroundColor: `var(--mantine-color-${c}-6)`,
                      boxShadow: selected
                        ? `0 0 0 2px var(--mantine-color-body), 0 0 0 4px var(--mantine-color-${c}-6)`
                        : undefined,
                    }}
                  >
                    {selected ? <IconCheck size={20} stroke={3} /> : null}
                  </ActionIcon>
                </Tooltip>
              );
            })}
          </Group>
        </div>
        <Group justify="flex-end">
          <Button
            size="sm"
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSave}
            loading={saving}
            disabled={!canSave}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
