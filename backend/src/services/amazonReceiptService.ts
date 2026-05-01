/**
 * Amazon Receipt Matching Service — orchestrator.
 *
 * Owns session persistence, cost-cap gating, eligibility computation, apply/
 * rule-suggestion flows. Delegates the heavy work to collaborators:
 *   - AmazonPdfParser          → Claude vision round-trip + sanitization
 *   - amazonMatcher (pure)     → tiered order→transaction matching
 *   - AmazonCategorizerAdapter → Claude categorization + split rounding
 */

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { DataService } from './dataService';
import { ChatbotCostTracker } from './chatbotCostTracker';
import { TransactionService } from './transactionService';
import { AutoCategorizeService } from './autoCategorizeService';
import { ChatbotDataService } from './chatbotDataService';
import { NotFoundError, ForbiddenError, ValidationError } from '../errors';
import {
  AmazonPdfParser,
  type ReceiptUploadFile,
  sanitizeCharges,
  crossReference,
} from './amazon/amazonPdfParser';
import {
  CUSTOM_AMAZON_CATEGORY,
  isAmazonMerchant,
  matchSingleOrder,
} from './amazon/amazonMatcher';
import { AmazonCategorizerAdapter } from './amazon/amazonCategorizerAdapter';
import { childLogger } from '../utils/logger';

const log = childLogger('amazonReceiptService');
import type { PdfExtractionOutput } from '../validators/amazonReceiptValidators';
import type {
  AmazonReceiptSession,
  AmazonReceiptUploadResponse,
  AmazonReceiptMatchResponse,
  AmazonCategorizationResponse,
  AmazonApplyAction,
  AmazonApplyResponse,
  AmazonResolveAmbiguousRequest,
  AmazonTransactionMatch,
  AmbiguousAmazonMatch,
  ParsedAmazonOrder,
  ParsedAmazonCharge,
  RuleSuggestion,
  Transaction,
} from '../shared/types';

export type { ReceiptUploadFile } from './amazon/amazonPdfParser';

const MAX_SESSIONS_PER_USER = 20;
const STALE_COMPLETED_DAYS = 90;
const STALE_PARSED_DAYS = 7;

export class AmazonReceiptService {
  private readonly pdfParser: AmazonPdfParser;
  private readonly categorizer: AmazonCategorizerAdapter;

  constructor(
    private readonly dataService: DataService,
    private readonly chatbotDataService: ChatbotDataService,
    private readonly costTracker: ChatbotCostTracker,
    private readonly transactionService: TransactionService,
    private readonly autoCategorizeService: AutoCategorizeService,
    anthropicApiKey: string,
  ) {
    const client = new Anthropic({ apiKey: anthropicApiKey });
    this.pdfParser = new AmazonPdfParser(client);
    this.categorizer = new AmazonCategorizerAdapter(
      client,
      chatbotDataService,
      costTracker,
    );
  }

  // ===========================================================================
  // Session helpers
  // ===========================================================================

  private async loadSessions(familyId: string): Promise<AmazonReceiptSession[]> {
    const data = await this.dataService.getData<AmazonReceiptSession[]>(
      `amazon_receipts_${familyId}`,
    );
    return data ?? [];
  }

  private async saveSessions(
    familyId: string,
    sessions: AmazonReceiptSession[],
  ): Promise<void> {
    await this.dataService.saveData(`amazon_receipts_${familyId}`, sessions);
  }

  /** SEC-003: all public methods go through this to verify ownership. */
  private async loadOwnedSession(
    familyId: string,
    sessionId: string,
  ): Promise<AmazonReceiptSession> {
    const sessions = await this.loadSessions(familyId);
    const session = sessions.find(s => s.id === sessionId);
    if (!session) throw new NotFoundError('Session not found');
    if (session.userId !== familyId) throw new ForbiddenError('Access denied');
    return session;
  }

  // ===========================================================================
  // Phase 3: PDF Parsing + session creation
  // ===========================================================================

