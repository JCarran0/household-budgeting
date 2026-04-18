import { useEffect } from 'react';
import { Button, Group, NumberInput, SegmentedControl, Stack, Textarea, Text } from '@mantine/core';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import type {
  CreateTransitStopDto,
  StopLocation,
  TransitMode,
  TransitStop,
  UpdateTransitStopDto,
} from '../../../../../../shared/types';
import { LocationInput } from '../LocationInput';
import { dateToIso, isoToDate } from './formHelpers';

interface TransitFormProps {
  defaultDate: string;
  defaultMode?: TransitMode;
  /** From/to locations computed from neighboring stops (REQ-035). */
  suggestedFrom?: StopLocation | null;
  suggestedTo?: StopLocation | null;
  existing: TransitStop | null;
  onSubmit: (payload: CreateTransitStopDto | UpdateTransitStopDto) => void;
  onCancel: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const MODE_OPTIONS: { value: TransitMode; label: string }[] = [
  { value: 'drive', label: 'Drive' },
  { value: 'flight', label: 'Flight' },
  { value: 'train', label: 'Train' },
  { value: 'walk', label: 'Walk' },
  { value: 'shuttle', label: 'Shuttle' },
  { value: 'other', label: 'Other' },
];

interface FormValues {
  mode: TransitMode;
  date: Date | null;
  time: string;
  fromLocation: StopLocation | null;
  toLocation: StopLocation | null;
  durationMinutes: number | null;
  notes: string;
}

export function TransitForm({
  defaultDate,
  defaultMode = 'drive',
  suggestedFrom = null,
  suggestedTo = null,
  existing,
  onSubmit,
  onCancel,
  onBack,
  isSubmitting,
}: TransitFormProps) {
  const form = useForm<FormValues>({
    initialValues: {
      mode: existing?.mode ?? defaultMode,
      date: isoToDate(defaultDate),
      time: existing?.time ?? '',
      fromLocation: existing?.fromLocation ?? suggestedFrom,
      toLocation: existing?.toLocation ?? suggestedTo,
      durationMinutes: existing?.durationMinutes ?? null,
      notes: existing?.notes ?? '',
    },
    validate: {
      date: (v) => (v === null ? 'Date is required' : null),
    },
  });

  useEffect(() => {
    if (existing) {
      form.setValues({
        mode: existing.mode,
        date: isoToDate(existing.date),
        time: existing.time ?? '',
        fromLocation: existing.fromLocation,
        toLocation: existing.toLocation,
        durationMinutes: existing.durationMinutes,
        notes: existing.notes ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  const handleSubmit = (values: FormValues) => {
    if (!values.date) return;
    const dateIso = dateToIso(values.date);
    if (!dateIso) return;

    const base = {
      date: dateIso,
      time: values.time.trim() ? values.time : null,
      notes: values.notes.trim(),
      mode: values.mode,
      fromLocation: values.fromLocation,
      toLocation: values.toLocation,
      durationMinutes: values.durationMinutes,
    };

    if (existing) {
      onSubmit(base satisfies UpdateTransitStopDto);
    } else {
      onSubmit({ type: 'transit', ...base } satisfies CreateTransitStopDto);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="sm">
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Mode
          </Text>
          <SegmentedControl
            data={MODE_OPTIONS}
            value={form.values.mode}
            onChange={(v) => form.setFieldValue('mode', v as TransitMode)}
          />
        </Stack>
        <Group grow>
          <DatePickerInput
            label="Date"
            required
            valueFormat="MMM D, YYYY"
            {...form.getInputProps('date')}
          />
          <TimeInput
            label="Time (optional)"
            value={form.values.time}
            onChange={(e) => form.setFieldValue('time', e.currentTarget.value)}
          />
        </Group>
        <LocationInput
          label="From (optional)"
          mode="verifiedOrFreeText"
          value={form.values.fromLocation}
          onChange={(v) => form.setFieldValue('fromLocation', v)}
        />
        <LocationInput
          label="To (optional)"
          mode="verifiedOrFreeText"
          value={form.values.toLocation}
          onChange={(v) => form.setFieldValue('toLocation', v)}
        />
        <NumberInput
          label="Duration (minutes)"
          placeholder="Optional"
          min={0}
          max={60 * 24}
          value={form.values.durationMinutes ?? ''}
          onChange={(v) => form.setFieldValue('durationMinutes', v === '' ? null : Number(v))}
        />
        <Textarea
          label="Notes (optional)"
          autosize
          minRows={2}
          maxRows={6}
          {...form.getInputProps('notes')}
        />
        <Group justify="space-between" mt="sm">
          <Button variant="subtle" onClick={onBack} disabled={isSubmitting}>
            Back
          </Button>
          <Group>
            <Button variant="subtle" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {existing ? 'Save Changes' : 'Add Transit'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}
