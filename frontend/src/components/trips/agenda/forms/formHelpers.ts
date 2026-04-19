import { format } from 'date-fns';

/**
 * Convert a Mantine date-picker value to YYYY-MM-DD.
 *
 * Mantine 8's DatePickerInput emits YYYY-MM-DD strings via onChange (see
 * `@mantine/dates` useUncontrolledDates → toDateString), but the form's
 * initial value may still be a Date we constructed ourselves. Accept both.
 *
 * Do NOT pipe a string through date-fns `format` here — in v4, `format`
 * parses a YYYY-MM-DD string as UTC midnight and re-formats it in local
 * time, shifting the result back one day in every timezone west of UTC.
 */
export function dateToIso(date: Date | string | null): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date.slice(0, 10);
  return format(date, 'yyyy-MM-dd');
}

/** Parse YYYY-MM-DD to a local Date (avoids UTC timezone drift). */
export function isoToDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Add N days to an ISO date. */
export function addDaysIso(iso: string, days: number): string {
  const d = isoToDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return format(d, 'yyyy-MM-dd');
}
