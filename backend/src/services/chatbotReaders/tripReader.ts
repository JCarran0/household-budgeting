/**
 * Trip Reads for AI Tools (T0) — AI-CAPABILITY-PLATFORM-BRD §9.3.
 *
 * Trips were entirely invisible to the assistant. This exposes the itinerary
 * shape a planner needs: trips, their stops, and a day-by-day agenda.
 *
 * TWO CORRECTNESS RULES THIS FILE EXISTS TO HOLD:
 *
 * 1. Stay stops are NIGHT-based (TRIP-ITINERARIES-BRD D2): `endDate` is the
 *    LAST NIGHT, so a stay occupies dates [date, endDate] inclusive and the
 *    guest checks out the morning after endDate. Rendering a stay as a single
 *    date, or as [date, endDate) , silently loses a night. The agenda builder
 *    below expands stays across their nights explicitly.
 *
 * 2. Trip spending is TAG-based and tags are not exclusive. A transaction can
 *    carry a trip tag and a project tag at once, so trip totals from different
 *    trips must never be added together — see the note on
 *    `crossTripTotalsAreNotAdditive` in the result shape.
 */

import type { Trip, Stop, StayStop, StopLocation } from '../../shared/types';
import { getActiveTransactions } from '../transactionReader';

export interface TripDataReader {
  getData<T>(key: string): Promise<T | null>;
}

export const TRIP_STOP_HARD_MAX = 300;

interface StoredTransactionLike {
  status: string;
  amount: number;
  tags: string[];
  categoryId: string | null;
}

function locationLabel(loc: StopLocation | null | undefined): string | null {
  if (!loc) return null;
  return loc.label;
}

function locationAddress(loc: StopLocation | null | undefined): string | null {
  if (!loc) return null;
  return loc.kind === 'verified' ? loc.address : null;
}

export interface StopLineForTool {
  id: string;
  type: Stop['type'];
  /** Transit stops have no `name` field; they are described by their endpoints. */
  name: string | null;
  date: string;
  /** Stays only: the last night. Null for every other type — absence is explicit. */
  endDate: string | null;
  time: string | null;
  notes: string;
  location: string | null;
  address: string | null;
  /** Transit only. */
  fromLocation: string | null;
  toLocation: string | null;
  transitMode: string | null;
  durationMinutes: number | null;
}

function toStopLine(stop: Stop): StopLineForTool {
  const base = {
    id: stop.id,
    type: stop.type,
    date: stop.date,
    time: stop.time,
    notes: stop.notes,
    endDate: null as string | null,
    name: null as string | null,
    location: null as string | null,
    address: null as string | null,
    fromLocation: null as string | null,
    toLocation: null as string | null,
    transitMode: null as string | null,
    durationMinutes: null as number | null,
  };

  switch (stop.type) {
    case 'stay':
      return {
        ...base,
        name: stop.name,
        endDate: stop.endDate,
        location: locationLabel(stop.location),
        address: locationAddress(stop.location),
      };
    case 'eat':
      return {
        ...base,
        name: stop.name,
        location: locationLabel(stop.location),
        address: locationAddress(stop.location),
      };
    case 'play':
      return {
        ...base,
        name: stop.name,
        location: locationLabel(stop.location),
        address: locationAddress(stop.location),
        durationMinutes: stop.durationMinutes,
      };
    case 'transit':
      return {
        ...base,
        transitMode: stop.mode,
        fromLocation: locationLabel(stop.fromLocation),
        toLocation: locationLabel(stop.toLocation),
        durationMinutes: stop.durationMinutes,
      };
  }
}

/** Inclusive date range walk. Both bounds are YYYY-MM-DD. */
function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(last.getTime())) return out;
  // Bounded so a corrupt endDate cannot spin: no itinerary is 2 years long.
  let guard = 0;
  while (d.getTime() <= last.getTime() && guard < 800) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}

export interface TripSummaryForTool {
  id: string;
  name: string;
  tag: string;
  startDate: string;
  endDate: string;
  notes: string;
  totalBudget: number | null;
  hasBudget: boolean;
  stopCount: number;
  /** Present only when the caller asked for spending. Null means "not requested". */
  spending: TripSpendingForTool | null;
}

export interface TripSpendingForTool {
  totalSpent: number;
  transactionCount: number;
  /**
   * Always true. Trip totals come from a non-exclusive tag, so a transaction
   * tagged for both a trip and a project counts fully toward each. Summing
   * totals across trips, or adding a trip total to a project total, double
   * counts. The flag is in the payload so the model is told, not trusted to
   * remember (AI-CAPABILITY-PLATFORM-BRD §9.4).
   */
  crossTripTotalsAreNotAdditive: true;
}

