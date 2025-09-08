import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Title,
  Text,
  Container,
  Stack,
  Alert,
  Anchor,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconLock } from '@tabler/icons-react';

export function ResetPasswordForm() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    token: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleChange = (field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Client-side validation
    if (formData.newPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.newPassword.length < 15) {
      setError('Password must be at least 15 characters long');
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.resetPassword(formData);
      if (response.success) {
        setSuccess(response.message);
        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setError(response.message || 'Reset failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <Container size={420} my={40} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
        <Paper radius="md" p="xl" withBorder style={{ width: '100%' }}>
          <Title order={2} ta="center" mb={5}>
            Password Reset Complete
          </Title>

          <Alert icon={<IconCheck size="1rem" />} title="Success!" color="green" mb="md">
            {success}
          </Alert>

          <Text size="sm" ta="center" c="dimmed" mb="md">
            Redirecting to login page in 3 seconds...
          </Text>

          <Stack>
            <Button component={Link} to="/login" fullWidth>
              Continue to Login
            </Button>
          </Stack>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size={420} my={40} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Paper radius="md" p="xl" withBorder style={{ width: '100%' }}>
        <Title order={2} ta="center" mb={5}>
          Reset Password
        </Title>
        <Text c="dimmed" size="sm" ta="center" mb={20}>
          Enter the reset token from server logs and your new password
        </Text>

        <form onSubmit={handleSubmit}>
          <Stack>
            {error && (
              <Alert icon={<IconAlertCircle size="1rem" />} title="Error" color="red">
                {error}
              </Alert>
            )}

            <TextInput
              label="Username"
              placeholder="Enter your username"
              value={formData.username}
              onChange={handleChange('username')}
              required
              disabled={isLoading}
            />

            <TextInput
              label="Reset Token"
              placeholder="Enter the reset token from server logs"
              value={formData.token}
              onChange={handleChange('token')}
              required
              disabled={isLoading}
              description="Copy the token from PM2 logs: pm2 logs budget-backend | grep 'RESET TOKEN'"
            />

            <PasswordInput
              label="New Password"
              placeholder="Enter new password (min 15 characters)"
              value={formData.newPassword}
              onChange={handleChange('newPassword')}
              required
              disabled={isLoading}
              description="Use a strong passphrase with at least 15 characters"
            />

            <PasswordInput
              label="Confirm New Password"
              placeholder="Confirm new password"
              value={formData.confirmPassword}
              onChange={handleChange('confirmPassword')}
              required
              disabled={isLoading}
            />

            <Button 
              type="submit" 
              fullWidth
              loading={isLoading}
              leftSection={<IconLock size="1rem" />}
            >
              Reset Password
            </Button>

            <Text size="sm" ta="center" mt="md">
              <Anchor component={Link} to="/request-reset" size="sm" mr="md">
                ← Request New Token
              </Anchor>
              <Anchor component={Link} to="/login" size="sm">
                Back to Login
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}