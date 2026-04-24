import { Group, Text } from '@mantine/core';
import { IconMinus, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';
import { formatCurrency } from '../../../utils/formatters';

// Tone -> Mantine color. Positive = favorable (green), negative = unfavorable (red).
// See BvA BRD Revision 2.
export function availableColor(value: number): string | undefined {
  if (value > 0) return 'green';
  if (value < 0) return 'red';
  return undefined;
}

export function formatSigned(value: number): string {
  if (value > 0) return `+${formatCurrency(value)}`;
  if (value < 0) return `−${formatCurrency(Math.abs(value))}`;
  return formatCurrency(0);
}

export function directionIcon(value: number) {
  if (value > 0) return <IconTrendingUp size={14} />;
  if (value < 0) return <IconTrendingDown size={14} />;
  return <IconMinus size={14} />;
}

// Rollover cell per BRD REQ-010a:
//   - null           -> em-dash, dimmed
//   - value, off     -> tone-signed number, dimmed (no green/red)
//   - value, on      -> tone-signed number, green/red by sign
export function renderRolloverCell(value: number | null, rolloverOn: boolean, rowDim: boolean) {
  if (value === null) {
    return (
      <Text size="sm" c="dimmed" style={{ opacity: rowDim ? 0.5 : 1, whiteSpace: 'nowrap' }}>
        —
      </Text>
    );
  }
  if (!rolloverOn) {
    return (
      <Text size="sm" c="dimmed" style={{ opacity: rowDim ? 0.5 : 1, whiteSpace: 'nowrap' }}>
        {formatSigned(value)}
      </Text>
    );
  }
  return (
    <Text size="sm" c={availableColor(value)} fw={500} style={{ opacity: rowDim ? 0.5 : 1, whiteSpace: 'nowrap' }}>
      {formatSigned(value)}
    </Text>
  );
}

export function renderAvailableCell(value: number, rowDim: boolean) {
  const color = availableColor(value);
  return (
    <Group gap={4} wrap="nowrap" justify="flex-end" style={{ opacity: rowDim ? 0.5 : 1, whiteSpace: 'nowrap' }}>
      <Text c={color} fw={500} component="span" style={{ whiteSpace: 'nowrap' }}>
        {formatSigned(value)}
      </Text>
      <Text c={color} component="span" aria-hidden style={{ lineHeight: 0 }}>
        {directionIcon(value)}
      </Text>
    </Group>
  );
}
