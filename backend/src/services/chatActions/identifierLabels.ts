/**
 * Server-side resolution of the identifiers a proposal targets — SEC-P010.
 *
 * WHY THIS EXISTS
 * `proposalRows` renders every display value from the parsed params so the card
 * and the handler cannot disagree. Identifiers were carved out of that rule: a
 * UUID is not something a human can check, so the model's resolved name
 * ("Groceries") was kept as the only readable rendering.
 *
 * An adversarial review showed the carve-out was wider than its justification.
 * It holds for the SUBJECT of a write — the transaction being recategorized —
 * because `describeCurrent` names that record from the server. It does not hold
 * for the TARGET: nothing on the card resolved the category a transaction was
 * moving TO, the member a task was being reassigned TO, or the project a line
 * item was being added TO. `validateSemantics` proves such an id EXISTS; it
 * never proves it is the one named on the card. So a row could read
 * "Category: Groceries" and write `cat-vacation`, and for
 * `set_transaction_category` — the flagship candidate for unattended writes —
 * there would be no reviewer at all.
 *
 * These resolvers close that. A key with a resolver here is rendered by the
 * server from live data; the model's text for it is discarded like every other
 * value. A key without one still falls back to the model, and that residual is
 * now a short, enumerated list rather than "every id in the system".
 *
 * A lookup that finds nothing renders as `Unknown … (id)` rather than throwing:
 * the row is about to fail semantic validation anyway, and a card that says so
 * is more useful than a card that silently loses the field.
 */

import { categoryService, familyService, taskService, tripService, projectService } from '../index';
import type { ChatActionHandlerContext } from './registry';

type Resolver = (id: string, ctx: ChatActionHandlerContext) => Promise<string>;

const RESOLVERS: Record<string, Resolver> = {
  categoryId: async (id, ctx) => {
    const category = await categoryService.getCategoryById(id, ctx.familyId);
    return category?.name ?? `Unknown category (${id})`;
  },

  assigneeId: async (id, ctx) => {
    const members = await familyService.getFamilyMembers(ctx.familyId);
    return members.find(m => m.userId === id)?.displayName ?? `Unknown member (${id})`;
  },

  taskId: async (id, ctx) => {
    const task = await taskService.getTask(id, ctx.familyId);
    return task?.title ?? `Unknown task (${id})`;
  },

  tripId: async (id, ctx) => {
    const trip = await tripService.getTrip(id, ctx.familyId);
    return trip?.name ?? `Unknown trip (${id})`;
  },

  projectId: async (id, ctx) => {
    const project = await projectService.getProject(id, ctx.familyId);
    return project?.name ?? `Unknown project (${id})`;
  },
};

/** Keys the server can render itself. Everything else falls back to the model. */
export function hasIdentifierResolver(key: string): boolean {
  return key in RESOLVERS;
}

/**
 * Resolve one identifier param to a human-readable name.
 *
 * `null` is meaningful, not missing: these fields are nullable precisely
 * because clearing them is a write ("unassign", "uncategorize"), and a cleared
 * field that renders as a name is the most misleading thing a card can do.
 */
export async function resolveIdentifier(
  key: string,
  value: unknown,
  ctx: ChatActionHandlerContext,
): Promise<string | null> {
  const resolver = RESOLVERS[key];
  if (!resolver) return null;

  if (value === null) return '(cleared)';
  if (typeof value !== 'string' || value.length === 0) return null;

  try {
    return await resolver(value, ctx);
  } catch {
    // A failed lookup must not take down the proposal — same trade as
    // describeCurrent. The id itself is still shown, so the row stays honest
    // about what it would write.
    return `Unresolved (${value})`;
  }
}
