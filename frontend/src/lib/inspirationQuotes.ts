export const inspirationQuotes: readonly string[] = [
  "Today's flight plan is yours to write.",
  "Pre-flight check: deep breath, you've got this.",
  "File the plan, then fly.",
  "Start with a deep breath. That's the whole pre-flight.",
  "Pre-flight check: coffee, calendar, conviction.",
  "Trust the instruments, even when the view is foggy.",
  "Some days are headwinds. Fly the plane anyway.",
  "Plot the route. Fly the plane. Adjust as the weather asks.",
  "Turbulence passes. Altitude remains.",
  "Even autopilot needs a pilot.",
  "Headwinds build better pilots.",
  "Your co-pilot is watching. You've got this.",
  "Cleared for takeoff — on your schedule.",
  "Every good flight starts with a checklist.",
  "Altitude is earned one climb at a time.",
  "Plan the leg you can see. Fly the rest as it comes.",
  "A steady hand beats a fast one.",
  "Gauges don't lie. Trust them before your gut.",
  "Fuel before speed. Rest before ambition.",
  "Your wingman is rooting for you today.",
  "Chart the crosswind, then cross it.",
  "Every pilot has flown through clouds. You will too.",
  "One leg at a time. That's how routes finish.",
  "The horizon always looks further than it is.",
  "Altitude brings perspective. Climb a little.",
  "File the plan. Forgive the detours.",
  "Storms don't last as long as the radar says.",
  "Every landing you've made, you've earned.",
  "Keep the nose up when the air gets thin.",
  "Tailwinds find pilots who show up.",
  "Level flight is still progress.",
  "Mark the waypoint. Celebrate the milestone.",
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
