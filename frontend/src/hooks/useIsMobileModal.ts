import { useMediaQuery } from '@mantine/hooks';

/**
 * Returns true when the viewport is at or below Mantine's `sm` breakpoint
 * (48em / 768px) — the threshold at which ResponsiveModal renders full-screen.
 * SSR-safe: useMediaQuery returns undefined server-side; we treat that as
 * not-mobile.
 */
export function useIsMobileModal(): boolean {
  return useMediaQuery('(max-width: 48em)') ?? false;
}
