import { Paper, Text, Group, Badge, Button, Stack } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import type {
  ChatMessage,
  GitHubIssueDraft,
  ActionProposal,
  ActionResource,
} from '../../../../shared/types';
import { ActionCard } from './ActionCard';
import type { ActionCardStatus } from './ActionCard';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  issueDraft?: GitHubIssueDraft;
  onConfirmIssue?: (draft: GitHubIssueDraft) => void;
  onCancelIssue?: () => void;
  issueSubmitting?: boolean;
  /** Called when the user clicks Confirm on an action card */
  onConfirmAction?: (messageId: string, params: Record<string, unknown>) => Promise<void>;
  /** Called when the user dismisses an action card */
  onDismissAction?: (messageId: string) => void;
  /** Error message to display on a failed action card */
  actionErrorMessage?: string;
}

export function ChatMessageBubble({
  message,
  issueDraft,
  onConfirmIssue,
  onCancelIssue,
  issueSubmitting,
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

          {issueDraft && (
            <Paper p="sm" mt="sm" radius="sm" withBorder>
              <Stack gap="xs">
                <Text size="sm" fw={600}>{issueDraft.title}</Text>
                <div style={{ fontSize: 'var(--mantine-font-size-xs)' }}>
                  <ReactMarkdown>{issueDraft.body}</ReactMarkdown>
                </div>
                <Group gap="xs">
                  {issueDraft.labels.map((label) => (
                    <Badge key={label} size="xs" variant="light" color={label === 'bug' ? 'red' : 'blue'}>
                      {label}
                    </Badge>
                  ))}
                </Group>
                <Group gap="xs" mt="xs">
                  <Button
                    size="xs"
                    leftSection={<IconCheck size={14} />}
                    onClick={() => onConfirmIssue?.(issueDraft)}
                    loading={issueSubmitting}
                  >
                    Submit Issue
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    leftSection={<IconX size={14} />}
                    onClick={onCancelIssue}
                    disabled={issueSubmitting}
                  >
                    Cancel
                  </Button>
                </Group>
              </Stack>
            </Paper>
          )}
        </Paper>

        {/* Action card rendered below the bubble when a proposal is present (Phase 8.4) */}
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
