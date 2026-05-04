import { useCallback, useEffect, useState } from 'react';

/**
 * Per-user dismissed-suggestion set for the Suggested Rules section on the
 * Auto Cat tab.
 *
 * THIS IS PER-USER UI STATE — keys live in localStorage on this device only,
 * not in the family-shared rule list. Mirrors the rationale in
 * BvA's `useDismissedParentIds`: dismissal is a UI nicety, not a shared
 * preference. The auto-cat *rule* that results from a Create is server-side
 * and shared; only the dismissal of the suggestion card is local.
 */

const STORAGE_KEY = 'autoCatSuggestionsDismissed';

export interface DismissedAutoCatSuggestionsState {
  dismissed: Set<string>;
  dismiss: (normalizedKey: string) => void;
  undismiss: (normalizedKey: string) => void;
}

function readStored(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

function writeStored(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Quota or access failures are non-fatal — the feature is a UI nicety.
  }
}

export function useDismissedAutoCatSuggestions(): DismissedAutoCatSuggestionsState {
  const [dismissed, setDismissed] = useState<Set<string>>(() => readStored());

  useEffect(() => {
    writeStored(dismissed);
  }, [dismissed]);

  const dismiss = useCallback((normalizedKey: string) => {
    setDismissed(prev => {
      if (prev.has(normalizedKey)) return prev;
      const next = new Set(prev);
      next.add(normalizedKey);
      return next;
    });
  }, []);

  const undismiss = useCallback((normalizedKey: string) => {
    setDismissed(prev => {
      if (!prev.has(normalizedKey)) return prev;
      const next = new Set(prev);
      next.delete(normalizedKey);
      return next;
    });
  }, []);

  return { dismissed, dismiss, undismiss };
}
