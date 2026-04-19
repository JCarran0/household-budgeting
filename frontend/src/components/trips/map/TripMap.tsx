import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  APIProvider,
  APILoadingStatus,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { Alert, Box, Center, Group, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import type { Stop, TransitStop, TripSummary, VerifiedLocation } from '../../../../../shared/types';
import {
  computeAgendaDayRange,
  enumerateDateRange,
  hasVerifiedCoords,
  isTransitBaseChange,
} from '../../../../../shared/utils/tripHelpers';
import { StopPin } from './StopPin';
import { TransitLine } from './TransitLine';
import { StopPopup } from './StopPopup';
import { DayFilterBar, type DayFilterChip } from './DayFilterBar';

// The Google Cloud Map ID enables AdvancedMarkers. `DEMO_MAP_ID` is Google's
// public demo ID — fine for our 2-user app; override via env for custom styling.
const DEFAULT_MAP_ID = 'DEMO_MAP_ID';

export interface TripMapProps {
  trip: TripSummary;
  stops: Stop[];
  /**
   * Which transits to render as lines. Defaults to base-change transits only
   * (REQ-016/017); day-trip transits are intentionally omitted in V2 and can
   * be enabled later without refactoring the renderer (D5).
   */
  transitFilter?: (t: TransitStop, stops: Stop[]) => boolean;
}

/** A pinnable stop paired with its resolved verified coords. */
export interface MapPin {
  stop: Stop;
  coords: VerifiedLocation;
  dayIndex: number;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pinCoords(stop: Stop): VerifiedLocation | null {
  if (stop.type === 'stay') return stop.location;
  if ((stop.type === 'eat' || stop.type === 'play') && stop.location?.kind === 'verified') {
    return stop.location;
  }
  return null;
}

export function TripMap({ trip, stops, transitFilter = isTransitBaseChange }: TripMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  const mapId = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) ?? DEFAULT_MAP_ID;

  if (!apiKey) {
    return (
      <Alert color="yellow" icon={<IconAlertCircle size={16} />} title="Map unavailable">
        Google Maps is not configured. Set VITE_GOOGLE_PLACES_API_KEY to enable the map.
      </Alert>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={['places', 'marker', 'geometry']}>
      <TripMapLoadGuard>
        <TripMapContent trip={trip} stops={stops} mapId={mapId} transitFilter={transitFilter} />
      </TripMapLoadGuard>
    </APIProvider>
  );
}

/**
 * Swaps in a fallback card if Maps JS fails to load (bad key, billing
 * suspended, network). The existing Itinerary tab remains the canonical
 * surface when the map is unavailable.
 */
function TripMapLoadGuard({ children }: { children: React.ReactNode }) {
  const status = useApiLoadingStatus();
  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />} title="Map unavailable">
        The map could not be loaded. Stops are still visible in the Itinerary tab.
      </Alert>
    );
  }
  return <>{children}</>;
}

interface TripMapContentProps extends Required<Pick<TripMapProps, 'trip' | 'stops'>> {
  mapId: string;
  transitFilter: (t: TransitStop, stops: Stop[]) => boolean;
}

interface TransitSegment {
  transit: TransitStop;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  /** Dates (ISO) this segment is active on — both the departure and arrival day. */
  activeDates: string[];
}

/**
 * For a base-change transit, resolve endpoint coords from the bracketing Stays.
 * Returns null when either side has no covering stay (the transit lands mid-air
 * or the trip starts/ends with a transit — lines without a resolved endpoint
 * are skipped rather than guessed).
 */
function resolveTransitEndpoints(
  transit: TransitStop,
  stops: Stop[],
): { from: VerifiedLocation; to: VerifiedLocation; fromDate: string } | null {
  const stays = stops.filter(
    (s): s is Extract<Stop, { type: 'stay' }> => s.type === 'stay',
  );

  // Day before transit — outgoing stay (the one we're leaving).
  const [y, m, d] = transit.date.split('-').map(Number);
  const prev = new Date(y, m - 1, d - 1);
  const prevIso = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;

  const outgoing = stays.find((s) => prevIso >= s.date && prevIso <= s.endDate);
  const arriving = stays.find((s) => transit.date >= s.date && transit.date <= s.endDate);

  if (!outgoing || !arriving) return null;
  return { from: outgoing.location, to: arriving.location, fromDate: prevIso };
}

