/**
 * Chat Action Proposal Store — durable (REQ-P028, REQ-P082, TD-030)
 *
 * SECURITY (SEC-A005): Every proposal has a cryptographically random nonce.
 * SECURITY (SEC-A006): Nonces expire after 15 minutes.
 * SECURITY (SEC-A007): Only one active proposal per conversation. Issuing a
 *   new proposal atomically invalidates the prior one.
 * SECURITY: Ownership is userId-based (not familyId-based). Cross-user
 *   confirmation attempts return 'nonce_not_found' to avoid leaking existence.
 *
 * WHY THIS IS NO LONGER A Map:
 * The in-memory store was correct for what it held: a card scoped to the
 * conversation that produced it, alive for fifteen minutes, on one PM2 process.
 * REQ-P082 changes the requirement — a proposal queued for review outside the
 * conversation that produced it cannot live in memory a deploy clears. And even
 * before that, a restart mid-conversation turned Confirm into "Proposal not
 * found" on a card the user was looking at.
 *
 * WHAT DID NOT CHANGE, AND MUST NOT:
 * TTL and single-use are enforced HERE, in code, not by the storage. A store
 * that expired rows for us would mean expiry depended on a sweep having run;
 * as written, a nonce past its TTL is refused on read no matter what is on
 * disk. Likewise supersession: SEC-A007 is atomic because the read, the
 * invalidation and the write of the new nonce all happen inside one mutex
 * section, exactly as they happened inside one synchronous function before.
 *
 * PERSISTED STATE INCLUDES `used` AND `result`. A used nonce is kept until its
 * TTL rather than deleted, because "already used" and "never existed" must stay
 * distinguishable — deleting on use would turn a double-click into
 * nonce_not_found and lose the superseded-by-a-newer-proposal message.
 */

import { randomUUID } from 'crypto';
import { Mutex } from 'async-mutex';
import type { ActionProposal, ActionConfirmErrorCode, ActionConfirmResponse } from '../../shared/types';
import type { DataService } from '../dataService';
import { mintConfirmationGrant, type ExecutionGrant } from './executionGrant';
import { childLogger } from '../../utils/logger';

const log = childLogger('proposalStore');

const TTL_MS = 15 * 60 * 1000; // 15 minutes (SEC-A006)

export interface StoredProposal {
  proposal: ActionProposal;
  userId: string;
  familyId: string;
  conversationId: string;  // Scopes "one active card per conversation" (D-2)
  /**
   * Correlation ID for the AI request that produced this proposal (REQ-P062).
   * Lets a confirmed write be traced back to the tool results that motivated it.
   */
  traceId: string;
  createdAt: number;
  used: boolean;
  result?: ActionConfirmResponse;
}

export type ConsumeResult =
  /**
   * `grants` are minted here and only here for the confirmation path: consuming
   * a nonce IS the authorization event, so proof of it is produced at the same
   * instant rather than reconstructed later (REQ-P002).
   *
   * One grant per row, keyed by rowId. A plan card's rows may target different
   * actions, and a grant is bound to a single actionId — so a per-row grant is
   * what keeps `executeChatAction`'s actionId check meaningful on a mixed card
   * instead of handing one over-broad grant to every row.
   */
  | { ok: true; stored: StoredProposal; grants: ReadonlyMap<string, ExecutionGrant> }
  | { ok: false; errorCode: ActionConfirmErrorCode };

/**
 * Proposals are stored per FAMILY even though ownership is checked per USER.
 * The family is the storage partition every other entity in this app uses, and
 * a per-user file would still need the family to find it. The userId check on
 * consume is what actually enforces ownership, and it is unchanged.
 */
function storageKey(familyId: string): string {
  return `ai_proposals_${familyId}`;
}

export class ProposalStore {
  private readonly mutex = new Mutex();

  constructor(private readonly dataService: DataService) {}

  private async load(familyId: string): Promise<StoredProposal[]> {
    return (await this.dataService.getData<StoredProposal[]>(storageKey(familyId))) ?? [];
  }

