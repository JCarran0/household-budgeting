/**
 * Who is allowed to create an account (SA-10).
 *
 * `POST /auth/register` was fully public, gated only by rate limiting and Zod.
 * Without a `joinCode` it provisioned a brand-new user *and* a brand-new family,
 * so anyone on the internet could create accounts at will. On its own that is
 * storage growth and log noise. Chained with the `ADMIN_USERNAMES` bootstrap it
 * was a privilege-escalation path: registering a username that appeared in that
 * allowlist but had never been registered would silently promote the registrant
 * to admin on their first admin request, reaching cross-family data migrations.
 * That chain is broken from both ends — see `adminMiddleware.ts` for the other.
 *
 * Registration is now allowed only when one of these holds:
 *
 *   1. A valid, unconsumed `joinCode` — the intended way to add a person to an
 *      existing family. The product already supports issuing these
 *      (`routes/family.ts` → `createInvitation`, surfaced in Settings).
 *   2. No users exist yet — first-run bootstrap. A fresh install or a restore
 *      into an empty store has to be able to create its first account, and this
 *      requires no configuration to get right, so there is nothing to forget.
 *      It closes by itself the moment that first account exists.
 *   3. `ALLOW_OPEN_REGISTRATION=true` — an explicit escape hatch for development
 *      and tests, defaulting to closed.
 *
 * Read at call time rather than from the `config` singleton, which is frozen at
 * import. That mirrors `adminMiddleware.readAdminUsernames` and, more
 * importantly, lets the closed path be tested for real. SA-11 records the
 * opposite mistake: rate limiting is short-circuited under `NODE_ENV=test`, so
 * a test asserting it would exercise nothing. A security control keyed off the
 * environment is a control nobody has run.
 */

import type { User } from './dataService';

export type RegistrationDecision =
  | { allowed: true; reason: 'join_code' | 'bootstrap' | 'open_registration_enabled' }
  | { allowed: false; reason: 'closed' };

/** Explicit opt-in only. Anything other than "true" leaves registration closed. */
export function openRegistrationEnabled(): boolean {
  return (process.env.ALLOW_OPEN_REGISTRATION ?? '').trim().toLowerCase() === 'true';
}

/**
 * @param hasValidJoinCode caller has already validated the code against
 *   `familyService.validateInvitation` — this module does not re-check it.
 * @param existingUsers every user in storage; empty means first-run.
 */
export function decideRegistration(
  hasValidJoinCode: boolean,
  existingUsers: Pick<User, 'id'>[],
): RegistrationDecision {
  if (hasValidJoinCode) return { allowed: true, reason: 'join_code' };
  if (existingUsers.length === 0) return { allowed: true, reason: 'bootstrap' };
  if (openRegistrationEnabled()) return { allowed: true, reason: 'open_registration_enabled' };
  return { allowed: false, reason: 'closed' };
}

/** Deliberately does not say which condition failed, or whether users exist. */
export const REGISTRATION_CLOSED_MESSAGE =
  'Registration is by invitation only. Ask a family member for an invite code.';
