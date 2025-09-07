import { useState } from 'react';
import {
  Container,
  Title,
  Card,
  Stack,
  Group,
  Button,
  Text,
  Alert,
  Loader,
  Badge,
  Modal,
  Center,
} from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCheck, IconInfoCircle, IconSettings } from '@tabler/icons-react';
import { api } from '../lib/api';

export function Admin() {
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const queryClient = useQueryClient();

  // Check migration status
  const { data: migrationStatus, isLoading: isStatusLoading, error: statusError } = useQuery({
    queryKey: ['migrationStatus'],
    queryFn: () => api.getMigrationStatus(),
    refetchInterval: 5000, // Refresh every 5 seconds to show real-time status
  });

  // Migration mutation
  const migrationMutation = useMutation({
    mutationFn: () => api.migrateSavingsToRollover(),
    onSuccess: (result) => {
      notifications.show({
        title: 'Migration Successful',
        message: result.message,
        color: 'green',
        icon: <IconCheck size={18} />,
      });
      queryClient.invalidateQueries({ queryKey: ['migrationStatus'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setConfirmationOpen(false);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred during migration';
      notifications.show({
        title: 'Migration Failed',
        message: errorMessage,
        color: 'red',
      });
      setConfirmationOpen(false);
    },
  });

  const handleMigration = () => {
    migrationMutation.mutate();
  };

  const getMigrationStatusColor = () => {
    if (!migrationStatus) return 'gray';
    if (migrationStatus.migrationComplete) return 'green';
    if (migrationStatus.migrationNeeded) return 'yellow';
    return 'blue';
  };

  const getMigrationStatusText = () => {
    if (!migrationStatus) return 'Loading...';
    if (migrationStatus.migrationComplete) return 'Complete';
    if (migrationStatus.migrationNeeded) return 'Required';
    return 'Not Needed';
  };

  if (statusError) {
    return (
      <Container size="md" py="xl">
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          Failed to load admin panel: {statusError instanceof Error ? statusError.message : 'Unknown error'}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group gap="sm">
          <IconSettings size={32} />
          <Title order={1}>Admin Panel</Title>
        </Group>

        <Text c="dimmed">
          Administrative functions and system maintenance tools.
        </Text>

        {/* Migration Section */}
        <Card withBorder padding="lg" radius="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={3}>Category Migration</Title>
                <Text size="sm" c="dimmed">
                  Migrate category field from "isSavings" to "isRollover"
                </Text>
              </div>
              <Badge color={getMigrationStatusColor()} variant="light">
                {getMigrationStatusText()}
              </Badge>
            </Group>

            {isStatusLoading ? (
              <Center>
                <Loader size="sm" />
              </Center>
            ) : (
              <Stack gap="sm">
                <Group gap="xl">
                  <div>
                    <Text size="sm" fw={500}>Total Categories</Text>
                    <Text size="lg" fw={700}>{migrationStatus?.totalCategories || 0}</Text>
                  </div>
                  <div>
                    <Text size="sm" fw={500}>With Old Field</Text>
                    <Text size="lg" fw={700} c={migrationStatus?.categoriesWithOldField ? 'yellow' : 'green'}>
                      {migrationStatus?.categoriesWithOldField || 0}
                    </Text>
                  </div>
                  <div>
                    <Text size="sm" fw={500}>With New Field</Text>
                    <Text size="lg" fw={700} c="green">
                      {migrationStatus?.categoriesWithNewField || 0}
                    </Text>
                  </div>
                </Group>

                {migrationStatus?.migrationNeeded && (
                  <Alert color="yellow" icon={<IconInfoCircle size={16} />}>
                    <Text size="sm">
                      Some categories still use the old "isSavings" field. Running the migration will 
                      rename this field to "isRollover" for better clarity.
                    </Text>
                  </Alert>
                )}

                {migrationStatus?.migrationComplete && (
                  <Alert color="green" icon={<IconCheck size={16} />}>
                    <Text size="sm">
                      All categories have been successfully migrated to use the "isRollover" field.
                    </Text>
                  </Alert>
                )}

                <Group justify="flex-end">
                  <Button
                    onClick={() => setConfirmationOpen(true)}
                    disabled={!migrationStatus?.migrationNeeded}
                    loading={migrationMutation.isPending}
                    color="yellow"
                    variant={migrationStatus?.migrationNeeded ? 'filled' : 'light'}
                  >
                    {migrationStatus?.migrationNeeded ? 'Run Migration' : 'Migration Not Needed'}
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        </Card>

        {/* Future admin features can be added here */}
        <Card withBorder padding="lg" radius="md" style={{ opacity: 0.6 }}>
          <Stack gap="sm">
            <Title order={3}>Coming Soon</Title>
            <Text size="sm" c="dimmed">
              Additional administrative features will be added here in future updates.
            </Text>
            <Group gap="xs">
              <Badge variant="light" color="gray">Database Cleanup</Badge>
              <Badge variant="light" color="gray">User Management</Badge>
              <Badge variant="light" color="gray">System Health</Badge>
            </Group>
          </Stack>
        </Card>
      </Stack>

      {/* Confirmation Modal */}
      <Modal
        opened={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        title="Confirm Migration"
        centered
      >
        <Stack gap="md">
          <Text>
            This will migrate all categories from using "isSavings" to "isRollover". 
            This is a safe operation that will rename the field without losing any data.
          </Text>
          
          <Alert color="blue" icon={<IconInfoCircle size={16} />}>
            <Text size="sm">
              <strong>What this does:</strong>
              <br />• Renames "isSavings" field to "isRollover" for all categories
              <br />• Preserves all existing values (true/false)
              <br />• No data loss - only field name changes
            </Text>
          </Alert>

          <Group justify="flex-end" mt="md">
            <Button 
              variant="default" 
              onClick={() => setConfirmationOpen(false)}
              disabled={migrationMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              color="yellow" 
              onClick={handleMigration}
              loading={migrationMutation.isPending}
            >
              Run Migration
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}