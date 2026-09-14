/**
 * Project Reads for AI Tools (T0) — AI-CAPABILITY-PLATFORM-BRD §9.3.
 *
 * THE LANDMINE THIS FILE IS SHAPED AROUND:
 *
 * Project spending is TAG-based (`txn.tags.includes(project.tag)`), and
 * `tags` is an array — a single transaction can carry a project tag and a trip
 * tag simultaneously. Consequences the model must never have to infer:
 *
 *   - Totals from two different projects CANNOT be added. The same dollar can
 *     appear in both.
 *   - A project total CANNOT be added to a trip total.
 *   - Project totals CANNOT be reconciled against household spending for the
 *     period, because tagged transactions are included regardless of whether
 *     their date falls inside the project window (PROJECTS-BRD §6).
 *
 * Every result therefore carries `crossProjectTotalsAreNotAdditive: true`, and
 * no method here ever emits a sum across projects. WITHIN one project the
 * per-category breakdown IS additive and does reconcile to `totalSpent`, so
 * that total is safe to state.
 *
 * LINE ITEMS DO HAVE ACTUALS NOW — AND THEY ARE NOT ADDITIVE EITHER:
 * This file was written when PROJECTS-BRD put "linking a line item to an actual
 * transaction" out of scope. BRD v2.0 (§5.5) reverses that: line items are
 * project-level, carry a `tag`, and their `actual` is derived from the project's
 * transactions carrying that tag.
 *
 * The derivation is deliberately naive (§5.5.5): a transaction carrying two line
 * item tags counts its FULL amount toward BOTH. So `lineItems[].actual` repeats
 * the same landmine as cross-project totals one level down — the column MUST NOT
 * be summed, and it does NOT reconcile to `totalSpent`. `unattributedSpent` is
 * the honest coverage signal and is emitted alongside it for that reason.
 */

import type { StoredProject, Category, ProjectLineItem } from '../../shared/types';
import { getActiveTransactions } from '../transactionReader';
import {
  computeLineItemSpending,
  type LineItemSpendingResult,
} from '../../shared/utils/projectHelpers';

export interface ProjectDataReader {
  getData<T>(key: string): Promise<T | null>;
  getCategories(familyId: string): Promise<Category[]>;
}

interface StoredTransactionLike {
  status: string;
  amount: number;
  tags: string[];
  categoryId: string | null;
  isHidden: boolean;
}

export interface ProjectLineItemForTool {
  id: string;
  name: string;
  estimatedCost: number;
  /** Tag matched against this project's transactions to derive `actual`. */
  tag: string;
  /**
   * Spend on project transactions carrying `tag` (PROJECTS-BRD §5.5.5).
   *
   * NOT additive across line items: a transaction carrying two line item tags
   * counts fully toward both, so summing this column can exceed totalSpent.
   * Use `unattributedSpent` to reason about coverage instead.
   */
  actual: number;
  matchCount: number;
  notes: string | null;
}

export interface ProjectCategorySpendForTool {
  categoryId: string;
  categoryName: string;
  budgeted: number | null;
  hasBudget: boolean;
  spent: number;
}

export interface ProjectSummaryForTool {
  id: string;
  name: string;
  tag: string;
  startDate: string;
  endDate: string;
  status: 'planning' | 'active' | 'completed';
  notes: string;
  totalBudget: number | null;
  hasBudget: boolean;
  /** Sum of tagged transactions. Additive WITHIN this project only. */
  totalSpent: number;
  transactionCount: number;
  categories: ProjectCategorySpendForTool[];
  /**
   * Project-level estimates (PROJECTS-BRD §5.5.2). Siblings of `categories`,
   * not nested inside them — the budgeting axis and the estimating axis are
   * independent lenses on the same transactions.
   */
  lineItems: ProjectLineItemForTool[];
  /** Project spend carrying NONE of the line item tags above (§5.5.6). */
  unattributedSpent: number;
  /** See the module docblock. Always true; stated so the model is told, not trusted. */
  crossProjectTotalsAreNotAdditive: true;
  /** PROJECTS-BRD §6 — tagged transactions count regardless of date. */
  includesTransactionsOutsideDateRange: true;
}

export interface ListProjectsToolResult {
  count: number;
  projects: ProjectSummaryForTool[];
}

export interface GetProjectToolResult {
  found: boolean;
  query: string;
  project: ProjectSummaryForTool | null;
}

function projectStatus(startDate: string, endDate: string, today: string): 'planning' | 'active' | 'completed' {
  if (today < startDate) return 'planning';
  if (today > endDate) return 'completed';
  return 'active';
}