function TripMapContent({ trip, stops, mapId, transitFilter }: TripMapContentProps) {
  const [, setSearchParams] = useSearchParams();

  // Agenda day range drives the day index for pin affinity.
  const agendaRange = useMemo(
    () => computeAgendaDayRange(stops, trip),
    [stops, trip],
  );
  const allDays = useMemo(
    () => enumerateDateRange(agendaRange.start, agendaRange.end),
    [agendaRange.start, agendaRange.end],
  );

  const dayIndexByDate = useMemo(() => {
    const m = new Map<string, number>();
    allDays.forEach((d, i) => m.set(d, i));
    return m;
  }, [allDays]);

  // Day chip state. Live trips auto-select today's chip on mount (REQ-026).
  const today = todayIso();
  const isLive = today >= agendaRange.start && today <= agendaRange.end;
  const [selectedDay, setSelectedDay] = useState<'all' | string>(
    isLive && allDays.includes(today) ? today : 'all',
  );

  // Ensure the selected day stays valid if the trip's stop list changes.
  useEffect(() => {
    if (selectedDay !== 'all' && !allDays.includes(selectedDay)) {
      setSelectedDay('all');
    }
  }, [selectedDay, allDays]);

  const allPins = useMemo<MapPin[]>(() => {
    const result: MapPin[] = [];
    for (const stop of stops) {
      if (!hasVerifiedCoords(stop)) continue;
      const coords = pinCoords(stop);
      if (!coords) continue;
      const dayIndex = dayIndexByDate.get(stop.date) ?? 0;
      result.push({ stop, coords, dayIndex });
    }
    return result;
  }, [stops, dayIndexByDate]);

  // Base-change transits render as connector lines (REQ-016). V2 never passes
  // transitFilter, so isTransitBaseChange is the default per D5.
  const allTransitSegments = useMemo<TransitSegment[]>(() => {
    const result: TransitSegment[] = [];
    for (const stop of stops) {
      if (stop.type !== 'transit') continue;
      if (!transitFilter(stop, stops)) continue;
      const endpoints = resolveTransitEndpoints(stop, stops);
      if (!endpoints) continue;
      result.push({
        transit: stop,
        from: { lat: endpoints.from.lat, lng: endpoints.from.lng },
        to: { lat: endpoints.to.lat, lng: endpoints.to.lng },
        // Base-change transits span two days: departure (day before transit.date)
        // and arrival (transit.date). Either day renders the line (REQ-025).
        activeDates: [endpoints.fromDate, stop.date],
      });
    }
    return result;
  }, [stops, transitFilter]);

  // Filter pins and transit segments by selected day.
  const pins = useMemo(() => {
    if (selectedDay === 'all') return allPins;
    return allPins.filter((p) => p.stop.date === selectedDay);
  }, [allPins, selectedDay]);

  const transitSegments = useMemo(() => {
    if (selectedDay === 'all') return allTransitSegments;
    return allTransitSegments.filter((seg) => seg.activeDates.includes(selectedDay));
  }, [allTransitSegments, selectedDay]);

  // Count of Eat/Play stops with free-text (unpinned) locations — informational
  // footer per REQ-015. Transits don't contribute (they're never pinned).
  const unpinnedCount = useMemo(() => {
    return stops.reduce((acc, stop) => {
      if (stop.type !== 'eat' && stop.type !== 'play') return acc;
      if (stop.location?.kind === 'verified') return acc;
      return acc + 1;
    }, 0);
  }, [stops]);

  // Day chips — visible only when there's more than one day with activity.
  const dayChips = useMemo<DayFilterChip[]>(() => {
    const chips: DayFilterChip[] = [{ value: 'all', label: 'All' }];
    allDays.forEach((d, i) => {
      chips.push({
        value: d,
        label: `Day ${i + 1}`,
        isToday: d === today,
      });
    });
    return chips;
  }, [allDays, today]);

  // Popup state. Null when no pin is selected.
  const [popup, setPopup] = useState<{
    stop: Stop;
    position: { lat: number; lng: number };
    dayNumber: number;
  } | null>(null);

  const onPinClick = (pin: MapPin) => {
    setPopup({
      stop: pin.stop,
      position: { lat: pin.coords.lat, lng: pin.coords.lng },
      dayNumber: pin.dayIndex + 1,
    });
  };

  const onViewInItinerary = () => {
    if (!popup) return;
    const stopId = popup.stop.id;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('tab'); // default itinerary
        next.set('stop', stopId);
        return next;
      },
      { replace: false },
    );
    setPopup(null);
  };

  // Defensive empty-state. Tab visibility rule in TripDetail should prevent
  // reaching here with zero pins (for 'all'); per-day filter can yield zero
  // pins too — keep the map rendered so filter can be reset.
  if (allPins.length === 0) {
    return (
      <Center py="xl">
        <Stack align="center" gap="xs">
          <Text c="dimmed">No map locations available.</Text>
          <Text c="dimmed" size="sm">
            Add a Stay, or set a verified location on an Eat or Play stop.
          </Text>
        </Stack>
      </Center>
    );
  }

  // Initial bounds: center + zoom are overridden by MapBounds auto-fit below.
  const initialCenter = { lat: allPins[0].coords.lat, lng: allPins[0].coords.lng };

  return (
    <Stack gap="xs">
      <DayFilterBar chips={dayChips} selected={selectedDay} onSelect={setSelectedDay} />
      <Box
        style={{
          height: 'calc(100vh - 320px)',
          minHeight: 400,
          width: '100%',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <GoogleMap
          mapId={mapId}
          defaultCenter={initialCenter}
          defaultZoom={4}
          gestureHandling="greedy"
          disableDefaultUI={false}
          aria-label="Trip map view"
        >
          <MapBounds pins={pins.length > 0 ? pins : allPins} />
          {transitSegments.map((seg) => (
            <TransitLine
              key={seg.transit.id}
              transit={seg.transit}
              from={seg.from}
              to={seg.to}
            />
          ))}
          {pins.map((pin) => (
            <StopPin
              key={pin.stop.id}
              stop={pin.stop}
              lat={pin.coords.lat}
              lng={pin.coords.lng}
              dayIndex={pin.dayIndex}
              dayNumber={pin.dayIndex + 1}
              onClick={() => onPinClick(pin)}
            />
          ))}
          {popup && (
            <StopPopup
              stop={popup.stop}
              dayNumber={popup.dayNumber}
              position={popup.position}
              onClose={() => setPopup(null)}
              onViewInItinerary={onViewInItinerary}
            />
          )}
        </GoogleMap>
      </Box>
      {unpinnedCount > 0 && (
        <Group justify="flex-end">
          <Text size="xs" c="dimmed" role="status" aria-live="polite">
            {unpinnedCount} {unpinnedCount === 1 ? 'stop' : 'stops'} without map locations
          </Text>
        </Group>
      )}
    </Stack>
  );
}

/** Imperatively fit map bounds to the provided pins on mount / pins change. */
function MapBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || pins.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    for (const pin of pins) {
      bounds.extend({ lat: pin.coords.lat, lng: pin.coords.lng });
    }
    if (pins.length === 1) {
      // LatLngBounds with a single point yields a zero-size rect; center+zoom instead.
      map.setCenter({ lat: pins[0].coords.lat, lng: pins[0].coords.lng });
      map.setZoom(12);
    } else {
      map.fitBounds(bounds, 48);
    }
  }, [map, pins]);

  return null;
}
