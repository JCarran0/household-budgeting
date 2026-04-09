/**
 * Amazon Receipt Matching Service
 *
 * Handles PDF parsing (Claude vision), order-to-transaction matching,
 * item categorization, split recommendations, and session persistence.
 *
 * Phase 2 stub — method signatures defined, implementations added in Phases 3–6.
 */

import { DataService } from './dataService';
import { ChatbotCostTracker } from './chatbotCostTracker';
import { TransactionService } from './transactionService';
import { AutoCategorizeService } from './autoCategorizeService';
import { ChatbotDataService } from './chatbotDataService';
import { NotFoundError, ForbiddenError } from '../errors';
import type {
  AmazonReceiptSession,
  AmazonReceiptUploadResponse,
  AmazonReceiptMatchResponse,
  AmazonCategorizationResponse,
  AmazonApplyAction,
  AmazonApplyResponse,
  AmazonResolveAmbiguousRequest,
} from '../shared/types';

export class AmazonReceiptService {
  constructor(
    private readonly dataService: DataService,
    private readonly chatbotDataService: ChatbotDataService,
    private readonly costTracker: ChatbotCostTracker,
    private readonly transactionService: TransactionService,
    private readonly autoCategorizeService: AutoCategorizeService,
    private readonly anthropicApiKey: string,
  ) {}

  // ---------------------------------------------------------------------------
  // Session helpers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Public API — stubs (implemented in Phases 3–6)
  // ---------------------------------------------------------------------------

  async parseAndCreateSession(
    userId: string,
    _pdfBuffers: Buffer[],
  ): Promise<AmazonReceiptUploadResponse> {
    // Phase 3: PDF parsing via Claude vision
    // Uses: this.costTracker, this.anthropicApiKey, this.dataService
    void this.costTracker;
    void this.anthropicApiKey;
    await this.loadSessions(userId); // validates user data access
    throw new Error('Not implemented — Phase 3');
  }

  async matchOrders(
    userId: string,
    sessionId: string,
  ): Promise<AmazonReceiptMatchResponse> {
    // Phase 4: Transaction matching algorithm
    // Uses: this.transactionService, this.chatbotDataService
    void this.transactionService;
    void this.chatbotDataService;
    await this.loadOwnedSession(userId, sessionId);
    throw new Error('Not implemented — Phase 4');
  }

  async resolveAmbiguous(
    userId: string,
    sessionId: string,
    _resolutions: AmazonResolveAmbiguousRequest['resolutions'],
  ): Promise<void> {
    // Phase 4: Manual ambiguous match resolution
    await this.loadOwnedSession(userId, sessionId);
    throw new Error('Not implemented — Phase 4');
  }

  async categorizeMatches(
    userId: string,
    sessionId: string,
    _matchIds: string[],
  ): Promise<AmazonCategorizationResponse> {
    // Phase 5: AI categorization & split recommendations
    // Uses: this.autoCategorizeService
    void this.autoCategorizeService;
    await this.loadOwnedSession(userId, sessionId);
    throw new Error('Not implemented — Phase 5');
  }

  async applyActions(
    userId: string,
    sessionId: string,
    _actions: AmazonApplyAction[],
  ): Promise<AmazonApplyResponse> {
    // Phase 6: Apply changes via existing transaction APIs
    await this.loadOwnedSession(userId, sessionId);
    throw new Error('Not implemented — Phase 6');
  }

  async suggestRules(
    userId: string,
    sessionId: string,
  ): Promise<{ suggestions: unknown[] }> {
    // Phase 6: Auto-categorization rule suggestions
    await this.loadOwnedSession(userId, sessionId);
    throw new Error('Not implemented — Phase 6');
  }

  async getSessions(userId: string): Promise<AmazonReceiptSession[]> {
    return this.loadSessions(userId);
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    // Verify ownership before deleting
    await this.loadOwnedSession(userId, sessionId);

    const sessions = await this.loadSessions(userId);
    const filtered = sessions.filter(s => s.id !== sessionId);
    await this.saveSessions(userId, filtered);
  }
}
