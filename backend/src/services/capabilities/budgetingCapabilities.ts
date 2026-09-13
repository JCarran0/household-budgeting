/**
 * Budgeting Read Capabilities (T0).
 *
 * AI-CAPABILITY-PLATFORM-BRD §9.1. Extracted from readCapabilities.ts when the
 * Phase 2 planning domains landed and that file approached its size budget;
 * the definitions are unchanged.
 *
 * REQ-P019 governs every description here: it must describe what the executor
 * actually returns. get_budgets is the cautionary case — it advertised
 * "actuals" it never returned, which is the mechanism behind the Subaru
 * incident (§15.1). Its description now states the opposite explicitly.
 */

import type { ReadCapability } from './readCapabilities';
import type {
  QueryTransactionsInput,
  GetBudgetsInput,
  GetBudgetSummaryInput,
  GetSpendingByCategoryInput,
  GetCashFlowInput,
} from '../../shared/types';

export const BUDGETING_CAPABILITIES: ReadCapability[] = [
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
