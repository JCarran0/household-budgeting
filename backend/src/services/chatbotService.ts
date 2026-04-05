/**
 * ChatbotService — Chat Orchestration Layer
 *
 * Manages Claude API conversations, tool execution, cost tracking,
 * and GitHub issue submission. This is the "brain" that ties the chatbot together.
 *
 * Key safety features:
 * - Tool call loop capped at 10 iterations (D11, SEC-014)
 * - Per-request timeout of 60 seconds (SEC-015)
 * - max_tokens: 4096 per Claude call (D16, SEC-013)
 * - Conversation history truncated to 50 messages (D14, REQ-028)
 * - GitHub issue interception — never executed by LLM (D13, REQ-024)
 * - Cost tracking with mutex (D12, SEC-017)
 * - Structured logging (REQ-029)
 */

import Anthropic from '@anthropic-ai/sdk';
import { ChatbotDataService } from './chatbotDataService';
import { ChatbotCostTracker } from './chatbotCostTracker';
import { CHATBOT_SYSTEM_PROMPT, CHATBOT_TOOLS } from './chatbotPrompt';
import type {
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ChatModel,
  GitHubIssueDraft,
  QueryTransactionsInput,
  GetBudgetsInput,
  GetBudgetSummaryInput,
  GetSpendingByCategoryInput,
  GetCashFlowInput,
} from '../shared/types';

const MAX_TOOL_ITERATIONS = 10;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 4096;
const MAX_HISTORY = 50; // REQ-028

// Map ChatModel to Anthropic model IDs
const MODEL_IDS: Record<ChatModel, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
};

interface ToolCallLog {
  toolName: string;
  inputParams: Record<string, unknown>;
  resultSize: number;
  latencyMs: number;
}

export class ChatbotService {
  private client: Anthropic;

  constructor(
    private readonly chatbotDataService: ChatbotDataService,
    private readonly costTracker: ChatbotCostTracker,
    private readonly githubPat: string,
    anthropicApiKey: string,
  ) {
    this.client = new Anthropic({ apiKey: anthropicApiKey });
  }

  /**
   * Process a chat message: check budget, call Claude, execute tools, track cost.
   */
  async chat(userId: string, request: ChatRequest): Promise<ChatResponse> {
    // 1. Check monthly spend against cap
    const budget = await this.costTracker.checkBudget();
    if (!budget.allowed) {
      return this.capReachedResponse(budget.monthlySpend, budget.monthlyLimit);
    }

    // 2. Truncate conversation history (D14, REQ-028)
    const history = request.conversationHistory.slice(-MAX_HISTORY);

    // 3. Build Claude messages
    const messages = this.buildMessages(history, request.message, request.pageContext);

    // 4. Call Claude with tool loop
    const startTime = Date.now();
    const toolCallLogs: ToolCallLog[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      const result = await this.executeWithTimeout(
        this.toolLoop(userId, messages, request.model, toolCallLogs),
        REQUEST_TIMEOUT_MS,
      );

      totalInputTokens = result.totalInputTokens;
      totalOutputTokens = result.totalOutputTokens;

      // Check if we intercepted a GitHub issue submission
      if (result.type === 'issue_confirmation') {
        // Record usage before returning
        const costResult = await this.costTracker.recordUsage(
          userId, request.model, totalInputTokens, totalOutputTokens,
        );

        this.logRequest(userId, request.model, totalInputTokens, totalOutputTokens, costResult.estimatedCost, toolCallLogs, Date.now() - startTime);

        return {
          type: 'issue_confirmation',
          message: {
            id: this.generateId(),
            role: 'assistant',
            content: result.content,
            timestamp: new Date().toISOString(),
            model: request.model,
            tokenUsage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              estimatedCost: costResult.estimatedCost,
            },
          },
          issueDraft: result.issueDraft,
          usage: {
            monthlySpend: costResult.monthlySpend,
            monthlyLimit: budget.monthlyLimit,
            remainingBudget: Math.max(0, budget.monthlyLimit - costResult.monthlySpend),
            capExceeded: costResult.capExceeded,
          },
        };
      }

      // 5. Record usage
      const costResult = await this.costTracker.recordUsage(
        userId, request.model, totalInputTokens, totalOutputTokens,
      );

      this.logRequest(userId, request.model, totalInputTokens, totalOutputTokens, costResult.estimatedCost, toolCallLogs, Date.now() - startTime);

      return {
        type: 'message',
        message: {
          id: this.generateId(),
          role: 'assistant',
          content: result.content,
          timestamp: new Date().toISOString(),
          model: request.model,
          tokenUsage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            estimatedCost: costResult.estimatedCost,
          },
        },
        usage: {
          monthlySpend: costResult.monthlySpend,
          monthlyLimit: budget.monthlyLimit,
          remainingBudget: Math.max(0, budget.monthlyLimit - costResult.monthlySpend),
          capExceeded: costResult.capExceeded,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      // Log full error details for debugging
      console.error('[ChatbotService] Error:', {
        userId,
        model: request.model,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
        // Anthropic SDK errors include status and error details
        status: (error as Record<string, unknown>)?.status,
        errorBody: (error as Record<string, unknown>)?.error,
        toolCallLogs,
      });

      if (message === 'CHATBOT_REQUEST_TIMEOUT') {
        return this.errorResponse('That took too long — try a simpler question or a faster model.', budget);
      }
      if (message === 'CHATBOT_TOOL_LOOP_LIMIT') {
        return this.errorResponse('I got a bit carried away with the data lookups. Try asking a more focused question.', budget);
      }

      return this.errorResponse('Claude is temporarily unavailable. Try again in a moment.', budget);
    }
  }

