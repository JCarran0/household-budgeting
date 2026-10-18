/**
 * Deterministic checks for the Family Library golden-set runner
 * (backend/scripts/library-golden.ts, FAMILY-LIBRARY-BRD REQ-F041/F044).
 *
 * The runner also asks a judge model whether an answer means the same thing as
 * the approved one. These checks exist because a judge can be lenient about
 * exactly the thing REQ-F041 forbids: a rounded or re-formatted figure.
 */

/** Numbers as printed: $276.33, 16,244, 2.99%, 21000677969, 60. */
const FIGURE = /\$?\d[\d,]*(?:\.\d+)?%?/g;

/** Distinct figures in a text, as printed (trailing sentence commas dropped). */
export function figuresIn(text: string): string[] {
  const found = (text.match(FIGURE) ?? []).map(f => f.replace(/,+$/, ''));
  return Array.from(new Set(found)).filter(f => /\d/.test(f));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Figures from the approved answer that do not appear verbatim in the answer.
 *
 * Convention: figures inside parentheses in an answer key are CONTEXT, not part
 * of the required answer — e.g. "$276.33 (superseding the lease's $289.15)".
 * Requiring the superseded figure would fail exactly the answers that handle an
 * amendment correctly.
 *
 * A figure counts as present only as a whole token with the same digits,
 * separators and decimals: "$276" does not satisfy "$276.33", "16244" does not
 * satisfy "16,244", and "60" is not found inside "600". A leading "$" is
 * optional on the answer side, because "276.33 per month" quotes the figure.
 */
export function missingFigures(expected: string, answer: string): string[] {
  const required = expected.replace(/\([^)]*\)/g, ' ');
  // A date is one value, not three figures: "2026-11-05" states "November 5,
  // 2026" exactly, while "November 2026" does not. Compare dates as dates, then
  // check the remaining figures with the dates removed from both sides.
  const answerDates = new Set(datesIn(answer).map(d => d.iso));
  const missingDates = datesIn(required).filter(d => !answerDates.has(d.iso)).map(d => d.printed);
  const answerRest = stripDates(answer);
  const missing = figuresIn(stripDates(required)).filter(f => {
    const bare = escapeRegExp(f.replace(/^\$/, ''));
    const re = new RegExp(`(?<![\\d.,])\\$?${bare}(?!\\d|[.,]\\d)`);
    return !re.test(answerRest);
  });
  return Array.from(new Set([...missingDates, ...missing]));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAME = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
/** "November 5, 2026", "Nov. 5 2026", "2026-11-05", "11/5/2026". */
const DATE = new RegExp(
  `\\b${MONTH_NAME}\\s+(\\d{1,2}),?\\s+(\\d{4})\\b|\\b(\\d{4})-(\\d{2})-(\\d{2})\\b|\\b(\\d{1,2})/(\\d{1,2})/(\\d{4})\\b`,
  'gi',
);

function iso(y: string, m: number, d: string): string {
  return `${y}-${String(m).padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Calendar dates in a text, whatever the printed form, as ISO strings. */
export function datesIn(text: string): Array<{ printed: string; iso: string }> {
  return Array.from(text.matchAll(DATE), m => {
    if (m[1]) return { printed: m[0], iso: iso(m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, m[2]) };
    if (m[4]) return { printed: m[0], iso: `${m[4]}-${m[5]}-${m[6]}` };
    return { printed: m[0], iso: iso(m[9], Number(m[7]), m[8]) };
  });
}

function stripDates(text: string): string {
  return text.replace(DATE, ' ');
}

/** Page ranges an answer cites: "p. 7", "page 12", "pp. 4-5", "pages 24–30". */
export function citedPages(answer: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of answer.matchAll(/\b(?:pp?|pages?)\.?\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/gi)) {
    const start = Number(m[1]);
    out.push([start, m[2] ? Number(m[2]) : start]);
  }
  return out;
}

export function citesPage(answer: string, page: number): boolean {
  return citedPages(answer).some(([a, b]) => page >= a && page <= b);
}
