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
 * - transactions_{userId}    — StoredTransaction[]
 * - accounts_{userId}        — StoredAccount[]
 * - budgets_{userId}         — StoredBudget[]
 * - autocategorize_rules_{userId} — StoredAutoCategorizeRule[]
 * - categories via getCategories(userId)
 */

import { ReadOnlyDataService } from './readOnlyDataService';
import type {
  Category,
  Transaction,
  MonthlyBudget,
  AutoCategorizeRule,
  AccountSummary,
  QueryTransactionsInput,
  CategorySpendingSummary,
  BudgetSummaryTotals,
  CashFlowSummary,
} from '../shared/types';
import {
  calculateIncome,
  calculateExpenses,
  calculateNetCashFlow,
} from '../shared/utils/transactionCalculations';
import {
  calculateBudgetTotals,
  calculateActualTotals,
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
  tags: string[];
  notes: string | null;
  isHidden: boolean;
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

export class ChatbotDataService {
  constructor(private readonly dataService: ReadOnlyDataService) {}

  /**
   * Query transactions with filters. All results scoped to userId.
   */
  async queryTransactions(userId: string, filters: QueryTransactionsInput): Promise<Transaction[]> {
    const stored = await this.dataService.getData<StoredTransaction[]>(`transactions_${userId}`);
    if (!stored) return [];

    let results = stored;

    if (filters.startDate) {
      results = results.filter(t => t.date >= filters.startDate!);
    }
    if (filters.endDate) {
      results = results.filter(t => t.date <= filters.endDate!);
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
      results = results.filter(t => Math.abs(t.amount) >= filters.minAmount!);
    }
    if (filters.maxAmount !== undefined) {
      results = results.filter(t => Math.abs(t.amount) <= filters.maxAmount!);
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
   * Get all categories for a user.
   */
  async getCategories(userId: string): Promise<Category[]> {
    return this.dataService.getCategories(userId);
  }

  /**
   * Get monthly budgets for a specific month.
   */
  async getBudgets(userId: string, month: string): Promise<MonthlyBudget[]> {
    const stored = await this.dataService.getData<StoredBudget[]>(`budgets_${userId}`);
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
   * Get budget summary totals for a month (income, expense, variance).
   */
  async getBudgetSummary(userId: string, month: string): Promise<BudgetSummaryTotals> {
    const [budgets, categories, transactions] = await Promise.all([
      this.getBudgets(userId, month),
      this.getCategories(userId),
      this.queryTransactions(userId, {
        startDate: `${month}-01`,
        endDate: this.getMonthEndDate(month),
      }),
    ]);

    const budgetTotals = calculateBudgetTotals(budgets, categories, { excludeHidden: true });
    const actualTotals = calculateActualTotals(
      transactions as unknown as import('../shared/types').Transaction[],
      categories,
      { excludeHidden: true },
    );

    return {
      month,
      totalBudgetedIncome: budgetTotals.income,
      totalActualIncome: actualTotals.income,
      totalBudgetedExpense: budgetTotals.expense,
      totalActualExpense: actualTotals.expense,
      netBudgeted: budgetTotals.income - budgetTotals.expense,
      netActual: actualTotals.income - actualTotals.expense,
      incomeVariance: actualTotals.income - budgetTotals.income,
      expenseVariance: budgetTotals.expense - actualTotals.expense,
    };
  }

  /**
   * Get account summaries — strips all sensitive fields (SEC-002).
   * Returns only safe display data: name, type, institution, balances.
   */
  async getAccounts(userId: string): Promise<AccountSummary[]> {
    const stored = await this.dataService.getData<StoredAccount[]>(`accounts_${userId}`);
    if (!stored) return [];

    return stored.map(a => ({
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
  }

  /**
   * Get spending aggregated by category for a date range.
   */
  async getSpendingByCategory(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<CategorySpendingSummary[]> {
    const [transactions, categories] = await Promise.all([
      this.queryTransactions(userId, { startDate, endDate }),
      this.getCategories(userId),
    ]);

    const categoryMap = new Map(categories.map(c => [c.id, c]));
    const spending = new Map<string, { amount: number; count: number }>();

    // Only count expenses (positive amounts = debits)
    for (const t of transactions) {
      if (t.amount > 0 && t.categoryId && !t.isHidden) {
        const current = spending.get(t.categoryId) || { amount: 0, count: 0 };
        current.amount += t.amount;
        current.count += 1;
        spending.set(t.categoryId, current);
      }
    }

    const totalSpending = Array.from(spending.values()).reduce((sum, s) => sum + s.amount, 0);

    return Array.from(spending.entries())
      .map(([categoryId, data]) => {
        const category = categoryMap.get(categoryId);
        const parent = category?.parentId ? categoryMap.get(category.parentId) : null;
        return {
          categoryId,
          categoryName: category?.name || 'Unknown',
          parentCategoryId: category?.parentId || null,
          parentCategoryName: parent?.name || null,
          amount: Math.round(data.amount * 100) / 100,
          transactionCount: data.count,
          percentage: totalSpending > 0 ? Math.round((data.amount / totalSpending) * 10000) / 100 : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }

  /**
   * Get cash flow summary for a date range.
   */
  async getCashFlow(userId: string, startDate: string, endDate: string): Promise<CashFlowSummary> {
    const transactions = await this.queryTransactions(userId, { startDate, endDate });

    // Use shared utilities for consistent calculation (excludes transfers, hidden, pending)
    const calcTransactions = transactions as unknown as import('../shared/utils/transactionCalculations').TransactionForCalculation[];
    const totalIncome = calculateIncome(calcTransactions);
    const totalExpenses = calculateExpenses(calcTransactions);
    const netCashFlow = calculateNetCashFlow(calcTransactions);

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
          expenses: calculateExpenses(monthCalc),
          net: calculateNetCashFlow(monthCalc),
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      startDate,
      endDate,
      totalIncome,
      totalExpenses,
      netCashFlow,
      monthlyBreakdown,
    };
  }

  /**
   * Get auto-categorization rules for a user.
   */
  async getAutoCategorizeRules(userId: string): Promise<AutoCategorizeRule[]> {
    const stored = await this.dataService.getData<StoredAutoCategorizeRule[]>(
      `autocategorize_rules_${userId}`,
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
      isManual: stored.isManual || false,
      isSplit: stored.isSplit,
      parentTransactionId: stored.parentTransactionId,
      splitTransactionIds: stored.splitTransactionIds || [],
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
