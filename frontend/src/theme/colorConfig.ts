import type { MantineColorsTuple } from '@mantine/core';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ColorPalette {
  /** Mantine color scale overrides (each is a 10-shade tuple, index 0 = lightest) */
  colors: Record<string, MantineColorsTuple>;
  /** Which key in `colors` serves as the primary accent */
  primaryColor: string;
  /** Recharts / charting hex colors */
  chart: {
    /** Ordered series for pie/bar category charts */
    series: string[];
    income: string;
    expense: string;
    budgeted: string;
    priorYear: string;
    average: string;
    plannedSpending: string;
    actualSpending: string;
    barFill: string;
  };
  /** Button gradient definitions */
  gradients: {
    primaryButton: { from: string; to: string };
  };
  /** Debug panel colors */
  debug: {
    background: string;
    border: string;
  };
}

// ─── Deep-partial utility for user overrides ─────────────────────────────────

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ─── Sage & Stone Palette ────────────────────────────────────────────────────

export const defaultPalette: ColorPalette = {
  colors: {
    // Dark theme backgrounds — sage green undertone, brighter than pure black
    dark: [
      '#C8CAC4', // 0 — lightest (text-on-dark)
      '#AAADA4', // 1
      '#8C9082', // 2
      '#6E7363', // 3
      '#565B4C', // 4
      '#454A3D', // 5
      '#3A3F33', // 6 — cards / surfaces
      '#2F3429', // 7 — sidebar / main bg
      '#262B21', // 8 — deepest bg
      '#1E2219', // 9 — darkest
    ] as MantineColorsTuple,

    // Primary — warm sand / wheat (replaces yellow)
    yellow: [
      '#FBF6EE', // 0
      '#F3E8D4', // 1
      '#E8D5B3', // 2
      '#DBBF8A', // 3
      '#D1AC6B', // 4
      '#C4A882', // 5 — default shade
      '#B08E5A', // 6
      '#967543', // 7
      '#7A5E34', // 8
      '#5E4828', // 9
    ] as MantineColorsTuple,

    // Error / destructive — brick terracotta (replaces red)
    red: [
      '#F8EDEB', // 0
      '#F0D5CF', // 1
      '#E3AFA5', // 2
      '#D4877A', // 3
      '#C46558', // 4
      '#B5564E', // 5 — default shade
      '#9C4640', // 6
      '#833832', // 7
      '#6B2C28', // 8
      '#54211E', // 9
    ] as MantineColorsTuple,

    // Warning — warm amber (replaces orange)
    orange: [
      '#FDF5EB', // 0
      '#F8E6CE', // 1
      '#F0D0A5', // 2
      '#E5B576', // 3
      '#D9A05C', // 4
      '#C49A5C', // 5 — default shade
      '#AD8044', // 6
      '#916834', // 7
      '#755228', // 8
      '#5A3E1E', // 9
    ] as MantineColorsTuple,

    // Success — muted sage green (replaces green)
    green: [
      '#EFF4EC', // 0
      '#D8E5D2', // 1
      '#BBCFB2', // 2
      '#9DB890', // 3
      '#8AAA7D', // 4
      '#7A9B6D', // 5 — default shade
      '#658459', // 6
      '#526C48', // 7
      '#405639', // 8
      '#30412B', // 9
    ] as MantineColorsTuple,

    // Info — dusty slate blue (replaces blue)
    blue: [
      '#EDF1F5', // 0
      '#D3DCE6', // 1
      '#B3C2D2', // 2
      '#90A6BB', // 3
      '#7694A9', // 4
      '#6B8CA6', // 5 — default shade
      '#587590', // 6
      '#475F76', // 7
      '#384B5E', // 8
      '#2B3948', // 9
    ] as MantineColorsTuple,

    // Accent — dusty rose (replaces grape)
    grape: [
      '#F5EDF1', // 0
      '#E6D3DC', // 1
      '#D2B3C2', // 2
      '#BB90A6', // 3
      '#A97694', // 4
      '#9E6B8C', // 5 — default shade
      '#875877', // 6
      '#704762', // 7
      '#5A384E', // 8
      '#452B3B', // 9
    ] as MantineColorsTuple,

    // Teal — muted eucalyptus
    teal: [
      '#ECF4F3', // 0
      '#D2E5E2', // 1
      '#B2CFCB', // 2
      '#8FB8B2', // 3
      '#75A69F', // 4
      '#5E948C', // 5
      '#4D7D76', // 6
      '#3E6660', // 7
      '#31514C', // 8
      '#243D39', // 9
    ] as MantineColorsTuple,

    // Cyan — soft sky
    cyan: [
      '#ECF3F6', // 0
      '#D2E3EA', // 1
      '#B0CED9', // 2
      '#8AB7C6', // 3
      '#6DA4B6', // 4
      '#5692A6', // 5
      '#467D90', // 6
      '#386776', // 7
      '#2C525E', // 8
      '#213E47', // 9
    ] as MantineColorsTuple,

    // Violet — muted lavender
    violet: [
      '#F0EDF5', // 0
      '#DCD3E6', // 1
      '#C2B3D2', // 2
      '#A690BB', // 3
      '#9276A9', // 4
      '#826B9E', // 5
      '#6E5887', // 6
      '#5A4770', // 7
      '#48385A', // 8
      '#362B45', // 9
    ] as MantineColorsTuple,

    // Pink — muted blush
    pink: [
      '#F5EDEE', // 0
      '#E6D3D6', // 1
      '#D2B3B8', // 2
      '#BB9098', // 3
      '#A97680', // 4
      '#9E6B73', // 5
      '#875862', // 6
      '#704752', // 7
      '#5A3842', // 8
      '#452B33', // 9
    ] as MantineColorsTuple,

    // Indigo — muted denim
    indigo: [
      '#EDEEF5', // 0
      '#D3D6E6', // 1
      '#B3B8D2', // 2
      '#9098BB', // 3
      '#7680A9', // 4
      '#6B739E', // 5
      '#585F87', // 6
      '#474D70', // 7
      '#383D5A', // 8
      '#2B2E45', // 9
    ] as MantineColorsTuple,

    // Gray — warm stone gray (neutral with warmth)
    gray: [
      '#F5F4F2', // 0
      '#E8E6E2', // 1
      '#D4D1CB', // 2
      '#BEBAB2', // 3
      '#A8A39A', // 4
      '#928C82', // 5
      '#7A756C', // 6
      '#635F57', // 7
      '#4D4A44', // 8
      '#383632', // 9
    ] as MantineColorsTuple,
  },

  primaryColor: 'yellow',

  chart: {
    series: [
      '#6B739E', // muted denim (indigo)
      '#5692A6', // soft sky (cyan)
      '#7A9B6D', // sage green
      '#C49A5C', // warm amber
      '#B5564E', // brick terracotta
      '#826B9E', // muted lavender
      '#9E6B73', // muted blush
      '#5E948C', // eucalyptus teal
    ],
    income: '#7A9B6D',          // sage green
    expense: '#B5564E',         // brick terracotta
    budgeted: '#6B8CA6',        // dusty slate
    priorYear: '#C49A5C',       // warm amber
    average: '#7A9B6D',         // sage green
    plannedSpending: '#5E948C', // eucalyptus teal
    actualSpending: '#6DA4B6',  // soft sky
    barFill: '#6B739E',         // muted denim
  },

  gradients: {
    primaryButton: { from: 'yellow', to: 'orange' },
  },

  debug: {
    background: '#3A3F33',
    border: '#565B4C',
  },
};

// ─── Merge utility for future user overrides ─────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(overrides)) {
    const baseVal = base[key];
    const overVal = overrides[key];
    if (isPlainObject(baseVal) && isPlainObject(overVal)) {
      result[key] = deepMerge(baseVal, overVal);
    } else if (overVal !== undefined) {
      result[key] = overVal;
    }
  }
  return result;
}

/** Merge partial user overrides with the default palette */
export function mergePalette(overrides: DeepPartial<ColorPalette>): ColorPalette {
  return deepMerge(
    defaultPalette as unknown as Record<string, unknown>,
    overrides as Record<string, unknown>,
  ) as unknown as ColorPalette;
}
