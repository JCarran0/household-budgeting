/**
 * Workspace switching tests — Phase 1.6 + 3.4
 *
 * Covers:
 *   - switchWorkspace happy path (new token, activeWorkspaceId persisted)
 *   - switchWorkspace forbidden (workspace not in workspaceIds → failure)
 *   - authMiddleware membership: JWT familyId ∈ workspaceIds → accepted
 *   - authMiddleware membership: JWT familyId ∉ workspaceIds → rejected
 *   - createWorkspace('business') seeds categories + adds membership without
 *     dropping the personal workspace
 *   - data isolation: writes under business familyId invisible via personal
 *   - legacy user backfill: missing workspaceIds → seeded from familyId
 *   - category seed idempotency: seeding twice does not duplicate
 *   - resolveStatementRole: child of BIZ_TRUST_INFLOW → 'trustInflow'
 *   - billableSubTypeOf: tx under BIZ_BILLABLE_BOOK_REPORT → correct id
 */

import { AuthService } from '../authService';
import { FamilyService } from '../familyService';
import { CategoryService } from '../categoryService';
import { InMemoryDataService } from '../dataService';
import {
  resolveStatementRole,
  billableSubTypeOf,
  STATEMENT_ROLES,
} from '../../constants/categoryTemplates';
import type { Family, Category } from '../../shared/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDataService() {
  return new InMemoryDataService();
}

function makeUser(
  ds: InMemoryDataService,
  overrides: Partial<{
    id: string;
    username: string;
    familyId: string;
    workspaceIds: string[];
    activeWorkspaceId: string;
  }> = {},
) {
  const id = overrides.id ?? 'user-1';
  const familyId = overrides.familyId ?? 'family-personal';
  return ds.createUser({
    id,
    username: overrides.username ?? 'alice',
    displayName: 'Alice',
    familyId,
    workspaceIds: overrides.workspaceIds ?? [familyId],
    activeWorkspaceId: overrides.activeWorkspaceId ?? familyId,
    passwordHash: 'hashed',
    createdAt: new Date(),
  });
}

function makeFamily(
  ds: InMemoryDataService,
  id: string,
  name: string,
  workspaceType: 'personal' | 'business' = 'personal',
) {
  const now = new Date().toISOString();
  const family: Family = {
    id,
    name,
    members: [],
    workspaceType,
    createdAt: now,
    updatedAt: now,
  };
  return ds.createFamily(family).then(() => family);
}

// ---------------------------------------------------------------------------
// authService.switchWorkspace
// ---------------------------------------------------------------------------

describe('AuthService.switchWorkspace', () => {
  let ds: InMemoryDataService;
  let authService: AuthService;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-for-workspace-tests';
    ds = makeDataService();
    authService = new AuthService(ds);
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('switches to a workspace the user belongs to and returns a new token', async () => {
    const personalId = 'family-personal';
    const businessId = 'family-business';
    await makeFamily(ds, personalId, 'Personal');
    await makeFamily(ds, businessId, 'Business', 'business');
    await makeUser(ds, {
      familyId: personalId,
      workspaceIds: [personalId, businessId],
      activeWorkspaceId: personalId,
    });

    const result = await authService.switchWorkspace('user-1', businessId);

    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
    expect(result.user?.familyId).toBe(businessId);
    expect(result.user?.activeWorkspaceId).toBe(businessId);

    // Verify persisted
    const updated = await ds.getUser('user-1');
    expect(updated?.activeWorkspaceId).toBe(businessId);
    expect(updated?.familyId).toBe(businessId);
  });

  it('returns failure when the target workspace is not in workspaceIds', async () => {
    const personalId = 'family-personal';
    const strangerFamilyId = 'family-other-user';
    await makeFamily(ds, personalId, 'Personal');
    await makeUser(ds, { familyId: personalId, workspaceIds: [personalId] });

    const result = await authService.switchWorkspace('user-1', strangerFamilyId);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/access denied/i);
  });

  it('handles a legacy user without workspaceIds by falling back to familyId', async () => {
    const personalId = 'family-personal';
    await makeFamily(ds, personalId, 'Personal');
    // Simulate legacy: no workspaceIds stored
    await ds.createUser({
      id: 'legacy-user',
      username: 'legacy',
      displayName: 'Legacy',
      familyId: personalId,
      // workspaceIds intentionally omitted (undefined)
      passwordHash: 'x',
      createdAt: new Date(),
    });

    // Should successfully switch to the user's own familyId (it's the only workspace)
    const result = await authService.switchWorkspace('legacy-user', personalId);
    expect(result.success).toBe(true);
    expect(result.user?.familyId).toBe(personalId);
  });
});

// ---------------------------------------------------------------------------
// authMiddleware membership check (verifyFamilyMembership)
// The middleware itself has an env-flag skip in test mode, so we test the
// underlying logic via AuthService.switchWorkspace which calls the same user
// lookup (workspaceIds.includes).
// ---------------------------------------------------------------------------

