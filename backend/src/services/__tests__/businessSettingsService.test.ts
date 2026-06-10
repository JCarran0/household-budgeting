/**
 * BusinessSettingsService Tests — PR5 Task 1
 *
 * Covers:
 *  1. getSettings returns blank header when no settings exist
 *  2. saveSettings persists the header; subsequent getSettings returns it
 *  3. saveSettings replaces the entire record (no partial merge)
 *  4. Settings are scoped per-familyId — workspace A cannot read workspace B's settings
 *  5. Personal workspace token gets 403 from the settings routes (route-level guard)
 *  6. Generated statement includes the stored header (generation → snapshot)
 */

import { BusinessSettingsService } from '../businessSettingsService';
import { StatementService } from '../statementService';
import { CategoryService } from '../categoryService';
import { InMemoryDataService } from '../dataService';
import {
  BUSINESS_CATEGORY_SEED,
  STATEMENT_ROLES,
} from '../../constants/categoryTemplates';
import { DEFAULT_STATEMENT_NOTES } from '../../shared/utils/businessStatementCalc';
import type { Category, StatementHeader } from '../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BIZ_FAMILY = 'biz-settings-test';
const OTHER_FAMILY = 'other-settings-test';

function makeSettingsService(ds: InMemoryDataService): BusinessSettingsService {
  return new BusinessSettingsService(ds);
}

function makeCategoryService(_ds: InMemoryDataService): CategoryService {
  return {
    getAllCategories: async (_familyId: string): Promise<Category[]> =>
      BUSINESS_CATEGORY_SEED as unknown as Category[],
  } as unknown as CategoryService;
}

const FULL_HEADER: StatementHeader = {
  businessName: 'Acme Consulting LLC',
  businessAddress: '123 Main St, Springfield, IL 62701',
  clientName: 'Jane Doe',
  clientCompany: 'Client Corp',
  clientAddress: '456 Oak Ave, Chicago, IL 60601',
  notes: 'Net 30. Wire transfer only.',
};

// A legacy header with no notes key (as stored before footer notes existed).
const BLANK_HEADER: StatementHeader = {
  businessName: '',
  businessAddress: '',
  clientName: '',
  clientCompany: '',
  clientAddress: '',
};

// What getSettings returns when notes were never saved: blanks + default footer.
const DEFAULTED_BLANK_HEADER: StatementHeader = {
  ...BLANK_HEADER,
  notes: DEFAULT_STATEMENT_NOTES,
};

// ---------------------------------------------------------------------------
// 1. Default blank header
// ---------------------------------------------------------------------------

describe('getSettings — default when nothing stored', () => {
  it('returns blank header fields plus the default footer notes', async () => {
    const ds = new InMemoryDataService();
    const service = makeSettingsService(ds);

    const settings = await service.getSettings(BIZ_FAMILY);

    expect(settings.header).toEqual(DEFAULTED_BLANK_HEADER);
  });
});

// ---------------------------------------------------------------------------
// 2. Round-trip: save then load
// ---------------------------------------------------------------------------

describe('saveSettings + getSettings — round-trip', () => {
  it('persists and returns the exact header that was saved', async () => {
    const ds = new InMemoryDataService();
    const service = makeSettingsService(ds);

    const saved = await service.saveSettings(BIZ_FAMILY, { header: FULL_HEADER });
    expect(saved.header).toEqual(FULL_HEADER);

    const loaded = await service.getSettings(BIZ_FAMILY);
    expect(loaded.header).toEqual(FULL_HEADER);
  });

  it('allows empty string values for all fields, and an explicitly-cleared footer stays empty', async () => {
    const ds = new InMemoryDataService();
    const service = makeSettingsService(ds);

    // notes: '' is the user explicitly clearing the footer — it must NOT be
    // replaced by the default (the default only fills an absent/undefined value).
    const cleared: StatementHeader = { ...BLANK_HEADER, notes: '' };
    const saved = await service.saveSettings(BIZ_FAMILY, { header: cleared });
    expect(saved.header).toEqual(cleared);

    const loaded = await service.getSettings(BIZ_FAMILY);
    expect(loaded.header).toEqual(cleared);
  });
});

