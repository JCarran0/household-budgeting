import { useEffect, useMemo, useState } from 'react';
import { AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import type { TransitMode, TransitStop } from '../../../../../shared/types';

export interface TransitLineProps {
  transit: TransitStop;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}

interface ModeStyle {
  color: string;
  dashed: boolean;
  geodesic: boolean;
  glyph: string;
}

const MODE_STYLES: Record<TransitMode, ModeStyle> = {
  flight: { color: '#4E79A7', dashed: true, geodesic: true, glyph: '✈' },
  drive: { color: '#E15759', dashed: false, geodesic: false, glyph: '🚗' },
  train: { color: '#59A14F', dashed: false, geodesic: false, glyph: '🚂' },
  walk: { color: '#F28E2B', dashed: false, geodesic: false, glyph: '🚶' },
  shuttle: { color: '#B07AA1', dashed: false, geodesic: false, glyph: '🚐' },
  other: { color: '#9C755F', dashed: false, geodesic: false, glyph: '➜' },
};

export function TransitLine({ transit, from, to }: TransitLineProps) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const geometryLib = useMapsLibrary('geometry');
  const [midpoint, setMidpoint] = useState<{ lat: number; lng: number } | null>(null);

  const style = MODE_STYLES[transit.mode];

  useEffect(() => {
    if (!map || !mapsLib) return;

    // Dashed stroke implemented via Symbol on the path; solid lines use
    // a simple strokeOpacity/strokeWeight combo.
    const strokeSymbols: google.maps.IconSequence[] = [];
    if (style.dashed) {
      strokeSymbols.push({
        icon: {
          path: 'M 0,-1 0,1',
          strokeOpacity: 1,
          scale: 3,
        },
        offset: '0',
        repeat: '12px',
      });
    }
    // Directional arrow indicator — placed at the 50% mark.
    strokeSymbols.push({
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 3,
        strokeColor: style.color,
        fillColor: style.color,
        fillOpacity: 1,
      },
      offset: '50%',
    });

    const polyline = new mapsLib.Polyline({
      path: [from, to],
      geodesic: style.geodesic,
      strokeColor: style.color,
      // When dashed, suppress the continuous stroke and rely on the dotted symbol pattern.
      strokeOpacity: style.dashed ? 0 : 0.8,
      strokeWeight: 3,
      icons: strokeSymbols,
      zIndex: 1,
      map,
    });

    return () => {
      polyline.setMap(null);
    };
  }, [map, mapsLib, from, to, style]);

  // Midpoint computation — geodesic uses spherical.interpolate; straight uses linear midpoint.
  useEffect(() => {
    if (style.geodesic) {
      if (!geometryLib) return;
      const a = new google.maps.LatLng(from.lat, from.lng);
      const b = new google.maps.LatLng(to.lat, to.lng);
      const mid = geometryLib.spherical.interpolate(a, b, 0.5);
      setMidpoint({ lat: mid.lat(), lng: mid.lng() });
    } else {
      setMidpoint({ lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 });
    }
  }, [style.geodesic, geometryLib, from, to]);

  const labelContent = useMemo(() => {
    return (
      <div
        aria-label={`Transit: ${transit.mode}`}
        style={{
          background: 'white',
          color: style.color,
          border: `2px solid ${style.color}`,
          borderRadius: 12,
          padding: '2px 6px',
          fontSize: 14,
          fontWeight: 600,
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          lineHeight: 1,
        }}
      >
        <span aria-hidden="true">{style.glyph}</span>
      </div>
    );
  }, [transit.mode, style.color, style.glyph]);

  if (!midpoint) return null;

  return (
    <AdvancedMarker position={midpoint} title={transit.mode} zIndex={2}>
      {labelContent}
    </AdvancedMarker>
  );
}