  async parseAndCreateSession(
    familyId: string,
    files: ReceiptUploadFile[],
  ): Promise<AmazonReceiptUploadResponse> {
    const budget = await this.costTracker.checkBudget();
    if (!budget.allowed) {
      throw new ValidationError(
        'Monthly AI budget cap reached. Try again next month.',
      );
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const parsedResults: PdfExtractionOutput[] = [];

    for (const file of files) {
      const { parsed, inputTokens, outputTokens } =
        await this.pdfParser.parseFile(file.buffer, file.mimeType);
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      parsedResults.push(parsed);
    }

    const pdfTypes = parsedResults.map(r => r.pdfType);
    if (new Set(pdfTypes).size < pdfTypes.length) {
      throw new ValidationError(
        'Cannot upload two PDFs of the same type. Please upload one Orders PDF and/or one Transactions PDF.',
      );
    }

    let allOrders: ParsedAmazonOrder[] = [];
    let allCharges: ParsedAmazonCharge[] = [];

    for (const result of parsedResults) {
      if (result.pdfType === 'orders' && result.orders) {
        allOrders = result.orders;
      }
      if (result.pdfType === 'transactions' && result.charges) {
        // SEC-006: sanitize card data immediately after extraction
        allCharges = sanitizeCharges(result.charges);
      }
    }

    if (allOrders.length > 0 && allCharges.length > 0) {
      crossReference(allOrders, allCharges);
    }

    // Deduplicate against completed sessions only (REQ-022). Orders from
    // abandoned/in-progress sessions are eligible for reprocessing.
    const existingSessions = await this.loadSessions(familyId);
    const completedOrderNumbers = new Set(
      existingSessions
        .filter(s => s.status === 'completed')
        .flatMap(s => s.parsedOrders.map(o => o.orderNumber)),
    );
    const totalParsedCount = allOrders.length + allCharges.length;
    const newOrders = allOrders.filter(
      o => !completedOrderNumbers.has(o.orderNumber),
    );
    const newCharges = allCharges.filter(
      c => !completedOrderNumbers.has(c.orderNumber),
    );
    if (newOrders.length === 0 && newCharges.length === 0 && totalParsedCount > 0) {
      await this.costTracker.recordUsage(familyId, 'sonnet', totalInputTokens, totalOutputTokens);
      throw new ValidationError(
        `All ${totalParsedCount} orders from this PDF were already categorized in a previous session. ` +
          'Upload a different PDF with new orders, or clear previous sessions to reprocess.',
      );
    }

    // Clean up incomplete sessions for the same orders (replace abandoned attempts)
    const newOrderNumbers = new Set(newOrders.map(o => o.orderNumber));
    const cleanedSessions = existingSessions.filter(s => {
      if (s.status === 'completed') return true;
      const hasOverlap = s.parsedOrders.some(o => newOrderNumbers.has(o.orderNumber));
      return !hasOverlap;
    });

    const session: AmazonReceiptSession = {
      id: randomUUID(),
      userId: familyId,
      uploadedAt: new Date().toISOString(),
      pdfTypes: pdfTypes as ('orders' | 'transactions')[],
      parsedOrders: newOrders,
      parsedCharges: newCharges,
      matches: [],
      status: 'parsed',
    };

    const prunedSessions = this.pruneSessions(cleanedSessions);
    prunedSessions.push(session);

    await this.saveSessions(familyId, prunedSessions);

    const costResult = await this.costTracker.recordUsage(
      familyId,
      'sonnet',
      totalInputTokens,
      totalOutputTokens,
    );

    return {
      sessionId: session.id,
      pdfTypes: session.pdfTypes,
      parsedOrders: newOrders,
      parsedCharges: newCharges,
      costUsed: costResult.estimatedCost,
    };
  }

  /**
   * Prune stale sessions to prevent unbounded storage growth.
   * - Keep at most MAX_SESSIONS_PER_USER sessions
   * - Strip completed sessions older than 90 days to dedup-only data
   * - Delete abandoned ('parsed') sessions older than 7 days
   */
  private pruneSessions(
    sessions: AmazonReceiptSession[],
  ): AmazonReceiptSession[] {
    const now = new Date();

    const pruned = sessions
      .filter(s => {
        const age = now.getTime() - new Date(s.uploadedAt).getTime();
        const ageDays = age / (1000 * 60 * 60 * 24);
        if (s.status === 'parsed' && ageDays > STALE_PARSED_DAYS) return false;
        return true;
      })
      .map(s => {
        const age = now.getTime() - new Date(s.uploadedAt).getTime();
        const ageDays = age / (1000 * 60 * 60 * 24);
        if (s.status === 'completed' && ageDays > STALE_COMPLETED_DAYS) {
          return {
            ...s,
            parsedOrders: s.parsedOrders.map(o => ({
              orderNumber: o.orderNumber,
              orderDate: o.orderDate,
              totalAmount: o.totalAmount,
              items: [],
            })),
            parsedCharges: [],
            matches: [],
          };
        }
        return s;
      });

    if (pruned.length > MAX_SESSIONS_PER_USER) {
      pruned.sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      );
      return pruned.slice(0, MAX_SESSIONS_PER_USER);
    }

    return pruned;
  }

