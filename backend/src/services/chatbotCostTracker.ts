/**
 * Chatbot Cost Tracker — SEC-010/011/012/017
 *
 * Tracks per-request and monthly aggregate LLM token usage and cost.
 * Uses an async mutex to prevent concurrent requests from bypassing
 * the spending cap via read-modify-write race conditions.
 */

import { Mutex } from 'async-mutex';
import type { DataService } from './dataService';
import type { ChatModel } from '../shared/types';

// Cost per million tokens by model (update when pricing changes)
const MODEL_PRICING: Record<ChatModel, { input: number; output: number }> = {
  haiku: { input: 1, output: 5 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 5, output: 25 },
};

interface CostRecord {
  timestamp: string;
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

interface MonthlyCostData {
  month: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCost: number;
  requests: CostRecord[];
}

export interface CostCheckResult {
  allowed: boolean;
  monthlySpend: number;
  monthlyLimit: number;
  remainingBudget: number;
}

export class ChatbotCostTracker {
  private mutex = new Mutex();

  // NOTE: CostTracker receives DataService (not ReadOnlyDataService) because it
  // needs to write cost tracking data. This is separate from the SEC-018 boundary
  // which protects user financial data in ChatbotDataService.
  constructor(
    private readonly dataService: DataService,
    private readonly monthlyLimit: number,
  ) {}

  /**
   * Check if the current monthly spend allows another request for the given
   * workspace. Each workspace has an independent monthly cap so business
   * chatbot usage cannot consume the family workspace's $20/mo budget (REQ-007 / D11).
   *
   * Acquires the mutex to ensure atomic read.
   *
   * @param familyId - The active workspace's familyId (from JWT claim).
   */
  async checkBudget(familyId: string): Promise<CostCheckResult> {
    const release = await this.mutex.acquire();
    try {
      const data = await this.getMonthData(familyId);
      const spend = data.totalEstimatedCost;
      return {
        allowed: spend < this.monthlyLimit,
        monthlySpend: Math.round(spend * 100) / 100,
        monthlyLimit: this.monthlyLimit,
        remainingBudget: Math.round(Math.max(0, this.monthlyLimit - spend) * 100) / 100,
      };
    } finally {
      release();
    }
  }

  /**
   * Record usage after a Claude API call completes.
   * Acquires the mutex to ensure atomic read-modify-write.
   * Returns whether the cap has been exceeded after this request.
   *
   * @param familyId - The active workspace's familyId (from JWT claim). Cost is
   *   accumulated in a per-workspace monthly bucket so workspaces cannot steal
   *   budget from each other (REQ-007 / D11).
   */
  async recordUsage(
    familyId: string,
    model: ChatModel,
    inputTokens: number,
    outputTokens: number,
  ): Promise<{ estimatedCost: number; capExceeded: boolean; monthlySpend: number }> {
    const release = await this.mutex.acquire();
    try {
      const pricing = MODEL_PRICING[model];
      const estimatedCost =
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output;

      const data = await this.getMonthData(familyId);

      const record: CostRecord = {
        timestamp: new Date().toISOString(),
        userId: familyId,
        model,
        inputTokens,
        outputTokens,
        estimatedCost: Math.round(estimatedCost * 1_000_000) / 1_000_000,
      };

      data.totalInputTokens += inputTokens;
      data.totalOutputTokens += outputTokens;
      data.totalEstimatedCost += estimatedCost;
      data.requests.push(record);

      await this.saveMonthData(familyId, data);

      const monthlySpend = Math.round(data.totalEstimatedCost * 100) / 100;

      return {
        estimatedCost: Math.round(estimatedCost * 1_000_000) / 1_000_000,
        capExceeded: data.totalEstimatedCost >= this.monthlyLimit,
        monthlySpend,
      };
    } finally {
      release();
    }
  }

  /**
   * Get current usage stats for the given workspace (no mutex needed —
   * point-in-time read).
   *
   * @param familyId - The active workspace's familyId (from JWT claim).
   */
  async getUsage(familyId: string): Promise<{ monthlySpend: number; monthlyLimit: number; remainingBudget: number }> {
    const data = await this.getMonthData(familyId);
    const spend = Math.round(data.totalEstimatedCost * 100) / 100;
    return {
      monthlySpend: spend,
      monthlyLimit: this.monthlyLimit,
      remainingBudget: Math.round(Math.max(0, this.monthlyLimit - spend) * 100) / 100,
    };
  }

  static estimateCost(model: ChatModel, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model];
    return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  }

  // --- Private helpers ---

  /**
   * Build the storage key for a given workspace and month.
   *
   * Key format: `chatbot_costs_{familyId}_{YYYY-MM}`
   *
   * DEPLOY NOTE (D11): The previous global key `chatbot_costs_{YYYY-MM}` is
   * orphaned on first deploy of this change. The family workspace's running
   * monthly total resets to $0 once — intentional and documented in D11.
   * This is acceptable for a 2-user app; the old key simply stops accumulating.
   */
  private getMonthKey(familyId: string): string {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `chatbot_costs_${familyId}_${month}`;
  }

  private async getMonthData(familyId: string): Promise<MonthlyCostData> {
    const key = this.getMonthKey(familyId);
    const data = await this.dataService.getData<MonthlyCostData>(key);
    if (data) return data;

    const now = new Date();
    return {
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalEstimatedCost: 0,
      requests: [],
    };
  }

  private async saveMonthData(familyId: string, data: MonthlyCostData): Promise<void> {
    const key = this.getMonthKey(familyId);
    await this.dataService.saveData(key, data);
  }
}
