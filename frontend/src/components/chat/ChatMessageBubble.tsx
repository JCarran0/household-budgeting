import { Paper, Text, Group, Badge, Button, Stack } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage, GitHubIssueDraft } from '../../../../shared/types';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  issueDraft?: GitHubIssueDraft;
  onConfirmIssue?: (draft: GitHubIssueDraft) => void;
  onCancelIssue?: () => void;
  issueSubmitting?: boolean;
}

export function ChatMessageBubble({
  message,
  issueDraft,
  onConfirmIssue,
  onCancelIssue,
  issueSubmitting,
}: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <Group justify={isUser ? 'flex-end' : 'flex-start'} align="flex-start" w="100%">
      <Paper
        p="sm"
        radius="md"
        maw="85%"
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
    </Group>
  );
}
