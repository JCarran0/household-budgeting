import { useEffect, useMemo } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Code,
  Group,
  Image,
  Modal,
  NumberInput,
  Rating,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconBed,
  IconCheck,
  IconCompass,
  IconMapPin,
  IconPlus,
  IconToolsKitchen2,
  IconX,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { api } from '../../lib/api';
import { useCategoryOptions } from '../../hooks/useCategoryOptions';
import { formatCurrency } from '../../utils/formatters';
import type {
  CreateTripDto,
  Stop,
  TripCategoryBudget,
  TripSummary,
  UpdateTripDto,
} from '../../../../shared/types';
import {
  generateTripTag,
  getStopPhoto,
  resolveCoverStop,
} from '../../../../shared/utils/tripHelpers';

interface TripFormValues {
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  totalBudget: number | string;
  rating: number;
  notes: string;
  categoryBudgets: TripCategoryBudget[];
  photoAlbumUrl: string;
  coverStopId: string | null;
}

// Mantine 8's DatePickerInput returns YYYY-MM-DD strings on change but our
// form state may still hold the initial Date object. Piping a string through
// date-fns `format` reparses it as UTC midnight and shifts the day back in
// any timezone west of UTC — pass strings through untouched.
function pickerToYmd(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return format(value, 'yyyy-MM-dd');
}

const STOP_TYPE_ICON: Record<'stay' | 'eat' | 'play' | 'transit', typeof IconBed> = {
  stay: IconBed,
  eat: IconToolsKitchen2,
  play: IconCompass,
  transit: IconMapPin, // unreachable — transits have no photos
};

function coverThumbLabel(stop: Stop): string {
  if (stop.type === 'transit') return 'Transit';
  return stop.name || stop.type;
}

interface CoverPhotoThumbProps {
  stopType: Stop['type'];
  stopLabel: string;
  photoName: string;
  selected: boolean;
  onSelect: () => void;
}

