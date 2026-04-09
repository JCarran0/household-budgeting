import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { MantineProvider, type MantineColorScheme } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { mergePalette, buildTheme, defaultPalette } from '../theme';
import type { ColorPalette, DeepPartial } from '../theme';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { ThemeContext } from './ThemeContext';

interface SavedPreferences {
  colorScheme?: MantineColorScheme;
  [key: string]: unknown;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [overrides, setOverrides] = useState<DeepPartial<ColorPalette>>({});
  const [colorScheme, setColorScheme] = useState<MantineColorScheme>('light');
  const initialLoadDone = useRef(false);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  // Load saved preferences only when authenticated (prevents 401 retry loop on login page)
  const { data: savedPrefs, isLoading } = useQuery({
    queryKey: ['themePreferences'],
    queryFn: () => api.getThemePreferences(),
    staleTime: Infinity,
    enabled: isAuthenticated,
    retry: false,
  });

  // Sync fetched preferences into state only on initial load
  useEffect(() => {
    if (savedPrefs && !initialLoadDone.current) {
      initialLoadDone.current = true;
      const { colorScheme: savedScheme, ...paletteOverrides } = savedPrefs as SavedPreferences;
      if (savedScheme) {
        setColorScheme(savedScheme);
      }
      setOverrides(paletteOverrides as DeepPartial<ColorPalette>);
    }
  }, [savedPrefs]);

  const updatePalette = useCallback((newOverrides: DeepPartial<ColorPalette>) => {
    setOverrides(newOverrides);
  }, []);

  const resetPalette = useCallback(() => {
    setOverrides({});
    setColorScheme('light');
  }, []);

  const palette = useMemo(
    () => (Object.keys(overrides).length > 0 ? mergePalette(overrides) : defaultPalette),
    [overrides],
  );

  const theme = useMemo(() => buildTheme(palette), [palette]);

  const contextValue = useMemo(
    () => ({ palette, overrides, updatePalette, resetPalette, colorScheme, setColorScheme, isLoading }),
    [palette, overrides, updatePalette, resetPalette, colorScheme, setColorScheme, isLoading],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <MantineProvider theme={theme} defaultColorScheme={colorScheme} forceColorScheme={colorScheme === 'auto' ? undefined : colorScheme}>
        {children}
      </MantineProvider>
    </ThemeContext.Provider>
  );
}
