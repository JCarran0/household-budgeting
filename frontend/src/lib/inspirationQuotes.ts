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

export function pickDailyQuote(seed: string = new Date().toISOString().slice(0, 10)): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return inspirationQuotes[hash % inspirationQuotes.length];
}
