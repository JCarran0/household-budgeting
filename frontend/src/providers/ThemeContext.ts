import { createContext } from 'react';
import type { ColorPalette, DeepPartial } from '../theme';

export interface ThemeContextValue {
  /** Current palette (defaults merged with overrides) */
  palette: ColorPalette;
  /** Current user overrides (only the diff from defaults) */
  overrides: DeepPartial<ColorPalette>;
  /** Update palette overrides for live preview (does NOT persist) */
  updatePalette: (newOverrides: DeepPartial<ColorPalette>) => void;
  /** Reset palette to defaults (local state only) */
  resetPalette: () => void;
  /** Whether saved preferences are still loading */
  isLoading: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
