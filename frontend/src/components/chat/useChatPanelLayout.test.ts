/**
 * Chat panel geometry
 *
 * The property worth locking is the one that is counter-intuitive: expanding
 * must NOT widen the text. Bubbles are 85% of their container, so a panel that
 * filled a wide monitor would put well over a thousand pixels of prose on one
 * line — harder to read than the narrow panel it replaced, which is the
 * opposite of what the toggle is for.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatPanelLayout } from './useChatPanelLayout';

beforeEach(() => {
  localStorage.clear();
});

describe('expanding', () => {
  it('fills the viewport but keeps the content column at a reading measure', () => {
    const { result } = renderHook(() => useChatPanelLayout(false));
    act(() => result.current.toggle());

    expect(result.current.expanded).toBe(true);
    expect(result.current.panelStyle.inset).toBe(16);
    // The extra space buys margins and scrollback, not longer lines.
    expect(result.current.contentStyle.maxWidth).toBe(860);
    expect(result.current.contentStyle.marginInline).toBe('auto');
  });

  it('constrains nothing while docked — 400px needs no help', () => {
    const { result } = renderHook(() => useChatPanelLayout(false));
    expect(result.current.contentStyle).toEqual({});
    expect(result.current.panelStyle.width).toBe(400);
  });

  it('remembers the choice across mounts', () => {
    const first = renderHook(() => useChatPanelLayout(false));
    act(() => first.result.current.toggle());

    const second = renderHook(() => useChatPanelLayout(false));
    expect(second.result.current.expanded).toBe(true);
  });

  it('collapse() returns to the docked panel', () => {
    const { result } = renderHook(() => useChatPanelLayout(false));
    act(() => result.current.toggle());
    act(() => result.current.collapse());
    expect(result.current.expanded).toBe(false);
    expect(result.current.panelStyle.width).toBe(400);
  });
});

describe('mobile', () => {
  it('offers no toggle, because the panel is already full-screen', () => {
    const { result } = renderHook(() => useChatPanelLayout(true));
    expect(result.current.canExpand).toBe(false);
    expect(result.current.panelStyle.height).toBe('100dvh');
  });

  it('ignores a stored expanded preference rather than applying desktop geometry', () => {
    // Expand on a laptop, then open the same browser narrow. Honouring the
    // stored flag would inset a phone-width panel by 16px on every side.
    localStorage.setItem('chatbot_expanded', 'true');
    const { result } = renderHook(() => useChatPanelLayout(true));
    expect(result.current.expanded).toBe(false);
    expect(result.current.panelStyle.width).toBe('100vw');
    expect(result.current.contentStyle).toEqual({});
  });
});

describe('when localStorage is unavailable', () => {
  it('starts docked instead of throwing', () => {
    // Private windows and blocked site data both do this.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    try {
      const { result } = renderHook(() => useChatPanelLayout(false));
      expect(result.current.expanded).toBe(false);
      // And toggling still works for the life of the session.
      act(() => result.current.toggle());
      expect(result.current.expanded).toBe(true);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
