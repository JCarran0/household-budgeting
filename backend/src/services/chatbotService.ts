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
 * - Per-request timeout, per model, that CANCELS the loop (SEC-015)
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
import { CHATBOT_SYSTEM_PROMPT } from './chatbotPrompt';
import { buildChatbotTools, getReadCapability } from './capabilities/readCapabilities';
import { AgentLearningsStore } from './agentLearningsStore';
import type { ProposalStore } from './chatActions/proposalStore';
import {
  AgentTraceStore,
  buildToolCallEntry,
  newTraceId,
  type AgentTrace,
  type TraceIteration,
  type TraceToolCall,
} from './agentTraceStore';
import { handleProposeAction, handleRecordLearning } from './capabilities/toolIntercepts';
import type {
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ChatModel,
  ActionProposal,
  LearningNotice,
} from '../shared/types';

const MAX_TOOL_ITERATIONS = 10;

/**
 * Per-request wall clock (SEC-015), by model.
 *
 * A single 60s ceiling was set when the assistant had a handful of read tools
 * and no plan cards. It is now routinely too tight for Opus with three or four
 * tool calls, and a timeout that fires on ordinary questions is not a safety
 * limit — it is a source of abandoned turns. Scaled by model speed instead, so
 * the ceiling still catches a runaway loop without punishing the slow model for
 * being the slow model.
 */
const REQUEST_TIMEOUT_MS: Record<ChatModel, number> = {
  haiku: 60_000,
  sonnet: 90_000,
  opus: 120_000,
};

/**
 * Thrown when the wall clock fires and the loop is cancelled mid-flight.
 *
 * Distinct from CHATBOT_REQUEST_TIMEOUT (which the race itself throws) because
 * the two describe different instants: the race loses at the deadline, while
 * this is the loop noticing it has been cancelled and declining to do anything
 * further. Both map to the same user-facing message.
 */
const ABORTED = 'CHATBOT_REQUEST_ABORTED';

/**
 * The caller hung up. Distinct from the deadline so a trace says WHICH kind of
 * abandonment happened — a run of these is how you discover the reverse proxy
 * is giving up before the app does.
 */
const CLIENT_GONE = 'CHATBOT_CLIENT_GONE';

/**
 * The check that makes cancellation mean something.
 *
 * An in-flight `messages.create` rejects on abort, so most of the time the loop
 * unwinds on its own. The dangerous case is the response that lands in the same
 * tick the deadline fires: the await resolves normally, and without this guard
 * the loop proceeds to `propose_action` on behalf of a request nobody is
 * waiting for any more. That is how an abandoned turn silently superseded a
 * live action card in production on 2026-09-14.
 */
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error(ABORTED);
}
const MAX_OUTPUT_TOKENS = 4096;
const MAX_HISTORY = 50; // REQ-028

// Map ChatModel to Anthropic model IDs
// REQ-P056. Reviewed 2026-09-13 against the current generation. Sonnet and
// Opus move to the 5 series; Haiku 4.5 is still current and stays pinned to its
// dated build. These are the identifiers the cost model in
// chatbotCostTracker.ts prices — update both together or the cap drifts from
// reality.
const MODEL_IDS: Record<ChatModel, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-5',
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

// REQ-P010: derived from the capability registry, not maintained alongside it.
// buildChatbotTools applies the cache breakpoint to the final tool (REQ-P017).
//
// Built on first use rather than at module load: propose_action's actionId enum
// is read from the chat-action registry, and this module sits inside the import
// cycle that registers those actions. Memoized, so the cached prefix is still
// byte-identical across requests.
let cachedTools: Anthropic.Tool[] | null = null;
function chatbotTools(): Anthropic.Tool[] {
  if (!cachedTools) cachedTools = buildChatbotTools();
  return cachedTools;
}

/**
 * Operational log line only — sizes, never contents. This is what reaches
 * CloudWatch. Trace contents go to AgentTraceStore instead, which has narrower
 * access and shorter retention (SEC-P040). The duplication is deliberate: the
 * two have different audiences and different safety requirements.
 */
interface ToolCallLog {
  toolName: string;
  inputParams: Record<string, unknown>;
  resultSize: number;
  latencyMs: number;
}

