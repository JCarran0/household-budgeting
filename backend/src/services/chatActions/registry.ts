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
import type { ChatActionId, ActionResource } from '../../shared/types';

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
  paramsSchema: z.ZodType<TParams>;
  execute: (
    params: TParams,
    ctx: ChatActionHandlerContext,
  ) => Promise<ActionResource>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry holds heterogeneous schemas
const registry = new Map<ChatActionId, ChatActionDefinition<any>>();

export function registerChatAction<T>(def: ChatActionDefinition<T>): void {
  if (registry.has(def.actionId)) {
    throw new Error(`Duplicate chat action registration: ${def.actionId}`);
  }
  registry.set(def.actionId, def);
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
