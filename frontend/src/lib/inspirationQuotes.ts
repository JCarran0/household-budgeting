export const inspirationQuotes: readonly string[] = [
  "Discipline is choosing what you want most over what you want now.",
  "Small steps, taken every day, outpace big leaps once a year.",
  "The work you avoid is usually the work that matters.",
  "Process is what carries you when motivation runs out.",
  "You don't rise to the occasion — you fall to your training.",
  "Your husband loves you!",
  "Done beats perfect. Shipped beats both.",
  "Patience is a competitive advantage.",
  "Compounding doesn't care whether you're watching.",
  "The hard part of any habit is the day you don't feel like it.",
  "Show up tired. Show up unsure. But show up.",
  "Tomorrow is built by the boring choices you make today.",
  "There is no shortcut that doesn't cost something later.",
  "Most overnight successes are quiet decades.",
  "Baloney detection is a skill. Sharpen it by doing the work.",
  "Effort is a form of self-respect.",
  "The river cuts the canyon not by force, but by persistence.",
  "Improvement is a lagging indicator. Trust the lag.",
  "Start before you're ready, and adjust as you go.",
  "Repetition is how a rough draft becomes mastery.",
  "The plan is a guess. The work is the truth.",
  "One percent better every day doubles you in seventy.",
  "Baloney? Not on your watch!",
  "Mistakes are tuition. Pay attention to what they teach.",
  "Boredom is often a checkpoint on the way to depth.",
  "The middle of any project feels longer than it is.",
  "You won't think your way out of doing the work.",
  "Friction is information. Listen before you sand it down.",
  "The system you build matters more than the goal you set.",
  "Standards are kept by the things you refuse to skip.",
  "Get one percent better at what nobody else will measure.",
  "Confidence follows action — rarely the other way around.",
  "The shortest distance between you and the finish is a checklist.",
  "Humility scales. Ego doesn't.",
  "Quality is a habit, not an event.",
  "Work expands to fill the time you give it. Give it less.",
  "Most \"stuck\" is just the next decision waiting to be made.",
  "Reps before results. Always.",
  "Rest is part of the process, not a reward for finishing.",
  "Excellence is the residue of unglamorous repetition.",
  "You're allowed to be a beginner forever.",
  "Done today. Refined tomorrow.",
  "Mastery looks effortless because the effort happened years ago.",
  "Don't break the chain — and don't romanticize it either.",
  "A draft you finished beats ten you imagined.",
  "The gap between knowing and doing is a daily commute.",
  "Curiosity outlasts willpower.",
  "The right thing, done slowly, is still the right thing.",
  "Discomfort is rent for growth.",
  "A wise person one said, \"The secret to getting ahead is avoiding any baloney.\"",
  "Every expert is a beginner who didn't quit.",
  "If it's worth doing, it's worth doing badly at first.",
  "The cost of inaction compounds quietly.",
  "You can't edit a blank page.",
  "Make the thing. Then make the thing better.",
  "Fall in love with the practice, not the result.",
  "The win is in the work the audience never sees.",
  "You're not behind. You're on your own clock.",
  "Optimize the input — the output will follow.",
  "Your future self is built in fifteen-minute increments.",
  "Boring discipline beats brilliant intensity.",
  "Iteration is talent's quiet cousin.",
  "The best time to start was yesterday. The second best is now.",
  "A standard is a promise you keep when no one's watching.",
  "Don't outsource your standards to your mood.",
  "The bar isn't motivation. The bar is showing up anyway.",
  "Slow is smooth. Smooth is fast.",
  "Progress is rarely loud.",
  "Ambition without process is wishful thinking with a calendar.",
  "The best apology for a bad day is a better next one.",
  "Constraints are creativity's coach.",
  "You don't have to be fast. You have to be unstoppable.",
  "The road to mastery is paved with corrections.",
  "Excellence is what's left when you remove excuses.",
  "Be ruthless with the trivial; gentle with yourself.",
  "The work doesn't care how you feel about the work.",
  "Skill is a side effect of consistency.",
  "You won't always feel ready. Begin anyway.",
  "Master the unglamorous. The glamour follows.",
  "The hardest part is starting. Start small enough that starting is easy.",
  "There's a version of this you'll be proud of. Go find it.",
  "Resilience is built one small recovery at a time.",
  "Don't trade long-term peace for short-term comfort.",
  "A finished thing teaches more than a perfect plan.",
  "Every revision is a vote for the work you want to make.",
  "The best work arrives after the first idea is used up.",
  "Don't fear repetition. Fear the day you stop refining.",
  "Sprint only when steady has earned it.",
  "You will never regret the rep you almost skipped.",
  "Habits are deposits in a future you'll be glad to meet.",
  "A system's worth is what it does on the day you're tired.",
  "Treat the small thing well — it's training for the big one.",
  "Be the person your project deserves.",
  "A clean process forgives a messy day.",
  "Slow learners go further than fast quitters.",
  "Excellence rarely arrives. It accumulates.",
  "There's no traffic on the extra mile.",
  "Patience plus persistence is most of the trick.",
  "Ship something today. Future you will need the practice.",
  "The best craftsmen never run out of small things to fix.",
  "Be hard on the work, easy on the day.",
  "The streak isn't the point — the person the streak builds is.",
  "Keep going. The next chapter is written in the steps you're taking now.",
  "The work you do when no one's looking is the work that defines you.",
];

