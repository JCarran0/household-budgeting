import {
  useState,
  useEffect,
  useRef,
  useCallback,
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
  IconDownload,
  IconCamera,
  IconPaperclip,
  IconFileText,
  IconX,
  IconMaximize,
  IconMinimize,
} from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { usePageContext } from '../../hooks/usePageContext';
import { ChatMessageBubble } from './ChatMessageBubble';
import { useChatPanelLayout } from './useChatPanelLayout';
import { buildTranscript, transcriptFilename } from './transcript';
import { useChatAttachment } from './useChatAttachment';
import {
  SESSION_KEY_CONVERSATION,
  SESSION_KEY_FULL_PROPOSALS,
  SESSION_KEY_HISTORY,
  SESSION_KEY_MODEL,
  clearChatSession,
  persist,
  readStoredConversationId,
  readStoredMessages,
  readStoredModel,
  readStoredProposals,
  reconcileRestoredProposals,
} from './chatSessionStorage';
import type {
  ChatMessage,
  ChatModel,
  ChatResponse,
  ActionProposal,
} from '../../../../shared/types';

// What survives a refresh — and the rules for re-adopting it — live in
// chatSessionStorage.ts, next to the reasons they are what they are.

/**
 * Maps message ID → action error message (for failed confirm attempts).
 * Stored separately so we don't mutate the ChatMessage type for transient
 * UI state.
 */
type ActionErrorMap = Record<string, string>;

interface ChatOverlayProps {
  opened: boolean;
  onClose: () => void;
  /**
   * File piped in from outside the overlay (e.g. Android Web Share Target).
   * Validated against the same MIME/size rules as the paperclip picker;
   * consumed once per File instance.
   */
  initialAttachment?: File | null;
  onInitialAttachmentConsumed?: () => void;
}

