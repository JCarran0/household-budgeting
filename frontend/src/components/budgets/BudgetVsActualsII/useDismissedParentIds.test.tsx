import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDismissedParentIds } from './useDismissedParentIds';
import { DISMISSED_STORAGE_KEY } from '../../../../../shared/utils/bvaIISerialization';

// The landmine: dismiss is a per-user (per-browser) localStorage preference,
// NOT Category.isHidden. These tests pin that separation.

describe('useDismissedParentIds', () => {
  describe('landmine: storage key locality', () => {
    it('reads and writes exactly the BvA II localStorage key, not a category-shaped key', () => {
      // Canary: the shared key constant is the only surface the hook touches.
      // A change to DISMISSED_STORAGE_KEY that collides with category state
      // (e.g. "hiddenCategories") would break this test.
      expect(DISMISSED_STORAGE_KEY).toBe('bva2.dismissedParentCategoryIds');
      expect(DISMISSED_STORAGE_KEY).not.toMatch(/isHidden/i);
      expect(DISMISSED_STORAGE_KEY).not.toMatch(/^categor/i);
    });

    it('persists to the BvA II key and never touches any other localStorage key', () => {
      const { result } = renderHook(() => useDismissedParentIds());
      act(() => result.current.dismiss('FOOD'));

      // The only key touched must be DISMISSED_STORAGE_KEY.
      expect(window.localStorage.length).toBe(1);
      expect(window.localStorage.key(0)).toBe(DISMISSED_STORAGE_KEY);
      const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!)).toEqual(['FOOD']);
    });

    it('survives seeding unrelated keys — e.g. a categories-shaped key — without reading them', () => {
      // If the hook ever tried to read Category state from localStorage (or a
      // cache) it would pick this value up. The assertion is that it doesn't.
      window.localStorage.setItem('categories', JSON.stringify([{ id: 'X', isHidden: true }]));
      window.localStorage.setItem('hiddenCategories', JSON.stringify(['X']));

      const { result } = renderHook(() => useDismissedParentIds());
      expect(Array.from(result.current.dismissedIds)).toEqual([]);
    });
  });

  describe('hydration + persistence', () => {
    it('hydrates initial state from localStorage on mount', () => {
      window.localStorage.setItem(
        DISMISSED_STORAGE_KEY,
        JSON.stringify(['TRAVEL', 'FOOD']),
      );
      const { result } = renderHook(() => useDismissedParentIds());
      expect(result.current.dismissedIds).toEqual(new Set(['TRAVEL', 'FOOD']));
    });

    it('returns empty set when storage is empty', () => {
      const { result } = renderHook(() => useDismissedParentIds());
      expect(result.current.dismissedIds.size).toBe(0);
    });

    it('returns empty set when storage contains corrupt JSON', () => {
      window.localStorage.setItem(DISMISSED_STORAGE_KEY, 'not{json');
      const { result } = renderHook(() => useDismissedParentIds());
      expect(result.current.dismissedIds.size).toBe(0);
    });

    it('drops non-string entries from a malformed array silently', () => {
      window.localStorage.setItem(
        DISMISSED_STORAGE_KEY,
        JSON.stringify(['FOOD', 42, null, { id: 'X' }, 'TRAVEL']),
      );
      const { result } = renderHook(() => useDismissedParentIds());
      expect(result.current.dismissedIds).toEqual(new Set(['FOOD', 'TRAVEL']));
    });
  });

  describe('dismiss / restore', () => {
    it('adds an id on dismiss and persists', () => {
      const { result } = renderHook(() => useDismissedParentIds());
      act(() => result.current.dismiss('FOOD'));
      expect(result.current.dismissedIds).toEqual(new Set(['FOOD']));
      expect(window.localStorage.getItem(DISMISSED_STORAGE_KEY)).toBe(
        JSON.stringify(['FOOD']),
      );
    });

    it('is idempotent: dismissing an already-dismissed id is a no-op', () => {
      const { result } = renderHook(() => useDismissedParentIds());
      act(() => result.current.dismiss('FOOD'));
      const firstRef = result.current.dismissedIds;
      act(() => result.current.dismiss('FOOD'));
      // Identity preserved — reducer returns prev when id already present
      // (useDismissedParentIds.ts line 73).
      expect(result.current.dismissedIds).toBe(firstRef);
    });

    it('restores an id and persists the removal', () => {
      window.localStorage.setItem(
        DISMISSED_STORAGE_KEY,
        JSON.stringify(['FOOD', 'TRAVEL']),
      );
      const { result } = renderHook(() => useDismissedParentIds());
      act(() => result.current.restore('FOOD'));
      expect(result.current.dismissedIds).toEqual(new Set(['TRAVEL']));
      expect(window.localStorage.getItem(DISMISSED_STORAGE_KEY)).toBe(
        JSON.stringify(['TRAVEL']),
      );
    });

    it('restore is a no-op when the id is not dismissed', () => {
      const { result } = renderHook(() => useDismissedParentIds());
      const firstRef = result.current.dismissedIds;
      act(() => result.current.restore('NEVER_DISMISSED'));
      expect(result.current.dismissedIds).toBe(firstRef);
    });
  });

  describe('showDismissed (ephemeral)', () => {
    it('defaults to false', () => {
      const { result } = renderHook(() => useDismissedParentIds());
      expect(result.current.showDismissed).toBe(false);
    });

    it('is NOT persisted to localStorage — remounting returns to false', () => {
      const { result, unmount } = renderHook(() => useDismissedParentIds());
      act(() => result.current.setShowDismissed(true));
      expect(result.current.showDismissed).toBe(true);
      unmount();

      const { result: next } = renderHook(() => useDismissedParentIds());
      expect(next.current.showDismissed).toBe(false);
      // And no key was added for it.
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        expect(key).not.toMatch(/show/i);
      }
    });
  });
});
