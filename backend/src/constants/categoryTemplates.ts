/**
 * Business workspace category seed — Phase 3.1
 *
 * Reserved, well-known category IDs used as statement role anchors (D6).
 * The statement generator resolves roles by walking parentId up to a root in
 * STATEMENT_ROLES, so user-created children of these roots are automatically
 * included in the correct statement bucket.
 *
 * isCustom=false on roots prevents deletion through the normal delete-category
 * flow (which rejects non-custom categories in deleteCategory checks).
 */

import type { Category } from '../shared/types';
import type { WorkspaceType } from '../shared/types';

// ---------------------------------------------------------------------------
// Well-known reserved root IDs
// ---------------------------------------------------------------------------

export const STATEMENT_ROLES = {
  trustInflow: 'BIZ_TRUST_INFLOW',
  remittance:  'BIZ_REMITTANCE',
  billableRoot: 'BIZ_BILLABLE',
  overhead:    'BIZ_OVERHEAD',
  commission:  'BIZ_COMMISSION',
} as const;

export type StatementRole = keyof typeof STATEMENT_ROLES;

export const BILLABLE_SUBTYPES: ReadonlyArray<{ readonly id: string; readonly label: string }> = [
  { id: 'BIZ_BILLABLE_BOOK_REPORT',   label: 'Book Report - data analytics' },
  { id: 'BIZ_BILLABLE_BOOK_PURCHASE', label: 'Book Purchase' },
  { id: 'BIZ_BILLABLE_BOOK_SHIPPING', label: 'Book Shipping' },
] as const;

// ---------------------------------------------------------------------------
// Full seed — matches the trust-ledger taxonomy described in the BRD REQ-008
// ---------------------------------------------------------------------------

export const BUSINESS_CATEGORY_SEED: ReadonlyArray<Category> = [
  // --- Trust royalty inflow (Amazon KDP deposits held in trust) ---
  {
    id: STATEMENT_ROLES.trustInflow,
    name: 'Royalties Held in Trust',
    parentId: null,
    description: 'Amazon KDP royalty deposits held in trust for the client.',
    isCustom: false,
    isHidden: false,
    isRollover: false,
    isIncome: false,
    isSavings: false,
  },

  // --- Client remittance ---
  {
    id: STATEMENT_ROLES.remittance,
    name: 'Client Remittance',
    parentId: null,
    description: 'Funds paid out to the client (pass-through; not an expense).',
    isCustom: false,
    isHidden: false,
    isRollover: false,
    isIncome: false,
    isSavings: false,
  },

  // --- Billable to client (parent) ---
  {
    id: STATEMENT_ROLES.billableRoot,
    name: 'Billable to Client',
    parentId: null,
    description: 'Charges billed to the client, sub-typed by service.',
    isCustom: false,
    isHidden: false,
    isRollover: false,
    isIncome: false,
    isSavings: false,
  },

  // --- Billable sub-types (children of BIZ_BILLABLE) ---
  {
    id: 'BIZ_BILLABLE_BOOK_REPORT',
    name: 'Book Report - data analytics',
    parentId: STATEMENT_ROLES.billableRoot,
    description: 'Monthly book-performance analytics report billed to the client.',
    isCustom: false,
    isHidden: false,
    isRollover: false,
    isIncome: false,
    isSavings: false,
  },
  {
    id: 'BIZ_BILLABLE_BOOK_PURCHASE',
    name: 'Book Purchase',
    parentId: STATEMENT_ROLES.billableRoot,
    description: 'Book copies purchased on behalf of the client.',
    isCustom: false,
    isHidden: false,
    isRollover: false,
    isIncome: false,
    isSavings: false,
  },
  {
    id: 'BIZ_BILLABLE_BOOK_SHIPPING',
    name: 'Book Shipping',
    parentId: STATEMENT_ROLES.billableRoot,
    description: 'Shipping costs for books purchased on behalf of the client.',
    isCustom: false,
    isHidden: false,
    isRollover: false,
    isIncome: false,
    isSavings: false,
  },

  // --- Overhead (OoT expenses not billed to client) ---
  {
    id: STATEMENT_ROLES.overhead,
    name: 'Overhead',
    parentId: null,
    description: 'OoT business expenses (bank fees, subscriptions) absorbed internally.',
    isCustom: false,
    isHidden: false,
    isRollover: false,
    isIncome: false,
    isSavings: false,
  },

  // --- Commission / OoT revenue ---
  {
    id: STATEMENT_ROLES.commission,
    name: 'Commission / Revenue',
    parentId: null,
    description: "OoT's earned commission on Amazon deposits (5% per deposit).",
    isCustom: false,
    isHidden: false,
    isRollover: false,
    isIncome: true,
    isSavings: false,
  },
] as const;

// ---------------------------------------------------------------------------
// Role resolution helpers (Phase 3.3)
// ---------------------------------------------------------------------------

/** All reserved root IDs as a Set for O(1) membership checks */
const RESERVED_ROOT_IDS = new Set<string>(Object.values(STATEMENT_ROLES));

/**
 * Walk the category parentId chain up to a STATEMENT_ROLES root.
 * Returns the matching StatementRole key, or null if the category is not
 * under any reserved root.
 *
 * Example: a user-created child of BIZ_OVERHEAD → returns 'overhead'.
 */
export function resolveStatementRole(
  categoryId: string,
  allCategories: ReadonlyArray<Category>,
): StatementRole | null {
  // Build a lookup map for efficient traversal
  const byId = new Map<string, Category>();
  for (const cat of allCategories) {
    byId.set(cat.id, cat);
  }

  let current: Category | undefined = byId.get(categoryId);
  // Guard against infinite loops from corrupt data (max depth = category tree depth)
  let depth = 0;
  const MAX_DEPTH = 20;

  while (current !== undefined && depth < MAX_DEPTH) {
    if (RESERVED_ROOT_IDS.has(current.id)) {
      // Find which role key maps to this root ID
      for (const [role, rootId] of Object.entries(STATEMENT_ROLES) as [StatementRole, string][]) {
        if (rootId === current.id) {
          return role;
        }
      }
    }
    if (current.parentId === null) break;
    current = byId.get(current.parentId);
    depth++;
  }

  return null;
}

/**
 * If `categoryId` is under BIZ_BILLABLE, return the nearest BILLABLE_SUBTYPES
 * ancestor ID (or the category itself if it IS a subtype).
 *
 * Returns null if the category is not under the billable root.
 */
export function billableSubTypeOf(
  categoryId: string,
  allCategories: ReadonlyArray<Category>,
): string | null {
  const billableSubtypeIds = new Set(BILLABLE_SUBTYPES.map(s => s.id));

  const byId = new Map<string, Category>();
  for (const cat of allCategories) {
    byId.set(cat.id, cat);
  }

  let current: Category | undefined = byId.get(categoryId);
  let depth = 0;
  const MAX_DEPTH = 20;
  // Track the nearest billable subtype ancestor seen while walking up
  let nearestSubtype: string | null = null;

  while (current !== undefined && depth < MAX_DEPTH) {
    if (billableSubtypeIds.has(current.id)) {
      nearestSubtype = current.id;
    }
    if (current.id === STATEMENT_ROLES.billableRoot) {
      // We've reached the billable root — return whatever subtype we found
      return nearestSubtype;
    }
    if (current.parentId === null) break;
    current = byId.get(current.parentId);
    depth++;
  }

  return null;
}

/**
 * Determine if a workspace type should receive a pre-seeded category set.
 * Personal workspaces remain seed-free (D5).
 */
export function shouldSeedCategories(workspaceType: WorkspaceType): boolean {
  return workspaceType === 'business';
}
