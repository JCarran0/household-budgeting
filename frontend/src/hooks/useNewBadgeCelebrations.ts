/**
 * Detect newly-earned badges for the viewing user and enqueue them for the
 * hero modal queue. Every tier gets a hero modal (D34); there is no longer
 * a toast-for-low-tiers branch.
 *
 * Storage marker (`tasks.leaderboard.lastSeenBadgeEarnedAt`) seeded to `now`
 * on first post-deploy load so retroactive v1 earns stay silent (REQ-L-016).
 * Per-badge `shippedAt` gate (REQ-L-019 / D40) makes future category launches
 * silent too — badges earned before their category shipped advance the
 * marker silently without a celebration.
 *
 * Detection:
 *   1. Diff `earnedAt > marker`
 *   2. Filter out badges with `earnedAt < def.shippedAt` (silent advance)
 *   3. De-dup by category — keep only the highest-tier earn per category
 *   4. Sort ascending by rarity; mark the last as `isFinal`
 *   5. Enqueue into `useBadgeHeroQueue`
 *
 * Returns the queue's `{ current, dismiss }` so Tasks.tsx doesn't care which
 * layer owns the modal state.
 */

import { useEffect, useRef } from 'react';
import type { BadgeDefinition, LeaderboardResponse } from '../../../shared/types';
import { BADGE_CATALOG } from '../../../shared/types';
import {
  getBadgeRarity,
  getBadgeTier,
} from '../../../shared/utils/leaderboardBadgeSlots';
import { useBadgeHeroQueue, type QueuedHeroUnlock, type UseBadgeHeroQueueResult } from './useBadgeHeroQueue';

const STORAGE_KEY = 'tasks.leaderboard.lastSeenBadgeEarnedAt';
/** Dev-panel flag: set to `1` in localStorage, cleared after one read. */
const DEV_FORCE_CELEBRATE_KEY = '__devForceCelebrate';

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

function readAndClearDevForce(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = window.localStorage.getItem(DEV_FORCE_CELEBRATE_KEY);
    if (v) window.localStorage.removeItem(DEV_FORCE_CELEBRATE_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

interface NewBadgeCelebrationsState {
  current: QueuedHeroUnlock | null;
  dismiss: () => void;
  /** Exposed so dev-only UI can enqueue synthetic unlocks. */
  queue: UseBadgeHeroQueueResult;
}

export function useNewBadgeCelebrations(
  leaderboard: LeaderboardResponse | undefined,
  currentUserId: string | undefined
): NewBadgeCelebrationsState {
  const celebratedRef = useRef<Set<string>>(new Set());
  const queue = useBadgeHeroQueue();

  useEffect(() => {
    if (!leaderboard || !currentUserId) return;
    const entry = leaderboard.entries.find((e) => e.userId === currentUserId);
    if (!entry) return;

    const stored = readMarker();
    if (stored === null) {
      // First load: seed marker to now so historical earns stay silent.
      writeMarker(new Date().toISOString());
      return;
    }

    const forceDev = readAndClearDevForce();

    // 1. Diff vs. marker + dedup previously-celebrated.
    const candidates = entry.earnedBadges
      .filter((b) => forceDev || b.earnedAt > stored)
      .filter((b) => !celebratedRef.current.has(`${b.id}:${b.earnedAt}`))
      .sort((a, b) => (a.earnedAt < b.earnedAt ? -1 : 1));

    if (candidates.length === 0) return;

    // 2. shippedAt gate: silently advance marker past pre-ship earns.
    const postShip: typeof candidates = [];
    let latest = stored;
    for (const b of candidates) {
      const def = CATALOG_BY_ID.get(b.id);
      if (!def) continue;
      if (b.earnedAt > latest) latest = b.earnedAt;
      celebratedRef.current.add(`${b.id}:${b.earnedAt}`);
      // shippedAt guard: if this was earned before the badge's category
      // shipped, suppress the celebration (still advance marker).
      if (!forceDev && b.earnedAt < def.shippedAt) continue;
      postShip.push(b);
    }

    if (postShip.length === 0) {
      writeMarker(latest);
      return;
    }

    // 3. De-dup by category — highest tier wins.
    const perCategory = new Map<string, QueuedHeroUnlock>();
    for (const b of postShip) {
      const def = CATALOG_BY_ID.get(b.id)!;
      const existing = perCategory.get(def.category);
      if (!existing || def.tier > existing.def.tier) {
        perCategory.set(def.category, {
          def,
          earnedAt: b.earnedAt,
          isFinal: false,
        });
      }
    }

    // 4. Sort ASC by rarity (biggest lands last); tie-break earnedAt ASC.
    const items = Array.from(perCategory.values()).sort((a, b) => {
      const rarityDiff = getBadgeRarity(getBadgeTier(a.def.id)) - getBadgeRarity(getBadgeTier(b.def.id));
      if (rarityDiff !== 0) return rarityDiff;
      return a.earnedAt < b.earnedAt ? -1 : a.earnedAt > b.earnedAt ? 1 : 0;
    });
    if (items.length > 0) items[items.length - 1].isFinal = true;

    queue.enqueue(items);
    writeMarker(latest);
    // queue is stable across renders (returned from useBadgeHeroQueue).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboard, currentUserId]);

  return {
    current: queue.current,
    dismiss: queue.dismiss,
    queue,
  };
}
