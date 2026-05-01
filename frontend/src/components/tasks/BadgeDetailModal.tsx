/**
 * Per-member badge detail modal — full-screen 48-badge grid across 15
 * categories (BRD §5.2 / plan D32).
 *
 * Obfuscation (D31 / REQ-L-018):
 *   - Categories the user has NEVER earned a badge in are collapsed: the
 *     heading itself is `????` and one placeholder row stands in for the
 *     entire tier grid. Tier count is hidden because it varies across
 *     categories (3, 4, or 5). No tooltips on these rows.
 *   - Categories with ≥1 earned badge show the real heading and the full
 *     tier grid. Earned tiles get tooltips with description + earned date;
 *     unearned tiles within earned categories show `????` placeholders
 *     (no tooltip) at the same size to communicate tier progression.
 *   - Footer: `N of M hidden categories` — quantifies the unknown.
 *
 * Dev-only panel lives in the footer (import.meta.env.DEV; tree-shaken from
 * prod).
 */

import { useState } from 'react';
import { Group, Stack, Avatar, Text, SimpleGrid } from '@mantine/core';
import { ResponsiveModal } from '../ResponsiveModal';
import { format, parseISO } from 'date-fns';
import type { BadgeCategory, BadgeDefinition, LeaderboardEntry } from '../../../../shared/types';
import { BADGE_CATALOG } from '../../../../shared/types';
import { getAutoLabel } from '../../../../shared/utils/leaderboardBadgeSlots';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './badgeCatalog';
import { MedalBadge } from './MedalBadge';
import { userColor } from '../../utils/userColor';
import type { UseBadgeHeroQueueResult } from '../../hooks/useBadgeHeroQueue';
import { lazy, Suspense } from 'react';

// Dynamic import keeps the dev panel out of the production bundle. Vite
// evaluates `import.meta.env.DEV` at build time; the dynamic import below
// only fires when the guard is true.
const BadgeDevPanelLazy = import.meta.env.DEV
  ? lazy(() => import('./BadgeDevPanel').then((m) => ({ default: m.BadgeDevPanel })))
  : null;

interface DevPanelSlotProps {
  queue: UseBadgeHeroQueueResult;
  currentEntry: LeaderboardEntry;
  allEntries: LeaderboardEntry[];
  onSwitchEntry: (userId: string) => void;
  devRevealAll: boolean;
  onToggleRevealAll: () => void;
}

function DevPanelSlot(props: DevPanelSlotProps) {
  if (!BadgeDevPanelLazy) return null;
  return (
    <Suspense fallback={null}>
      <BadgeDevPanelLazy {...props} />
    </Suspense>
  );
}

const TILE_MEDAL_SIZE = 56;

/**
 * Responsive grid columns for badge tiles. At 4 cols on a 412px viewport the
 * tiles stay comfortably square; on sm+ we fan out to 5-7 to use horizontal
 * space without tiles becoming comically wide.
 */
const TILE_GRID_COLS = { base: 4, xs: 5, sm: 6, md: 7 } as const;

interface BadgeDetailModalProps {
  opened: boolean;
  onClose: () => void;
  entry: LeaderboardEntry;
  allEntries?: LeaderboardEntry[];
  onSwitchEntry?: (userId: string) => void;
  heroQueue?: UseBadgeHeroQueueResult;
  /** Click handler for an earned tile — opens hero view-mode in the parent. */
  onBadgeClick?: (def: BadgeDefinition, earnedAt: string) => void;
}

function badgesByCategory(category: BadgeCategory): BadgeDefinition[] {
  return BADGE_CATALOG.filter((b) => b.category === category).sort(
    (a, b) => a.order - b.order
  );
}

