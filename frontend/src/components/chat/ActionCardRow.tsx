/**
 * ActionCardRow — one proposed write inside a plan card.
 *
 * Security: this component renders what the SERVER said the row will write
 * (SEC-P010). The label comes from the backend action registry, not from a
 * frontend lookup table and not from the model. `currentValues` is likewise
 * server-resolved (SEC-P011) — there is no tool-schema field through which the
 * model could narrate what it is about to overwrite.
 *
 * All values render as plain text. No markdown, no links, no HTML.
 */
import { useState } from 'react';
import { Anchor, Badge, Checkbox, Group, Stack, Text } from '@mantine/core';
import type { DisplayField, ProposalRow } from '../../../../shared/types';

/**
 * Above this, a value is clipped behind a toggle rather than dumped into the
 * card.
 *
 * The server now renders display values from the params themselves (SEC-P010),
 * which is what makes a card honest — and it means a 1,700-character issue body
 * arrives here in full rather than as the model's one-line paraphrase of it.
 * Honest and unreadable is not an improvement: a wall of text that pushes
 * Confirm off the screen gets approved unread just as reliably as a summary
 * does. So the value is clipped with its LENGTH stated, because the length is
 * the thing that tells a reader whether there is more here than they expected.
 */
const LONG_VALUE_CHARS = 220;

interface ActionCardRowProps {
  row: ProposalRow;
  /** Omitted for a single-row card, which has nothing to de-select. */
  checked?: boolean;
  onToggle?: (rowId: string) => void;
  disabled?: boolean;
  /** Shown on multi-row cards, where rows of different types sit together. */
  showLabel?: boolean;
}

/**
 * A value the user can actually read, without hiding that there is more of it.
 */
function FieldValue({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);

  if (value.length <= LONG_VALUE_CHARS) return <>{value}</>;

  return (
    <>
      <Text span size="xs" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {expanded ? value : `${value.slice(0, LONG_VALUE_CHARS).trimEnd()}…`}
      </Text>{' '}
      <Anchor
        component="button"
        type="button"
        size="xs"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? 'Show less' : `Show all ${value.length.toLocaleString()} characters`}
      </Anchor>
    </>
  );
}

/** Pairs a proposed field with the current value it replaces, when there is one. */
function currentFor(
  currentValues: DisplayField[] | undefined,
  key: string,
): string | undefined {
  return currentValues?.find(f => f.key === key)?.value;
}

export function ActionCardRow({
  row,
  checked,
  onToggle,
  disabled,
  showLabel,
}: ActionCardRowProps) {
  const selectable = checked !== undefined && onToggle !== undefined;

  const body = (
    <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
      <Group gap="xs" align="center" wrap="nowrap">
        {showLabel && (
          <Badge size="xs" variant="light" color="blue" style={{ flexShrink: 0 }}>
            {row.label}
          </Badge>
        )}
        <Text size="sm" fw={600} style={{ minWidth: 0 }}>
          {row.displaySummary}
        </Text>
      </Group>

      {row.displayFields.length > 0 && (
        <Stack gap={2}>
          {row.displayFields.map((field) => {
            const before = currentFor(row.currentValues, field.key);
            return (
              <Group key={field.key} gap="xs" align="flex-start" wrap="nowrap">
                <Text size="xs" c="dimmed" w={80} style={{ flexShrink: 0 }}>
                  {field.label}
                </Text>
                <Text size="xs" style={{ flex: 1, minWidth: 0 }}>
                  {/* SEC-P011: what it is now, then what it becomes. */}
                  {before !== undefined && before !== field.value && (
                    <Text span size="xs" c="dimmed" td="line-through" mr={6}>
                      {before}
                    </Text>
                  )}
                  <FieldValue value={field.value} />
                </Text>
              </Group>
            );
          })}
        </Stack>
      )}
    </Stack>
  );

  if (!selectable) return body;

  return (
    <Group gap="xs" align="flex-start" wrap="nowrap">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={() => onToggle(row.rowId)}
        aria-label={`Include: ${row.displaySummary}`}
        mt={2}
      />
      {body}
    </Group>
  );
}
