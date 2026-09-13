/**
 * Read Capability Registry (T0)
 *
 * Implements AI-CAPABILITY-PLATFORM-BRD REQ-P010 and REQ-P016 – REQ-P019.
 *
 * Before this existed, a read tool lived in two unrelated places: a definition
 * in chatbotPrompt.ts and a `case` in chatbotService's dispatch switch. Adding
 * one meant remembering both, and the two could drift — which is exactly how
 * get_budgets ended up advertising "actuals" it never returned (BRD §15.1).
 *
 * Here the definition and its executor are one object. The array sent to the
 * model is DERIVED from this list, so a tool cannot exist for the model without
 * an executor, or vice versa.
 *
 * Every entry is tier T0: reads are authorized implicitly by an authenticated
 * session. Writes live in the chat action registry, are never exposed as tools,
 * and reach the model only through propose_action.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ChatbotDataService } from '../chatbotDataService';
import type { DataClass } from '../chatActions/tiers';
import { RECORD_LEARNING_TOOL, buildProposeActionTool } from './platformTools';
// registry.ts directly, NOT the chatActions barrel: the barrel pulls in the
// action modules, which reach back through routes into this module. Importing
// the leaf keeps that cycle out of the picture; the empty-registry guard in
// platformTools() is what catches being called before registration has run.
import { listChatActionIds } from '../chatActions/registry';
import { BUDGETING_CAPABILITIES } from './budgetingCapabilities';
import { PLANNING_CAPABILITIES } from './planningCapabilities';

/** Grouping for REQ-P018 progressive disclosure once the surface outgrows a flat list. */
export type CapabilityDomain = 'budgeting' | 'tasks' | 'trips' | 'projects';

export interface ReadCapability {
  name: string;
  tier: 'T0';
  domain: CapabilityDomain;
  /** What this read exposes. Reads cannot mutate, but they can still leak. */
  dataClass: DataClass;
  definition: Anthropic.Tool;
  execute: (input: Record<string, unknown>, data: ChatbotDataService, familyId: string) => Promise<unknown>;
}

export const READ_CAPABILITIES: ReadCapability[] = [
  ...BUDGETING_CAPABILITIES,
  ...PLANNING_CAPABILITIES,
];

/** Platform tools. Not capabilities — they mediate access rather than expose data. */
function platformTools(): Anthropic.Tool[] {
  const actionIds = listChatActionIds();
  if (actionIds.length === 0) {
    // An empty enum would silently ship a propose_action tool that can never
    // name a valid action. Fail at boot, consistent with registerChatAction.
    throw new Error('No chat actions registered — cannot build propose_action tool schema');
  }
  return [RECORD_LEARNING_TOOL, buildProposeActionTool(actionIds)];
}

export interface BuildToolsOptions {
  /**
   * REQ-P016. Yields an empty tool surface. This is a belt to the route guard's
   * braces, NOT the enforcement point: the Business Workspace exclusion is
   * enforced by refuseBusinessWorkspace in routes/chatbot.ts, which refuses the
   * request before a tool surface is ever built. A flag consulted only when
   * someone remembers to pass it is not a security control.
   */
  aiEnabled?: boolean;
  /** Restrict to specific domains. Unset means every registered domain. */
  domains?: CapabilityDomain[];
}

/**
 * Derive the tool array sent to Claude (REQ-P010).
 *
 * REQ-P017: the final tool carries the cache_control breakpoint so the whole
 * block is a cacheable prefix. Order is stable — read capabilities in
 * registration order, then platform tools — because reordering invalidates the
 * cache for every subsequent turn.
 */
/**
 * BOOT ORDER: propose_action's actionId enum is read from the chat action
 * registry, so `services/chatActions` must have been imported (which runs the
 * registrations) before this is called. Production satisfies this through
 * services/index; callers that import this module in isolation must import the
 * barrel themselves. Calling it too early throws rather than shipping an empty
 * enum.
 */
export function buildChatbotTools(options: BuildToolsOptions = {}): Anthropic.Tool[] {
  const { aiEnabled = true, domains } = options;
  if (!aiEnabled) return [];

  const reads = READ_CAPABILITIES
    .filter(c => !domains || domains.includes(c.domain))
    .map(c => c.definition);

  const tools = [...reads, ...platformTools()];

  return tools.map((tool, i, arr) =>
    i === arr.length - 1
      ? { ...tool, cache_control: { type: 'ephemeral' as const } }
      : tool,
  );
}

const byName = new Map(READ_CAPABILITIES.map(c => [c.name, c]));

export function getReadCapability(name: string): ReadCapability | undefined {
  return byName.get(name);
}
