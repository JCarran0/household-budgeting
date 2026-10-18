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
  return figuresIn(required).filter(f => {
    const bare = escapeRegExp(f.replace(/^\$/, ''));
    const re = new RegExp(`(?<![\\d.,])\\$?${bare}(?!\\d|[.,]\\d)`);
    return !re.test(answer);
  });
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
