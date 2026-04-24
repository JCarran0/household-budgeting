import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Group,
  PasswordInput,
  Stack,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle } from '@tabler/icons-react';
import { api } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/api/errors';

export function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async () => {
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 15) {
      setError('Password must be at least 15 characters');
      return;
    }

    setSaving(true);
    try {
      await api.changePassword({ currentPassword, newPassword, confirmPassword });
      notifications.show({ message: 'Password changed successfully', color: 'green' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Failed to change password'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card withBorder>
      <Title order={4} mb="md">Change Password</Title>
      <Stack gap="sm">
        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}
        <PasswordInput
          label="Current Password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.currentTarget.value)}
        />
        <PasswordInput
          label="New Password"
          description="At least 15 characters"
          value={newPassword}
          onChange={(e) => setNewPassword(e.currentTarget.value)}
        />
        <PasswordInput
          label="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.currentTarget.value)}
          error={confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match' : ''}
        />
        <Group justify="flex-end">
          <Button
            size="sm"
            onClick={handleChangePassword}
            loading={saving}
            disabled={!currentPassword || !newPassword || !confirmPassword}
          >
            Change Password
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