// Day key anchored at 5 AM America/New_York (DST-aware).
// Before 5 AM ET, returns yesterday's ET date; otherwise today's ET date.
export function getInspirationDayKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour'));

  const anchor = new Date(Date.UTC(year, month - 1, day));
  if (hour < 5) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }
  return anchor.toISOString().slice(0, 10);
}

// Shuffle-bag state: picks each day's quote from a pool of unshown indices.
// When the pool empties, it refills with every index except the one just used,
// so a new cycle never starts with a back-to-back repeat.
const BAG_STORAGE_KEY = 'inspiration:bag';

interface BagState {
  day: string;
  quoteIdx: number;
  remaining: number[];
}

function loadBag(): BagState | null {
  try {
    const raw = localStorage.getItem(BAG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'day' in parsed &&
      'quoteIdx' in parsed &&
      'remaining' in parsed &&
      typeof (parsed as BagState).day === 'string' &&
      typeof (parsed as BagState).quoteIdx === 'number' &&
      Array.isArray((parsed as BagState).remaining)
    ) {
      const bag = parsed as BagState;
      const remaining = bag.remaining.filter(
        (i) => Number.isInteger(i) && i >= 0 && i < inspirationQuotes.length,
      );
      const quoteIdx =
        bag.quoteIdx >= 0 && bag.quoteIdx < inspirationQuotes.length ? bag.quoteIdx : 0;
      return { day: bag.day, quoteIdx, remaining };
    }
    return null;
  } catch {
    return null;
  }
}

function saveBag(state: BagState): void {
  try {
    localStorage.setItem(BAG_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable — skip persistence
  }
}

function advanceBag(today: string, prev: BagState | null): BagState {
  const prevIdx = prev?.quoteIdx ?? -1;
  let remaining = prev?.remaining ?? [];
  if (remaining.length === 0) {
    remaining = inspirationQuotes
      .map((_, i) => i)
      .filter((i) => i !== prevIdx);
  }
  const pickPos = Math.floor(Math.random() * remaining.length);
  const [nextIdx] = remaining.splice(pickPos, 1);
  return { day: today, quoteIdx: nextIdx, remaining };
}

export function pickDailyQuote(): string {
  const today = getInspirationDayKey();
  const bag = loadBag();
  if (bag && bag.day === today) {
    return inspirationQuotes[bag.quoteIdx] ?? inspirationQuotes[0];
  }
  const next = advanceBag(today, bag);
  saveBag(next);
  return inspirationQuotes[next.quoteIdx];
}
