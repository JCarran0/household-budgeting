/**
 * Self-healing photo refresh.
 *
 * When a stored Google Places photo `photoName` fails to load (Google rotates
 * or invalidates the resource), any photo component in the tree can call
 * `useTripPhotoRefresh()?.()` to trigger a one-shot refresh of every stop's
 * photo via Places API. New `photoName` + `photoAttribution` values are
 * PATCHed back and the trip queries invalidate, so the UI heals on its own.
 *
 * Concurrency: photo fetches run in parallel, but the PATCHes are SEQUENTIAL.
 * Each updateStop is an unlocked read-modify-write of the whole trips record;
 * parallel writes tear the file (filesystem) or drop heals (S3). See Phase 2.
 *
 * Guard: each tripId is refresh-attempted at most once per page load to avoid
 * request storms if the fresh names also fail (e.g., stale `placeId`).
 */

import { createContext, useContext } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { useGooglePlaces } from './useGooglePlaces';
import { api } from '../lib/api';
import type { Stop, UpdateStopDto, VerifiedLocation } from '../../../shared/types';

export type RefreshFn = () => void;

export const TripPhotoRefreshContext = createContext<RefreshFn | null>(null);

export const attemptedTrips = new Set<string>();

export function useTripPhotoRefresh(): RefreshFn | null {
  return useContext(TripPhotoRefreshContext);
}

function verifiedLocation(stop: Stop): VerifiedLocation | null {
  if (stop.type === 'stay') return stop.location;
  if (stop.type === 'eat' || stop.type === 'play') {
    return stop.location?.kind === 'verified' ? stop.location : null;
  }
  return null;
}

function makeLocationUpdate(stop: Stop, location: VerifiedLocation): UpdateStopDto | null {
  if (stop.type === 'stay') return { type: 'stay', location };
  if (stop.type === 'eat') return { type: 'eat', location };
  if (stop.type === 'play') return { type: 'play', location };
  return null;
}

export async function refreshTripPhotos(
  tripId: string,
  stops: Stop[],
  places: ReturnType<typeof useGooglePlaces>,
  queryClient: QueryClient,
): Promise<void> {
  if (places.status !== 'ready') return;
  const g = places.google;

  const targets = stops
    .map((stop) => ({ stop, location: verifiedLocation(stop) }))
    .filter((t): t is { stop: Stop; location: VerifiedLocation } => t.location !== null);

  if (targets.length === 0) return;

  // Phase 1 — fetch fresh photos for every stop in PARALLEL. These are
  // read-only Google calls; running them concurrently is the latency win.
  const updates = await Promise.all(
    targets.map(async ({ stop, location }) => {
      try {
        const place = new g.maps.places.Place({ id: location.placeId });
        await place.fetchFields({ fields: ['photos'] });
        const photos = place.photos ?? [];
        // @types/google.maps 3.64 does not yet expose `Photo.name`; the v=weekly
        // runtime does. Same defensive read as LocationInput.tsx.
        let fresh: { photoName: string; photoAttribution: string | undefined } | null = null;
        for (const photo of photos) {
          const nameRaw = (photo as unknown as { name?: unknown }).name;
          if (typeof nameRaw !== 'string' || nameRaw.length === 0) continue;
          fresh = {
            photoName: nameRaw,
            photoAttribution: photo.authorAttributions?.[0]?.displayName || undefined,
          };
          break;
        }
        if (!fresh) return null;

        const newLocation: VerifiedLocation = {
          ...location,
          photoName: fresh.photoName,
          ...(fresh.photoAttribution ? { photoAttribution: fresh.photoAttribution } : {}),
        };
        const update = makeLocationUpdate(stop, newLocation);
        if (!update) return null;
        return { stopId: stop.id, update };
      } catch (err) {
        console.warn('refreshTripPhotos: fetch failed for stop', stop.id, err);
        return null;
      }
    }),
  );

  // Phase 2 — persist SEQUENTIALLY. Each updateStop is a full read-modify-write
  // of the whole trips_{familyId} record with no cross-request locking. Firing
  // them in parallel races: torn writes corrupt the JSON on the filesystem
  // adapter, and lost updates silently drop heals on the S3 adapter. One at a
  // time, each PATCH reads the prior result, so every stop's photo persists.
  for (const u of updates) {
    if (!u) continue;
    try {
      await api.updateStop(tripId, u.stopId, u.update);
    } catch (err) {
      console.warn('refreshTripPhotos: persist failed for stop', u.stopId, err);
    }
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
    queryClient.invalidateQueries({ queryKey: ['trips'] }),
  ]);
}
