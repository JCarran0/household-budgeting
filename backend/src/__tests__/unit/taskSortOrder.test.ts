/**
 * Unit tests for sortOrder fractional-indexing helpers.
 */

import {
  computeSortOrder,
  topOfColumn,
  bottomOfColumn,
  betweenSiblings,
} from '../../shared/utils/taskSortOrder';

describe('computeSortOrder', () => {
  it('returns 1.0 for an empty column (both null)', () => {
    expect(computeSortOrder(null, null)).toBe(1.0);
  });

  it('returns after - 1 when inserting at the top (before null)', () => {
    expect(computeSortOrder(null, 5)).toBe(4);
    expect(computeSortOrder(null, 0)).toBe(-1);
    expect(computeSortOrder(null, -2)).toBe(-3);
  });

  it('returns before + 1 when inserting at the bottom (after null)', () => {
    expect(computeSortOrder(5, null)).toBe(6);
    expect(computeSortOrder(-10, null)).toBe(-9);
  });

  it('returns midpoint when between two values', () => {
    expect(computeSortOrder(0, 10)).toBe(5);
    expect(computeSortOrder(-4, 4)).toBe(0);
    expect(computeSortOrder(1, 2)).toBe(1.5);
  });

  it('still halves correctly for very close neighbors', () => {
    expect(computeSortOrder(1, 1.0000002)).toBeCloseTo(1.0000001, 7);
  });

  it('handles negative values', () => {
    expect(computeSortOrder(-10, -5)).toBe(-7.5);
  });

  it('handles zero correctly', () => {
    expect(computeSortOrder(0, 2)).toBe(1);
    expect(computeSortOrder(-2, 0)).toBe(-1);
  });
});

describe('topOfColumn', () => {
  it('returns 1.0 for empty column', () => {
    expect(topOfColumn(null)).toBe(1.0);
  });
  it('returns min - 1 otherwise', () => {
    expect(topOfColumn(5)).toBe(4);
    expect(topOfColumn(0)).toBe(-1);
  });
});

describe('bottomOfColumn', () => {
  it('returns 1.0 for empty column', () => {
    expect(bottomOfColumn(null)).toBe(1.0);
  });
  it('returns max + 1 otherwise', () => {
    expect(bottomOfColumn(5)).toBe(6);
  });
});

describe('betweenSiblings', () => {
  it('returns midpoint', () => {
    expect(betweenSiblings(0, 10)).toBe(5);
    expect(betweenSiblings(-2, 2)).toBe(0);
  });
});
