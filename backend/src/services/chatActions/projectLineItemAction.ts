/**
 * add_project_line_item Chat Action (T1)
 *
 * AI-CAPABILITY-PLATFORM-BRD §9.2, plan task 3.2. Adds one estimate line under
 * a category budget that already exists on a project.
 *
 * WHY dataClass IS 'financial' AND NOT 'content':
 * A line item carries a dollar figure inside a budget. It is not money that
 * moved, but it is money the household is planning around, and SEC-P003 draws
 * its line at the data rather than at the consequence. That classification is
 * what permanently excludes this action from T2 — an unattended agent must
 * never quietly adjust what a renovation is expected to cost.
 *
 * WHY IT CANNOT CREATE A CATEGORY BUDGET:
 * Creating one means choosing an `amount`, and the project schema requires
 * `totalBudget >= Σ category amounts`. Choosing that number is a budgeting
 * decision, not a bookkeeping one, so this action refuses when no budget exists
 * for the category and says which categories are available. Changing an
 * `amount` is task 3.4 and a different action.
 *
 * WHY A LINE ITEM IS NOT SPENDING:
 * This app never reconciles a line item against a transaction. Line items are
 * estimates, full stop — the system prompt says so, and the card copy here has
 * to keep saying so, or a user reading their activity log will take "added
 * $4,200 cabinets" as money gone.
 *
 * CONCURRENCY:
 * projectService.updateProject replaces the whole categoryBudgets array, so
 * this is a read-modify-write with no optimistic lock — the same shape the
 * app's own project editor uses. The window is one service call wide, and undo
 * restores only this category's line items rather than the whole project, so a
 * concurrent edit elsewhere in the project survives a reversal.
 */

import { z } from 'zod';
import { registerChatAction } from './registry';
import { projectService, categoryService } from '../index';
import type { DisplayField, ProjectLineItem, StoredProject } from '../../shared/types';

const addLineItemParamsSchema = z.object({
  projectId: z.string().min(1),
  categoryId: z.string().min(1),
  // Field rules mirror routes/projects.ts lineItemSchema (REQ-P011). The `id`
  // is deliberately absent: the server assigns it, and a model-chosen UUID
  // could collide with an existing item and overwrite it on save.
  name: z.string().min(1, 'Line item name is required').max(200),
  estimatedCost: z.number().min(0, 'Estimated cost must be >= 0'),
  notes: z.string().max(1000).optional(),
});

type AddLineItemParams = z.infer<typeof addLineItemParamsSchema>;

function budgetFor(project: StoredProject, categoryId: string) {
  return project.categoryBudgets.find(cb => cb.categoryId === categoryId);
}

function lineItemsOf(project: StoredProject, categoryId: string): ProjectLineItem[] {
  return [...(budgetFor(project, categoryId)?.lineItems ?? [])];
}

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

