import { useCallback, useEffect, useState, type CSSProperties } from 'react';

/**
 * Chat panel geometry — the docked/expanded toggle and the styles it implies.
 *
 * Extracted rather than added to ChatOverlay.tsx, which is already past the
 * file budget (CLAUDE.md). The overlay gets a hook call, a button and two style
 * spreads; the reasoning about geometry lives here.
 *
 * WHY EXPANDED IS NOT JUST "WIDER":
 * The docked panel is 400px, and bubbles are 85% of their container. Letting
 * the panel fill a 1600px monitor would put ~1360px of text on one line, which
 * is materially HARDER to read than the narrow panel it replaced — the opposite
 * of the point. So expanding does two things: the panel fills the viewport, and
 * the content inside it is constrained to a readable measure and centred. The
 * extra space buys margins and a taller scrollback, not longer lines.
 *
 * MOBILE ALREADY IS FULL-SCREEN. The docked panel goes 100vw/100dvh below 48em,
 * so there is nothing to toggle and `canExpand` is false — the control is
 * hidden rather than shown as a no-op.
 */

const STORAGE_KEY = 'chatbot_expanded';

/**
 * Long-form reading measure. Wide enough for a table or a plan card with
 * several rows, narrow enough that prose does not become a tracking exercise.
 */
const CONTENT_MAX_WIDTH = 860;

/** Breathing room around an expanded panel, so it reads as a panel not a page. */
const VIEWPORT_INSET = 16;

export interface ChatPanelLayout {
  expanded: boolean;
  /** False on mobile, where the docked panel already fills the screen. */
  canExpand: boolean;
  toggle: () => void;
  collapse: () => void;
  /** Applied to the panel itself. */
  panelStyle: CSSProperties;
  /** Applied to the message column and the composer row. */
  contentStyle: CSSProperties;
}

function readStoredExpanded(): boolean {
  // Private windows, blocked site data and previews can all make this throw or
  // come back empty. Docked is the safe default either way.
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useChatPanelLayout(isMobile: boolean): ChatPanelLayout {
  const [expanded, setExpanded] = useState(readStoredExpanded);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(expanded));
    } catch {
      // A preference that cannot be remembered is not a reason to fail.
    }
  }, [expanded]);

  const toggle = useCallback(() => setExpanded(v => !v), []);
  const collapse = useCallback(() => setExpanded(false), []);

  const canExpand = !isMobile;
  // Persisted true + a since-narrowed window would otherwise apply desktop
  // geometry on a phone.
  const isExpanded = expanded && canExpand;

  const panelStyle: CSSProperties = {
    position: 'fixed',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    ...(isMobile
      ? {
          inset: 0,
          width: '100vw',
          height: '100dvh',
          border: 'none',
        }
      : isExpanded
        ? {
            inset: VIEWPORT_INSET,
            width: 'auto',
            height: 'auto',
            border: '1px solid var(--mantine-color-dark-4)',
          }
        : {
            bottom: 80,
            right: 20,
            width: 400,
            height: 600,
            border: '1px solid var(--mantine-color-dark-4)',
          }),
  };

  const contentStyle: CSSProperties = isExpanded
    ? { maxWidth: CONTENT_MAX_WIDTH, width: '100%', marginInline: 'auto' }
    : {};

  return { expanded: isExpanded, canExpand, toggle, collapse, panelStyle, contentStyle };
}
