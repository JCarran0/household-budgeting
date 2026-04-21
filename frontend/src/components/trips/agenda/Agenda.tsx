import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { IconMoonStars, IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api } from '../../../lib/api';
import {
  computeAgendaDayRange,
  enumerateDateRange,
  findActiveStay,
  groupStopsByDay,
  isTransitBaseChange,
} from '../../../../../shared/utils/tripHelpers';
import type {
  Stop,
  StayStop,
  TransitStop,
  TripSummary,
} from '../../../../../shared/types';
import { DaySection } from './DaySection';
import { StayBanner } from './StayBanner';
import { TransitConnectorTile } from './TransitConnectorTile';

const COLLAPSE_STORAGE_PREFIX = 'trip-agenda:collapsed:';

interface AgendaProps {
  trip: TripSummary;
  onAddStop?: (defaultDate: string, defaultType?: Stop['type']) => void;
  onEditStop?: (stop: Stop) => void;
  onDeleteStop?: (stop: Stop) => void;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Compute contiguous ranges of days NOT covered by any stay. Used for REQ-041 nudges.
 * `trip.endDate` is the declared travel-home day — Stay `endDate` is night-based (last
 * night slept there), so the trip's final day needs no lodging and is skipped.
 */
function uncoveredRanges(
  days: string[],
  stops: Stop[],
  tripEndDate: string,
): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  let currentStart: string | null = null;
  let currentEnd: string | null = null;
  const closeRange = () => {
    if (currentStart && currentEnd) {
      ranges.push({ start: currentStart, end: currentEnd });
    }
    currentStart = null;
    currentEnd = null;
  };
  for (const d of days) {
    if (d === tripEndDate) {
      closeRange();
      continue;
    }
    const active = findActiveStay(stops, d);
    if (!active) {
      if (currentStart === null) {
        currentStart = d;
      }
      currentEnd = d;
    } else {
      closeRange();
    }
  }
  closeRange();
  return ranges;
}

