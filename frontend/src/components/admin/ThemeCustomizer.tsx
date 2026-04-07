import { useCallback, useState } from 'react';
import {
  Card,
  Stack,
  Group,
  Button,
  Title,
  Text,
  SimpleGrid,
  ColorInput,
  Divider,
  Alert,
  Tooltip,
  SegmentedControl,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconPalette, IconRefresh, IconSun, IconMoon } from '@tabler/icons-react';
import { useTheme } from '../../providers/useTheme';
import { defaultPalette } from '../../theme';
import type { ColorPalette, DeepPartial } from '../../theme';
import { api } from '../../lib/api';

// ─── HSL shade generation ───────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Generate a 10-shade Mantine color scale from a single base color.
 * Index 0 = lightest, index 9 = darkest. The base color lands at index 5.
 */
function generateScale(baseHex: string): string[] {
  const [h, s] = hexToHsl(baseHex);
  // Lightness ramp: index 0 is very light, index 9 is very dark
  const lightnesses = [95, 85, 72, 60, 50, 42, 35, 28, 22, 16];
  // Desaturate extremes slightly for a natural feel
  return lightnesses.map((l, i) => {
    const satAdjust = i <= 1 ? s * 0.6 : i >= 8 ? s * 0.8 : s;
    return hslToHex(h, Math.min(satAdjust, 100), l);
  });
}

// Color picker group definitions
interface ColorField {
  label: string;
  tooltip?: string;
  getValue: (palette: ColorPalette) => string;
  buildOverride: (color: string, current: DeepPartial<ColorPalette>) => DeepPartial<ColorPalette>;
}

interface ColorGroup {
  title: string;
  description: string;
  fields: ColorField[];
}

/**
 * Picking one color auto-generates the full 10-shade scale for that key.
 * The picker displays/edits the shade-5 value; all 10 shades are derived.
 */
function makeAutoScaleField(
  label: string,
  scaleKey: string,
): ColorField {
  return {
    label,
    getValue: (p) => (p.colors[scaleKey] as unknown as string[])?.[5] ?? '#000000',
    buildOverride: (color, current) => ({
      ...current,
      colors: {
        ...current.colors,
        [scaleKey]: generateScale(color),
      },
    }),
  };
}

function makeColorScaleField(
  label: string,
  scaleKey: string,
  index: number,
): ColorField {
  return {
    label,
    getValue: (p) => (p.colors[scaleKey] as unknown as string[])?.[index] ?? '#000000',
    buildOverride: (color, current) => {
      // Start from the full default scale so the override is always a complete tuple
      const base = [...(defaultPalette.colors[scaleKey] as unknown as string[])];
      const existing = (current.colors?.[scaleKey] ?? []) as string[];
      // Layer in any previously overridden indices
      existing.forEach((v, i) => { if (v !== undefined) base[i] = v; });
      base[index] = color;
      const updated = base;
      return {
        ...current,
        colors: {
          ...current.colors,
          [scaleKey]: updated,
        },
      };
    },
  };
}

function makeChartField(
  label: string,
  key: keyof ColorPalette['chart'],
): ColorField {
  return {
    label,
    getValue: (p) => {
      const val = p.chart[key];
      return typeof val === 'string' ? val : '#000000';
    },
    buildOverride: (color, current) => ({
      ...current,
      chart: {
        ...current.chart,
        [key]: color,
      },
    }),
  };
}

function makeChartSeriesField(label: string, index: number): ColorField {
  return {
    label,
    getValue: (p) => p.chart.series[index] ?? '#000000',
    buildOverride: (color, current) => {
      const base = [...defaultPalette.chart.series];
      const existing = ((current.chart as Partial<ColorPalette['chart']>)?.series ?? []) as string[];
      existing.forEach((v, i) => { if (v !== undefined) base[i] = v; });
      base[index] = color;
      const updated = base;
      return {
        ...current,
        chart: {
          ...current.chart,
          series: updated,
        },
      };
    },
  };
}

