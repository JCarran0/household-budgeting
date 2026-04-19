/**
 * Detect newly-earned badges for the viewing user and fire a celebration
 * once per unlock. Storage marker (`tasks.leaderboard.lastSeenBadgeEarnedAt`)
 * is seeded to `now` on first post-deploy load — REQ-L-016 — so retroactive
 * historical badges appear silently.
 *
 * Tier 1-2 unlocks fire the standard fanfare + confetti + toast. Final-tier
 * unlocks return through the `onFinalTierUnlock` callback so the parent can
 * render the BadgeHeroModal — those celebrations stay open until the user
 * dismisses them.
 */

import { useEffect, useRef, useState } from 'react';
import type { BadgeDefinition, LeaderboardResponse } from '../../../shared/types';
import { BADGE_CATALOG } from '../../../shared/types';
import { isFinalTierBadge } from '../../../shared/utils/leaderboardBadgeSlots';
import { celebrateBadgeUnlock } from '../utils/celebrateBadgeUnlock';

const STORAGE_KEY = 'tasks.leaderboard.lastSeenBadgeEarnedAt';

/** Gap between successive celebration fires when multiple badges unlock at once. */
const CELEBRATION_STAGGER_MS = 900;

const CATALOG_BY_ID = new Map<string, BadgeDefinition>(
  BADGE_CATALOG.map((def) => [def.id, def])
);

function readMarker(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeMarker(value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // best-effort
  }
}

interface NewBadgeCelebrationsState {
  /** Final-tier badge waiting to be acknowledged via the hero modal, if any. */
  pendingHero: BadgeDefinition | null;
  /** Dismiss the pending hero modal (clears the slot). */
  dismissHero: () => void;
}

export function useNewBadgeCelebrations(
  leaderboard: LeaderboardResponse | undefined,
  currentUserId: string | undefined
): NewBadgeCelebrationsState {
  // Remember which earnedAt timestamps we've already celebrated in this
  // session so HMR / React StrictMode double-mounts don't re-fire.
  const celebratedRef = useRef<Set<string>>(new Set());
  const [pendingHero, setPendingHero] = useState<BadgeDefinition | null>(null);

  useEffect(() => {
    if (!leaderboard || !currentUserId) return;
    const entry = leaderboard.entries.find((e) => e.userId === currentUserId);
    if (!entry) return;

    const stored = readMarker();
    if (stored === null) {
      // First post-deploy load — seed to `now` so historical badges appear
      // silently. REQ-L-016.
      writeMarker(new Date().toISOString());
      return;
    }

    const newBadges = entry.earnedBadges
      .filter((b) => b.earnedAt > stored)
      .filter((b) => !celebratedRef.current.has(`${b.id}:${b.earnedAt}`))
      .sort((a, b) => (a.earnedAt < b.earnedAt ? -1 : 1));

    if (newBadges.length === 0) return;

    let latest = stored;
    let staggerIndex = 0;
    let finalTierToShow: BadgeDefinition | null = null;

    for (const b of newBadges) {
      const def = CATALOG_BY_ID.get(b.id);
      if (!def) continue;
      celebratedRef.current.add(`${b.id}:${b.earnedAt}`);
      if (b.earnedAt > latest) latest = b.earnedAt;

      if (isFinalTierBadge(b.id)) {
        // Hero treatment: hold the first final-tier unlock for the modal.
        // Subsequent final-tier unlocks in the same batch (extremely rare)
        // surface via the standard celebration so we don't queue modals.
        if (finalTierToShow === null) {
          finalTierToShow = def;
          continue;
        }
      }

      const delay = staggerIndex * CELEBRATION_STAGGER_MS;
      setTimeout(() => celebrateBadgeUnlock(def), delay);
      staggerIndex += 1;
    }

    if (finalTierToShow !== null) {
      setPendingHero(finalTierToShow);
    }

    writeMarker(latest);
  }, [leaderboard, currentUserId]);

  return {
    pendingHero,
    dismissHero: () => setPendingHero(null),
  };
}
