import { Group, Image, Text, Tooltip, UnstyledButton } from '@mantine/core';
import type { PlacePhotoCandidate } from './LocationInput';

interface PhotoCandidateStripProps {
  candidates: PlacePhotoCandidate[];
  selectedPhotoName: string | null;
  onSelect: (candidate: PlacePhotoCandidate) => void;
}

const TILE_PX = 72;

/**
 * Horizontal picker of candidate place photos surfaced by Place.fetchFields.
 * Clicking a tile swaps the selection — does NOT open the hero modal
 * (REQ-021). Candidates are form-local and not persisted until save.
 */
export function PhotoCandidateStrip({
  candidates,
  selectedPhotoName,
  onSelect,
}: PhotoCandidateStripProps) {
  const key = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  if (!key || candidates.length === 0) return null;

  return (
    <div>
      <Text size="xs" c="dimmed" mb={4}>
        Pick the photo that will appear on the stay banner.
      </Text>
      <Group
        gap="xs"
        wrap="nowrap"
        style={{ overflowX: 'auto', paddingBottom: 4 }}
      >
        {candidates.map((candidate) => {
          const selected = candidate.photoName === selectedPhotoName;
          const src = `https://places.googleapis.com/v1/${candidate.photoName}/media?maxWidthPx=${TILE_PX * 2}&key=${key}`;
          const tooltip = candidate.photoAttribution
            ? `Photo: ${candidate.photoAttribution}`
            : 'Photo via Google';
          return (
            <Tooltip key={candidate.photoName} label={tooltip} withArrow>
              <UnstyledButton
                onClick={() => onSelect(candidate)}
                aria-label={selected ? 'Selected place photo' : 'Select this place photo'}
                aria-pressed={selected}
                style={{
                  borderRadius: 8,
                  outline: selected
                    ? '2px solid var(--mantine-color-blue-filled)'
                    : '2px solid transparent',
                  outlineOffset: 1,
                  flexShrink: 0,
                }}
              >
                <Image
                  src={src}
                  alt="Place photo candidate"
                  w={TILE_PX}
                  h={TILE_PX}
                  radius="sm"
                  fit="cover"
                />
              </UnstyledButton>
            </Tooltip>
          );
        })}
      </Group>
    </div>
  );
}
