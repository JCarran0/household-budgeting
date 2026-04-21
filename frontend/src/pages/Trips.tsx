import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Title,
  Stack,
  Group,
  Button,
  Select,
  TextInput,
  Paper,
  Text,
  Badge,
  Loader,
  Center,
  Alert,
  ThemeIcon,
  ActionIcon,
  Tooltip,
  Modal,
  NumberInput,
  Textarea,
  Rating,
  Code,
  Image,
  ScrollArea,
  UnstyledButton,
  Box,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconSearch,
  IconAlertCircle,
  IconEdit,
  IconTrash,
  IconCheck,
  IconX,
  IconMapPin,
  IconCalendar,
  IconBed,
  IconToolsKitchen2,
  IconCompass,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { TripCoverBanner } from '../components/trips/TripCoverBanner';
import { useCategoryOptions } from '../hooks/useCategoryOptions';
import { formatCurrency } from '../utils/formatters';
import type { Stop, TripSummary, TripCategoryBudget, CreateTripDto, UpdateTripDto } from '../../../shared/types';
import { generateTripTag, getStopPhoto, resolveCoverStop } from '../../../shared/utils/tripHelpers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_BADGE_COLOR: Record<TripSummary['status'], string> = {
  upcoming: 'blue',
  active: 'green',
  completed: 'gray',
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CoverPhotoThumb — one thumbnail in the cover-photo picker strip
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// TripFormModal — create or edit a trip
// ---------------------------------------------------------------------------

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

  // Derived tag preview
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

  // Create mutation
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

  // Update mutation
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
          {/* Name */}
          <TextInput
            label="Trip Name"
            placeholder="Costa Rica 2026"
            required
            {...form.getInputProps('name')}
          />

          {/* Tag preview */}
          {tagPreview && (
            <Text size="sm" c="dimmed">
              Tag: <Code>{tagPreview}</Code>
            </Text>
          )}

          {/* Dates */}
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

          {/* Total budget */}
          <NumberInput
            label="Total Budget"
            placeholder="Optional"
            min={0}
            decimalScale={2}
            prefix="$"
            {...form.getInputProps('totalBudget')}
          />

          {/* Category budgets */}
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

          {/* Rating */}
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

          {/* Cover photo picker */}
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

          {/* Notes */}
          <Textarea
            label="Notes"
            placeholder="Travel notes, memories, tips..."
            autosize
            minRows={2}
            maxRows={6}
            {...form.getInputProps('notes')}
          />

          {/* Photo album URL */}
          <TextInput
            label="Photos album URL"
            placeholder="https://photos.google.com/share/..."
            description="Optional link to a Google Photos album or other provider"
            {...form.getInputProps('photoAlbumUrl')}
          />

          {/* Actions */}
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

// ---------------------------------------------------------------------------
// DeleteTripModal — confirmation dialog
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// TripCard — list row that links to the detail page
// ---------------------------------------------------------------------------

interface TripCardProps {
  trip: TripSummary;
  onEdit: (trip: TripSummary) => void;
  onDelete: (trip: TripSummary) => void;
}

function formatTripDateRange(start: string, end: string): string {
  try {
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);

    if (sy === ey) {
      return `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d, yyyy')}`;
    }
    return `${format(startDate, 'MMM d, yyyy')} – ${format(endDate, 'MMM d, yyyy')}`;
  } catch {
    return `${start} – ${end}`;
  }
}

