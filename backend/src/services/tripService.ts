/**
 * Trip Service
 *
 * Manages travel trips, including creation, updates, deletion, and spending
 * summaries derived from tagged transactions.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  StoredTrip,
  TripSummary,
  TripCategorySpending,
  CreateTripDto,
  UpdateTripDto,
  Stop,
  StayStop,
} from '../shared/types';
import { DataService } from './dataService';
import { TransactionService, StoredTransaction } from './transactionService';
import {
  generateTripTag,
  getTripStatus,
  validateNoStayOverlap,
} from '../shared/utils/tripHelpers';
import {
  CreateStopInput,
  UpdateStopInput,
  ReorderStopsInput,
} from '../validators/stopValidators';
import { NotFoundError, ValidationError, ConflictError } from '../errors';

/**
 * Thrown when a stay create/update would overlap another stay.
 * Subclass of ConflictError so the route middleware returns 409; the specific
 * code lets the frontend display a targeted toast (REQ-014 / 7.2).
 */
export class StayOverlapError extends ConflictError {
  constructor(public readonly conflictsWith: StayStop) {
    super(
      `This Stay overlaps with "${conflictsWith.name}" (${conflictsWith.date} – ${conflictsWith.endDate}).`,
      'STAY_OVERLAP',
    );
  }
}

export class TripService {
  constructor(
    private dataService: DataService,
    private transactionService: TransactionService
  ) {}

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadTrips(familyId: string): Promise<StoredTrip[]> {
    const trips = (await this.dataService.getData<StoredTrip[]>(`trips_${familyId}`)) ?? [];
    // Backwards-compat: older trips persisted before itineraries have no `stops`
    // and trips persisted before V2 have no `photoAlbumUrl`. Default both on read.
    return trips.map((t) => ({
      ...t,
      stops: t.stops ?? [],
      photoAlbumUrl: t.photoAlbumUrl ?? null,
    }));
  }

  private async saveTrips(trips: StoredTrip[], familyId: string): Promise<void> {
    await this.dataService.saveData(`trips_${familyId}`, trips);
  }

  /**
   * Strip a tag from all of a family's transactions.
   * Works directly against the raw transaction store for batch efficiency.
   */
  private async removeTagFromTransactions(tag: string, familyId: string): Promise<void> {
    const transactions =
      (await this.dataService.getData<StoredTransaction[]>(`transactions_${familyId}`)) ?? [];

    let changed = false;
    const updated = transactions.map((txn) => {
      if (!txn.tags.includes(tag)) return txn;
      changed = true;
      return {
        ...txn,
        tags: txn.tags.filter((t) => t !== tag),
        updatedAt: new Date(),
      };
    });

    if (changed) {
      await this.dataService.saveData(`transactions_${familyId}`, updated);
    }
  }

