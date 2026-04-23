import { Collapse, Group, Paper, Text } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconTrophy } from '@tabler/icons-react';
import { LeaderboardPanel } from './LeaderboardPanel';
import type { StoredTask } from '../../../../shared/types';

// LeaderboardPanel's `leaderboard` / `heroQueue` props are typed internally;
// mirror the call-site shape with `unknown` pass-through so this wrapper
// doesn't need to re-declare the entire leaderboard response schema. The
// parent keeps full type information via `LeaderboardPanelProps`.
type LeaderboardData = React.ComponentProps<typeof LeaderboardPanel>['leaderboard'];
type HeroQueue = React.ComponentProps<typeof LeaderboardPanel>['heroQueue'];

export interface TaskLeaderboardProps {
  /** Server leaderboard payload; wrapper renders nothing when null/undefined. */
  leaderboard: LeaderboardData | null | undefined;
  /** All tasks (used by the panel to compute per-badge task links). */
  tasks: StoredTask[];
  /** Celebration queue for the badge hero modal. */
  heroQueue: HeroQueue;
  /** Whether the collapsible is expanded. Parent-controlled so the `tasks/all`
   *  query can stay gated on this state. */
  open: boolean;
  /** Toggle handler — parent persists this to localStorage. */
  onToggleOpen: () => void;
}

export function TaskLeaderboard({ leaderboard, tasks, heroQueue, open, onToggleOpen }: TaskLeaderboardProps) {
  if (!leaderboard) return null;
  return (
    <Paper withBorder p="sm" mb="md" radius="sm">
      <Group
        justify="space-between"
        onClick={onToggleOpen}
        style={{ cursor: 'pointer' }}
      >
        <Group gap="xs">
          <IconTrophy size={18} color="var(--mantine-color-yellow-5)" />
          <Text fw={600} size="sm">Leaderboard</Text>
        </Group>
        {open ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
      </Group>
      <Collapse in={open}>
        <LeaderboardPanel leaderboard={leaderboard} tasks={tasks} heroQueue={heroQueue} />
      </Collapse>
    </Paper>
  );
}
