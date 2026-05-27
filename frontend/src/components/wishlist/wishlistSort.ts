import type { StoredWishlistItem, WishlistStatus } from '../../../../shared/types';

const STATUS_RANK: Record<WishlistStatus, number> = {
  PENDING: 0,
  AGREED: 1,
  REJECTED: 2,
};

/**
 * Sort wishlist items per the D10 decision:
 *  1. Status group: PENDING → AGREED → REJECTED
 *  2. estimatedMonth ascending (lexicographic works for YYYY-MM)
 *  3. createdAt ascending as the final tie-breaker
 *
 * Pure function — returns a new array, does not mutate input.
 */
export function sortWishlistItems(items: StoredWishlistItem[]): StoredWishlistItem[] {
  return [...items].sort((a, b) => {
    const statusDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (statusDiff !== 0) return statusDiff;

    const monthDiff = a.estimatedMonth.localeCompare(b.estimatedMonth);
    if (monthDiff !== 0) return monthDiff;

    return a.createdAt.localeCompare(b.createdAt);
  });
}