/**
 * Accumulates the structured trace as the tool loop runs (REQ-P060). Mutated in
 * place by toolLoop, the same way toolCallLogs already is, so the loop's return
 * shape stays a plain result rather than growing a second channel.
 */
interface TraceCollector {
  iterations: TraceIteration[];
  toolCalls: TraceToolCall[];
  proposalActionId: string | null;
  /**
   * REQ-L002: an autonomous learning write must be visible to the user in the
   * same turn. Collected here and attached to the response message so nothing
   * the agent writes about itself happens invisibly.
   */
  learningNotices: LearningNotice[];
}

/** In-request attachment data — transient, never persisted (SEC-A014). */
export interface ChatAttachment {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  filename: string;
}

/** Internal toolLoop result shape — discriminated union for type safety */
type ToolLoopResult =
  | ({ type: 'message'; content: string } & LoopTokens)
  | ({ type: 'action_proposal'; content: string; proposal: ActionProposal } & LoopTokens);

/**
 * Token counts for the whole loop. Cache reads and writes are carried
 * separately because they are billed at different multipliers of the input
 * price, and because `usage.input_tokens` excludes both — summing them into
 * the input total would price the cache at 1x and understate a write while
 * overstating a read.
 */
interface LoopTokens {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheWriteTokens: number;
  totalCacheReadTokens: number;
}

export class ChatbotService {
  private client: Anthropic;

