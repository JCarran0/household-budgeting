import { useEffect, useState } from 'react';
import { Accordion, ActionIcon, Anchor, Badge, Card, Group, Menu, Stack, Text, Tooltip } from '@mantine/core';
import { IconBell, IconBellOff, IconDots, IconExternalLink } from '@tabler/icons-react';
import type { LedgerDocumentRef, LedgerFact } from '../../../../shared/types';
import { KIND_COLOR, KIND_LABEL, describeRule, describeSchedule, friendlyDate, scheduleSortKey } from './ledgerFormat';

export interface LedgerFactListProps {
  facts: LedgerFact[];
  documents: Record<string, LedgerDocumentRef>;
  memberNames: Map<string, string>;
  mutedSubjects: string[];
  /** Household date, for each subject's "next" date. */
  today: string;
  highlightId: string | null;
  showWithdrawn: boolean;
  onEdit: (fact: LedgerFact) => void;
  onCorrect: (fact: LedgerFact) => void;
  onDelete: (fact: LedgerFact) => void;
  onUnmark: (markId: string) => void;
  onToggleMute: (subject: string, muted: boolean) => void;
}

/** A "not doing this" mark: closes the occurrence like Done, shown as a decision. */
function isDeclined(mark: LedgerFact): boolean {
  return mark.source.kind === 'app' && mark.source.event === 'declined';
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * REQ-H050 / H053: every fact the assistant can read is visible here, grouped
 * by subject, with where it came from. Handled marks are shown on the fact they
 * close; a corrected document fact stays visible beside its correction.
 *
 * Each subject is a collapsed accordion item so the page opens as a scannable
 * list; a deep link (?factId=) opens its subject and scrolls to the fact.
 */
export function LedgerFactList(props: LedgerFactListProps) {
  const { facts, documents, memberNames, mutedSubjects, today, highlightId, showWithdrawn, onToggleMute } = props;
  const [opened, setOpened] = useState<string[]>([]);
  const highlightSubject = highlightId ? facts.find(f => f.id === highlightId)?.subject ?? null : null;

  // Open the linked fact's subject, then scroll once the panel has expanded.
  useEffect(() => {
    if (!highlightId || !highlightSubject) return;
    setOpened(o => (o.includes(highlightSubject) ? o : [...o, highlightSubject]));
    const t = setTimeout(
      () => document.getElementById(`fact-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      250,
    );
    return () => clearTimeout(t);
  }, [highlightId, highlightSubject]);
  const name = (userId: string | null): string => (userId ? memberNames.get(userId) ?? 'a family member' : 'the app');
  const marks = facts.filter(f => f.handles && f.status === 'active');
  const correctedBy = new Map(facts.filter(f => f.overrides && f.status === 'active').map(f => [f.overrides!, f]));
  const rows = facts.filter(f => !f.handles && (showWithdrawn || f.status === 'active'));

  const bySubject = new Map<string, LedgerFact[]>();
  for (const f of rows) bySubject.set(f.subject, [...(bySubject.get(f.subject) ?? []), f]);
  const subjects = [...bySubject.keys()].sort((a, b) => a.localeCompare(b));

  const sourceLine = (f: LedgerFact) => {
    if (f.source.kind === 'document') {
      const doc = documents[f.source.docId];
      const pages = [...new Set(f.source.quotes.map(q => q.page))].join(', ');
      return (
        <Text size="xs" c="dimmed">
          From {doc?.title ?? f.source.docId}, p. {pages}
          {doc?.sourceUrl && (
            <>
              {' · '}
              <Anchor href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" size="xs">
                open original ({hostOf(doc.sourceUrl)}) <IconExternalLink size={10} />
              </Anchor>
            </>
          )}
        </Text>
      );
    }
    if (f.source.kind === 'user') {
      return (
        <Text size="xs" c="dimmed">
          Added by {name(f.source.userId)}{f.source.via === 'card' ? ' via Helper Bot' : ''} on {friendlyDate(f.createdAt.slice(0, 10))}
        </Text>
      );
    }
    return null;
  };

  const row = (f: LedgerFact) => {
    const replacement = correctedBy.get(f.id);
    const original = f.overrides ? facts.find(o => o.id === f.overrides) : undefined;
    const isUser = f.source.kind === 'user';
    const canCorrect = f.source.kind === 'document' && f.status === 'active' && !replacement;
    const rule = describeRule(f.schedule);
    const quote = f.source.kind === 'document' ? f.source.quotes[0] : null;
    return (
      <Card
        key={f.id}
        id={`fact-${f.id}`}
        withBorder
        padding="sm"
        radius="md"
        style={{
          opacity: replacement || f.status === 'withdrawn' ? 0.6 : 1,
          borderColor: highlightId === f.id ? 'var(--mantine-color-yellow-5)' : undefined,
        }}
      >
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap={6}>
              <Badge size="xs" color={KIND_COLOR[f.schedule.kind]} variant="light">{KIND_LABEL[f.schedule.kind]}</Badge>
              {replacement && <Badge size="xs" color="gray">Replaced by your correction</Badge>}
              {f.status === 'withdrawn' && <Badge size="xs" color="gray">No longer in the document</Badge>}
              {original && <Badge size="xs" color="blue" variant="outline">Correction</Badge>}
            </Group>
            <Text fw={500}>{f.title}</Text>
            <Text size="sm">
              {describeSchedule(f.schedule)}
              {f.amount ? ` · ${f.amount}` : ''}
            </Text>
            {rule && <Text size="xs" c="dimmed">{rule}</Text>}
            {f.detail && <Text size="sm" c="dimmed">{f.detail}</Text>}
            {quote && (
              <Text size="xs" c="dimmed" fs="italic" lineClamp={3}>
                “{quote.text}”
              </Text>
            )}
            {original && <Text size="xs" c="dimmed">Corrects: {original.title}</Text>}
            {sourceLine(f)}
            {marks.filter(m => m.handles!.factId === f.id).map(m => (
              <Group key={m.id} gap={6}>
                <Text size="xs" c={isDeclined(m) ? 'dimmed' : 'green'}>
                  {isDeclined(m) ? '✕' : '✓'} {friendlyDate(m.handles!.occurrenceDate)} {isDeclined(m) ? 'declined' : 'handled'} by{' '}
                  {name(m.source.kind === 'app' ? m.source.userId : m.createdBy)} on {friendlyDate(m.createdAt.slice(0, 10))}
                  {m.detail ? ` — ${m.detail}` : ''}
                </Text>
                <Anchor component="button" size="xs" onClick={() => props.onUnmark(m.id)}>undo</Anchor>
              </Group>
            ))}
          </Stack>
          {(isUser || canCorrect) && (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" aria-label={`Actions for "${f.title}"`}>
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {isUser && <Menu.Item onClick={() => props.onEdit(f)}>Edit</Menu.Item>}
                {isUser && (
                  <Menu.Item color="red" onClick={() => props.onDelete(f)}>
                    {original ? 'Delete correction (use the document again)' : 'Delete'}
                  </Menu.Item>
                )}
                {canCorrect && <Menu.Item onClick={() => props.onCorrect(f)}>Correct this…</Menu.Item>}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Card>
    );
  };

  /** "3 facts · next Dec 16, 2026": the soonest date still ahead among facts that count. */
  const summary = (list: LedgerFact[]): string => {
    const next = list
      .filter(f => f.status === 'active' && !correctedBy.has(f.id))
      .map(f => scheduleSortKey(f.schedule))
      .filter(d => d >= today && !d.startsWith('9999'))
      .sort()[0];
    const count = `${list.length} ${list.length === 1 ? 'fact' : 'facts'}`;
    return next ? `${count} · next ${friendlyDate(next)}` : count;
  };

  return (
    <Accordion multiple value={opened} onChange={setOpened} variant="separated" chevronPosition="left">
      {subjects.map(subject => {
        const muted = mutedSubjects.includes(subject);
        const list = bySubject.get(subject)!;
        return (
          <Accordion.Item key={subject} value={subject}>
            <Group wrap="nowrap" gap={0} pr="sm">
              <Accordion.Control>
                <Text fw={600}>{subject}</Text>
                <Text size="xs" c="dimmed">{summary(list)}</Text>
              </Accordion.Control>
              <Tooltip label={muted ? 'Notifications off for you — turn on' : 'Turn off notifications for you (still listed here)'}>
                <ActionIcon variant="subtle" color={muted ? 'gray' : 'blue'} aria-label={muted ? `Unmute ${subject}` : `Mute ${subject}`} onClick={() => onToggleMute(subject, !muted)}>
                  {muted ? <IconBellOff size={18} /> : <IconBell size={18} />}
                </ActionIcon>
              </Tooltip>
            </Group>
            <Accordion.Panel>
              <Stack gap="sm">
                {[...list]
                  .sort((a, b) => scheduleSortKey(a.schedule).localeCompare(scheduleSortKey(b.schedule)))
                  .map(row)}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
}
