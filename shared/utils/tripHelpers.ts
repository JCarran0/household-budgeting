/**
 * Trip tag generation and utility functions.
 * Used by both frontend (tag preview) and backend (tag creation).
 */

import type { Stop, StayStop, TransitStop, Trip } from '../types';
import { etDateString } from './easternTime';

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
 * Derive trip status from dates relative to today in US Eastern Time.
 * startDate/endDate are YYYY-MM-DD strings — compare as strings since that's
 * lexically equivalent to a date comparison and avoids any Date-parsing
 * timezone surprises.
 */
export function getTripStatus(startDate: string, endDate: string): 'upcoming' | 'active' | 'completed' {
  const today = etDateString();
  if (startDate > today) return 'upcoming';
  if (endDate < today) return 'completed';
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
 * True if the stop has verified lat/lng coordinates and is a candidate for
 * pinning on the map. Stays always qualify (V1 REQ-009 guarantees verified
 * location); Eat/Play qualify only when their location.kind === 'verified';
 * Transit stops are never pinned (their spatial presence is the connector line).
 */
export function hasVerifiedCoords(stop: Stop): boolean {
  if (stop.type === 'stay') return true;
  if (stop.type === 'eat' || stop.type === 'play') {
    return stop.location?.kind === 'verified';
  }
  return false;
}

/**
 * Resolve which stop's photo should drive the cover banner for a trip.
 *
 * Resolution order:
 *   1. If `trip.coverStopId` points at a still-existing stop with a `photoName`
 *      on a verified location, use it (user's explicit pick).
 *   2. Otherwise, the first Stay (in itinerary/date order) whose verified
 *      location has a `photoName`.
 *   3. Otherwise, the first Eat or Play stop with a verified-location photo.
 *   4. Otherwise, null — caller falls back to the non-banner header.
 *
 * Transit stops are never considered — their locations represent travel
 * endpoints, not a place to photograph.
 */
export function resolveCoverStop(
  trip: Pick<Trip, 'coverStopId' | 'stops'>,
): Stop | null {
  const hasPhoto = (stop: Stop): boolean => {
    if (stop.type === 'stay') return Boolean(stop.location.photoName);
    if (stop.type === 'eat' || stop.type === 'play') {
      return stop.location?.kind === 'verified' && Boolean(stop.location.photoName);
    }
    return false;
  };

  if (trip.coverStopId) {
    const explicit = trip.stops.find((s) => s.id === trip.coverStopId);
    if (explicit && hasPhoto(explicit)) return explicit;
  }

  const sorted = [...trip.stops].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.sortOrder - b.sortOrder;
  });

  const firstStay = sorted.find((s) => s.type === 'stay' && hasPhoto(s));
  if (firstStay) return firstStay;

  const firstEatOrPlay = sorted.find(
    (s) => (s.type === 'eat' || s.type === 'play') && hasPhoto(s),
  );
  return firstEatOrPlay ?? null;
}

/**
 * Extract a verified-location `photoName` + attribution from a stop, regardless
 * of stop type. Returns null for transits and free-text / missing locations.
 */
export function getStopPhoto(
  stop: Stop,
): { photoName: string; attribution: string | null } | null {
  if (stop.type === 'stay') {
    if (!stop.location.photoName) return null;
    return {
      photoName: stop.location.photoName,
      attribution: stop.location.photoAttribution ?? null,
    };
  }
  if (stop.type === 'eat' || stop.type === 'play') {
    if (stop.location?.kind !== 'verified' || !stop.location.photoName) return null;
    return {
      photoName: stop.location.photoName,
      attribution: stop.location.photoAttribution ?? null,
    };
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
