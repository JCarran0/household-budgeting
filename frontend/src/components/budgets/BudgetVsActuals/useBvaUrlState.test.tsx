import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useBvaUrlState } from './useBvaUrlState';

function withRouter(initialUrl: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>;
  };
}

/**
 * Spy hook — read the current URL back from the router so assertions can
 * verify that setters write canonical params (and omit defaults).
 */
function useCombined() {
  const state = useBvaUrlState();
  const location = useLocation();
  return { state, search: location.search };
}

describe('useBvaUrlState', () => {
  describe('defaults — no URL params', () => {
    it('rollover defaults to false', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/?other=keep'),
      });
      expect(result.current.state.rollover).toBe(false);
    });

    it('types defaults to all three selected', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/'),
      });
      expect(result.current.state.types).toEqual(
        new Set(['spending', 'income', 'savings']),
      );
    });

    it('variance defaults to "all"', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/'),
      });
      expect(result.current.state.variance).toBe('all');
    });
  });

  describe('reads URL → state', () => {
    it('rollover=1 → true', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/?rollover=1'),
      });
      expect(result.current.state.rollover).toBe(true);
    });

    it('types=income,savings → set of two', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/?types=income,savings'),
      });
      expect(result.current.state.types).toEqual(new Set(['income', 'savings']));
    });

    it('types=none → empty set (REQ-017 empty-state persistence)', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/?types=none'),
      });
      expect(result.current.state.types.size).toBe(0);
    });

    it('variance=serious → "serious"', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/?variance=serious'),
      });
      expect(result.current.state.variance).toBe('serious');
    });
  });

  describe('malformed params fall back safely', () => {
    it('types with unrecognized tokens falls back to "all"', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/?types=garbage'),
      });
      expect(result.current.state.types).toEqual(
        new Set(['spending', 'income', 'savings']),
      );
    });

    it('variance with unrecognized value falls back to "all"', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/?variance=ninja'),
      });
      expect(result.current.state.variance).toBe('all');
    });

    it('rollover with any non-"1" value is false', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/?rollover=true'),
      });
      expect(result.current.state.rollover).toBe(false);
    });
  });

  describe('writes state → URL (canonical)', () => {
    it('setRollover(true) adds ?rollover=1; setRollover(false) removes the param', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/'),
      });
      act(() => result.current.state.setRollover(true));
      expect(new URLSearchParams(result.current.search).get('rollover')).toBe('1');
      act(() => result.current.state.setRollover(false));
      expect(new URLSearchParams(result.current.search).has('rollover')).toBe(false);
    });

    it('setTypes to the full set omits the param (cleaner URLs)', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/?types=income'),
      });
      act(() =>
        result.current.state.setTypes(new Set(['spending', 'income', 'savings'])),
      );
      expect(new URLSearchParams(result.current.search).has('types')).toBe(false);
    });

    it('setTypes to empty writes the "none" sentinel (survives reload — REQ-017)', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/'),
      });
      act(() => result.current.state.setTypes(new Set()));
      expect(new URLSearchParams(result.current.search).get('types')).toBe('none');
    });

    it('setVariance("all") omits the param; other values write the literal', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/?variance=under'),
      });
      act(() => result.current.state.setVariance('all'));
      expect(new URLSearchParams(result.current.search).has('variance')).toBe(false);
      act(() => result.current.state.setVariance('over'));
      expect(new URLSearchParams(result.current.search).get('variance')).toBe('over');
    });
  });

  describe('round-trip and side-effect preservation', () => {
    it('non-default state round-trips URL → state → URL losslessly', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/?rollover=1&types=income,savings&variance=serious'),
      });

      // Read
      expect(result.current.state.rollover).toBe(true);
      expect(result.current.state.types).toEqual(new Set(['income', 'savings']));
      expect(result.current.state.variance).toBe('serious');

      // Re-set with the same values — URL must end up with the same canonical params.
      act(() => {
        result.current.state.setRollover(true);
        result.current.state.setTypes(new Set(['income', 'savings']));
        result.current.state.setVariance('serious');
      });
      const params = new URLSearchParams(result.current.search);
      expect(params.get('rollover')).toBe('1');
      // types order is canonicalized by serializeTypes — keep assertion order-agnostic.
      expect(params.get('types')?.split(',').sort()).toEqual(['income', 'savings']);
      expect(params.get('variance')).toBe('serious');
    });

    it('preserves unrelated query params on each setter', () => {
      const { result } = renderHook(() => useCombined(), {
        wrapper: withRouter('/?month=2026-04&view=accordion&unrelated=keep-me'),
      });
      act(() => result.current.state.setRollover(true));
      act(() => result.current.state.setVariance('over'));
      const params = new URLSearchParams(result.current.search);
      expect(params.get('month')).toBe('2026-04');
      expect(params.get('view')).toBe('accordion');
      expect(params.get('unrelated')).toBe('keep-me');
      expect(params.get('rollover')).toBe('1');
      expect(params.get('variance')).toBe('over');
    });
  });
});
