/**
 * Trip tag generation and utility functions.
 * Used by both frontend (tag preview) and backend (tag creation).
 */

import type { Stop, StayStop, TransitStop, Trip } from '../types';

/**
 * Generate a trip tag from a trip name and start date.
 * Format: trip:<slug>:<year>
 *
 * - Lowercases the name
 * - Strips colons (delimiter conflict)
 * - Replaces spaces and special chars with hyphens
 * - Strips consecutive/leading/trailing hyphens
 * - Extracts year from startDate
 */
export function generateTripTag(name: string, startDate: string): string {
  const year = new Date(startDate).getFullYear();
  const slug = slugifyTripName(name);
  return `trip:${slug}:${year}`;
}

/**
 * Slugify a trip name for use in a tag.
 */
export function slugifyTripName(name: string): string {
  return name
    .toLowerCase()
    .replace(/:/g, '')           // Strip colons (delimiter conflict — D7)
    .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-')         // Collapse consecutive hyphens
    .replace(/^-|-$/g, '');      // Strip leading/trailing hyphens
}

/**
 * Check if a tag string is a trip tag.
 */
export function isTripTag(tag: string): boolean {
  return /^trip:[a-z0-9-]+:\d{4}$/.test(tag);
}

/**
 * Derive trip status from dates relative to today.
 */
export function getTripStatus(startDate: string, endDate: string): 'upcoming' | 'active' | 'completed' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (start > today) return 'upcoming';
  if (end < today) return 'completed';
  return 'active';
}

// ---------------------------------------------------------------------------
// Stop / Itinerary helpers (D2: Stay dates are night-based)
// ---------------------------------------------------------------------------

/**
 * Parse an ISO date string (YYYY-MM-DD) into a Date at local midnight.
 * Date constructor interprets YYYY-MM-DD as UTC, which breaks comparisons
 * across timezones. Split + construct manually to keep everything local.
 */
function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, days: number): string {
  const d = parseIsoDateLocal(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/**
 * True if the given date (YYYY-MM-DD) falls inclusively within [stay.date, stay.endDate].
 * Stay dates are night-based: endDate is the LAST night slept there, not check-out morning.
 */
export function stayCoversDate(stay: StayStop, date: string): boolean {
  return date >= stay.date && date <= stay.endDate;
}

/**
 * True if two stays occupy any of the same nights.
 * Adjacent stays (A ends on night X, B starts on night X+1) do NOT overlap.
 */
export function stayOverlapsStay(a: StayStop, b: StayStop): boolean {
  return a.date <= b.endDate && b.date <= a.endDate;
}

/**
 * Validate that adding or updating a stay does not collide with existing stays.
 * `excludeStopId` is the id of the stay being updated (ignored during comparison).
 */
export function validateNoStayOverlap(
  existingStops: Stop[],
  candidate: StayStop,
  excludeStopId?: string,
): { ok: true } | { ok: false; conflictsWith: StayStop } {
  for (const stop of existingStops) {
    if (stop.type !== 'stay') continue;
    if (excludeStopId && stop.id === excludeStopId) continue;
    if (stayOverlapsStay(candidate, stop)) {
      return { ok: false, conflictsWith: stop };
    }
  }
  return { ok: true };
}

/**
 * Compute the agenda day range for a trip.
 * Takes the earliest of (trip.startDate, earliest stop date) and the latest of
 * (trip.endDate, latest stop date / stay endDate). The agenda may extend
 * beyond nominal trip dates per REQ-013.
 */
export function computeAgendaDayRange(
  stops: Stop[],
  trip: Pick<Trip, 'startDate' | 'endDate'>,
): { start: string; end: string } {
  let start = trip.startDate;
  let end = trip.endDate;

  for (const stop of stops) {
    if (stop.date < start) start = stop.date;
    const stopEnd = stop.type === 'stay' ? stop.endDate : stop.date;
    if (stopEnd > end) end = stopEnd;
  }

  return { start, end };
}

/**
 * Return the list of ISO dates from start to end inclusive.
 */
export function enumerateDateRange(start: string, end: string): string[] {
  if (start > end) return [];
  const result: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}

/**
 * Bucket stops by the day on which they render.
 * Stays render on every night from date..endDate; other types render on their date.
 * The returned map preserves every stop occurrence (stays appear in multiple buckets).
 */
export function groupStopsByDay(stops: Stop[]): Map<string, Stop[]> {
  const map = new Map<string, Stop[]>();

  const push = (date: string, stop: Stop) => {
    const bucket = map.get(date);
    if (bucket) {
      bucket.push(stop);
    } else {
      map.set(date, [stop]);
    }
  };

  for (const stop of stops) {
    if (stop.type === 'stay') {
      for (const d of enumerateDateRange(stop.date, stop.endDate)) {
        push(d, stop);
      }
    } else {
      push(stop.date, stop);
    }
  }

  return map;
}

/**
 * Find the stay (if any) covering the given date. Assumes no-overlap invariant.
 */
export function findActiveStay(stops: Stop[], date: string): StayStop | null {
  for (const stop of stops) {
    if (stop.type !== 'stay') continue;
    if (stayCoversDate(stop, date)) return stop;
  }
  return null;
}

/**
 * A transit is a "base change" (renders as a full-width connector between chapters,
 * per REQ-026) when the transit date sits at the seam between two different stays
 * OR is the last day of one stay with no next stay OR the first day of a stay with
 * no prior stay. It is a "day-trip" (renders inline, REQ-027) otherwise — i.e.,
 * when the transit falls strictly inside a single stay's range or into a day with
 * no stay coverage on either side.
 */
export function isTransitBaseChange(transit: TransitStop, stops: Stop[]): boolean {
  const stays = stops.filter((s): s is StayStop => s.type === 'stay');

  const dayBefore = addDays(transit.date, -1);
  const outgoingStay = stays.find((s) => stayCoversDate(s, dayBefore));
  const arrivingStay = stays.find((s) => stayCoversDate(s, transit.date));

  // Day-trip case: both sides inside the same stay
  if (outgoingStay && arrivingStay && outgoingStay.id === arrivingStay.id) {
    return false;
  }

  // Transit crosses a seam between two different stays, or arrives at / departs
  // from a stay without a matching counterpart on the other side.
  if (outgoingStay && !arrivingStay) return true;
  if (!outgoingStay && arrivingStay) return true;
  if (outgoingStay && arrivingStay && outgoingStay.id !== arrivingStay.id) return true;

  // Neither side covered by a stay → inline day-trip style.
  return false;
}
