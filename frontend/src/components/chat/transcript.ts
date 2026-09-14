/**
 * Serialize a conversation to a Markdown transcript the user can keep.
 *
 * WHY
 * The assistant recorded this as a capability gap against itself on
 * 2026-09-14: "Cannot export/save chat transcript. Jared asked to save/export
 * this conversation transcript to troubleshoot offline." It was right. The
 * conversation lives only in this tab's sessionStorage — the server stores tool
 * calls and token counts (SEC-P040) and deliberately no prose, so a refresh or
 * a closed tab is the end of it. Reporting a bug about the assistant meant
 * screenshotting it.
 *
 * WHAT IS AND IS NOT IN HERE
 * The nonce is not, and cannot be: `ChatMessage.proposal` carries only
 * `rows`/`reasoning`, and the nonce lives in a parallel map that is never part
 * of a message (SEC-A009). Action cards are rendered with their params, because
 * a transcript whose whole point is "what did it propose to do?" that omitted
 * the proposed values would be useless. Attachments appear as metadata only,
 * matching what the trace store keeps (SEC-A014/A016).
 *
 * This is the user's own conversation about their own data, downloaded to their
 * own machine. It is not redacted, and a transcript pasted into a public issue
 * may carry balances and merchant names — hence the filename, which says what
 * this is, and the reminder in the header.
 */
import type { ChatMessage } from '../../../../shared/types';

function stamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Model-authored values render as code so markdown in them cannot restructure the file. */
function fence(value: string): string {
  return value.includes('\n') ? `\n\n\`\`\`\n${value}\n\`\`\`\n` : ` \`${value}\``;
}

function renderProposal(message: ChatMessage): string[] {
  const rows = message.proposal?.rows ?? [];
  if (rows.length === 0) return [];

  const lines = [`**Action card** — ${message.proposalStatus ?? 'pending'}`];
  for (const row of rows) {
    lines.push(`- ${row.label}: ${row.displaySummary}`);
    for (const field of row.displayFields) {
      lines.push(`  - ${field.label}:${fence(field.value)}`);
    }
  }
  if (message.resource) {
    lines.push(`- Result: ${message.resource.label} (${message.resource.url ?? message.resource.id})`);
  }
  return lines;
}

export function buildTranscript(
  messages: ChatMessage[],
  meta: { conversationId: string; exportedAt?: Date } = { conversationId: 'unknown' },
): string {
  const exportedAt = meta.exportedAt ?? new Date();

  const lines = [
    '# Helper Bot conversation',
    '',
    `Exported: ${exportedAt.toLocaleString()}`,
    `Conversation: ${meta.conversationId}`,
    `Messages: ${messages.length}`,
    '',
    '> Contains your own financial data. Check before sharing it anywhere.',
    '',
    '---',
    '',
  ];

  for (const message of messages) {
    const who = message.role === 'user' ? 'You' : 'Helper Bot';
    const model = message.model ? ` · ${message.model}` : '';
    lines.push(`### ${who} — ${stamp(message.timestamp)}${model}`, '');

    if (message.attachment) {
      lines.push(
        `_Attached: ${message.attachment.filename} ` +
          `(${message.attachment.mimeType}, ${message.attachment.sizeBytes} bytes)_`,
        '',
      );
    }

    lines.push(message.content.trim() === '' ? '_(no text)_' : message.content, '');

    const proposal = renderProposal(message);
    if (proposal.length > 0) lines.push(...proposal, '');

    for (const notice of message.learningNotices ?? []) {
      lines.push(`_Noted a capability gap: ${notice.title}_`, '');
    }
  }

  return lines.join('\n');
}

export function transcriptFilename(exportedAt = new Date()): string {
  const iso = exportedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `helper-bot-conversation-${iso}.md`;
}
