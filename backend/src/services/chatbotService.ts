/**
 * ChatbotService — Chat Orchestration Layer
 *
 * Manages Claude API conversations, tool execution, and cost tracking. This
 * is the "brain" that ties the chatbot together. Write actions (including
 * the GitHub-issue flow) flow through the chat-action registry and the
 * shared propose_action intercept — see services/chatActions/ (D-15).
 *
 * Key safety features:
 * - Tool call loop capped at 10 iterations (D11, SEC-014)
 * - Per-request timeout of 60 seconds (SEC-015)
 * - max_tokens: 4096 per Claude call (D16, SEC-013)
 * - Conversation history truncated to 50 messages (D14, REQ-028)
 * - propose_action interception — actions never executed by LLM (SEC-A001)
 * - Cost tracking with mutex (D12, SEC-017)
 * - Structured logging (REQ-029)
 * - Attachment content passed as SDK content blocks, never string-interpolated (SEC-A009)
 */

import Anthropic from '@anthropic-ai/sdk';
import { ChatbotDataService } from './chatbotDataService';
import { ChatbotCostTracker } from './chatbotCostTracker';
import { childLogger } from '../utils/logger';

const log = childLogger('chatbotService');
import { CHATBOT_SYSTEM_PROMPT, CHATBOT_TOOLS } from './chatbotPrompt';
import { getChatAction, listChatActionIds, issueProposal } from './chatActions';
import type {
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ChatModel,
  QueryTransactionsInput,
  GetBudgetsInput,
  GetBudgetSummaryInput,
  GetSpendingByCategoryInput,
  GetCashFlowInput,
  ActionProposalInput,
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

// TD-012 part 1 — prompt caching. The static CHATBOT_SYSTEM_PROMPT and
// CHATBOT_TOOLS together form the stable prefix of every request. A
// `cache_control: { type: 'ephemeral' }` breakpoint at the end of each block
// lets Anthropic reuse the tokenized prefix across the 5-minute TTL window,
// cutting input-token cost on every follow-up turn. Per-request suffixes
// (e.g., user display name) are appended AFTER the cache breakpoint so they
// don't invalidate the cache.
const SYSTEM_PROMPT_BASE: Anthropic.TextBlockParam = {
  type: 'text',
  text: CHATBOT_SYSTEM_PROMPT,
  cache_control: { type: 'ephemeral' },
};

const CACHED_CHATBOT_TOOLS: Anthropic.Tool[] = CHATBOT_TOOLS.map((tool, i, arr) =>
  i === arr.length - 1
    ? { ...tool, cache_control: { type: 'ephemeral' as const } }
    : tool,
);

interface ToolCallLog {
  toolName: string;
  inputParams: Record<string, unknown>;
  resultSize: number;
  latencyMs: number;
}

/** In-request attachment data — transient, never persisted (SEC-A014). */
export interface ChatAttachment {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  filename: string;
}

/** Internal toolLoop result shape — discriminated union for type safety */
type ToolLoopResult =
  | { type: 'message'; content: string; totalInputTokens: number; totalOutputTokens: number }
  | { type: 'action_proposal'; content: string; proposal: ReturnType<typeof issueProposal>; totalInputTokens: number; totalOutputTokens: number };

export class ChatbotService {
  private client: Anthropic;

  constructor(
    private readonly chatbotDataService: ChatbotDataService,
    private readonly costTracker: ChatbotCostTracker,
    anthropicApiKey: string,
  ) {
    this.client = new Anthropic({ apiKey: anthropicApiKey });
  }

  /**
   * Process a chat message: check budget, call Claude, execute tools, track cost.
   *
   * @param familyId  Family context for data tools
   * @param request   Chat request (message, history, model, etc.)
   * @param userId    Authenticated user ID — used for action proposal ownership
   * @param attachment  Optional file attachment (image or PDF)
   */
  async chat(
    familyId: string,
    request: ChatRequest,
    userId: string,
    attachment?: ChatAttachment,
  ): Promise<ChatResponse> {
    // 1. Check monthly spend against cap (SEC-A019, SEC-A020)
    const budget = await this.costTracker.checkBudget();
    if (!budget.allowed) {
      return this.capReachedResponse(budget.monthlySpend, budget.monthlyLimit);
    }

    // 2. Truncate conversation history (D14, REQ-028)
    const history = request.conversationHistory.slice(-MAX_HISTORY);

    // 3. Build Claude messages (attachment content via SDK content blocks, not prompt injection)
    const messages = this.buildMessages(history, request.message, request.pageContext, attachment);

    // 4. Call Claude with tool loop
    const startTime = Date.now();
    const toolCallLogs: ToolCallLog[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // conversationId defaults to a stable fallback if frontend hasn't sent one yet
    const conversationId = request.conversationId ?? `anon_${familyId}`;

    try {
      const result = await this.executeWithTimeout(
        this.toolLoop(familyId, userId, conversationId, messages, request.model, toolCallLogs, request.userDisplayName),
        REQUEST_TIMEOUT_MS,
      );

      totalInputTokens = result.totalInputTokens;
      totalOutputTokens = result.totalOutputTokens;

      // 5. Record usage
      const costResult = await this.costTracker.recordUsage(
        familyId, request.model, totalInputTokens, totalOutputTokens,
      );

      const usage = {
        monthlySpend: costResult.monthlySpend,
        monthlyLimit: budget.monthlyLimit,
        remainingBudget: Math.max(0, budget.monthlyLimit - costResult.monthlySpend),
        capExceeded: costResult.capExceeded,
      };

      this.logRequest(familyId, request.model, totalInputTokens, totalOutputTokens, costResult.estimatedCost, toolCallLogs, Date.now() - startTime);

      // 6. Build response by result type
      if (result.type === 'action_proposal') {
        return {
          type: 'action_proposal',
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
          proposal: result.proposal,
          usage,
        };
      }

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
        usage,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error(
        {
          err: error,
          familyId,
          model: request.model,
          status: (error as Record<string, unknown>)?.status,
          errorBody: (error as Record<string, unknown>)?.error,
          toolCallLogs,
        },
        message,
      );

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
   * Get current usage stats.
   */
  async getUsage(): Promise<{ monthlySpend: number; monthlyLimit: number; remainingBudget: number }> {
    return this.costTracker.getUsage();
  }

  // ==========================================================================
  // Private: Tool loop
  // ==========================================================================

  private async toolLoop(
    familyId: string,
    userId: string,
    conversationId: string,
    messages: Anthropic.MessageParam[],
    model: ChatModel,
    toolCallLogs: ToolCallLog[],
    userDisplayName?: string,
  ): Promise<ToolLoopResult> {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // The cached system-prompt block must stay byte-identical across turns.
    // User-specific context is appended AFTER the cache breakpoint so it
    // personalizes the response without invalidating the cache.
    const systemBlocks: Anthropic.TextBlockParam[] = userDisplayName
      ? [
          SYSTEM_PROMPT_BASE,
          {
            type: 'text',
            text: `The user you are chatting with is named ${userDisplayName}. Address them by name occasionally.`,
          },
        ]
      : [SYSTEM_PROMPT_BASE];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.client.messages.create({
        model: MODEL_IDS[model],
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemBlocks,
        tools: CACHED_CHATBOT_TOOLS,
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
          // INTERCEPT: Action proposal — do NOT execute (SEC-A001, D-8)
          // Includes submit_github_issue (migrated from bespoke intercept per D-15)
          if (toolUse.name === 'propose_action') {
            const input = toolUse.input as ActionProposalInput;

            // Registry membership check (SEC-A003)
            const actionDef = getChatAction(input.actionId);
            if (!actionDef) {
              // Return tool error so Claude can self-correct within MAX_TOOL_ITERATIONS
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: `Unknown actionId: "${input.actionId}". Valid actions: ${listChatActionIds().join(', ')}`,
                is_error: true,
              });
              continue;
            }

            // Zod validation of params (SEC-A004)
            const parsed = actionDef.paramsSchema.safeParse(input.params);
            if (!parsed.success) {
              // Return validation error so Claude can retry with corrected values
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: `Invalid params for ${input.actionId}: ${parsed.error.message}. Retry with corrected values.`,
                is_error: true,
              });
              continue;
            }

            // Validation succeeded — issue nonce and return proposal to frontend
            // SECURITY: nonce is NOT sent to Claude (SEC-A009). The LLM only
            // sees the proposal ID via conversation context if it re-proposes.
            const proposal = issueProposal({
              userId,
              familyId,
              conversationId,
              proposalInput: {
                actionId: input.actionId,
                params: parsed.data as Record<string, unknown>,
                displaySummary: input.displaySummary,
                displayFields: input.displayFields,
                reasoning: input.reasoning,
              },
            });

            const textBlock = response.content.find(
              (b): b is Anthropic.TextBlock => b.type === 'text',
            );

            return {
              type: 'action_proposal',
              content: textBlock?.text ?? `${actionDef.label} ready for your review.`,
              proposal,
              totalInputTokens,
              totalOutputTokens,
            };
          }

          // Execute data tool
          const start = Date.now();
          const toolInput = toolUse.input as Record<string, unknown>;
          const result = await this.executeTool(familyId, toolUse.name, toolInput);
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
    familyId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    switch (toolName) {
      case 'query_transactions':
        // TD-012 Sprint 2: cap rows in context; returns summary when truncated.
        return this.chatbotDataService.queryTransactionsForTool(familyId, input as unknown as QueryTransactionsInput);
      case 'get_categories':
        return this.chatbotDataService.getCategories(familyId);
      case 'get_budgets':
        return this.chatbotDataService.getBudgets(familyId, (input as unknown as GetBudgetsInput).month);
      case 'get_budget_summary':
        return this.chatbotDataService.getBudgetSummary(familyId, (input as unknown as GetBudgetSummaryInput).month);
      case 'get_accounts':
        return this.chatbotDataService.getAccounts(familyId);
      case 'get_spending_by_category':
        return this.chatbotDataService.getSpendingByCategory(
          familyId,
          (input as unknown as GetSpendingByCategoryInput).startDate,
          (input as unknown as GetSpendingByCategoryInput).endDate,
        );
      case 'get_cash_flow':
        return this.chatbotDataService.getCashFlow(
          familyId,
          (input as unknown as GetCashFlowInput).startDate,
          (input as unknown as GetCashFlowInput).endDate,
        );
      case 'get_auto_categorization_rules':
        return this.chatbotDataService.getAutoCategorizeRules(familyId);
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
    attachment?: ChatAttachment,
  ): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];

    // Convert conversation history
    // Task 4.6: If a prior message carries proposal metadata, append a
    // lightweight reminder to the next user turn (not the system prompt) so
    // Claude knows a proposal is pending. The nonce is NEVER included.
    let pendingProposalContext: string | undefined;
    for (const msg of history) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
      // Track the latest pending proposal so we can inject context on the current turn
      if (msg.role === 'assistant' && msg.proposal && msg.proposalStatus === 'pending') {
        pendingProposalContext =
          `[Context: An action proposal is currently pending — actionId: ${msg.proposal.actionId}, ` +
          `summary: "${msg.proposal.displaySummary}". ` +
          `If the user's message is a refinement, call propose_action again with updated params. ` +
          `Otherwise, answer normally and remind the user of the pending proposal.]`;
      } else if (msg.role === 'assistant' && msg.proposalStatus && msg.proposalStatus !== 'pending') {
        // Proposal resolved — stop injecting the context reminder
        pendingProposalContext = undefined;
      }
    }

    // Build user turn content blocks
    const contextPrefix = pageContext
      ? `[Page context: ${pageContext.description}]\n\n`
      : '';

    const proposalPrefix = pendingProposalContext ? `${pendingProposalContext}\n\n` : '';
    const textContent = `${contextPrefix}${proposalPrefix}${currentMessage}`;

    if (attachment) {
      // SECURITY (SEC-A009): Attachment content flows through SDK content blocks.
      // It is NEVER string-interpolated into the system prompt or any message text.
      const contentBlocks: Anthropic.ContentBlockParam[] = [];

      if (attachment.mimeType === 'application/pdf') {
        contentBlocks.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: attachment.buffer.toString('base64'),
          },
        } as Anthropic.ContentBlockParam);
      } else {
        // image/jpeg | image/png | image/webp
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: attachment.mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
            data: attachment.buffer.toString('base64'),
          },
        });
      }

      contentBlocks.push({
        type: 'text',
        text: textContent || 'What is this?',
      });

      messages.push({
        role: 'user',
        content: contentBlocks,
      });
    } else {
      messages.push({
        role: 'user',
        content: textContent,
      });
    }

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
    familyId: string,
    model: ChatModel,
    inputTokens: number,
    outputTokens: number,
    estimatedCost: number,
    toolCallLogs: ToolCallLog[],
    totalLatencyMs: number,
  ): void {
    log.info(
      {
        familyId,
        model,
        inputTokens,
        outputTokens,
        estimatedCost,
        toolCallCount: toolCallLogs.length,
        toolCalls: toolCallLogs.map(t => ({
          tool: t.toolName,
          resultSize: t.resultSize,
          latencyMs: t.latencyMs,
        })),
        totalLatencyMs,
      },
      'request completed',
    );
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
