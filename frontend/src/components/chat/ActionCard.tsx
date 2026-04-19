/**
 * ActionCard — inline card rendered in the chat when the backend returns an
 * action_proposal response. Handles all lifecycle states:
 *   pending → edit | confirmed | dismissed | superseded | expired | failed
 *
 * Security: The card displays every writable field before the user can confirm
 * (SEC-A008, REQ-013). The Confirm button is protected against double-clicks
 * via loading state. The nonce (proposalId) is kept in the ActionProposal
 * passed as a prop and is never sent to the LLM (handled in ChatOverlay
 * history serialization).
 */
import { useState, useEffect } from 'react';
import {
  Paper,
  Text,
  Group,
  Button,
  Stack,
  Anchor,
  Divider,
  Collapse,
  Badge,
} from '@mantine/core';
import {
  IconCheck,
  IconEdit,
  IconX,
  IconExternalLink,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';
import type { ActionProposal, ActionResource } from '../../../../shared/types';
import { getActionForm } from './action-forms';

/**
 * ActionCardStatus values:
 *  - The first five map 1:1 to ChatMessage.proposalStatus from shared types.
 *  - 'failed' is a frontend-only display state: the proposal is still 'pending'
 *    in shared state but errorMessage is present, indicating a confirm attempt
 *    failed. The card remains interactive (user can edit and retry).
 */
export type ActionCardStatus =
  | 'pending'
  | 'confirmed'
  | 'dismissed'
  | 'superseded'
  | 'expired'
  | 'failed';

interface ActionCardProps {
  proposal: ActionProposal;
  status: ActionCardStatus;
  resource?: ActionResource;
  errorMessage?: string;
  /** Called when user clicks Confirm (normal or after edit). Receives the
   *  confirmed params (may differ from proposal.params if Edit was used). */
  onConfirm: (params: Record<string, unknown>) => Promise<void>;
  onDismiss: () => void;
}

/**
 * Returns a human-readable action label for the given actionId.
 * Kept here rather than querying the backend registry so the card
 * can render synchronously.
 */
function getActionLabel(actionId: string): string {
  const labels: Record<string, string> = {
    create_task: 'Create a task',
    submit_github_issue: 'Report an issue',
  };
  return labels[actionId] ?? actionId;
}

function getConfirmedPrefix(resourceType: ActionResource['type']): string {
  switch (resourceType) {
    case 'task':          return 'Created task:';
    case 'github_issue':  return 'Filed issue:';
  }
}

export function ActionCard({
  proposal,
  status,
  resource,
  errorMessage,
  onConfirm,
  onDismiss,
}: ActionCardProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);

  // Reset edit mode when status changes away from pending
  useEffect(() => {
    if (status !== 'pending') {
      setIsEditMode(false);
    }
  }, [status]);

  const handleConfirm = async (params: Record<string, unknown>) => {
    // Double-click protection: loading state prevents redundant requests.
    // The backend's nonce single-use invariant is the final backstop.
    if (confirming) return;
    setConfirming(true);
    try {
      await onConfirm(params);
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmOriginal = () => {
    void handleConfirm(proposal.params);
  };

  // ---- Terminal states (non-interactive) ----

  if (status === 'dismissed') {
    return (
      <Paper
        p="xs"
        radius="sm"
        withBorder
        mt="xs"
        style={{ opacity: 0.5 }}
      >
        <Text size="xs" c="dimmed" fs="italic">Dismissed</Text>
      </Paper>
    );
  }

  if (status === 'superseded') {
    return (
      <Paper
        p="xs"
        radius="sm"
        withBorder
        mt="xs"
        style={{ opacity: 0.4 }}
      >
        <Text size="xs" c="dimmed" fs="italic" td="line-through">
          Superseded by a newer proposal
        </Text>
      </Paper>
    );
  }

  if (status === 'expired') {
    return (
      <Paper
        p="sm"
        radius="sm"
        withBorder
        mt="xs"
        style={{ opacity: 0.6 }}
      >
        <Text size="xs" c="dimmed">
          This proposal expired. Ask me again if you still want to create it.
        </Text>
      </Paper>
    );
  }

  if (status === 'confirmed' && resource) {
    const isExternal = resource.type === 'github_issue';
    return (
      <Paper
        p="sm"
        radius="sm"
        withBorder
        mt="xs"
        style={{ borderColor: 'var(--mantine-color-green-6)' }}
      >
        <Group gap="xs">
          <IconCheck size={16} color="var(--mantine-color-green-6)" />
          <Text size="sm" c="green">
            {getConfirmedPrefix(resource.type)}{' '}
            <Text span fw={600}>{resource.label}</Text>
          </Text>
          {resource.url && (
            <Anchor
              href={resource.url}
              size="sm"
              target={isExternal ? '_blank' : '_self'}
              rel={isExternal ? 'noopener noreferrer' : undefined}
            >
              <Group gap={2}>
                <IconExternalLink size={12} />
                <span>View</span>
              </Group>
            </Anchor>
          )}
        </Group>
      </Paper>
    );
  }

  // ---- Edit mode ----

  if (status === 'pending' && isEditMode) {
    const EditForm = getActionForm(proposal.actionId);

    if (!EditForm) {
      // Fallback: no edit form registered. Shouldn't happen in V1.
      return (
        <Paper p="sm" radius="sm" withBorder mt="xs">
          <Text size="xs" c="red">
            Edit form not available for action: {proposal.actionId}
          </Text>
          <Button
            size="xs"
            variant="subtle"
            mt="xs"
            onClick={() => setIsEditMode(false)}
          >
            Cancel
          </Button>
        </Paper>
      );
    }

    return (
      <Paper p="sm" radius="sm" withBorder mt="xs">
        <Text size="xs" fw={600} mb="xs" c="dimmed">
          {getActionLabel(proposal.actionId)} — Edit
        </Text>
        <Divider mb="xs" />
        <EditForm
          initialValues={proposal.params}
          onSubmit={(values) => {
            void handleConfirm(values as Record<string, unknown>);
            setIsEditMode(false);
          }}
          onCancel={() => setIsEditMode(false)}
          loading={confirming}
        />
      </Paper>
    );
  }

  // ---- Pending (collapsed view) + failed ----

  const isFailed = status === 'failed';

  return (
    <Paper
      p="sm"
      radius="sm"
      withBorder
      mt="xs"
      style={
        isFailed
          ? { borderColor: 'var(--mantine-color-red-6)' }
          : { borderColor: 'var(--mantine-color-blue-6)' }
      }
    >
      <Stack gap="xs">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Badge size="sm" variant="light" color="blue">
            {getActionLabel(proposal.actionId)}
          </Badge>
          {isFailed && (
            <Badge size="sm" variant="light" color="red">
              Error
            </Badge>
          )}
        </Group>

        {/* Summary */}
        <Text size="sm" fw={600}>{proposal.displaySummary}</Text>

        {/* Field preview — only LLM-proposed fields (per D-11 collapsed view) */}
        {proposal.displayFields.length > 0 && (
          <Stack gap={4}>
            {proposal.displayFields.map((field) => (
              <Group key={field.key} gap="xs" align="flex-start">
                <Text size="xs" c="dimmed" w={80} style={{ flexShrink: 0 }}>
                  {field.label}
                </Text>
                <Text size="xs" style={{ flex: 1 }}>
                  {field.value}
                </Text>
              </Group>
            ))}
          </Stack>
        )}

        {/* Error message (failed state) */}
        {isFailed && errorMessage && (
          <Text size="xs" c="red">{errorMessage}</Text>
        )}

        {/* "Why?" disclosure (D-12 — collapsed by default) */}
        {proposal.reasoning && (
          <div>
            <Anchor
              component="button"
              type="button"
              size="xs"
              c="dimmed"
              onClick={() => setShowReasoning((v) => !v)}
            >
              <Group gap={2}>
                <span>Why?</span>
                {showReasoning
                  ? <IconChevronUp size={12} />
                  : <IconChevronDown size={12} />}
              </Group>
            </Anchor>
            <Collapse in={showReasoning}>
              <Text size="xs" c="dimmed" mt={4} fs="italic">
                {proposal.reasoning}
              </Text>
            </Collapse>
          </div>
        )}

        {/* Controls */}
        <Group gap="xs" mt="xs">
          <Button
            size="xs"
            leftSection={<IconCheck size={12} />}
            loading={confirming}
            disabled={confirming}
            onClick={handleConfirmOriginal}
          >
            Confirm
          </Button>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconEdit size={12} />}
            disabled={confirming}
            onClick={() => setIsEditMode(true)}
          >
            Edit
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconX size={12} />}
            disabled={confirming}
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </Group>

        {/* Try Again — visible in failed state */}
        {isFailed && (
          <Button
            size="xs"
            variant="subtle"
            color="blue"
            onClick={() => setIsEditMode(true)}
          >
            Edit and try again
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
