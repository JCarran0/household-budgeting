/**
 * Capability Tiers & Data Classes
 *
 * Implements AI-CAPABILITY-PLATFORM-BRD §3 (REQ-P001 – REQ-P004, SEC-P003).
 *
 * The point of this file is that a capability's authorization requirements are
 * DATA on its registration, not prose in a comment and not a reviewer's memory.
 * The twentieth action added should face the same gates as the first without
 * anyone having to remember what the gates were.
 */

/** REQ-P001. T3 is deliberately not declarable — see BRD §3.3. */
export type CapabilityTier =
  /** Read. Authorized implicitly by an authenticated session. */
  | 'T0'
  /** Write, authorized by an explicit per-occurrence human click. */
  | 'T1'
  /** Write, authorized in advance by per-automation standing consent. */
  | 'T2';

/**
 * What an action touches. Drives SEC-P003 (bounded data class) and exists so
 * "is this safe to run unattended?" is answerable from the registration rather
 * than by reading the handler.
 */
export type DataClass =
  /** Classification and presentation only: category, tags, sort order, snooze, user descriptions. */
  | 'metadata'
  /** Money: budget amounts, splits, anything that changes a reported figure. */
  | 'financial'
  /** Records a user authored: task bodies, trip stops, line items. */
  | 'content'
  /** Leaves the system: GitHub, email, notifications, payments. */
  | 'external';

/**
 * SEC-P003: the ONLY data class an unattended action may touch.
 *
 * Deliberately a single entry. Widening this list is the single highest-leverage
 * mistake available in this codebase — it is the difference between "the AI can
 * mislabel a transaction" and "the AI can move money" — so it is a one-line
 * change that should never pass review quietly.
 */
export const T2_PERMITTED_DATA_CLASSES: readonly DataClass[] = ['metadata'] as const;

export function isTierValid(tier: unknown): tier is CapabilityTier {
  return tier === 'T0' || tier === 'T1' || tier === 'T2';
}

export function isDataClassValid(dataClass: unknown): dataClass is DataClass {
  return dataClass === 'metadata' || dataClass === 'financial'
    || dataClass === 'content' || dataClass === 'external';
}

export function isT2Eligible(dataClass: DataClass): boolean {
  return T2_PERMITTED_DATA_CLASSES.includes(dataClass);
}
