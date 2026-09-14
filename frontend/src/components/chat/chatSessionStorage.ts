/**
 * What survives a refresh, and what it means when it does.
 *
 * The chat transcript, the full proposals (nonces included) and the
 * conversation id are kept in sessionStorage so a refresh mid-conversation does
 * not throw away a card the user was reviewing. That convenience has sharp
 * edges, and they all live here rather than being spread across ChatOverlay's
 * state initializers:
 *
 *   - `activeProposalMessageId` was NOT restored, so the supersede-the-previous
 *     -card bookkeeping had nothing to act on after a refresh: an old card
 *     stayed rendered as pending, with a live Confirm, beside a newer one.
 *     Clicking it returned "already confirmed or superseded" — the same message
 *     an abandoned turn produced, from an entirely different cause.
 *   - The expiry timer is a setTimeout, and timers do not survive a reload. A
 *     restored card would sit at `pending` forever.
 *   - The conversation id was regenerated on every mount, which quietly moved a
 *     restored transcript into a NEW conversation. Server-side supersession
 *     (SEC-A007) is scoped by conversation, so the restored card was left live
 *     in a conversation nothing would ever supersede.
 *
 * `reconcileRestoredProposals` is pure so the rules above can be tested without
 * a DOM, a clock, or a rendered overlay.
 */
import type { ActionProposal, ChatMessage, ChatModel } from '../../../../shared/types';

export const SESSION_KEY_HISTORY = 'chatbot_history';
export const SESSION_KEY_MODEL = 'chatbot_model';
export const SESSION_KEY_FULL_PROPOSALS = 'chatbot_full_proposals';
export const SESSION_KEY_CONVERSATION = 'chatbot_conversation_id';

/**
 * sessionStorage throws on quota, and a proposal can be large — a GitHub issue
 * body alone may be 64 KB and a plan card carries up to 100 rows. An exception
 * here fires during a render commit and takes the whole overlay down. Losing
 * restore-after-refresh is the correct failure; losing the chat is not.
 */
export function persist(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* quota or private mode — the conversation still works, it just won't survive a refresh */
  }
}

export function readStoredMessages(): ChatMessage[] {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY_HISTORY);
    return stored ? (JSON.parse(stored) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function readStoredModel(): ChatModel {
  try {
    return (sessionStorage.getItem(SESSION_KEY_MODEL) as ChatModel) || 'sonnet';
  } catch {
    return 'sonnet';
  }
}

/** Keyed by message id. Holds the nonce, which never enters `messages` (SEC-A009). */
export function readStoredProposals(): Map<string, ActionProposal> {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY_FULL_PROPOSALS);
    if (!stored) return new Map();
    return new Map(JSON.parse(stored) as [string, ActionProposal][]);
  } catch {
    return new Map();
  }
}

export function readStoredConversationId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY_CONVERSATION);
    if (stored) return stored;
  } catch {
    /* fall through to a fresh id */
  }
  return crypto.randomUUID();
}

export function clearChatSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY_HISTORY);
    sessionStorage.removeItem(SESSION_KEY_FULL_PROPOSALS);
    sessionStorage.removeItem(SESSION_KEY_CONVERSATION);
  } catch {
    /* nothing to clear */
  }
}

export interface RestoredProposalState {
  /** Past its nonce TTL, or missing its nonce entirely — not confirmable. */
  expired: Set<string>;
  /** Older live cards. Only the newest can still be live server-side. */
  superseded: Set<string>;
  /** The one card Confirm may still act on, if any. */
  active: string | null;
}

export function reconcileRestoredProposals(
  messages: ChatMessage[],
  proposals: Map<string, ActionProposal>,
  now = Date.now(),
): RestoredProposalState {
  const pending = messages.filter(m => m.proposalStatus === 'pending');
  const expired = new Set<string>();
  const live: string[] = [];

  for (const message of pending) {
    const full = proposals.get(message.id);
    // A card with no nonce cannot be confirmed, so it is not pending — it is
    // over. Rendering it as live is the lie this reconciliation exists to stop.
    if (!full || new Date(full.expiresAt).getTime() <= now) {
      expired.add(message.id);
      continue;
    }
    live.push(message.id);
  }

  return {
    expired,
    superseded: new Set(live.slice(0, -1)),
    active: live.length > 0 ? live[live.length - 1] : null,
  };
}
