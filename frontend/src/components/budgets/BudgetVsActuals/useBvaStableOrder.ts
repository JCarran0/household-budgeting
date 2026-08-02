import { useMemo, useRef } from 'react';
import type { BvaChildRow, BvaParentRow } from '../../../../../shared/utils/bvaDataComposition';
import { SECTION_ORDER, type SectionType } from '../../../../../shared/utils/bvaDisplay';
import {
  bvaComparator,
  type BvaSortDirection,
  type BvaSortField,
  type BvaSortableRow,
} from '../../../../../shared/utils/bvaSort';
import type { FilteredParent } from './BvaSectionTable';

/**
 * Frozen row ordering for BvA.
 *
 * The order is recomputed ONLY when the user changes the sort field/direction
 * or hits Re-sort (`orderNonce`). Changing month, editing an amount, or
 * toggling a filter leaves every row in the slot it already occupied — rows
 * jumping around while you page through months is the jarring behavior this
 * exists to prevent.
 *
 * Rows that appear after the order was frozen (a category that just gained a
 * budget, or one revealed by relaxing a filter) are appended at the end in
 * fresh-sort order rather than being woven in — weaving would move existing
 * rows, which is exactly what the freeze forbids.
 *
 * `stale` reports whether the frozen order still matches a fresh sort. It
 * drives the Re-sort affordance: no drift, nothing to re-sort, no button.
 */

export interface UseBvaStableOrderInput {
  /** Filter-passing parents bucketed by section, in any order. */
  buckets: Record<SectionType, FilteredParent[]>;
  field: BvaSortField;
  direction: BvaSortDirection;
  /**
   * Bumped by Re-sort (and the page's Refresh button) to thaw the order.
   * Any change to this value re-sorts everything from scratch.
   */
  orderNonce: number;
}

export interface UseBvaStableOrderResult {
  /** Same parents, ordered — with each parent's children ordered too. */
  buckets: Record<SectionType, FilteredParent[]>;
  /** True when a fresh sort would move at least one row. */
  stale: boolean;
}

interface OrderCache {
  key: string;
  /** Parent ids per section, in frozen order. */
  parentOrders: Record<SectionType, string[]>;
  /** Child category ids per parent id, in frozen order. */
  childOrders: Map<string, string[]>;
}

function emptyCache(key: string): OrderCache {
  return {
    key,
    parentOrders: { income: [], spending: [], savings: [] },
    childOrders: new Map(),
  };
}

const parentRow = (fp: FilteredParent): BvaSortableRow => ({
  name: fp.parent.parentName,
  actual: fp.parent.actual,
  budgeted: fp.parent.budgeted,
  rollover: fp.parent.rollover,
  available: fp.parent.available,
});

const childRow = (c: BvaChildRow): BvaSortableRow => ({
  name: c.categoryName,
  actual: c.actual,
  budgeted: c.budgeted,
  rollover: c.rollover,
  available: c.available,
});

/**
 * Reorder `items` to match `order`, appending unknown items at the end sorted
 * by `compare`. Items in `order` that are no longer present simply drop out.
 */
function applyFrozenOrder<T>(
  items: T[],
  idOf: (item: T) => string,
  order: string[],
  compare: (a: T, b: T) => number,
): T[] {
  const slot = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const aSlot = slot.get(idOf(a));
    const bSlot = slot.get(idOf(b));
    if (aSlot !== undefined && bSlot !== undefined) return aSlot - bSlot;
    if (aSlot !== undefined) return -1;
    if (bSlot !== undefined) return 1;
    return compare(a, b);
  });
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function useBvaStableOrder({
  buckets,
  field,
  direction,
  orderNonce,
}: UseBvaStableOrderInput): UseBvaStableOrderResult {
  const cache = useRef<OrderCache>(emptyCache(''));

  return useMemo(() => {
    const key = `${field}|${direction}|${orderNonce}`;
    const thawed = cache.current.key !== key;
    if (thawed) cache.current = emptyCache(key);

    const compareParents = bvaComparator(parentRow, field, direction);
    const compareChildren = bvaComparator(childRow, field, direction);

    const ordered: Record<SectionType, FilteredParent[]> = {
      income: [],
      spending: [],
      savings: [],
    };
    let stale = false;

    for (const section of SECTION_ORDER) {
      const rows = buckets[section];
      const fresh = [...rows].sort(compareParents);
      const applied = thawed
        ? fresh
        : applyFrozenOrder(rows, fp => fp.parent.parentId, cache.current.parentOrders[section], compareParents);

      const appliedIds = applied.map(fp => fp.parent.parentId);
      if (!thawed && !sameIds(appliedIds, fresh.map(fp => fp.parent.parentId))) stale = true;
      cache.current.parentOrders[section] = appliedIds;

      ordered[section] = applied.map(fp => {
        const freshChildren = [...fp.parent.children].sort(compareChildren);
        const frozen = cache.current.childOrders.get(fp.parent.parentId);
        const appliedChildren = frozen
          ? applyFrozenOrder(fp.parent.children, c => c.categoryId, frozen, compareChildren)
          : freshChildren;

        const appliedChildIds = appliedChildren.map(c => c.categoryId);
        if (frozen && !sameIds(appliedChildIds, freshChildren.map(c => c.categoryId))) stale = true;
        cache.current.childOrders.set(fp.parent.parentId, appliedChildIds);

        const parent: BvaParentRow = { ...fp.parent, children: appliedChildren };
        return { ...fp, parent };
      });
    }

    return { buckets: ordered, stale };
  }, [buckets, field, direction, orderNonce]);
}
