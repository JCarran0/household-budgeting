/**
 * add_project_line_item Chat Action (T1)
 *
 * AI-CAPABILITY-PLATFORM-BRD §9.2, plan task 3.2. Adds one estimate line to a
 * project.
 *
 * WHY dataClass IS 'financial' AND NOT 'content':
 * A line item carries a dollar figure inside a budget. It is not money that
 * moved, but it is money the household is planning around, and SEC-P003 draws
 * its line at the data rather than at the consequence. That classification is
 * what permanently excludes this action from T2 — an unattended agent must
 * never quietly adjust what a renovation is expected to cost.
 *
 * WHAT CHANGED IN PROJECTS-BRD v2.0:
 * Line items used to live inside a category budget and were never reconciled
 * against transactions — "estimates, full stop". Both halves of that are now
 * false. Line items are project-level (§5.5.2) and carry a `tag` that is
 * matched against the project's transactions to derive an actual (§5.5.5).
 *
 * Two consequences for this action:
 *   - No category is involved, so the old "refuse when the category has no
 *     budget" guard is gone. There is nothing to attach to but the project.
 *   - Adding a line item is no longer inert. A tag that existing transactions
 *     already carry claims that spend as this item's actual the moment the item
 *     exists. That is the feature working — the user applied those tags — but it
 *     is a visible consequence of a write, so describeCurrent puts it on the
 *     card rather than letting it surprise someone afterwards.
 *
 * It still never writes to a transaction. The tag is a label on the estimate;
 * matching is derived at read time.
 *
 * WHY A DUPLICATE TAG IS REFUSED:
 * Nothing in the data model forbids two line items sharing a tag, and by hand
 * that is the user's business. Proposed by a model it is almost always a
 * mistake: both items would report the same spend as their own actual, and a
 * later rename of one would take the other's matches with it.
 *
 * CONCURRENCY:
 * projectService.updateProject replaces the whole lineItems array, so this is a
 * read-modify-write with no optimistic lock — the same shape the app's own
 * project editor uses. The window is one service call wide. Undo now snapshots
 * the project's entire lineItems array (the old per-category scoping has no
 * meaning), so a concurrent edit to a DIFFERENT line item is protected by the
 * undo fingerprint check rather than by the narrowness of the snapshot: if
 * anyone touched the array in between, undo skips rather than clobbers.
 */

import { z } from 'zod';
import { registerChatAction } from './registry';
import { projectService, transactionService } from '../index';
import type { DisplayField, ProjectLineItem, StoredProject } from '../../shared/types';

const addLineItemParamsSchema = z.object({
  projectId: z.string().min(1),
  // Field rules mirror routes/projects.ts lineItemSchema (REQ-P011). The `id`
  // is deliberately absent: the server assigns it, and a model-chosen UUID
  // could collide with an existing item and overwrite it on save.
  name: z.string().min(1, 'Line item name is required').max(200),
  estimatedCost: z.number().min(0, 'Estimated cost must be >= 0'),
  // Normalized here rather than in the service so the card shows the tag that
  // will actually be stored and matched (SEC-P010).
  tag: z
    .string()
    .min(1, 'Line item tag is required')
    .max(100)
    .transform(t => t.trim().toLowerCase())
    .refine(t => t.length > 0, { message: 'Line item tag is required' })
    .refine(t => !t.startsWith('project:'), {
      message: 'Line item tags may not use the reserved "project:" prefix',
    }),
  notes: z.string().max(1000).optional(),
});

type AddLineItemParams = z.infer<typeof addLineItemParamsSchema>;

function lineItemsOf(project: StoredProject): ProjectLineItem[] {
  return [...(project.lineItems ?? [])];
}

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Spend already tagged for this line item, had it existed.
 *
 * Uses the AND form of the tag filter: a transaction must carry the project tag
 * AND the line item tag. The OR default would sweep in every transaction in the
 * project and overstate the figure enormously.
 */
async function spendAlreadyCarrying(
  projectTag: string,
  itemTag: string,
  familyId: string,
): Promise<{ total: number; count: number }> {
  const result = await transactionService.getTransactions(familyId, {
    tags: [projectTag, itemTag],
    tagsMatchAll: true,
  });
  const txns = result.transactions ?? [];
  return {
    total: txns.reduce((sum, t) => sum + t.amount, 0),
    count: txns.length,
  };
}

