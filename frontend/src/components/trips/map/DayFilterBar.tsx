import { Chip, ScrollArea } from '@mantine/core';

export interface DayFilterChip {
  /** 'all' or ISO date string. */
  value: 'all' | string;
  label: string;
  isToday?: boolean;
}

export interface DayFilterBarProps {
  chips: DayFilterChip[];
  selected: 'all' | string;
  onSelect: (value: 'all' | string) => void;
}

export function DayFilterBar({ chips, selected, onSelect }: DayFilterBarProps) {
  return (
    <ScrollArea
      type="never"
      offsetScrollbars={false}
      style={{ width: '100%' }}
      aria-label="Filter map by day"
    >
      <Chip.Group
        multiple={false}
        value={selected}
        onChange={(val) => {
          if (typeof val === 'string') onSelect(val);
        }}
      >
        <div style={{ display: 'flex', gap: 6, paddingBottom: 4 }}>
          {chips.map((chip) => (
            <Chip
              key={chip.value}
              value={chip.value}
              size="xs"
              variant={chip.isToday ? 'filled' : 'outline'}
              color={chip.isToday ? 'blue' : 'gray'}
            >
              {chip.label}
            </Chip>
          ))}
        </div>
      </Chip.Group>
    </ScrollArea>
  );
}
