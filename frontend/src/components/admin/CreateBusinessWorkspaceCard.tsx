/**
 * CreateBusinessWorkspaceCard — Admin action to provision the business workspace.
 *
 * Calls POST /workspaces with workspaceType='business'. Disabled/hidden if a
 * business workspace already exists (D10). After creation, the workspace
 * list in authStore is refreshed so the header switcher appears.
 */
import { useState } from 'react';
import {
  Card,
  Stack,
  Group,
  Title,
  Text,
  TextInput,
  Button,
  Alert,
  Badge,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconBriefcase, IconCheck, IconInfoCircle } from '@tabler/icons-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import type { Family } from '../../../../shared/types';

interface CreateBusinessWorkspaceCardProps {
  /** Current list of workspaces (from authStore) so we can detect existing business ws */
  workspaces: Family[];
  /** Called after a workspace is created so the parent can refresh */
  onCreated: () => void;
}

export function CreateBusinessWorkspaceCard({
  workspaces,
  onCreated,
}: CreateBusinessWorkspaceCardProps) {
  const [name, setName] = useState('OoT Business');

  const existingBusiness = workspaces.find((ws) => ws.workspaceType === 'business');

  const createMutation = useMutation({
    mutationFn: () => api.createWorkspace({ name: name.trim(), workspaceType: 'business' }),
    onSuccess: async (newWorkspace) => {
      notifications.show({
        title: 'Business Workspace Created',
        message: `"${newWorkspace.name}" is ready. Switch to it from the header.`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      // Refresh workspace list so the header switcher appears immediately
      try {
        const refreshed = await api.listWorkspaces();
        useAuthStore.setState({ workspaces: refreshed });
      } catch {
        // Non-fatal: user can refresh manually
      }
      onCreated();
    },
    onError: (err: unknown) => {
      notifications.show({
        title: 'Creation Failed',
        message: err instanceof Error ? err.message : 'Could not create workspace',
        color: 'red',
      });
    },
  });

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <IconBriefcase size={20} />
            <Title order={3}>Business Workspace</Title>
          </Group>
          {existingBusiness ? (
            <Badge color="green" variant="light">
              Provisioned
            </Badge>
          ) : (
            <Badge color="gray" variant="light">
              Not created
            </Badge>
          )}
        </Group>

        {existingBusiness ? (
          <Alert color="green" icon={<IconCheck size={16} />}>
            <Text size="sm">
              Business workspace <strong>{existingBusiness.name}</strong> is
              active. Switch to it using the workspace selector in the header.
            </Text>
          </Alert>
        ) : (
          <>
            <Text size="sm" c="dimmed">
              Creates a second workspace scoped for business use (Plaid sync,
              transactions, categories, and statement generation). Only one
              business workspace is supported in v1.
            </Text>

            <Alert color="blue" icon={<IconInfoCircle size={16} />}>
              <Text size="sm">
                After creation, switch to the business workspace from the header
                to connect your Chase business account and configure statement
                header details.
              </Text>
            </Alert>

            <Group align="flex-end" gap="md">
              <TextInput
                label="Workspace Name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                style={{ flexGrow: 1, maxWidth: 280 }}
              />
              <Button
                onClick={() => createMutation.mutate()}
                loading={createMutation.isPending}
                disabled={!name.trim()}
                leftSection={<IconBriefcase size={16} />}
                color="teal"
              >
                Create Business Workspace
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Card>
  );
}
