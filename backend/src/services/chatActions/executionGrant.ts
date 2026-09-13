/**
 * Execution Grants
 *
 * Implements REQ-P002: a capability's tier must be enforced by the platform at
 * execution time, not by the action's own handler. A T1 action must be
 * structurally unable to execute without a consumed nonce.
 *
 * A grant is proof that authorization already happened. Handlers are no longer
 * reachable directly — `executeChatAction` requires one — so "did anyone check
 * the nonce?" stops being a question you answer by reading each handler.
 *
 * HONEST LIMIT: JavaScript has no module-private constructor, so a determined
 * caller inside this codebase could mint a grant it did not earn. What this
 * buys is that doing so requires an explicit, greppable, obviously-wrong line
 * of code rather than simply forgetting a check. The source scan in
 * __tests__/unit/executionGrantCallSites.test.ts is what turns "greppable" into
 * "enforced": it fails if anything outside proposalStore mints a confirmation
 * grant, or if anything outside registry.ts calls a handler directly. That, plus
 * the tier/basis checks in executeChatAction, is the enforceable version of
 * REQ-P002.
 */

const GRANT_BRAND: unique symbol = Symbol('chatActionExecutionGrant');

export type GrantBasis =
  /** T1 — a human clicked Confirm and a single-use nonce was consumed. */
  | 'user_confirmation'
  /** T2 — standing consent granted in advance for this specific automation. */
  | 'standing_consent';

export interface ExecutionGrant {
  readonly [GRANT_BRAND]: true;
  readonly actionId: string;
  readonly userId: string;
  readonly familyId: string;
  readonly basis: GrantBasis;
  /** The nonce that was consumed. Null only for standing-consent grants. */
  readonly proposalId: string | null;
}

/** Called by proposalStore after a nonce is successfully consumed. */
export function mintConfirmationGrant(args: {
  actionId: string;
  userId: string;
  familyId: string;
  proposalId: string;
}): ExecutionGrant {
  return {
    [GRANT_BRAND]: true,
    actionId: args.actionId,
    userId: args.userId,
    familyId: args.familyId,
    basis: 'user_confirmation',
    proposalId: args.proposalId,
  };
}

/**
 * Called by the T2 scheduler once standing consent and every SEC-P001–P004 gate
 * has been checked. No caller exists yet — T2 ships in Phase 5 — but the basis
 * is modelled now so the tier check below has something to reject against.
 */
export function mintStandingConsentGrant(args: {
  actionId: string;
  userId: string;
  familyId: string;
}): ExecutionGrant {
  return {
    [GRANT_BRAND]: true,
    actionId: args.actionId,
    userId: args.userId,
    familyId: args.familyId,
    basis: 'standing_consent',
    proposalId: null,
  };
}

export function isExecutionGrant(value: unknown): value is ExecutionGrant {
  return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[GRANT_BRAND] === true;
}