registerChatAction<AddLineItemParams>({
  actionId: 'add_project_line_item',
  label: 'Add a line item to a project budget',
  tier: 'T1',
  dataClass: 'financial',
  paramsSchema: addLineItemParamsSchema,

  /**
   * SEC-P030. Both identifiers are model-supplied and both are resolved here.
   * The categoryId case is the one this app has actual history with: stored
   * categoryIds are known to go orphaned, so "the category exists" and "the
   * project budgets that category" are two separate checks, and the second is
   * the one that fails most usefully.
   */
  async validateSemantics(params, ctx) {
    const project = await projectService.getProject(params.projectId, ctx.familyId);
    if (!project) {
      // Family-scoped read, so another household's id reads as missing.
      throw new Error(`That project no longer exists (${params.projectId}).`);
    }

    if (!budgetFor(project, params.categoryId)) {
      const category = await categoryService.getCategoryById(params.categoryId, ctx.familyId);
      const named = category ? `"${category.name}"` : `that category (${params.categoryId})`;
      throw new Error(
        `"${project.name}" has no budget for ${named}, so there is nothing to add a line item to. ` +
          `Budget the category on the project page first.`,
      );
    }
  },

  /**
   * SEC-P011. The proposed cost is on the card; what it is being added TO has
   * to be there as well, or a $4,200 line reads the same under a $50,000
   * budget as under a $500 one.
   */
  async describeCurrent(params, ctx) {
    const project = await projectService.getProject(params.projectId, ctx.familyId);
    if (!project) return null;
    const budget = budgetFor(project, params.categoryId);
    if (!budget) return null;

    const existing = lineItemsOf(project, params.categoryId);
    const estimated = existing.reduce((sum, item) => sum + item.estimatedCost, 0);
    const category = await categoryService.getCategoryById(params.categoryId, ctx.familyId);

    const fields: DisplayField[] = [
      {
        key: 'categoryId',
        label: 'Category budget',
        // An orphaned id renders as itself rather than vanishing, matching how
        // the project readers already report one.
        value: `${category?.name ?? `Unknown category (${params.categoryId})`} — ${formatUsd(budget.amount)}`,
        editable: false,
        type: 'text',
      },
      {
        key: 'projectId',
        label: 'Project',
        value: project.name,
        editable: false,
        type: 'text',
      },
      {
        key: 'estimatedCost',
        label: 'Estimated so far (line items)',
        value:
          existing.length === 0
            ? '(no line items yet)'
            : `${formatUsd(estimated)} across ${existing.length} item${existing.length === 1 ? '' : 's'}`,
        editable: false,
        type: 'text',
      },
    ];
    return fields;
  },

  /**
   * REQ-P025. Scoped to ONE category's line items, not the whole project:
   * restoring the entire categoryBudgets array would reverse a spouse's edit
   * to an unrelated category as collateral damage.
   */
  undo: {
    kind: 'project',
    async capture(params, ctx) {
      const project = await projectService.getProject(params.projectId, ctx.familyId);
      if (!project) return null;
      return {
        recordId: `${params.projectId}:${params.categoryId}`,
        before: lineItemsOf(project, params.categoryId),
      };
    },
    async read(recordId, ctx) {
      const [projectId, categoryId] = recordId.split(':');
      const project = await projectService.getProject(projectId, ctx.familyId);
      return project ? lineItemsOf(project, categoryId) : null;
    },
    async restore(recordId, before, ctx) {
      const [projectId, categoryId] = recordId.split(':');
      const project = await projectService.getProject(projectId, ctx.familyId);
      if (!project) return;
      const prior = before as ProjectLineItem[];

      await projectService.updateProject(
        projectId,
        {
          categoryBudgets: project.categoryBudgets.map(cb =>
            cb.categoryId === categoryId
              ? { categoryId: cb.categoryId, amount: cb.amount, lineItems: prior }
              : cb,
          ),
        },
        ctx.familyId,
        ctx.userId,
      );
    },
  },

  async execute(params, ctx) {
    const project = await projectService.getProject(params.projectId, ctx.familyId);
    if (!project) throw new Error(`That project no longer exists (${params.projectId}).`);
    if (!budgetFor(project, params.categoryId)) {
      throw new Error(`"${project.name}" has no budget for that category.`);
    }

    const updated = await projectService.updateProject(
      params.projectId,
      {
        categoryBudgets: project.categoryBudgets.map(cb =>
          cb.categoryId === params.categoryId
            ? {
                categoryId: cb.categoryId,
                amount: cb.amount,
                // The service assigns the UUID for an item that arrives without one.
                lineItems: [
                  ...(cb.lineItems ?? []),
                  {
                    name: params.name,
                    estimatedCost: params.estimatedCost,
                    ...(params.notes !== undefined ? { notes: params.notes } : {}),
                  },
                ],
              }
            : cb,
        ),
      },
      ctx.familyId,
      ctx.userId,
    );

    return {
      type: 'project',
      id: `${updated.id}:${params.categoryId}`,
      url: `/projects/${updated.id}`,
      // "estimate" is load-bearing: the activity log must not read as money spent.
      label: `${updated.name} — ${params.name} (${formatUsd(params.estimatedCost)} estimate)`,
    };
  },
});
