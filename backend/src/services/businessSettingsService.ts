/**
 * BusinessSettingsService — Per-workspace business settings storage.
 *
 * Persists the statement header (business name/address, client name/company/
 * address) for a business workspace so generated statements can snapshot
 * the real identity of the client and the business.
 *
 * Storage key: `business_settings_{familyId}` — one record per workspace.
 *
 * Shape:
 *   { header: StatementHeader }
 *
 * If no settings have been saved yet, all five StatementHeader fields are
 * returned as empty strings — identical to the blank placeholder the statement
 * generator used before this service existed.
 */

import type { DataService } from './dataService';
import type { StatementHeader } from '../shared/types';
import { DEFAULT_STATEMENT_NOTES } from '../shared/utils/businessStatementCalc';
import { childLogger } from '../utils/logger';

const log = childLogger('businessSettingsService');

// ---------------------------------------------------------------------------
// Stored shape
// ---------------------------------------------------------------------------

export interface BusinessSettings {
  header: StatementHeader;
}

// The blank default used when no settings record exists yet. Notes default to
// the standard footer so a fresh workspace's first statement isn't footer-less.
const BLANK_HEADER: StatementHeader = {
  businessName: '',
  businessAddress: '',
  clientName: '',
  clientCompany: '',
  clientAddress: '',
  notes: DEFAULT_STATEMENT_NOTES,
};

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class BusinessSettingsService {
  constructor(private readonly dataService: DataService) {}

  /**
   * Load the stored header for this workspace.
   * Returns a record with all five fields set to empty strings when no settings
   * have been saved yet (matches the prior blank-placeholder behaviour).
   */
  async getSettings(familyId: string): Promise<BusinessSettings> {
    const key = this.storageKey(familyId);
    const stored = await this.dataService.getData<BusinessSettings>(key);
    if (!stored) {
      return { header: { ...BLANK_HEADER } };
    }
    // Default notes for legacy headers saved before footer notes existed, so
    // generation snapshots the standard footer. An explicit '' (cleared by the
    // user) is preserved — only an absent (undefined) value gets the default.
    return {
      ...stored,
      header: {
        ...stored.header,
        notes: stored.header.notes ?? DEFAULT_STATEMENT_NOTES,
      },
    };
  }

  /**
   * Persist the header for this workspace. Replaces any existing record
   * (no merge — caller supplies the full StatementHeader each time).
   */
  async saveSettings(
    familyId: string,
    settings: BusinessSettings,
  ): Promise<BusinessSettings> {
    const key = this.storageKey(familyId);
    await this.dataService.saveData(key, settings);
    log.info({ familyId }, 'business settings saved');
    return settings;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private storageKey(familyId: string): string {
    return `business_settings_${familyId}`;
  }
}
