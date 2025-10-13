import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Stack,
  Group,
  Text,
  Button,
  Table,
  ActionIcon,
  Paper,
  Badge,
  Tooltip,
  LoadingOverlay,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { IconPlus, IconEdit, IconTrash, IconCalendar, IconCash } from '@tabler/icons-react';
import { api } from '../../lib/api';
import type { ActualsOverride } from '../../lib/api';
import { ActualsOverrideModal } from './ActualsOverrideModal';

// Helper to format YYYY-MM string to readable month name without timezone issues
const formatMonthString = (monthStr: string): string => {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1, 1); // Create date in local timezone
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export function ReportSettings() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOverride, setEditingOverride] = useState<ActualsOverride | null>(null);
  const queryClient = useQueryClient();

  // Fetch actuals overrides
  const { data: overrides = [], isLoading, error } = useQuery({
    queryKey: ['actuals-overrides'],
    queryFn: api.getActualsOverrides,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: api.deleteActualsOverride,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actuals-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] }); // Invalidate report data
      notifications.show({
        title: 'Success',
        message: 'Override deleted successfully',
        color: 'green',
      });
    },
    onError: (error: Error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to delete override',
        color: 'red',
      });
    },
  });

  const handleAddOverride = () => {
    setEditingOverride(null);
    setIsModalOpen(true);
  };

  const handleEditOverride = (override: ActualsOverride) => {
    setEditingOverride(override);
    setIsModalOpen(true);
  };

  const handleDeleteOverride = (override: ActualsOverride) => {
    modals.openConfirmModal({
      title: 'Delete Override',
      children: (
        <Text size="sm">
          Are you sure you want to delete the override for{' '}
          <strong>{formatMonthString(override.month)}</strong>?
          This will remove the manual totals and revert to calculated values from transactions.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteMutation.mutate(override.id),
    });
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingOverride(null);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (error) {
    return (
      <Paper withBorder p="md">
        <Text c="red">Failed to load overrides: {error instanceof Error ? error.message : 'Unknown error'}</Text>
      </Paper>
    );
  }

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Text fw={600} size="md">Actuals Overrides</Text>
          <Text size="sm" c="dimmed">
            Manually set income and expense totals for months without complete transaction data
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={handleAddOverride}>
          Add Override
        </Button>
      </Group>

      <Paper withBorder style={{ position: 'relative' }}>
        <LoadingOverlay visible={isLoading} />

        {overrides.length === 0 ? (
          <Stack align="center" py="xl">
            <IconCalendar size={48} color="var(--mantine-color-gray-5)" />
            <Text c="dimmed" ta="center">
              No overrides created yet
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              Create an override to manually set income and expense totals for specific months
            </Text>
          </Stack>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Month</Table.Th>
                <Table.Th>Total Income</Table.Th>
                <Table.Th>Total Expenses</Table.Th>
                <Table.Th>Net Flow</Table.Th>
                <Table.Th>Notes</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {overrides.map((override) => {
                const netFlow = override.totalIncome - override.totalExpenses;
                return (
                  <Table.Tr key={override.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <IconCalendar size={16} />
                        <Text fw={500}>
                          {formatMonthString(override.month)}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text c="green" fw={500}>
                        {formatCurrency(override.totalIncome)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text c="red" fw={500}>
                        {formatCurrency(override.totalExpenses)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={netFlow >= 0 ? 'green' : 'red'}
                        variant="light"
                        leftSection={<IconCash size={12} />}
                      >
                        {formatCurrency(netFlow)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {override.notes ? (
                        <Tooltip label={override.notes} multiline w={200}>
                          <Text size="sm" lineClamp={1} style={{ maxWidth: 150 }}>
                            {override.notes}
                          </Text>
                        </Tooltip>
                      ) : (
                        <Text size="sm" c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Tooltip label="Edit override">
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => handleEditOverride(override)}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete override">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleDeleteOverride(override)}
                            loading={deleteMutation.isPending}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <ActualsOverrideModal
        opened={isModalOpen}
        onClose={handleModalClose}
        override={editingOverride}
      />
    </Stack>
  );
}