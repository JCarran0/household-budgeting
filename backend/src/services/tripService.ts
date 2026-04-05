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
} from '../shared/types';
import { DataService } from './dataService';
import { TransactionService, StoredTransaction } from './transactionService';
import { generateTripTag, getTripStatus } from '../shared/utils/tripHelpers';

export class TripService {
  constructor(
    private dataService: DataService,
    private transactionService: TransactionService
  ) {}

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadTrips(userId: string): Promise<StoredTrip[]> {
    return (await this.dataService.getData<StoredTrip[]>(`trips_${userId}`)) ?? [];
  }

  private async saveTrips(trips: StoredTrip[], userId: string): Promise<void> {
    await this.dataService.saveData(`trips_${userId}`, trips);
  }

  /**
   * Strip a tag from all of a user's transactions.
   * Works directly against the raw transaction store for batch efficiency.
   */
  private async removeTagFromTransactions(tag: string, userId: string): Promise<void> {
    const transactions =
      (await this.dataService.getData<StoredTransaction[]>(`transactions_${userId}`)) ?? [];

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
      await this.dataService.saveData(`transactions_${userId}`, updated);
    }
  }

  /**
   * Replace all occurrences of oldTag with newTag in a user's transactions.
   * Works directly against the raw transaction store for batch efficiency.
   */
  private async renameTagOnTransactions(
    oldTag: string,
    newTag: string,
    userId: string
  ): Promise<void> {
    const transactions =
      (await this.dataService.getData<StoredTransaction[]>(`transactions_${userId}`)) ?? [];

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
      await this.dataService.saveData(`transactions_${userId}`, updated);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Create a new trip.
   * Generates a tag from the name and start date, then validates uniqueness.
   */
  async createTrip(data: CreateTripDto, userId: string): Promise<StoredTrip> {
    const tag = generateTripTag(data.name, data.startDate);

    const existingTrips = await this.loadTrips(userId);
    if (existingTrips.some((t) => t.tag === tag)) {
      throw new Error('A trip with this tag already exists');
    }

    const now = new Date().toISOString();
    const trip: StoredTrip = {
      id: uuidv4(),
      userId,
      name: data.name,
      tag,
      startDate: data.startDate,
      endDate: data.endDate,
      totalBudget: data.totalBudget ?? null,
      categoryBudgets: data.categoryBudgets ?? [],
      rating: data.rating ?? null,
      notes: data.notes ?? '',
      createdAt: now,
      updatedAt: now,
    };

    existingTrips.push(trip);
    await this.saveTrips(existingTrips, userId);

    return trip;
  }

  /**
   * Retrieve a single trip by ID.
   */
  async getTrip(tripId: string, userId: string): Promise<StoredTrip | null> {
    const trips = await this.loadTrips(userId);
    return trips.find((t) => t.id === tripId) ?? null;
  }

  /**
   * Retrieve all trips for a user, optionally filtered by start year.
   * Returns trips sorted by startDate descending (most recent first).
   */
  async getAllTrips(userId: string, year?: number): Promise<StoredTrip[]> {
    let trips = await this.loadTrips(userId);

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
    userId: string
  ): Promise<StoredTrip> {
    const trips = await this.loadTrips(userId);
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
      // Validate the new tag is unique among this user's other trips
      const otherTrips = trips.filter((t) => t.id !== tripId);
      if (otherTrips.some((t) => t.tag === candidateTag)) {
        throw new Error('A trip with this tag already exists');
      }

      // Rename tag on transactions BEFORE updating the entity (D6)
      await this.renameTagOnTransactions(oldTag, candidateTag, userId);
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
      tag: tagWillChange ? candidateTag : oldTag,
      updatedAt: now,
    };

    trips[index] = updatedTrip;
    await this.saveTrips(trips, userId);

    return updatedTrip;
  }

  /**
   * Delete a trip.
   * Strips the trip tag from all transactions BEFORE removing the trip entity
   * (D6: transactions before entity deletion).
   */
  async deleteTrip(tripId: string, userId: string): Promise<void> {
    const trips = await this.loadTrips(userId);
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) {
      throw new Error('Trip not found');
    }

    // Remove tag from transactions first (D6)
    await this.removeTagFromTransactions(trip.tag, userId);

    const remaining = trips.filter((t) => t.id !== tripId);
    await this.saveTrips(remaining, userId);
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
    userId: string,
    categories?: Array<{ id: string; name: string }>
  ): Promise<TripSummary> {
    const trip = await this.getTrip(tripId, userId);
    if (!trip) {
      throw new Error('Trip not found');
    }

    const result = await this.transactionService.getTransactions(userId, {
      tags: [trip.tag],
      includeHidden: true,
    });

    const transactions = result.transactions ?? [];

    // Accumulate spending per category
    const spendingMap = new Map<string, number>();
    let totalSpent = 0;

    for (const txn of transactions) {
      // Use absolute value so expenses (positive amounts in Plaid convention) and
      // income (negative) both contribute meaningful totals for trip tracking.
      const amount = Math.abs(txn.amount);
      totalSpent += amount;

      const catId = txn.categoryId ?? '__uncategorized__';
      spendingMap.set(catId, (spendingMap.get(catId) ?? 0) + amount);
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

  /**
   * Build summaries for all trips belonging to a user, optionally filtered by
   * start year. Returns summaries sorted by startDate descending.
   */
  async getTripsSummaries(
    userId: string,
    year?: number,
    categories?: Array<{ id: string; name: string }>
  ): Promise<TripSummary[]> {
    const trips = await this.getAllTrips(userId, year);

    const summaries = await Promise.all(
      trips.map((trip) => this.getTripSummary(trip.id, userId, categories))
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
