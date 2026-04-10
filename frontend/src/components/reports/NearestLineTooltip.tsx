import { useRef } from 'react';
import { Paper, Text } from '@mantine/core';

interface NearestTooltipPayloadItem {
  name: string;
  value: number;
  dataKey: string;
  color: string;
}

interface NearestLineTooltipProps {
  active?: boolean;
  payload?: NearestTooltipPayloadItem[];
  label?: string;
}

/**
 * Creates a tooltip component that only displays the single series closest
 * to the cursor's Y position rather than every series at that x-axis tick.
 *
 * Recharts LineChart/AreaChart only support axis-level tooltips, so we
 * approximate which line is nearest using proportional Y-axis mapping.
 */
export function createNearestLineTooltip(
  mouseYRef: React.RefObject<number | null>,
  yAxisMax: number,
  chartHeight: number,
) {
  const plotTop = 10;
  const plotBottom = chartHeight - 30;
  const plotH = plotBottom - plotTop;

  return function NearestLineTooltip({ active, payload, label }: NearestLineTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;

    const activeItems = payload.filter(item => item.value > 0);
    if (activeItems.length === 0) return null;

    const mouseY = mouseYRef.current;
    let nearest = activeItems[0];

    if (mouseY != null && yAxisMax > 0) {
      const mouseFrac = Math.max(0, Math.min(1, (mouseY - plotTop) / plotH));

      let closestDist = Infinity;
      for (const item of activeItems) {
        const valFrac = 1 - item.value / yAxisMax;
        const dist = Math.abs(valFrac - mouseFrac);
        if (dist < closestDist) {
          closestDist = dist;
          nearest = item;
        }
      }
    }

    return (
      <Paper p="xs" withBorder shadow="sm">
        <Text size="sm" fw={600}>{label}</Text>
        <Text size="xs" style={{ color: nearest.color }}>
          {nearest.dataKey}: ${nearest.value.toFixed(0)}
        </Text>
      </Paper>
    );
  };
}

/**
 * Hook that returns refs and a handler for tracking the mouse Y position
 * within a chart container div. Pass the returned props to a wrapper div
 * around the ResponsiveContainer.
 */
export function useChartMouseTracker() {
  const mouseYRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const containerProps = {
    ref: containerRef,
    onMouseMove: (e: React.MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        mouseYRef.current = e.clientY - rect.top;
      }
    },
    onMouseLeave: () => { mouseYRef.current = null; },
  };

  return { mouseYRef, containerProps };
}
