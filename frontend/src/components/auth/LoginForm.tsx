import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import {
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Title,
  Text,
  Container,
  Group,
  Stack,
  Alert,
  Anchor,
  Center,
} from '@mantine/core';
import { IconAlertCircle, IconLogin } from '@tabler/icons-react';

export function LoginForm() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    
    try {
      await login({ username, password });
      navigate('/dashboard');
    } catch (error) {
      // Error is handled in the store
    }
  };

  return (
    <Container size={420} my={40} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Paper radius="md" p="xl" withBorder style={{ width: '100%' }}>
        <Title order={2} ta="center" mb={5}>
          Welcome back!
        </Title>
        <Text c="dimmed" size="sm" ta="center" mb={20}>
          Sign in to your account to continue
        </Text>

        <form onSubmit={handleSubmit}>
          <Stack>
            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {error}
              </Alert>
            )}

            <TextInput
              label="Username"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              required
              autoFocus
            />

            <PasswordInput
              label="Password"
              placeholder="Enter your passphrase"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />

            <Button
              type="submit"
              fullWidth
              loading={isLoading}
              leftSection={<IconLogin size={16} />}
              gradient={{ from: 'yellow', to: 'orange' }}
              variant="gradient"
            >
              Sign in
            </Button>
          </Stack>
        </form>

        <Center mt="xl">
          <Text c="dimmed" size="sm">
            Don't have an account?{' '}
            <Anchor component={Link} to="/register" size="sm" fw={500}>
              Create account
            </Anchor>
          </Text>
        </Center>
      </Paper>
    </Container>
  );
}