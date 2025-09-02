import { useState } from 'react';
import { Button, Stack, Paper, Title, Text, Group } from '@mantine/core';
import { IconBug, IconBomb, IconApi, IconRefresh } from '@tabler/icons-react';
import { ErrorBoundary, AsyncErrorBoundary, FormErrorBoundary } from './ErrorBoundary';

// Component that throws an error
function BuggyComponent({ shouldError }: { shouldError: boolean }) {
  if (shouldError) {
    throw new Error('Test error: Component crashed!');
  }
  return <Text>Component is working fine!</Text>;
}

// Component that simulates async error
function AsyncBuggyComponent({ shouldError }: { shouldError: boolean }) {
  const [data, setData] = useState<string | null>(null);

  const fetchData = async () => {
    if (shouldError) {
      throw new Error('Test error: Failed to fetch data!');
    }
    setData('Data loaded successfully!');
  };

  if (shouldError && !data) {
    fetchData();
  }

  return <Text>{data || 'Ready to fetch data'}</Text>;
}

export function ErrorBoundaryTest() {
  const [componentError, setComponentError] = useState(false);
  const [asyncError, setAsyncError] = useState(false);
  const [formError, setFormError] = useState(false);
  const [isolatedError, setIsolatedError] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  return (
    <Stack gap="xl">
      <Paper p="md" withBorder>
        <Title order={3} mb="md">Error Boundary Test Suite</Title>
        <Text c="dimmed" size="sm">
          Use these controls to test error boundary behavior in development
        </Text>
      </Paper>

      {/* Component-level error test */}
      <Paper p="md" withBorder>
        <Title order={4} mb="sm">Component Error Boundary</Title>
        <Stack gap="sm">
          <ErrorBoundary 
            level="component" 
            resetKeys={[resetKey]}
            customMessage="This is a test error boundary"
          >
            <BuggyComponent shouldError={componentError} />
          </ErrorBoundary>
          <Group>
            <Button
              leftSection={<IconBug size={16} />}
              color={componentError ? 'red' : 'blue'}
              onClick={() => setComponentError(!componentError)}
            >
              {componentError ? 'Fix Component' : 'Trigger Error'}
            </Button>
            <Button
              leftSection={<IconRefresh size={16} />}
              variant="light"
              onClick={() => setResetKey(prev => prev + 1)}
            >
              Reset Boundary
            </Button>
          </Group>
        </Stack>
      </Paper>

      {/* Async error test */}
      <Paper p="md" withBorder>
        <Title order={4} mb="sm">Async Error Boundary</Title>
        <Stack gap="sm">
          <AsyncErrorBoundary>
            <AsyncBuggyComponent shouldError={asyncError} />
          </AsyncErrorBoundary>
          <Button
            leftSection={<IconApi size={16} />}
            color={asyncError ? 'red' : 'blue'}
            onClick={() => setAsyncError(!asyncError)}
          >
            {asyncError ? 'Fix Async' : 'Trigger Async Error'}
          </Button>
        </Stack>
      </Paper>

      {/* Form error test */}
      <Paper p="md" withBorder>
        <Title order={4} mb="sm">Form Error Boundary</Title>
        <Stack gap="sm">
          <FormErrorBoundary>
            <BuggyComponent shouldError={formError} />
          </FormErrorBoundary>
          <Button
            leftSection={<IconBug size={16} />}
            color={formError ? 'red' : 'blue'}
            onClick={() => setFormError(!formError)}
          >
            {formError ? 'Fix Form' : 'Trigger Form Error'}
          </Button>
        </Stack>
      </Paper>

      {/* Isolated vs Non-isolated test */}
      <Paper p="md" withBorder>
        <Title order={4} mb="sm">Isolated Error Boundary</Title>
        <Stack gap="sm">
          <ErrorBoundary level="component" isolate={true}>
            <BuggyComponent shouldError={isolatedError} />
          </ErrorBoundary>
          <Button
            leftSection={<IconBomb size={16} />}
            color={isolatedError ? 'red' : 'blue'}
            onClick={() => setIsolatedError(!isolatedError)}
          >
            {isolatedError ? 'Fix Isolated' : 'Trigger Isolated Error'}
          </Button>
        </Stack>
      </Paper>

      <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-blue-light)' }}>
        <Text size="sm" c="dimmed">
          💡 Tip: Open browser console to see error logging
        </Text>
      </Paper>
    </Stack>
  );
}