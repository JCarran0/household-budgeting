/**
 * Project Service
 *
 * Manages projects (e.g. home renovations), including creation, updates,
 * deletion, and spending summaries derived from tagged transactions.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  StoredProject,
  ProjectSummary,
  ProjectCategorySpending,
  CreateProjectDto,
  UpdateProjectDto,
} from '../shared/types';
import { DataService } from './dataService';
import { TransactionService, StoredTransaction } from './transactionService';
import { generateProjectTag, getProjectStatus } from '../shared/utils/projectHelpers';

export class ProjectService {
  constructor(
    private dataService: DataService,
    private transactionService: TransactionService
  ) {}

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadProjects(userId: string): Promise<StoredProject[]> {
    return (await this.dataService.getData<StoredProject[]>(`projects_${userId}`)) ?? [];
  }

  private async saveProjects(projects: StoredProject[], userId: string): Promise<void> {
    await this.dataService.saveData(`projects_${userId}`, projects);
  }

  /**
   * Strip a tag from all of a user's transactions.
   * Works directly against the raw transaction store for batch efficiency.
   */
  private async removeTagFromTransactions(tag: string, userId: string): Promise<void> {
    const transactions =
      (await this.dataService.getData<StoredTransaction[]>(`transactions_${userId}`)) ?? [];

    let changed = false;
    const updated = transactions.map((txn) => {
      if (!txn.tags.includes(tag)) return txn;
      changed = true;
      return {
        ...txn,
        tags: txn.tags.filter((t) => t !== tag),
        updatedAt: new Date(),
      };
    });

    if (changed) {
      await this.dataService.saveData(`transactions_${userId}`, updated);
    }
  }

  /**
   * Replace all occurrences of oldTag with newTag in a user's transactions.
   * Works directly against the raw transaction store for batch efficiency.
   */
  private async renameTagOnTransactions(
    oldTag: string,
    newTag: string,
    userId: string
  ): Promise<void> {
    const transactions =
      (await this.dataService.getData<StoredTransaction[]>(`transactions_${userId}`)) ?? [];

    let changed = false;
    const updated = transactions.map((txn) => {
      if (!txn.tags.includes(oldTag)) return txn;
      changed = true;
      return {
        ...txn,
        tags: txn.tags.map((t) => (t === oldTag ? newTag : t)),
        updatedAt: new Date(),
      };
    });

    if (changed) {
      await this.dataService.saveData(`transactions_${userId}`, updated);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Create a new project.
   * Generates a tag from the name and start date, then validates uniqueness.
   */
  async createProject(data: CreateProjectDto, userId: string): Promise<StoredProject> {
    const tag = generateProjectTag(data.name, data.startDate);

    const existingProjects = await this.loadProjects(userId);
    if (existingProjects.some((p) => p.tag === tag)) {
      throw new Error('A project with this tag already exists');
    }

    const now = new Date().toISOString();
    const project: StoredProject = {
      id: uuidv4(),
      userId,
      name: data.name,
      tag,
      startDate: data.startDate,
      endDate: data.endDate,
      totalBudget: data.totalBudget ?? null,
      categoryBudgets: data.categoryBudgets ?? [],
      notes: data.notes ?? '',
      createdAt: now,
      updatedAt: now,
    };

    existingProjects.push(project);
    await this.saveProjects(existingProjects, userId);

    return project;
  }

  /**
   * Retrieve a single project by ID.
   */
  async getProject(projectId: string, userId: string): Promise<StoredProject | null> {
    const projects = await this.loadProjects(userId);
    return projects.find((p) => p.id === projectId) ?? null;
  }

  /**
   * Retrieve all projects for a user, optionally filtered by start year.
   * Returns projects sorted by startDate descending (most recent first).
   */
  async getAllProjects(userId: string, year?: number): Promise<StoredProject[]> {
    let projects = await this.loadProjects(userId);

    if (year !== undefined) {
      projects = projects.filter((p) => new Date(p.startDate).getFullYear() === year);
    }

    return projects.sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  /**
   * Update an existing project.
   * If the name changes in a way that produces a new tag, the tag is renamed on
   * all tagged transactions before updating the project entity (D7: transactions
   * before entity update).
   */
  async updateProject(
    projectId: string,
    data: UpdateProjectDto,
    userId: string
  ): Promise<StoredProject> {
    const projects = await this.loadProjects(userId);
    const index = projects.findIndex((p) => p.id === projectId);
    if (index === -1) {
      throw new Error('Project not found');
    }

    const existing = projects[index];
    const oldTag = existing.tag;

    // Determine whether the tag would change
    const newName = data.name ?? existing.name;
    const newStartDate = data.startDate ?? existing.startDate;
    const candidateTag = generateProjectTag(newName, newStartDate);
    const tagWillChange = candidateTag !== oldTag;

    if (tagWillChange) {
      // Validate the new tag is unique among this user's other projects
      const otherProjects = projects.filter((p) => p.id !== projectId);
      if (otherProjects.some((p) => p.tag === candidateTag)) {
        throw new Error('A project with this tag already exists');
      }

      // Rename tag on transactions BEFORE updating the entity (D7)
      await this.renameTagOnTransactions(oldTag, candidateTag, userId);
    }

    const now = new Date().toISOString();
    const updatedProject: StoredProject = {
      ...existing,
      name: newName,
      startDate: newStartDate,
      endDate: data.endDate ?? existing.endDate,
      totalBudget: data.totalBudget !== undefined ? data.totalBudget : existing.totalBudget,
      categoryBudgets: data.categoryBudgets ?? existing.categoryBudgets,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      tag: tagWillChange ? candidateTag : oldTag,
      updatedAt: now,
    };

    projects[index] = updatedProject;
    await this.saveProjects(projects, userId);

    return updatedProject;
  }

  /**
   * Delete a project.
   * Strips the project tag from all transactions BEFORE removing the project
   * entity (D7: transactions before entity deletion).
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    const projects = await this.loadProjects(userId);
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Remove tag from transactions first (D7)
    await this.removeTagFromTransactions(project.tag, userId);

    const remaining = projects.filter((p) => p.id !== projectId);
    await this.saveProjects(remaining, userId);
  }

  /**
   * Build a full summary for a single project, including spending totals
   * derived from tagged transactions.
   *
   * @param categories  Optional flat list of {id, name} pairs used to resolve
   *                    category names. Falls back to categoryId when absent.
   */
  async getProjectSummary(
    projectId: string,
    userId: string,
    categories?: Array<{ id: string; name: string }>
  ): Promise<ProjectSummary> {
    const project = await this.getProject(projectId, userId);
    if (!project) {
      throw new Error('Project not found');
    }

    const result = await this.transactionService.getTransactions(userId, {
      tags: [project.tag],
      includeHidden: true,
    });

    const transactions = result.transactions ?? [];

    // Accumulate spending per category
    // Positive amounts = expenses (debits), negative = income (credits/deposits).
    // We sum actual signed amounts so deposits offset expenses in project totals.
    const spendingMap = new Map<string, number>();
    let totalSpent = 0;

    for (const txn of transactions) {
      totalSpent += txn.amount;

      const catId = txn.categoryId ?? '__uncategorized__';
      spendingMap.set(catId, (spendingMap.get(catId) ?? 0) + txn.amount);
    }

    // Build a name lookup from the provided categories list
    const categoryNameMap = new Map<string, string>();
    if (categories) {
      for (const cat of categories) {
        categoryNameMap.set(cat.id, cat.name);
      }
    }

    // Build a budget lookup from the project's categoryBudgets
    const budgetMap = new Map<string, number>();
    for (const cb of project.categoryBudgets) {
      budgetMap.set(cb.categoryId, cb.amount);
    }

    // Merge spending entries (which may not be in categoryBudgets) and budget
    // entries (which may have no spending yet) into a unified list
    const allCategoryIds = new Set<string>([
      ...spendingMap.keys(),
      ...budgetMap.keys(),
    ]);

    const categorySpending: ProjectCategorySpending[] = [];
    for (const catId of allCategoryIds) {
      if (catId === '__uncategorized__') {
        // Only include uncategorized bucket when there is actual spending
        if (!spendingMap.has(catId)) continue;
        categorySpending.push({
          categoryId: catId,
          categoryName: 'Uncategorized',
          spent: spendingMap.get(catId) ?? 0,
          budgeted: null,
        });
        continue;
      }

      categorySpending.push({
        categoryId: catId,
        categoryName: categoryNameMap.get(catId) ?? catId,
        spent: spendingMap.get(catId) ?? 0,
        budgeted: budgetMap.get(catId) ?? null,
      });
    }

    return {
      ...project,
      status: getProjectStatus(project.startDate, project.endDate),
      totalSpent,
      categorySpending,
    };
  }

  /**
   * Build summaries for all projects belonging to a user, optionally filtered
   * by start year. Returns summaries sorted by startDate descending.
   */
  async getProjectsSummaries(
    userId: string,
    year?: number,
    categories?: Array<{ id: string; name: string }>
  ): Promise<ProjectSummary[]> {
    const projects = await this.getAllProjects(userId, year);

    const summaries = await Promise.all(
      projects.map((project) => this.getProjectSummary(project.id, userId, categories))
    );

    return summaries;
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let projectServiceInstance: ProjectService | null = null;

export function getProjectService(
  dataService: DataService,
  transactionService: TransactionService
): ProjectService {
  if (!projectServiceInstance) {
    projectServiceInstance = new ProjectService(dataService, transactionService);
  }
  return projectServiceInstance;
}
