/**
 * ChatbotDataService — Read-Only Data Layer for AI Chatbot
 *
 * SECURITY BOUNDARY (SEC-001/003/004/005/018):
 * - Receives ONLY ReadOnlyDataService (no write methods available)
 * - Does NOT import PlaidService, AccountService, or any service with write capabilities
 * - All methods are read-only and require userId for data scoping (SEC-006)
 * - Reads directly from storage — never calls other service methods
 *
 * Storage keys used:
 * - transactions_{familyId}         — StoredTransaction[]
 * - accounts_{familyId}             — StoredAccount[] (Plaid-connected)
 * - manual_accounts_{familyId}      — ManualAccount[]
 * - budgets_{familyId}              — StoredBudget[]
 * - autocategorize_rules_{familyId} — StoredAutoCategorizeRule[]
 * - categories via getCategories(familyId)
 */

import { ReadOnlyDataService } from './readOnlyDataService';
import { getActiveTransactions } from './transactionReader';
import type {
  Category,
  Transaction,
  MonthlyBudget,
  AutoCategorizeRule,
  AccountSummary,
  ManualAccount,
  QueryTransactionsInput,
  CategorySpendingSummary,
  BudgetSummaryTotals,
  CashFlowSummary,
} from '../shared/types';
import {
  calculateIncome,
  calculateSavings,
  calculateSpending,
} from '../shared/utils/transactionCalculations';
import {
  calculateActualTotals,
  getSavingsCategoryIds,
  buildCategoryTreeAggregation,
} from '../shared/utils/budgetCalculations';

