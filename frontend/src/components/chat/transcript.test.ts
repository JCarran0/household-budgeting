/**
 * Transcript export — the capability gap the assistant filed against itself.
 *
 * The conversation lives only in this tab, so this file is the only copy a user
 * can keep. Two things have to hold: it must contain the action cards (a
 * transcript that omits what the assistant proposed to do is useless for the
 * bug reports it exists to support), and it must not contain the nonce.
 */
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../../../shared/types';
import { buildTranscript, transcriptFilename } from './transcript';

const NONCE = '11111111-2222-4333-8444-555555555555';

function conversation(): ChatMessage[] {
  return [
    {
      id: 'u1',
      role: 'user',
      content: 'why do my Amazon charges look like asterisks?',
      timestamp: '2026-09-14T02:05:00.000Z',
    },
    {
      id: 'a1',
      role: 'assistant',
      content: "That's a real bug — the sync pipeline is not preserving the merchant name.",
      timestamp: '2026-09-14T02:11:38.000Z',
      model: 'sonnet',
      proposal: {
        reasoning: 'The user reported a bug.',
        rows: [
          {
            rowId: 'row-0',
            actionId: 'submit_github_issue',
            label: 'Report an issue',
            params: { title: 'Merchant name corrupted', body: 'Steps:\n1. Sync\n2. Look', labels: ['bug'] },
            displaySummary: 'File a bug report',
            displayFields: [
              { key: 'title', label: 'Title', value: 'Merchant name corrupted', editable: true, type: 'text' },
              { key: 'body', label: 'Details', value: 'Steps:\n1. Sync\n2. Look', editable: true, type: 'textarea' },
              { key: 'labels', label: 'Labels', value: 'bug', editable: true, type: 'tags' },
            ],
          },
        ],
      },
      proposalStatus: 'confirmed',
    } as ChatMessage,
  ];
}

describe('buildTranscript', () => {
  it('includes both sides of the conversation', () => {
    const md = buildTranscript(conversation(), { conversationId: 'conv-1' });

    expect(md).toContain('why do my Amazon charges look like asterisks?');
    expect(md).toContain('the sync pipeline is not preserving the merchant name');
    expect(md).toContain('conv-1');
  });

  it('records what the action card proposed, including the values', () => {
    const md = buildTranscript(conversation(), { conversationId: 'conv-1' });

    expect(md).toContain('Report an issue');
    expect(md).toContain('Merchant name corrupted');
    // The body is the thing a bug report needs and the thing a summary drops.
    expect(md).toContain('1. Sync');
    expect(md).toContain('confirmed');
  });

  it('cannot leak the nonce, because a message never carries one (SEC-A009)', () => {
    const messages = conversation();
    // Simulate a caller that wrongly stuffed a nonce into the message object.
    (messages[1] as unknown as Record<string, unknown>).proposalId = NONCE;

    expect(buildTranscript(messages, { conversationId: 'conv-1' })).not.toContain(NONCE);
  });

  it('notes an attachment as metadata, never as content', () => {
    const messages = conversation();
    messages[0].attachment = {
      filename: 'receipt.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
    };

    const md = buildTranscript(messages, { conversationId: 'conv-1' });
    expect(md).toContain('receipt.pdf');
    expect(md).toContain('1024 bytes');
  });

  it('survives an empty conversation', () => {
    expect(buildTranscript([], { conversationId: 'conv-1' })).toContain('Messages: 0');
  });

  it('names the file so it is identifiable months later', () => {
    const name = transcriptFilename(new Date('2026-09-14T02:30:00.000Z'));
    expect(name).toBe('helper-bot-conversation-2026-09-14T02-30-00.md');
  });
});
