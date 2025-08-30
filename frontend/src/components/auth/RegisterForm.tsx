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
  Stack,
  Alert,
  Anchor,
  Center,
  Progress,
  Box,
  List,
  ThemeIcon,
} from '@mantine/core';
import { IconAlertCircle, IconUserPlus, IconCheck, IconX } from '@tabler/icons-react';

export function RegisterForm() {
  const navigate = useNavigate();
  const { register, isLoading, error, clearError } = useAuthStore();
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const passwordRequirements = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Contains lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Contains number', met: /\d/.test(password) },
    { label: 'Contains special character', met: /[!@#$%^&*]/.test(password) },
  ];

  const allRequirementsMet = passwordRequirements.every(req => req.met);
  const passwordStrength = (passwordRequirements.filter(req => req.met).length / passwordRequirements.length) * 100;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationError('');
    
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    if (!allRequirementsMet) {
      setValidationError('Password does not meet all requirements');
      return;
    }
    
    try {
      await register({ username, password });
      navigate('/dashboard');
    } catch (error) {
      // Error is handled in the store
    }
  };

  return (
    <Container size={420} my={40} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Paper radius="md" p="xl" withBorder style={{ width: '100%' }}>
        <Title order={2} ta="center" mb={5}>
          Create Account
        </Title>
        <Text c="dimmed" size="sm" ta="center" mb={20}>
          Start managing your finances today
        </Text>

        <form onSubmit={handleSubmit}>
          <Stack>
            {(error || validationError) && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {error || validationError}
              </Alert>
            )}

            <TextInput
              label="Username"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              required
              autoFocus
            />

            <PasswordInput
              label="Password"
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />

            {password && (
              <Box>
                <Text size="xs" c="dimmed" mb={5}>Password strength</Text>
                <Progress 
                  value={passwordStrength} 
                  color={passwordStrength < 40 ? 'red' : passwordStrength < 80 ? 'yellow' : 'green'}
                  size="sm"
                  mb="xs"
                />
                <List size="xs" spacing={4}>
                  {passwordRequirements.map((req, index) => (
                    <List.Item
                      key={index}
                      icon={
                        <ThemeIcon color={req.met ? 'green' : 'gray'} size={16} radius="xl">
                          {req.met ? <IconCheck size={12} /> : <IconX size={12} />}
                        </ThemeIcon>
                      }
                    >
                      <Text size="xs" c={req.met ? 'dimmed' : 'red'}>
                        {req.label}
                      </Text>
                    </List.Item>
                  ))}
                </List>
              </Box>
            )}

            <PasswordInput
              label="Confirm Password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
              required
              error={confirmPassword && password !== confirmPassword ? 'Passwords do not match' : ''}
            />

            <Button
              type="submit"
              fullWidth
              loading={isLoading}
              disabled={!allRequirementsMet || password !== confirmPassword}
              leftSection={<IconUserPlus size={16} />}
              gradient={{ from: 'yellow', to: 'orange' }}
              variant="gradient"
            >
              Create account
            </Button>
          </Stack>
        </form>

        <Center mt="xl">
          <Text c="dimmed" size="sm">
            Already have an account?{' '}
            <Anchor component={Link} to="/login" size="sm" fw={500}>
              Sign in
            </Anchor>
          </Text>
        </Center>
      </Paper>
    </Container>
  );
}