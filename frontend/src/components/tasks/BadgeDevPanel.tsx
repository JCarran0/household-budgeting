/**
 * Dev-only badge testing panel (BRD §4.9). Gated at both the import site
 * (`{import.meta.env.DEV && <BadgeDevPanel ... />}`) and at module load by
 * the guard below, so Vite tree-shakes it out of production bundles.
 *
 * Controls:
 *   - Reveal all `????` (detail-modal-local)
 *   - Trigger any badge's hero modal by clicking a row in the catalog
 *   - Simulate a cascade (Night Owl Bronze → Volume Silver → Lifetime Legendary)
 *   - Reset `lastSeenBadgeEarnedAt` marker + set `__devForceCelebrate` so the
 *     next leaderboard load re-queues every earned badge (ignoring shippedAt)
 *   - Audio preview (three cues)
 *   - Reduced-motion force override — toggles a `data-force-reduced-motion`
 *     attribute on <body>; the MedalBadge CSS has matching overrides
 *   - View-as-partner — swaps the detail modal to the other family member
 *   - Animation replay — re-triggers the hero modal entry animation
 *
 * All controls are intentionally spartan. Keep tests assertive and dev-loop
 * friendly, not polished.
 */

if (!import.meta.env.DEV) {
  throw new Error('BadgeDevPanel imported in production build');
}

import { useState } from 'react';
import {
  Button,
  Collapse,
  Divider,
  Group,
  Stack,
  Switch,
  Text,
  Select,
} from '@mantine/core';
import { BADGE_CATALOG, type BadgeDefinition, type LeaderboardEntry } from '../../../../shared/types';
import {
  playBadgeFanfare,
  playBadgeLegendaryStinger,
  playBadgeSmallTriumphant,
} from '../../utils/completionSound';
import type { QueuedHeroUnlock, UseBadgeHeroQueueResult } from '../../hooks/useBadgeHeroQueue';

const STORAGE_KEY = 'tasks.leaderboard.lastSeenBadgeEarnedAt';
const DEV_FORCE_CELEBRATE_KEY = '__devForceCelebrate';
const FORCE_REDUCED_MOTION_ATTR = 'data-force-reduced-motion';

interface BadgeDevPanelProps {
  queue: UseBadgeHeroQueueResult;
  /** Currently-viewed entry — passed so the panel can offer "view as partner". */
  currentEntry: LeaderboardEntry;
  allEntries: LeaderboardEntry[];
  onSwitchEntry: (userId: string) => void;
  devRevealAll: boolean;
  onToggleRevealAll: () => void;
}

function toQueuedUnlock(def: BadgeDefinition, isFinal: boolean): QueuedHeroUnlock {
  return { def, earnedAt: new Date().toISOString(), isFinal };
}

export function BadgeDevPanel({
  queue,
  currentEntry,
  allEntries,
  onSwitchEntry,
  devRevealAll,
  onToggleRevealAll,
}: BadgeDevPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [forcedReducedMotion, setForcedReducedMotion] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.body.hasAttribute(FORCE_REDUCED_MOTION_ATTR)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const onToggleReducedMotion = () => {
    const next = !forcedReducedMotion;
    setForcedReducedMotion(next);
    if (typeof document === 'undefined') return;
    if (next) document.body.setAttribute(FORCE_REDUCED_MOTION_ATTR, 'true');
    else document.body.removeAttribute(FORCE_REDUCED_MOTION_ATTR);
  };

  const triggerSelected = () => {
    if (!selectedId) return;
    const def = BADGE_CATALOG.find((b) => b.id === selectedId);
    if (!def) return;
    queue.enqueue([toQueuedUnlock(def, true)]);
  };

  const simulateCascade = () => {
    const night = BADGE_CATALOG.find((b) => b.id === 'night_owl_10');
    const volSilver = BADGE_CATALOG.find((b) => b.id === 'volume_10');
    const lifeLegend = BADGE_CATALOG.find((b) => b.id === 'lifetime_1000');
    if (!night || !volSilver || !lifeLegend) return;
    queue.enqueue([
      toQueuedUnlock(night, false),
      toQueuedUnlock(volSilver, false),
      toQueuedUnlock(lifeLegend, true),
    ]);
  };

  const resetMarker = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.setItem(DEV_FORCE_CELEBRATE_KEY, '1');
    } catch {
      // noop
    }
  };

  const partnerOptions = allEntries.map((e) => ({ value: e.userId, label: e.displayName }));

  return (
    <Stack gap="xs" mt="md">
      <Divider label="Dev panel" labelPosition="center" />
      <Button
        variant="subtle"
        size="xs"
        onClick={() => setExpanded((x) => !x)}
        fullWidth
      >
        {expanded ? 'Hide' : 'Show'} dev controls
      </Button>
      <Collapse in={expanded}>
        <Stack gap="xs">
          <Switch
            label="Reveal all ???? in this modal"
            checked={devRevealAll}
            onChange={onToggleRevealAll}
          />
          <Switch
            label="Force reduced motion (overrides OS pref)"
            checked={forcedReducedMotion}
            onChange={onToggleReducedMotion}
          />

          <Divider />

          <Text size="xs" c="dimmed">Trigger a badge hero modal:</Text>
          <Group gap="xs" wrap="wrap">
            <Select
              size="xs"
              placeholder="Pick a badge"
              data={BADGE_CATALOG.map((b) => ({ value: b.id, label: b.label }))}
              value={selectedId}
              onChange={setSelectedId}
              searchable
              style={{ flexGrow: 1 }}
            />
            <Button size="xs" onClick={triggerSelected} disabled={!selectedId}>
              Trigger
            </Button>
          </Group>

          <Button size="xs" variant="light" onClick={simulateCascade}>
            Simulate 3-badge cascade
          </Button>
          <Button size="xs" variant="light" color="orange" onClick={resetMarker}>
            Reset lastSeenBadgeEarnedAt (forces next-load cascade)
          </Button>

          <Divider />

          <Text size="xs" c="dimmed">Audio preview:</Text>
          <Group gap="xs" wrap="wrap">
            <Button size="xs" variant="light" onClick={playBadgeSmallTriumphant}>
              Small
            </Button>
            <Button size="xs" variant="light" onClick={playBadgeFanfare}>
              Big
            </Button>
            <Button size="xs" variant="light" onClick={playBadgeLegendaryStinger}>
              Legendary
            </Button>
          </Group>

          <Divider />

          {partnerOptions.length > 1 && (
            <>
              <Text size="xs" c="dimmed">View-as:</Text>
              <Select
                size="xs"
                data={partnerOptions}
                value={currentEntry.userId}
                onChange={(v) => v && onSwitchEntry(v)}
              />
            </>
          )}
        </Stack>
      </Collapse>
    </Stack>
  );
}
