import { useEffect, useState } from 'react';
import { Button, Group, Stack, Text, Textarea } from '@mantine/core';
import type { HeadsUpItem } from '../../../../shared/types';
import { ResponsiveModal } from '../ResponsiveModal';

interface DeclineModalProps {
  item: HeadsUpItem | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (note: string | undefined) => void;
}

/**
 * "Not doing this" — the household decided not to act (e.g. keeping a plan
 * rather than cancelling for the refund). Closes the item for both people like
 * Done, but is recorded as a decision, with the reason if one is given.
 */
export function DeclineModal({ item, saving, onClose, onSubmit }: DeclineModalProps) {
  const [note, setNote] = useState('');
  useEffect(() => setNote(''), [item]);

  return (
    <ResponsiveModal opened={item !== null} onClose={onClose} title="Not doing this">
      <Stack>
        <Text size="sm">
          <Text span fw={500}>{item?.title}</Text> will stop showing up and stop sending reminders for both of you.
          You can undo this from the Household page.
        </Text>
        <Textarea
          label="Why? (optional)"
          placeholder="Keeping the coverage"
          autosize
          minRows={2}
          maxLength={500}
          value={note}
          onChange={e => setNote(e.currentTarget.value)}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button color="gray" loading={saving} onClick={() => onSubmit(note.trim() || undefined)}>Not doing this</Button>
        </Group>
      </Stack>
    </ResponsiveModal>
  );
}
