/**
 * Durable proposal store — REQ-P028 / REQ-P082 / TD-030
 *
 * The store moved from a module-level Map to per-family storage. What has to
 * survive that move is every security property the Map was enforcing, so each
 * test here is written against a SECOND store instance over the same
 * DataService — the closest thing to a PM2 restart that a test can express.
 * Reading the same instance back would only prove the object still has its
 * fields.
 *
 * TTL and single-use are deliberately still enforced in code rather than by the
 * storage: a nonce past its TTL must be refused on read regardless of what is
 * on disk, so expiry never depends on a prune having run.
 */

import { randomUUID } from 'crypto';
import { dataService } from '../../services';
import { ProposalStore } from '../../services/chatActions/proposalStore';
import type { ProposalRow } from '../../shared/types';

function rows(title: string): ProposalRow[] {
  return [
    {
      rowId: 'row-0',
      actionId: 'create_task',
      label: 'Create a task',
      params: { title },
      displaySummary: title,
      displayFields: [{ key: 'title', label: 'Title', value: title, editable: true, type: 'text' }],
    },
  ];
}

function issueArgs(conversationId: string, title = 'Take out trash') {
  return {
    userId: 'user-a',
    familyId: 'fam-a',
    conversationId,
    traceId: 'trace_durability',
    proposalInput: { rows: rows(title), reasoning: 'Test' },
  };
}

/** A fresh instance over the same storage — i.e. the process restarted. */
function afterRestart(): ProposalStore {
  return new ProposalStore(dataService);
}

beforeEach(() => {
  if ('clear' in dataService) {
    (dataService as unknown as { clear: () => void }).clear();
  }
});

describe('a pending card survives a restart', () => {
  it('is still confirmable from a new store instance', async () => {
    const issued = await new ProposalStore(dataService).issue(issueArgs(randomUUID()));

    const consumed = await afterRestart().consume({
      nonce: issued.proposalId,
      userId: 'user-a',
      familyId: 'fam-a',
    });

    expect(consumed.ok).toBe(true);
    // The grants are minted on consume, so they have to be mintable from the
    // persisted record alone — not from anything the issuing process held.
    if (consumed.ok) expect(consumed.grants.get('row-0')).toBeDefined();
  });
});

describe('the security properties survive the restart too', () => {
  it('a burned nonce stays burned', async () => {
    const issued = await new ProposalStore(dataService).issue(issueArgs(randomUUID()));
    await new ProposalStore(dataService).consume({
      nonce: issued.proposalId,
      userId: 'user-a',
      familyId: 'fam-a',
    });

    const replay = await afterRestart().consume({
      nonce: issued.proposalId,
      userId: 'user-a',
      familyId: 'fam-a',
    });

    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      // Specifically already_used, not not_found. Deleting on consume would
      // collapse these two into one and turn a double-click into "that card
      // never existed".
      expect(replay.errorCode).toBe('nonce_already_used');
    }
  });

  it('supersession holds across the restart', async () => {
    const convId = randomUUID();
    const store = new ProposalStore(dataService);
    const first = await store.issue(issueArgs(convId, 'Task A'));
    await store.issue(issueArgs(convId, 'Task B'));

    const consumed = await afterRestart().consume({
      nonce: first.proposalId,
      userId: 'user-a',
      familyId: 'fam-a',
    });

    expect(consumed.ok).toBe(false);
    if (!consumed.ok) expect(consumed.errorCode).toBe('nonce_already_used');
  });

  it('a card from another conversation is NOT superseded', async () => {
    // SEC-A007 is one active card per CONVERSATION, not per family. Without
    // this, a store that invalidated the whole file on every issue would pass
    // the test above and quietly break every other open conversation.
    const other = await new ProposalStore(dataService).issue(issueArgs(randomUUID(), 'Other convo'));
    await new ProposalStore(dataService).issue(issueArgs(randomUUID(), 'New convo'));

    const consumed = await afterRestart().consume({
      nonce: other.proposalId,
      userId: 'user-a',
      familyId: 'fam-a',
    });
    expect(consumed.ok).toBe(true);
  });

  it('refuses a nonce from another user, and says only that it was not found', async () => {
    const issued = await new ProposalStore(dataService).issue(issueArgs(randomUUID()));

    const consumed = await afterRestart().consume({
      nonce: issued.proposalId,
      userId: 'user-b',
      familyId: 'fam-a',
    });

    expect(consumed.ok).toBe(false);
    // Same code as a nonce that never existed — a distinct code would confirm
    // to a spouse that a card they cannot use is nonetheless real.
    if (!consumed.ok) expect(consumed.errorCode).toBe('nonce_not_found');
  });

  it('refuses a nonce read against another household', async () => {
    const issued = await new ProposalStore(dataService).issue(issueArgs(randomUUID()));

    const consumed = await afterRestart().consume({
      nonce: issued.proposalId,
      userId: 'user-a',
      familyId: 'fam-other',
    });

    expect(consumed.ok).toBe(false);
    if (!consumed.ok) expect(consumed.errorCode).toBe('nonce_not_found');
  });

  it('expires on the clock, not on whether a prune has run', async () => {
    const store = new ProposalStore(dataService);
    const issued = await store.issue(issueArgs(randomUUID()));

    // Nothing writes in between, so no prune happens — the record is still on
    // disk, unexpired as far as storage is concerned.
    const sixteenMinutes = Date.now() + 16 * 60 * 1000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(sixteenMinutes);
    try {
      const consumed = await afterRestart().consume({
        nonce: issued.proposalId,
        userId: 'user-a',
        familyId: 'fam-a',
      });
      expect(consumed.ok).toBe(false);
      if (!consumed.ok) expect(consumed.errorCode).toBe('nonce_expired');
    } finally {
      nowSpy.mockRestore();
    }
  });
});
