import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  Paper,
  TextInput,
  Button,
  Title,
  Text,
  Container,
  Stack,
  Alert,
  Anchor,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconKey } from '@tabler/icons-react';

export function ResetRequestForm() {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const response = await api.requestPasswordReset(username);
      if (response.success) {
        setSuccess(response.message);
      } else {
        setError(response.message || 'Request failed');
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
            Reset Token Generated
          </Title>

          <Alert icon={<IconCheck size="1rem" />} title="Success!" color="green" mb="md">
            {success}
          </Alert>

          <Text size="sm" mb="md">
            <strong>Next steps:</strong>
          </Text>
          <Text size="sm" mb="md" component="ol" style={{ paddingLeft: 20 }}>
            <li>SSH into your server: <code>ssh -i ~/.ssh/budget-app-key ubuntu@budget.jaredcarrano.com</code></li>
            <li>Check PM2 logs: <code>pm2 logs budget-backend | grep "RESET TOKEN"</code></li>
            <li>Copy the token from the logs</li>
            <li>Return here and use the "Reset Password" form</li>
          </Text>

          <Stack>
            <Anchor component={Link} to="/reset-password" size="sm" ta="center">
              Continue to Reset Password →
            </Anchor>
            <Anchor component={Link} to="/login" size="sm" ta="center">
              ← Back to Login
            </Anchor>
          </Stack>
        </Paper>
      </Container>
    );
  }

  return (
    <Container size={420} my={40} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Paper radius="md" p="xl" withBorder style={{ width: '100%' }}>
        <Title order={2} ta="center" mb={5}>
          Request Password Reset
        </Title>
        <Text c="dimmed" size="sm" ta="center" mb={20}>
          Enter your username to generate a reset token
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
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={isLoading}
            />

            <Button 
              type="submit" 
              fullWidth
              loading={isLoading}
              leftSection={<IconKey size="1rem" />}
            >
              Generate Reset Token
            </Button>

            <Text size="sm" ta="center" mt="md">
              <Anchor component={Link} to="/login" size="sm">
                ← Back to Login
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}