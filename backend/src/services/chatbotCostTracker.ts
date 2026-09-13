/**
 * Chatbot Cost Tracker — SEC-010/011/012/017, REQ-P050 – REQ-P055
 *
 * Tracks per-request and monthly aggregate LLM token usage and cost.
 * Uses an async mutex to prevent concurrent requests from bypassing
 * the spending cap via read-modify-write race conditions.
 *
 * SPLIT CAPS (REQ-P050/P051)
 * Budget is capped per workspace AND per workload class. Interactive work (a
 * person waiting on a chat turn) and background work (unattended sweeps and
 * digests) draw on independent pools with independent kill switches, so a
 * runaway cron job exhausts its own allowance and the chatbot keeps answering.
 *
 * This supersedes SEC-010's single $20 cap from the chatbot BRD.
 */

import { Mutex } from 'async-mutex';
import type { DataService } from './dataService';
import type { ChatModel } from '../shared/types';
import type { WorkloadClass } from './workloadClass';

// Cost per million tokens by model (update when pricing changes).
//
// ⚠️ NOT re-verified when the model IDs moved to the 5 series (REQ-P056,
// 2026-09-13). These figures were set for the previous generation. If real
// pricing is higher, the $20 cap under-counts and real spend overshoots it;
// if lower, the cap is stricter than intended. Check current per-token rates
// and correct this table — it is the only thing standing between the family
// and an unbounded AI bill.
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
    /**
     * Independent allowance for unattended work. Defaults to the interactive
     * limit only so existing two-argument construction keeps working; real
     * wiring passes config.ai.backgroundMonthlyLimit.
     */
    private readonly backgroundMonthlyLimit: number = monthlyLimit,
  ) {}

  /** REQ-P051: each class has its own ceiling. */
  private limitFor(workload: WorkloadClass): number {
    return workload === 'background' ? this.backgroundMonthlyLimit : this.monthlyLimit;
  }

  /**
   * Check if the current monthly spend allows another request for the given
   * workspace. Each workspace has an independent monthly cap so business
   * chatbot usage cannot consume the family workspace's $20/mo budget (REQ-007 / D11).
   *
   * Acquires the mutex to ensure atomic read.
   *
   * @param familyId - The active workspace's familyId (from JWT claim).
   */
  async checkBudget(familyId: string, workload: WorkloadClass = 'interactive'): Promise<CostCheckResult> {
    const release = await this.mutex.acquire();
    try {
      const data = await this.getMonthData(familyId, workload);
      const limit = this.limitFor(workload);
      const spend = data.totalEstimatedCost;
      return {
        allowed: spend < limit,
        monthlySpend: Math.round(spend * 100) / 100,
        monthlyLimit: limit,
        remainingBudget: Math.round(Math.max(0, limit - spend) * 100) / 100,
      };
    } finally {
      release();
    }
  }

  /**
   * REQ-P055: bound a background batch BEFORE it starts.
   *
   * A batch that cannot finish inside the remaining allowance must not start at
   * all — a half-applied sweep is worse than one that never ran, because the
   * user is left reconciling which rows the AI reached.
   */
  async canAffordBatch(
    familyId: string,
    estimatedCost: number,
    workload: WorkloadClass = 'background',
  ): Promise<{ allowed: boolean; remainingBudget: number; estimatedCost: number }> {
    const { remainingBudget } = await this.checkBudget(familyId, workload);
    return {
      allowed: estimatedCost <= remainingBudget,
      remainingBudget,
      estimatedCost: Math.round(estimatedCost * 1_000_000) / 1_000_000,
    };
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
    workload: WorkloadClass = 'interactive',
  ): Promise<{ estimatedCost: number; capExceeded: boolean; monthlySpend: number }> {
    const release = await this.mutex.acquire();
    try {
      const pricing = MODEL_PRICING[model];
      const estimatedCost =
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output;

      const data = await this.getMonthData(familyId, workload);

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

      await this.saveMonthData(familyId, data, workload);

      const monthlySpend = Math.round(data.totalEstimatedCost * 100) / 100;

      return {
        estimatedCost: Math.round(estimatedCost * 1_000_000) / 1_000_000,
        capExceeded: data.totalEstimatedCost >= this.limitFor(workload),
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
  async getUsage(
    familyId: string,
    workload: WorkloadClass = 'interactive',
  ): Promise<{ monthlySpend: number; monthlyLimit: number; remainingBudget: number }> {
    const data = await this.getMonthData(familyId, workload);
    const limit = this.limitFor(workload);
    const spend = Math.round(data.totalEstimatedCost * 100) / 100;
    return {
      monthlySpend: spend,
      monthlyLimit: limit,
      remainingBudget: Math.round(Math.max(0, limit - spend) * 100) / 100,
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
  private getMonthKey(familyId: string, workload: WorkloadClass): string {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    // Interactive deliberately keeps the ORIGINAL key shape. Adding a suffix to
    // it would orphan the current month's accumulated spend and silently reset
    // the running total to $0 — the same one-time reset D11 accepted once, which
    // there is no reason to repeat. Background is new, so it gets a new key.
    return workload === 'background'
      ? `chatbot_costs_${familyId}_background_${month}`
      : `chatbot_costs_${familyId}_${month}`;
  }

  private async getMonthData(familyId: string, workload: WorkloadClass): Promise<MonthlyCostData> {
    const key = this.getMonthKey(familyId, workload);
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

  private async saveMonthData(familyId: string, data: MonthlyCostData, workload: WorkloadClass): Promise<void> {
    const key = this.getMonthKey(familyId, workload);
    await this.dataService.saveData(key, data);
  }
}
