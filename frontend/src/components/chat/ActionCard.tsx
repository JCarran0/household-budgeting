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
  Checkbox,
} from '@mantine/core';
import {
  IconCheck,
  IconEdit,
  IconX,
  IconExternalLink,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';
import type { ActionProposal, ActionResource, ActionRowResult, ProposalRow } from '../../../../shared/types';
import { getActionForm } from './action-forms';
import { ActionCardRow } from './ActionCardRow';
import { PROPOSAL_ROW_GROUPING_THRESHOLD } from '../../../../shared/types';

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
  /** All executed rows, when the confirmation applied more than one. */
  results?: ActionRowResult[];
  errorMessage?: string;
  /** Called when user clicks Confirm. Receives exactly the checked rows with
   *  their params (may differ from the proposed params if Edit was used). */
  onConfirm: (rows: Array<{ rowId: string; params: Record<string, unknown> }>) => Promise<void>;
  onDismiss: () => void;
}

/**
 * SEC-P012: a count-by-type summary above the rows. It supplements them — the
 * rows are always rendered in full, never collapsed behind this.
 */
function countByType(rows: ProposalRow[]): Array<{ key: string; label: string; count: number }> {
  return groupByType(rows).map(({ key, label, rows: groupRows }) => ({
    key,
    label,
    count: groupRows.length,
  }));
}

/**
 * Stable grouping by action type, preserving first-appearance order.
 *
 * Keyed on actionId, not on the human label: two actions that happen to share a
 * label would otherwise merge into one group with one select-all, and the
 * summary would under-report what the card is actually about to do.
 */
