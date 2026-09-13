/**
 * Project tag generation and utility functions.
 * Used by both frontend (tag preview) and backend (tag creation).
 */

/**
 * Generate a project tag from a project name and start date.
 * Format: project:<slug>:<year>
 *
 * - Lowercases the name
 * - Strips colons (delimiter conflict)
 * - Replaces spaces and special chars with hyphens
 * - Strips consecutive/leading/trailing hyphens
 * - Extracts year from startDate
 */
export function generateProjectTag(name: string, startDate: string): string {
  const year = new Date(startDate).getFullYear();
  const slug = slugifyProjectName(name);
  return `project:${slug}:${year}`;
}

/**
 * Slugify a project name for use in a tag.
 */
export function slugifyProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/:/g, '')           // Strip colons (delimiter conflict)
    .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-')         // Collapse consecutive hyphens
    .replace(/^-|-$/g, '');      // Strip leading/trailing hyphens
}

/**
 * Check if a tag string is a project tag.
 */
export function isProjectTag(tag: string): boolean {
  return /^project:[a-z0-9-]+:\d{4}$/.test(tag);
}

/**
 * Derive project status from dates relative to today.
 */
export function getProjectStatus(startDate: string, endDate: string): 'planning' | 'active' | 'completed' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (start > today) return 'planning';
  if (end < today) return 'completed';
  return 'active';
}

/**
 * Structured allocation state between a budget amount and a set of line items.
 *
 * Since BRD v2.0 this is anchored to the project's `totalBudget` rather than a
 * single category's amount — line items are project-level (BRD §5.5.7).
 *
 * `kind === 'balanced'` covers both the empty-items case and sum-equals-amount.
 * `diff === sum - amount` (positive = over-allocated, negative = under-allocated).
 * `label` is a pre-formatted user-facing string (null when balanced) — the caller
 * supplies the currency formatter so this helper stays free of frontend deps.
 */
export interface AllocationHint {
  sum: number;
  diff: number;
  kind: 'under' | 'over' | 'balanced';
  label: string | null;
}

export function computeAllocationHint(
  amount: number,
  lineItems: { estimatedCost: number }[] | undefined,
  formatCurrency: (n: number) => string,
): AllocationHint {
  const items = lineItems ?? [];
  const sum = items.reduce((s, li) => s + (li.estimatedCost ?? 0), 0);

  if (items.length === 0) return { sum, diff: 0, kind: 'balanced', label: null };

  const diff = sum - amount;
  if (diff === 0) return { sum, diff, kind: 'balanced', label: null };
  if (diff < 0) {
    return { sum, diff, kind: 'under', label: `Unallocated: ${formatCurrency(Math.abs(diff))}` };
  }
  return { sum, diff, kind: 'over', label: `Over-allocated by ${formatCurrency(diff)}` };
}

/**
 * Slugify a line item name into a candidate match tag.
 *
 * Only ever used to PRE-FILL the tag input — the user may overwrite it. Long
 * descriptive names produce unusable tags ("Actual Wall Cover (plywood, shiplap,
 * bead board, etc.)" -> a 45-character slug), which is exactly why name and tag
 * are separate fields (BRD §5.5.3).
 */
export function slugifyLineItemTag(name: string): string {
  return name
    .toLowerCase()
    .replace(/:/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Minimal shape needed to attribute a transaction to a line item. */
export interface AttributableTransaction {
  amount: number;
  tags: string[];
}

export interface LineItemSpendingResult {
  lineItemId: string;
  tag: string;
  actual: number;
  matchCount: number;
}

/**
 * Attribute a project's transactions to its line items by tag (BRD §5.5.5).
 *
 * Matching is deliberately naive: a transaction carrying two line item tags
 * counts its FULL amount toward BOTH. Consequently the returned `actual` values
 * may overlap and MUST NOT be summed into a column total — see the note on
 * `ProjectSummary.unattributedSpent`.
 *
 * `transactions` must already be filtered to the project's tag.
 *
 * @returns per-line-item actuals plus the unattributed remainder (spend carrying
 *          none of the project's line item tags).
 */
export function computeLineItemSpending(
  lineItems: { id: string; tag: string }[],
  transactions: AttributableTransaction[],
): { lineItemSpending: LineItemSpendingResult[]; unattributedSpent: number } {
  const lineItemSpending: LineItemSpendingResult[] = lineItems.map((li) => ({
    lineItemId: li.id,
    tag: li.tag,
    actual: 0,
    matchCount: 0,
  }));

  // Index by tag so a tag shared by two line items credits both. Empty tags
  // never match — they would otherwise sweep up every transaction.
  const byTag = new Map<string, LineItemSpendingResult[]>();
  for (const row of lineItemSpending) {
    if (!row.tag) continue;
    const bucket = byTag.get(row.tag);
    if (bucket) bucket.push(row);
    else byTag.set(row.tag, [row]);
  }

  let unattributedSpent = 0;

  for (const txn of transactions) {
    let matched = false;
    for (const tag of txn.tags) {
      const rows = byTag.get(tag);
      if (!rows) continue;
      matched = true;
      for (const row of rows) {
        row.actual += txn.amount;
        row.matchCount += 1;
      }
    }
    if (!matched) unattributedSpent += txn.amount;
  }

  return { lineItemSpending, unattributedSpent };
}
