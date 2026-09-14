/**
 * Chat Action Registry
 *
 * Central registry for allowlisted chat actions. Only actions registered here
 * can be proposed by the LLM and confirmed by users.
 *
 * SECURITY (SEC-A003): The registry is the authoritative allowlist. A
 * confirmation request with an actionId not in this registry is rejected at
 * the edge before any business logic runs.
 *
 * SECURITY: Using a Map (not a plain object) prevents prototype pollution
 * if an attacker somehow supplied an actionId like '__proto__'.
 */

import { z } from 'zod';
import type { ChatActionId, ActionResource, DisplayField } from '../../shared/types';
import {
  isDataClassValid,
  isT2Eligible,
  isTierValid,
  type CapabilityTier,
  type DataClass,
} from './tiers';
import { isExecutionGrant, type ExecutionGrant } from './executionGrant';
import type { UndoCapability } from './undoSnapshot';

/** Context passed to every action handler — populated from the session JWT. */
export interface ChatActionHandlerContext {
  userId: string;
  familyId: string;
  // Intentionally does NOT include: LLM output, proposal metadata,
  // attachment data, or any elevated privileges. (SEC-A001, SEC-A002)
}

export interface ChatActionDefinition<TParams> {
  actionId: ChatActionId;
  label: string;                // Human-readable, e.g. "Create a task"
  /**
   * REQ-P001. Write actions are T1 or T2 only — T0 is the read tier and does
   * not belong in the action registry.
   */
  tier: Exclude<CapabilityTier, 'T0'>;
  /** SEC-P003. Gates T2 eligibility; see tiers.ts. */
  dataClass: DataClass;
  paramsSchema: z.ZodType<TParams>;
  /**
   * Not called directly. Reached only through executeChatAction, which requires
   * an ExecutionGrant proving authorization already happened (REQ-P002).
   */
  execute: (
    params: TParams,
    ctx: ChatActionHandlerContext,
  ) => Promise<ActionResource>;
  /**
   * SEC-P011: describe the record this action would overwrite, so the plan card
   * can show current-vs-proposed rather than only the destination.
   *
   * Deliberately server-side and action-owned: the propose_action tool schema
   * has no field for current values, so the model cannot narrate what it is
   * about to replace. Creates have nothing to overwrite and omit this; the
   * first implementers are the Phase 3 update actions.
   */
  describeCurrent?: (
    params: TParams,
    ctx: ChatActionHandlerContext,
  ) => Promise<DisplayField[] | null>;
  /**
   * SEC-P030: resolve every model-supplied identifier against live data.
   *
   * Zod proves a value is well-formed, not that it refers to something real.
   * A well-formed taskId for a task in another family, a categoryId that has
   * gone orphaned, an assigneeId for someone who left the household — all pass
   * `paramsSchema` and all must fail before a write.
   *
   * WHY THIS IS A SEPARATE HOOK RATHER THAN A CHECK INSIDE `execute`:
   * REQ-P023 requires all-or-nothing validation across the batch. The confirm
   * route runs every row's `validateSemantics` in its own pass, after all rows
   * have parsed and before any row executes. A check living inside `execute`
   * would fire on row 3 only after rows 1 and 2 had already written, which is
   * precisely the partial-application state REQ-P023 exists to prevent.
   *
   * Throw to reject. The thrown message is shown to the user, so it must name
   * what could not be resolved and must not leak anything from another family.
   */
  validateSemantics?: (
    params: TParams,
    ctx: ChatActionHandlerContext,
  ) => Promise<void>;
  /**
   * REQ-P025 – REQ-P027. How this action is reversed, or absent if it cannot
   * be. See UndoCapability for why it is three functions and why omitting it
   * is the safe default.
   */
  undo?: UndoCapability<TParams>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry holds heterogeneous schemas
const registry = new Map<ChatActionId, ChatActionDefinition<any>>();

/**
 * REQ-P014: registration fails fast at startup rather than at first use.
 *
 * A misdeclared action should break the boot, not sit dormant until the day the
 * model happens to propose it.
 */
export function registerChatAction<T>(def: ChatActionDefinition<T>): void {
  if (registry.has(def.actionId)) {
    throw new Error(`Duplicate chat action registration: ${def.actionId}`);
  }
  // Read through `unknown`: the type already excludes T0, but registration is a
  // startup boundary and a missing or bogus tier from an untyped/cast call site
  // should fail loudly rather than slip through on the strength of a type that
  // was erased at runtime.
  const declaredTier: unknown = def.tier;
  if (!isTierValid(declaredTier) || declaredTier === 'T0') {
    throw new Error(
      `Chat action ${def.actionId} must declare tier 'T1' or 'T2' (got ${String(declaredTier)})`,
    );
  }
  if (!isDataClassValid(def.dataClass)) {
    throw new Error(
      `Chat action ${def.actionId} must declare a valid dataClass (got ${String(def.dataClass)})`,
    );
  }
  if (def.tier === 'T2' && !isT2Eligible(def.dataClass)) {
    throw new Error(
      `Chat action ${def.actionId} declares tier T2 with dataClass '${def.dataClass}'. ` +
        `Unattended execution is permitted only for metadata (SEC-P003).`,
    );
  }
  registry.set(def.actionId, def);
}

/**
 * The only way to run an action's handler (REQ-P002).
 *
 * Verifies the grant is genuine, was issued for THIS action, and that its basis
 * matches the action's tier — a standing-consent grant can never execute a T1
 * action, and a confirmation grant must carry the nonce it consumed.
 */
export async function executeChatAction<T>(
  def: ChatActionDefinition<T>,
  params: T,
  grant: ExecutionGrant,
): Promise<ActionResource> {
  if (!isExecutionGrant(grant)) {
    throw new Error(`Refusing to execute ${def.actionId}: no valid execution grant`);
  }
  if (grant.actionId !== def.actionId) {
    throw new Error(
      `Execution grant mismatch: grant is for ${grant.actionId}, action is ${def.actionId}`,
    );
  }
  if (def.tier === 'T1' && (grant.basis !== 'user_confirmation' || !grant.proposalId)) {
    throw new Error(
      `Refusing to execute T1 action ${def.actionId}: requires a consumed user confirmation`,
    );
  }
  if (def.tier === 'T2' && grant.basis !== 'standing_consent' && grant.basis !== 'user_confirmation') {
    throw new Error(`Refusing to execute T2 action ${def.actionId}: unrecognized grant basis`);
  }

  // SEC-A001/A002: identity comes from the grant, which came from the JWT —
  // never from the proposal body or model output.
  return def.execute(params, { userId: grant.userId, familyId: grant.familyId });
}

/** Actions declared safe for unattended execution. Asserted against a fixed list (REQ-P015). */
export function listT2ActionIds(): ChatActionId[] {
  return Array.from(registry.values())
    .filter(def => def.tier === 'T2')
    .map(def => def.actionId)
    .sort();
}

export function getChatAction(
  actionId: string,
): ChatActionDefinition<unknown> | null {
  if (!registry.has(actionId as ChatActionId)) return null;
  return registry.get(actionId as ChatActionId) ?? null;
}

export function listChatActionIds(): ChatActionId[] {
  return Array.from(registry.keys());
}
