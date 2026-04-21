import { useCallback, useEffect, useState } from 'react';
import {
  DISMISSED_STORAGE_KEY,
  parseDismissedIds,
  serializeDismissedIds,
} from '../../../../../shared/utils/bvaIISerialization';

/**
 * Per-user dismissed-parent set for the Budget vs. Actuals II tab.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  THIS IS NOT Category.isHidden.                                         │
 * │                                                                         │
 * │  Dismissed is a per-user, page-local UI preference stored in            │
 * │  localStorage. Category.isHidden is a family-wide flag stored on the    │
 * │  Category record that excludes the category from budgets and reports    │
 * │  everywhere in the app (BvA, YearlyBudgetGrid, Reports, Cash Flow,     │
 * │  Dashboard, chatbot tools).                                             │
 * │                                                                         │
 * │  DO NOT EVER:                                                           │
 * │    - set Category.isHidden from this hook                               │
 * │    - read Category.isHidden to populate the dismissed set               │
 * │    - treat a "Show dismissed" toggle as revealing isHidden categories   │
 * │    - surface dismissed rows in any surface outside BvA II                │
 * │                                                                         │
 * │  Enforcement: BUDGET-VS-ACTUALS-II-BRD REQ-023..029 + success criterion │
 * │  "Dismissal is never confused with Category.isHidden in code review."   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Storage: localStorage key `bva2.dismissedParentCategoryIds` as JSON array.
 * Pure parse/serialize helpers live in shared/utils/bvaIISerialization.ts.
 *
 * `showDismissed` is ephemeral session state (BRD REQ-048) — neither URL-
 * persisted nor stored in localStorage. Resets to false on page reload.
 */

export interface DismissedParentsState {
  dismissedIds: Set<string>;
  dismiss: (parentId: string) => void;
  restore: (parentId: string) => void;
  showDismissed: boolean;
  setShowDismissed: (next: boolean) => void;
}

function readStoredIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return parseDismissedIds(window.localStorage.getItem(DISMISSED_STORAGE_KEY));
  } catch {
    return new Set();
  }
}

function writeStoredIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, serializeDismissedIds(ids));
  } catch {
    // Quota or access failures are non-fatal — the feature is a UI nicety.
  }
}

export function useDismissedParentIds(): DismissedParentsState {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => readStoredIds());
  const [showDismissed, setShowDismissed] = useState<boolean>(false);

  useEffect(() => {
    writeStoredIds(dismissedIds);
  }, [dismissedIds]);

  const dismiss = useCallback((parentId: string) => {
    setDismissedIds(prev => {
      if (prev.has(parentId)) return prev;
      const next = new Set(prev);
      next.add(parentId);
      return next;
    });
  }, []);

  const restore = useCallback((parentId: string) => {
    setDismissedIds(prev => {
      if (!prev.has(parentId)) return prev;
      const next = new Set(prev);
      next.delete(parentId);
      return next;
    });
  }, []);

  return { dismissedIds, dismiss, restore, showDismissed, setShowDismissed };
}
