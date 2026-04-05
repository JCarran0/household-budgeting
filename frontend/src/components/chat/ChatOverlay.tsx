import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Paper,
  TextInput,
  ActionIcon,
  Group,
  Text,
  Stack,
  ScrollArea,
  SegmentedControl,
  Loader,
  CloseButton,
  Tooltip,
  Box,
} from '@mantine/core';
import { IconSend, IconTrash } from '@tabler/icons-react';
import { api } from '../../lib/api';
import { usePageContext } from '../../hooks/usePageContext';
import { ChatMessageBubble } from './ChatMessageBubble';
import type { ChatMessage, ChatModel, GitHubIssueDraft, ChatResponse } from '../../../../shared/types';

const SESSION_KEY_HISTORY = 'chatbot_history';
const SESSION_KEY_MODEL = 'chatbot_model';

interface PendingIssue {
  messageId: string;
  draft: GitHubIssueDraft;
}

interface ChatOverlayProps {
  opened: boolean;
  onClose: () => void;
}

export function ChatOverlay({ opened, onClose }: ChatOverlayProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY_HISTORY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [model, setModel] = useState<ChatModel>(() => {
    return (sessionStorage.getItem(SESSION_KEY_MODEL) as ChatModel) || 'sonnet';
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [costDisplay, setCostDisplay] = useState<string | null>(null);
  const [costColor, setCostColor] = useState<string>('green');
  const [pendingIssue, setPendingIssue] = useState<PendingIssue | null>(null);
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pageContext = usePageContext();

  // Persist messages and model to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY_HISTORY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY_MODEL, model);
  }, [model]);

  // Fetch cost on open
  useEffect(() => {
    if (opened) {
      api.getChatUsage().then((usage) => {
        updateCostDisplay(usage.monthlySpend, usage.monthlyLimit);
      }).catch(() => { /* ignore */ });
      // Focus input
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [opened]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const updateCostDisplay = (spend: number, limit: number) => {
    setCostDisplay(`~$${spend.toFixed(2)} / $${limit.toFixed(2)}`);
    const pct = spend / limit;
    setCostColor(pct < 0.5 ? 'green' : pct < 0.8 ? 'yellow' : 'red');
  };

  const handleResponse = useCallback((response: ChatResponse) => {
    setMessages((prev) => [...prev, response.message]);
    updateCostDisplay(response.usage.monthlySpend, response.usage.monthlyLimit);

    if (response.type === 'issue_confirmation' && response.issueDraft) {
      setPendingIssue({ messageId: response.message.id, draft: response.issueDraft });
    }

    if (response.usage.capExceeded) {
      setError('Monthly AI budget reached. The chatbot will be available next month.');
    }
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      pageContext,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await api.sendChatMessage({
        message: trimmed,
        conversationHistory: [...messages, userMessage],
        pageContext,
        model,
      });
      handleResponse(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      setError(msg.includes('429') ? 'Slow down! Try again in a minute.' : msg);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, model, pageContext, handleResponse]);

  const handleConfirmIssue = useCallback(async (draft: GitHubIssueDraft) => {
    setIssueSubmitting(true);
    try {
      const result = await api.confirmGitHubIssue(draft);
      setMessages((prev) => [...prev, {
        id: `sys_${Date.now()}`,
        role: 'assistant',
        content: `Issue created! [View on GitHub](${result.issueUrl})`,
        timestamp: new Date().toISOString(),
      }]);
      setPendingIssue(null);
    } catch {
      setError('Failed to create GitHub issue. Try again.');
    } finally {
      setIssueSubmitting(false);
    }
  }, []);

  const handleCancelIssue = useCallback(() => {
    setPendingIssue(null);
    setMessages((prev) => [...prev, {
      id: `sys_${Date.now()}`,
      role: 'user',
      content: 'Never mind, don\'t submit that issue.',
      timestamp: new Date().toISOString(),
    }]);
  }, []);

  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setPendingIssue(null);
    setError(null);
    sessionStorage.removeItem(SESSION_KEY_HISTORY);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  if (!opened) return null;

  return (
    <Paper
      shadow="xl"
      radius="md"
      style={{
        position: 'fixed',
        bottom: 80,
        right: 20,
        width: 400,
        height: 600,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--mantine-color-dark-4)',
      }}
    >
      {/* Header */}
      <Group
        justify="space-between"
        p="xs"
        px="sm"
        style={{
          borderBottom: '1px solid var(--mantine-color-dark-4)',
          flexShrink: 0,
        }}
      >
        <Group gap="xs">
          <Text fw={600} size="sm">Budget Bot</Text>
          {costDisplay && (
            <Text size="xs" c={costColor}>{costDisplay}</Text>
          )}
        </Group>
        <Group gap={4}>
          <Tooltip label="New conversation">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={handleNewConversation}>
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
          <CloseButton size="sm" onClick={onClose} />
        </Group>
      </Group>

      {/* Model selector */}
      <Box px="sm" py={4} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', flexShrink: 0 }}>
        <SegmentedControl
          size="xs"
          fullWidth
          value={model}
          onChange={(v) => setModel(v as ChatModel)}
          data={[
            { label: 'Haiku', value: 'haiku' },
            { label: 'Sonnet', value: 'sonnet' },
            { label: 'Opus', value: 'opus' },
          ]}
        />
      </Box>

      {/* Messages */}
      <ScrollArea
        flex={1}
        p="sm"
        viewportRef={scrollRef}
        style={{ minHeight: 0 }}
      >
        {messages.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" mt="xl">
            Ask me anything about your finances!
          </Text>
        ) : (
          <Stack gap="sm">
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                issueDraft={pendingIssue?.messageId === msg.id ? pendingIssue.draft : undefined}
                onConfirmIssue={handleConfirmIssue}
                onCancelIssue={handleCancelIssue}
                issueSubmitting={issueSubmitting}
              />
            ))}
            {isLoading && (
              <Group gap="xs" pl="xs">
                <Loader size="xs" type="dots" />
                <Text size="xs" c="dimmed">Thinking...</Text>
              </Group>
            )}
          </Stack>
        )}
      </ScrollArea>

      {/* Error display */}
      {error && (
        <Text size="xs" c="red" px="sm" pb={4}>{error}</Text>
      )}

      {/* Input */}
      <Group
        p="sm"
        gap="xs"
        style={{
          borderTop: '1px solid var(--mantine-color-dark-4)',
          flexShrink: 0,
        }}
      >
        <TextInput
          ref={inputRef}
          flex={1}
          size="sm"
          placeholder="Ask about your finances..."
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <ActionIcon
          size="lg"
          variant="filled"
          onClick={sendMessage}
          disabled={!input.trim() || isLoading}
        >
          <IconSend size={16} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}
