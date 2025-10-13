import { useEffect } from 'react';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Modal,
  NumberInput,
  Textarea,
  Button,
  Stack,
  Group,
  Text,
  Alert,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle, IconCalendar, IconCurrencyDollar } from '@tabler/icons-react';
import { api } from '../../lib/api';
import type { ActualsOverride, CreateActualsOverrideDto } from '../../lib/api';

interface ActualsOverrideModalProps {
  opened: boolean;
  onClose: () => void;
  override?: ActualsOverride | null;
}

export function ActualsOverrideModal({ opened, onClose, override }: ActualsOverrideModalProps) {
  const queryClient = useQueryClient();
  const isEditing = !!override;

  const form = useForm<{
    month: Date | string | null;
    totalIncome: number;
    totalExpenses: number;
    notes: string;
  }>({
    initialValues: {
      month: null,
      totalIncome: 0,
      totalExpenses: 0,
      notes: '',
    },
    validate: {
      month: (value) => (!value ? 'Month is required' : null),
      totalIncome: (value) => (value < 0 ? 'Income must be non-negative' : null),
      totalExpenses: (value) => (value < 0 ? 'Expenses must be non-negative' : null),
    },
  });

  // Reset form when override changes
  useEffect(() => {
    if (override) {
      // MonthPickerInput expects a string in YYYY-MM-DD format
      // Convert YYYY-MM to YYYY-MM-01 for the picker
      const monthValue = `${override.month}-01`;
      form.setValues({
        month: monthValue,
        totalIncome: override.totalIncome,
        totalExpenses: override.totalExpenses,
        notes: override.notes || '',
      });
    } else {
      form.reset();
    }
  }, [override]);

  const createOrUpdateMutation = useMutation({
    mutationFn: (data: CreateActualsOverrideDto) => api.createOrUpdateActualsOverride(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actuals-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] }); // Invalidate report data
      notifications.show({
        title: 'Success',
        message: isEditing ? 'Override updated successfully' : 'Override created successfully',
        color: 'green',
      });
      handleClose();
    },
    onError: (error: Error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to save override',
        color: 'red',
      });
    },
  });

  const handleSubmit = (values: typeof form.values) => {
    if (!values.month) return;

    let monthString: string;

    if (typeof values.month === 'string') {
      // MonthPickerInput returns a string like '2025-02-01'
      // Extract YYYY-MM from the string to avoid timezone issues
      const match = values.month.match(/^(\d{4})-(\d{2})/);
      if (!match) {
        notifications.show({
          title: 'Error',
          message: 'Invalid month format',
          color: 'red',
        });
        return;
      }
      monthString = `${match[1]}-${match[2]}`;
    } else if (values.month instanceof Date) {
      // If it's a Date object, format it manually
      const year = values.month.getFullYear();
      const month = String(values.month.getMonth() + 1).padStart(2, '0');
      monthString = `${year}-${month}`;
    } else {
      notifications.show({
        title: 'Error',
        message: 'Invalid month value',
        color: 'red',
      });
      return;
    }

    const data: CreateActualsOverrideDto = {
      month: monthString,
      totalIncome: values.totalIncome,
      totalExpenses: values.totalExpenses,
      notes: values.notes.trim() || undefined,
    };

    console.log('Submitting data:', data);
    createOrUpdateMutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const netFlow = form.values.totalIncome - form.values.totalExpenses;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={isEditing ? 'Edit Actuals Override' : 'Create Actuals Override'}
      size="md"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
            <Text size="sm">
              Set manual income and expense totals for months where transaction data is incomplete or unavailable.
              This will override calculated values in reports and dashboards.
            </Text>
          </Alert>

          <MonthPickerInput
            label="Month"
            placeholder="Select month"
            leftSection={<IconCalendar size={16} />}
            value={form.values.month}
            onChange={(value) => form.setFieldValue('month', value)}
            error={form.errors.month}
            required
            disabled={isEditing} // Don't allow changing month when editing
            maxDate={new Date()} // Don't allow future months
            withAsterisk
          />

          <NumberInput
            label="Total Income"
            placeholder="Enter total income for the month"
            leftSection={<IconCurrencyDollar size={16} />}
            value={form.values.totalIncome}
            onChange={(value) => {
              console.log('Total Income onChange:', value, 'Type:', typeof value);
              const numValue = typeof value === 'number' ? value : (typeof value === 'string' ? parseFloat(value) : 0);
              console.log('Setting totalIncome to:', numValue);
              form.setFieldValue('totalIncome', isNaN(numValue) ? 0 : numValue);
            }}
            error={form.errors.totalIncome}
            min={0}
            decimalScale={2}
            fixedDecimalScale
            thousandSeparator=","
            required
            withAsterisk
          />

          <NumberInput
            label="Total Expenses"
            placeholder="Enter total expenses for the month"
            leftSection={<IconCurrencyDollar size={16} />}
            value={form.values.totalExpenses}
            onChange={(value) => {
              console.log('Total Expenses onChange:', value, 'Type:', typeof value);
              const numValue = typeof value === 'number' ? value : (typeof value === 'string' ? parseFloat(value) : 0);
              console.log('Setting totalExpenses to:', numValue);
              form.setFieldValue('totalExpenses', isNaN(numValue) ? 0 : numValue);
            }}
            error={form.errors.totalExpenses}
            min={0}
            decimalScale={2}
            fixedDecimalScale
            thousandSeparator=","
            required
            withAsterisk
          />

          {(form.values.totalIncome > 0 || form.values.totalExpenses > 0) && (
            <Alert color={netFlow >= 0 ? 'green' : 'red'} variant="light">
              <Text size="sm" fw={500}>
                Net Flow: ${netFlow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text size="xs" c="dimmed">
                {netFlow >= 0 ? 'Positive cash flow' : 'Negative cash flow'}
              </Text>
            </Alert>
          )}

          <Textarea
            label="Notes (Optional)"
            placeholder="Add any notes about this override..."
            value={form.values.notes}
            onChange={(event) => form.setFieldValue('notes', event.currentTarget.value)}
            maxLength={500}
            rows={3}
            description={`${form.values.notes.length}/500 characters`}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createOrUpdateMutation.isPending}
              disabled={!form.isValid()}
            >
              {isEditing ? 'Update Override' : 'Create Override'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}