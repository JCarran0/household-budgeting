/**
 * Amazon Receipt Matching Service
 *
 * Handles PDF parsing (Claude vision), order-to-transaction matching,
 * item categorization, split recommendations, and session persistence.
 *
 * Phase 3: parseAndCreateSession implemented. Phases 4–6 stubbed.
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
  PDF_PARSING_SYSTEM_PROMPT,
  PDF_EXTRACTION_TOOL,
  AMAZON_CATEGORIZATION_SYSTEM_PROMPT,
  AMAZON_CATEGORIZATION_TOOL,
} from './amazonReceiptPrompt';
import {
  pdfExtractionOutputSchema,
  type PdfExtractionOutput,
} from '../validators/amazonReceiptValidators';
import type {
  AmazonReceiptSession,
  AmazonReceiptUploadResponse,
  AmazonReceiptMatchResponse,
  AmazonCategorizationResponse,
  AmazonApplyAction,
  AmazonApplyResponse,
  AmazonResolveAmbiguousRequest,
  AmazonTransactionMatch,
  AmazonCategoryRecommendation,
  AmazonSplitRecommendation,
  AmbiguousAmazonMatch,
  ParsedAmazonOrder,
  ParsedAmazonCharge,
  RuleSuggestion,
  Transaction,
  Category,
} from '../shared/types';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8192;
const MAX_SESSIONS_PER_USER = 20;
const STALE_COMPLETED_DAYS = 90;
const STALE_PARSED_DAYS = 7;

/** Amazon merchant name patterns for identifying Amazon transactions. */
const AMAZON_MERCHANT_PATTERNS = [
  'amazon', 'amzn', 'kindle svcs', 'amzn mktp',
  'amazon digital', 'amazon mktpl', 'amazon reta',
];

const TIGHT_DATE_WINDOW_DAYS = 3;
const WIDE_DATE_WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;
const MAX_EXAMPLES_PER_CATEGORY = 5;
const MAX_EXAMPLE_CATEGORIES = 20;
const CUSTOM_AMAZON_CATEGORY = 'CUSTOM_AMAZON';

export class AmazonReceiptService {
  private client: Anthropic;

  constructor(
    private readonly dataService: DataService,
    private readonly chatbotDataService: ChatbotDataService,
    private readonly costTracker: ChatbotCostTracker,
    private readonly transactionService: TransactionService,
    private readonly autoCategorizeService: AutoCategorizeService,
    anthropicApiKey: string,
  ) {
    this.client = new Anthropic({ apiKey: anthropicApiKey });
  }

  // ===========================================================================
  // Session helpers
  // ===========================================================================

  private async loadSessions(userId: string): Promise<AmazonReceiptSession[]> {
    const data = await this.dataService.getData<AmazonReceiptSession[]>(
      `amazon_receipts_${userId}`,
    );
    return data ?? [];
  }

  private async saveSessions(
    userId: string,
    sessions: AmazonReceiptSession[],
  ): Promise<void> {
    await this.dataService.saveData(`amazon_receipts_${userId}`, sessions);
  }

  /** SEC-003: All public methods must go through this to verify ownership. */
  private async loadOwnedSession(
    userId: string,
    sessionId: string,
  ): Promise<AmazonReceiptSession> {
    const sessions = await this.loadSessions(userId);
    const session = sessions.find(s => s.id === sessionId);
    if (!session) throw new NotFoundError('Session not found');
    if (session.userId !== userId) throw new ForbiddenError('Access denied');
    return session;
  }

  // ===========================================================================
  // Phase 3: PDF Parsing
  // ===========================================================================

