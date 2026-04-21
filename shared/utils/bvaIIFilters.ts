import type { TreeAggregation, ChildAggregation } from './budgetCalculations';
import {
  getVarianceTone,
  type SectionType,
  type VarianceTone,
} from './bvaIIDisplay';

/**
 * BvA II filter composition — type and variance filters.
 *
 * Matching happens at the child-row level; parents survive if any child
 * matches OR if the parent's own rollup matches (REQ-021/022). The result
 * describes per-parent visibility with a de-emphasis flag for non-matching
 * siblings inside a parent that qualified via a child match — so the user
 * still sees context (REQ-021).
 *
 * Variance filter "serious" locks at 200% variance in v1 (REQ-019):
 *   - Spending: actual > 3 × budgeted.
 *   - Income:   actual < budgeted / 3.
 *   - Savings:  actual < budgeted / 3.
 *   - budgeted === 0 excludes the row from serious classification entirely.
 */

export type VarianceFilter = 'all' | 'under' | 'over' | 'serious';

export interface FilterDecision {
  /** Include the parent row in output. */
  include: boolean;
  /** Suggested expand state — true when a child match forced the match. */
  autoExpand: boolean;
  /** Ids of children that must be de-emphasized (opacity dim). */
  deEmphasizedChildIds: Set<string>;
}

function matchesDirection(
  section: SectionType,
  actual: number,
  budgeted: number,
  filter: VarianceFilter,
): boolean {
  if (filter === 'all') return true;
  const tone = getVarianceTone(section, actual, budgeted);
  if (filter === 'under') return tone === 'favorable';
  if (filter === 'over' || filter === 'serious') {
    if (tone !== 'unfavorable') return false;
    if (filter === 'over') return true;
    // "Serious" — locked 200% per-type threshold.
    if (budgeted === 0) return false;
    if (section === 'spending') return actual > 3 * budgeted;
    // Income / Savings share the same < budgeted/3 threshold.
    return actual < budgeted / 3;
  }
  return false;
}

export interface ClassifyVarianceInput {
  section: SectionType;
  parent: { actual: number; budgeted: number };
  children: ReadonlyArray<Pick<ChildAggregation, 'categoryId' | 'actual' | 'budgeted'>>;
  filter: VarianceFilter;
}

export function classifyVariance({
  section,
  parent,
  children,
  filter,
}: ClassifyVarianceInput): FilterDecision {
  if (filter === 'all') {
    return { include: true, autoExpand: false, deEmphasizedChildIds: new Set() };
  }

  const matchingChildIds = new Set<string>();
  for (const c of children) {
    if (matchesDirection(section, c.actual, c.budgeted, filter)) {
      matchingChildIds.add(c.categoryId);
    }
  }

  const parentMatches = matchesDirection(section, parent.actual, parent.budgeted, filter);

  if (matchingChildIds.size > 0) {
    // Auto-expand the parent so matching children are visible; de-emphasize
    // the siblings that did not match (REQ-021).
    const deEmphasized = new Set<string>();
    for (const c of children) {
      if (!matchingChildIds.has(c.categoryId)) deEmphasized.add(c.categoryId);
    }
    return { include: true, autoExpand: true, deEmphasizedChildIds: deEmphasized };
  }

  if (parentMatches) {
    // Parent's own numbers match; no child match → do not force expand (REQ-022).
    return { include: true, autoExpand: false, deEmphasizedChildIds: new Set() };
  }

  return { include: false, autoExpand: false, deEmphasizedChildIds: new Set() };
}

/**
 * Shortcut: map a TreeAggregation directly to a FilterDecision for a section.
 */
export function classifyTreeVariance(
  tree: TreeAggregation,
  section: SectionType,
  filter: VarianceFilter,
): FilterDecision {
  return classifyVariance({
    section,
    parent: { actual: tree.effectiveActual, budgeted: tree.effectiveBudget },
    children: tree.children,
    filter,
  });
}

/** Export the tone type for callers that need the raw interpretation. */
export type { SectionType, VarianceTone };
