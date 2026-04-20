import { useMemo, useRef, useState, useEffect } from 'react';
import {
  Autocomplete,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconMapPin,
  IconCircleCheck,
  IconEdit,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { useGooglePlaces } from '../../../hooks/useGooglePlaces';
import type {
  FreeTextLocation,
  StopLocation,
  VerifiedLocation,
} from '../../../../../shared/types';

type Mode = 'verifiedOnly' | 'verifiedOrFreeText';

interface LocationInputProps {
  label?: string;
  description?: string;
  required?: boolean;
  mode: Mode;
  value: StopLocation | null;
  onChange: (value: StopLocation | null) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string | null;
}

/**
 * Debounce wrapper — 250ms is short enough to feel responsive but cuts the
 * number of Places autocomplete calls during typing.
 */
function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);
  return debounced;
}

export function LocationInput({
  label,
  description,
  required,
  mode,
  value,
  onChange,
  placeholder,
  disabled,
  error,
}: LocationInputProps) {
  const places = useGooglePlaces();
  const [query, setQuery] = useState<string>(value?.label ?? '');
  const debouncedQuery = useDebouncedValue(query, 250);

  // Update local query when the parent resets the value.
  useEffect(() => {
    setQuery(value?.label ?? '');
  }, [value]);

  // --- Predictions state ---
  // Post-2025-03-01 API: AutocompleteSuggestion replaces AutocompleteService
  // (D9). Hold the raw suggestions so the select path can call toPlace() on
  // the exact PlacePrediction it came from, which keeps the session-token
  // link to fetchFields.
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [loadingPredictions, setLoadingPredictions] = useState(false);

  // Session token keeps billing grouped for Places Autocomplete sessions.
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (places.status !== 'ready') return;
    const g = places.google;
    sessionTokenRef.current = new g.maps.places.AutocompleteSessionToken();
  }, [places]);

  // Fetch predictions when the debounced query changes.
  useEffect(() => {
    if (places.status !== 'ready') return;
    if (!debouncedQuery.trim()) {
      setSuggestions([]);
      return;
    }
    // Skip if the query matches the already-verified label (avoids flicker on reopen).
    if (value?.kind === 'verified' && value.label === debouncedQuery) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoadingPredictions(true);
    places.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: debouncedQuery,
      sessionToken: sessionTokenRef.current ?? undefined,
    })
      .then(({ suggestions: next }) => {
        if (cancelled) return;
        setSuggestions(next);
        setLoadingPredictions(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        console.warn('fetchAutocompleteSuggestions failed', err);
        setSuggestions([]);
        setLoadingPredictions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, places, value]);

  const autocompleteData = useMemo(
    () =>
      suggestions
        .map((s) => s.placePrediction)
        .filter((p): p is google.maps.places.PlacePrediction => p !== null)
        .map((p) => ({
          value: p.placeId,
          label: p.text.text,
        })),
    [suggestions],
  );

  const handlePredictionSelect = async (placeId: string) => {
    if (places.status !== 'ready') return;
    const prediction = suggestions
      .map((s) => s.placePrediction)
      .find((p): p is google.maps.places.PlacePrediction => p?.placeId === placeId);
    if (!prediction) return;
    // toPlace() carries the session token from the suggestion request, so the
    // first fetchFields call on this Place is billed as part of the same
    // autocomplete session.
    const place = prediction.toPlace();
    try {
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'photos'],
      });
    } catch (err) {
      // Non-fatal (REQ-002): fall back silently and let the user retry.
      console.warn('Place.fetchFields failed', err);
      return;
    }
    if (!place.location) return;

    const photo = place.photos?.[0];
    // @types/google.maps 3.64 does not yet expose `Photo.name`; the v=weekly
    // runtime does. Read it defensively without using `any`.
    const photoNameRaw = photo
      ? (photo as unknown as { name?: unknown }).name
      : undefined;
    const photoName =
      typeof photoNameRaw === 'string' && photoNameRaw.length > 0
        ? photoNameRaw
        : undefined;
    const photoAttribution = photo?.authorAttributions?.[0]?.displayName || undefined;

    const verified: VerifiedLocation = {
      kind: 'verified',
      label: place.displayName ?? place.formattedAddress ?? '',
      address: place.formattedAddress ?? '',
      lat: place.location.lat(),
      lng: place.location.lng(),
      placeId,
      ...(photoName ? { photoName } : {}),
      ...(photoAttribution ? { photoAttribution } : {}),
    };
    onChange(verified);
    setQuery(verified.label);
    // Rotate the session token — the autocomplete billing session ends here.
    sessionTokenRef.current = new places.google.maps.places.AutocompleteSessionToken();
  };

  const applyFreeText = () => {
    if (!query.trim()) {
      onChange(null);
      return;
    }
    const freeText: FreeTextLocation = { kind: 'freeText', label: query.trim() };
    onChange(freeText);
  };

  // Render paths ---------------------------------------------------------

  if (places.status === 'unconfigured') {
    if (mode === 'verifiedOnly') {
      return (
        <Stack gap={4}>
          {label && (
            <Text size="sm" fw={500} c="red">
              {label}
              {required ? ' *' : ''}
            </Text>
          )}
          <TextInput
            value={value?.label ?? ''}
            placeholder="Verified address required"
            disabled
            leftSection={<IconAlertTriangle size={14} color="var(--mantine-color-red-5)" />}
            error={error ?? 'Address verification is unavailable'}
          />
          <Text size="xs" c="red">
            Set <code>VITE_GOOGLE_PLACES_API_KEY</code> in <code>frontend/.env.development</code> to
            enable Stay address verification. Restart the dev server after setting it.
          </Text>
        </Stack>
      );
    }
    // verifiedOrFreeText: fall through to plain text input below.
  }

  // Cleared state — show a friendly "set" call when the user has a verified value.
  if (value?.kind === 'verified') {
    return (
      <Stack gap={4}>
        {label && (
          <Text size="sm" fw={500}>
            {label}
            {required ? ' *' : ''}
          </Text>
        )}
        <Group gap="xs" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            value={value.label}
            readOnly
            leftSection={<IconCircleCheck size={14} color="var(--mantine-color-green-5)" />}
            description={value.address}
          />
          <Tooltip label="Change location">
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconEdit size={12} />}
              onClick={() => {
                onChange(null);
                setQuery('');
              }}
            >
              Change
            </Button>
          </Tooltip>
        </Group>
      </Stack>
    );
  }

  // Autocomplete (Google Places) path
  if (places.status === 'ready' || places.status === 'loading') {
    return (
      <Stack gap={4}>
        <Autocomplete
          label={label}
          required={required}
          description={description}
          placeholder={placeholder ?? 'Start typing an address...'}
          data={autocompleteData}
          value={query}
          onChange={setQuery}
          onOptionSubmit={(placeId) => handlePredictionSelect(placeId)}
          leftSection={<IconMapPin size={14} />}
          rightSection={loadingPredictions ? <Loader size="xs" /> : undefined}
          disabled={disabled}
          error={error ?? undefined}
          filter={({ options }) => options} // show all server-provided predictions verbatim
        />
        {mode === 'verifiedOrFreeText' && query.trim().length > 0 && suggestions.length === 0 && !loadingPredictions && (
          <Button variant="subtle" size="compact-xs" onClick={applyFreeText}>
            Use "{query.trim()}" as typed
          </Button>
        )}
      </Stack>
    );
  }

  // Free-text-only fallback (unconfigured + verifiedOrFreeText, or error state).
  return (
    <Stack gap={4}>
      <TextInput
        label={label}
        description={description ?? (places.status === 'error' ? 'Places lookup failed — using free text.' : undefined)}
        placeholder={placeholder ?? 'Describe the place'}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onBlur={applyFreeText}
        leftSection={<IconMapPin size={14} />}
        required={required}
        disabled={disabled}
        error={error ?? undefined}
      />
    </Stack>
  );
}
