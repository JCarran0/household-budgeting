import { describe, it, expect } from 'vitest';
import { sortWishlistItems } from '../wishlistSort';
import type { StoredWishlistItem } from '../../../../../shared/types';

function makeItem(overrides: Partial<StoredWishlistItem> & { id: string }): StoredWishlistItem {
  return {
    id: overrides.id,
    name: overrides.name ?? 'Item',
    estimatedAmount: overrides.estimatedAmount ?? 100,
    estimatedMonth: overrides.estimatedMonth ?? '2026-06',
    categoryId: overrides.categoryId ?? 'CUSTOM_CAT',
    status: overrides.status ?? 'PENDING',
    createdBy: overrides.createdBy ?? 'user-1',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00Z',
  };
}

describe('sortWishlistItems', () => {
  it('does not mutate the input array', () => {
    const items = [
      makeItem({ id: 'a', status: 'REJECTED' }),
      makeItem({ id: 'b', status: 'PENDING' }),
    ];
    const original = [...items];
    sortWishlistItems(items);
    expect(items).toEqual(original);
  });

  it('sorts by status group: PENDING first, then AGREED, then REJECTED', () => {
    const items = [
      makeItem({ id: 'r', status: 'REJECTED', estimatedMonth: '2026-01' }),
      makeItem({ id: 'a', status: 'AGREED', estimatedMonth: '2026-01' }),
      makeItem({ id: 'p', status: 'PENDING', estimatedMonth: '2026-01' }),
    ];
    const sorted = sortWishlistItems(items);
    expect(sorted.map((i) => i.status)).toEqual(['PENDING', 'AGREED', 'REJECTED']);
  });

  it('sorts by estimatedMonth ascending within the same status group', () => {
    const items = [
      makeItem({ id: '3', status: 'PENDING', estimatedMonth: '2026-12' }),
      makeItem({ id: '1', status: 'PENDING', estimatedMonth: '2026-06' }),
      makeItem({ id: '2', status: 'PENDING', estimatedMonth: '2026-09' }),
    ];
    const sorted = sortWishlistItems(items);
    expect(sorted.map((i) => i.estimatedMonth)).toEqual(['2026-06', '2026-09', '2026-12']);
  });

  it('sorts by createdAt ascending as a tie-breaker within same status and month', () => {
    const items = [
      makeItem({ id: 'late', status: 'PENDING', estimatedMonth: '2026-06', createdAt: '2026-03-01T00:00:00Z' }),
      makeItem({ id: 'early', status: 'PENDING', estimatedMonth: '2026-06', createdAt: '2026-01-01T00:00:00Z' }),
      makeItem({ id: 'mid', status: 'PENDING', estimatedMonth: '2026-06', createdAt: '2026-02-01T00:00:00Z' }),
    ];
    const sorted = sortWishlistItems(items);
    expect(sorted.map((i) => i.id)).toEqual(['early', 'mid', 'late']);
  });

  it('respects all three sort levels together in a realistic mix', () => {
    const items = [
      makeItem({ id: 'rejected-late', status: 'REJECTED', estimatedMonth: '2026-12', createdAt: '2026-01-01T00:00:00Z' }),
      makeItem({ id: 'agreed-early', status: 'AGREED', estimatedMonth: '2026-01', createdAt: '2026-01-01T00:00:00Z' }),
      makeItem({ id: 'pending-late', status: 'PENDING', estimatedMonth: '2026-11', createdAt: '2026-01-01T00:00:00Z' }),
      makeItem({ id: 'pending-early', status: 'PENDING', estimatedMonth: '2026-01', createdAt: '2026-01-01T00:00:00Z' }),
      makeItem({ id: 'agreed-late', status: 'AGREED', estimatedMonth: '2026-08', createdAt: '2026-01-01T00:00:00Z' }),
    ];
    const sorted = sortWishlistItems(items);
    expect(sorted.map((i) => i.id)).toEqual([
      'pending-early',
      'pending-late',
      'agreed-early',
      'agreed-late',
      'rejected-late',
    ]);
  });
});
