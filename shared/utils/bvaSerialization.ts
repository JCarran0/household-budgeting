/**
 * Pure URL-param and localStorage (de)serializers for BvA.
 *
 * Kept separate from the React hooks so backend jest can exercise the parse
 * logic without a DOM or router mock. Invalid payloads fall back to defaults
 * silently per BUDGET-VS-ACTUALS-II-BRD REQ-047.
 */

export const CATEGORY_TYPES = ['spending', 'income', 'savings'] as const;
export type CategoryTypeFilter = typeof CATEGORY_TYPES[number];

export type VarianceFilter = 'all' | 'under' | 'over' | 'serious';

const ALL_TYPES: ReadonlySet<CategoryTypeFilter> = new Set(CATEGORY_TYPES);

/**
 * Parse the URL `types` param. Sentinel 'none' → empty set (REQ-017 empty
 * state). Unrecognized tokens are dropped; an entirely unrecognized payload
 * falls back to "all three selected."
 */
export function parseTypes(raw: string | null): Set<CategoryTypeFilter> {
  if (raw === 'none') return new Set();
  if (!raw) return new Set(ALL_TYPES);
  const tokens = raw.split(',').map(t => t.trim()).filter(Boolean);
  const next = new Set<CategoryTypeFilter>();
  for (const t of tokens) {
    if ((CATEGORY_TYPES as readonly string[]).includes(t)) {
      next.add(t as CategoryTypeFilter);
    }
  }
  if (next.size === 0) return new Set(ALL_TYPES);
  return next;
}

/**
 * Serialize the types set for the URL. `all-three-selected` is represented as
 * the absence of the param (cleaner URLs); empty selection uses the 'none'
 * sentinel to survive reload (REQ-017 empty state requires persistence across
 * a page refresh — otherwise "I chose nothing" silently becomes "I chose
 * everything").
 */
export function serializeTypes(types: Set<CategoryTypeFilter>): string | null {
  if (types.size === 0) return 'none';
  if (typesEqualAll(types)) return null;
  return CATEGORY_TYPES.filter(t => types.has(t)).join(',');
}

export function typesEqualAll(types: Set<CategoryTypeFilter>): boolean {
  if (types.size !== ALL_TYPES.size) return false;
  for (const t of ALL_TYPES) if (!types.has(t)) return false;
  return true;
}

/** Parse the URL `variance` param — default is 'all'. */
export function parseVariance(raw: string | null): VarianceFilter {
  if (raw === 'under' || raw === 'over' || raw === 'serious') return raw;
  return 'all';
}

export function serializeVariance(variance: VarianceFilter): string | null {
  if (variance === 'all') return null;
  return variance;
}

// =============================================================================
// Dismissed-parent ids (localStorage payload)
// =============================================================================

export const DISMISSED_STORAGE_KEY = 'bva2.dismissedParentCategoryIds';

/**
 * Parse the localStorage payload for the dismissed-parent set.
 * Corrupt payloads fall back to an empty set (hook safety invariant).
 */
export function parseDismissedIds(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const next = new Set<string>();
    for (const v of parsed) {
      if (typeof v === 'string') next.add(v);
    }
    return next;
  } catch {
    return new Set();
  }
}

export function serializeDismissedIds(ids: Set<string>): string {
  return JSON.stringify(Array.from(ids));
}
