import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { BvaChildRow, BvaParentRow } from '../../../../../shared/utils/bvaDataComposition';
import type { SectionType } from '../../../../../shared/utils/bvaDisplay';
import { useBvaStableOrder } from './useBvaStableOrder';
import type { FilteredParent } from './BvaSectionTable';

function child(
  categoryId: string,
  categoryName: string,
  values: Partial<BvaChildRow> = {},
): BvaChildRow {
  return {
    categoryId,
    categoryName,
    actual: values.actual ?? 0,
    budgeted: values.budgeted ?? 0,
    rollover: values.rollover ?? null,
    available: values.available ?? 0,
    isRollover: values.isRollover ?? false,
  };
}

function parent(
  parentId: string,
  parentName: string,
  values: Partial<BvaParentRow> = {},
): FilteredParent {
  const row: BvaParentRow = {
    parentId,
    parentName,
    section: values.section ?? 'spending',
    actual: values.actual ?? 0,
    budgeted: values.budgeted ?? 0,
    rollover: values.rollover ?? null,
    available: values.available ?? 0,
    children: values.children ?? [],
  };
  return { parent: row, deEmphasizedChildIds: new Set() };
}

function buckets(spending: FilteredParent[]): Record<SectionType, FilteredParent[]> {
  return { income: [], spending, savings: [] };
}

const ids = (rows: FilteredParent[]) => rows.map(r => r.parent.parentId);

