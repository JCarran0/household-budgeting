import { useMemo } from 'react';
import { Paper, Group } from '@mantine/core';
import { IconPlane } from '@tabler/icons-react';
import { pickDailyQuote } from '../lib/inspirationQuotes';

export function DailyQuoteStrip() {
  const quote = useMemo(() => pickDailyQuote(), []);

  return (
    <Paper
      mb="md"
      radius="sm"
      style={{
        background: '#0b1b2b',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 18px',
      }}
    >
      <Group gap="sm" wrap="nowrap" align="center">
        <IconPlane
          size={18}
          stroke={1.75}
          style={{ color: 'rgba(255,255,255,0.55)', transform: 'rotate(-20deg)', flexShrink: 0 }}
        />
        <div
          style={{
            color: 'rgba(255,255,255,0.92)',
            fontFamily: "'Fraunces', 'Georgia', serif",
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 17,
            lineHeight: 1.35,
            letterSpacing: '-0.005em',
          }}
        >
          {quote}
        </div>
      </Group>
    </Paper>
  );
}