function groupByType(
  rows: ProposalRow[],
): Array<{ key: string; label: string; rows: ProposalRow[] }> {
  const groups = new Map<string, { label: string; rows: ProposalRow[] }>();
  for (const row of rows) {
    const existing = groups.get(row.actionId);
    if (existing) existing.rows.push(row);
    else groups.set(row.actionId, { label: row.label, rows: [row] });
  }
  return Array.from(groups, ([key, { label, rows: groupRows }]) => ({ key, label, rows: groupRows }));
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
  results,
  errorMessage,
  onConfirm,
  onDismiss,
}: ActionCardProps) {
  const rows = proposal.rows;
  const isPlan = rows.length > 1;
  const singleRow = rows[0];

  const [isEditMode, setIsEditMode] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);

  // REQ-P021: every row starts checked — the plan is the proposal, and
  // de-selection is the user narrowing it.
  const [checkedRowIds, setCheckedRowIds] = useState<Set<string>>(
    () => new Set(rows.map(r => r.rowId)),
  );

  // Reset edit mode when status changes away from pending
  useEffect(() => {
    if (status !== 'pending') {
      setIsEditMode(false);
    }
  }, [status]);

  const handleConfirm = async (
    confirmedRows: Array<{ rowId: string; params: Record<string, unknown> }>,
  ) => {
    // Double-click protection: loading state prevents redundant requests.
    // The backend's nonce single-use invariant is the final backstop.
    if (confirming || confirmedRows.length === 0) return;
    setConfirming(true);
    try {
      await onConfirm(confirmedRows);
    } finally {
      setConfirming(false);
    }
  };

  // SEC-P013: derived from what is checked at click time, not from the
  // proposal's size.
  const selectedRows = rows.filter(r => checkedRowIds.has(r.rowId));

  const handleConfirmSelected = () => {
    void handleConfirm(selectedRows.map(r => ({ rowId: r.rowId, params: r.params })));
  };

  const toggleRow = (rowId: string) => {
    setCheckedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const setGroupChecked = (groupRows: ProposalRow[], checked: boolean) => {
    setCheckedRowIds((prev) => {
      const next = new Set(prev);
      for (const r of groupRows) {
        if (checked) next.add(r.rowId);
        else next.delete(r.rowId);
      }
      return next;
    });
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
    const appliedCount = results?.length ?? 1;
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
            {appliedCount > 1 ? (
              <>Applied <Text span fw={600}>{appliedCount} changes</Text></>
            ) : (
              <>
                {getConfirmedPrefix(resource.type)}{' '}
                <Text span fw={600}>{resource.label}</Text>
              </>
            )}
          </Text>
          {appliedCount === 1 && resource.url && (
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

  // Inline editing operates on a single row: the edit forms are per-action and
  // there is no multi-row editor yet. A plan card still supports de-selection,
  // which is the safety-relevant control; editing a plan means asking for a
  // revised plan. (Multi-row editing is Phase 3 work.)
  if (status === 'pending' && isEditMode && !isPlan) {
    const EditForm = getActionForm(singleRow.actionId);

    if (!EditForm) {
      // Fallback: no edit form registered. Shouldn't happen in V1.
      return (
        <Paper p="sm" radius="sm" withBorder mt="xs">
          <Text size="xs" c="red">
            Edit form not available for action: {singleRow.actionId}
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
          {singleRow.label} — Edit
        </Text>
        <Divider mb="xs" />
        <EditForm
          initialValues={singleRow.params}
          onSubmit={(values) => {
            void handleConfirm([
              { rowId: singleRow.rowId, params: values as Record<string, unknown> },
            ]);
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
            {isPlan ? `${rows.length} proposed changes` : singleRow.label}
          </Badge>
          {isFailed && (
            <Badge size="sm" variant="light" color="red">
              Error
            </Badge>
          )}
        </Group>

        {/* SEC-P012: count-by-type summary above the rows, never instead of them */}
        {isPlan && (
          <Group gap={6}>
            {countByType(rows).map(({ key, label, count }) => (
              <Badge key={key} size="xs" variant="outline" color="gray">
                {label} × {count}
              </Badge>
            ))}
          </Group>
        )}

        {/* Rows */}
        {!isPlan ? (
          <ActionCardRow row={singleRow} />
        ) : rows.length <= PROPOSAL_ROW_GROUPING_THRESHOLD ? (
          <Stack gap="xs">
            {rows.map((row) => (
              <ActionCardRow
                key={row.rowId}
                row={row}
                checked={checkedRowIds.has(row.rowId)}
                onToggle={toggleRow}
                disabled={confirming}
                showLabel
              />
            ))}
          </Stack>
        ) : (
          // SEC-P012: past the legibility threshold, group by action type and
          // give each group a select-all.
          <Stack gap="sm">
            {groupByType(rows).map(({ key, label, rows: groupRows }) => {
              const selectedInGroup = groupRows.filter(r => checkedRowIds.has(r.rowId)).length;
              return (
                <Stack key={key} gap={4}>
                  <Group gap="xs">
                    <Checkbox
                      size="xs"
                      checked={selectedInGroup === groupRows.length}
                      indeterminate={selectedInGroup > 0 && selectedInGroup < groupRows.length}
                      disabled={confirming}
                      onChange={(e) => setGroupChecked(groupRows, e.currentTarget.checked)}
                      aria-label={`Select all: ${label}`}
                    />
                    <Text size="xs" fw={600} c="dimmed">
                      {label} ({selectedInGroup}/{groupRows.length})
                    </Text>
                  </Group>
                  <Stack gap={4} pl="md">
                    {groupRows.map((row) => (
                      <ActionCardRow
                        key={row.rowId}
                        row={row}
                        checked={checkedRowIds.has(row.rowId)}
                        onToggle={toggleRow}
                        disabled={confirming}
                      />
                    ))}
                  </Stack>
                </Stack>
              );
            })}
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

        {/*
          Controls.

          A failed confirm means the nonce was already consumed server-side —
          consuming it IS the authorization event, and it is single-use whether
          or not the execution that followed succeeded. So Confirm and Edit are
          removed rather than left as affordances that can only ever return 409.
          This also stops a plan card that half-applied from still offering
          "Apply 5 changes" after 2 of them already landed.
        */}
        {isFailed ? (
          <Group gap="xs" mt="xs">
            <Text size="xs" c="dimmed">
              This proposal has been used up. Ask me again to get a fresh one.
            </Text>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconX size={12} />}
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          </Group>
        ) : (
        <Group gap="xs" mt="xs">
          <Button
            size="xs"
            leftSection={<IconCheck size={12} />}
            loading={confirming}
            // SEC-P013: the label states the exact count derived from the
            // checked rows, and an empty selection has nothing to confirm.
            disabled={confirming || selectedRows.length === 0}
            onClick={handleConfirmSelected}
          >
            {isPlan ? `Apply ${selectedRows.length} changes` : 'Confirm'}
          </Button>
          {!isPlan && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconEdit size={12} />}
              disabled={confirming}
              onClick={() => setIsEditMode(true)}
            >
              Edit
            </Button>
          )}
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
        )}
      </Stack>
    </Paper>
  );
}
