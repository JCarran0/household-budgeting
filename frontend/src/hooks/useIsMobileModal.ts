import { useMediaQuery } from '@mantine/hooks';

/**
 * Returns true when the viewport is at or below Mantine's `sm` breakpoint
 * (48em / 768px) — the threshold at which ResponsiveModal renders full-screen.
 *
 * `getInitialValueInEffect: false` makes the media query evaluate synchronously
 * on first render (via `window.matchMedia`) instead of returning the default
 * `false` and updating in a post-mount effect. Without this, mobile modals
 * flash a non-fullscreen layout on open — and if the post-mount re-render
 * doesn't land, the modal stays at its desktop `size` (e.g. 440px for "md"),
 * wider than a phone viewport, hiding the close X off-screen.
 */
export function useIsMobileModal(): boolean {
  return useMediaQuery('(max-width: 48em)', false, { getInitialValueInEffect: false }) ?? false;
}
