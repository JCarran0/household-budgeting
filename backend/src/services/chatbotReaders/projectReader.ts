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
 * LINE ITEMS ARE ESTIMATES, NOT ACTUALS:
 * PROJECTS-BRD §5.5.5 puts "linking a line item to an actual transaction" out
 * of scope — line items carry `estimatedCost` and nothing else. A tool that
 * implied a line item had been "spent" would invent a reconciliation the app
 * does not perform, so `estimatedCost` is labelled as an estimate in the
 * payload and never compared to actuals here.
 */

import type { StoredProject, Category, ProjectLineItem } from '../../shared/types';
import { getActiveTransactions } from '../transactionReader';

export interface ProjectDataReader {
  getData<T>(key: string): Promise<T | null>;
  getCategories(familyId: string): Promise<Category[]>;
}

interface StoredTransactionLike {
  status: string;
  amount: number;
  tags: string[];
  categoryId: string | null;
}

export interface ProjectLineItemForTool {
  id: string;
  name: string;
  /** An ESTIMATE. This app never reconciles line items against transactions. */
  estimatedCost: number;
  notes: string | null;
}

export interface ProjectCategorySpendForTool {
  categoryId: string;
  categoryName: string;
  budgeted: number | null;
  hasBudget: boolean;
  spent: number;
  lineItems: ProjectLineItemForTool[];
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

function toLineItems(items: ProjectLineItem[] | undefined): ProjectLineItemForTool[] {
  return (items ?? []).map(li => ({
    id: li.id,
    name: li.name,
    estimatedCost: li.estimatedCost,
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
    const tagged = txns.filter(t => t.tags.includes(project.tag));

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
          lineItems: [],
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
        lineItems: toLineItems(budget?.lineItems),
      });
    }

    categoryRows.sort((a, b) => b.spent - a.spent);

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
