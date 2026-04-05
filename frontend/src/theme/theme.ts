import { createTheme } from '@mantine/core';
import type { ColorPalette } from './colorConfig';
import { defaultPalette } from './colorConfig';

/** Build a Mantine theme object from a ColorPalette */
export function buildTheme(palette: ColorPalette) {
  return createTheme({
    primaryColor: palette.primaryColor,
    colors: palette.colors,
    defaultRadius: 'md',
    cursorType: 'pointer',
  });
}

/** Pre-built theme using the default Sage & Stone palette */
export const theme = buildTheme(defaultPalette);