function toLineItems(
  items: ProjectLineItem[] | undefined,
  spending: LineItemSpendingResult[],
): ProjectLineItemForTool[] {
  const byId = new Map(spending.map(row => [row.lineItemId, row]));
  return (items ?? []).map(li => ({
    id: li.id,
    name: li.name,
    estimatedCost: li.estimatedCost,
    tag: li.tag,
    actual: byId.get(li.id)?.actual ?? 0,
    matchCount: byId.get(li.id)?.matchCount ?? 0,
    notes: li.notes ?? null,
  }));
}

export class ChatbotProjectReader {
  constructor(private readonly dataService: ProjectDataReader) {}

  private async loadProjects(familyId: string): Promise<StoredProject[]> {
    return (await this.dataService.getData<StoredProject[]>(`projects_${familyId}`)) ?? [];
  }

  private async summarize(
    familyId: string,
    project: StoredProject,
    today: string,
  ): Promise<ProjectSummaryForTool> {
    // SEC-P031: removed transactions never reach an AI read path.
    const txns = await getActiveTransactions<StoredTransactionLike>(this.dataService, familyId);
    // Hidden transactions are excluded from project totals everywhere else
    // (PROJECTS-BRD §5.6). Without this the assistant reports a different total
    // than the Projects page for the same project — and split parents, which
    // are hidden on split, would be counted alongside their children.
    const tagged = txns.filter(t => t.tags.includes(project.tag) && !t.isHidden);

    const spentByCategory = new Map<string, number>();
    let totalSpent = 0;
    for (const t of tagged) {
      totalSpent += t.amount;
      const key = t.categoryId ?? '__uncategorized__';
      spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + t.amount);
    }

    const categories = await this.dataService.getCategories(familyId);
    // SEC-P032: resolve every id to a name here, so the model never has to join.
    const nameById = new Map(categories.map(c => [c.id, c.name]));

    const budgetByCategory = new Map(project.categoryBudgets.map(cb => [cb.categoryId, cb]));
    const allIds = new Set<string>([...spentByCategory.keys(), ...budgetByCategory.keys()]);

    const categoryRows: ProjectCategorySpendForTool[] = [];
    for (const categoryId of allIds) {
      if (categoryId === '__uncategorized__') {
        categoryRows.push({
          categoryId: '__uncategorized__',
          categoryName: 'Uncategorized',
          budgeted: null,
          hasBudget: false,
          spent: spentByCategory.get(categoryId) ?? 0,
        });
        continue;
      }
      const budget = budgetByCategory.get(categoryId);
      categoryRows.push({
        categoryId,
        // An id with no category is an orphan — this app is known to produce
        // them. Say so rather than echoing a raw id as if it were a name.
        categoryName: nameById.get(categoryId) ?? `Unknown category (${categoryId})`,
        budgeted: budget ? budget.amount : null,
        hasBudget: budget !== undefined,
        spent: spentByCategory.get(categoryId) ?? 0,
      });
    }

    categoryRows.sort((a, b) => b.spent - a.spent);

    const projectLineItems = project.lineItems ?? [];
    const { lineItemSpending, unattributedSpent } = computeLineItemSpending(
      projectLineItems,
      tagged,
    );

    return {
      id: project.id,
      name: project.name,
      tag: project.tag,
      startDate: project.startDate,
      endDate: project.endDate,
      status: projectStatus(project.startDate, project.endDate, today),
      notes: project.notes,
      totalBudget: project.totalBudget,
      hasBudget: project.totalBudget !== null,
      totalSpent,
      transactionCount: tagged.length,
      categories: categoryRows,
      lineItems: toLineItems(projectLineItems, lineItemSpending),
      unattributedSpent,
      crossProjectTotalsAreNotAdditive: true,
      includesTransactionsOutsideDateRange: true,
    };
  }

  async listProjects(familyId: string, now: Date = new Date()): Promise<ListProjectsToolResult> {
    const projects = await this.loadProjects(familyId);
    const today = now.toISOString().slice(0, 10);
    const sorted = [...projects].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

    const summaries: ProjectSummaryForTool[] = [];
    for (const p of sorted) {
      summaries.push(await this.summarize(familyId, p, today));
    }
    return { count: summaries.length, projects: summaries };
  }

  async getProject(
    familyId: string,
    input: { projectQuery: string },
    now: Date = new Date(),
  ): Promise<GetProjectToolResult> {
    const projects = await this.loadProjects(familyId);
    const q = input.projectQuery.toLowerCase();
    const project =
      projects.find(p => p.id === input.projectQuery) ??
      projects.find(p => p.name.toLowerCase() === q) ??
      projects.find(p => p.name.toLowerCase().includes(q)) ??
      projects.find(p => p.tag.toLowerCase() === q);

    if (!project) {
      return { found: false, query: input.projectQuery, project: null };
    }
    const today = now.toISOString().slice(0, 10);
    return { found: true, query: input.projectQuery, project: await this.summarize(familyId, project, today) };
  }
}
