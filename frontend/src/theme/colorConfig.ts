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
    // Peach cream backgrounds — inverted dark scale for light feel
    // In Mantine dark scheme: dark[7] = body bg, dark[6] = surfaces, dark[0] = text
    dark: [
      '#3D3520', // 0 — text color (dark olive-brown)
      '#564D35', // 1 — secondary text
      '#74694E', // 2 — subtle borders
      '#908466', // 3 — input borders
      '#ACA080', // 4 — placeholder text / muted
      '#C4B99C', // 5 — disabled states
      '#F0DEC8', // 6 — cards / surfaces (lighter peach)
      '#F2D9C4', // 7 — main body background (peach cream)
      '#E4CCB4', // 8 — deeper elements
      '#D6BFA6', // 9 — darkest light tone
    ] as MantineColorsTuple,

    // Primary — dark amber (replaces yellow) — strong contrast on cream
    yellow: [
      '#FEF4E2', // 0
      '#F5DAA8', // 1
      '#E4BB6E', // 2
      '#D09E3E', // 3
      '#B88A28', // 4
      '#A07820', // 5 — default shade (dark amber)
      '#8A6818', // 6
      '#745814', // 7
      '#5E4810', // 8
      '#48380C', // 9
    ] as MantineColorsTuple,

    // Error / destructive — burnt orange (replaces red)
    red: [
      '#FCEFE6', // 0
      '#F5D5C0', // 1
      '#ECB694', // 2
      '#E29868', // 3
      '#DB8648', // 4
      '#D4782A', // 5 — default shade (burnt orange)
      '#BC6822', // 6
      '#9E561C', // 7
      '#804516', // 8
      '#643512', // 9
    ] as MantineColorsTuple,

    // Warning — amber-gold (replaces orange, derived from amber)
    orange: [
      '#FDF5E4', // 0
      '#F9E4B8', // 1
      '#F2D08A', // 2
      '#EABC5E', // 3
      '#E4AD42', // 4
      '#D89E30', // 5 — default shade
      '#C08A24', // 6
      '#A2741E', // 7
      '#845E18', // 8
      '#664812', // 9
    ] as MantineColorsTuple,

    // Success — sage olive green (replaces green)
    green: [
      '#F2F3E8', // 0
      '#DFE1C8', // 1
      '#CBCEA8', // 2
      '#C0C49A', // 3
      '#BABe92', // 4
      '#B5B88A', // 5 — default shade (sage olive)
      '#9CA072', // 6
      '#82865C', // 7
      '#6A6C4A', // 8
      '#525438', // 9
    ] as MantineColorsTuple,

    // Info — olive-tinted brown (warm neutral, complements palette)
    blue: [
      '#F0EDE6', // 0
      '#DBD5C4', // 1
      '#C2B99E', // 2
      '#A89C78', // 3
      '#978A64', // 4
      '#8B7D2B', // 5 — default shade (dark olive from palette)
      '#7A6E26', // 6
      '#655B20', // 7
      '#50481A', // 8
      '#3C3614', // 9
    ] as MantineColorsTuple,

    // Accent — warm terracotta (replaces grape)
    grape: [
      '#F8EDE4', // 0
      '#EDD3C0', // 1
      '#DFB496', // 2
      '#D09670', // 3
      '#C68558', // 4
      '#BA7644', // 5 — default shade
      '#A06438', // 6
      '#86532E', // 7
      '#6C4224', // 8
      '#54331C', // 9
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
      '#A07820', // dark amber
      '#B5B88A', // sage olive
      '#D4782A', // burnt orange
      '#8B7D2B', // dark olive
      '#BA7644', // warm terracotta
      '#9CA072', // dark sage
      '#A8741E', // rich amber
      '#82865C', // olive
    ],
    income: '#B5B88A',          // sage olive
    expense: '#D4782A',         // burnt orange
    budgeted: '#8B7D2B',        // dark olive
    priorYear: '#C08524',       // deep amber
    average: '#B5B88A',         // sage olive
    plannedSpending: '#9CA072', // dark sage
    actualSpending: '#82865C',  // olive
    barFill: '#BA7644',         // warm terracotta
  },

  gradients: {
    primaryButton: { from: 'yellow', to: 'orange' },
  },

  debug: {
    background: '#F0DEC8',
    border: '#D6BFA6',
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
