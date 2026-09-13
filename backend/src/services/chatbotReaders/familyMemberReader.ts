/**
 * Family Member Resolution for AI Read Tools
 *
 * SEC-P032: a tool result carrying a bare userId forces the model to join
 * across tools, and an incomplete join is a confabulation trigger — the exact
 * mechanism behind the Subaru incident (AI-CAPABILITY-PLATFORM-BRD §15.1).
 * Every tool that returns an assignee, creator, or completer resolves the name
 * here first.
 *
 * SECURITY — WHY THIS IS NOT A ONE-LINER:
 * Families live in a single GLOBAL storage blob (`families` -> { families: [] }),
 * not in a per-family key. A naive `getData('families')` inside a read tool
 * would hand the model every family's member roster in the deployment. This
 * module is the only place AI code may touch that blob, and it selects the one
 * family by id before anything is returned. Widening what this returns, or
 * returning the blob itself, is a cross-tenant leak.
 *
 * It is also deliberately narrow in the other direction: FamilyMember carries
 * only userId/displayName/joinedAt/color, but nothing here returns joinedAt or
 * color either. Tools need a display name; they do not need a roster.
 */

import type { Family } from '../../shared/types';

/** Minimal read interface — satisfied by ReadOnlyDataService (SEC-018). */
export interface FamilyMemberDataReader {
  getData<T>(key: string): Promise<T | null>;
}

const FAMILIES_KEY = 'families';

/** What a tool is allowed to learn about a household member. Nothing more. */
export interface ResolvedMember {
  userId: string;
  displayName: string;
}

/**
 * Resolve userId -> displayName for ONE family.
 *
 * Returns a Map rather than an array so callers cannot accidentally iterate a
 * roster they only meant to look up.
 */
export async function getFamilyMemberNames(
  dataReader: FamilyMemberDataReader,
  familyId: string,
): Promise<Map<string, string>> {
  const blob = await dataReader.getData<{ families: Family[] }>(FAMILIES_KEY);
  const family = (blob?.families ?? []).find(f => f.id === familyId);
  // No family, or a family with no members, yields an empty map. Callers must
  // treat an unresolved id as "unknown", never as "no assignee" (SEC-P033).
  return new Map((family?.members ?? []).map(m => [m.userId, m.displayName]));
}

/** List the members of ONE family, for tools that legitimately need the roster. */
export async function listFamilyMembers(
  dataReader: FamilyMemberDataReader,
  familyId: string,
): Promise<ResolvedMember[]> {
  const names = await getFamilyMemberNames(dataReader, familyId);
  return [...names].map(([userId, displayName]) => ({ userId, displayName }));
}

/**
 * Render a userId for a tool result.
 *
 * SEC-P033: "nobody is assigned" and "assigned to someone I cannot name" are
 * different facts and must not collapse into the same output. A null id is
 * unassigned; an id with no matching member is an orphan, which this app is
 * known to produce for categories and could produce here after a member is
 * removed.
 */
export function describeAssignee(
  userId: string | null,
  names: Map<string, string>,
): { userId: string | null; name: string | null; unresolved: boolean } {
  if (userId === null) return { userId: null, name: null, unresolved: false };
  const name = names.get(userId);
  if (name === undefined) return { userId, name: null, unresolved: true };
  return { userId, name, unresolved: false };
}
