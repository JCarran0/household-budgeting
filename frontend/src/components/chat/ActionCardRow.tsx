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
import { Checkbox, Group, Stack, Text, Badge } from '@mantine/core';
import type { DisplayField, ProposalRow } from '../../../../shared/types';

interface ActionCardRowProps {
  row: ProposalRow;
  /** Omitted for a single-row card, which has nothing to de-select. */
  checked?: boolean;
  onToggle?: (rowId: string) => void;
  disabled?: boolean;
  /** Shown on multi-row cards, where rows of different types sit together. */
  showLabel?: boolean;
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
                  {field.value}
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
