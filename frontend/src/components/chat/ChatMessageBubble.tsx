import { Paper, Table, Text, Group, Stack, Anchor } from '@mantine/core';
import { isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Options as SanitizeSchema } from 'rehype-sanitize';
import type {
  ChatMessage,
  ActionProposal,
  ActionResource,
} from '../../../../shared/types';
import { ActionCard } from './ActionCard';
import type { ActionCardStatus } from './ActionCard';

// TD-015: Defense in depth against prompt-injection that smuggles HTML into
// chatbot output (or into a tool-result that the model echoes back). The base
// `defaultSchema` already strips <script>, event handlers, and javascript:
// URLs; we narrow it further to a markdown-only allowlist so even hostile
// HTML inside fenced code never ends up in the DOM as live elements.
// Table tags are included because `remark-gfm` turns pipe-syntax tables into
// real <table> — keeping them out of the allowlist would silently strip
// every table the model emits.
// Map GFM table tags to Mantine Table so they render with the same styling as
// native tables elsewhere in the app. A wide table can exceed the bubble's
// available width, so we wrap in a horizontally-scrollable container instead
// of letting it push past the bubble's rounded corner. Compact spacing +
// sm font match the surrounding message density.
const markdownComponents: Components = {
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '0.5em 0' }}>
      <Table
        striped
        withTableBorder
        withColumnBorders
        verticalSpacing="xs"
        horizontalSpacing="xs"
        fz="sm"
      >
        {children}
      </Table>
    </div>
  ),
  a: ({ href, children }) => {
    // No href survived the sanitizer — render the text, not a dead anchor.
    if (!href) return <>{children}</>;

    const host = hostForDisclosure(href, textOf(children));
    return (
      <>
        <Anchor
          href={href}
          target="_blank"
          // noopener/noreferrer: the destination gets no handle on this window
          // and no Referer header. nofollow because the URL is model-authored.
          rel="noopener noreferrer nofollow"
          underline="always"
        >
          {children}
        </Anchor>
        {host && (
          <Text span size="xs" c="dimmed">
            {' '}({host})
          </Text>
        )}
      </>
    );
  },
  thead: ({ children }) => <Table.Thead>{children}</Table.Thead>,
  tbody: ({ children }) => <Table.Tbody>{children}</Table.Tbody>,
  tr: ({ children }) => <Table.Tr>{children}</Table.Tr>,
  th: ({ children }) => <Table.Th>{children}</Table.Th>,
  td: ({ children }) => <Table.Td>{children}</Table.Td>,
};


/**
 * SEC-P024 (amended) — links are clickable, but never anonymous.
 *
 * The original rule forbade external links outright. That costs the ability to
 * cite a restaurant page or a bank's support URL, which is most of the value of
 * trip and budget conversations, in exchange for closing a vector that already
 * requires a deliberate click. Remote images were the severe case (they fetch on
 * render, with no interaction) and those stay blocked.
 *
 * What made an anchor genuinely dangerous was not the click — it was the
 * masquerade. Injected content could render `[your OpenTable reservation]` over
 * a URL to an attacker's host with your balances in the query string, and the
 * visible text gave the reader nothing to be suspicious of. So the amended rule
 * is: show the host. A link whose destination is disclosed in plain sight is a
 * decision the reader can actually make.
 *
 * The host is appended only when the link text does not already reveal it, so
 * ordinary output ("see https://example.com/x") does not get stuttered.
 */
function hostForDisclosure(href: string, linkText: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null; // Relative or malformed; nothing to disclose.
  }

  if (url.protocol === 'mailto:') {
    const address = href.replace(/^mailto:/i, '');
    return linkText.includes(address) ? null : address;
  }

  // The sanitizer's protocol allowlist is the gate; this is a second read of the
  // same fact, so a schema widened by accident does not silently gain a
  // disclosure-exempt scheme here.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  return linkText.includes(url.hostname) ? null : url.hostname;
}

function textOf(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textOf).join('');
  if (isValidElement(children)) {
    return textOf((children.props as { children?: ReactNode }).children);
  }
  return '';
}

const chatbotMarkdownSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    'p', 'br', 'em', 'strong', 'del', 'code', 'pre',
    'blockquote', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'hr', 'span',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  attributes: {
    a: ['href', 'title'],
    code: ['className'],
    span: ['className'],
    th: ['align'],
    td: ['align'],
  },
  protocols: {
    href: ['http', 'https', 'mailto'],
  },
};

interface ChatMessageBubbleProps {
  message: ChatMessage;
  /** Called when the user clicks Confirm on an action card */
  onConfirmAction?: (
    messageId: string,
    rows: Array<{ rowId: string; params: Record<string, unknown> }>,
  ) => Promise<void>;
  /** Called when the user dismisses an action card */
  onDismissAction?: (messageId: string) => void;
  /** Error message to display on a failed action card */
  actionErrorMessage?: string;
}

export function ChatMessageBubble({
  message,
  onConfirmAction,
  onDismissAction,
  actionErrorMessage,
}: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  // Render the ActionCard inline below the assistant's message content when
  // a proposal is present. The card is rendered outside the bubble Paper so
  // it can span the full available width without being clipped by maw="85%".
  const hasProposal =
    !isUser &&
    message.proposal !== undefined &&
    message.proposalStatus !== undefined;

  return (
    <Group justify={isUser ? 'flex-end' : 'flex-start'} align="flex-start" w="100%">
      <Stack gap={4} style={{ maxWidth: '85%', minWidth: 0 }} w={isUser ? undefined : '85%'}>
        <Paper
          p="sm"
          radius="md"
          style={{
            backgroundColor: isUser
              ? 'var(--mantine-color-blue-light)'
              : 'var(--mantine-color-dark-6)',
          }}
        >
          {isUser ? (
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{message.content}</Text>
          ) : (
            <div style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeSanitize, chatbotMarkdownSchema]]}
                components={markdownComponents}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </Paper>

        {/* REQ-L002: the assistant recorded a capability gap this turn. Shown so
            an autonomous write is never invisible, and because "I couldn't reach
            your tasks" is useful to the user on its own.

            SEC-L002: `title` is model-authored and therefore untrusted. It is
            rendered inside <Text> as a plain string — never through the markdown
            renderer, never as markup. */}
        {!isUser && message.learningNotices?.map((notice, i) => (
          <Text key={`${notice.capabilityKey}-${i}`} size="xs" c="dimmed" fs="italic" pl="xs">
            Noted for the developer: {notice.title}
          </Text>
        ))}

        {/* Action card rendered below the bubble when a proposal is present */}
        {hasProposal && message.proposal && (
          <ActionCard
            proposal={message.proposal as ActionProposal}
            status={
              // Derive 'failed' display state when the card is pending but
              // has an error from a prior confirm attempt (see ChatOverlay).
              message.proposalStatus === 'pending' && actionErrorMessage
                ? 'failed'
                : ((message.proposalStatus ?? 'pending') as ActionCardStatus)
            }
            resource={message.resource as ActionResource | undefined}
            results={message.actionResults}
            errorMessage={actionErrorMessage}
            onConfirm={(rows) =>
              onConfirmAction
                ? onConfirmAction(message.id, rows)
                : Promise.resolve()
            }
            onDismiss={() => onDismissAction?.(message.id)}
          />
        )}
      </Stack>
    </Group>
  );
}
