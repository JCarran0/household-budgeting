/**
 * Tool Intercepts
 *
 * The two tools the agent may call that are NOT reads: `propose_action` and
 * `record_learning`. Both are intercepted inside the tool loop and handled
 * here; neither is ever dispatched to a data-tool executor.
 *
 * Extracted from chatbotService so the tool loop stays readable and so the
 * write-adjacent branches sit next to each other rather than buried in a
 * 700-line service (CLAUDE.md file-size budget).
 *
 * SECURITY (SEC-A001): `propose_action` NEVER executes anything. It validates
 * model output, issues a single-use nonce, and returns a card. Execution
 * happens only in POST /chatbot/actions/confirm, after a human clicks.
 */

import type {
  ActionProposal,
  ActionProposalInput,
  ChatActionId,
  LearningNotice,
} from '../../shared/types';
import { buildProposalRows, listChatActionIds } from '../chatActions';
import type { ProposalStore } from '../chatActions/proposalStore';
import { AgentLearningsStore, isCapabilityKey } from '../agentLearningsStore';

/**
 * `tool_error` results are returned to Claude with `is_error: true` so it can
 * self-correct within the existing iteration cap rather than failing the turn.
 */
/** The non-proposal branches — record_learning can only ever produce these. */
export type ToolMessageResult =
  | { kind: 'tool_error'; message: string }
  | { kind: 'tool_ok'; message: string };

export type InterceptResult =
  | ToolMessageResult
  | { kind: 'proposal'; proposal: ActionProposal; actionIds: ChatActionId[] };

export async function handleProposeAction(args: {
  rawInput: unknown;
  traceId: string;
  userId: string;
  familyId: string;
  conversationId: string;
  /**
   * Passed in rather than imported from services/index: this module is reached
   * FROM services/index, and importing back closes the cycle that TD-031
   * documents.
   */
  proposalStore: ProposalStore;
  /**
   * The request's deadline. Checked again just before the nonce is written:
   * everything between the caller's check and that write — row construction,
   * each action's `describeCurrent` — does live storage reads, and a turn that
   * has already returned an error to the user must not issue a card into the
   * conversation on its way out (SEC-A007).
   */
  signal?: AbortSignal;
}): Promise<InterceptResult> {
  const input = args.rawInput as ActionProposalInput;

  // Registry membership + per-row Zod validation + server-resolved labels
  // (SEC-A003, SEC-A004, SEC-P010, SEC-P011).
  const built = await buildProposalRows(input, {
    userId: args.userId,
    familyId: args.familyId,
  });
  if (!built.ok) {
    return {
      kind: 'tool_error',
      message: `${built.error} Valid actions: ${listChatActionIds().join(', ')}`,
    };
  }

  if (args.signal?.aborted) {
    return { kind: 'tool_error', message: 'Request cancelled before the proposal was issued.' };
  }

  // SECURITY: the nonce is NOT sent to Claude (SEC-A009). It goes to the
  // frontend in the proposal and comes back on confirm.
  const proposal = await args.proposalStore.issue({
    traceId: args.traceId,
    userId: args.userId,
    familyId: args.familyId,
    conversationId: args.conversationId,
    proposalInput: {
      rows: built.rows,
      reasoning: typeof input.reasoning === 'string' ? input.reasoning : '',
    },
  });

  return { kind: 'proposal', proposal, actionIds: built.rows.map(r => r.actionId) };
}

/**
 * A write, but to the maintainer-facing learnings collection, not to family
 * data. No confirmation card: there is nothing for the user to approve about
 * the agent noting its own blind spot. Visibility comes from the inline notice
 * instead (REQ-L001, REQ-L002, D-L02).
 */
export async function handleRecordLearning(args: {
  rawInput: unknown;
  store: AgentLearningsStore;
  familyId: string;
  conversationId: string;
  traceId: string;
  /** Same reasoning as propose_action: this store is durable. */
  signal?: AbortSignal;
}): Promise<{ result: ToolMessageResult; notice: LearningNotice | null }> {
  const input = args.rawInput as { capabilityKey?: unknown; title?: unknown; detail?: unknown };

  // REQ-L005: an unknown key comes back as a tool error so the model can
  // self-correct within the existing iteration limit.
  if (!isCapabilityKey(input.capabilityKey)) {
    return {
      result: {
        kind: 'tool_error',
        message: 'Unknown capabilityKey. Choose one from the enum in the tool schema.',
      },
      notice: null,
    };
  }

  const title = typeof input.title === 'string' ? input.title : '';
  const detail = typeof input.detail === 'string' ? input.detail : '';
  if (!title.trim()) {
    return {
      result: { kind: 'tool_error', message: 'A non-empty title is required.' },
      notice: null,
    };
  }

  if (args.signal?.aborted) {
    return {
      result: { kind: 'tool_error', message: 'Request cancelled.' },
      notice: null,
    };
  }

  const outcome = await args.store.recordCapabilityGap({
    familyId: args.familyId,
    conversationId: args.conversationId,
    capabilityKey: input.capabilityKey,
    title,
    detail,
    traceId: args.traceId,
  });

  // Terse, and never an error on the rate-limited path — a dropped learning is
  // not the user's problem and must not derail the turn (SEC-L005, SEC-L008).
  return {
    result: {
      kind: 'tool_ok',
      message: outcome.recorded
        ? 'Noted. Continue answering the user; do not record this again.'
        : 'Not recorded. Continue answering the user; do not retry.',
    },
    notice: outcome.recorded
      ? {
          capabilityKey: outcome.learning.capabilityKey ?? 'other',
          title: outcome.learning.title,
        }
      : null,
  };
}
