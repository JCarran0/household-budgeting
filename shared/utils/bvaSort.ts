/**
 * Row ordering for Budget vs. Actuals.
 *
 * The user picks a sort field + direction; BvA then *freezes* that order for
 * the session (see useBvaStableOrder) so advancing the month or editing an
 * amount never reshuffles rows underneath the reader. The comparators here are
 * the "fresh" order — what the list would look like if it were re-sorted right
 * now — and are used both to produce a new order and to detect that the frozen
 * order has drifted away from it.
 *
 * Pure + type-agnostic: parents and children both project onto BvaSortableRow.
 */

export const BVA_SORT_FIELDS = [
  'absoluteGap',
  'actual',
  'budgeted',
  'rollover',
  'available',
  'name',
] as const;

export type BvaSortField = typeof BVA_SORT_FIELDS[number];
export type BvaSortDirection = 'asc' | 'desc';

export const DEFAULT_BVA_SORT_FIELD: BvaSortField = 'absoluteGap';
export const DEFAULT_BVA_SORT_DIRECTION: BvaSortDirection = 'desc';

export const BVA_SORT_LABEL: Record<BvaSortField, string> = {
  absoluteGap: 'Available (absolute gap)',
  actual: 'Actual',
  budgeted: 'Budgeted',
  rollover: 'Rollover',
  available: 'Available',
  name: 'Category name',
};

/** The projection every sortable BvA row (parent or child) supports. */
export interface BvaSortableRow {
  name: string;
  actual: number;
  budgeted: number;
  /** null = not a rollover category. Nulls always sort last. */
  rollover: number | null;
  available: number;
}

/**
 * Numeric key for a field, or null when the row has no value for it.
 * 'absoluteGap' is the historical default: largest |Available| first, i.e.
 * "where is the plan most wrong", irrespective of which way it's wrong.
 */
function numericKey(row: BvaSortableRow, field: BvaSortField): number | null {
  switch (field) {
    case 'absoluteGap':
      return Math.abs(row.available);
    case 'actual':
      return row.actual;
    case 'budgeted':
      return row.budgeted;
    case 'available':
      return row.available;
    case 'rollover':
      return row.rollover;
    case 'name':
      return null;
  }
}

/**
 * Compare two rows under the given field/direction.
 *
 * Rows with no value for the field (only Rollover today) sink to the bottom in
 * BOTH directions — a category that doesn't roll over isn't "the smallest
 * rollover", it has none, and burying it keeps the top of an ascending
 * Rollover sort meaningful.
 *
 * Ties always break on name ascending so the order is total and stable.
 */
export function compareBvaRows(
  a: BvaSortableRow,
  b: BvaSortableRow,
  field: BvaSortField,
  direction: BvaSortDirection,
): number {
  if (field === 'name') {
    const byName = a.name.localeCompare(b.name);
    return direction === 'asc' ? byName : -byName;
  }

  const aKey = numericKey(a, field);
  const bKey = numericKey(b, field);

  if (aKey === null && bKey === null) return a.name.localeCompare(b.name);
  if (aKey === null) return 1;
  if (bKey === null) return -1;

  if (aKey !== bKey) return direction === 'asc' ? aKey - bKey : bKey - aKey;
  return a.name.localeCompare(b.name);
}

/** Convenience: a comparator bound to a field/direction for `Array.sort`. */
export function bvaComparator<T>(
  project: (item: T) => BvaSortableRow,
  field: BvaSortField,
  direction: BvaSortDirection,
): (a: T, b: T) => number {
  return (a, b) => compareBvaRows(project(a), project(b), field, direction);
}

export function parseBvaSortField(raw: string | null): BvaSortField {
  if (raw && (BVA_SORT_FIELDS as readonly string[]).includes(raw)) {
    return raw as BvaSortField;
  }
  return DEFAULT_BVA_SORT_FIELD;
}

export function serializeBvaSortField(field: BvaSortField): string | null {
  return field === DEFAULT_BVA_SORT_FIELD ? null : field;
}

export function parseBvaSortDirection(raw: string | null): BvaSortDirection {
  return raw === 'asc' ? 'asc' : 'desc';
}

export function serializeBvaSortDirection(direction: BvaSortDirection): string | null {
  return direction === DEFAULT_BVA_SORT_DIRECTION ? null : direction;
}