  async parseAndCreateSession(
    userId: string,
    pdfBuffers: Buffer[],
  ): Promise<AmazonReceiptUploadResponse> {
    // 1. Check cost cap
    const budget = await this.costTracker.checkBudget();
    if (!budget.allowed) {
      throw new ValidationError(
        'Monthly AI budget cap reached. Try again next month.',
      );
    }

    // 2. Parse each PDF via Claude vision
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const parsedResults: PdfExtractionOutput[] = [];

    for (const buffer of pdfBuffers) {
      const { parsed, inputTokens, outputTokens } =
        await this.parsePdfWithClaude(buffer);
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      parsedResults.push(parsed);
    }

    // 3. Validate no duplicate PDF types
    const pdfTypes = parsedResults.map(r => r.pdfType);
    const uniqueTypes = new Set(pdfTypes);
    if (uniqueTypes.size < pdfTypes.length) {
      throw new ValidationError(
        'Cannot upload two PDFs of the same type. Please upload one Orders PDF and/or one Transactions PDF.',
      );
    }

    // 4. Aggregate parsed data
    let allOrders: ParsedAmazonOrder[] = [];
    let allCharges: ParsedAmazonCharge[] = [];

    for (const result of parsedResults) {
      if (result.pdfType === 'orders' && result.orders) {
        allOrders = result.orders;
      }
      if (result.pdfType === 'transactions' && result.charges) {
        // SEC-006: Sanitize card data immediately after extraction
        allCharges = this.sanitizeCharges(result.charges);
      }
    }

    // 5. Cross-reference when both types provided
    if (allOrders.length > 0 && allCharges.length > 0) {
      this.crossReference(allOrders, allCharges);
    }

    // 6. Deduplicate against completed sessions only.
    // Orders from abandoned/in-progress sessions (status 'parsed', 'matching',
    // 'reviewing') are eligible for reprocessing — only skip orders that were
    // fully processed in a completed session (REQ-022).
    const existingSessions = await this.loadSessions(userId);
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
    // If everything was deduped, return early with a clear message
    if (newOrders.length === 0 && newCharges.length === 0 && totalParsedCount > 0) {
      await this.costTracker.recordUsage(userId, 'sonnet', totalInputTokens, totalOutputTokens);
      throw new ValidationError(
        `All ${totalParsedCount} orders from this PDF were already categorized in a previous session. ` +
          'Upload a different PDF with new orders, or clear previous sessions to reprocess.',
      );
    }

    // Clean up incomplete sessions for the same orders (replace abandoned attempts)
    const newOrderNumbers = new Set(newOrders.map(o => o.orderNumber));
    const cleanedSessions = existingSessions.filter(s => {
      if (s.status === 'completed') return true; // always keep completed
      // Drop incomplete sessions whose orders overlap with this upload
      const hasOverlap = s.parsedOrders.some(o => newOrderNumbers.has(o.orderNumber));
      return !hasOverlap;
    });

    // 7. Create session
    const session: AmazonReceiptSession = {
      id: randomUUID(),
      userId,
      uploadedAt: new Date().toISOString(),
      pdfTypes: pdfTypes as ('orders' | 'transactions')[],
      parsedOrders: newOrders,
      parsedCharges: newCharges,
      matches: [],
      status: 'parsed',
    };

    // 8. Prune stale sessions & append (use cleanedSessions, not existingSessions)
    const prunedSessions = this.pruneSessions(cleanedSessions);
    prunedSessions.push(session);

    // 9. Persist
    await this.saveSessions(userId, prunedSessions);

    // 10. Record cost
    const costResult = await this.costTracker.recordUsage(
      userId,
      'sonnet',
      totalInputTokens,
      totalOutputTokens,
    );

    // 11. Return response
    return {
      sessionId: session.id,
      pdfTypes: session.pdfTypes,
      parsedOrders: newOrders,
      parsedCharges: newCharges,
      costUsed: costResult.estimatedCost,
    };
  }

  // ===========================================================================
  // Private: PDF parsing helpers
  // ===========================================================================

