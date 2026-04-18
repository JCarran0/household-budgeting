import { useEffect } from 'react';
import { Button, Group, NumberInput, Stack, TextInput, Textarea } from '@mantine/core';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import type {
  CreateEatStopDto,
  CreatePlayStopDto,
  EatStop,
  PlayStop,
  StopLocation,
  UpdateEatStopDto,
  UpdatePlayStopDto,
} from '../../../../../../shared/types';
import { LocationInput } from '../LocationInput';
import { dateToIso, isoToDate } from './formHelpers';

type Variant = 'eat' | 'play';

interface EatPlayFormProps {
  variant: Variant;
  defaultDate: string;
  existing: EatStop | PlayStop | null;
  onSubmit: (
    payload:
      | CreateEatStopDto
      | UpdateEatStopDto
      | CreatePlayStopDto
      | UpdatePlayStopDto,
  ) => void;
  onCancel: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

interface FormValues {
  name: string;
  location: StopLocation | null;
  date: Date | null;
  time: string;
  durationMinutes: number | null;
  notes: string;
}

export function EatPlayForm({
  variant,
  defaultDate,
  existing,
  onSubmit,
  onCancel,
  onBack,
  isSubmitting,
}: EatPlayFormProps) {
  const form = useForm<FormValues>({
    initialValues: {
      name: '',
      location: null,
      date: isoToDate(defaultDate),
      time: '',
      durationMinutes: null,
      notes: '',
    },
    validate: {
      name: (v) => (v.trim().length === 0 ? 'Name is required' : null),
      date: (v) => (v === null ? 'Date is required' : null),
    },
  });

  useEffect(() => {
    if (existing) {
      form.setValues({
        name: existing.name,
        location: existing.location,
        date: isoToDate(existing.date),
        time: existing.time ?? '',
        durationMinutes: existing.type === 'play' ? existing.durationMinutes : null,
        notes: existing.notes ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  const handleSubmit = (values: FormValues) => {
    if (!values.date) return;
    const dateIso = dateToIso(values.date);
    if (!dateIso) return;

    const commonBase = {
      date: dateIso,
      time: values.time.trim() ? values.time : null,
      notes: values.notes.trim(),
      name: values.name.trim(),
      location: values.location,
    };

    if (variant === 'eat') {
      const payload = existing
        ? (commonBase satisfies UpdateEatStopDto)
        : ({ type: 'eat', ...commonBase } satisfies CreateEatStopDto);
      onSubmit(payload);
    } else {
      const playBase = {
        ...commonBase,
        durationMinutes: values.durationMinutes,
      };
      const payload = existing
        ? (playBase satisfies UpdatePlayStopDto)
        : ({ type: 'play', ...playBase } satisfies CreatePlayStopDto);
      onSubmit(payload);
    }
  };

  const titleLabel = variant === 'eat' ? 'What / where' : 'Activity';
  const titlePlaceholder = variant === 'eat' ? 'Tapas dinner' : 'Sagrada Família';
  const addLabel = variant === 'eat' ? 'Add Eat' : 'Add Play';
  const editLabel = variant === 'eat' ? 'Save Changes' : 'Save Changes';

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="sm">
        <TextInput
          label={titleLabel}
          placeholder={titlePlaceholder}
          required
          {...form.getInputProps('name')}
        />
        <LocationInput
          label="Location (optional)"
          mode="verifiedOrFreeText"
          value={form.values.location}
          onChange={(v) => form.setFieldValue('location', v)}
        />
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
        {variant === 'play' && (
          <NumberInput
            label="Duration (minutes)"
            placeholder="Optional"
            min={0}
            max={60 * 24}
            value={form.values.durationMinutes ?? ''}
            onChange={(v) => form.setFieldValue('durationMinutes', v === '' ? null : Number(v))}
          />
        )}
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
              {existing ? editLabel : addLabel}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}
