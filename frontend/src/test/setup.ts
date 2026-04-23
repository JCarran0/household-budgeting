import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// JSDOM doesn't provide ResizeObserver; Mantine's SegmentedControl uses it
// via FloatingIndicator. Stub with a no-op implementation.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class NoopResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    NoopResizeObserver as unknown as typeof ResizeObserver;
}

// JSDOM doesn't provide window.matchMedia. Mantine's ResponsiveModal +
// useMediaQuery crash without it. Stub to "no match" so components behave
// as if they're rendering on desktop in tests.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Reset DOM + localStorage between tests so per-test state doesn't leak.
// Critical for useDismissedParentIds tests, which touch localStorage directly
// (per the landmine in CLAUDE.md: dismiss is per-user localStorage, not isHidden).
afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
