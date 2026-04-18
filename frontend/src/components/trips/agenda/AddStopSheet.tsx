import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
  Paper,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconBed,
  IconToolsKitchen2,
  IconMasksTheater,
  IconArrowRight,
  IconArrowLeft,
} from '@tabler/icons-react';
import { api } from '../../../lib/api';
import type {
  CreateStopDto,
  Stop,
  StopLocation,
  TransitMode,
  TransitStop,
  UpdateStopDto,
} from '../../../../../shared/types';
import { StayForm } from './forms/StayForm';
import { EatPlayForm } from './forms/EatPlayForm';
import { TransitForm } from './forms/TransitForm';

type SheetState =
  | { kind: 'picker' }
  | { kind: 'form'; type: Stop['type']; defaultMode?: TransitMode };

interface AddStopSheetProps {
  opened: boolean;
  onClose: () => void;
  tripId: string;
  defaultDate: string;
  /** When set, opens directly into the matching form. Usually used for edit. */
  initialType?: Stop['type'];
  /** When set, pre-selects the transit mode on open (e.g. "I'm flying first"). */
  initialTransitMode?: TransitMode;
  /** When set, the sheet operates in edit mode for this stop. */
  editingStop?: Stop | null;
  /** Other stops on the trip (used to pre-fill Transit from/to endpoints). */
  tripStops?: Stop[];
}

interface StopTypeOption {
  type: Stop['type'];
  label: string;
  description: string;
  icon: typeof IconBed;
  color: string;
}

const OPTIONS: StopTypeOption[] = [
  { type: 'stay', label: 'Stay', description: 'A place to sleep', icon: IconBed, color: 'blue' },
  { type: 'eat', label: 'Eat', description: 'Meal or café', icon: IconToolsKitchen2, color: 'orange' },
  { type: 'play', label: 'Play', description: 'Activity or sight', icon: IconMasksTheater, color: 'grape' },
  { type: 'transit', label: 'Transit', description: 'Moving between places', icon: IconArrowRight, color: 'gray' },
];

function suggestTransitEndpoints(
  tripStops: Stop[],
  date: string,
): { from: StopLocation | null; to: StopLocation | null } {
  // Find the last stop before `date` and first after, picking the closest
  // anchor with a usable location (REQ-035).
  const sorted = [...tripStops].sort((a, b) => a.date.localeCompare(b.date));
  const before = [...sorted].reverse().find((s) => s.date < date);
  const after = sorted.find((s) => s.date > date);

  const pickOutgoing = (stop: Stop | undefined): StopLocation | null => {
    if (!stop) return null;
    if (stop.type === 'transit') return stop.toLocation;
    if (stop.type === 'stay') return stop.location;
    return stop.location;
  };
  const pickIncoming = (stop: Stop | undefined): StopLocation | null => {
    if (!stop) return null;
    if (stop.type === 'transit') return stop.fromLocation;
    if (stop.type === 'stay') return stop.location;
    return stop.location;
  };

  return {
    from: pickOutgoing(before),
    to: pickIncoming(after),
  };
}

