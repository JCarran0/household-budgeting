/**
 * Restored-session reconciliation.
 *
 * A refresh mid-conversation used to leave an old card rendered as pending with
 * a live Confirm button, because `activeProposalMessageId` was component state
 * while the messages and nonces were persisted. Clicking it produced "This
 * proposal was already confirmed or superseded" — the same sentence an
 * abandoned server turn produced, from a completely different cause. These
 * tests pin the rules that decide what a restored card is allowed to look like.
 */
import { describe, expect, it } from 'vitest';
import type { ActionProposal, ChatMessage } from '../../../../shared/types';
import { reconcileRestoredProposals } from './chatSessionStorage';

const NOW = Date.parse('2026-09-14T02:00:00Z');

function card(id: string, status: ChatMessage['proposalStatus']): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'Ready for your review.',
    timestamp: new Date(NOW).toISOString(),
    proposalStatus: status,
  } as ChatMessage;
}

function nonce(expiresInMs: number): ActionProposal {
  return {
    proposalId: '00000000-0000-4000-8000-000000000000',
    rows: [],
    reasoning: '',
    expiresAt: new Date(NOW + expiresInMs).toISOString(),
  };
}

describe('reconcileRestoredProposals', () => {
  it('adopts a single live card as the active one', () => {
    const result = reconcileRestoredProposals(
      [card('m1', 'pending')],
      new Map([['m1', nonce(600_000)]]),
      NOW,
    );

    expect(result.active).toBe('m1');
    expect(result.expired.size).toBe(0);
  });

  it('expires a card whose nonce has aged out — the timer did not survive the reload', () => {
    const result = reconcileRestoredProposals(
      [card('m1', 'pending')],
      new Map([['m1', nonce(-1_000)]]),
      NOW,
    );

    expect(result.active).toBeNull();
    expect(result.expired.has('m1')).toBe(true);
  });

  it('expires a card whose nonce was not restored at all', () => {
    // No nonce means Confirm cannot even be attempted. Rendering it as live is
    // exactly the lie this function exists to stop.
    const result = reconcileRestoredProposals([card('m1', 'pending')], new Map(), NOW);

    expect(result.expired.has('m1')).toBe(true);
    expect(result.active).toBeNull();
  });

  it('keeps only the newest live card and supersedes the rest', () => {
    // Server-side, issuing the second one burned the first (SEC-A007). The UI
    // has to say so rather than offering two Confirm buttons.
    const result = reconcileRestoredProposals(
      [card('m1', 'pending'), card('m2', 'pending')],
      new Map([
        ['m1', nonce(600_000)],
        ['m2', nonce(600_000)],
      ]),
      NOW,
    );

    expect(result.active).toBe('m2');
    expect(result.superseded.has('m1')).toBe(true);
  });

  it('ignores cards that are already resolved', () => {
    const result = reconcileRestoredProposals(
      [card('m1', 'confirmed'), card('m2', 'dismissed')],
      new Map([['m1', nonce(600_000)]]),
      NOW,
    );

    expect(result.active).toBeNull();
    expect(result.expired.size).toBe(0);
    expect(result.superseded.size).toBe(0);
  });
});