describe('useBvaStableOrder', () => {
  it('sorts fresh on first render by the chosen field', () => {
    const { result } = renderHook(() =>
      useBvaStableOrder({
        buckets: buckets([
          parent('a', 'A', { budgeted: 100 }),
          parent('b', 'B', { budgeted: 300 }),
          parent('c', 'C', { budgeted: 200 }),
        ]),
        field: 'budgeted',
        direction: 'desc',
        orderNonce: 0,
      }),
    );
    expect(ids(result.current.buckets.spending)).toEqual(['b', 'c', 'a']);
    expect(result.current.stale).toBe(false);
  });

  it('keeps the frozen order when the numbers change (e.g. month advanced)', () => {
    const { result, rerender } = renderHook(
      (props: { rows: FilteredParent[] }) =>
        useBvaStableOrder({
          buckets: buckets(props.rows),
          field: 'budgeted',
          direction: 'desc',
          orderNonce: 0,
        }),
      {
        initialProps: {
          rows: [
            parent('a', 'A', { budgeted: 100 }),
            parent('b', 'B', { budgeted: 300 }),
            parent('c', 'C', { budgeted: 200 }),
          ],
        },
      },
    );
    expect(ids(result.current.buckets.spending)).toEqual(['b', 'c', 'a']);

    // Next month: A is now the largest budget. Order must NOT move.
    rerender({
      rows: [
        parent('a', 'A', { budgeted: 900 }),
        parent('b', 'B', { budgeted: 300 }),
        parent('c', 'C', { budgeted: 200 }),
      ],
    });
    expect(ids(result.current.buckets.spending)).toEqual(['b', 'c', 'a']);
    expect(result.current.stale).toBe(true);
  });

  it('re-sorts when orderNonce is bumped, clearing stale', () => {
    const { result, rerender } = renderHook(
      (props: { rows: FilteredParent[]; nonce: number }) =>
        useBvaStableOrder({
          buckets: buckets(props.rows),
          field: 'budgeted',
          direction: 'desc',
          orderNonce: props.nonce,
        }),
      {
        initialProps: {
          rows: [
            parent('a', 'A', { budgeted: 100 }),
            parent('b', 'B', { budgeted: 300 }),
          ],
          nonce: 0,
        },
      },
    );
    rerender({
      rows: [
        parent('a', 'A', { budgeted: 900 }),
        parent('b', 'B', { budgeted: 300 }),
      ],
      nonce: 0,
    });
    expect(result.current.stale).toBe(true);

    rerender({
      rows: [
        parent('a', 'A', { budgeted: 900 }),
        parent('b', 'B', { budgeted: 300 }),
      ],
      nonce: 1,
    });
    expect(ids(result.current.buckets.spending)).toEqual(['a', 'b']);
    expect(result.current.stale).toBe(false);
  });

  it('re-sorts when the sort field changes', () => {
    const { result, rerender } = renderHook(
      (props: { field: 'budgeted' | 'actual' }) =>
        useBvaStableOrder({
          buckets: buckets([
            parent('a', 'A', { budgeted: 100, actual: 500 }),
            parent('b', 'B', { budgeted: 300, actual: 10 }),
          ]),
          field: props.field,
          direction: 'desc',
          orderNonce: 0,
        }),
      { initialProps: { field: 'budgeted' as 'budgeted' | 'actual' } },
    );
    expect(ids(result.current.buckets.spending)).toEqual(['b', 'a']);

    rerender({ field: 'actual' });
    expect(ids(result.current.buckets.spending)).toEqual(['a', 'b']);
    expect(result.current.stale).toBe(false);
  });

  it('appends newly-visible parents at the end rather than weaving them in', () => {
    const { result, rerender } = renderHook(
      (props: { rows: FilteredParent[] }) =>
        useBvaStableOrder({
          buckets: buckets(props.rows),
          field: 'budgeted',
          direction: 'desc',
          orderNonce: 0,
        }),
      {
        initialProps: {
          rows: [
            parent('a', 'A', { budgeted: 100 }),
            parent('b', 'B', { budgeted: 300 }),
          ],
        },
      },
    );
    expect(ids(result.current.buckets.spending)).toEqual(['b', 'a']);

    // 'c' has the biggest budget but arrives after the freeze — it goes last.
    rerender({
      rows: [
        parent('a', 'A', { budgeted: 100 }),
        parent('b', 'B', { budgeted: 300 }),
        parent('c', 'C', { budgeted: 999 }),
      ],
    });
    expect(ids(result.current.buckets.spending)).toEqual(['b', 'a', 'c']);
    expect(result.current.stale).toBe(true);
  });

  it('drops parents that disappear without disturbing the rest', () => {
    const { result, rerender } = renderHook(
      (props: { rows: FilteredParent[] }) =>
        useBvaStableOrder({
          buckets: buckets(props.rows),
          field: 'budgeted',
          direction: 'desc',
          orderNonce: 0,
        }),
      {
        initialProps: {
          rows: [
            parent('a', 'A', { budgeted: 100 }),
            parent('b', 'B', { budgeted: 300 }),
            parent('c', 'C', { budgeted: 200 }),
          ],
        },
      },
    );
    expect(ids(result.current.buckets.spending)).toEqual(['b', 'c', 'a']);

    rerender({
      rows: [
        parent('a', 'A', { budgeted: 100 }),
        parent('c', 'C', { budgeted: 200 }),
      ],
    });
    expect(ids(result.current.buckets.spending)).toEqual(['c', 'a']);
    // A filter change alone doesn't make the surviving order wrong.
    expect(result.current.stale).toBe(false);
  });

  it('orders children by the same field and freezes them too', () => {
    const { result, rerender } = renderHook(
      (props: { childBudget: number }) =>
        useBvaStableOrder({
          buckets: buckets([
            parent('food', 'Food', {
              budgeted: 100,
              children: [
                child('snacks', 'Snacks', { budgeted: props.childBudget }),
                child('dining', 'Dining', { budgeted: 50 }),
              ],
            }),
          ]),
          field: 'budgeted',
          direction: 'desc',
          orderNonce: 0,
        }),
      { initialProps: { childBudget: 10 } },
    );
    expect(
      result.current.buckets.spending[0].parent.children.map(c => c.categoryId),
    ).toEqual(['dining', 'snacks']);

    rerender({ childBudget: 900 });
    expect(
      result.current.buckets.spending[0].parent.children.map(c => c.categoryId),
    ).toEqual(['dining', 'snacks']);
    expect(result.current.stale).toBe(true);
  });
});
