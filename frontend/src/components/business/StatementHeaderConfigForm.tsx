/**
 * StatementHeaderConfigForm — GETs /business/settings, lets the user edit the
 * 5 StatementHeader fields, and PUTs them. Appears on the Statements page.
 *
 * The stored header is snapshotted into each statement at generation time, so
 * editing it only affects future statements (BRD REQ-020).
 */
import {
  Card,
  Stack,
  TextInput,
  Textarea,
  Button,
  Title,
  Group,
  Alert,
  Loader,
  Center,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { useEffect } from 'react';
import { api } from '../../lib/api';
import type { StatementHeader } from '../../../../shared/types';

/**
 * Default footer notes, pre-filled for a new workspace so the statement matches
 * the legacy template out of the box. Fully editable — saving an empty value
 * keeps it empty (the default only applies when notes were never saved).
 */
const DEFAULT_NOTES =
  'The KDP Disbursement Date is the date funds were transferred from KDP to OoT Media. ' +
  'The Payment Date above is the date the funds were transferred from OoT Media to Dream Big Publishing.\n\n' +
  'Transactions over $100,000 will arrive in two separate ACH transactions over 2 business days.';

export function StatementHeaderConfigForm() {
  const queryClient = useQueryClient();

  const form = useForm<StatementHeader>({
    initialValues: {
      businessName: '',
      businessAddress: '',
      clientName: '',
      clientCompany: '',
      clientAddress: '',
      notes: DEFAULT_NOTES,
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['businessSettings'],
    queryFn: () => api.getBusinessSettings(),
  });

  // Populate form once data arrives. When notes were never saved (undefined),
  // fall back to the default so a fresh workspace shows the standard footer.
  useEffect(() => {
    if (data?.header) {
      form.setValues({ ...data.header, notes: data.header.notes ?? DEFAULT_NOTES });
    }
    // Only run when data changes; suppressing the form dep is intentional
    // (form.setValues is stable, but form object changes on each render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (header: StatementHeader) => api.updateBusinessSettings(header),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['businessSettings'] });
      notifications.show({
        title: 'Settings Saved',
        message: 'Statement header updated. Future statements will use these values.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    },
    onError: (err: unknown) => {
      notifications.show({
        title: 'Save Failed',
        message: err instanceof Error ? err.message : 'Could not save settings',
        color: 'red',
      });
    },
  });

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  if (error) {
    return (
      <Alert color="red" icon={<IconAlertTriangle size={16} />}>
        Failed to load settings:{' '}
        {error instanceof Error ? error.message : 'Unknown error'}
      </Alert>
    );
  }

  return (
    <Card withBorder padding="lg" radius="md">
      <form onSubmit={form.onSubmit((values) => saveMutation.mutate(values))}>
        <Stack gap="md">
          <Title order={3}>Statement Header Settings</Title>

          <TextInput
            label="Business Name"
            placeholder="OoT Publishing LLC"
            required
            {...form.getInputProps('businessName')}
          />
          <Textarea
            label="Business Address"
            placeholder="123 Main Street&#10;City, State 00000"
            rows={2}
            {...form.getInputProps('businessAddress')}
          />

          <TextInput
            label="Client Name"
            placeholder="Jane Smith"
            required
            {...form.getInputProps('clientName')}
          />
          <TextInput
            label="Client Company"
            placeholder="Smith Publishing Group (optional)"
            {...form.getInputProps('clientCompany')}
          />
          <Textarea
            label="Client Address"
            placeholder="456 Client Ave&#10;City, State 00000"
            rows={2}
            {...form.getInputProps('clientAddress')}
          />

          <Textarea
            label="Statement Notes"
            description="Footer shown at the bottom of every statement. Edit freely; leave blank to omit."
            autosize
            minRows={3}
            maxRows={8}
            {...form.getInputProps('notes')}
          />

          <Group justify="flex-end">
            <Button type="submit" loading={saveMutation.isPending}>
              Save Header
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}
