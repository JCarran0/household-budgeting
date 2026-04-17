/**
 * Chat Action Proposal Store
 *
 * In-memory TTL-based store for pending action proposals. Proposals are
 * short-lived and session-scoped — no persistence needed.
 *
 * SECURITY (SEC-A005): Every proposal has a cryptographically random nonce.
 * SECURITY (SEC-A006): Nonces expire after 15 minutes.
 * SECURITY (SEC-A007): Only one active proposal per conversation. Issuing a
 *   new proposal atomically invalidates the prior one.
 * SECURITY: Ownership is userId-based (not familyId-based). Cross-user
 *   confirmation attempts return 'nonce_not_found' to avoid leaking existence.
 *
 * NOTE ON SCALING: This in-memory store works for the current single-PM2-process
 * deployment. If this ever scales to multiple nodes, nonces must move to Redis
 * or a shared store. See AI-DEPLOYMENTS.md for deployment context.
 */

import { randomUUID } from 'crypto';
import type { ActionProposal, ActionConfirmErrorCode, ActionConfirmResponse } from '../../shared/types';

const TTL_MS = 15 * 60 * 1000; // 15 minutes (SEC-A006)

interface StoredProposal {
  proposal: ActionProposal;
  userId: string;
  familyId: string;
  conversationId: string;  // Scopes "one active card per conversation" (D-2)
  createdAt: number;
  used: boolean;
  result?: ActionConfirmResponse;
}

// Keyed by nonce
const store = new Map<string, StoredProposal>();

// Active-per-conversation tracking — enforces SEC-A007, D-2
// Maps conversationId → active nonce
const activeByConversation = new Map<string, string>();

/**
 * Issue a new proposal for the given conversation. Atomically invalidates
 * any prior active proposal for the same conversation (SEC-A007).
 */
export function issueProposal(args: {
  userId: string;
  familyId: string;
  conversationId: string;
  proposalInput: Omit<ActionProposal, 'proposalId' | 'expiresAt'>;
}): ActionProposal {
  // Atomically supersede any prior active proposal for this conversation (SEC-A007)
  const priorNonce = activeByConversation.get(args.conversationId);
  if (priorNonce) {
    const prior = store.get(priorNonce);
    if (prior && !prior.used) {
      prior.used = true;
      prior.result = {
        success: false,
        error: 'Superseded by a newer proposal',
        errorCode: 'nonce_already_used',
      };
    }
  }

  const nonce = randomUUID();
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const proposal: ActionProposal = {
    ...args.proposalInput,
    proposalId: nonce,
    expiresAt,
  };

  store.set(nonce, {
    proposal,
    userId: args.userId,
    familyId: args.familyId,
    conversationId: args.conversationId,
    createdAt: Date.now(),
    used: false,
  });
  activeByConversation.set(args.conversationId, nonce);
  return proposal;
}

type ConsumeResult =
  | { ok: true; stored: StoredProposal }
  | { ok: false; errorCode: ActionConfirmErrorCode };

/**
 * Attempt to consume a proposal nonce for confirmation.
 *
 * SECURITY: Returns 'nonce_not_found' for both missing AND cross-user nonces
 * to avoid leaking nonce existence. (SEC-A005, ownership check)
 *
 * Marks the nonce as used on success to prevent replay. (SEC-A005)
 */
export function consumeProposal(args: {
  nonce: string;
  userId: string;
}): ConsumeResult {
  const stored = store.get(args.nonce);
  if (!stored) return { ok: false, errorCode: 'nonce_not_found' };

  // Ownership check — cross-user returns same 404 as missing (SEC: no existence leak)
  if (stored.userId !== args.userId) return { ok: false, errorCode: 'nonce_not_found' };

  if (Date.now() - stored.createdAt > TTL_MS) return { ok: false, errorCode: 'nonce_expired' };
  if (stored.used) return { ok: false, errorCode: 'nonce_already_used' };

  stored.used = true;
  return { ok: true, stored };
}

// Periodic memory sweep — remove expired/used entries to prevent unbounded growth
// Leak defense: entries are small (<1 KB each), but better to clean up.
const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [nonce, s] of store.entries()) {
    if (now - s.createdAt > TTL_MS) {
      store.delete(nonce);
      if (activeByConversation.get(s.conversationId) === nonce) {
        activeByConversation.delete(s.conversationId);
      }
    }
  }
}, 60 * 1000);

// Allow the process to exit cleanly even if the interval is live (jest, etc.)
sweepInterval.unref();