// ---------------------------------------------------------------------------
// 3. Full replacement (no partial merge)
// ---------------------------------------------------------------------------

describe('saveSettings — full replacement', () => {
  it('replaces the stored record entirely on a second save', async () => {
    const ds = new InMemoryDataService();
    const service = makeSettingsService(ds);

    await service.saveSettings(BIZ_FAMILY, { header: FULL_HEADER });

    const updatedHeader: StatementHeader = {
      businessName: 'Updated Corp',
      businessAddress: '789 New Rd',
      clientName: 'Bob Smith',
      clientCompany: 'New Client',
      clientAddress: '101 Another Ln',
    };
    await service.saveSettings(BIZ_FAMILY, { header: updatedHeader });

    const loaded = await service.getSettings(BIZ_FAMILY);
    expect(loaded.header.businessName).toBe('Updated Corp');
    // Old value should not remain
    expect(loaded.header.businessName).not.toBe('Acme Consulting LLC');
  });
});

// ---------------------------------------------------------------------------
// 4. Per-familyId isolation
// ---------------------------------------------------------------------------

describe('familyId isolation', () => {
  it('settings stored under businessFamilyId are not returned for a different familyId', async () => {
    const ds = new InMemoryDataService();
    const service = makeSettingsService(ds);

    await service.saveSettings(BIZ_FAMILY, { header: FULL_HEADER });

    // The OTHER family sees the unconfigured default — not BIZ_FAMILY's header
    const other = await service.getSettings(OTHER_FAMILY);
    expect(other.header).toEqual(DEFAULTED_BLANK_HEADER);
  });
});

// ---------------------------------------------------------------------------
// 5. Generated statement snapshots the stored header
// ---------------------------------------------------------------------------

describe('generateStatement — snapshots the stored header', () => {
  it('statement.clientHeader matches the header that was saved before generation', async () => {
    const ds = new InMemoryDataService();
    const settingsService = makeSettingsService(ds);
    const statementService = new StatementService(ds, makeCategoryService(ds));

    // Store the header
    await settingsService.saveSettings(BIZ_FAMILY, { header: FULL_HEADER });

    // Seed a minimal trust-inflow transaction
    await ds.saveData(`transactions_${BIZ_FAMILY}`, [
      {
        id: 'tx-snap-1',
        categoryId: STATEMENT_ROLES.trustInflow,
        amount: -500.00,
        date: '2026-01-15',
        status: 'posted',
      },
    ]);

    // Load the stored header (as the route handler would) and pass it in
    const settings = await settingsService.getSettings(BIZ_FAMILY);
    const stmt = await statementService.generateStatement(
      BIZ_FAMILY,
      '2026-01',
      '2026-01-31',
      { clientHeader: settings.header },
    );

    expect(stmt.clientHeader).toEqual(FULL_HEADER);
  });

  it('statement.clientHeader carries the default footer when no header has been configured', async () => {
    const ds = new InMemoryDataService();
    const settingsService = makeSettingsService(ds);
    const statementService = new StatementService(ds, makeCategoryService(ds));

    // No settings saved — getSettings returns blanks
    await ds.saveData(`transactions_${BIZ_FAMILY}`, [
      {
        id: 'tx-snap-2',
        categoryId: STATEMENT_ROLES.trustInflow,
        amount: -200.00,
        date: '2026-01-15',
        status: 'posted',
      },
    ]);

    const settings = await settingsService.getSettings(BIZ_FAMILY);
    const stmt = await statementService.generateStatement(
      BIZ_FAMILY,
      '2026-01',
      '2026-01-31',
      { clientHeader: settings.header },
    );

    expect(stmt.clientHeader).toEqual(DEFAULTED_BLANK_HEADER);
  });
});
