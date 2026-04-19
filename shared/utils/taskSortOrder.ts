/**
 * Task sortOrder helpers — fractional-index computation for manual reorder.
 *
 * A task's sortOrder is a float, scoped per status. Reordering is implemented
 * by choosing a value strictly between two neighbors (or past an edge); this
 * avoids renumbering siblings on every insert.
 *
 * Precision exhaustion (midpoint collapses to one endpoint after many inserts
 * in the same slot) is not an MVP concern — see BRD Assumption 7.
 */

/**
 * Compute a sortOrder for a task being inserted or moved between two neighbors.
 *
 *   - Both null (empty column) → 1.0
 *   - before null, after N     → N - 1.0     (top of column)
 *   - before N,   after null   → N + 1.0     (bottom of column)
 *   - before A,   after B      → (A + B) / 2 (midpoint)
 */
export function computeSortOrder(
  before: number | null,
  after: number | null
): number {
  if (before == null && after == null) return 1.0;
  if (before == null) return (after as number) - 1.0;
  if (after == null) return (before as number) + 1.0;
  return (before + after) / 2.0;
}

/** Convenience: sortOrder for the top of a column (above `min`). */
export function topOfColumn(min: number | null): number {
  return min == null ? 1.0 : min - 1.0;
}

/** Convenience: sortOrder for the bottom of a column (below `max`). */
export function bottomOfColumn(max: number | null): number {
  return max == null ? 1.0 : max + 1.0;
}

/** Convenience: midpoint between two sibling sortOrders. */
export function betweenSiblings(a: number, b: number): number {
  return (a + b) / 2.0;
}
