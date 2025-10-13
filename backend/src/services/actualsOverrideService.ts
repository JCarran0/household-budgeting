/**
 * Actuals Override Service
 *
 * Manages user-defined income and expense totals for historical months
 * where transaction data may not be available or complete.
 */

import { DataService } from './dataService';

// Core data model for actuals overrides
export interface StoredActualsOverride {
  id: string;
  userId: string;
  month: string; // YYYY-MM format
  totalIncome: number;
  totalExpenses: number;
  notes?: string; // Optional user notes
  createdAt: Date;
  updatedAt: Date;
}

// DTO for creating/updating overrides
export interface CreateActualsOverrideDto {
  month: string; // YYYY-MM format
  totalIncome: number;
  totalExpenses: number;
  notes?: string;
}

// Service result types
export interface ActualsOverrideResult {
  success: boolean;
  override?: StoredActualsOverride;
  error?: string;
}

export interface ActualsOverrideListResult {
  success: boolean;
  overrides?: StoredActualsOverride[];
  error?: string;
}

export class ActualsOverrideService {
  constructor(private dataService: DataService) {}

  /**
   * Get all actuals overrides for a user
   */
  async getOverrides(userId: string): Promise<ActualsOverrideListResult> {
    try {
      const overrides = await this.dataService.getData<StoredActualsOverride[]>(
        `actuals_overrides_${userId}`
      ) || [];

      // Sort by month descending (most recent first)
      overrides.sort((a, b) => b.month.localeCompare(a.month));

      return { success: true, overrides };
    } catch (error) {
      console.error('Error getting actuals overrides:', error);
      return { success: false, error: 'Failed to get actuals overrides' };
    }
  }

  /**
   * Get specific month override for a user
   */
  async getOverride(userId: string, month: string): Promise<ActualsOverrideResult> {
    try {
      const overrides = await this.dataService.getData<StoredActualsOverride[]>(
        `actuals_overrides_${userId}`
      ) || [];

      const override = overrides.find(o => o.month === month);

      if (!override) {
        return { success: false, error: 'Override not found' };
      }

      return { success: true, override };
    } catch (error) {
      console.error('Error getting actuals override:', error);
      return { success: false, error: 'Failed to get actuals override' };
    }
  }

  /**
   * Create or update an actuals override
   */
  async createOrUpdateOverride(
    userId: string,
    data: CreateActualsOverrideDto
  ): Promise<ActualsOverrideResult> {
    try {
      // Validate month format
      if (!/^\d{4}-\d{2}$/.test(data.month)) {
        return { success: false, error: 'Invalid month format. Use YYYY-MM.' };
      }

      // Validate amounts are non-negative
      if (data.totalIncome < 0 || data.totalExpenses < 0) {
        return { success: false, error: 'Income and expense amounts must be non-negative' };
      }

      const overrides = await this.dataService.getData<StoredActualsOverride[]>(
        `actuals_overrides_${userId}`
      ) || [];

      const existingIndex = overrides.findIndex(o => o.month === data.month);
      const now = new Date();

      if (existingIndex >= 0) {
        // Update existing override
        const existing = overrides[existingIndex];
        const updated: StoredActualsOverride = {
          ...existing,
          totalIncome: data.totalIncome,
          totalExpenses: data.totalExpenses,
          notes: data.notes,
          updatedAt: now
        };

        overrides[existingIndex] = updated;
        await this.dataService.saveData(`actuals_overrides_${userId}`, overrides);

        return { success: true, override: updated };
      } else {
        // Create new override
        const newOverride: StoredActualsOverride = {
          id: this.generateId(),
          userId,
          month: data.month,
          totalIncome: data.totalIncome,
          totalExpenses: data.totalExpenses,
          notes: data.notes,
          createdAt: now,
          updatedAt: now
        };

        overrides.push(newOverride);
        await this.dataService.saveData(`actuals_overrides_${userId}`, overrides);

        return { success: true, override: newOverride };
      }
    } catch (error) {
      console.error('Error creating/updating actuals override:', error);
      return { success: false, error: 'Failed to save actuals override' };
    }
  }

  /**
   * Delete an actuals override
   */
  async deleteOverride(userId: string, overrideId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const overrides = await this.dataService.getData<StoredActualsOverride[]>(
        `actuals_overrides_${userId}`
      ) || [];

      const index = overrides.findIndex(o => o.id === overrideId);

      if (index === -1) {
        return { success: false, error: 'Override not found' };
      }

      overrides.splice(index, 1);
      await this.dataService.saveData(`actuals_overrides_${userId}`, overrides);

      return { success: true };
    } catch (error) {
      console.error('Error deleting actuals override:', error);
      return { success: false, error: 'Failed to delete actuals override' };
    }
  }

  /**
   * Get overrides for a specific date range
   */
  async getOverridesForRange(
    userId: string,
    startMonth: string,
    endMonth: string
  ): Promise<ActualsOverrideListResult> {
    try {
      const overrides = await this.dataService.getData<StoredActualsOverride[]>(
        `actuals_overrides_${userId}`
      ) || [];

      const filteredOverrides = overrides.filter(o =>
        o.month >= startMonth && o.month <= endMonth
      );

      // Sort by month ascending for range queries
      filteredOverrides.sort((a, b) => a.month.localeCompare(b.month));

      return { success: true, overrides: filteredOverrides };
    } catch (error) {
      console.error('Error getting actuals overrides for range:', error);
      return { success: false, error: 'Failed to get actuals overrides for range' };
    }
  }

  /**
   * Check if a specific month has an override
   */
  async hasOverride(userId: string, month: string): Promise<boolean> {
    try {
      const result = await this.getOverride(userId, month);
      return result.success && !!result.override;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get monthly actuals (either from override or calculated from transactions)
   * This is a helper method that reporting services can use
   */
  async getMonthlyActuals(
    userId: string,
    month: string
  ): Promise<{ hasOverride: boolean; totalIncome: number; totalExpenses: number; notes?: string }> {
    const overrideResult = await this.getOverride(userId, month);

    if (overrideResult.success && overrideResult.override) {
      return {
        hasOverride: true,
        totalIncome: overrideResult.override.totalIncome,
        totalExpenses: overrideResult.override.totalExpenses,
        notes: overrideResult.override.notes
      };
    }

    // No override found - reporting service will need to calculate from transactions
    return {
      hasOverride: false,
      totalIncome: 0,
      totalExpenses: 0
    };
  }

  /**
   * Generate a unique ID for new overrides
   */
  private generateId(): string {
    return `override_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}