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

export function pickDailyQuote(seed: string = getInspirationDayKey()): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return inspirationQuotes[hash % inspirationQuotes.length];
}