function CoverPhotoThumb({
  stopType,
  stopLabel,
  photoName,
  selected,
  onSelect,
}: CoverPhotoThumbProps) {
  const key = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  if (!key) return null;
  const src = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=200&key=${key}`;
  const IconComp = STOP_TYPE_ICON[stopType];

  return (
    <Tooltip label={stopLabel} withArrow>
      <UnstyledButton
        onClick={onSelect}
        aria-label={`Select ${stopLabel} as cover photo`}
        aria-pressed={selected}
        style={{ flexShrink: 0 }}
      >
        <Box
          style={{
            position: 'relative',
            width: 88,
            height: 88,
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: selected
              ? '0 0 0 3px var(--mantine-color-blue-filled)'
              : '0 0 0 1px var(--mantine-color-gray-3)',
            transition: 'box-shadow 120ms ease',
          }}
        >
          <Image src={src} alt={stopLabel} w={88} h={88} fit="cover" />
          <Box
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'rgba(0, 0, 0, 0.55)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <IconComp size={12} />
          </Box>
        </Box>
      </UnstyledButton>
    </Tooltip>
  );
}

export interface TripFormModalProps {
  opened: boolean;
  onClose: () => void;
  trip: TripSummary | null; // null = create mode
}

export function TripFormModal({ opened, onClose, trip }: TripFormModalProps) {
  const queryClient = useQueryClient();
  const isEdit = trip !== null;

  const { options: categoryOptions, isLoading: categoriesLoading } = useCategoryOptions({
    enabled: opened,
  });

  const form = useForm<TripFormValues>({
    initialValues: {
      name: '',
      startDate: null,
      endDate: null,
      totalBudget: '',
      rating: 0,
      notes: '',
      categoryBudgets: [],
      photoAlbumUrl: '',
      coverStopId: null,
    },
    validate: {
      name: (value) => (value.trim().length === 0 ? 'Name is required' : null),
      startDate: (value) => (value === null ? 'Start date is required' : null),
      endDate: (value, values) => {
        if (value === null) return 'End date is required';
        if (values.startDate && value < values.startDate) {
          return 'End date must be on or after start date';
        }
        return null;
      },
      totalBudget: (value, values) => {
        const categorySum = values.categoryBudgets
          .filter((cb) => cb.categoryId !== '' && cb.amount > 0)
          .reduce((sum, cb) => sum + cb.amount, 0);
        if (categorySum === 0) return null;
        if (value === '' || value === null) {
          return `Total budget is required when category budgets are set (${formatCurrency(categorySum)})`;
        }
        const total = Number(value);
        if (isNaN(total)) return null;
        if (categorySum > total) {
          return `Total budget must be at least ${formatCurrency(categorySum)} (sum of category budgets)`;
        }
        return null;
      },
      photoAlbumUrl: (value) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) return null;
        try {
          const parsed = new URL(trimmed);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return 'Must be an http(s) URL';
          }
          return null;
        } catch {
          return 'Enter a valid URL';
        }
      },
    },
  });

  // Reset/populate form when modal opens
  useEffect(() => {
    if (!opened) return;
    if (isEdit && trip) {
      const [startYear, startMonth, startDay] = trip.startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = trip.endDate.split('-').map(Number);
      form.setValues({
        name: trip.name,
        startDate: new Date(startYear, startMonth - 1, startDay),
        endDate: new Date(endYear, endMonth - 1, endDay),
        totalBudget: trip.totalBudget ?? '',
        rating: trip.rating ?? 0,
        notes: trip.notes ?? '',
        categoryBudgets: trip.categoryBudgets ?? [],
        photoAlbumUrl: trip.photoAlbumUrl ?? '',
        coverStopId: trip.coverStopId ?? null,
      });
    } else {
      form.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, trip]);

  const tagPreview = useMemo(() => {
    const { name, startDate } = form.values;
    if (!name.trim() || !startDate) return null;
    return generateTripTag(name.trim(), pickerToYmd(startDate));
  }, [form.values]);

  // Stops on this trip that have a verified-location photo — candidates for
  // the cover picker. Sorted by date → sortOrder so the strip mirrors the
  // itinerary reading order. Hidden entirely in create mode (no stops yet).
  const photoCandidates = useMemo(() => {
    if (!trip) return [];
    const sorted = [...trip.stops].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.sortOrder - b.sortOrder;
    });
    return sorted.flatMap((stop) => {
      const photo = getStopPhoto(stop);
      return photo ? [{ stop, photo }] : [];
    });
  }, [trip]);

  // Ring follows the *resolved* cover (explicit pick or default fallback) so
  // the strip always shows what the banner will render.
  const resolvedCoverStopId = useMemo(() => {
    if (!trip) return null;
    const resolved = resolveCoverStop({
      coverStopId: form.values.coverStopId,
      stops: trip.stops,
    });
    return resolved?.id ?? null;
  }, [trip, form.values.coverStopId]);

  const createMutation = useMutation({
    mutationFn: (data: CreateTripDto) => api.createTrip(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      notifications.show({
        title: 'Trip created',
        message: 'Your trip has been saved.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      onClose();
    },
    onError: () => {
      notifications.show({
        title: 'Failed to create trip',
        message: 'An error occurred. Please try again.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTripDto }) =>
      api.updateTrip(id, data),
    onSuccess: (_data, variables) => {
      // Invalidate both the list query and the specific trip detail query —
      // TripDetail observes ['trip', tripId] and without this its cached trip
      // object stays stale after an edit (e.g. cover photo swap).
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['trip', variables.id] });
      notifications.show({
        title: 'Trip updated',
        message: 'Your changes have been saved.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      onClose();
    },
    onError: () => {
      notifications.show({
        title: 'Failed to update trip',
        message: 'An error occurred. Please try again.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (values: TripFormValues) => {
    if (!values.startDate || !values.endDate) return;

    const startDateStr = pickerToYmd(values.startDate);
    const endDateStr = pickerToYmd(values.endDate);
    const totalBudget =
      values.totalBudget === '' || values.totalBudget === null
        ? null
        : Number(values.totalBudget);
    const rating = values.rating === 0 ? null : values.rating;
    const categoryBudgets = values.categoryBudgets.filter(
      (cb) => cb.categoryId !== '' && cb.amount > 0,
    );
    const photoAlbumUrl = values.photoAlbumUrl.trim() === '' ? null : values.photoAlbumUrl.trim();

    if (isEdit && trip) {
      updateMutation.mutate({
        id: trip.id,
        data: {
          name: values.name.trim(),
          startDate: startDateStr,
          endDate: endDateStr,
          totalBudget,
          rating,
          notes: values.notes.trim(),
          categoryBudgets,
          photoAlbumUrl,
          coverStopId: values.coverStopId,
        },
      });
    } else {
      createMutation.mutate({
        name: values.name.trim(),
        startDate: startDateStr,
        endDate: endDateStr,
        totalBudget,
        rating,
        notes: values.notes.trim(),
        categoryBudgets,
        photoAlbumUrl,
        coverStopId: values.coverStopId,
      });
    }
  };

  const addCategoryBudget = () => {
    form.setFieldValue('categoryBudgets', [
      ...form.values.categoryBudgets,
      { categoryId: '', amount: 0 },
    ]);
  };

  const removeCategoryBudget = (index: number) => {
    form.setFieldValue(
      'categoryBudgets',
      form.values.categoryBudgets.filter((_, i) => i !== index),
    );
  };

  const updateCategoryBudget = (
    index: number,
    field: keyof TripCategoryBudget,
    value: string | number,
  ) => {
    const updated = form.values.categoryBudgets.map((cb, i) =>
      i === index ? { ...cb, [field]: value } : cb,
    );
    form.setFieldValue('categoryBudgets', updated);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Edit Trip' : 'Create Trip'}
      size="lg"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="sm">
          <TextInput
            label="Trip Name"
            placeholder="Costa Rica 2026"
            required
            {...form.getInputProps('name')}
          />

          {tagPreview && (
            <Text size="sm" c="dimmed">
              Tag: <Code>{tagPreview}</Code>
            </Text>
          )}

          <Group grow>
            <DatePickerInput
              label="Start Date"
              placeholder="Pick start date"
              required
              valueFormat="MMM D, YYYY"
              highlightToday
              {...form.getInputProps('startDate')}
            />
            <DatePickerInput
              label="End Date"
              placeholder="Pick end date"
              required
              valueFormat="MMM D, YYYY"
              highlightToday
              minDate={form.values.startDate ?? undefined}
              {...form.getInputProps('endDate')}
            />
          </Group>

          <NumberInput
            label="Total Budget"
            placeholder="Optional"
            min={0}
            decimalScale={2}
            prefix="$"
            {...form.getInputProps('totalBudget')}
          />

          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Category Budgets
              </Text>
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={12} />}
                onClick={addCategoryBudget}
                disabled={categoriesLoading}
              >
                Add Category
              </Button>
            </Group>

            {form.values.categoryBudgets.map((cb, index) => (
              <Group key={index} gap="xs">
                <Select
                  style={{ flex: 2 }}
                  placeholder="Select category"
                  data={categoryOptions}
                  value={cb.categoryId || null}
                  onChange={(val) =>
                    updateCategoryBudget(index, 'categoryId', val ?? '')
                  }
                  searchable
                  clearable
                />
                <NumberInput
                  style={{ flex: 1 }}
                  placeholder="Amount"
                  min={0}
                  decimalScale={2}
                  prefix="$"
                  value={cb.amount}
                  onChange={(val) =>
                    updateCategoryBudget(index, 'amount', Number(val) || 0)
                  }
                />
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() => removeCategoryBudget(index)}
                  aria-label="Remove category budget"
                >
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>

          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Rating
            </Text>
            <Rating
              value={form.values.rating}
              onChange={(val) => form.setFieldValue('rating', val)}
              fractions={1}
            />
          </Stack>

          {isEdit && photoCandidates.length > 0 && (
            <Stack gap={6}>
              <Group justify="space-between" align="center">
                <Text size="sm" fw={500}>
                  Cover photo
                </Text>
                {form.values.coverStopId !== null && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => form.setFieldValue('coverStopId', null)}
                  >
                    Use default
                  </Button>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                Choose the stop whose photo appears on the trip header.
              </Text>
              <ScrollArea
                scrollbarSize={6}
                offsetScrollbars="x"
                type="auto"
              >
                <Group gap="xs" wrap="nowrap" py={2}>
                  {photoCandidates.map(({ stop, photo }) => (
                    <CoverPhotoThumb
                      key={stop.id}
                      stopType={stop.type}
                      stopLabel={coverThumbLabel(stop)}
                      photoName={photo.photoName}
                      selected={resolvedCoverStopId === stop.id}
                      onSelect={() => form.setFieldValue('coverStopId', stop.id)}
                    />
                  ))}
                </Group>
              </ScrollArea>
            </Stack>
          )}

          <Textarea
            label="Notes"
            placeholder="Travel notes, memories, tips..."
            autosize
            minRows={2}
            maxRows={6}
            {...form.getInputProps('notes')}
          />

          <TextInput
            label="Photos album URL"
            placeholder="https://photos.google.com/share/..."
            description="Optional link to a Google Photos album or other provider"
            {...form.getInputProps('photoAlbumUrl')}
          />

          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              {isEdit ? 'Save Changes' : 'Create Trip'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