export function Agenda({ trip, onAddStop, onEditStop, onDeleteStop }: AgendaProps) {
  const queryClient = useQueryClient();
  const stops = trip.stops;
  const [searchParams, setSearchParams] = useSearchParams();

  const reorderMutation = useMutation({
    mutationFn: (updates: { id: string; sortOrder: number }[]) =>
      api.reorderStops(trip.id, { updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', trip.id] });
    },
    onError: () => {
      notifications.show({
        title: 'Reorder failed',
        message: 'Could not save the new order. Please try again.',
        color: 'red',
      });
      queryClient.invalidateQueries({ queryKey: ['trip', trip.id] });
    },
  });

  // Compute agenda day range + per-day buckets.
  const { days, stopsByDay, stays } = useMemo(() => {
    const { start, end } = computeAgendaDayRange(stops, trip);
    const range = enumerateDateRange(start, end);
    const byDay = groupStopsByDay(stops);
    const stayList = stops.filter((s): s is StayStop => s.type === 'stay');
    return { days: range, stopsByDay: byDay, stays: stayList };
  }, [stops, trip]);

  // Pre-compute which transits are base-change (connector) vs day-trip (inline).
  const baseChangeTransitIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of stops) {
      if (s.type === 'transit' && isTransitBaseChange(s, stops)) {
        set.add(s.id);
      }
    }
    return set;
  }, [stops]);

  // Collapse state per day, persisted to sessionStorage.
  const storageKey = `${COLLAPSE_STORAGE_PREFIX}${trip.id}`;
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(collapsedDays));
    } catch {
      /* quota full — fine to skip */
    }
  }, [storageKey, collapsedDays]);

  const toggleDay = useCallback((date: string) => {
    setCollapsedDays((prev) => ({ ...prev, [date]: !prev[date] }));
  }, []);

  // Deep-link target: scroll the matching stop into view, pulse-highlight it,
  // then strip the ?stop param from the URL so reloads stay clean.
  const stopParam = searchParams.get('stop');
  useEffect(() => {
    if (!stopParam) return;
    const target = stops.find((s) => s.id === stopParam);
    if (!target) {
      // Stale share link — silent no-op, but strip the bad param.
      const next = new URLSearchParams(searchParams);
      next.delete('stop');
      setSearchParams(next, { replace: true });
      return;
    }
    // If the target's day is collapsed, expand it so the scroll lands on a real node.
    setCollapsedDays((prev) => (prev[target.date] ? { ...prev, [target.date]: false } : prev));

    // Wait for next frame so expanded day has rendered, then locate + scroll + pulse.
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-stop-id="${stopParam}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Pulse highlight via Web Animations API — no global CSS needed.
        el.animate(
          [
            { boxShadow: '0 0 0 3px var(--mantine-color-blue-filled)', backgroundColor: 'var(--mantine-color-blue-light)' },
            { boxShadow: '0 0 0 0 transparent', backgroundColor: 'transparent' },
          ],
          { duration: 2000, easing: 'ease-out' },
        );
      }
      const next = new URLSearchParams(searchParams);
      next.delete('stop');
      setSearchParams(next, { replace: true });
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopParam]);

  // Drag-to-reorder: limited to untimed stops within the same day.
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (source.droppableId !== destination.droppableId) return; // cross-day drag disabled
      if (source.index === destination.index) return;

      const date = source.droppableId.replace(/^day:/, '');

      // Rebuild this day's untimed list in its new order.
      const dayStops = (stopsByDay.get(date) ?? []).filter(
        (s) => s.time === null && !(s.type === 'transit' && baseChangeTransitIds.has(s.id)) && s.type !== 'stay',
      );
      const sorted = [...dayStops].sort((a, b) => a.sortOrder - b.sortOrder);
      const moved = sorted.find((s) => s.id === draggableId);
      if (!moved) return;
      const without = sorted.filter((s) => s.id !== draggableId);
      without.splice(destination.index, 0, moved);

      const updates = without.map((s, i) => ({ id: s.id, sortOrder: i }));
      reorderMutation.mutate(updates);
    },
    [stopsByDay, baseChangeTransitIds, reorderMutation],
  );

  const today = todayIso();
  const nominalStart = trip.startDate;
  const nominalEnd = trip.endDate;

  // Identify days where a new stay chapter begins (for banner placement).
  const stayFirstDay = useMemo(() => {
    const map = new Map<string, StayStop>(); // date -> stay
    for (const s of stays) map.set(s.date, s);
    return map;
  }, [stays]);

  // Build the render sequence.
  const blocks: ReactNode[] = [];
  let prevStayId: string | null = null;

  for (const date of days) {
    const activeStay = findActiveStay(stops, date);
    const stayChanged = (activeStay?.id ?? null) !== prevStayId;

    // Render base-change transits dated on this day at the chapter boundary.
    if (stayChanged) {
      const transitsToday = (stopsByDay.get(date) ?? []).filter(
        (s): s is TransitStop => s.type === 'transit' && baseChangeTransitIds.has(s.id),
      );
      for (const t of transitsToday) {
        blocks.push(
          <TransitConnectorTile
            key={`connector-${t.id}`}
            transit={t}
            onEdit={onEditStop}
            onDelete={onDeleteStop}
          />,
        );
      }
    }

    // Chapter banner on the first day of a stay.
    if (activeStay && date === activeStay.date && stayFirstDay.has(date)) {
      const totalNights =
        enumerateDateRange(activeStay.date, activeStay.endDate).length;
      blocks.push(
        <StayBanner
          key={`banner-${activeStay.id}`}
          stay={activeStay}
          totalNights={totalNights}
          onEdit={onEditStop}
        />,
      );
    }

    // Day section — filter out stays (shown as banners) and base-change transits.
    const rawDayStops = stopsByDay.get(date) ?? [];
    const dayStops = rawDayStops.filter((s) => {
      if (s.type === 'stay') return false;
      if (s.type === 'transit' && baseChangeTransitIds.has(s.id)) return false;
      return true;
    });

    const dayIndex: number | null =
      date >= nominalStart
        ? enumerateDateRange(nominalStart, date).length
        : null; // pre-trip days have no natural "Day N" label

    blocks.push(
      <DaySection
        key={`day-${date}`}
        date={date}
        dayIndex={dayIndex}
        stops={dayStops}
        collapsed={!!collapsedDays[date]}
        onToggle={() => toggleDay(date)}
        isToday={date === today}
        isOutsideNominalRange={date < nominalStart || date > nominalEnd}
        onAddStop={onAddStop}
        onEditStop={onEditStop}
        onDeleteStop={onDeleteStop}
      />,
    );

    prevStayId = activeStay?.id ?? null;
  }

  // Gap-day Stay nudges: inserted after each uncovered range boundary.
  const uncovered = useMemo(
    () => uncoveredRanges(days, stops, trip.endDate),
    [days, stops, trip.endDate],
  );
  const gapNudges = uncovered.map((range) => (
    <Paper
      key={`gap-${range.start}`}
      withBorder
      radius="md"
      p="sm"
      style={{ borderStyle: 'dashed' }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <IconMoonStars size={18} color="var(--mantine-color-gray-5)" />
          <Text size="sm" c="dimmed">
            Where are you staying
            {range.start === range.end
              ? ` on ${range.start}`
              : ` from ${range.start} to ${range.end}`}
            ?
          </Text>
        </Group>
        {onAddStop && (
          <Button
            variant="light"
            size="xs"
            leftSection={<IconPlus size={12} />}
            onClick={() => onAddStop(range.start, 'stay')}
          >
            Add Stay
          </Button>
        )}
      </Group>
    </Paper>
  ));

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Stack gap="sm">
        {gapNudges}
        {blocks}
      </Stack>
    </DragDropContext>
  );
}