  constructor(
    private readonly chatbotDataService: ChatbotDataService,
    private readonly costTracker: ChatbotCostTracker,
    anthropicApiKey: string,
    private readonly traceStore: AgentTraceStore,
    private readonly learningsStore: AgentLearningsStore,
    private readonly proposalStore: ProposalStore,
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
   * @param clientSignal  Aborts when the caller stops waiting — the HTTP
   *   connection closed before a response was written. The deadline is not the
   *   only way a turn becomes unwanted: nginx's own `proxy_read_timeout` (60s
   *   by default, and this app's ceiling for Opus is now 120s) closes the
   *   upstream connection while the loop runs on, as does a user closing the
   *   tab. Without this, that gap is the abandoned-turn bug relocated one layer
   *   up, and the fix for the deadline would not touch it.
   */
  async chat(
    familyId: string,
    request: ChatRequest,
    userId: string,
    attachment?: ChatAttachment,
    clientSignal?: AbortSignal,
  ): Promise<ChatResponse> {
    // 1. Check monthly spend against cap — scoped to this workspace (REQ-007 / D11).
    const budget = await this.costTracker.checkBudget(familyId);
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

    // REQ-P060/P062: one correlation ID per AI request, shared with any proposal
    // it issues and with the audit entry written when that proposal is confirmed.
    const traceId = newTraceId();
    const collector: TraceCollector = { iterations: [], toolCalls: [], proposalActionId: null, learningNotices: [] };

    try {
      const result = await this.executeWithTimeout(
        signal =>
          this.toolLoop(familyId, userId, conversationId, messages, request.model, toolCallLogs, collector, traceId, signal, request.userDisplayName),
        REQUEST_TIMEOUT_MS[request.model],
        clientSignal,
      );

      totalInputTokens = result.totalInputTokens;
      totalOutputTokens = result.totalOutputTokens;

      // 5. Record usage — including the cached prefix, which Anthropic bills
      //    and `usage.input_tokens` does not report (TD-012, REQ-P017).
      const costResult = await this.costTracker.recordUsage(
        familyId, request.model, totalInputTokens, totalOutputTokens, 'interactive',
        {
          writeTokens: result.totalCacheWriteTokens,
          readTokens: result.totalCacheReadTokens,
        },
      );

      const usage = {
        monthlySpend: costResult.monthlySpend,
        monthlyLimit: budget.monthlyLimit,
        remainingBudget: Math.max(0, budget.monthlyLimit - costResult.monthlySpend),
        capExceeded: costResult.capExceeded,
      };

      this.logRequest(familyId, request.model, totalInputTokens, totalOutputTokens, costResult.estimatedCost, toolCallLogs, Date.now() - startTime);

      await this.recordTrace({
        traceId, familyId, userId, conversationId, collector, attachment,
        model: request.model,
        latencyMs: Date.now() - startTime,
        totalInputTokens, totalOutputTokens,
        outcome: result.type === 'action_proposal' ? 'action_proposal' : 'message',
        errorMessage: null,
      });

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
            learningNotices: collector.learningNotices,
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
          learningNotices: collector.learningNotices,
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

      const spent = collector.iterations.reduce(
        (acc, i) => ({
          input: acc.input + i.inputTokens,
          output: acc.output + i.outputTokens,
          cacheWrite: acc.cacheWrite + i.cacheCreationTokens,
          cacheRead: acc.cacheRead + i.cacheReadTokens,
        }),
        { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
      );

      // Tokens spent before the failure were still billed. Recording them only
      // on the success path meant the two most expensive failure modes — a tool
      // loop that ran to its 10-iteration limit, and a request that timed out
      // after several Claude calls — cost real money and moved the monthly
      // total by $0. A cap that stops counting exactly when a request goes
      // wrong is not a cap. Best-effort: a failure here must not replace the
      // user's error message with a different one.
      try {
        await this.costTracker.recordUsage(
          familyId, request.model, spent.input, spent.output, 'interactive',
          { writeTokens: spent.cacheWrite, readTokens: spent.cacheRead },
        );
      } catch (recordError) {
        log.error({ err: recordError, familyId }, 'failed to record usage for a failed request');
      }

      // A failed request is the one most worth having a trace for.
      await this.recordTrace({
        traceId, familyId, userId, conversationId, collector, attachment,
        model: request.model,
        latencyMs: Date.now() - startTime,
        totalInputTokens: spent.input,
        totalOutputTokens: spent.output,
        outcome: 'error',
        errorMessage: message,
      });

      // Both halves of a cancelled request land here: the race's own rejection
      // and, if the loop got there first, its abort check. One message.
      if (
        message === 'CHATBOT_REQUEST_TIMEOUT' ||
        message === ABORTED ||
        message === CLIENT_GONE ||
        error instanceof Anthropic.APIUserAbortError
      ) {
        return this.errorResponse('That took too long — try a simpler question or a faster model.', budget);
      }
      if (message === 'CHATBOT_TOOL_LOOP_LIMIT') {
        return this.errorResponse('I got a bit carried away with the data lookups. Try asking a more focused question.', budget);
      }

      return this.errorResponse('Claude is temporarily unavailable. Try again in a moment.', budget);
    }
  }

  /**
   * Get current usage stats for the given workspace.
   *
   * @param familyId - The active workspace's familyId (from JWT claim).
   */
  async getUsage(familyId: string): Promise<{ monthlySpend: number; monthlyLimit: number; remainingBudget: number }> {
    return this.costTracker.getUsage(familyId);
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
    collector: TraceCollector,
    traceId: string,
    signal: AbortSignal,
    userDisplayName?: string,
  ): Promise<ToolLoopResult> {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheWriteTokens = 0;
    let totalCacheReadTokens = 0;

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
      throwIfAborted(signal);

      // The signal reaches Anthropic too: an abandoned turn must stop costing
      // money at the deadline, not keep generating into a dropped connection.
      const response = await this.client.messages.create(
        {
          model: MODEL_IDS[model],
          max_tokens: MAX_OUTPUT_TOKENS,
          system: systemBlocks,
          tools: chatbotTools(),
          messages,
        },
        { signal },
      );

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
      totalCacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
      totalCacheReadTokens += response.usage.cache_read_input_tokens ?? 0;

      // REQ-P060: per-call token counts and stop reason, not just the totals.
      // Cache hit/miss is what explains a surprising bill, so it is captured too.
      collector.iterations.push({
        iteration,
        stopReason: response.stop_reason,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      });

      // If Claude returned a final text response (no more tool calls)
      if (response.stop_reason === 'end_turn') {
        const textContent = response.content.find(b => b.type === 'text');
        return {
          type: 'message',
          content: textContent?.text || '',
          totalInputTokens,
          totalOutputTokens,
          totalCacheWriteTokens,
          totalCacheReadTokens,
        };
      }

      // Process tool calls
      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          // INSIDE the loop, not above it. Claude emits parallel tool blocks
          // routinely, and the read tools ahead of a propose_action in the same
          // message are the slow part of a turn — so the deadline lands DURING
          // this loop far more often than between iterations. Checking once
          // before the loop left the original bug fully reproducible.
          throwIfAborted(signal);

          // INTERCEPT: Action proposal — do NOT execute (SEC-A001, D-8)
          // Includes submit_github_issue (migrated from bespoke intercept per D-15)
          if (toolUse.name === 'propose_action') {
            const outcome = await handleProposeAction({
              rawInput: toolUse.input,
              traceId,
              userId,
              familyId,
              conversationId,
              proposalStore: this.proposalStore,
              // Re-checked immediately before the nonce is written. Between the
              // check above and the write sit `buildProposalRows` and each
              // action's `describeCurrent`, which do live storage reads — a
              // deadline can fall inside those just as easily.
              signal,
            });

            if (outcome.kind !== 'proposal') {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: outcome.message,
                is_error: true,
              });
              continue;
            }

            // Distinct action types on the card, so a trace records what a
            // heterogeneous plan proposed rather than only its first row.
            collector.proposalActionId = Array.from(new Set(outcome.actionIds)).join('+');

            const textBlock = response.content.find(
              (b): b is Anthropic.TextBlock => b.type === 'text',
            );
            const rowCount = outcome.proposal.rows.length;

            return {
              type: 'action_proposal',
              content:
                textBlock?.text ??
                (rowCount === 1
                  ? `${outcome.proposal.rows[0].label} ready for your review.`
                  : `${rowCount} changes ready for your review.`),
              proposal: outcome.proposal,
              totalInputTokens,
              totalOutputTokens,
              totalCacheWriteTokens,
              totalCacheReadTokens,
            };
          }

          // INTERCEPT: record_learning — the agent noting its own blind spot.
          if (toolUse.name === 'record_learning') {
            const { result, notice } = await handleRecordLearning({
              rawInput: toolUse.input,
              store: this.learningsStore,
              familyId,
              conversationId,
              traceId,
              // The learnings store is durable too: an abandoned turn must not
              // leave a record behind any more than it may issue a card.
              signal,
            });
            if (notice) collector.learningNotices.push(notice);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result.message,
              ...(result.kind === 'tool_error' ? { is_error: true } : {}),
            });
            continue;
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