// Internal storage types (matching what's stored in JSON)
interface StoredTransaction {
  id: string;
  userId: string;
  accountId: string;
  plaidTransactionId: string | null;
  plaidAccountId: string;
  amount: number;
  date: string;
  name: string;
  userDescription: string | null;
  merchantName: string | null;
  category: string[] | null;
  plaidCategoryId: string | null;
  categoryId: string | null;
  status: string;
  pending: boolean;
  isoCurrencyCode: string | null;
  accountOwner?: string | null;
  originalDescription?: string | null;
  location?: {
    address: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    lat: number | null;
    lon: number | null;
  } | null;
  tags: string[];
  notes: string | null;
  isHidden: boolean;
  isFlagged?: boolean;
  isSplit: boolean;
  parentTransactionId: string | null;
  splitTransactionIds: string[];
  isManual?: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface StoredAccount {
  id: string;
  userId: string;
  plaidItemId: string;
  plaidAccountId: string;
  plaidAccessToken: string; // ENCRYPTED — must never be exposed
  institutionId: string;
  institutionName: string;
  accountName: string;
  officialName: string | null;
  nickname: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  creditLimit: number | null;
  currency: string;
  status: string;
  lastSynced: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface StoredBudget {
  id: string;
  userId: string;
  categoryId: string;
  month: string;
  amount: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface StoredAutoCategorizeRule {
  id: string;
  userId: string;
  description: string;
  patterns: string[];
  matchType: string;
  categoryId: string;
  categoryName?: string;
  userDescription?: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function manualCategoryToAccountType(category: ManualAccount['category']): AccountSummary['type'] {
  switch (category) {
    case 'real_estate':
    case 'vehicle':
    case 'cash':
    case 'crypto':
    case 'other_asset':
      return 'other';
    case 'retirement':
    case 'brokerage':
      return 'investment';
    case 'mortgage':
    case 'auto_loan':
    case 'student_loan':
    case 'personal_loan':
    case 'other_liability':
      return 'loan';
  }
}

export class ChatbotDataService {
  constructor(private readonly dataService: ReadOnlyDataService) {}

  /**
   * Query transactions with filters. All results scoped to familyId.
   */
  async queryTransactions(familyId: string, filters: QueryTransactionsInput): Promise<Transaction[]> {
    let results = await getActiveTransactions<StoredTransaction>(this.dataService, familyId);

    if (filters.startDate) {
      results = results.filter(t => t.date >= filters.startDate!);
    }
    if (filters.endDate) {
      results = results.filter(t => t.date <= filters.endDate!);
    }
    if (filters.onlyUncategorized) {
      results = results.filter(t => !t.categoryId);
    }
    if (filters.categoryIds?.length) {
      const ids = new Set(filters.categoryIds);
      results = results.filter(t => t.categoryId && ids.has(t.categoryId));
    }
    if (filters.accountIds?.length) {
      const ids = new Set(filters.accountIds);
      results = results.filter(t => ids.has(t.accountId));
    }
    if (filters.tags?.length) {
      const tagSet = new Set(filters.tags);
      results = results.filter(t => t.tags?.some(tag => tagSet.has(tag)));
    }
    if (filters.minAmount !== undefined) {
      results = results.filter(t => t.amount >= filters.minAmount!);
    }
    if (filters.maxAmount !== undefined) {
      results = results.filter(t => t.amount <= filters.maxAmount!);
    }
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      results = results.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.merchantName?.toLowerCase().includes(query) ||
        t.userDescription?.toLowerCase().includes(query)
      );
    }
    if (filters.status) {
      const isPending = filters.status === 'pending';
      results = results.filter(t => t.pending === isPending);
    }

    // Sort by date descending (most recent first)
    results.sort((a, b) => b.date.localeCompare(a.date));

    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results.map(this.toTransaction);
  }

  /**
   * Get all categories for a family.
   */
  async getCategories(familyId: string): Promise<Category[]> {
    return this.dataService.getCategories(familyId);
  }

  /**
   * Get monthly budgets for a specific month.
   */
  async getBudgets(familyId: string, month: string): Promise<MonthlyBudget[]> {
    const stored = await this.dataService.getData<StoredBudget[]>(`budgets_${familyId}`);
    if (!stored) return [];

    return stored
      .filter(b => b.month === month)
      .map(b => ({
        id: b.id,
        categoryId: b.categoryId,
        month: b.month,
        amount: b.amount,
      }));
  }

  /**
   * Get budget summary totals for a month (income, expense, savings, variance).
   *
   * Per CATEGORY-HIERARCHY-BUDGETING-BRD.md REQ-002 + REQ-017: budget totals are
   * computed using the canonical rollup. Each parent tree contributes its
   * effectiveBudget = max(directParentBudget, sum(children budgets)) so trees
   * where the user budgets at both levels are not double-counted. Actuals remain
   * additive (REQ-004).
   *
   * Per SAVINGS-CATEGORY-BRD: savings are a third bucket alongside income and
   * spending. Both budgets and actuals are split into income / spending / savings
   * symmetrically so variance numbers stay consistent.
   */
  async getBudgetSummary(familyId: string, month: string): Promise<BudgetSummaryTotals> {
    const [budgets, categories, transactions] = await Promise.all([
      this.getBudgets(familyId, month),
      this.getCategories(familyId),
      this.queryTransactions(familyId, {
        startDate: `${month}-01`,
        endDate: this.getMonthEndDate(month),
      }),
    ]);

    const savingsIds = getSavingsCategoryIds(categories);

    // Rollup-aware budget totals split into income / spending / savings.
    // Pass excludeSavings:false so savings trees are present, then bucket them
    // by parentId rather than relying on isIncome (which is false for savings).
    const trees = buildCategoryTreeAggregation(categories, budgets, new Map(), {
      excludeSavings: false,
      excludeTransfers: true,
      excludeHidden: true,
    });
    let totalBudgetedIncome = 0;
    let totalBudgetedExpense = 0;
    let totalBudgetedSavings = 0;
    for (const t of trees.values()) {
      if (savingsIds.has(t.parentId)) totalBudgetedSavings += t.effectiveBudget;
      else if (t.isIncome) totalBudgetedIncome += t.effectiveBudget;
      else totalBudgetedExpense += t.effectiveBudget;
    }

    const actualTotals = calculateActualTotals(
      transactions as unknown as import('../shared/types').Transaction[],
      categories,
      { excludeHidden: true },
    );

    const totalActualSavings = calculateSavings(
      transactions as unknown as import('../shared/utils/transactionCalculations').TransactionForCalculation[],
      savingsIds,
    );
    const actualSpending = actualTotals.expense - totalActualSavings;

    return {
      month,
      totalBudgetedIncome,
      totalActualIncome: actualTotals.income,
      totalBudgetedExpense,
      totalActualExpense: actualSpending,
      totalBudgetedSavings,
      totalActualSavings,
      netBudgeted: totalBudgetedIncome - totalBudgetedExpense,
      netActual: actualTotals.income - actualSpending,
      incomeVariance: actualTotals.income - totalBudgetedIncome,
      expenseVariance: totalBudgetedExpense - actualSpending,
    };
  }

  /**
   * Get account summaries — strips all sensitive fields (SEC-002).
   * Returns only safe display data: name, type, institution, balances.
   */
  async getAccounts(familyId: string): Promise<AccountSummary[]> {
    const [stored, manualStored] = await Promise.all([
      this.dataService.getData<StoredAccount[]>(`accounts_${familyId}`),
      this.dataService.getData<ManualAccount[]>(`manual_accounts_${familyId}`),
    ]);

    const plaidAccounts: AccountSummary[] = (stored ?? []).map(a => ({
      id: a.id,
      name: a.officialName || a.accountName,
      nickname: a.nickname,
      type: a.type as AccountSummary['type'],
      subtype: a.subtype,
      institution: a.institutionName,
      mask: a.mask,
      currentBalance: a.currentBalance ?? 0,
      availableBalance: a.availableBalance,
      isActive: a.status === 'active',
      status: a.status as AccountSummary['status'],
      lastSynced: a.lastSynced ? String(a.lastSynced) : null,
      // Intentionally EXCLUDES: plaidAccountId, plaidItemId, plaidAccessToken,
      // institutionId, creditLimit, currency, createdAt, updatedAt
    }));

    const manualAccounts: AccountSummary[] = (manualStored ?? []).map(a => ({
      id: a.id,
      name: a.name,
      nickname: null,
      type: manualCategoryToAccountType(a.category),
      subtype: a.category,
      institution: 'Manual',
      mask: null,
      currentBalance: a.currentBalance,
      availableBalance: null,
      isActive: true,
      status: 'active' as AccountSummary['status'],
      lastSynced: null,
    }));

    return [...plaidAccounts, ...manualAccounts];
  }

  /**
   * Get spending aggregated by category for a date range.
   *
   * Applies the canonical parent rollup rule per CATEGORY-HIERARCHY-BUDGETING-BRD.md
   * REQ-017: each row represents a full category tree (parent + all children rolled up).
   * Each row carries aggregation_level='parent_rollup' so the LLM never compares a
   * leaf to a rolled-up parent (which would double-count). For leaf-level forensic
   * detail the model can use query_transactions with specific child category IDs.
   */
  async getSpendingByCategory(
    familyId: string,
    startDate: string,
    endDate: string,
  ): Promise<CategorySpendingSummary[]> {
    const [transactions, categories] = await Promise.all([
      this.queryTransactions(familyId, { startDate, endDate }),
      this.getCategories(familyId),
    ]);

    // Build raw per-category spending and per-category transaction counts.
    // Filtering for savings/transfers/hidden happens inside buildCategoryTreeAggregation.
    const actualsByCategory = new Map<string, number>();
    const countsByCategory = new Map<string, number>();
    for (const t of transactions) {
      if (t.amount > 0 && t.categoryId && !t.isHidden) {
        actualsByCategory.set(t.categoryId, (actualsByCategory.get(t.categoryId) ?? 0) + t.amount);
        countsByCategory.set(t.categoryId, (countsByCategory.get(t.categoryId) ?? 0) + 1);
      }
    }

    // Roll up per parent tree using the canonical helper. Empty budgets are fine —
    // we only need the actuals rollup here.
    const trees = buildCategoryTreeAggregation(categories, [], actualsByCategory, {
      excludeSavings: true,
      excludeTransfers: true,
      excludeHidden: true,
    });

    const totalSpending = Array.from(trees.values()).reduce((sum, t) => sum + t.effectiveActual, 0);

    return Array.from(trees.values())
      .filter(t => t.effectiveActual > 0)
      .map(t => {
        // Sum transaction counts across the parent + all children in the tree.
        let count = countsByCategory.get(t.parentId) ?? 0;
        for (const child of t.children) count += countsByCategory.get(child.categoryId) ?? 0;
        return {
          categoryId: t.parentId,
          categoryName: t.parentName,
          amount: Math.round(t.effectiveActual * 100) / 100,
          transactionCount: count,
          percentage: totalSpending > 0 ? Math.round((t.effectiveActual / totalSpending) * 10000) / 100 : 0,
          aggregation_level: 'parent_rollup' as const,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }

  /**
   * Get cash flow summary for a date range.
   */
  async getCashFlow(familyId: string, startDate: string, endDate: string): Promise<CashFlowSummary> {
    const [transactions, categories] = await Promise.all([
      this.queryTransactions(familyId, { startDate, endDate }),
      this.getCategories(familyId),
    ]);
    const savingsIds = getSavingsCategoryIds(categories);

    // Use shared utilities for consistent calculation (excludes transfers, hidden, pending)
    const calcTransactions = transactions as unknown as import('../shared/utils/transactionCalculations').TransactionForCalculation[];
    const totalIncome = calculateIncome(calcTransactions);
    const totalSavings = calculateSavings(calcTransactions, savingsIds);
    const totalExpenses = calculateSpending(calcTransactions, savingsIds);
    const netCashFlow = totalIncome - totalExpenses;

    // Build monthly breakdown
    const monthlyMap = new Map<string, typeof transactions>();
    for (const t of transactions) {
      const month = t.date.substring(0, 7); // YYYY-MM
      if (!monthlyMap.has(month)) monthlyMap.set(month, []);
      monthlyMap.get(month)!.push(t);
    }

    const monthlyBreakdown = Array.from(monthlyMap.entries())
      .map(([month, txns]) => {
        const monthCalc = txns as unknown as import('../shared/utils/transactionCalculations').TransactionForCalculation[];
        return {
          month,
          income: calculateIncome(monthCalc),
          expenses: calculateSpending(monthCalc, savingsIds),
          savings: calculateSavings(monthCalc, savingsIds),
          net: calculateIncome(monthCalc) - calculateSpending(monthCalc, savingsIds),
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      startDate,
      endDate,
      totalIncome,
      totalExpenses,
      totalSavings,
      netCashFlow,
      monthlyBreakdown,
    };
  }

  /**
   * Get auto-categorization rules for a user.
   */
  async getAutoCategorizeRules(familyId: string): Promise<AutoCategorizeRule[]> {
    const stored = await this.dataService.getData<StoredAutoCategorizeRule[]>(
      `autocategorize_rules_${familyId}`,
    );
    if (!stored) return [];

    return stored.map(r => ({
      id: r.id,
      description: r.description,
      patterns: r.patterns,
      matchType: r.matchType as AutoCategorizeRule['matchType'],
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      userDescription: r.userDescription,
      priority: r.priority,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  // --- Private helpers ---

  private toTransaction(stored: StoredTransaction): Transaction {
    return {
      id: stored.id,
      plaidTransactionId: stored.plaidTransactionId,
      accountId: stored.accountId,
      amount: stored.amount,
      date: stored.date,
      name: stored.name,
      userDescription: stored.userDescription,
      merchantName: stored.merchantName,
      category: stored.category || [],
      plaidCategoryId: stored.plaidCategoryId,
      categoryId: stored.categoryId,
      pending: stored.pending,
      tags: stored.tags || [],
      notes: stored.notes,
      isHidden: stored.isHidden,
      isFlagged: stored.isFlagged || false,
      isManual: stored.isManual || false,
      isSplit: stored.isSplit,
      parentTransactionId: stored.parentTransactionId,
      splitTransactionIds: stored.splitTransactionIds || [],
      accountOwner: stored.accountOwner || null,
      originalDescription: stored.originalDescription || null,
      location: stored.location || null,
      createdAt: String(stored.createdAt),
      updatedAt: String(stored.updatedAt),
    };
  }

  private getMonthEndDate(month: string): string {
    const [year, monthNum] = month.split('-').map(Number);
    const lastDay = new Date(year, monthNum, 0).getDate();
    return `${month}-${String(lastDay).padStart(2, '0')}`;
  }
}
