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
import type {
  QueryTransactionsInput,
  GetBudgetsInput,
  GetBudgetSummaryInput,
  GetSpendingByCategoryInput,
  GetCashFlowInput,
} from '../../shared/types';

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
  {
    name: 'query_transactions',
    tier: 'T0',
    domain: 'budgeting',
    dataClass: 'financial',
    definition: {
        name: 'query_transactions',
        description:
          'Search and filter the user\'s transactions. Use this for questions about specific purchases, merchants, or transaction details. Supports filtering by date range, category, account, tags, amount range, text search, and status.\n\n' +
          'Response shape: { count, truncated, limit, transactions, summary? }. `count` is the TOTAL number of matches (not the length of `transactions`). `transactions` is capped at `limit` (default 50, hard max 500) — when `truncated=true`, the array is only a SAMPLE of the most recent `limit` matches and a `summary` is provided with `byCategory` and `byMonth` aggregates over the FULL result set, which is usually enough to answer aggregate questions without pulling every row. If you genuinely need more than the default 50 rows (e.g. user asks to list every transaction of a kind), request them by passing a larger `limit`. Prefer tighter filters (narrower date range, specific categoryIds) before bumping `limit`.',
        input_schema: {
          type: 'object' as const,
          properties: {
            startDate: { type: 'string', description: 'Start date (YYYY-MM-DD). Defaults to 12 months ago if omitted.' },
            endDate: { type: 'string', description: 'End date (YYYY-MM-DD). Defaults to today if omitted.' },
            categoryIds: { type: 'array', items: { type: 'string' }, description: 'Filter by category IDs' },
            accountIds: { type: 'array', items: { type: 'string' }, description: 'Filter by account IDs' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
            minAmount: { type: 'number', description: 'Minimum amount (raw value: positive = expenses, negative = income). Use 0 to get expenses only.' },
            maxAmount: { type: 'number', description: 'Maximum amount (raw value: positive = expenses, negative = income). Use 0 to get income only.' },
            searchQuery: { type: 'string', description: 'Search transaction names, merchants, and descriptions' },
            status: { type: 'string', enum: ['pending', 'posted'], description: 'Filter by transaction status' },
            onlyUncategorized: { type: 'boolean', description: 'If true, return only transactions with no category assigned' },
            limit: { type: 'number', description: 'Max rows returned in `transactions` (default 50, hard max 500). Does NOT affect `count` or `summary`.' },
          },
          required: [],
        },
      },
    execute: (input, data, familyId) => data.queryTransactionsForTool(familyId, input as unknown as QueryTransactionsInput),
  },
  {
    name: 'get_categories',
    tier: 'T0',
    domain: 'budgeting',
    dataClass: 'metadata',
    definition: {
        name: 'get_categories',
        description:
          'Get all budget categories and subcategories. Use this to understand the category hierarchy, find category IDs for other queries, or answer questions about how spending is organized.',
        input_schema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
    execute: (_input, data, familyId) => data.getCategories(familyId),
  },
  {
    name: 'get_budgets',
    tier: 'T0',
    domain: 'budgeting',
    dataClass: 'financial',
    definition: {
        name: 'get_budgets',
        description:
          'Get the BUDGETED AMOUNTS set for a specific month, by category. Returns budgeted amounts only — it does NOT return actual spending; use get_spending_by_category or get_budget_summary for actuals. ' +
          'Each line carries the resolved category name and path, so you never need to join against get_categories. ' +
          'Each line also carries hasBudget: when hasBudget is false the category exists but has NO budget set for that month (treat it as $0 budgeted, not as unknown). ' +
          'To check one specific category, pass categoryQuery — every matching category is returned with an explicit hasBudget flag. ' +
          'Without categoryQuery, only categories that HAVE a budget are listed; categoriesWithoutBudget reports how many were omitted. ' +
          'Never state a budget amount that did not come back in this result.',
        input_schema: {
          type: 'object' as const,
          properties: {
            month: { type: 'string', description: 'Month in YYYY-MM format' },
            categoryQuery: {
              type: 'string',
              description:
                'Optional case-insensitive substring match on category name or full path (e.g. "maintenance", "auto & transport"). Use this whenever the user asks about a specific category.',
            },
          },
          required: ['month'],
        },
      },
    execute: (input, data, familyId) => data.getBudgetsForTool(familyId, (input as unknown as GetBudgetsInput).month, (input as unknown as GetBudgetsInput).categoryQuery),
  },
  {
    name: 'get_budget_summary',
    tier: 'T0',
    domain: 'budgeting',
    dataClass: 'financial',
    definition: {
        name: 'get_budget_summary',
        description:
          'Get budget totals breakdown for a month: budgeted vs actual for income, spending (excludes savings), and savings, plus net amounts and variances. Use this for high-level "are we on track?" questions. Budget totals are rollup-aware: each parent tree contributes max(parent budget, sum of children budgets), so trees with both-level budgets are not double-counted. Spending and savings are reported as separate buckets so variance reads correctly even when the user budgets retirement contributions.',
        input_schema: {
          type: 'object' as const,
          properties: {
            month: { type: 'string', description: 'Month in YYYY-MM format' },
          },
          required: ['month'],
        },
      },
    execute: (input, data, familyId) => data.getBudgetSummary(familyId, (input as unknown as GetBudgetSummaryInput).month),
  },
  {
    name: 'get_accounts',
    tier: 'T0',
    domain: 'budgeting',
    dataClass: 'financial',
    definition: {
        name: 'get_accounts',
        description:
          'Get connected bank accounts with names, types, institutions, and current balances. Use for account-related questions or to identify account IDs for transaction filtering.',
        input_schema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
    execute: (_input, data, familyId) => data.getAccounts(familyId),
  },
  {
    name: 'get_spending_by_category',
    tier: 'T0',
    domain: 'budgeting',
    dataClass: 'financial',
    definition: {
        name: 'get_spending_by_category',
        description:
          'Get spending aggregated by category for a date range. Returns one row per parent category tree (children rolled up into the parent total). Each row carries aggregation_level=\'parent_rollup\' — never compare it to leaf-level data. Best for "where is our money going?" questions. For subcategory drill-down, follow up with query_transactions filtered by specific child category IDs.',
        input_schema: {
          type: 'object' as const,
          properties: {
            startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
            endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
          },
          required: ['startDate', 'endDate'],
        },
      },
    execute: (input, data, familyId) => data.getSpendingByCategory(familyId, (input as unknown as GetSpendingByCategoryInput).startDate, (input as unknown as GetSpendingByCategoryInput).endDate),
  },
  {
    name: 'get_cash_flow',
    tier: 'T0',
    domain: 'budgeting',
    dataClass: 'financial',
    definition: {
        name: 'get_cash_flow',
        description:
          'Get income, expenses, and net cash flow for a date range, with a month-by-month breakdown. Best for trend analysis and "how much are we saving?" questions.',
        input_schema: {
          type: 'object' as const,
          properties: {
            startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
            endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
          },
          required: ['startDate', 'endDate'],
        },
      },
    execute: (input, data, familyId) => data.getCashFlow(familyId, (input as unknown as GetCashFlowInput).startDate, (input as unknown as GetCashFlowInput).endDate),
  },
  {
    name: 'get_auto_categorization_rules',
    tier: 'T0',
    domain: 'budgeting',
    dataClass: 'metadata',
    definition: {
        name: 'get_auto_categorization_rules',
        description:
          'Get auto-categorization rules that automatically assign categories to transactions based on patterns. Use when answering questions about how transactions get categorized.',
        input_schema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
    execute: (_input, data, familyId) => data.getAutoCategorizeRules(familyId),
  },
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
