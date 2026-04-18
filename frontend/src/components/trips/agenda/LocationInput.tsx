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
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [loadingPredictions, setLoadingPredictions] = useState(false);

  // Session token keeps billing grouped for Places Autocomplete sessions.
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);

  useEffect(() => {
    if (places.status !== 'ready') return;
    const g = places.google;
    autocompleteServiceRef.current = new g.maps.places.AutocompleteService();
    // PlacesService requires an HTMLDivElement as an anchor — a detached div is fine.
    placesServiceRef.current = new g.maps.places.PlacesService(document.createElement('div'));
    sessionTokenRef.current = new g.maps.places.AutocompleteSessionToken();
  }, [places]);

  // Fetch predictions when the debounced query changes.
  useEffect(() => {
    if (places.status !== 'ready') return;
    const service = autocompleteServiceRef.current;
    if (!service) return;
    if (!debouncedQuery.trim()) {
      setPredictions([]);
      return;
    }
    // Skip if the query matches the already-verified label (avoids flicker on reopen).
    if (value?.kind === 'verified' && value.label === debouncedQuery) {
      setPredictions([]);
      return;
    }
    setLoadingPredictions(true);
    service.getPlacePredictions(
      {
        input: debouncedQuery,
        sessionToken: sessionTokenRef.current ?? undefined,
      },
      (results) => {
        setPredictions(results ?? []);
        setLoadingPredictions(false);
      },
    );
  }, [debouncedQuery, places, value]);

  const autocompleteData = useMemo(
    () =>
      predictions.map((p) => ({
        value: p.place_id, // stable id used as the Autocomplete value
        label: p.description,
      })),
    [predictions],
  );

  const handlePredictionSelect = (placeId: string) => {
    const service = placesServiceRef.current;
    if (!service) return;
    service.getDetails(
      {
        placeId,
        fields: ['name', 'formatted_address', 'geometry'],
        sessionToken: sessionTokenRef.current ?? undefined,
      },
      (details, status) => {
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !details ||
          !details.geometry?.location
        ) {
          return;
        }
        const verified: VerifiedLocation = {
          kind: 'verified',
          label: details.name ?? details.formatted_address ?? '',
          address: details.formatted_address ?? '',
          lat: details.geometry.location.lat(),
          lng: details.geometry.location.lng(),
          placeId,
        };
        onChange(verified);
        setQuery(verified.label);
        // Rotate the session token — billing session ends on details fetch.
        if (places.status === 'ready') {
          sessionTokenRef.current = new places.google.maps.places.AutocompleteSessionToken();
        }
      },
    );
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
        {mode === 'verifiedOrFreeText' && query.trim().length > 0 && predictions.length === 0 && !loadingPredictions && (
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