export function AddStopSheet({
  opened,
  onClose,
  tripId,
  defaultDate,
  initialType,
  initialTransitMode,
  editingStop,
  tripStops = [],
}: AddStopSheetProps) {
  const queryClient = useQueryClient();
  const isEdit = !!editingStop;

  const [state, setState] = useState<SheetState>(() => {
    if (editingStop) return { kind: 'form', type: editingStop.type };
    if (initialType) return { kind: 'form', type: initialType, defaultMode: initialTransitMode };
    return { kind: 'picker' };
  });

  // Reset state when the sheet opens.
  useEffect(() => {
    if (!opened) return;
    if (editingStop) setState({ kind: 'form', type: editingStop.type });
    else if (initialType) setState({ kind: 'form', type: initialType, defaultMode: initialTransitMode });
    else setState({ kind: 'picker' });
  }, [opened, editingStop, initialType, initialTransitMode]);

  const transitSuggestions = useMemo(
    () => suggestTransitEndpoints(tripStops, defaultDate),
    [tripStops, defaultDate],
  );

  const createMutation = useMutation({
    mutationFn: (payload: CreateStopDto) => api.createStop(tripId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      notifications.show({ title: 'Stop added', message: '', color: 'green' });
      onClose();
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? 'Could not add stop.';
      notifications.show({ title: 'Failed to add stop', message, color: 'red' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ stopId, payload }: { stopId: string; payload: UpdateStopDto }) =>
      api.updateStop(tripId, stopId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      notifications.show({ title: 'Stop updated', message: '', color: 'green' });
      onClose();
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? 'Could not save changes.';
      notifications.show({ title: 'Failed to save', message, color: 'red' });
    },
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const submitCreate = (payload: CreateStopDto) => createMutation.mutate(payload);
  const submitUpdate = (payload: UpdateStopDto) =>
    editingStop && updateMutation.mutate({ stopId: editingStop.id, payload });

  const handleBack = () => {
    if (isEdit) {
      // No type-picker in edit mode — back collapses to cancel.
      onClose();
      return;
    }
    setState({ kind: 'picker' });
  };

  const renderForm = () => {
    if (state.kind !== 'form') return null;
    const { type } = state;

    if (type === 'stay') {
      return (
        <StayForm
          defaultDate={defaultDate}
          existing={editingStop?.type === 'stay' ? editingStop : null}
          onSubmit={(payload) => {
            if (isEdit) submitUpdate(payload as UpdateStopDto);
            else submitCreate(payload as CreateStopDto);
          }}
          onCancel={onClose}
          onBack={handleBack}
          isSubmitting={isSubmitting}
        />
      );
    }

    if (type === 'eat' || type === 'play') {
      return (
        <EatPlayForm
          variant={type}
          defaultDate={defaultDate}
          existing={
            editingStop && (editingStop.type === 'eat' || editingStop.type === 'play')
              ? editingStop
              : null
          }
          onSubmit={(payload) => {
            if (isEdit) submitUpdate(payload as UpdateStopDto);
            else submitCreate(payload as CreateStopDto);
          }}
          onCancel={onClose}
          onBack={handleBack}
          isSubmitting={isSubmitting}
        />
      );
    }

    // transit
    return (
      <TransitForm
        defaultDate={defaultDate}
        defaultMode={state.defaultMode}
        suggestedFrom={transitSuggestions.from}
        suggestedTo={transitSuggestions.to}
        existing={editingStop?.type === 'transit' ? (editingStop as TransitStop) : null}
        onSubmit={(payload) => {
          if (isEdit) submitUpdate(payload as UpdateStopDto);
          else submitCreate(payload as CreateStopDto);
        }}
        onCancel={onClose}
        onBack={handleBack}
        isSubmitting={isSubmitting}
      />
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        state.kind === 'picker'
          ? 'Add a stop'
          : isEdit
            ? `Edit ${state.type}`
            : `Add a ${state.type}`
      }
      size="lg"
    >
      {state.kind === 'picker' ? (
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            {OPTIONS.map((opt) => (
              <UnstyledButton
                key={opt.type}
                onClick={() => setState({ kind: 'form', type: opt.type })}
              >
                <Paper withBorder radius="md" p="md" h="100%">
                  <Stack align="center" gap="xs">
                    <ThemeIcon variant="light" size="lg" color={opt.color}>
                      <opt.icon size={20} />
                    </ThemeIcon>
                    <Text fw={600} size="sm">
                      {opt.label}
                    </Text>
                    <Text size="xs" c="dimmed" ta="center">
                      {opt.description}
                    </Text>
                  </Stack>
                </Paper>
              </UnstyledButton>
            ))}
          </SimpleGrid>
          <Group justify="flex-end" pt="xs">
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="sm">
          {!isEdit && (
            <Button
              variant="subtle"
              size="compact-xs"
              leftSection={<IconArrowLeft size={12} />}
              onClick={() => setState({ kind: 'picker' })}
              style={{ alignSelf: 'flex-start' }}
            >
              Pick a different type
            </Button>
          )}
          {renderForm()}
        </Stack>
      )}
    </Modal>
  );
}

function extractErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const maybeResp = (err as { response?: { data?: { error?: string } } }).response;
  return maybeResp?.data?.error ?? null;
}
