import { Paper, Text, Group, Stack } from '@mantine/core';
import ReactMarkdown from 'react-markdown';
import type {
  ChatMessage,
  ActionProposal,
  ActionResource,
} from '../../../../shared/types';
import { ActionCard } from './ActionCard';
import type { ActionCardStatus } from './ActionCard';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  /** Called when the user clicks Confirm on an action card */
  onConfirmAction?: (messageId: string, params: Record<string, unknown>) => Promise<void>;
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
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </Paper>

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
            errorMessage={actionErrorMessage}
            onConfirm={(params) =>
              onConfirmAction
                ? onConfirmAction(message.id, params)
                : Promise.resolve()
            }
            onDismiss={() => onDismissAction?.(message.id)}
          />
        )}
      </Stack>
    </Group>
  );
}