export function ChatOverlay({
  opened,
  onClose,
  initialAttachment,
  onInitialAttachmentConsumed,
}: ChatOverlayProps) {
  const userDisplayName = useAuthStore((s) => s.user?.displayName);

  // ---- Core chat state ----
  const [messages, setMessages] = useState<ChatMessage[]>(readStoredMessages);
  const [model, setModel] = useState<ChatModel>(readStoredModel);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [costDisplay, setCostDisplay] = useState<string | null>(null);
  const [costColor, setCostColor] = useState<string>('green');
  const [error, setError] = useState<string | null>(null);

  // ---- Attachment state (Phase 6) ----
  // Pick, validate, preview and clear all live in the hook — one copy of the
  // rules for the paperclip and the share target alike.
  const { attachment, setAttachment, previewUrl: attachmentPreviewUrl, handleFilePick } =
    useChatAttachment({ initialAttachment, onInitialAttachmentConsumed });
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Conversation ID (Phase 7.3) ----
  // Persisted, not regenerated per mount. The transcript and its pending cards
  // survive a refresh, and the conversation they belong to has to survive with
  // them: server-side supersession (SEC-A007) is scoped BY conversation, so a
  // fresh id after a refresh would leave the restored card live in a
  // conversation nothing can ever supersede while a new card opened in another.
  const [conversationId, setConversationId] = useState<string>(readStoredConversationId);

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
  const [fullProposals, setFullProposals] = useState<Map<string, ActionProposal>>(
    readStoredProposals,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pageContext = usePageContext();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { expanded, canExpand, toggle: toggleExpanded, collapse, panelStyle, contentStyle } =
    useChatPanelLayout(Boolean(isMobile));

  /**
   * Escape shrinks an expanded panel back to the corner.
   *
   * Deliberately does NOT close the overlay — that is not today's behaviour and
   * changing it would lose a conversation to a reflex keypress. Expanded is the
   * state where Escape has something obvious to undo, because the panel is
   * covering the page the user was reading.
   */
  useEffect(() => {
    if (!opened || !expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapse();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [opened, expanded, collapse]);

  // ---- Persist messages and model to sessionStorage ----
  useEffect(() => {
    persist(SESSION_KEY_HISTORY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    persist(SESSION_KEY_MODEL, model);
  }, [model]);

  useEffect(() => {
    persist(SESSION_KEY_CONVERSATION, conversationId);
  }, [conversationId]);

  useEffect(() => {
    persist(
      SESSION_KEY_FULL_PROPOSALS,
      JSON.stringify(Array.from(fullProposals.entries()))
    );
  }, [fullProposals]);

  /**
   * Re-adopt restored cards, once, on mount. The rules are in
   * chatSessionStorage.reconcileRestoredProposals; this only applies them.
   */
  useEffect(() => {
    const { expired, superseded, active } = reconcileRestoredProposals(messages, fullProposals);
    if (expired.size > 0 || superseded.size > 0) {
      setMessages((prev) =>
        prev.map((m) => {
          if (expired.has(m.id)) return { ...m, proposalStatus: 'expired' as const };
          if (superseded.has(m.id)) return { ...m, proposalStatus: 'superseded' as const };
          return m;
        }),
      );
    }
    if (active) setActiveProposalMessageId(active);
    // Mount only: this reconciles restored state, and re-running it would fight
    // the live bookkeeping in handleActionProposalResponse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          rows: proposal.rows,
          reasoning: proposal.reasoning,
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

      if (response.usage.capExceeded) {
        setError('Monthly AI budget reached. The chatbot will be available next month.');
      }
    },
    [handleActionProposalResponse]
  );

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
    setAttachment,
    isLoading,
    messages,
    model,
    pageContext,
    conversationId,
    userDisplayName,
    handleResponse,
  ]);

  // ---- Action card confirm handler (Phase 8.4, 9.1) ----
  const handleConfirmAction = useCallback(
    async (
      messageId: string,
      rows: Array<{ rowId: string; params: Record<string, unknown> }>,
    ) => {
      const fullProposal = fullProposals.get(messageId);
      if (!fullProposal) return;

      try {
        const result = await api.confirmChatAction({
          proposalId: fullProposal.proposalId,
          rows,
        });

        if (result.success) {
          updateMessageById(messageId, {
            proposalStatus: 'confirmed',
            resource: result.resource,
            actionResults: result.results,
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

  /**
   * Download the conversation as Markdown.
   *
   * The assistant filed this against itself as a capability gap: the transcript
   * exists only in this tab's sessionStorage, because the server keeps tool
   * calls and token counts and deliberately no prose (SEC-P040). Before this,
   * reporting a bug about the assistant meant screenshotting it.
   *
   * Entirely client-side — the conversation is already here, and round-tripping
   * it through the server to get a file back would mean storing the prose the
   * trace store is careful not to store.
   */
  const handleDownloadTranscript = useCallback(() => {
    const markdown = buildTranscript(messages, { conversationId });
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = transcriptFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked on the next frame: revoking synchronously can beat the download
    // in some browsers, and holding the blob forever leaks the whole
    // conversation into memory for the life of the tab.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [messages, conversationId]);

  // ---- New conversation ----
  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setError(null);
    setAttachment(null);
    setActiveProposalMessageId(null);
    setActionErrors({});
    setFullProposals(new Map());
    // Generate a new conversation UUID so the backend's supersession logic
    // starts fresh (Phase 7.3).
    setConversationId(crypto.randomUUID());
    clearChatSession();
  }, [setAttachment]);

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
    <Paper shadow="xl" radius={isMobile ? 0 : 'md'} style={panelStyle}>
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
          {canExpand && (
            <Tooltip label={expanded ? 'Shrink to corner' : 'Expand for easier reading'}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label={expanded ? 'Shrink chat' : 'Expand chat'}
                onClick={toggleExpanded}
              >
                {expanded ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
              </ActionIcon>
            </Tooltip>
          )}
          {messages.length > 0 && (
            <Tooltip label="Download this conversation">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label="Download this conversation"
                onClick={handleDownloadTranscript}
              >
                <IconDownload size={14} />
              </ActionIcon>
            </Tooltip>
          )}
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
          <Stack gap="xs" align="center" mt="xl" style={contentStyle}>
            <Text size="sm" c="dimmed" ta="center">
              Ask me anything about your finances!
            </Text>
            {/* REQ-005: attachment discovery hint */}
            <Text size="xs" c="dimmed" ta="center">
              📎 Snap a photo of a flyer, receipt, or invite — I can help track it.
            </Text>
          </Stack>
        ) : (
          <Stack gap="sm" style={contentStyle}>
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
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

      {/* The border spans the full panel; the controls inside align with the
          message column, so the composer does not drift away from the text it
          belongs to when expanded. */}
      <Box style={{ borderTop: '1px solid var(--mantine-color-dark-4)', flexShrink: 0 }}>
        <Group p="sm" gap="xs" align="center" style={contentStyle}>
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
      </Box>
    </Paper>
  );
}
