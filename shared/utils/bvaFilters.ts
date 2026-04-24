import type { SectionType } from './bvaDisplay';

/**
 * BvA filter composition — BRD Revision 2.
 *
 * Matching happens at the child-row level; parents survive if any child
 * matches OR if the parent's own rollup matches (REQ-021/022). The result
 * describes per-parent visibility with a de-emphasis flag for non-matching
 * siblings inside a parent that qualified via a child match — so the user
 * still sees context (REQ-021).
 *
 * Evaluation runs against **Available** (tone-signed surplus/shortfall) as
 * currently displayed. The Use Rollover toggle is already baked into
 * Available upstream, so "what you filter against" matches "what you see."
 *
 * Variance filter definitions per REQ-018/019:
 *   - under    : Available > 0   (favorable surplus)
 *   - over     : Available < 0   (unfavorable shortfall)
 *   - serious  : deeply unfavorable per type (REQ-019):
 *       Spending          : Available < −2 × Budgeted
 *       Income / Savings  : Available < −(2/3) × Budgeted
 *     Rows with Budgeted === 0 are excluded from "serious" entirely.
 */

export type VarianceFilter = 'all' | 'under' | 'over' | 'serious';

export interface FilterDecision {
  /** Include the parent row in output. */
  include: boolean;
  /** Ids of children that must be de-emphasized (opacity dim). */
  deEmphasizedChildIds: Set<string>;
}

interface RowForMatching {
  budgeted: number;
  available: number;
}

function matchesFilter(
  section: SectionType,
  row: RowForMatching,
  filter: VarianceFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'under') return row.available > 0;
  if (filter === 'over') return row.available < 0;
  // 'serious'
  if (row.available >= 0) return false;
  if (row.budgeted <= 0) return false;
  if (section === 'spending') return row.available < -2 * row.budgeted;
  // Income / Savings
  return row.available < -(2 / 3) * row.budgeted;
}

export interface ClassifyAvailableInput {
  section: SectionType;
  parent: RowForMatching;
  children: ReadonlyArray<{ categoryId: string; budgeted: number; available: number }>;
  filter: VarianceFilter;
}

export function classifyAvailable({
  section,
  parent,
  children,
  filter,
}: ClassifyAvailableInput): FilterDecision {
  if (filter === 'all') {
    return { include: true, deEmphasizedChildIds: new Set() };
  }

  const matchingChildIds = new Set<string>();
  for (const c of children) {
    if (matchesFilter(section, { budgeted: c.budgeted, available: c.available }, filter)) {
      matchingChildIds.add(c.categoryId);
    }
  }

  if (matchingChildIds.size > 0) {
    // Non-matching siblings stay visible for context but dim (REQ-021).
    // No auto-expand — parents default collapsed per post-Phase-7 polish.
    const deEmphasized = new Set<string>();
    for (const c of children) {
      if (!matchingChildIds.has(c.categoryId)) deEmphasized.add(c.categoryId);
    }
    return { include: true, deEmphasizedChildIds: deEmphasized };
  }

  if (matchesFilter(section, parent, filter)) {
    return { include: true, deEmphasizedChildIds: new Set() };
  }

  return { include: false, deEmphasizedChildIds: new Set() };
}
