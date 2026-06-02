import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGooglePlaces } from '../../hooks/useGooglePlaces';
import {
  attemptedTrips,
  refreshTripPhotos,
  TripPhotoRefreshContext,
  type RefreshFn,
} from '../../hooks/useRefreshTripPhotos';
import type { Stop } from '../../../../shared/types';

interface ProviderProps {
  tripId: string;
  stops: Stop[];
  children: ReactNode;
}

export function TripPhotoRefreshProvider({ tripId, stops, children }: ProviderProps) {
  const places = useGooglePlaces();
  const queryClient = useQueryClient();
  // Refs keep the callback identity stable while it still sees latest data.
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const placesRef = useRef(places);
  placesRef.current = places;
  // Race guard: img onError can fire before the Places SDK finishes loading.
  // Defer the refresh until the SDK is ready instead of dropping it on the floor.
  const pendingRef = useRef(false);

  const tryRefresh = useCallback(() => {
    if (attemptedTrips.has(tripId)) return;
    if (placesRef.current.status !== 'ready') {
      pendingRef.current = true;
      return;
    }
    attemptedTrips.add(tripId);
    pendingRef.current = false;
    void refreshTripPhotos(tripId, stopsRef.current, placesRef.current, queryClient);
  }, [tripId, queryClient]);

  useEffect(() => {
    if (places.status === 'ready' && pendingRef.current) {
      tryRefresh();
    }
  }, [places.status, tryRefresh]);

  const refresh: RefreshFn = tryRefresh;

  return (
    <TripPhotoRefreshContext.Provider value={refresh}>
      {children}
    </TripPhotoRefreshContext.Provider>
  );
}
