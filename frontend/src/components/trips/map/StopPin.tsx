import { AdvancedMarker } from '@vis.gl/react-google-maps';
import type { Stop } from '../../../../../shared/types';
import { dayColor } from './mapPalette';

export interface StopPinProps {
  stop: Stop;
  lat: number;
  lng: number;
  dayIndex: number;
  dayNumber: number;
  onClick: () => void;
}

function iconGlyph(type: Stop['type']): string {
  // Inline glyphs keep the marker self-contained and avoid an icon library
  // round-trip inside a Google Maps custom element.
  switch (type) {
    case 'stay':
      return '🛏';
    case 'eat':
      return '🍴';
    case 'play':
      return '🎭';
    case 'transit':
      return '✈';
  }
}

function stopTitle(stop: Stop): string {
  if (stop.type === 'transit') return stop.mode;
  return stop.name;
}

export function StopPin({ stop, lat, lng, dayIndex, dayNumber, onClick }: StopPinProps) {
  const color = dayColor(dayIndex);
  const label = `${stop.type === 'stay' ? 'Stay' : stop.type === 'eat' ? 'Eat' : 'Play'}: ${stopTitle(stop)}, Day ${dayNumber}`;

  return (
    <AdvancedMarker position={{ lat, lng }} onClick={onClick} title={label}>
      <div
        role="button"
        aria-label={label}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: color,
          color: 'white',
          boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
          border: '2px solid white',
          fontSize: 16,
          lineHeight: 1,
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        <span aria-hidden="true">{iconGlyph(stop.type)}</span>
        <span
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            background: '#1a1b1e',
            color: 'white',
            fontSize: 10,
            fontWeight: 700,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            padding: '0 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid white',
          }}
          aria-hidden="true"
        >
          {dayNumber}
        </span>
      </div>
    </AdvancedMarker>
  );
}
