/**
 * Lazy-load and cache the Google Maps JS Places library.
 *
 * Reads the API key from `VITE_GOOGLE_PLACES_API_KEY`. If the key is absent,
 * callers get `{ status: 'unconfigured' }` so the UI can render a disabled
 * state without crashing.
 *
 * D7 (TRIP-ITINERARIES-PLAN): provider is Google Places V1; this hook is the
 * single integration point so the provider is swappable later.
 */

import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { useEffect, useState } from 'react';

type PlacesStatus =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; google: typeof google };

let cachedGoogle: typeof google | null = null;
let inflight: Promise<typeof google> | null = null;

function loadGoogle(apiKey: string): Promise<typeof google> {
  if (cachedGoogle) return Promise.resolve(cachedGoogle);
  if (inflight) return inflight;
  setOptions({ key: apiKey, v: 'weekly' });
  const next = importLibrary('places')
    .then(() => {
      // `importLibrary` attaches `google.maps.places` to the global `google`.
      cachedGoogle = google;
      return google;
    })
    .finally(() => {
      inflight = null;
    });
  inflight = next;
  return next;
}

export function useGooglePlaces(): PlacesStatus {
  const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  const [state, setState] = useState<PlacesStatus>(() =>
    apiKey
      ? cachedGoogle
        ? { status: 'ready', google: cachedGoogle }
        : { status: 'loading' }
      : { status: 'unconfigured' },
  );

  useEffect(() => {
    if (!apiKey) return;
    if (cachedGoogle) {
      setState({ status: 'ready', google: cachedGoogle });
      return;
    }
    let cancelled = false;
    loadGoogle(apiKey)
      .then((g) => {
        if (!cancelled) setState({ status: 'ready', google: g });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: 'error', error: err });
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return state;
}
