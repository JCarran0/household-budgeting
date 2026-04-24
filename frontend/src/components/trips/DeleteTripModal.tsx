import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX } from '@tabler/icons-react';
import { api } from '../../lib/api';
import type { TripSummary } from '../../../../shared/types';

export interface DeleteTripModalProps {
  opened: boolean;
  onClose: () => void;
  trip: TripSummary | null;
  /** Fires after a successful delete — use to navigate away from a detail view. */
  onDeleted?: () => void;
}

export function DeleteTripModal({ opened, onClose, trip, onDeleted }: DeleteTripModalProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTrip(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      notifications.show({
        title: 'Trip deleted',
        message: 'The trip has been removed.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      onClose();
      onDeleted?.();
    },
    onError: () => {
      notifications.show({
        title: 'Failed to delete trip',
        message: 'An error occurred. Please try again.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  if (!trip) return null;

  return (
    <Modal opened={opened} onClose={onClose} title="Delete Trip" size="sm">
      <Stack gap="md">
        <Text>
          Are you sure you want to delete{' '}
          <Text component="span" fw={600}>
            {trip.name}
          </Text>
          ? This action cannot be undone.
        </Text>
        <Group justify="flex-end">
          <Button
            variant="subtle"
            onClick={onClose}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            color="red"
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(trip.id)}
          >
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
