/**
 * Leaderboard panel — counts (Today / Week / Month), streak columns
 * (Current / Best), and a per-member badge slot area.
 *
 * Counts come from the server response. The hover-card item lists are
 * derived client-side from the active task list using attribution rules
 * that mirror the backend's `getLeaderboard`.
 */

import { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Group,
  HoverCard,
  ScrollArea,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { format, parseISO } from 'date-fns';
import type {
  LeaderboardEntry,
  LeaderboardResponse,
  StoredTask,
} from '../../../../shared/types';
import { userColor } from '../../utils/userColor';
import { BadgeSlotArea } from './BadgeSlotArea';
import { BadgeDetailModal } from './BadgeDetailModal';
import type { UseBadgeHeroQueueResult } from '../../hooks/useBadgeHeroQueue';

const FLAME_MIN_STREAK = 5;

interface LeaderboardPanelProps {
  leaderboard: LeaderboardResponse;
  tasks: StoredTask[];
  /** Hero modal queue — exposed for the dev-only panel in the detail modal. */
  heroQueue?: UseBadgeHeroQueueResult;
}

/**
 * Find the transition that corresponds to the task's most recent completedAt.
 * Mirrors the backend helper so hover-preview attribution matches the count.
 */
function findCompletionTransition(
  task: StoredTask
): { userId: string; timestamp: string } | null {
  if (!task.completedAt) return null;
  for (let i = task.transitions.length - 1; i >= 0; i--) {
    const t = task.transitions[i];
    if (t.toStatus === 'done' && t.timestamp === task.completedAt) return t;
  }
  for (let i = task.transitions.length - 1; i >= 0; i--) {
    if (task.transitions[i].toStatus === 'done') return task.transitions[i];
  }
  return null;
}

type BucketKey = 'today' | 'week' | 'month';

interface LeaderboardBucketItem {
  key: string;
  label: string;
  completedAt: string;
}

/** Max value across entries; 0 when empty (so highlight comparisons are safe). */
function maxOf(entries: LeaderboardEntry[], pick: (e: LeaderboardEntry) => number): number {
  let max = 0;
  for (const e of entries) {
    const v = pick(e);
    if (v > max) max = v;
  }
  return max;
}

export function LeaderboardPanel({ leaderboard, tasks, heroQueue }: LeaderboardPanelProps) {
  const { entries, boundaries: rawBoundaries } = leaderboard;
  const [modalEntry, setModalEntry] = useState<LeaderboardEntry | null>(null);

  const boundaries = useMemo(
    () => ({
      today: new Date(rawBoundaries.todayStart).getTime(),
      week: new Date(rawBoundaries.weekStart).getTime(),
      month: new Date(rawBoundaries.monthStart).getTime(),
    }),
    [rawBoundaries.todayStart, rawBoundaries.weekStart, rawBoundaries.monthStart]
  );

  // `now` stable across this render — used by selectBadgeSlots recency boost.
  // Re-derived on every leaderboard response; the timestamp drives the score.
  const now = useMemo(
    () => new Date(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawBoundaries.todayStart]
  );

  const itemsByUserBucket = useMemo(() => {
    const buckets = new Map<string, Record<BucketKey, LeaderboardBucketItem[]>>();
    for (const entry of entries) {
      buckets.set(entry.userId, { today: [], week: [], month: [] });
    }

    const push = (userId: string, completedMs: number, item: LeaderboardBucketItem) => {
      const bucket = buckets.get(userId);
      if (!bucket) return;
      if (completedMs >= boundaries.month) bucket.month.push(item);
      if (completedMs >= boundaries.week) bucket.week.push(item);
      if (completedMs >= boundaries.today) bucket.today.push(item);
    };

    for (const task of tasks) {
      if (task.scope !== 'family') continue;

      if (task.completedAt) {
        const transition = findCompletionTransition(task);
        if (transition) {
          const creditedUserId = task.assigneeId ?? transition.userId;
          push(creditedUserId, new Date(task.completedAt).getTime(), {
            key: task.id,
            label: task.title,
            completedAt: task.completedAt,
          });
        }
      }

      for (const st of task.subTasks ?? []) {
        if (!st.completed || !st.completedAt) continue;
        const creditedUserId = task.assigneeId ?? st.completedBy;
        if (!creditedUserId) continue;
        push(creditedUserId, new Date(st.completedAt).getTime(), {
          key: `${task.id}:${st.id}`,
          label: `${task.title} — ${st.title}`,
          completedAt: st.completedAt,
        });
      }
    }

    const byCompletedDesc = (a: LeaderboardBucketItem, b: LeaderboardBucketItem) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
    for (const bucket of buckets.values()) {
      bucket.today.sort(byCompletedDesc);
      bucket.week.sort(byCompletedDesc);
      bucket.month.sort(byCompletedDesc);
    }
    return buckets;
  }, [entries, tasks, boundaries]);

  if (entries.length === 0) {
    return (
      <Text size="sm" c="dimmed" mt="xs">
        No data yet
      </Text>
    );
  }

  const maxToday = maxOf(entries, (e) => e.completedToday);
  const maxWeek = maxOf(entries, (e) => e.completedThisWeek);
  const maxMonth = maxOf(entries, (e) => e.completedThisMonth);
  const maxCurrentStreak = maxOf(entries, (e) => e.currentStreak);
  const maxBestStreak = maxOf(entries, (e) => e.bestStreak);

  return (
    <>
      <ScrollArea type="auto" mt="xs" offsetScrollbars>
      <Table horizontalSpacing="sm" verticalSpacing={4} miw={560}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Member</Table.Th>
            <Table.Th ta="center">Today</Table.Th>
            <Table.Th ta="center">This Week</Table.Th>
            <Table.Th ta="center">This Month</Table.Th>
            <Table.Th ta="center">
              <Tooltip
                label="Consecutive days you've completed at least one family task. Counts today; if today is empty, it still holds yesterday's number until midnight."
                multiline
                w={260}
                withArrow
                openDelay={200}
              >
                <Text span size="sm" fw={500} style={{ cursor: 'help' }}>
                  Streak
                </Text>
              </Tooltip>
            </Table.Th>
            <Table.Th ta="center">
              <Tooltip
                label="Longest streak you've ever had. Only goes up."
                multiline
                w={220}
                withArrow
                openDelay={200}
              >
                <Text span size="sm" fw={500} style={{ cursor: 'help' }}>
                  Best
                </Text>
              </Tooltip>
            </Table.Th>
            <Table.Th ta="center">Badges</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {entries.map((entry) => {
            const bucket = itemsByUserBucket.get(entry.userId) ?? {
              today: [],
              week: [],
              month: [],
            };
            return (
              <Table.Tr
                key={entry.userId}
                onClick={() => setModalEntry(entry)}
                style={{ cursor: 'pointer' }}
              >
                <Table.Td>
                  <Group gap="xs">
                    <Avatar size="xs" radius="xl" color={userColor(entry)}>
                      {entry.displayName.charAt(0).toUpperCase()}
                    </Avatar>
                    <Text size="sm">{entry.displayName}</Text>
                  </Group>
                </Table.Td>
                <Table.Td ta="center">
                  <LeaderboardCountCell
                    count={entry.completedToday}
                    highlight={entry.completedToday === maxToday && maxToday > 0}
                    items={bucket.today}
                  />
                </Table.Td>
                <Table.Td ta="center">
                  <LeaderboardCountCell
                    count={entry.completedThisWeek}
                    highlight={entry.completedThisWeek === maxWeek && maxWeek > 0}
                    items={bucket.week}
                  />
                </Table.Td>
                <Table.Td ta="center">
                  <LeaderboardCountCell
                    count={entry.completedThisMonth}
                    highlight={entry.completedThisMonth === maxMonth && maxMonth > 0}
                    items={bucket.month}
                  />
                </Table.Td>
                <Table.Td ta="center">
                  <StreakCell
                    value={entry.currentStreak}
                    showFlame
                    highlight={
                      entry.currentStreak === maxCurrentStreak && maxCurrentStreak > 0
                    }
                  />
                </Table.Td>
                <Table.Td ta="center">
                  <StreakCell
                    value={entry.bestStreak}
                    highlight={entry.bestStreak === maxBestStreak && maxBestStreak > 0}
                  />
                </Table.Td>
                <Table.Td ta="center">
                  <BadgeSlotArea earnedBadges={entry.earnedBadges} now={now} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      </ScrollArea>
      {modalEntry && (
        <BadgeDetailModal
          opened={!!modalEntry}
          onClose={() => setModalEntry(null)}
          entry={modalEntry}
          allEntries={entries}
          onSwitchEntry={(userId) => {
            const next = entries.find((e) => e.userId === userId);
            if (next) setModalEntry(next);
          }}
          heroQueue={heroQueue}
        />
      )}
    </>
  );
}

interface StreakCellProps {
  value: number;
  showFlame?: boolean;
  highlight?: boolean;
}

function StreakCell({ value, showFlame, highlight }: StreakCellProps) {
  if (value === 0) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }
  const withFlame = showFlame && value >= FLAME_MIN_STREAK;
  return (
    <Text size="sm" fw={highlight ? 700 : 400} c={highlight ? 'yellow' : undefined}>
      {withFlame ? `🔥 ${value}` : value}
    </Text>
  );
}

interface LeaderboardCountCellProps {
  count: number;
  highlight: boolean;
  items: LeaderboardBucketItem[];
}

function LeaderboardCountCell({ count, highlight, items }: LeaderboardCountCellProps) {
  const label = (
    <Text size="sm" fw={highlight ? 700 : 400} c={highlight ? 'yellow' : undefined}>
      {count}
    </Text>
  );

  if (count === 0) return label;

  return (
    <HoverCard withArrow shadow="md" position="top" openDelay={100} closeDelay={80}>
      <HoverCard.Target>
        <Box
          component="span"
          tabIndex={0}
          style={{ cursor: 'help', display: 'inline-block' }}
        >
          {label}
        </Box>
      </HoverCard.Target>
      <HoverCard.Dropdown p="xs">
        <ScrollArea.Autosize mah={240} type="hover">
          <Stack gap={4} miw={180} maw={340}>
            {items.map((item) => (
              <Group key={item.key} gap="sm" wrap="nowrap" justify="space-between">
                <Text size="xs" style={{ flex: 1 }} lineClamp={2}>
                  {item.label}
                </Text>
                <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                  {format(parseISO(item.completedAt), 'MMM d, h:mm a')}
                </Text>
              </Group>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
