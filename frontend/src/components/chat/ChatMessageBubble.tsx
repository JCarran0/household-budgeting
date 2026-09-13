import { Paper, Table, Text, Group, Stack } from '@mantine/core';
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
  thead: ({ children }) => <Table.Thead>{children}</Table.Thead>,
  tbody: ({ children }) => <Table.Tbody>{children}</Table.Tbody>,
  tr: ({ children }) => <Table.Tr>{children}</Table.Tr>,
  th: ({ children }) => <Table.Th>{children}</Table.Th>,
  td: ({ children }) => <Table.Td>{children}</Table.Td>,
};

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
        {!isUser && message.learningNotice && (
          <Text size="xs" c="dimmed" fs="italic" pl="xs">
            Noted for the developer: {message.learningNotice.title}
          </Text>
        )}

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
