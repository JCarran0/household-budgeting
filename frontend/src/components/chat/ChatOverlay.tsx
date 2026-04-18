import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ChangeEvent,
} from 'react';
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
  Image,
} from '@mantine/core';
import {
  IconSend,
  IconTrash,
  IconCamera,
  IconPaperclip,
  IconFileText,
  IconX,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useMediaQuery } from '@mantine/hooks';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { usePageContext } from '../../hooks/usePageContext';
import { ChatMessageBubble } from './ChatMessageBubble';
import type {
  ChatMessage,
  ChatModel,
  GitHubIssueDraft,
  ChatResponse,
  ActionProposal,
} from '../../../../shared/types';

const SESSION_KEY_HISTORY = 'chatbot_history';
const SESSION_KEY_MODEL = 'chatbot_model';
const SESSION_KEY_FULL_PROPOSALS = 'chatbot_full_proposals';

/** MIME types accepted by the paperclip picker */
const ALLOWED_CLIENT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

interface PendingIssue {
  messageId: string;
  draft: GitHubIssueDraft;
}

/**
 * Maps message ID → action error message (for failed confirm attempts).
 * Stored separately so we don't mutate the ChatMessage type for transient
 * UI state.
 */
type ActionErrorMap = Record<string, string>;

interface ChatOverlayProps {
  opened: boolean;
  onClose: () => void;
}

