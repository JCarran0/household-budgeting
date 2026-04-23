import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

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
