import { format } from 'date-fns';

/** Convert a Date (local midnight) to YYYY-MM-DD. */
export function dateToIso(date: Date | null): string | null {
  if (!date) return null;
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
