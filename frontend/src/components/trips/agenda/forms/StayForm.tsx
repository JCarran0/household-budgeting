import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Group, NumberInput, SegmentedControl, Stack, TextInput, Textarea, Text } from '@mantine/core';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { IconAlertTriangle } from '@tabler/icons-react';
import type {
  CreateStayStopDto,
  StayStop,
  UpdateStayStopDto,
  VerifiedLocation,
} from '../../../../../../shared/types';
import { LocationInput } from '../LocationInput';
import type { PlacePhotoCandidate } from '../LocationInput';
import { PhotoCandidateStrip } from '../PhotoCandidateStrip';
import { PlacePhotoThumb } from '../PlacePhotoThumb';
import { useGooglePlaces } from '../../../../hooks/useGooglePlaces';
import { addDaysIso, dateToIso, isoToDate } from './formHelpers';

interface StayFormProps {
  defaultDate: string; // ISO
  /** Optional pre-fill for the nights picker (used by templates). */
  defaultNights?: number;
  existing: StayStop | null;
  onSubmit: (payload: CreateStayStopDto | UpdateStayStopDto) => void;
  onCancel: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const NIGHT_PRESETS = ['1', '2', '3', '7'];

interface StayFormValues {
  name: string;
  location: VerifiedLocation | null;
  startDate: Date | null;
  nights: number;
  time: string; // "HH:mm" or ''
  notes: string;
}

function nightsBetween(start: string, end: string): number {
  if (end < start) return 1;
  const startD = isoToDate(start);
  const endD = isoToDate(end);
  if (!startD || !endD) return 1;
  const diff = Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

export function StayForm({
  defaultDate,
  defaultNights = 1,
  existing,
  onSubmit,
  onCancel,
  onBack,
  isSubmitting,
}: StayFormProps) {
  const places = useGooglePlaces();
  const placesUnconfigured = places.status === 'unconfigured';

  // Transient candidate list from the most recent LocationInput selection.
  // Not persisted — only used to render the picker strip (REQ-020).
  const [photoCandidates, setPhotoCandidates] = useState<PlacePhotoCandidate[]>([]);

  const form = useForm<StayFormValues>({
    initialValues: {
      name: '',
      location: null,
      startDate: isoToDate(defaultDate),
      nights: defaultNights,
      time: '',
      notes: '',
    },
    validate: {
      name: (v) => (v.trim().length === 0 ? 'Name is required' : null),
      location: (v) => (v === null ? 'Verified location is required' : null),
      startDate: (v) => (v === null ? 'Start date is required' : null),
      nights: (v) => (v < 1 ? 'At least 1 night required' : null),
    },
  });

  useEffect(() => {
    if (existing) {
      form.setValues({
        name: existing.name,
        location: existing.location,
        startDate: isoToDate(existing.date),
        nights: nightsBetween(existing.date, existing.endDate),
        time: existing.time ?? '',
        notes: existing.notes ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  const nightsPresetValue = useMemo(() => {
    return NIGHT_PRESETS.includes(String(form.values.nights))
      ? String(form.values.nights)
      : '';
  }, [form.values.nights]);

  const handleSubmit = (values: StayFormValues) => {
    if (!values.location || !values.startDate) return;
    const startIso = dateToIso(values.startDate);
    if (!startIso) return;
    const endIso = addDaysIso(startIso, Math.max(0, values.nights - 1));

    const base = {
      date: startIso,
      endDate: endIso,
      time: values.time.trim() ? values.time : null,
      notes: values.notes.trim(),
      name: values.name.trim(),
      location: values.location,
    };

    if (existing) {
      onSubmit({ type: 'stay', ...base } satisfies UpdateStayStopDto);
    } else {
      onSubmit({ type: 'stay', ...base } satisfies CreateStayStopDto);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="sm">
        {placesUnconfigured && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            color="yellow"
            title="Address verification not configured"
          >
            Stays require a verified address. Add{' '}
            <code>VITE_GOOGLE_PLACES_API_KEY</code> to{' '}
            <code>frontend/.env.development</code> and restart the dev server. Eat, Play, and
            Transit stops work without it.
          </Alert>
        )}
        <TextInput
          label="Stay name"
          placeholder="Hotel Arts Barcelona"
          required
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          {...form.getInputProps('name')}
        />
        <LocationInput
          label="Location"
          required
          mode="verifiedOnly"
          value={form.values.location}
          onChange={(v) => form.setFieldValue('location', v?.kind === 'verified' ? v : null)}
          onPhotoCandidates={setPhotoCandidates}
          error={form.errors.location as string | undefined}
        />
        {photoCandidates.length > 0 ? (
          <PhotoCandidateStrip
            candidates={photoCandidates}
            selectedPhotoName={form.values.location?.photoName ?? null}
            onSelect={(c) => {
              const current = form.values.location;
              if (!current) return;
              form.setFieldValue('location', {
                ...current,
                photoName: c.photoName,
                ...(c.photoAttribution
                  ? { photoAttribution: c.photoAttribution }
                  : { photoAttribution: undefined }),
              });
            }}
          />
        ) : (
          form.values.location?.kind === 'verified' &&
          form.values.location.photoName && (
            <Group gap="xs" mt={-4}>
              <PlacePhotoThumb
                photoName={form.values.location.photoName}
                attribution={form.values.location.photoAttribution ?? null}
                size={96}
                alt="Selected place photo"
              />
              <Text size="xs" c="dimmed">
                This photo will appear on the stay banner. Use Change to pick a different one.
              </Text>
            </Group>
          )
        )}
        <Group grow>
          <DatePickerInput
            label="Start date (first night)"
            required
            valueFormat="MMM D, YYYY"
            highlightToday
            {...form.getInputProps('startDate')}
          />
          <TimeInput
            label="Check-in time (optional)"
            value={form.values.time}
            onChange={(e) => form.setFieldValue('time', e.currentTarget.value)}
          />
        </Group>
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Nights
          </Text>
          <Group gap="xs" align="center">
            <SegmentedControl
              data={NIGHT_PRESETS.map((n) => ({ value: n, label: n }))}
              value={nightsPresetValue}
              onChange={(v) => form.setFieldValue('nights', Number(v))}
            />
            <NumberInput
              min={1}
              max={365}
              value={form.values.nights}
              onChange={(v) => form.setFieldValue('nights', Number(v) || 1)}
              style={{ maxWidth: 100 }}
            />
          </Group>
          {form.values.startDate && (
            <Text size="xs" c="dimmed">
              Last night:{' '}
              {addDaysIso(dateToIso(form.values.startDate) ?? '', form.values.nights - 1)}
            </Text>
          )}
        </Stack>
        <Textarea
          label="Notes (optional)"
          placeholder="Confirmation number, room preference, etc."
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
            <Button type="submit" loading={isSubmitting} disabled={placesUnconfigured}>
              {existing ? 'Save Changes' : 'Add Stay'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}
