import type { StoredTask, LeaderboardResponse } from '../../../shared/types';

export interface TauntContext {
  viewerId: string;
  spouseId: string | null;
  tasks: StoredTask[];
  leaderboard: LeaderboardResponse | null;
  now: Date;
}

type TauntText = string | ((ctx: TauntContext) => string);

interface Taunt {
  text: TauntText;
  eligible: (ctx: TauntContext) => boolean;
}

const OLD_TASK_DAYS = 30;
const AHEAD_MIN = 2;

const always = (): boolean => true;

function oldestViewerOpenTask(ctx: TauntContext): StoredTask | null {
  const cutoff = ctx.now.getTime() - OLD_TASK_DAYS * 24 * 60 * 60 * 1000;
  let oldest: StoredTask | null = null;
  for (const t of ctx.tasks) {
    if (t.assigneeId !== ctx.viewerId) continue;
    if (t.status !== 'todo' && t.status !== 'started') continue;
    if (new Date(t.createdAt).getTime() >= cutoff) continue;
    if (oldest === null || new Date(t.createdAt) < new Date(oldest.createdAt)) {
      oldest = t;
    }
  }
  return oldest;
}

function viewerHasSnoozed(ctx: TauntContext): boolean {
  return ctx.tasks.some(
    (t) =>
      t.assigneeId === ctx.viewerId &&
      t.snoozedUntil !== null &&
      new Date(t.snoozedUntil) > ctx.now
  );
}

function leaderboardEntry(ctx: TauntContext, userId: string | null) {
  if (!ctx.leaderboard || !userId) return null;
  return ctx.leaderboard.entries.find((e) => e.userId === userId) ?? null;
}

function spouseRankedAboveViewer(ctx: TauntContext): boolean {
  if (!ctx.leaderboard || !ctx.spouseId) return false;
  const spouseIdx = ctx.leaderboard.entries.findIndex((e) => e.userId === ctx.spouseId);
  const viewerIdx = ctx.leaderboard.entries.findIndex((e) => e.userId === ctx.viewerId);
  if (spouseIdx === -1 || viewerIdx === -1) return false;
  return spouseIdx < viewerIdx;
}

function spouseIsFirst(ctx: TauntContext): boolean {
  if (!ctx.leaderboard || !ctx.spouseId) return false;
  return ctx.leaderboard.entries[0]?.userId === ctx.spouseId;
}

function spouseTodayDiff(ctx: TauntContext): number {
  const spouse = leaderboardEntry(ctx, ctx.spouseId);
  const viewer = leaderboardEntry(ctx, ctx.viewerId);
  if (!spouse || !viewer) return 0;
  return spouse.completedToday - viewer.completedToday;
}

const TAUNTS: Taunt[] = [
  { text: 'You think you can defeat me?', eligible: always },
  { text: "Is that all you've got?", eligible: always },
  { text: 'Your Done list is puny.', eligible: always },
  { text: 'My Done list laughs at yours.', eligible: always },
  { text: 'Your streak? Adorable.', eligible: always },
  { text: 'Snoozing again? How brave.', eligible: always },
  { text: 'Close the app. Admit defeat.', eligible: always },

  {
    text: 'That task has been open for HOW long?',
    eligible: (ctx) => oldestViewerOpenTask(ctx) !== null,
  },
  {
    text: 'I see your snoozed tasks. All of them.',
    eligible: viewerHasSnoozed,
  },
  {
    text: (ctx) => {
      const t = oldestViewerOpenTask(ctx);
      const month = t
        ? new Date(t.createdAt).toLocaleString('en-US', { month: 'long' })
        : 'a while back';
      return `That task from ${month}? Still waiting.`;
    },
    eligible: (ctx) => oldestViewerOpenTask(ctx) !== null,
  },

  {
    text: "I'll see you at the top of the leaderboard. Try to keep up.",
    eligible: spouseRankedAboveViewer,
  },
  {
    text: 'This leaderboard is mine now.',
    eligible: spouseIsFirst,
  },
  {
    text: (ctx) => `I'm ${spouseTodayDiff(ctx)} ahead of you today. Yawn.`,
    eligible: (ctx) => spouseTodayDiff(ctx) >= AHEAD_MIN,
  },
  {
    text: 'Nice lead. Enjoy it while it lasts.',
    eligible: (ctx) => spouseTodayDiff(ctx) < 0,
  },
];

const FALLBACK = 'You think you can defeat me?';

export function pickVillainTaunt(ctx: TauntContext): string {
  const eligible = TAUNTS.filter((t) => t.eligible(ctx));
  if (eligible.length === 0) return FALLBACK;
  const pick = eligible[Math.floor(Math.random() * eligible.length)];
  return typeof pick.text === 'string' ? pick.text : pick.text(ctx);
}
