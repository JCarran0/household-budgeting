import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/api/errors';
import type { LedgerFactInput } from '../../../shared/types';

export const LEDGER_QUERY_KEY = ['ledger'] as const;

/** One ledger write: refresh the view on success, say what failed otherwise. */
function useLedgerAction<TArgs>(fn: (args: TArgs) => Promise<unknown>, success: string | null, failure: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LEDGER_QUERY_KEY });
      if (success) notifications.show({ message: success, color: 'green' });
    },
    onError: (err: unknown) => notifications.show({ title: failure, message: getApiErrorMessage(err), color: 'red' }),
  });
}

/**
 * The Household Ledger view and every action on it. The page and the
 * dashboard's Heads-up card share this so a "done" in one is reflected in the
 * other. Heads-up phases come from the server (shared date engine); nothing
 * here decides what is due.
 */
export function useLedger(options: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: LEDGER_QUERY_KEY,
    queryFn: () => api.getLedger(),
    enabled: options.enabled ?? true,
    retry: false,
  });

  const create = useLedgerAction((input: LedgerFactInput) => api.createLedgerFact(input), 'Saved to the Household Ledger', 'Could not save');
  const update = useLedgerAction(({ id, input }: { id: string; input: LedgerFactInput }) => api.updateLedgerFact(id, input), 'Saved', 'Could not save');
  const remove = useLedgerAction((id: string) => api.deleteLedgerFact(id), 'Deleted', 'Could not delete');
  const correct = useLedgerAction(({ id, input }: { id: string; input: LedgerFactInput }) => api.correctLedgerFact(id, input), 'Correction saved', 'Could not save the correction');
  const markHandled = useLedgerAction(
    ({ factId, occurrenceDate, note }: { factId: string; occurrenceDate: string; note?: string }) =>
      api.markLedgerHandled(factId, occurrenceDate, note),
    'Marked handled for the household',
    'Could not mark handled',
  );
  const decline = useLedgerAction(
    ({ factId, occurrenceDate, note }: { factId: string; occurrenceDate: string; note?: string }) =>
      api.markLedgerHandled(factId, occurrenceDate, note, 'declined'),
    'Recorded as not doing it — no more reminders',
    'Could not record that',
  );
  const unmarkHandled = useLedgerAction((markId: string) => api.unmarkLedgerHandled(markId), 'Handled mark removed', 'Could not undo');
  const snooze = useLedgerAction(({ key, until }: { key: string; until: string }) => api.snoozeLedgerItem(key, until), 'Snoozed for you', 'Could not snooze');
  const unsnooze = useLedgerAction((key: string) => api.unsnoozeLedgerItem(key), null, 'Could not unsnooze');
  const mute = useLedgerAction(({ subject, muted }: { subject: string; muted: boolean }) => api.muteLedgerSubject(subject, muted), null, 'Could not change notifications');
  const makeTask = useMutation({
    mutationFn: ({ factId, occurrenceDate }: { factId: string; occurrenceDate: string }) => api.makeLedgerTask(factId, occurrenceDate),
    onSuccess: task => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      notifications.show({ message: `Task created: ${task.title}. Completing it marks this handled.`, color: 'green' });
    },
    onError: (err: unknown) => notifications.show({ title: 'Could not create the task', message: getApiErrorMessage(err), color: 'red' }),
  });

  return { query, create, update, remove, correct, markHandled, decline, unmarkHandled, snooze, unsnooze, mute, makeTask };
}
