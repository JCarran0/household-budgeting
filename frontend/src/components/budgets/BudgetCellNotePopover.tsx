import { useEffect, useState } from 'react';
import { Popover, Textarea, Button, Group, Stack, Text, ActionIcon, Tooltip } from '@mantine/core';
import { IconMessage, IconMessageCircle2, IconTrash } from '@tabler/icons-react';

interface BudgetCellNotePopoverProps {
  /** Currently saved (or pending) note for this cell — empty string means no note */
  value: string;
  /** Called when the user saves a new note value (already trimmed); empty string clears the note */
  onSave: (notes: string) => void;
  /** Optional context shown in the popover header (e.g. "Groceries · Mar") */
  label?: string;
}

const MAX_LEN = 1000;

/**
 * Corner-pinned note indicator + popover editor for a single yearly-grid cell.
 * Visible always — faint outline when empty, filled when populated — so users
 * can discover the affordance without hunting for a hover state.
 */
export function BudgetCellNotePopover({ value, onSave, label }: BudgetCellNotePopoverProps) {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (opened) setDraft(value);
  }, [opened, value]);

  const trimmed = draft.trim();
  const dirty = trimmed !== value.trim();
  const hasNote = value.trim().length > 0;

  const commit = (next: string) => {
    onSave(next);
    setOpened(false);
  };

  const triggerLabel = hasNote ? 'Edit note' : 'Add note';

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      shadow="md"
      width={280}
      withArrow
      trapFocus
    >
      <Popover.Target>
        <Tooltip label={hasNote ? value : triggerLabel} disabled={opened} withinPortal>
          <ActionIcon
            size="xs"
            radius="xl"
            variant={hasNote ? 'filled' : 'subtle'}
            color={hasNote ? 'blue' : 'gray'}
            aria-label={triggerLabel}
            onClick={(e) => {
              e.stopPropagation();
              setOpened((o) => !o);
            }}
            style={{ opacity: hasNote ? 1 : 0.45 }}
          >
            <IconMessageCircle2 size={10} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>

      <Popover.Dropdown onClick={(e) => e.stopPropagation()}>
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
              <IconMessageCircle2 size={14} />
              <Text size="xs" fw={600}>
                Note{label ? ` · ${label}` : ''}
              </Text>
            </Group>
            {hasNote && (
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                aria-label="Clear note"
                onClick={() => commit('')}
              >
                <IconTrash size={12} />
              </ActionIcon>
            )}
          </Group>

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value.slice(0, MAX_LEN))}
            placeholder="Add a note for this budget cell…"
            autosize
            minRows={3}
            maxRows={8}
            size="xs"
            data-autofocus
          />

          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {draft.length}/{MAX_LEN}
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setOpened(false)}>
                Cancel
              </Button>
              <Button
                size="xs"
                leftSection={<IconMessage size={12} />}
                onClick={() => commit(trimmed)}
                disabled={!dirty}
              >
                Save
              </Button>
            </Group>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
