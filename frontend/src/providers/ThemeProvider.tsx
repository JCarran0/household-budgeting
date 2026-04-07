import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { mergePalette, buildTheme, defaultPalette } from '../theme';
import type { ColorPalette, DeepPartial } from '../theme';
import { api } from '../lib/api';
import { ThemeContext } from './ThemeContext';

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [overrides, setOverrides] = useState<DeepPartial<ColorPalette>>({});

  // Load saved preferences on mount
  const { isLoading } = useQuery({
    queryKey: ['themePreferences'],
    queryFn: () => api.getThemePreferences(),
    staleTime: Infinity, // Theme rarely changes — don't refetch automatically
    select: (data) => {
      if (data) {
        setOverrides(data as DeepPartial<ColorPalette>);
      }
      return data;
    },
  });

  const updatePalette = useCallback((newOverrides: DeepPartial<ColorPalette>) => {
    setOverrides(newOverrides);
  }, []);

  const resetPalette = useCallback(() => {
    setOverrides({});
  }, []);

  const palette = useMemo(
    () => (Object.keys(overrides).length > 0 ? mergePalette(overrides) : defaultPalette),
    [overrides],
  );

  const theme = useMemo(() => buildTheme(palette), [palette]);

  const contextValue = useMemo(
    () => ({ palette, overrides, updatePalette, resetPalette, isLoading }),
    [palette, overrides, updatePalette, resetPalette, isLoading],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <MantineProvider theme={theme} defaultColorScheme="dark">
        {children}
      </MantineProvider>
    </ThemeContext.Provider>
  );
}