function UntouchedCategoryRow() {
  // Single collapsed placeholder — heading is `????`, tier count hidden.
  return (
    <Stack gap={6}>
      <Text fw={600} size="xs" tt="uppercase" c="dimmed">
        ????
      </Text>
      <SimpleGrid cols={TILE_GRID_COLS} spacing="sm" verticalSpacing="sm">
        <Stack gap={2} align="center">
          <MedalBadge
            tier={1}
            emblem="ghost"
            size={TILE_MEDAL_SIZE}
            halo="none"
            ghost
          />
          <Text size="xs" ta="center" c="dimmed">
            ????
          </Text>
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}

interface EarnedCategorySectionProps {
  category: BadgeCategory;
  defs: BadgeDefinition[];
  earnedMap: Map<string, string>;
  /**
   * Dev-panel reveal: render unearned tiles as real badges (not ghosts) so
   * the whole catalog can be previewed. Tooltip omits the "Earned <date>"
   * clause since there's no real earn event.
   */
  devRevealAll?: boolean;
  onBadgeClick?: (def: BadgeDefinition, earnedAt: string) => void;
}

function EarnedCategorySection({ category, defs, earnedMap, devRevealAll, onBadgeClick }: EarnedCategorySectionProps) {
  return (
    <Stack gap={6}>
      <Text fw={600} size="xs" tt="uppercase" c="dimmed">
        {CATEGORY_LABELS[category]}
      </Text>
      <SimpleGrid cols={TILE_GRID_COLS} spacing="sm" verticalSpacing="sm">
        {defs.map((def) => {
          const earnedAt = earnedMap.get(def.id);
          if (earnedAt !== undefined) {
            const when = format(parseISO(earnedAt), 'MMM d, yyyy');
            return (
              <Stack key={def.id} gap={2} align="center">
                <MedalBadge
                  tier={def.tier}
                  emblem={def.category}
                  size={TILE_MEDAL_SIZE}
                  halo={def.tier >= 3 ? 'auto' : 'none'}
                  tooltip={`${def.description} — Earned ${when}`}
                  onClick={onBadgeClick ? () => onBadgeClick(def, earnedAt) : undefined}
                />
                <Text size="xs" ta="center" lineClamp={1}>
                  {getAutoLabel(def)}
                </Text>
              </Stack>
            );
          }
          if (devRevealAll) {
            return (
              <Stack key={def.id} gap={2} align="center">
                <MedalBadge
                  tier={def.tier}
                  emblem={def.category}
                  size={TILE_MEDAL_SIZE}
                  halo={def.tier >= 3 ? 'auto' : 'none'}
                  tooltip={def.description}
                />
                <Text size="xs" ta="center" lineClamp={1}>
                  {getAutoLabel(def)}
                </Text>
              </Stack>
            );
          }
          return (
            <Stack key={def.id} gap={2} align="center">
              <MedalBadge tier={def.tier} emblem="ghost" size={TILE_MEDAL_SIZE} halo="none" ghost />
              <Text size="xs" ta="center" c="dimmed">
                ????
              </Text>
            </Stack>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}

export function BadgeDetailModal({
  opened,
  onClose,
  entry,
  allEntries,
  onSwitchEntry,
  heroQueue,
  onBadgeClick,
}: BadgeDetailModalProps) {
  const [devRevealAll, setDevRevealAll] = useState(false);
  const earnedMap = new Map(entry.earnedBadges.map((b) => [b.id, b.earnedAt]));
  const earnedCategoryIds = new Set(
    entry.earnedBadges
      .map((b) => BADGE_CATALOG.find((def) => def.id === b.id)?.category)
      .filter((c): c is BadgeCategory => Boolean(c))
  );
  const hiddenCount = devRevealAll
    ? 0
    : CATEGORY_ORDER.filter((c) => !earnedCategoryIds.has(c)).length;

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      fullScreen
      title={
        <Group gap="sm">
          <Avatar size="md" radius="xl" color={userColor(entry)}>
            {entry.displayName.charAt(0).toUpperCase()}
          </Avatar>
          <Stack gap={0}>
            <Text fw={600}>{entry.displayName}</Text>
            <Text size="xs" c="dimmed">
              {entry.earnedBadges.length} of {BADGE_CATALOG.length} earned
            </Text>
          </Stack>
        </Group>
      }
    >
      <Stack gap="md">
        {CATEGORY_ORDER.map((cat) => {
          const defs = badgesByCategory(cat);
          const hasEarned = earnedCategoryIds.has(cat);
          if (!hasEarned && !devRevealAll) {
            return <UntouchedCategoryRow key={cat} />;
          }
          return (
            <EarnedCategorySection
              key={cat}
              category={cat}
              defs={defs}
              earnedMap={earnedMap}
              devRevealAll={devRevealAll}
              onBadgeClick={onBadgeClick}
            />
          );
        })}
        <Stack gap={2}>
          <Text c="dimmed" size="xs" ta="center">
            {hiddenCount} of {CATEGORY_ORDER.length} hidden categories
          </Text>
          {import.meta.env.DEV && heroQueue && allEntries && onSwitchEntry && (
            <DevPanelSlot
              queue={heroQueue}
              currentEntry={entry}
              allEntries={allEntries}
              onSwitchEntry={onSwitchEntry}
              devRevealAll={devRevealAll}
              onToggleRevealAll={() => setDevRevealAll((x) => !x)}
            />
          )}
        </Stack>
      </Stack>
    </ResponsiveModal>
  );
}