  /**
   * Send a PDF buffer to Claude's vision API for structured extraction.
   * SEC-002: PDF sent as base64 document content block, not interpolated.
   */
  private async parsePdfWithClaude(pdfBuffer: Buffer): Promise<{
    parsed: PdfExtractionOutput;
    inputTokens: number;
    outputTokens: number;
  }> {
    const base64Pdf = pdfBuffer.toString('base64');

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: PDF_PARSING_SYSTEM_PROMPT,
      tools: [PDF_EXTRACTION_TOOL],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Pdf,
              },
            },
            {
              type: 'text',
              text: 'Extract all order/charge data from this Amazon PDF using the extract_amazon_data tool.',
            },
          ],
        },
      ],
    });

    // Extract tool_use block
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === 'extract_amazon_data',
    );

    if (!toolUse) {
      throw new ValidationError(
        "This doesn't look like an Amazon orders or transactions page. " +
          'Please upload a PDF exported from your Amazon order history or payment transactions.',
      );
    }

    // Validate Claude output with Zod (defense-in-depth)
    const parseResult = pdfExtractionOutputSchema.safeParse(toolUse.input);
    if (!parseResult.success) {
      console.warn(
        '[AmazonReceiptService] Claude output failed Zod validation:',
        parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      );
      // Try to salvage valid orders/charges by parsing items individually
      const raw = toolUse.input as Record<string, unknown>;
      const salvaged = this.salvagePartialOutput(raw);
      if (!salvaged) {
        throw new ValidationError(
          'Failed to extract valid data from the PDF. The format may not be supported.',
        );
      }
      return {
        parsed: salvaged,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    }

    return {
      parsed: parseResult.data,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  /**
   * Attempt to salvage valid orders/charges when full Zod validation fails.
   * Validates each order/charge individually, keeping valid ones and
   * discarding malformed ones. Returns null if nothing is salvageable.
   */
  private salvagePartialOutput(
    raw: Record<string, unknown>,
  ): PdfExtractionOutput | null {
    const { parsedAmazonOrderSchema, parsedAmazonChargeSchema } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../validators/amazonReceiptValidators');

    const pdfType = raw.pdfType === 'orders' || raw.pdfType === 'transactions'
      ? raw.pdfType
      : null;
    if (!pdfType) return null;

    const result: PdfExtractionOutput = { pdfType };

    if (pdfType === 'orders' && Array.isArray(raw.orders)) {
      const validOrders: ParsedAmazonOrder[] = [];
      for (const order of raw.orders) {
        const parsed = parsedAmazonOrderSchema.safeParse(order);
        if (parsed.success) {
          validOrders.push(parsed.data);
        } else {
          console.warn(
            '[AmazonReceiptService] Skipping invalid order:',
            parsed.error.issues.map(
              (i: { path: (string | number)[]; message: string }) =>
                `${i.path.join('.')}: ${i.message}`,
            ),
          );
        }
      }
      if (validOrders.length === 0) return null;
      result.orders = validOrders;
    }

    if (pdfType === 'transactions' && Array.isArray(raw.charges)) {
      const validCharges: ParsedAmazonCharge[] = [];
      for (const charge of raw.charges) {
        const parsed = parsedAmazonChargeSchema.safeParse(charge);
        if (parsed.success) {
          validCharges.push(parsed.data);
        } else {
          console.warn(
            '[AmazonReceiptService] Skipping invalid charge:',
            parsed.error.issues.map(
              (i: { path: (string | number)[]; message: string }) =>
                `${i.path.join('.')}: ${i.message}`,
            ),
          );
        }
      }
      if (validCharges.length === 0) return null;
      result.charges = validCharges;
    }

    return result;
  }

  /**
   * SEC-006: Strip full card numbers, keeping only last 4 digits.
   * Must be called immediately after parsing, before any logging or persistence.
   */
  private sanitizeCharges(charges: ParsedAmazonCharge[]): ParsedAmazonCharge[] {
    return charges.map(charge => ({
      ...charge,
      // Ensure only last 4 digits are stored, even if Claude extracted more
      cardLastFour: charge.cardLastFour.slice(-4).replace(/[^0-9]/g, '').slice(-4),
    }));
  }

  /**
   * Cross-reference orders and charges when both PDF types are provided.
   * Enriches orders with charge dates (tighter matching window) and
   * charges with item details (better categorization).
   */
  private crossReference(
    orders: ParsedAmazonOrder[],
    charges: ParsedAmazonCharge[],
  ): void {
    const chargesByOrder = new Map<string, ParsedAmazonCharge>();
    for (const charge of charges) {
      chargesByOrder.set(charge.orderNumber, charge);
    }

    // Mutate orders in place — add chargeDate as the orderDate override
    // when we have a more accurate charge date from the transactions PDF.
    // The matching algorithm (Phase 4) will prefer chargeDate when available.
    for (const order of orders) {
      const charge = chargesByOrder.get(order.orderNumber);
      if (charge) {
        // Store the original orderDate and use chargeDate for matching
        // We encode this by overwriting orderDate — the charge date is
        // more accurate for matching against bank posting dates.
        order.orderDate = charge.chargeDate;
      }
    }
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

        // Delete abandoned sessions older than 7 days
        if (s.status === 'parsed' && ageDays > STALE_PARSED_DAYS) {
          return false;
        }
        return true;
      })
      .map(s => {
        const age = now.getTime() - new Date(s.uploadedAt).getTime();
        const ageDays = age / (1000 * 60 * 60 * 24);

        // Strip completed sessions older than 90 days to dedup-only data
        if (s.status === 'completed' && ageDays > STALE_COMPLETED_DAYS) {
          return {
            ...s,
            parsedOrders: s.parsedOrders.map(o => ({
              orderNumber: o.orderNumber,
              orderDate: o.orderDate,
              totalAmount: o.totalAmount,
              items: [], // Strip item data to save space
            })),
            parsedCharges: [],
            matches: [],
          };
        }
        return s;
      });

    // Keep only the most recent sessions if over limit
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
  // Phase 4: Transaction Matching Algorithm
  // ===========================================================================

  async matchOrders(
    userId: string,
    sessionId: string,
  ): Promise<AmazonReceiptMatchResponse> {
    const session = await this.loadOwnedSession(userId, sessionId);

    // 1. Fetch all Amazon-merchant transactions (no date filter)
    const allTransactions = await this.chatbotDataService.queryTransactions(
      userId, {},
    );
    const amazonTransactions = allTransactions.filter(t =>
      this.isAmazonMerchant(t) && !t.isHidden,
    );

    console.log(
      `[AmazonReceiptService] matchOrders: ${session.parsedOrders.length} orders to match, ` +
        `${amazonTransactions.length} Amazon transactions found (of ${allTransactions.length} total)`,
    );

    // 2. Determine which transactions to exclude from matching.
    // The key insight: transactions still in CUSTOM_AMAZON are always eligible
    // (that's the whole point of this feature). Only exclude transactions where
    // the user already took action:
    //   - Explicitly skipped in a prior session → respect the decision
    //   - Successfully recategorized to a non-Amazon category → already handled
    // Transactions still in CUSTOM_AMAZON are always re-eligible even if they
    // appeared in a prior session that was abandoned or incomplete.
    const allSessions = await this.loadSessions(userId);
    const skippedOrderNumbers = new Set<string>();
    const excludedTxIds = new Set<string>();

    for (const s of allSessions) {
      if (s.id === sessionId) continue;
      for (const m of s.matches) {
        if (m.status === 'skipped') {
          skippedOrderNumbers.add(m.orderNumber);
        }
        // Only exclude transactions that were successfully recategorized/split
        if (m.status === 'categorized' || m.status === 'split') {
          // But check current state: if it's back in CUSTOM_AMAZON, re-include it
          const tx = amazonTransactions.find(t => t.id === m.transactionId);
          if (tx && tx.categoryId && tx.categoryId !== CUSTOM_AMAZON_CATEGORY) {
            excludedTxIds.add(m.transactionId);
          }
        }
      }
    }

    // 3. Filter orders and transactions
    const ordersToMatch = session.parsedOrders.filter(
      o => !skippedOrderNumbers.has(o.orderNumber),
    );
    const availableTransactions = amazonTransactions.filter(
      t => !excludedTxIds.has(t.id),
    );

    // 4. Run tiered matching
    const matches: AmazonTransactionMatch[] = [];
    const unmatched: ParsedAmazonOrder[] = [];
    const ambiguous: AmbiguousAmazonMatch[] = [];
    const usedTransactionIds = new Set<string>();

    for (const order of ordersToMatch) {
      const result = this.matchSingleOrder(
        order,
        availableTransactions,
        usedTransactionIds,
      );

      if (result.type === 'matched') {
        matches.push(result.match);
        usedTransactionIds.add(result.match.transactionId);
      } else if (result.type === 'ambiguous') {
        ambiguous.push(result.ambiguousMatch);
      } else {
        unmatched.push(order);
      }
    }

    // 5. Update session
    session.matches = matches;
    session.status = 'matching';
    const sessions = await this.loadSessions(userId);
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx >= 0) sessions[idx] = session;
    await this.saveSessions(userId, sessions);

    return { matches, unmatched, ambiguous };
  }

  async resolveAmbiguous(
    userId: string,
    sessionId: string,
    resolutions: AmazonResolveAmbiguousRequest['resolutions'],
  ): Promise<void> {
    const session = await this.loadOwnedSession(userId, sessionId);

    for (const resolution of resolutions) {
      // Find the order in parsed data
      const order = session.parsedOrders.find(
        o => o.orderNumber === resolution.orderNumber,
      );
      if (!order) continue;

      // Create a manually resolved match
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

      // Add to session matches (avoid duplicates)
      const existingIdx = session.matches.findIndex(
        m => m.orderNumber === resolution.orderNumber,
      );
      if (existingIdx >= 0) {
        session.matches[existingIdx] = match;
      } else {
        session.matches.push(match);
      }
    }

    // Persist
    const sessions = await this.loadSessions(userId);
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx >= 0) sessions[idx] = session;
    await this.saveSessions(userId, sessions);
  }

  // ===========================================================================
  // Private: Matching helpers
  // ===========================================================================

  /** Check if a transaction is from an Amazon merchant. */
  private isAmazonMerchant(transaction: Transaction): boolean {
    const name = (transaction.name || '').toLowerCase();
    const merchant = (transaction.merchantName || '').toLowerCase();
    return AMAZON_MERCHANT_PATTERNS.some(
      pattern => name.includes(pattern) || merchant.includes(pattern),
    );
  }

  /**
   * Match a single parsed order against available bank transactions.
   * Implements the tiered matching strategy from BRD §4.1.
   */
  private matchSingleOrder(
    order: ParsedAmazonOrder,
    transactions: Transaction[],
    usedIds: Set<string>,
  ):
    | { type: 'matched'; match: AmazonTransactionMatch }
    | { type: 'ambiguous'; ambiguousMatch: AmbiguousAmazonMatch }
    | { type: 'unmatched' } {

    const orderDate = new Date(order.orderDate);
    // Amazon charges are positive in bank data (expense = positive amount)
    const orderAmount = order.totalAmount;

    // Find all exact-amount matches not already used
    const amountMatches = transactions.filter(
      t => !usedIds.has(t.id) && this.amountsMatch(t.amount, orderAmount),
    );

    if (amountMatches.length === 0) {
      return { type: 'unmatched' };
    }

    // Tier 1: exact amount + date within ±3 days → high confidence
    const tier1 = amountMatches.filter(t =>
      this.withinDateWindow(t.date, orderDate, TIGHT_DATE_WINDOW_DAYS),
    );

    if (tier1.length === 1) {
      return {
        type: 'matched',
        match: this.createMatch(order, tier1[0], 'high'),
      };
    }

    // Tier 2: exact amount + date within ±7 days → medium confidence
    const tier2 = amountMatches.filter(t =>
      this.withinDateWindow(t.date, orderDate, WIDE_DATE_WINDOW_DAYS),
    );

    if (tier2.length === 1) {
      return {
        type: 'matched',
        match: this.createMatch(order, tier2[0], 'medium'),
      };
    }

    // Tier 3: multiple matches → ambiguous
    const candidates = (tier2.length > 0 ? tier2 : amountMatches).slice(0, 5);
    if (candidates.length > 1) {
      return {
        type: 'ambiguous',
        ambiguousMatch: {
          order,
          candidates: candidates.map(t => ({
            transactionId: t.id,
            date: t.date,
            amount: t.amount,
            description: t.name,
          })),
        },
      };
    }

    // Single match outside 7-day window — still present as medium
    if (candidates.length === 1) {
      return {
        type: 'matched',
        match: this.createMatch(order, candidates[0], 'medium'),
      };
    }

    return { type: 'unmatched' };
  }

  /**
   * Compare transaction amount to order amount.
   * Bank transactions use positive for expenses in this app's Plaid setup.
   * Match to the cent.
   */
  private amountsMatch(txAmount: number, orderAmount: number): boolean {
    // Transaction amounts may be positive (expense) or negative.
    // Amazon charges are expenses, so compare absolute values.
    return Math.abs(Math.abs(txAmount) - orderAmount) < 0.005;
  }

  /** Check if transaction date is within ±days of the order date. */
  private withinDateWindow(
    txDateStr: string,
    orderDate: Date,
    days: number,
  ): boolean {
    const txDate = new Date(txDateStr);
    const diff = Math.abs(txDate.getTime() - orderDate.getTime());
    return diff <= days * MS_PER_DAY;
  }

  /** Create an AmazonTransactionMatch from a parsed order and bank transaction. */
  private createMatch(
    order: ParsedAmazonOrder,
    transaction: Transaction,
    confidence: 'high' | 'medium',
  ): AmazonTransactionMatch {
    return {
      id: randomUUID(),
      orderNumber: order.orderNumber,
      transactionId: transaction.id,
      matchConfidence: confidence,
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
  }

  // ===========================================================================
  // Phase 5: Categorization & Split Recommendations
  // ===========================================================================

  async categorizeMatches(
    userId: string,
    sessionId: string,
    matchIds: string[],
  ): Promise<AmazonCategorizationResponse> {
    // 1. Cost cap check
    const budget = await this.costTracker.checkBudget();
    if (!budget.allowed) {
      throw new ValidationError('Monthly AI budget cap reached. Try again next month.');
    }

    // 2. Load session and validate matchIds
    const session = await this.loadOwnedSession(userId, sessionId);
    const matchIdSet = new Set(matchIds);
    const matchesToCategorize = session.matches.filter(
      m => matchIdSet.has(m.id) && m.status === 'pending',
    );

    if (matchesToCategorize.length === 0) {
      return { recommendations: [], splitRecommendations: [], costUsed: 0 };
    }

    // 3. Fetch category hierarchy and examples
    const categories = await this.chatbotDataService.getCategories(userId);
    const categoryContext = this.buildCategoryContext(categories);
    const examples = await this.buildExamples(userId, categories);

    // 4. Fetch transaction data for already-categorized flags
    const allTransactions = await this.chatbotDataService.queryTransactions(userId, {});
    const txMap = new Map(allTransactions.map(t => [t.id, t]));
    const catMap = new Map(categories.map(c => [c.id, c]));

    // 5. Prepare match data for Claude
    const matchData = matchesToCategorize.map(m => {
      const tx = txMap.get(m.transactionId);
      return {
        matchId: m.id,
        orderNumber: m.orderNumber,
        items: m.items.map(i => ({
          name: i.name,
          estimatedPrice: i.estimatedPrice,
        })),
        transactionAmount: tx ? Math.abs(tx.amount) : 0,
        currentCategoryId: tx?.categoryId ?? null,
        isSingleItem: m.items.length === 1,
      };
    });

    // 6. Call Claude
    const userMessage = `Categorize these Amazon order items:

MATCHED ORDERS:
${JSON.stringify(matchData)}

CATEGORY HIERARCHY:
${categoryContext}

EXAMPLES OF PREVIOUSLY CATEGORIZED TRANSACTIONS:
${examples}`;

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: AMAZON_CATEGORIZATION_SYSTEM_PROMPT,
      tools: [AMAZON_CATEGORIZATION_TOOL],
      messages: [{ role: 'user', content: userMessage }],
    });

    // Record cost
    const costResult = await this.costTracker.recordUsage(
      userId, 'sonnet', response.usage.input_tokens, response.usage.output_tokens,
    );

    // 7. Extract tool result
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === 'categorize_amazon_items',
    );

    if (!toolUse) {
      console.warn('[AmazonReceiptService] No tool_use in categorization response');
      return { recommendations: [], splitRecommendations: [], costUsed: costResult.estimatedCost };
    }

    const output = toolUse.input as {
      categorizations: Array<{
        matchId: string;
        suggestedCategoryId: string;
        confidence: number;
        reasoning: string;
        itemName: string;
      }>;
      splitRecommendations: Array<{
        matchId: string;
        splits: Array<{
          itemName: string;
          estimatedAmount: number;
          suggestedCategoryId: string;
          confidence: number;
          isEstimatedPrice: boolean;
        }>;
      }>;
    };

    // 8. Process categorizations
    const recommendations: AmazonCategoryRecommendation[] = (output.categorizations || []).map(c => {
      const match = matchesToCategorize.find(m => m.id === c.matchId);
      const tx = match ? txMap.get(match.transactionId) : null;
      const isAlreadyCategorized = !!tx?.categoryId && tx.categoryId !== CUSTOM_AMAZON_CATEGORY;
      return {
        matchId: c.matchId,
        transactionId: match?.transactionId ?? '',
        suggestedCategoryId: c.suggestedCategoryId,
        categoryName: catMap.get(c.suggestedCategoryId)?.name ?? 'Unknown',
        confidence: c.confidence,
        reasoning: c.reasoning,
        itemName: c.itemName,
        isAlreadyCategorized,
        currentCategoryId: tx?.categoryId ?? null,
      };
    });

    // 9. Process split recommendations
    const splitRecommendations: AmazonSplitRecommendation[] = (output.splitRecommendations || []).map(sr => {
      const match = matchesToCategorize.find(m => m.id === sr.matchId);
      const tx = match ? txMap.get(match.transactionId) : null;
      const originalAmount = tx ? Math.abs(tx.amount) : 0;

      // Adjust last split to absorb rounding
      const splits = sr.splits.map(s => ({
        ...s,
        categoryName: catMap.get(s.suggestedCategoryId)?.name ?? 'Unknown',
      }));

      const splitsTotal = splits.reduce((sum, s) => sum + s.estimatedAmount, 0);
      if (splits.length > 0 && Math.abs(splitsTotal - originalAmount) > 0.005) {
        const lastSplit = splits[splits.length - 1];
        lastSplit.estimatedAmount = Math.round(
          (lastSplit.estimatedAmount + (originalAmount - splitsTotal)) * 100
        ) / 100;
      }

      return {
        matchId: sr.matchId,
        transactionId: match?.transactionId ?? '',
        originalAmount,
        splits,
        totalMatchesOriginal: true,
      };
    });

    // 10. Update session status
    session.status = 'reviewing';
    const sessions = await this.loadSessions(userId);
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx >= 0) sessions[idx] = session;
    await this.saveSessions(userId, sessions);

    return {
      recommendations: recommendations.sort((a, b) => b.confidence - a.confidence),
      splitRecommendations,
      costUsed: costResult.estimatedCost,
    };
  }

  // ===========================================================================
  // Phase 6: Apply Changes & Rule Suggestions
  // ===========================================================================

  async applyActions(
    userId: string,
    sessionId: string,
    actions: AmazonApplyAction[],
  ): Promise<AmazonApplyResponse> {
    const session = await this.loadOwnedSession(userId, sessionId);

    let applied = 0;
    let splits = 0;
    let skipped = 0;
    let totalDollarsRecategorized = 0;
    const categoriesUpdated = new Set<string>();

    // Fetch transactions for amount tracking
    const allTransactions = await this.chatbotDataService.queryTransactions(userId, {});
    const txMap = new Map(allTransactions.map(t => [t.id, t]));

    for (const action of actions) {
      const match = session.matches.find(m => m.id === action.matchId);
      if (!match) continue;

      const tx = txMap.get(match.transactionId);

      if (action.type === 'categorize' && action.categoryId) {
        const result = await this.transactionService.updateTransactionCategory(
          userId, match.transactionId, action.categoryId,
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
          userId,
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

    // Update session to completed
    session.status = 'completed';
    const sessions = await this.loadSessions(userId);
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx >= 0) sessions[idx] = session;
    await this.saveSessions(userId, sessions);

    return {
      applied,
      splits,
      skipped,
      rulesCreated: 0, // Rules are created separately via suggestRules
      summary: {
        totalDollarsRecategorized: Math.round(totalDollarsRecategorized * 100) / 100,
        categoriesUpdated: [...categoriesUpdated],
      },
    };
  }

  async suggestRules(
    userId: string,
    sessionId: string,
  ): Promise<{ suggestions: RuleSuggestion[] }> {
    const session = await this.loadOwnedSession(userId, sessionId);
    const allSessions = await this.loadSessions(userId);

    // Collect all categorized items across sessions
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

    // Filter to recurring items (2+ appearances)
    const recurring = [...itemCategoryMap.entries()].filter(
      ([, info]) => info.count >= 2,
    );

    if (recurring.length === 0) {
      return { suggestions: [] };
    }

    // Check existing rules to avoid duplicates
    const existingRules = await this.autoCategorizeService.getRules(userId);
    const existingPatterns = new Set(
      existingRules.flatMap(r => r.patterns.map((p: string) => p.toLowerCase())),
    );

    // Get categories for names
    const categories = await this.chatbotDataService.getCategories(userId);
    const catMap = new Map(categories.map(c => [c.id, c]));

    const suggestions: RuleSuggestion[] = [];

    // Group recurring items by category
    const byCat = new Map<string, string[]>();
    for (const [itemName, info] of recurring) {
      if (!byCat.has(info.categoryId)) byCat.set(info.categoryId, []);
      byCat.get(info.categoryId)!.push(itemName);
    }

    for (const [categoryId, items] of byCat) {
      const cat = catMap.get(categoryId);
      if (!cat) continue;

      // Use Amazon merchant patterns as the rule pattern
      // (bank descriptions don't contain product names)
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

    // Reference session to keep TS happy
    void session;

    return { suggestions };
  }

  // ===========================================================================
  // Private: Categorization helpers
  // ===========================================================================

  private buildCategoryContext(categories: Category[]): string {
    const parents = categories.filter(c => !c.parentId && !c.isHidden);
    const childMap = new Map<string, Category[]>();
    for (const c of categories) {
      if (c.parentId && !c.isHidden) {
        if (!childMap.has(c.parentId)) childMap.set(c.parentId, []);
        childMap.get(c.parentId)!.push(c);
      }
    }
    const lines: string[] = [];
    for (const p of parents) {
      const children = childMap.get(p.id) || [];
      if (children.length > 0) {
        const childStr = children.map(c => `${c.name} (${c.id})`).join(', ');
        lines.push(`${p.name} (${p.id}): ${childStr}`);
      } else {
        lines.push(`${p.name} (${p.id})`);
      }
    }
    return lines.join('\n');
  }

  private async buildExamples(userId: string, categories: Category[]): Promise<string> {
    const categorized = await this.chatbotDataService.queryTransactions(userId, { limit: 500 });
    const withCategory = categorized.filter(t => t.categoryId);

    const byCategory = new Map<string, Transaction[]>();
    for (const t of withCategory) {
      if (!byCategory.has(t.categoryId!)) byCategory.set(t.categoryId!, []);
      byCategory.get(t.categoryId!)!.push(t);
    }

    const catMap = new Map(categories.map(c => [c.id, c]));
    const lines: string[] = [];
    const sorted = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length);

    for (const [catId, txns] of sorted.slice(0, MAX_EXAMPLE_CATEGORIES)) {
      const cat = catMap.get(catId);
      if (!cat) continue;
      const examples = txns.slice(0, MAX_EXAMPLES_PER_CATEGORY);
      const txStrs = examples.map(t =>
        `"${t.merchantName || t.name}" ($${Math.abs(t.amount).toFixed(2)})`
      ).join(', ');
      lines.push(`${cat.name} (${catId}): ${txStrs}`);
    }

    return lines.join('\n');
  }

  async getSessions(userId: string): Promise<AmazonReceiptSession[]> {
    return this.loadSessions(userId);
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.loadOwnedSession(userId, sessionId);
    const sessions = await this.loadSessions(userId);
    const filtered = sessions.filter(s => s.id !== sessionId);
    await this.saveSessions(userId, filtered);
  }

  async deleteAllSessions(userId: string): Promise<{ deleted: number }> {
    const sessions = await this.loadSessions(userId);
    const count = sessions.length;
    await this.saveSessions(userId, []);
    return { deleted: count };
  }
}