registerChatAction<AddLineItemParams>({
  actionId: 'add_project_line_item',
  label: 'Add a line item to a project budget',
  tier: 'T1',
  dataClass: 'financial',
  paramsSchema: addLineItemParamsSchema,

  /**
   * SEC-P030. projectId is model-supplied and is resolved here. The category
   * resolution this used to do is gone with the category.
   */
  async validateSemantics(params, ctx) {
    const project = await projectService.getProject(params.projectId, ctx.familyId);
    if (!project) {
      // Family-scoped read, so another household's id reads as missing.
      throw new Error(`That project no longer exists (${params.projectId}).`);
    }

    const clash = lineItemsOf(project).find(item => item.tag === params.tag);
    if (clash) {
      throw new Error(
        `"${project.name}" already has a line item tagged "${params.tag}" ("${clash.name}"). ` +
          `Two items sharing a tag would both claim the same spend — pick a different tag, ` +
          `or update the existing item instead.`,
      );
    }
  },

  /**
   * SEC-P011. The proposed cost is on the card; what it is being added TO has
   * to be there as well, or a $4,200 line reads the same under a $50,000 budget
   * as under a $500 one.
   *
   * The tag-match row is the one that matters most now: it is the difference
   * between "this records an intention" and "this immediately reports $412 of
   * money already spent".
   */
  async describeCurrent(params, ctx) {
    const project = await projectService.getProject(params.projectId, ctx.familyId);
    if (!project) return null;

    const existing = lineItemsOf(project);
    const estimated = existing.reduce((sum, item) => sum + item.estimatedCost, 0);
    const matched = await spendAlreadyCarrying(project.tag, params.tag, ctx.familyId);

    const fields: DisplayField[] = [
      {
        key: 'projectId',
        label: 'Project',
        value:
          project.totalBudget !== null
            ? `${project.name} — ${formatUsd(project.totalBudget)} budget`
            : project.name,
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
      {
        key: 'tag',
        label: 'Spend this tag already matches',
        value:
          matched.count === 0
            ? `No transactions in this project are tagged "${params.tag}" yet`
            : `${formatUsd(matched.total)} across ${matched.count} transaction${matched.count === 1 ? '' : 's'} ` +
              `tagged "${params.tag}" — this will show as the item's actual`,
        editable: false,
        type: 'text',
      },
    ];
    return fields;
  },

  /**
   * REQ-P025. Snapshots the project's whole lineItems array. The old
   * per-category scoping existed to avoid reversing a spouse's edit to an
   * unrelated category; with line items project-level there is no narrower unit
   * to scope to, so that protection now comes from the undo fingerprint check —
   * if the array changed after this write, undo skips it entirely.
   */
  undo: {
    kind: 'project',
    async capture(params, ctx) {
      const project = await projectService.getProject(params.projectId, ctx.familyId);
      if (!project) return null;
      return {
        recordId: params.projectId,
        before: lineItemsOf(project),
      };
    },
    async read(recordId, ctx) {
      const project = await projectService.getProject(recordId, ctx.familyId);
      return project ? lineItemsOf(project) : null;
    },
    async restore(recordId, before, ctx) {
      const project = await projectService.getProject(recordId, ctx.familyId);
      if (!project) return;
      const prior = before as ProjectLineItem[];

      await projectService.updateProject(
        recordId,
        { lineItems: prior },
        ctx.familyId,
        ctx.userId,
      );
    },
  },

  async execute(params, ctx) {
    const project = await projectService.getProject(params.projectId, ctx.familyId);
    if (!project) throw new Error(`That project no longer exists (${params.projectId}).`);

    const updated = await projectService.updateProject(
      params.projectId,
      {
        // The service assigns the UUID for an item that arrives without one.
        lineItems: [
          ...lineItemsOf(project),
          {
            name: params.name,
            estimatedCost: params.estimatedCost,
            tag: params.tag,
            ...(params.notes !== undefined ? { notes: params.notes } : {}),
          },
        ],
      },
      ctx.familyId,
      ctx.userId,
    );

    return {
      type: 'project',
      id: updated.id,
      url: `/projects/${updated.id}`,
      // "estimate" is load-bearing: the activity log must not read as money spent.
      label: `${updated.name} — ${params.name} (${formatUsd(params.estimatedCost)} estimate)`,
    };
  },
});