function TripCard({ trip, onEdit, onDelete }: TripCardProps) {
  const budgetLabel = trip.totalBudget !== null
    ? `${formatCurrency(trip.totalSpent)} / ${formatCurrency(trip.totalBudget)}`
    : formatCurrency(trip.totalSpent);

  const overBudget =
    trip.totalBudget !== null && trip.totalSpent > trip.totalBudget;

  const stopNav = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  const coverStop = resolveCoverStop(trip);
  const coverPhoto = coverStop ? getStopPhoto(coverStop) : null;

  if (coverPhoto) {
    return (
      <Paper
        component={Link}
        to={`/trips/${trip.id}`}
        withBorder
        radius="md"
        p={0}
        style={{
          display: 'block',
          textDecoration: 'none',
          color: 'inherit',
          overflow: 'hidden',
        }}
      >
        <TripCoverBanner
          photoName={coverPhoto.photoName}
          attribution={coverPhoto.attribution}
          title={trip.name}
          dateRange={formatTripDateRange(trip.startDate, trip.endDate)}
          statusLabel={trip.status}
          statusColor={STATUS_BADGE_COLOR[trip.status]}
          compact
          actions={
            <Group gap={2} wrap="nowrap">
              <ActionIcon
                variant="transparent"
                c="white"
                onClick={stopNav(() => onEdit(trip))}
                aria-label="Edit trip"
              >
                <IconEdit size={16} />
              </ActionIcon>
              <ActionIcon
                variant="transparent"
                c="white"
                onClick={stopNav(() => onDelete(trip))}
                aria-label="Delete trip"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          }
        />
        <Group justify="space-between" wrap="nowrap" px="md" py="xs">
          <Text size="sm" fw={600} c={overBudget ? 'red' : undefined}>
            {budgetLabel}
          </Text>
          {trip.rating !== null && (
            <Rating value={trip.rating} readOnly size="xs" fractions={1} />
          )}
        </Group>
      </Paper>
    );
  }

  return (
    <Paper
      component={Link}
      to={`/trips/${trip.id}`}
      withBorder
      radius="md"
      p="md"
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon variant="light" size="md" color="blue">
            <IconMapPin size={16} />
          </ThemeIcon>
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} truncate>
                {trip.name}
              </Text>
              <Badge
                size="xs"
                color={STATUS_BADGE_COLOR[trip.status]}
                variant="light"
              >
                {trip.status}
              </Badge>
            </Group>
            <Group gap="xs" c="dimmed">
              <IconCalendar size={12} />
              <Text size="xs">
                {formatTripDateRange(trip.startDate, trip.endDate)}
              </Text>
            </Group>
          </Stack>
        </Group>

        <Group gap="sm" wrap="nowrap">
          <Stack gap={0} align="flex-end">
            <Text
              size="sm"
              fw={600}
              c={overBudget ? 'red' : undefined}
            >
              {budgetLabel}
            </Text>
            {trip.rating !== null && (
              <Rating
                value={trip.rating}
                readOnly
                size="xs"
                fractions={1}
              />
            )}
          </Stack>

          <Tooltip label="Edit trip">
            <ActionIcon
              variant="subtle"
              color="blue"
              onClick={stopNav(() => onEdit(trip))}
              aria-label="Edit trip"
            >
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete trip">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={stopNav(() => onDelete(trip))}
              aria-label="Delete trip"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Trips — main page component
// ---------------------------------------------------------------------------

export function Trips() {
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');

  // Modal state — create/edit
  const [formModalOpened, { open: openFormModal, close: closeFormModal }] =
    useDisclosure(false);
  const [editingTrip, setEditingTrip] = useState<TripSummary | null>(null);

  // Modal state — delete confirmation
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] =
    useDisclosure(false);
  const [deletingTrip, setDeletingTrip] = useState<TripSummary | null>(null);

  // Fetch all trip summaries (unfiltered by year; we filter client-side)
  const {
    data: trips,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['trips', 'summaries', null],
    queryFn: () => api.getTripsSummaries(),
    staleTime: 1000 * 60 * 2, // warm — list view
  });

  // Derive unique years from trips for the year filter
  const yearOptions = useMemo(() => {
    if (!trips || trips.length === 0) return [];
    const years = Array.from(
      new Set(trips.map((t) => new Date(t.startDate).getFullYear())),
    ).sort((a, b) => b - a);
    return years.map((y) => ({ value: String(y), label: String(y) }));
  }, [trips]);

  // Client-side filtering: year + search
  const filteredTrips = useMemo(() => {
    if (!trips) return [];

    // Sort by most recent startDate first
    const sorted = [...trips].sort(
      (a, b) =>
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );

    return sorted.filter((trip) => {
      const yearMatch =
        selectedYear === null ||
        new Date(trip.startDate).getFullYear() === Number(selectedYear);

      const searchMatch =
        search.trim() === '' ||
        trip.name.toLowerCase().includes(search.trim().toLowerCase());

      return yearMatch && searchMatch;
    });
  }, [trips, selectedYear, search]);

  // Handlers for actions
  const handleOpenCreate = () => {
    setEditingTrip(null);
    openFormModal();
  };

  const handleOpenEdit = (trip: TripSummary) => {
    setEditingTrip(trip);
    openFormModal();
  };

  const handleOpenDelete = (trip: TripSummary) => {
    setDeletingTrip(trip);
    openDeleteModal();
  };

  const handleFormClose = () => {
    closeFormModal();
    // Delay clearing editingTrip so the modal closing animation doesn't flash
    setTimeout(() => setEditingTrip(null), 300);
  };

  const handleDeleteClose = () => {
    closeDeleteModal();
    setTimeout(() => setDeletingTrip(null), 300);
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        {/* Page header */}
        <Group justify="space-between">
          <Group gap="sm">
            <ThemeIcon variant="light" size="lg" color="blue">
              <IconMapPin size={20} />
            </ThemeIcon>
            <Title order={2}>Trips</Title>
          </Group>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={handleOpenCreate}
          >
            Create Trip
          </Button>
        </Group>

        {/* Filter bar */}
        <Group gap="sm">
          <Select
            label="Year"
            placeholder="All years"
            data={yearOptions}
            value={selectedYear}
            onChange={setSelectedYear}
            clearable
            w={140}
          />
          <TextInput
            label="Search"
            placeholder="Search trips..."
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
        </Group>

        {/* Loading state */}
        {isLoading && (
          <Center py="xl">
            <Loader />
          </Center>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            title="Failed to load trips"
            color="red"
          >
            Unable to fetch trip data. Please refresh and try again.
          </Alert>
        )}

        {/* Empty state */}
        {!isLoading && !error && filteredTrips.length === 0 && (
          <Center py="xl">
            <Stack align="center" gap="sm">
              <ThemeIcon size="xl" variant="light" color="gray">
                <IconMapPin size={24} />
              </ThemeIcon>
              <Text c="dimmed" size="lg">
                {trips && trips.length > 0
                  ? 'No trips match your filters'
                  : 'No trips yet'}
              </Text>
              {(!trips || trips.length === 0) && (
                <Text c="dimmed" size="sm" ta="center">
                  Create your first trip to start tracking travel spending.
                </Text>
              )}
              {trips && trips.length > 0 && (
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    setSelectedYear(null);
                    setSearch('');
                  }}
                >
                  Clear filters
                </Button>
              )}
            </Stack>
          </Center>
        )}

        {/* Trip cards */}
        {!isLoading && !error && filteredTrips.length > 0 && (
          <Stack gap="sm">
            {filteredTrips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                onEdit={handleOpenEdit}
                onDelete={handleOpenDelete}
              />
            ))}
          </Stack>
        )}
      </Stack>

      {/* Create / Edit modal */}
      <TripFormModal
        opened={formModalOpened}
        onClose={handleFormClose}
        trip={editingTrip}
      />

      {/* Delete confirmation modal */}
      <DeleteTripModal
        opened={deleteModalOpened}
        onClose={handleDeleteClose}
        trip={deletingTrip}
      />
    </Container>
  );
}
