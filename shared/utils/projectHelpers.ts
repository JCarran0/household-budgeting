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
 * Structured allocation state between a category budget amount and its line items.
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