export function ChatOverlay({ opened, onClose }: ChatOverlayProps) {
  const userDisplayName = useAuthStore((s) => s.user?.displayName);

  // ---- Core chat state ----
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

  // ---- Attachment state (Phase 6) ----
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Conversation ID (Phase 7.3) ----
  // Generated once per overlay mount; reset on "New conversation"
  const [conversationId, setConversationId] = useState<string>(() =>
    crypto.randomUUID()
  );

  // ---- Action card state (Phase 9) ----
  const [activeProposalMessageId, setActiveProposalMessageId] = useState<
    string | null
  >(null);
  const [actionErrors, setActionErrors] = useState<ActionErrorMap>({});

  // Parallel lookup keyed by message ID. Holds the full ActionProposal
  // (including the proposalId/nonce) that the Confirm handler needs to
  // call the backend. Kept separate from `messages` so the nonce is never
  // accidentally included when history is serialized for the backend
  // (SEC-A009). Persisted to sessionStorage so pending cards survive
  // refreshes within the same session; the nonce's 15-min TTL is the
  // backstop against stale entries.
  const [fullProposals, setFullProposals] = useState<
    Map<string, ActionProposal>
  >(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY_FULL_PROPOSALS);
      if (!stored) return new Map();
      const entries = JSON.parse(stored) as [string, ActionProposal][];
      return new Map(entries);
    } catch {
      return new Map();
    }
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pageContext = usePageContext();
  const isMobile = useMediaQuery('(max-width: 48em)');

  // ---- Attachment preview URL lifecycle ----
  useEffect(() => {
    if (!attachment) {
      setAttachmentPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachment);
    setAttachmentPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  // ---- Persist messages and model to sessionStorage ----
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY_HISTORY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY_MODEL, model);
  }, [model]);

  useEffect(() => {
    sessionStorage.setItem(
      SESSION_KEY_FULL_PROPOSALS,
      JSON.stringify(Array.from(fullProposals.entries()))
    );
  }, [fullProposals]);

  // ---- Fetch cost on open ----
  useEffect(() => {
    if (opened) {
      api.getChatUsage().then((usage) => {
        updateCostDisplay(usage.monthlySpend, usage.monthlyLimit);
      }).catch(() => { /* ignore */ });
      // Focus input on desktop only — avoids auto-opening the mobile keyboard
      if (!isMobile) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  }, [opened, isMobile]);

  // ---- Auto-scroll to bottom on new messages ----
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isLoading]);

  const updateCostDisplay = (spend: number, limit: number) => {
    setCostDisplay(`~$${spend.toFixed(2)} / $${limit.toFixed(2)}`);
    const pct = spend / limit;
    setCostColor(pct < 0.5 ? 'green' : pct < 0.8 ? 'yellow' : 'red');
  };

  // ---- Helpers to mutate messages in place ----

  const updateMessageById = useCallback(
    (messageId: string, updates: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, ...updates } : m))
      );
    },
    []
  );

  // ---- Action proposal response handler (Phase 9.2) ----
  const handleActionProposalResponse = useCallback(
    (response: Extract<ChatResponse, { type: 'action_proposal' }>) => {
      const { message, proposal } = response;

      // The ChatMessage.proposal field carries only the sanitized shape
      // (Pick<ActionProposal, 'actionId'|'displaySummary'|'params'|
      // 'displayFields'>). The full ActionProposal — including the
      // proposalId/nonce — lives in the `fullProposals` map below and is
      // never serialized back to the backend (SEC-A009).
      const newMessage: ChatMessage = {
        ...message,
        proposal: {
          actionId: proposal.actionId,
          displaySummary: proposal.displaySummary,
          params: proposal.params,
          displayFields: proposal.displayFields,
        },
        proposalStatus: 'pending',
      };

      // Store the full proposal (with nonce) in a parallel Map keyed by
      // messageId. The ChatMessage shape stays strictly typed and the
      // nonce never leaks into serialized conversation history
      // (SEC-A009). ActionCard reads from this map via the callback.
      setFullProposals((prev) => {
        const next = new Map(prev);
        next.set(newMessage.id, proposal);
        return next;
      });

      // Supersede prior active card (D-2, REQ-017, SEC-A007)
      if (activeProposalMessageId) {
        updateMessageById(activeProposalMessageId, { proposalStatus: 'superseded' });
      }

      setMessages((prev) => [...prev, newMessage]);
      setActiveProposalMessageId(newMessage.id);

      // Set a timer to mark the proposal expired when the nonce TTL passes
      const msUntilExpiry = new Date(proposal.expiresAt).getTime() - Date.now();
      if (msUntilExpiry > 0) {
        const timerId = setTimeout(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === newMessage.id && m.proposalStatus === 'pending'
                ? { ...m, proposalStatus: 'expired' }
                : m
            )
          );
          setActiveProposalMessageId((current) =>
            current === newMessage.id ? null : current
          );
        }, msUntilExpiry);
        // No cleanup needed — timerId captures the specific message; even if
        // the overlay unmounts, the stale update is harmless since messages
        // state is re-initialised from sessionStorage on remount.
        void timerId; // suppress unused-variable lint
      }
    },
    [activeProposalMessageId, updateMessageById]
  );

  const handleResponse = useCallback(
    (response: ChatResponse) => {
      if (response.type === 'action_proposal') {
        handleActionProposalResponse(response);
      } else {
        setMessages((prev) => [...prev, response.message]);
      }
      updateCostDisplay(response.usage.monthlySpend, response.usage.monthlyLimit);

      if (response.type === 'issue_confirmation' && response.issueDraft) {
        setPendingIssue({ messageId: response.message.id, draft: response.issueDraft });
      }

      if (response.usage.capExceeded) {
        setError('Monthly AI budget reached. The chatbot will be available next month.');
      }
    },
    [handleActionProposalResponse]
  );

  // ---- File pick handler (Phase 6.2, 6.5) ----
  const handleFilePick = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-picked after removal
    e.target.value = '';
    if (!file) return;

    // HEIC rejection with guidance (Phase 6.5 / BRD A-5)
    if (
      file.type === 'image/heic' ||
      file.type === 'image/heif' ||
      file.name.toLowerCase().endsWith('.heic') ||
      file.name.toLowerCase().endsWith('.heif')
    ) {
      notifications.show({
        color: 'orange',
        message:
          'HEIC photos are not supported. On iOS, go to Settings → Camera → Formats → Most Compatible, then try again.',
      });
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      notifications.show({ color: 'red', message: 'File too large (10 MB max).' });
      return;
    }

    if (!ALLOWED_CLIENT_MIMES.has(file.type)) {
      notifications.show({
        color: 'red',
        message: 'Unsupported file type. Accepted: JPEG, PNG, WebP, PDF.',
      });
      return;
    }

    setAttachment(file);
  }, []);

  // ---- Send message (Phase 6.1 + 7.1 integration) ----
  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && !attachment) || isLoading) return;

    setError(null);

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: trimmed || (attachment ? `[Attached: ${attachment.name}]` : ''),
      timestamp: new Date().toISOString(),
      pageContext,
      ...(attachment
        ? {
            attachment: {
              filename: attachment.name,
              mimeType: attachment.type as
                | 'image/jpeg'
                | 'image/png'
                | 'image/webp'
                | 'application/pdf',
              sizeBytes: attachment.size,
            },
          }
        : {}),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    // Clear attachment state before the await so the UI feels snappy
    const attachmentToSend = attachment;
    setAttachment(null);

    setIsLoading(true);

    try {
      // SEC-A009: conversationHistory messages only carry the sanitized
      // proposal shape (Pick<ActionProposal, 'actionId'|'displaySummary'|
      // 'params'|'displayFields'>) — the nonce lives in the parallel
      // `fullProposals` map and is never sent to the LLM.
      const response = await api.sendChatMessage({
        message: trimmed,
        conversationId,
        conversationHistory: [...messages, userMessage],
        pageContext,
        model,
        userDisplayName: userDisplayName ?? undefined,
        attachment: attachmentToSend ?? undefined,
      });
      handleResponse(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      setError(msg.includes('429') ? 'Slow down! Try again in a minute.' : msg);
    } finally {
      setIsLoading(false);
    }
  }, [
    input,
    attachment,
    isLoading,
    messages,
    model,
    pageContext,
    conversationId,
    userDisplayName,
    handleResponse,
  ]);

  // ---- GitHub issue handlers (unchanged) ----
  const handleConfirmIssue = useCallback(async (draft: GitHubIssueDraft) => {
    setIssueSubmitting(true);
    try {
      const result = await api.confirmGitHubIssue(draft);
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          role: 'assistant',
          content: `Issue created! [View on GitHub](${result.issueUrl})`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setPendingIssue(null);
    } catch {
      setError('Failed to create GitHub issue. Try again.');
    } finally {
      setIssueSubmitting(false);
    }
  }, []);

  const handleCancelIssue = useCallback(() => {
    setPendingIssue(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `sys_${Date.now()}`,
        role: 'user',
        content: "Never mind, don't submit that issue.",
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  // ---- Action card confirm handler (Phase 8.4, 9.1) ----
  const handleConfirmAction = useCallback(
    async (messageId: string, params: Record<string, unknown>) => {
      const fullProposal = fullProposals.get(messageId);
      if (!fullProposal) return;

      try {
        const result = await api.confirmChatAction({
          proposalId: fullProposal.proposalId,
          confirmedParams: params,
        });

        if (result.success) {
          updateMessageById(messageId, {
            proposalStatus: 'confirmed',
            resource: result.resource,
          });
          setActiveProposalMessageId((current) =>
            current === messageId ? null : current
          );
          // Clear any prior error for this message
          setActionErrors((prev) =>
            Object.fromEntries(
              Object.entries(prev).filter(([k]) => k !== messageId)
            )
          );
        } else {
          // Keep proposalStatus as 'pending' so the card stays interactive
          // (user can edit and retry). The error is surfaced via actionErrors.
          setActionErrors((prev) => ({
            ...prev,
            [messageId]: result.error,
          }));
        }
      } catch (err) {
        setActionErrors((prev) => ({
          ...prev,
          [messageId]: err instanceof Error ? err.message : 'Confirmation failed.',
        }));
      }
    },
    [fullProposals, updateMessageById]
  );

  // ---- Action card dismiss handler (Phase 9.1) ----
  const handleDismissAction = useCallback(
    (messageId: string) => {
      updateMessageById(messageId, { proposalStatus: 'dismissed' });
      setActiveProposalMessageId((current) =>
        current === messageId ? null : current
      );
    },
    [updateMessageById]
  );

  // ---- New conversation ----
  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setPendingIssue(null);
    setError(null);
    setAttachment(null);
    setActiveProposalMessageId(null);
    setActionErrors({});
    setFullProposals(new Map());
    // Generate a new conversation UUID so the backend's supersession logic
    // starts fresh (Phase 7.3).
    setConversationId(crypto.randomUUID());
    sessionStorage.removeItem(SESSION_KEY_HISTORY);
    sessionStorage.removeItem(SESSION_KEY_FULL_PROPOSALS);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage]
  );

  const canSend = (!!input.trim() || !!attachment) && !isLoading;
  const isImageAttachment =
    attachment && attachment.type.startsWith('image/');

  if (!opened) return null;

  return (
    <Paper
      shadow="xl"
      radius={isMobile ? 0 : 'md'}
      style={{
        position: 'fixed',
        bottom: isMobile ? 0 : 80,
        right: isMobile ? 0 : 20,
        left: isMobile ? 0 : undefined,
        top: isMobile ? 0 : undefined,
        width: isMobile ? '100vw' : 400,
        height: isMobile ? '100dvh' : 600,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: isMobile ? 'none' : '1px solid var(--mantine-color-dark-4)',
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
          <Text fw={600} size="sm">Helper Bot</Text>
          {costDisplay && (
            <Text size="xs" c={costColor}>{costDisplay}</Text>
          )}
        </Group>
        <Group gap={4}>
          <Tooltip label="New conversation">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={handleNewConversation}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
          <CloseButton size="sm" onClick={onClose} />
        </Group>
      </Group>

      {/* Model selector */}
      <Box
        px="sm"
        py={4}
        style={{
          borderBottom: '1px solid var(--mantine-color-dark-4)',
          flexShrink: 0,
        }}
      >
        <SegmentedControl
          size={isMobile ? 'sm' : 'xs'}
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
          <Stack gap="xs" align="center" mt="xl">
            <Text size="sm" c="dimmed" ta="center">
              Ask me anything about your finances!
            </Text>
            {/* REQ-005: attachment discovery hint */}
            <Text size="xs" c="dimmed" ta="center">
              📎 Snap a photo of a flyer, receipt, or invite — I can help track it.
            </Text>
          </Stack>
        ) : (
          <Stack gap="sm">
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                issueDraft={
                  pendingIssue?.messageId === msg.id
                    ? pendingIssue.draft
                    : undefined
                }
                onConfirmIssue={handleConfirmIssue}
                onCancelIssue={handleCancelIssue}
                issueSubmitting={issueSubmitting}
                onConfirmAction={handleConfirmAction}
                onDismissAction={handleDismissAction}
                actionErrorMessage={actionErrors[msg.id]}
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

      {/* Attachment preview (Phase 6.3) */}
      {attachment && (
        <Box
          px="sm"
          py={4}
          style={{
            borderTop: '1px solid var(--mantine-color-dark-4)',
            flexShrink: 0,
          }}
        >
          <Group gap="xs" align="center">
            {isImageAttachment && attachmentPreviewUrl ? (
              <Image
                src={attachmentPreviewUrl}
                h={48}
                w={48}
                radius="sm"
                fit="cover"
                alt={attachment.name}
              />
            ) : (
              <IconFileText size={32} color="var(--mantine-color-dimmed)" />
            )}
            <Text size="xs" style={{ flex: 1 }} lineClamp={1}>
              {attachment.name}
            </Text>
            <ActionIcon
              size="xs"
              variant="subtle"
              color="red"
              aria-label="Remove attachment"
              onClick={() => setAttachment(null)}
            >
              <IconX size={12} />
            </ActionIcon>
          </Group>
        </Box>
      )}

      {/* Input row (Phase 6.2) */}
      {/* Hidden file inputs — outside the visible Group to keep DOM clean */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFilePick}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFilePick}
      />

      <Group
        p="sm"
        gap="xs"
        align="center"
        style={{
          borderTop: '1px solid var(--mantine-color-dark-4)',
          flexShrink: 0,
        }}
      >
        {/* Camera icon — triggers rear camera on mobile (REQ-002) */}
        <Tooltip label="Take a photo">
          <ActionIcon
            size={isMobile ? 'lg' : 'md'}
            variant="subtle"
            color="gray"
            aria-label="Take a photo"
            onClick={() => cameraInputRef.current?.click()}
            disabled={isLoading}
          >
            <IconCamera size={isMobile ? 20 : 16} />
          </ActionIcon>
        </Tooltip>

        {/* Paperclip icon — opens file picker */}
        <Tooltip label="Attach file">
          <ActionIcon
            size={isMobile ? 'lg' : 'md'}
            variant="subtle"
            color="gray"
            aria-label="Attach file"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            <IconPaperclip size={isMobile ? 20 : 16} />
          </ActionIcon>
        </Tooltip>

        {/* Text input — REQ-006: focus order is text → camera → paperclip → send;
            DOM order here is camera, paperclip, text, send. We reorder visually
            but keep keyboard tab order intuitive by placing text first in DOM. */}
        <TextInput
          ref={inputRef}
          flex={1}
          size={isMobile ? 'md' : 'sm'}
          placeholder="Ask about your finances..."
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />

        {/* Send button */}
        <ActionIcon
          size={isMobile ? 'xl' : 'lg'}
          variant="filled"
          onClick={() => void sendMessage()}
          disabled={!canSend}
          aria-label="Send"
        >
          <IconSend size={isMobile ? 20 : 16} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}