          // REQ-P061: the result verbatim, exactly as handed to the model. This
          // is the field that answers "what did it actually see?" — the question
          // the Subaru incident could not be answered without.
          collector.toolCalls.push(
            buildToolCallEntry({
              sequence: collector.toolCalls.length,
              toolName: toolUse.name,
              input: toolInput,
              result,
              latencyMs: latency,
            }),
          );

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

  /**
   * Dispatch a read tool through the capability registry (REQ-P010).
   *
   * Replaces a hand-maintained switch that had to be kept in sync with a
   * separate tool-definition array. A tool the model can see now cannot exist
   * without an executor, because they are the same object.
   */
  private async executeTool(
    familyId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const capability = getReadCapability(toolName);
    if (!capability) {
      return { error: `Unknown tool: ${toolName}` };
    }
    return capability.execute(input, this.chatbotDataService, familyId);
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
        // conversationHistory is client-supplied and passthrough-validated, so
        // `rows` is whatever the caller sent. Guard the shape rather than
        // trusting it — a non-array here would 500 the whole turn.
        const rows = Array.isArray(msg.proposal.rows) ? msg.proposal.rows : [];
        const rowSummary = rows.length === 1
          ? `actionId: ${String(rows[0]?.actionId)}, summary: "${String(rows[0]?.displaySummary)}"`
          : `${rows.length} rows: ${rows.map(r => String(r?.actionId)).join(', ')}`;
        pendingProposalContext =
          `[Context: An action proposal is currently pending — ${rowSummary}. ` +
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

  /**
   * Race the work against the wall clock — and CANCEL the loser.
   *
   * This used to be a bare `Promise.race` over a promise it had no handle on.
   * Losing the race returned an error to the user and left the tool loop
   * running: still calling Claude, still spending tokens nothing counted, and
   * still able to reach `propose_action`. On 2026-09-14 a turn abandoned at 60s
   * finished 87 seconds later, issued a proposal no client ever received, and
   * — because SEC-A007 invalidates every other live nonce in the conversation —
   * burned the card the user was looking at. The card was correct; the
   * confirmation failed with "already confirmed or superseded".
   *
   * So the caller no longer hands over a running promise. It hands over a
   * function that takes the signal, which makes the work cancellable by
   * construction rather than by remembering to wire it up.
   */
  private async executeWithTimeout<T>(
    run: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    clientSignal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;

    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('CHATBOT_REQUEST_TIMEOUT'));
      }, timeoutMs);
    });

    // "Nobody is waiting for this any more" has two causes and one correct
    // response. Listener removed in the finally below so a long-lived request
    // object cannot accumulate them.
    let onClientGone = () => {};
    const hangUp = new Promise<never>((_, reject) => {
      onClientGone = () => {
        controller.abort();
        // Reject rather than waiting for the loop to notice. Whether the
        // in-flight call honours an abort is the SDK's business; freeing this
        // request when nobody is listening is ours.
        reject(new Error(CLIENT_GONE));
      };
    });
    if (clientSignal) {
      if (clientSignal.aborted) onClientGone();
      else clientSignal.addEventListener('abort', onClientGone, { once: true });
    }

    try {
      return await Promise.race([run(controller.signal), deadline, hangUp]);
    } finally {
      clientSignal?.removeEventListener('abort', onClientGone);
      // The timer is cleared on every path: a 60-to-120 second dangling handle
      // per request is a leak in its own right. The abort is belt and braces —
      // on the success path the loop has already returned, and on any error
      // path it guarantees nothing outlives the response.
      clearTimeout(timer);
      controller.abort();
    }
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

  /**
   * Persist the structured trace (REQ-P060).
   *
   * Attachments are recorded as metadata only — mime type and byte count, never
   * the buffer and never extracted text (SEC-P041, preserving SEC-A014/A016).
   *
   * Never throws: AgentTraceStore.record swallows its own failures, and this
   * wrapper guards the assembly step too. Diagnostic exhaust must not be able to
   * fail a user's request.
   */
  private async recordTrace(args: {
    traceId: string;
    familyId: string;
    userId: string;
    conversationId: string;
    collector: TraceCollector;
    attachment?: ChatAttachment;
    model: ChatModel;
    latencyMs: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    outcome: AgentTrace['outcome'];
    errorMessage: string | null;
  }): Promise<void> {
    try {
      const { collector } = args;
      await this.traceStore.record({
        traceId: args.traceId,
        familyId: args.familyId,
        userId: args.userId,
        conversationId: args.conversationId,
        workloadClass: 'interactive',
        model: MODEL_IDS[args.model],
        createdAt: new Date().toISOString(),
        latencyMs: args.latencyMs,
        iterationCount: collector.iterations.length,
        finalStopReason: collector.iterations.at(-1)?.stopReason ?? null,
        iterations: collector.iterations,
        toolCalls: collector.toolCalls,
        totalInputTokens: args.totalInputTokens,
        totalOutputTokens: args.totalOutputTokens,
        outcome: args.outcome,
        proposalIssued: collector.proposalActionId !== null,
        proposalActionId: collector.proposalActionId,
        attachment: args.attachment
          ? { mimeType: args.attachment.mimeType, bytes: args.attachment.buffer.length }
          : null,
        errorMessage: args.errorMessage,
        // REQ-P063: a trace referenced by a learning is the evidence for it, so
        // it must outlive the 30-day window while that learning is open —
        // learnings are kept indefinitely, traces are not. Pinned at write time
        // rather than through traceStore.pin(), because the trace does not
        // exist yet when record_learning runs inside the loop; a later pin()
        // call would have been a no-op against a missing row, which is exactly
        // why the flag was set and never used.
        pinned: collector.learningNotices.length > 0,
      });
    } catch (error) {
      log.error({ err: error, traceId: args.traceId }, 'failed to assemble agent trace');
    }
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
