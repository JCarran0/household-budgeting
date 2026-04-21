import { Badge, Box, Group, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { ReactNode } from 'react';

interface TripCoverBannerProps {
  photoName: string;
  attribution: string | null;
  title: string;
  dateRange: string;
  statusLabel: string;
  /** Mantine color name — matches STATUS_BADGE_COLOR map at the call site. */
  statusColor: string;
  /** Edit / delete icon buttons, rendered inside a semi-transparent pill top-right. */
  actions?: ReactNode;
  /**
   * Use a shorter card-sized banner (~130px) with smaller title/badge. Intended
   * for list-card usage where the banner is nested inside a clipping Paper.
   */
  compact?: boolean;
}

const GRADIENT =
  'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 45%, rgba(0,0,0,0.72) 100%)';

export function TripCoverBanner({
  photoName,
  attribution,
  title,
  dateRange,
  statusLabel,
  statusColor,
  actions,
  compact = false,
}: TripCoverBannerProps) {
  const key = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const height = compact ? 130 : isMobile ? 200 : 280;
  const titleOrder: 2 | 3 | 4 = compact ? 4 : isMobile ? 3 : 2;
  const badgeSize = compact ? 'xs' : isMobile ? 'sm' : 'md';
  const dateSize = compact ? 'xs' : 'sm';
  const padX = compact ? 14 : isMobile ? 16 : 24;
  const padBottom = compact ? 12 : isMobile ? 28 : 36;

  if (!key) return null;

  const bgSrc = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1600&key=${key}`;
  const attributionText = attribution ? `Photo: ${attribution}` : 'Photo via Google';

  return (
    <Box
      role="img"
      aria-label={`${title} cover photo`}
      style={{
        position: 'relative',
        width: '100%',
        height,
        // Caller clips corners in compact mode; detail view rounds its own.
        borderRadius: compact ? 0 : 'var(--mantine-radius-md)',
        overflow: 'hidden',
        backgroundImage: `url(${bgSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: 'var(--mantine-color-dark-6)',
      }}
    >
      <Box
        style={{
          position: 'absolute',
          inset: 0,
          background: GRADIENT,
          pointerEvents: 'none',
        }}
      />

      {actions && (
        <Box
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            padding: '2px 4px',
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: 999,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          {actions}
        </Box>
      )}

      <Stack
        gap={compact ? 2 : 6}
        style={{
          position: 'absolute',
          left: padX,
          right: padX,
          bottom: padBottom,
          color: 'white',
        }}
      >
        <Group gap={compact ? 'xs' : 'sm'} wrap="wrap">
          <Title
            order={titleOrder}
            style={{
              margin: 0,
              color: 'white',
              textShadow: '0 2px 10px rgba(0, 0, 0, 0.55)',
            }}
          >
            {title}
          </Title>
          <Badge color={statusColor} variant="filled" size={badgeSize}>
            {statusLabel}
          </Badge>
        </Group>
        <Text
          size={dateSize}
          style={{
            color: 'white',
            opacity: 0.95,
            textShadow: '0 1px 6px rgba(0, 0, 0, 0.6)',
          }}
        >
          {dateRange}
        </Text>
      </Stack>

      <Text
        style={{
          position: 'absolute',
          right: 10,
          bottom: 8,
          padding: '2px 8px',
          background: 'rgba(0, 0, 0, 0.5)',
          color: 'white',
          borderRadius: 4,
          fontSize: 10.5,
          lineHeight: 1.4,
          letterSpacing: 0.1,
          opacity: 0.85,
          maxWidth: '60%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          pointerEvents: 'none',
        }}
      >
        {attributionText}
      </Text>
    </Box>
  );
}