  /**
   * Replace all occurrences of oldTag with newTag in a family's transactions.
   * Works directly against the raw transaction store for batch efficiency.
   */
  private async renameTagOnTransactions(
    oldTag: string,
    newTag: string,
    familyId: string
  ): Promise<void> {
    const transactions =
      (await this.dataService.getData<StoredTransaction[]>(`transactions_${familyId}`)) ?? [];

    let changed = false;
    const updated = transactions.map((txn) => {
      if (!txn.tags.includes(oldTag)) return txn;
      changed = true;
      return {
        ...txn,
        tags: txn.tags.map((t) => (t === oldTag ? newTag : t)),
        updatedAt: new Date(),
      };
    });

    if (changed) {
      await this.dataService.saveData(`transactions_${familyId}`, updated);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Create a new trip.
   * Generates a tag from the name and start date, then validates uniqueness.
   */
  async createTrip(data: CreateTripDto, familyId: string, userId?: string): Promise<StoredTrip> {
    const tag = generateTripTag(data.name, data.startDate);

    const existingTrips = await this.loadTrips(familyId);
    if (existingTrips.some((t) => t.tag === tag)) {
      throw new Error('A trip with this tag already exists');
    }

    const now = new Date().toISOString();
    const trip: StoredTrip = {
      id: uuidv4(),
      userId: familyId,
      name: data.name,
      tag,
      startDate: data.startDate,
      endDate: data.endDate,
      totalBudget: data.totalBudget ?? null,
      categoryBudgets: data.categoryBudgets ?? [],
      rating: data.rating ?? null,
      notes: data.notes ?? '',
      stops: [],
      photoAlbumUrl: data.photoAlbumUrl ?? null,
      createdAt: now,
      updatedAt: now,
      lastModifiedBy: userId,
    };

    existingTrips.push(trip);
    await this.saveTrips(existingTrips, familyId);

    return trip;
  }

  /**
   * Retrieve a single trip by ID.
   */
  async getTrip(tripId: string, familyId: string): Promise<StoredTrip | null> {
    const trips = await this.loadTrips(familyId);
    return trips.find((t) => t.id === tripId) ?? null;
  }

  /**
   * Retrieve all trips for a family, optionally filtered by start year.
   * Returns trips sorted by startDate descending (most recent first).
   */
  async getAllTrips(familyId: string, year?: number): Promise<StoredTrip[]> {
    let trips = await this.loadTrips(familyId);

    if (year !== undefined) {
      trips = trips.filter((t) => new Date(t.startDate).getFullYear() === year);
    }

    return trips.sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  /**
   * Update an existing trip.
   * If the name changes in a way that produces a new tag, the tag is renamed on
   * all tagged transactions before updating the trip entity (D6: transactions
   * before entity update).
   */
  async updateTrip(
    tripId: string,
    data: UpdateTripDto,
    familyId: string,
    userId?: string
  ): Promise<StoredTrip> {
    const trips = await this.loadTrips(familyId);
    const index = trips.findIndex((t) => t.id === tripId);
    if (index === -1) {
      throw new Error('Trip not found');
    }

    const existing = trips[index];
    const oldTag = existing.tag;

    // Determine whether the tag would change
    const newName = data.name ?? existing.name;
    const newStartDate = data.startDate ?? existing.startDate;
    const candidateTag = generateTripTag(newName, newStartDate);
    const tagWillChange = candidateTag !== oldTag;

    if (tagWillChange) {
      // Validate the new tag is unique among this family's other trips
      const otherTrips = trips.filter((t) => t.id !== tripId);
      if (otherTrips.some((t) => t.tag === candidateTag)) {
        throw new Error('A trip with this tag already exists');
      }

      // Rename tag on transactions BEFORE updating the entity (D6)
      await this.renameTagOnTransactions(oldTag, candidateTag, familyId);
    }

    const now = new Date().toISOString();
    const updatedTrip: StoredTrip = {
      ...existing,
      name: newName,
      startDate: newStartDate,
      endDate: data.endDate ?? existing.endDate,
      totalBudget: data.totalBudget !== undefined ? data.totalBudget : existing.totalBudget,
      categoryBudgets: data.categoryBudgets ?? existing.categoryBudgets,
      rating: data.rating !== undefined ? data.rating : existing.rating,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      photoAlbumUrl:
        data.photoAlbumUrl !== undefined ? data.photoAlbumUrl : existing.photoAlbumUrl,
      tag: tagWillChange ? candidateTag : oldTag,
      updatedAt: now,
      lastModifiedBy: userId ?? existing.lastModifiedBy,
    };

    trips[index] = updatedTrip;
    await this.saveTrips(trips, familyId);

    return updatedTrip;
  }

  /**
   * Delete a trip.
   * Strips the trip tag from all transactions BEFORE removing the trip entity
   * (D6: transactions before entity deletion).
   */
  async deleteTrip(tripId: string, familyId: string): Promise<void> {
    const trips = await this.loadTrips(familyId);
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) {
      throw new Error('Trip not found');
    }

    // Remove tag from transactions first (D6)
    await this.removeTagFromTransactions(trip.tag, familyId);

    const remaining = trips.filter((t) => t.id !== tripId);
    await this.saveTrips(remaining, familyId);
  }

  /**
   * Build a full summary for a single trip, including spending totals derived
   * from tagged transactions.
   *
   * @param categories  Optional flat list of {id, name} pairs used to resolve
   *                    category names. Falls back to categoryId when absent.
   */
  async getTripSummary(
    tripId: string,
    familyId: string,
    categories?: Array<{ id: string; name: string }>
  ): Promise<TripSummary> {
    const trip = await this.getTrip(tripId, familyId);
    if (!trip) {
      throw new Error('Trip not found');
    }

    const result = await this.transactionService.getTransactions(familyId, {
      tags: [trip.tag],
      includeHidden: true,
    });

    const transactions = result.transactions ?? [];

    // Accumulate spending per category
    // Positive amounts = expenses (debits), negative = income (credits/deposits).
    // We sum actual signed amounts so deposits offset expenses in trip totals.
    const spendingMap = new Map<string, number>();
    let totalSpent = 0;

    for (const txn of transactions) {
      totalSpent += txn.amount;

      const catId = txn.categoryId ?? '__uncategorized__';
      spendingMap.set(catId, (spendingMap.get(catId) ?? 0) + txn.amount);
    }

    // Build a name lookup from the provided categories list
    const categoryNameMap = new Map<string, string>();
    if (categories) {
      for (const cat of categories) {
        categoryNameMap.set(cat.id, cat.name);
      }
    }

    // Build a budget lookup from the trip's categoryBudgets
    const budgetMap = new Map<string, number>();
    for (const cb of trip.categoryBudgets) {
      budgetMap.set(cb.categoryId, cb.amount);
    }

    // Merge spending entries (which may not be in categoryBudgets) and budget
    // entries (which may have no spending yet) into a unified list
    const allCategoryIds = new Set<string>([
      ...spendingMap.keys(),
      ...budgetMap.keys(),
    ]);

    const categorySpending: TripCategorySpending[] = [];
    for (const catId of allCategoryIds) {
      if (catId === '__uncategorized__') {
        // Only include uncategorized bucket when there is actual spending
        if (!spendingMap.has(catId)) continue;
        categorySpending.push({
          categoryId: catId,
          categoryName: 'Uncategorized',
          spent: spendingMap.get(catId) ?? 0,
          budgeted: null,
        });
        continue;
      }

      categorySpending.push({
        categoryId: catId,
        categoryName: categoryNameMap.get(catId) ?? catId,
        spent: spendingMap.get(catId) ?? 0,
        budgeted: budgetMap.get(catId) ?? null,
      });
    }

    return {
      ...trip,
      status: getTripStatus(trip.startDate, trip.endDate),
      totalSpent,
      categorySpending,
    };
  }

  // ---------------------------------------------------------------------------
  // Stop CRUD (itineraries)
  //
  // All stop mutations are whole-trip writes — simpler to reason about than
  // partial writes, and consistent with the existing category-budgets pattern.
  // Last-write-wins is acceptable for a 2-user family app.
  // ---------------------------------------------------------------------------

  private async saveStopsOnTrip(
    tripId: string,
    familyId: string,
    mutate: (trip: StoredTrip) => Stop[],
    userId?: string,
  ): Promise<StoredTrip> {
    const trips = await this.loadTrips(familyId);
    const index = trips.findIndex((t) => t.id === tripId);
    if (index === -1) {
      throw new NotFoundError('Trip not found');
    }

    const now = new Date().toISOString();
    const existing = trips[index];
    const nextStops = mutate(existing);

    trips[index] = {
      ...existing,
      stops: nextStops,
      updatedAt: now,
      lastModifiedBy: userId ?? existing.lastModifiedBy,
    };

    await this.saveTrips(trips, familyId);
    return trips[index];
  }

  /**
   * Construct a new Stop entity from a validated create payload.
   * Fills in server-owned fields (id, timestamps, defaults).
   */
  private buildStop(input: CreateStopInput, now: string, defaultSortOrder: number): Stop {
    const base = {
      id: uuidv4(),
      date: input.date,
      time: input.time ?? null,
      notes: input.notes ?? '',
      sortOrder: input.sortOrder ?? defaultSortOrder,
      createdAt: now,
      updatedAt: now,
    };

    switch (input.type) {
      case 'stay':
        return {
          ...base,
          type: 'stay',
          name: input.name,
          location: input.location,
          endDate: input.endDate,
        };
      case 'eat':
        return {
          ...base,
          type: 'eat',
          name: input.name,
          location: input.location ?? null,
        };
      case 'play':
        return {
          ...base,
          type: 'play',
          name: input.name,
          location: input.location ?? null,
          durationMinutes: input.durationMinutes ?? null,
        };
      case 'transit':
        return {
          ...base,
          type: 'transit',
          mode: input.mode,
          fromLocation: input.fromLocation ?? null,
          toLocation: input.toLocation ?? null,
          durationMinutes: input.durationMinutes ?? null,
        };
    }
  }

  /**
   * Apply a validated update payload to an existing stop.
   * The input's `type` must match the existing stop's type; the route layer
   * enforces this and returns 400 otherwise.
   */
  private applyStopUpdate(existing: Stop, input: UpdateStopInput, now: string): Stop {
    if (existing.type !== input.type) {
      throw new ValidationError(
        `Stop type cannot change after creation (existing: ${existing.type}, requested: ${input.type})`,
      );
    }

    const baseUpdates = {
      date: input.date ?? existing.date,
      time: input.time !== undefined ? input.time : existing.time,
      notes: input.notes ?? existing.notes,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      updatedAt: now,
    };

    // Each branch narrows both `existing` and `input` to the matching variant.
    if (existing.type === 'stay' && input.type === 'stay') {
      return {
        ...existing,
        ...baseUpdates,
        name: input.name ?? existing.name,
        location: input.location ?? existing.location,
        endDate: input.endDate ?? existing.endDate,
      };
    }
    if (existing.type === 'eat' && input.type === 'eat') {
      return {
        ...existing,
        ...baseUpdates,
        name: input.name ?? existing.name,
        location: input.location !== undefined ? input.location : existing.location,
      };
    }
    if (existing.type === 'play' && input.type === 'play') {
      return {
        ...existing,
        ...baseUpdates,
        name: input.name ?? existing.name,
        location: input.location !== undefined ? input.location : existing.location,
        durationMinutes:
          input.durationMinutes !== undefined ? input.durationMinutes : existing.durationMinutes,
      };
    }
    if (existing.type === 'transit' && input.type === 'transit') {
      return {
        ...existing,
        ...baseUpdates,
        mode: input.mode ?? existing.mode,
        fromLocation:
          input.fromLocation !== undefined ? input.fromLocation : existing.fromLocation,
        toLocation: input.toLocation !== undefined ? input.toLocation : existing.toLocation,
        durationMinutes:
          input.durationMinutes !== undefined ? input.durationMinutes : existing.durationMinutes,
      };
    }

    // Unreachable — the type equality guard above covers every case.
    throw new ValidationError(`Unsupported stop type: ${existing.type}`);
  }

  async createStop(
    tripId: string,
    familyId: string,
    data: CreateStopInput,
    userId?: string,
  ): Promise<Stop> {
    const now = new Date().toISOString();
    let created: Stop | null = null;

    await this.saveStopsOnTrip(
      tripId,
      familyId,
      (trip) => {
        const stop = this.buildStop(data, now, trip.stops.length);

        if (stop.type === 'stay') {
          const result = validateNoStayOverlap(trip.stops, stop);
          if (!result.ok) {
            throw new StayOverlapError(result.conflictsWith);
          }
        }

        created = stop;
        return [...trip.stops, stop];
      },
      userId,
    );

    // saveStopsOnTrip always assigns `created` via the mutate callback on success.
    if (!created) throw new Error('Stop creation failed');
    return created;
  }

  async updateStop(
    tripId: string,
    stopId: string,
    familyId: string,
    data: UpdateStopInput,
    userId?: string,
  ): Promise<Stop> {
    const now = new Date().toISOString();
    let updated: Stop | null = null;

    await this.saveStopsOnTrip(
      tripId,
      familyId,
      (trip) => {
        const idx = trip.stops.findIndex((s) => s.id === stopId);
        if (idx === -1) {
          throw new NotFoundError('Stop not found');
        }

        const existing = trip.stops[idx];
        const next = this.applyStopUpdate(existing, data, now);

        if (next.type === 'stay') {
          const result = validateNoStayOverlap(trip.stops, next, stopId);
          if (!result.ok) {
            throw new StayOverlapError(result.conflictsWith);
          }
        }

        updated = next;
        const copy = [...trip.stops];
        copy[idx] = next;
        return copy;
      },
      userId,
    );

    if (!updated) throw new Error('Stop update failed');
    return updated;
  }

  async deleteStop(
    tripId: string,
    stopId: string,
    familyId: string,
    userId?: string,
  ): Promise<void> {
    await this.saveStopsOnTrip(
      tripId,
      familyId,
      (trip) => {
        const exists = trip.stops.some((s) => s.id === stopId);
        if (!exists) {
          throw new NotFoundError('Stop not found');
        }
        return trip.stops.filter((s) => s.id !== stopId);
      },
      userId,
    );
  }

  async reorderStops(
    tripId: string,
    familyId: string,
    data: ReorderStopsInput,
    userId?: string,
  ): Promise<Stop[]> {
    const now = new Date().toISOString();
    let result: Stop[] = [];

    await this.saveStopsOnTrip(
      tripId,
      familyId,
      (trip) => {
        const byId = new Map(data.updates.map((u) => [u.id, u.sortOrder]));
        const next = trip.stops.map((s) => {
          const newOrder = byId.get(s.id);
          if (newOrder === undefined) return s;
          return { ...s, sortOrder: newOrder, updatedAt: now };
        });
        result = next;
        return next;
      },
      userId,
    );

    return result;
  }

  /**
   * Build summaries for all trips belonging to a user, optionally filtered by
   * start year. Returns summaries sorted by startDate descending.
   */
  async getTripsSummaries(
    familyId: string,
    year?: number,
    categories?: Array<{ id: string; name: string }>
  ): Promise<TripSummary[]> {
    const trips = await this.getAllTrips(familyId, year);

    const summaries = await Promise.all(
      trips.map((trip) => this.getTripSummary(trip.id, familyId, categories))
    );

    // getAllTrips already returns trips sorted descending; Promise.all preserves
    // order, so the resulting summaries array is also sorted descending.
    return summaries;
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let tripServiceInstance: TripService | null = null;

export function getTripService(
  dataService: DataService,
  transactionService: TransactionService
): TripService {
  if (!tripServiceInstance) {
    tripServiceInstance = new TripService(dataService, transactionService);
  }
  return tripServiceInstance;
}
