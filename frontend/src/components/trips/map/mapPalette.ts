/**
 * Map day palette — maps a day index (0-based) to a stable color for pins
 * and (optionally) transit lines. Wraps with slight hue shifts after the
 * base palette is exhausted so long trips still render distinctly.
 */

// schemeTableau10 equivalents — 10 hues picked for colorblind-readability.
const BASE_PALETTE = [
  '#4E79A7',
  '#F28E2B',
  '#E15759',
  '#76B7B2',
  '#59A14F',
  '#EDC948',
  '#B07AA1',
  '#FF9DA7',
  '#9C755F',
  '#BAB0AC',
];

export function dayColor(dayIndex: number): string {
  if (dayIndex < 0) return BASE_PALETTE[0];
  return BASE_PALETTE[dayIndex % BASE_PALETTE.length];
}

export function totalPaletteSize(): number {
  return BASE_PALETTE.length;
}
