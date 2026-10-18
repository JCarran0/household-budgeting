import { useMemo, useState } from 'react';
import { Alert, Button, Card, Center, Container, Group, Loader, Stack, Switch, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { IconAlertCircle, IconHomeCheck, IconPlus } from '@tabler/icons-react';
import { api } from '../lib/api';
import { useLedger } from '../hooks/useLedger';
import { HeadsUpList } from '../components/household/HeadsUpList';
import { LedgerFactList } from '../components/household/LedgerFactList';
import { LedgerFactModal, type LedgerFactModalMode } from '../components/household/LedgerFactModal';
import type { LedgerFact, LedgerFactInput } from '../../../shared/types';

/**
 * Household page (HOUSEHOLD-LEDGER-BRD REQ-H050 – H053): the Heads-up list and
 * every fact Helper Bot can read, grouped by what it is about.
 */
export function Household() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('factId');
  const [modal, setModal] = useState<LedgerFactModalMode | null>(null);
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const ledger = useLedger();
  const { data: view, isLoading, isError } = ledger.query;
  const { data: family } = useQuery({ queryKey: ['family'], queryFn: () => api.getFamily() });

  const memberNames = useMemo(
    () => new Map((family?.family.members ?? []).map(m => [m.userId, m.displayName])),
    [family],
  );
  const subjects = useMemo(() => [...new Set((view?.facts ?? []).map(f => f.subject))].sort(), [view]);
  const hasWithdrawn = (view?.facts ?? []).some(f => f.status === 'withdrawn' && !f.handles);

  const saving = ledger.create.isPending || ledger.update.isPending || ledger.correct.isPending;
  const submit = (input: LedgerFactInput) => {
    if (!modal) return;
    const done = { onSuccess: () => setModal(null) };
    if (modal.type === 'create') ledger.create.mutate(input, done);
    else if (modal.type === 'edit') ledger.update.mutate({ id: modal.fact.id, input }, done);
    else ledger.correct.mutate({ id: modal.fact.id, input }, done);
  };

  const confirmDelete = (fact: LedgerFact) =>
    modals.openConfirmModal({
      title: fact.overrides ? 'Delete this correction?' : 'Delete this fact?',
      children: (
        <Text size="sm">
          {fact.overrides
            ? 'Reminders and Helper Bot will use the document’s version again.'
            : `“${fact.title}” will be removed for both of you, along with any handled marks on it.`}
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => ledger.remove.mutate(fact.id),
    });

  return (
    <Container size="lg" py="md">
      <Group justify="space-between" align="center" mb="lg">
        <Group gap="sm">
          <IconHomeCheck size={28} />
          <div>
            <Title order={2}>Household</Title>
            <Text size="sm" c="dimmed">Dates and terms from your documents, and things you asked to remember.</Text>
          </div>
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ type: 'create' })}>
          Add
        </Button>
      </Group>

      {isLoading && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {isError && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Could not load the Household Ledger">
          It may be unavailable in this workspace. Nothing here means nothing is due — check again later.
        </Alert>
      )}

      {view && (
        <Stack gap="xl">
          <Card withBorder padding="lg" radius="md">
            <Text fw={600} mb="sm">Heads-up</Text>
            {view.headsUp.length === 0 ? (
              <Text size="sm" c="dimmed">Nothing needs attention right now.</Text>
            ) : (
              <HeadsUpList items={view.headsUp} today={view.today} />
            )}
          </Card>

          {hasWithdrawn && (
            <Switch
              label="Show facts no longer found in their document"
              checked={showWithdrawn}
              onChange={e => setShowWithdrawn(e.currentTarget.checked)}
            />
          )}

          {view.facts.length === 0 ? (
            <Text c="dimmed">Nothing recorded yet. Add a date you need to remember, or ask Helper Bot to remember something.</Text>
          ) : (
            <LedgerFactList
              facts={view.facts}
              documents={view.documents}
              memberNames={memberNames}
              mutedSubjects={view.prefs.mutedSubjects}
              today={view.today}
              highlightId={highlightId}
              showWithdrawn={showWithdrawn}
              onEdit={fact => setModal({ type: 'edit', fact })}
              onCorrect={fact => setModal({ type: 'correct', fact })}
              onDelete={confirmDelete}
              onUnmark={markId => ledger.unmarkHandled.mutate(markId)}
              onToggleMute={(subject, muted) => ledger.mute.mutate({ subject, muted })}
            />
          )}
        </Stack>
      )}

      <LedgerFactModal mode={modal} subjects={subjects} saving={saving} onClose={() => setModal(null)} onSubmit={submit} />
    </Container>
  );
}