  /**
   * Expired entries are dropped on write rather than by a background sweep.
   * The old store swept on a timer; a timer is a thing that can not have run
   * yet, and this deployment has no maintenance window. Pruning on write means
   * the file cannot grow unboundedly, while the TTL check on read means expiry
   * never depends on the prune having happened.
   */
  private prune(proposals: StoredProposal[]): StoredProposal[] {
    const cutoff = Date.now() - TTL_MS;
    return proposals.filter(p => p.createdAt >= cutoff);
  }

  /**
   * Issue a new proposal for the given conversation. Atomically invalidates
   * any prior active proposal for the same conversation (SEC-A007).
   *
   * The whole read-modify-write is inside the mutex: supersession is the
   * security property, and a window between "find the prior nonce" and "write
   * the new one" is a window in which two cards are live at once.
   */
  async issue(args: {
    userId: string;
    familyId: string;
    conversationId: string;
    traceId: string;
    proposalInput: Omit<ActionProposal, 'proposalId' | 'expiresAt'>;
  }): Promise<ActionProposal> {
    return this.mutex.runExclusive(async () => {
      const proposals = this.prune(await this.load(args.familyId));

      for (const prior of proposals) {
        if (prior.conversationId === args.conversationId && !prior.used) {
          prior.used = true;
          prior.result = {
            success: false,
            error: 'Superseded by a newer proposal',
            errorCode: 'nonce_already_used',
          };
        }
      }

      const nonce = randomUUID();
      const proposal: ActionProposal = {
        ...args.proposalInput,
        proposalId: nonce,
        expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
      };

      proposals.push({
        proposal,
        userId: args.userId,
        familyId: args.familyId,
        conversationId: args.conversationId,
        traceId: args.traceId,
        createdAt: Date.now(),
        used: false,
      });

      await this.dataService.saveData(storageKey(args.familyId), proposals);
      return proposal;
    });
  }

  /**
   * Attempt to consume a proposal nonce for confirmation.
   *
   * SECURITY: Returns 'nonce_not_found' for both missing AND cross-user nonces
   * to avoid leaking nonce existence. (SEC-A005, ownership check)
   *
   * Marks the nonce as used on success to prevent replay. (SEC-A005)
   *
   * The mark-as-used is written BEFORE the grants are returned and inside the
   * mutex, so two confirmations racing on one nonce cannot both come back ok.
   * A failure to persist the mark fails the consume: a nonce that could not be
   * burned must not be treated as spent, and an unburned nonce that we reported
   * as consumed is a replay waiting to happen.
   */
  async consume(args: {
    nonce: string;
    userId: string;
    familyId: string;
  }): Promise<ConsumeResult> {
    return this.mutex.runExclusive(async () => {
      const proposals = await this.load(args.familyId);
      const stored = proposals.find(p => p.proposal.proposalId === args.nonce);
      if (!stored) return { ok: false, errorCode: 'nonce_not_found' };

      // Ownership check — cross-user returns same 404 as missing (SEC: no existence leak)
      if (stored.userId !== args.userId) return { ok: false, errorCode: 'nonce_not_found' };

      if (Date.now() - stored.createdAt > TTL_MS) return { ok: false, errorCode: 'nonce_expired' };
      if (stored.used) return { ok: false, errorCode: 'nonce_already_used' };

      stored.used = true;
      try {
        await this.dataService.saveData(storageKey(args.familyId), this.prune(proposals));
      } catch (err) {
        log.error({ err, familyId: args.familyId }, 'failed to burn proposal nonce');
        // Reported as not-found rather than as a server error: the caller must
        // not proceed, and the safe reading of "we could not burn it" is that
        // it is not consumable.
        return { ok: false, errorCode: 'nonce_not_found' };
      }

      const grants = new Map<string, ExecutionGrant>();
      for (const row of stored.proposal.rows) {
        grants.set(
          row.rowId,
          mintConfirmationGrant({
            actionId: row.actionId,
            userId: stored.userId,
            familyId: stored.familyId,
            proposalId: args.nonce,
          }),
        );
      }
      return { ok: true, stored, grants };
    });
  }
}