export interface ListTripsToolResult {
  count: number;
  trips: TripSummaryForTool[];
}

export interface GetTripItineraryToolResult {
  found: boolean;
  /** Echoes what was searched for, so "not found" is never ambiguous. */
  query: string;
  trip: TripSummaryForTool | null;
  stopsTruncated: boolean;
  /** Day-by-day agenda. Empty array with found=true means a trip with no stops. */
  agenda: {
    date: string;
    stayingAt: string[];
    stops: StopLineForTool[];
  }[];
}

export class ChatbotTripReader {
  constructor(private readonly dataService: TripDataReader) {}

  private async loadTrips(familyId: string): Promise<Trip[]> {
    return (await this.dataService.getData<Trip[]>(`trips_${familyId}`)) ?? [];
  }

  private async spendingFor(familyId: string, tag: string): Promise<TripSpendingForTool> {
    // SEC-P031: removed transactions never reach an AI read path.
    const txns = await getActiveTransactions<StoredTransactionLike>(this.dataService, familyId);
    const tagged = txns.filter(t => t.tags.includes(tag));
    return {
      totalSpent: tagged.reduce((sum, t) => sum + t.amount, 0),
      transactionCount: tagged.length,
      crossTripTotalsAreNotAdditive: true,
    };
  }

  private toSummary(trip: Trip, spending: TripSpendingForTool | null): TripSummaryForTool {
    return {
      id: trip.id,
      name: trip.name,
      tag: trip.tag,
      startDate: trip.startDate,
      endDate: trip.endDate,
      notes: trip.notes,
      totalBudget: trip.totalBudget,
      // SEC-P033: null budget means "none set", which must not read as "unknown".
      hasBudget: trip.totalBudget !== null,
      stopCount: trip.stops.length,
      spending,
    };
  }

  async listTrips(
    familyId: string,
    input: { includeSpending?: boolean } = {},
  ): Promise<ListTripsToolResult> {
    const trips = await this.loadTrips(familyId);
    const sorted = [...trips].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

    const summaries: TripSummaryForTool[] = [];
    for (const trip of sorted) {
      const spending = input.includeSpending ? await this.spendingFor(familyId, trip.tag) : null;
      summaries.push(this.toSummary(trip, spending));
    }
    return { count: summaries.length, trips: summaries };
  }

  async getItinerary(
    familyId: string,
    input: { tripQuery: string; includeSpending?: boolean },
  ): Promise<GetTripItineraryToolResult> {
    const trips = await this.loadTrips(familyId);
    const q = input.tripQuery.toLowerCase();
    const trip =
      trips.find(t => t.id === input.tripQuery) ??
      trips.find(t => t.name.toLowerCase() === q) ??
      trips.find(t => t.name.toLowerCase().includes(q)) ??
      trips.find(t => t.tag.toLowerCase() === q);

    if (!trip) {
      // SEC-P033: an explicit not-found, never an empty agenda that the model
      // could read as "this trip has nothing planned".
      return { found: false, query: input.tripQuery, trip: null, stopsTruncated: false, agenda: [] };
    }

    const spending = input.includeSpending ? await this.spendingFor(familyId, trip.tag) : null;

    const stops = [...trip.stops]
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
        if (a.time && !b.time) return -1;
        if (!a.time && b.time) return 1;
        return a.sortOrder - b.sortOrder;
      })
      .slice(0, TRIP_STOP_HARD_MAX);

    const byDate = new Map<string, StopLineForTool[]>();
    for (const stop of stops) {
      const line = toStopLine(stop);
      const existing = byDate.get(stop.date);
      if (existing) existing.push(line);
      else byDate.set(stop.date, [line]);
    }

    // Night-based stays: a stay booked 04-10 with endDate 04-12 means the
    // household is lodged there on the 10th, 11th and 12th.
    const stayingByDate = new Map<string, string[]>();
    for (const stop of stops) {
      if (stop.type !== 'stay') continue;
      const stay = stop as StayStop;
      for (const date of eachDate(stay.date, stay.endDate)) {
        const existing = stayingByDate.get(date);
        if (existing) existing.push(stay.name);
        else stayingByDate.set(date, [stay.name]);
      }
    }

    const allDates = new Set<string>([
      ...eachDate(trip.startDate, trip.endDate),
      ...byDate.keys(),
      ...stayingByDate.keys(),
    ]);

    const agenda = [...allDates]
      .sort()
      .map(date => ({
        date,
        stayingAt: stayingByDate.get(date) ?? [],
        stops: byDate.get(date) ?? [],
      }));

    return {
      found: true,
      query: input.tripQuery,
      trip: this.toSummary(trip, spending),
      stopsTruncated: trip.stops.length > TRIP_STOP_HARD_MAX,
      agenda,
    };
  }
}