  /**
   * Execute a confirmed GitHub issue submission.
   * This is the ONLY path to the GitHub API — the LLM cannot reach this directly.
   */
  async submitGitHubIssue(draft: GitHubIssueDraft): Promise<{ issueUrl: string }> {
    const response = await fetch(
      'https://api.github.com/repos/JCarran0/household-budgeting/issues',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.githubPat}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: draft.title,
          body: draft.body,
          labels: draft.labels,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error ${response.status}: ${text}`);
    }

    const data = await response.json() as { html_url: string };
    return { issueUrl: data.html_url };
  }

  /**
   * Get current usage stats.
   */
  async getUsage(): Promise<{ monthlySpend: number; monthlyLimit: number; remainingBudget: number }> {
    return this.costTracker.getUsage();
  }

  // ==========================================================================
  // Private: Tool loop
  // ==========================================================================

  private async toolLoop(
    userId: string,
    messages: Anthropic.MessageParam[],
    model: ChatModel,
    toolCallLogs: ToolCallLog[],
  ): Promise<{
    type: 'message' | 'issue_confirmation';
    content: string;
    issueDraft?: GitHubIssueDraft;
    totalInputTokens: number;
    totalOutputTokens: number;
  }> {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.client.messages.create({
        model: MODEL_IDS[model],
        max_tokens: MAX_OUTPUT_TOKENS,
        system: CHATBOT_SYSTEM_PROMPT,
        tools: CHATBOT_TOOLS,
        messages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // If Claude returned a final text response (no more tool calls)
      if (response.stop_reason === 'end_turn') {
        const textContent = response.content.find(b => b.type === 'text');
        return {
          type: 'message',
          content: textContent?.text || '',
          totalInputTokens,
          totalOutputTokens,
        };
      }

      // Process tool calls
      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          // INTERCEPT: GitHub issue submission — do NOT execute (D13, REQ-024)
          if (toolUse.name === 'submit_github_issue') {
            const input = toolUse.input as { title: string; body: string; labels: string[] };
            // Extract text content from this response for the confirmation message
            const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
            return {
              type: 'issue_confirmation',
              content: textBlock?.text || 'I\'ve drafted a GitHub issue for you. Please review and confirm.',
              issueDraft: {
                title: input.title,
                body: input.body,
                labels: input.labels,
              },
              totalInputTokens,
              totalOutputTokens,
            };
          }

          // Execute data tool
          const start = Date.now();
          const toolInput = toolUse.input as Record<string, unknown>;
          const result = await this.executeTool(userId, toolUse.name, toolInput);
          const latency = Date.now() - start;

          const resultStr = JSON.stringify(result);
          toolCallLogs.push({
            toolName: toolUse.name,
            inputParams: toolInput,
            resultSize: resultStr.length,
            latencyMs: latency,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: resultStr,
          });
        }

        // Append assistant response + tool results for next iteration
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
      }
    }

    // Hit iteration limit
    throw new Error('CHATBOT_TOOL_LOOP_LIMIT');
  }

  // ==========================================================================
  // Private: Tool execution
  // ==========================================================================

  private async executeTool(
    userId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    switch (toolName) {
      case 'query_transactions':
        return this.chatbotDataService.queryTransactions(userId, input as unknown as QueryTransactionsInput);
      case 'get_categories':
        return this.chatbotDataService.getCategories(userId);
      case 'get_budgets':
        return this.chatbotDataService.getBudgets(userId, (input as unknown as GetBudgetsInput).month);
      case 'get_budget_summary':
        return this.chatbotDataService.getBudgetSummary(userId, (input as unknown as GetBudgetSummaryInput).month);
      case 'get_accounts':
        return this.chatbotDataService.getAccounts(userId);
      case 'get_spending_by_category':
        return this.chatbotDataService.getSpendingByCategory(
          userId,
          (input as unknown as GetSpendingByCategoryInput).startDate,
          (input as unknown as GetSpendingByCategoryInput).endDate,
        );
      case 'get_cash_flow':
        return this.chatbotDataService.getCashFlow(
          userId,
          (input as unknown as GetCashFlowInput).startDate,
          (input as unknown as GetCashFlowInput).endDate,
        );
      case 'get_auto_categorization_rules':
        return this.chatbotDataService.getAutoCategorizeRules(userId);
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }

  // ==========================================================================
  // Private: Message building
  // ==========================================================================

  private buildMessages(
    history: ChatMessage[],
    currentMessage: string,
    pageContext: ChatRequest['pageContext'],
  ): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];

    // Convert conversation history
    for (const msg of history) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Add current message with page context
    const contextPrefix = pageContext
      ? `[Page context: ${pageContext.description}]\n\n`
      : '';
    messages.push({
      role: 'user',
      content: `${contextPrefix}${currentMessage}`,
    });

    return messages;
  }

  // ==========================================================================
  // Private: Helpers
  // ==========================================================================

  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('CHATBOT_REQUEST_TIMEOUT')), timeoutMs),
      ),
    ]);
  }

  private capReachedResponse(monthlySpend: number, monthlyLimit: number): ChatResponse {
    return {
      type: 'message',
      message: {
        id: this.generateId(),
        role: 'assistant',
        content: `Oof, we've hit the monthly AI budget cap ($${monthlySpend.toFixed(2)} of $${monthlyLimit.toFixed(2)}). I'll be back next month! In the meantime, the app's built-in reports and dashboards have all the data you need. 📊`,
        timestamp: new Date().toISOString(),
      },
      usage: {
        monthlySpend,
        monthlyLimit,
        remainingBudget: 0,
        capExceeded: true,
      },
    };
  }

  private errorResponse(
    message: string,
    budget: { monthlySpend: number; monthlyLimit: number; remainingBudget: number },
  ): ChatResponse {
    return {
      type: 'message',
      message: {
        id: this.generateId(),
        role: 'assistant',
        content: message,
        timestamp: new Date().toISOString(),
      },
      usage: {
        ...budget,
        capExceeded: false,
      },
    };
  }

  private logRequest(
    userId: string,
    model: ChatModel,
    inputTokens: number,
    outputTokens: number,
    estimatedCost: number,
    toolCallLogs: ToolCallLog[],
    totalLatencyMs: number,
  ): void {
    console.log('[ChatbotService] Request completed:', {
      userId,
      model,
      inputTokens,
      outputTokens,
      estimatedCost: `$${estimatedCost.toFixed(6)}`,
      toolCallCount: toolCallLogs.length,
      toolCalls: toolCallLogs.map(t => ({
        tool: t.toolName,
        resultSize: t.resultSize,
        latencyMs: t.latencyMs,
      })),
      totalLatencyMs,
    });
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