const COLOR_GROUPS: ColorGroup[] = [
  {
    title: 'Backgrounds',
    description: 'Surface and background colors for the app shell',
    fields: [
      { ...makeColorScaleField('Surfaces', 'dark', 6), tooltip: 'Cards, inputs, nav highlight, and other surface elements' },
      makeColorScaleField('Main Background', 'dark', 7),
      makeColorScaleField('Deep Elements', 'dark', 8),
      makeColorScaleField('Darkest Tone', 'dark', 9),
    ],
  },
  {
    title: 'Primary Accent',
    description: 'Pick one color — all shades (buttons, nav highlight, etc.) are generated automatically',
    fields: [
      makeAutoScaleField('Accent Color', 'yellow'),
    ],
  },
  {
    title: 'Semantic Colors',
    description: 'Pick a base color per status — full shade scales are generated automatically',
    fields: [
      makeAutoScaleField('Error', 'red'),
      makeAutoScaleField('Warning', 'orange'),
      makeAutoScaleField('Success', 'green'),
      makeAutoScaleField('Info', 'blue'),
    ],
  },
  {
    title: 'Chart Colors',
    description: 'Colors used in charts and visualizations',
    fields: [
      makeChartField('Income', 'income'),
      makeChartField('Expense', 'expense'),
      makeChartField('Budgeted', 'budgeted'),
      makeChartField('Prior Year', 'priorYear'),
      ...defaultPalette.chart.series.map((_, i) =>
        makeChartSeriesField(`Series ${i + 1}`, i),
      ),
    ],
  },
];

export function ThemeCustomizer() {
  const { palette, overrides, updatePalette, resetPalette, colorScheme, setColorScheme } = useTheme();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.saveThemePreferences(data),
    onSuccess: () => {
      setHasUnsavedChanges(false);
      notifications.show({
        title: 'Theme saved',
        message: 'Your color preferences have been saved.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    },
    onError: () => {
      notifications.show({
        title: 'Save failed',
        message: 'Could not save theme preferences. Please try again.',
        color: 'red',
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api.resetThemePreferences(),
    onSuccess: () => {
      resetPalette();
      setHasUnsavedChanges(false);
      notifications.show({
        title: 'Theme reset',
        message: 'Colors have been restored to defaults.',
        color: 'blue',
        icon: <IconRefresh size={16} />,
      });
    },
    onError: () => {
      notifications.show({
        title: 'Reset failed',
        message: 'Could not reset theme preferences. Please try again.',
        color: 'red',
      });
    },
  });

  const handleColorChange = useCallback(
    (field: ColorField, color: string) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
      const newOverrides = field.buildOverride(color, overrides);
      updatePalette(newOverrides);
      setHasUnsavedChanges(true);
    },
    [overrides, updatePalette],
  );

  const handleSave = useCallback(() => {
    saveMutation.mutate({ ...overrides as Record<string, unknown>, colorScheme });
  }, [overrides, colorScheme, saveMutation]);

  const handleReset = useCallback(() => {
    resetMutation.mutate();
  }, [resetMutation]);

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <IconPalette size={24} />
            <Title order={3}>Theme Customizer</Title>
          </Group>
          <Group gap="sm">
            <Button
              variant="default"
              size="sm"
              onClick={handleReset}
              loading={resetMutation.isPending}
              disabled={saveMutation.isPending}
            >
              Reset to Defaults
            </Button>
            <Button
              variant="gradient"
              gradient={{ from: 'yellow', to: 'orange' }}
              size="sm"
              onClick={handleSave}
              loading={saveMutation.isPending}
              disabled={resetMutation.isPending || !hasUnsavedChanges}
            >
              Save
            </Button>
          </Group>
        </Group>

        <Group gap="sm">
          <Text size="sm" fw={500}>Color Scheme</Text>
          <SegmentedControl
            value={colorScheme}
            onChange={(value) => {
              setColorScheme(value as 'light' | 'dark');
              setHasUnsavedChanges(true);
            }}
            data={[
              { label: <Group gap={4}><IconSun size={14} /><span>Light</span></Group>, value: 'light' },
              { label: <Group gap={4}><IconMoon size={14} /><span>Dark</span></Group>, value: 'dark' },
            ]}
            size="sm"
          />
        </Group>

        {hasUnsavedChanges && (
          <Alert color="yellow" variant="light">
            <Text size="sm">
              You have unsaved changes. Colors are previewing live — click Save to persist.
            </Text>
          </Alert>
        )}

        {COLOR_GROUPS.map((group) => (
          <Stack key={group.title} gap="sm">
            <Divider />
            <div>
              <Text fw={600} size="sm">{group.title}</Text>
              <Text size="xs" c="dimmed">{group.description}</Text>
            </div>
            <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="sm">
              {group.fields.map((field) => (
                <ColorInput
                  key={field.label}
                  label={
                    field.tooltip ? (
                      <Tooltip label={field.tooltip} withArrow>
                        <Text size="sm" span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>
                          {field.label}
                        </Text>
                      </Tooltip>
                    ) : field.label
                  }
                  value={field.getValue(palette)}
                  onChange={(color) => handleColorChange(field, color)}
                  format="hex"
                  size="sm"
                />
              ))}
            </SimpleGrid>
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}
