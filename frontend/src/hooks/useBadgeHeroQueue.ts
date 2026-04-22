/**
 * Hero modal queue state machine (BRD §5 / plan D33).
 *
 * Consumers enqueue an array of unlocks (already de-duped by category and
 * sorted ascending by rarity). The hook:
 *   - Renders them one at a time — `current` is the modal in flight.
 *   - Calls the appropriate audio cue + confetti burst when `current` flips.
 *       isFinal && tier === 5  →  legendary stinger
 *       isFinal                →  big fanfare
 *       else                   →  small triumphant
 *   - On dismiss, waits ~400ms, then flips `current` to the next item; stays
 *     null when empty.
 *
 * The consumer just renders `<BadgeHeroModal opened={!!current} unlock={current} onClose={dismiss} />`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BadgeDefinition } from '../../../shared/types';
import { getBadgeFinish } from '../../../shared/utils/leaderboardBadgeSlots';
import {
  playBadgeFanfare,
  playBadgeLegendaryStinger,
  playBadgeSmallTriumphant,
} from '../utils/completionSound';
import { celebrateConfetti } from '../utils/celebrateBadgeUnlock';

export interface QueuedHeroUnlock {
  def: BadgeDefinition;
  earnedAt: string;
  /** True for the last item in the queue — drives the "big" cue + confetti. */
  isFinal: boolean;
}

const INTER_MODAL_DELAY_MS = 400;

export interface UseBadgeHeroQueueResult {
  current: QueuedHeroUnlock | null;
  enqueue: (items: QueuedHeroUnlock[]) => void;
  dismiss: () => void;
}

export function useBadgeHeroQueue(): UseBadgeHeroQueueResult {
  const [current, setCurrent] = useState<QueuedHeroUnlock | null>(null);
  const queueRef = useRef<QueuedHeroUnlock[]>([]);
  const transitionTimerRef = useRef<number | null>(null);

  const presentNext = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    setCurrent(next);
    if (!next) return;
    // Fire audio + confetti for this modal.
    const finish = getBadgeFinish(next.def.tier);
    if (next.isFinal && next.def.tier === 5) {
      playBadgeLegendaryStinger();
    } else if (next.isFinal) {
      playBadgeFanfare();
    } else {
      playBadgeSmallTriumphant();
    }
    celebrateConfetti(finish, next.isFinal);
  }, []);

  const enqueue = useCallback(
    (items: QueuedHeroUnlock[]) => {
      if (items.length === 0) return;
      queueRef.current.push(...items);
      if (current === null && transitionTimerRef.current === null) {
        presentNext();
      }
    },
    [current, presentNext]
  );

  const dismiss = useCallback(() => {
    setCurrent(null);
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      presentNext();
    }, INTER_MODAL_DELAY_MS);
  }, [presentNext]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  return { current, enqueue, dismiss };
}