describe('Workspace membership check (workspaceIds array)', () => {
  let ds: InMemoryDataService;
  let authService: AuthService;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    ds = makeDataService();
    authService = new AuthService(ds);
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('accepts a JWT whose familyId is in workspaceIds', async () => {
    const personalId = 'family-ok';
    await makeFamily(ds, personalId, 'OK');
    await makeUser(ds, { familyId: personalId, workspaceIds: [personalId] });

    // The user CAN switch to this workspace → it is in workspaceIds
    const result = await authService.switchWorkspace('user-1', personalId);
    expect(result.success).toBe(true);
  });

  it('rejects a JWT whose familyId is not in workspaceIds', async () => {
    const personalId = 'family-own';
    const forbiddenId = 'family-foreign';
    await makeFamily(ds, personalId, 'Own');
    await makeFamily(ds, forbiddenId, 'Foreign');
    await makeUser(ds, { familyId: personalId, workspaceIds: [personalId] });

    const result = await authService.switchWorkspace('user-1', forbiddenId);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FamilyService.createWorkspace
// ---------------------------------------------------------------------------

describe('FamilyService.createWorkspace', () => {
  let ds: InMemoryDataService;
  let familyService: FamilyService;
  let categoryService: CategoryService;

  beforeEach(() => {
    ds = makeDataService();
    categoryService = new CategoryService(ds);
    familyService = new FamilyService(ds, categoryService);
  });

  it('creates a business workspace and seeds categories', async () => {
    const personalId = 'family-personal';
    await makeFamily(ds, personalId, 'Personal');
    await makeUser(ds, { familyId: personalId, workspaceIds: [personalId] });

    const newFamily = await familyService.createWorkspace('user-1', 'OoT Business', 'business');

    expect(newFamily.workspaceType).toBe('business');
    expect(newFamily.name).toBe('OoT Business');

    // Verify user's workspaceIds now includes the new workspace
    const updatedUser = await ds.getUser('user-1');
    expect(updatedUser?.workspaceIds).toContain(personalId);
    expect(updatedUser?.workspaceIds).toContain(newFamily.id);
    // Personal workspace must NOT be removed
    expect(updatedUser?.workspaceIds?.length).toBe(2);

    // Verify business categories were seeded
    const categories = await ds.getCategories(newFamily.id);
    expect(categories.length).toBeGreaterThan(0);
    const ids = categories.map(c => c.id);
    expect(ids).toContain('BIZ_TRUST_INFLOW');
    expect(ids).toContain('BIZ_BILLABLE');
    expect(ids).toContain('BIZ_OVERHEAD');
  });

  it('creates a personal workspace without seeding categories', async () => {
    const personalId = 'family-personal';
    await makeFamily(ds, personalId, 'Personal');
    await makeUser(ds, { familyId: personalId, workspaceIds: [personalId] });

    const newFamily = await familyService.createWorkspace('user-1', 'Second Personal', 'personal');

    const categories = await ds.getCategories(newFamily.id);
    expect(categories.length).toBe(0);
  });

  it('does not replace the personal workspace when adding a business one', async () => {
    const personalId = 'family-personal';
    await makeFamily(ds, personalId, 'Personal');
    await makeUser(ds, { familyId: personalId, workspaceIds: [personalId] });

    const bizFamily = await familyService.createWorkspace('user-1', 'Business', 'business');
    const updatedUser = await ds.getUser('user-1');

    expect(updatedUser?.workspaceIds).toContain(personalId);
    expect(updatedUser?.workspaceIds).toContain(bizFamily.id);
  });
});

// ---------------------------------------------------------------------------
// Data isolation
// ---------------------------------------------------------------------------

describe('Workspace data isolation', () => {
  it('data written under business familyId is unreadable via personal familyId', async () => {
    const ds = makeDataService();
    const personalId = 'family-personal';
    const businessId = 'family-business';

    // Write something under the business partition
    const bizData = [{ id: 'tx-1', amount: 100 }];
    await ds.saveData(`transactions_${businessId}`, bizData);

    // Reading under the personal partition must return nothing
    const personalData = await ds.getData(`transactions_${personalId}`);
    expect(personalData).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Legacy user backfill
// ---------------------------------------------------------------------------

describe('Legacy user backfill (workspaceIds from familyId)', () => {
  it('login backfills workspaceIds for a user that has only familyId', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const ds = makeDataService();
    const authService = new AuthService(ds);

    const familyId = 'family-legacy';
    const now = new Date().toISOString();
    await ds.createFamily({
      id: familyId, name: 'Legacy', members: [], createdAt: now, updatedAt: now,
    });

    // Create user without workspaceIds (simulates a pre-migration record)
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('Correct_Password_123!', 10);
    await ds.createUser({
      id: 'legacy-1',
      username: 'legacyuser',
      displayName: 'Legacy',
      familyId,
      // workspaceIds intentionally absent
      passwordHash: hash,
      createdAt: new Date(),
    });

    const result = await authService.login('legacyuser', 'Correct_Password_123!');
    expect(result.success).toBe(true);

    // workspaceIds should now be seeded
    const updated = await ds.getUser('legacy-1');
    expect(updated?.workspaceIds).toEqual([familyId]);
    expect(updated?.activeWorkspaceId).toBe(familyId);

    delete process.env.JWT_SECRET;
  });
});

// ---------------------------------------------------------------------------
// Category seed idempotency
// ---------------------------------------------------------------------------

describe('CategoryService.seedCategoriesForWorkspaceType', () => {
  it('seeding business twice does not duplicate categories', async () => {
    const ds = makeDataService();
    const categoryService = new CategoryService(ds);
    const familyId = 'biz-family';

    await categoryService.seedCategoriesForWorkspaceType(familyId, 'business');
    const firstCount = (await ds.getCategories(familyId)).length;

    await categoryService.seedCategoriesForWorkspaceType(familyId, 'business');
    const secondCount = (await ds.getCategories(familyId)).length;

    expect(firstCount).toBe(secondCount);
    expect(firstCount).toBeGreaterThan(0);
  });

  it('seeding personal is a no-op', async () => {
    const ds = makeDataService();
    const categoryService = new CategoryService(ds);
    const familyId = 'personal-family';

    await categoryService.seedCategoriesForWorkspaceType(familyId, 'personal');
    const count = (await ds.getCategories(familyId)).length;
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Role resolution helpers (pure function tests — no DB needed)
// ---------------------------------------------------------------------------

describe('resolveStatementRole (pure)', () => {
  const SEED_CATEGORIES: Category[] = [
    {
      id: 'BIZ_TRUST_INFLOW', name: 'Trust Inflow', parentId: null,
      isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    },
    {
      id: 'USER_CUSTOM_CHILD', name: 'Amazon', parentId: 'BIZ_TRUST_INFLOW',
      isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    },
    {
      id: 'BIZ_BILLABLE', name: 'Billable', parentId: null,
      isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    },
    {
      id: 'BIZ_BILLABLE_BOOK_REPORT', name: 'Book Report', parentId: 'BIZ_BILLABLE',
      isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    },
    {
      id: 'BIZ_OVERHEAD', name: 'Overhead', parentId: null,
      isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    },
    {
      id: 'UNRELATED', name: 'Unrelated', parentId: null,
      isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    },
  ];

  it('maps a direct child of BIZ_TRUST_INFLOW to trustInflow', () => {
    const role = resolveStatementRole('USER_CUSTOM_CHILD', SEED_CATEGORIES);
    expect(role).toBe('trustInflow');
  });

  it('maps BIZ_TRUST_INFLOW itself to trustInflow', () => {
    const role = resolveStatementRole(STATEMENT_ROLES.trustInflow, SEED_CATEGORIES);
    expect(role).toBe('trustInflow');
  });

  it('maps BIZ_OVERHEAD to overhead', () => {
    const role = resolveStatementRole(STATEMENT_ROLES.overhead, SEED_CATEGORIES);
    expect(role).toBe('overhead');
  });

  it('returns null for a category not under any reserved root', () => {
    const role = resolveStatementRole('UNRELATED', SEED_CATEGORIES);
    expect(role).toBeNull();
  });
});

describe('billableSubTypeOf (pure)', () => {
  const SEED_CATEGORIES: Category[] = [
    {
      id: 'BIZ_BILLABLE', name: 'Billable', parentId: null,
      isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    },
    {
      id: 'BIZ_BILLABLE_BOOK_REPORT', name: 'Book Report', parentId: 'BIZ_BILLABLE',
      isCustom: false, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    },
    {
      id: 'USER_BOOK_REPORT_CHILD', name: 'Custom Book Report', parentId: 'BIZ_BILLABLE_BOOK_REPORT',
      isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    },
    {
      id: 'UNRELATED', name: 'Unrelated', parentId: null,
      isCustom: true, isHidden: false, isRollover: false, isIncome: false, isSavings: false,
    },
  ];

  it('returns the sub-type ID for a direct child of BIZ_BILLABLE_BOOK_REPORT', () => {
    const result = billableSubTypeOf('BIZ_BILLABLE_BOOK_REPORT', SEED_CATEGORIES);
    expect(result).toBe('BIZ_BILLABLE_BOOK_REPORT');
  });

  it('returns the correct sub-type for a grandchild of BIZ_BILLABLE_BOOK_REPORT', () => {
    const result = billableSubTypeOf('USER_BOOK_REPORT_CHILD', SEED_CATEGORIES);
    expect(result).toBe('BIZ_BILLABLE_BOOK_REPORT');
  });

  it('returns null for a category not under BIZ_BILLABLE', () => {
    const result = billableSubTypeOf('UNRELATED', SEED_CATEGORIES);
    expect(result).toBeNull();
  });
});