  // ===========================================================================
  // Phase 4: Transaction Matching
  // ===========================================================================

  async matchOrders(
    familyId: string,
    sessionId: string,
  ): Promise<AmazonReceiptMatchResponse> {
    const session = await this.loadOwnedSession(familyId, sessionId);

    const { availableTransactions, skippedOrderNumbers, totalAmazonCount, totalCount } =
      await this.computeEligibleAmazonTransactions(familyId, sessionId);

    log.info(
      { ordersToMatch: session.parsedOrders.length, totalAmazonCount, totalCount },
      'matchOrders started',
    );

    const ordersToMatch = session.parsedOrders.filter(
      o => !skippedOrderNumbers.has(o.orderNumber),
    );

    const matches: AmazonTransactionMatch[] = [];
    const unmatched: ParsedAmazonOrder[] = [];
    const ambiguous: AmbiguousAmazonMatch[] = [];
    const usedTransactionIds = new Set<string>();

    for (const order of ordersToMatch) {
      const result = matchSingleOrder(order, availableTransactions, usedTransactionIds);

      if (result.type === 'matched') {
        matches.push(result.match);
        usedTransactionIds.add(result.match.transactionId);
      } else if (result.type === 'ambiguous') {
        ambiguous.push(result.ambiguousMatch);
      } else {
        unmatched.push(order);
      }
    }

    session.matches = matches;
    session.status = 'matching';
    const sessions = await this.loadSessions(familyId);
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx >= 0) sessions[idx] = session;
    await this.saveSessions(familyId, sessions);

    return { matches, unmatched, ambiguous };
  }

  async resolveAmbiguous(
    familyId: string,
    sessionId: string,
    resolutions: AmazonResolveAmbiguousRequest['resolutions'],
  ): Promise<void> {
    const session = await this.loadOwnedSession(familyId, sessionId);

    for (const resolution of resolutions) {
      const order = session.parsedOrders.find(
        o => o.orderNumber === resolution.orderNumber,
      );
      if (!order) continue;

      const match: AmazonTransactionMatch = {
        id: randomUUID(),
        orderNumber: resolution.orderNumber,
        transactionId: resolution.transactionId,
        matchConfidence: 'manual',
        items: order.items.map(item => ({
          name: item.name,
          estimatedPrice: item.estimatedPrice,
          suggestedCategoryId: null,
          appliedCategoryId: null,
          confidence: 0,
          isEstimatedPrice: item.estimatedPrice === null,
        })),
        splitTransactionIds: [],
        status: 'pending',
      };

      const existingIdx = session.matches.findIndex(
        m => m.orderNumber === resolution.orderNumber,
      );
      if (existingIdx >= 0) {
        session.matches[existingIdx] = match;
      } else {
        session.matches.push(match);
      }
    }

    const sessions = await this.loadSessions(familyId);
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx >= 0) sessions[idx] = session;
    await this.saveSessions(familyId, sessions);
  }

  /**
   * Compute the set of Amazon transactions currently eligible for receipt matching.
   *
   * Eligibility rules (mirrors matchOrders so the UI count matches what the
   * matcher actually considers):
   *   - Transaction is from an Amazon merchant and not hidden
   *   - Was NOT successfully categorized/split in a prior session into a
   *     non-CUSTOM_AMAZON category (transactions still in CUSTOM_AMAZON are
   *     always re-eligible, even if they appeared in a prior session)
   *
   * Also returns the set of order numbers the user skipped in prior sessions,
   * so callers performing a match can filter parsed orders accordingly.
   */
  private async computeEligibleAmazonTransactions(
    familyId: string,
    excludeSessionId?: string,
  ): Promise<{
    availableTransactions: Transaction[];
    skippedOrderNumbers: Set<string>;
    totalAmazonCount: number;
    totalCount: number;
  }> {
    const allTransactions = await this.chatbotDataService.queryTransactions(familyId, {});
    const amazonTransactions = allTransactions.filter(
      t => isAmazonMerchant(t) && !t.isHidden,
    );

    const allSessions = await this.loadSessions(familyId);
    const skippedOrderNumbers = new Set<string>();
    const excludedTxIds = new Set<string>();

    for (const s of allSessions) {
      if (excludeSessionId && s.id === excludeSessionId) continue;
      for (const m of s.matches) {
        if (m.status === 'skipped') {
          skippedOrderNumbers.add(m.orderNumber);
        }
        if (m.status === 'categorized' || m.status === 'split') {
          const tx = amazonTransactions.find(t => t.id === m.transactionId);
          if (tx && tx.categoryId && tx.categoryId !== CUSTOM_AMAZON_CATEGORY) {
            excludedTxIds.add(m.transactionId);
          }
        }
      }
    }

    const availableTransactions = amazonTransactions.filter(
      t => !excludedTxIds.has(t.id),
    );

    return {
      availableTransactions,
      skippedOrderNumbers,
      totalAmazonCount: amazonTransactions.length,
      totalCount: allTransactions.length,
    };
  }

  // ===========================================================================
  // Phase 5: Categorization & split recommendations
  // ===========================================================================

  async categorizeMatches(
    familyId: string,
    sessionId: string,
    matchIds: string[],
  ): Promise<AmazonCategorizationResponse> {
    const budget = await this.costTracker.checkBudget();
    if (!budget.allowed) {
      throw new ValidationError('Monthly AI budget cap reached. Try again next month.');
    }

    const session = await this.loadOwnedSession(familyId, sessionId);
    const matchIdSet = new Set(matchIds);
    const matchesToCategorize = session.matches.filter(
      m => matchIdSet.has(m.id) && m.status === 'pending',
    );

    if (matchesToCategorize.length === 0) {
      return { recommendations: [], splitRecommendations: [], costUsed: 0 };
    }

    const result = await this.categorizer.categorize(familyId, matchesToCategorize);

    session.status = 'reviewing';
    const sessions = await this.loadSessions(familyId);
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx >= 0) sessions[idx] = session;
    await this.saveSessions(familyId, sessions);

    return result;
  }

  // ===========================================================================
  // Phase 6: Apply changes + rule suggestions
  // ===========================================================================

  async applyActions(
    familyId: string,
    sessionId: string,
    actions: AmazonApplyAction[],
  ): Promise<AmazonApplyResponse> {
    const session = await this.loadOwnedSession(familyId, sessionId);

    let applied = 0;
    let splits = 0;
    let skipped = 0;
    let totalDollarsRecategorized = 0;
    const categoriesUpdated = new Set<string>();

    const allTransactions = await this.chatbotDataService.queryTransactions(familyId, {});
    const txMap = new Map(allTransactions.map(t => [t.id, t]));

    for (const action of actions) {
      const match = session.matches.find(m => m.id === action.matchId);
      if (!match) continue;

      const tx = txMap.get(match.transactionId);

      if (action.type === 'categorize' && action.categoryId) {
        const result = await this.transactionService.updateTransactionCategory(
          familyId, match.transactionId, action.categoryId,
        );
        if (result.success) {
          match.status = 'categorized';
          match.items.forEach(i => { i.appliedCategoryId = action.categoryId!; });
          applied++;
          categoriesUpdated.add(action.categoryId);
          if (tx) totalDollarsRecategorized += Math.abs(tx.amount);
        }
      } else if (action.type === 'split' && action.splits) {
        const result = await this.transactionService.splitTransaction(
          familyId,
          match.transactionId,
          action.splits.map(s => ({
            amount: s.amount,
            categoryId: s.categoryId,
            description: s.description,
          })),
        );
        if (result.success) {
          match.status = 'split';
          match.splitTransactionIds = result.splitTransactions?.map(t => t.id) ?? [];
          splits++;
          action.splits.forEach(s => categoriesUpdated.add(s.categoryId));
          if (tx) totalDollarsRecategorized += Math.abs(tx.amount);
        }
      } else if (action.type === 'skip') {
        match.status = 'skipped';
        skipped++;
      }
    }

    session.status = 'completed';
    const sessions = await this.loadSessions(familyId);
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx >= 0) sessions[idx] = session;
    await this.saveSessions(familyId, sessions);

    return {
      applied,
      splits,
      skipped,
      rulesCreated: 0,
      summary: {
        totalDollarsRecategorized: Math.round(totalDollarsRecategorized * 100) / 100,
        categoriesUpdated: [...categoriesUpdated],
      },
    };
  }

  async suggestRules(
    familyId: string,
    sessionId: string,
  ): Promise<{ suggestions: RuleSuggestion[] }> {
    const session = await this.loadOwnedSession(familyId, sessionId);
    const allSessions = await this.loadSessions(familyId);

    const itemCategoryMap = new Map<string, { categoryId: string; count: number }>();

    for (const s of allSessions) {
      for (const match of s.matches) {
        if (match.status !== 'categorized' && match.status !== 'split') continue;
        for (const item of match.items) {
          const catId = item.appliedCategoryId;
          if (!catId) continue;
          const key = item.name.toLowerCase().trim();
          const existing = itemCategoryMap.get(key);
          if (existing && existing.categoryId === catId) {
            existing.count++;
          } else if (!existing) {
            itemCategoryMap.set(key, { categoryId: catId, count: 1 });
          }
        }
      }
    }

    const recurring = [...itemCategoryMap.entries()].filter(
      ([, info]) => info.count >= 2,
    );

    if (recurring.length === 0) {
      return { suggestions: [] };
    }

    const existingRules = await this.autoCategorizeService.getRules(familyId);
    const existingPatterns = new Set(
      existingRules.flatMap(r => r.patterns.map((p: string) => p.toLowerCase())),
    );

    const categories = await this.chatbotDataService.getCategories(familyId);
    const catMap = new Map(categories.map(c => [c.id, c]));

    const suggestions: RuleSuggestion[] = [];

    const byCat = new Map<string, string[]>();
    for (const [itemName, info] of recurring) {
      if (!byCat.has(info.categoryId)) byCat.set(info.categoryId, []);
      byCat.get(info.categoryId)!.push(itemName);
    }

    for (const [categoryId, items] of byCat) {
      const cat = catMap.get(categoryId);
      if (!cat) continue;

      const patterns = ['AMAZON', 'AMZN MKTP'];
      if (patterns.some(p => existingPatterns.has(p.toLowerCase()))) continue;

      suggestions.push({
        patterns,
        categoryId,
        categoryName: cat.name,
        matchingTransactionCount: items.length,
        exampleTransactions: items.slice(0, 5),
      });
    }

    void session;

    return { suggestions };
  }

  // ===========================================================================
  // Session CRUD + diagnostic getters
  // ===========================================================================

  async getSessions(familyId: string): Promise<AmazonReceiptSession[]> {
    return this.loadSessions(familyId);
  }

  async deleteSession(familyId: string, sessionId: string): Promise<void> {
    await this.loadOwnedSession(familyId, sessionId);
    const sessions = await this.loadSessions(familyId);
    const filtered = sessions.filter(s => s.id !== sessionId);
    await this.saveSessions(familyId, filtered);
  }

  async deleteAllSessions(familyId: string): Promise<{ deleted: number }> {
    const sessions = await this.loadSessions(familyId);
    const count = sessions.length;
    await this.saveSessions(familyId, []);
    return { deleted: count };
  }

  /**
   * Count Amazon-merchant transactions available for receipt matching.
   * Mirrors matchOrders' eligibility rules so the UI count matches what the
   * matcher will actually consider.
   */
  async getEligibleTransactionCount(familyId: string): Promise<{ count: number }> {
    const { availableTransactions } = await this.computeEligibleAmazonTransactions(familyId);
    return { count: availableTransactions.length };
  }
}
