import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconHistory, IconArrowBackUp } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { ActivityEntry, ActivityRow, UndoOutcome } from '../../lib/api/aiActivity';

/**
 * AI activity log — AI-CAPABILITY-PLATFORM-BRD §6.3 (REQ-P037, REQ-P038).
 *
 * Supersedes AI-CHAT-ACTIONS-BRD D-14, which deliberately did not persist
 * action outcomes because every write required a click and stayed visible in
 * the conversation. Plan cards broke that: forty rows approved in one click
 * are not forty things anyone watched happen, and a refresh took the only
 * record with it.
 *
 * WHY EVERY ROW IS LISTED RATHER THAN JUST THE BATCH:
 * §5.2's legibility argument applies here too. "Applied 38 changes" is a
 * summary the user cannot check. The rows are what make the log an account of
 * what happened rather than an assertion that something did.
 *
 * A skipped undo is reported per-row and NOT as a failure, because skipping is
 * the correct behaviour: REQ-P027 says a record edited after the AI touched it
 * is left alone. That has to read as "we protected your edit", not as an error.
 */

const PAGE_SIZE = 25;

/**
 * Resource deep-links are MIXED: task and transaction rows carry an in-app
 * path, but submit_github_issue carries an absolute URL that came back from
 * GitHub's API. So this applies the same rule as ChatMessageBubble — an
 * off-site destination is rendered with its host in plain sight, and anything
 * that is neither a relative path nor http(s) is rendered as text, not a link.
 */
function ResourceLink({ row }: { row: ActivityRow }) {
  const href = row.resource.url;
  if (!href) return <>{row.resource.label}</>;

  if (href.startsWith('/') && !href.startsWith('//')) {
    return (
      <Anchor component={Link} to={href} size="xs">
        {row.resource.label}
      </Anchor>
    );
  }

  let host: string;
  try {
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return <>{row.resource.label}</>;
    host = url.hostname;
  } catch {
    return <>{row.resource.label}</>;
  }

  return (
    <>
      <Anchor href={href} target="_blank" rel="noopener noreferrer nofollow" size="xs">
        {row.resource.label}
      </Anchor>
      <Text span size="xs" c="dimmed">
        {' '}
        ({host})
      </Text>
    </>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Plain-language summary of an undo attempt, per row. */
function summarizeOutcomes(outcomes: UndoOutcome[]): { message: string; color: string } {
  const undone = outcomes.filter(o => o.status === 'undone').length;
  const skipped = outcomes.filter(
    o => o.status === 'skipped_modified' || o.status === 'skipped_missing',
  );
  const blocked = outcomes.filter(o => o.status === 'not_undoable').length;

  const parts: string[] = [];
  if (undone > 0) parts.push(`${undone} reversed`);
  if (skipped.length > 0) parts.push(`${skipped.length} left alone`);
  if (blocked > 0) parts.push(`${blocked} could not be reversed`);

  if (undone === 0 && skipped.length > 0) {
    // Not a failure: the records changed after the AI touched them, and
    // leaving them alone is the protection working.
    return {
      message: `${skipped[0].detail ?? 'Left alone — it changed since then.'}`,
      color: 'yellow',
    };
  }
  return { message: parts.join(', ') || 'Nothing to reverse', color: undone > 0 ? 'green' : 'gray' };
}

export function AiActivitySection() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setEntries(await api.getAiActivity({ limit: PAGE_SIZE }));
    } catch {
      setError('Could not load recent AI changes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUndo = async (entry: ActivityEntry) => {
    setUndoingId(entry.entryId);
    try {
      const result = await api.undoAiActivityEntry(entry.entryId);
      const { message, color } = summarizeOutcomes(result.outcomes);
      notifications.show({ message, color });
      await load();
    } catch {
      notifications.show({ message: 'Could not reverse that change.', color: 'red' });
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <Card withBorder padding="lg">
      <Group gap="xs" mb="xs">
        <IconHistory size={20} />
        <Title order={4}>Helper Bot activity</Title>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Everything Helper Bot has changed, and how to put it back. Changes you or your
        spouse edited afterwards are left alone rather than overwritten.
      </Text>

      {loading && (
        <Center py="md">
          <Loader size="sm" />
        </Center>
      )}

      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}

      {!loading && !error && entries.length === 0 && (
        <Text size="sm" c="dimmed">
          Helper Bot hasn&apos;t changed anything yet.
        </Text>
      )}

      <Stack gap="sm">
        {entries.map(entry => {
          const anyUndoable = entry.rows.some(r => r.undoable);
          return (
            <Card key={entry.entryId} withBorder padding="sm" radius="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
                  <Group gap="xs">
                    <Text size="sm" fw={500}>
                      {entry.rows.length} {entry.rows.length === 1 ? 'change' : 'changes'}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatWhen(entry.createdAt)}
                    </Text>
                    {entry.origin === 'unattended' && (
                      // REQ-P039: an unattended write must never look like one
                      // the user approved.
                      <Badge size="xs" color="orange" variant="light">
                        Automatic
                      </Badge>
                    )}
                  </Group>

                  {entry.rows.map(row => (
                    <Group key={row.rowId} gap="xs" wrap="nowrap">
                      <Text size="xs" c="dimmed" style={{ minWidth: 0 }}>
                        <ResourceLink row={row} />
                        {' — '}
                        {row.displaySummary}
                      </Text>
                      {row.undoneAt && (
                        <Badge size="xs" color="gray" variant="light">
                          Reversed
                        </Badge>
                      )}
                      {!row.undoable && !row.undoneAt && row.undoUnavailableReason && (
                        <Badge size="xs" color="gray" variant="outline">
                          Can&apos;t reverse
                        </Badge>
                      )}
                    </Group>
                  ))}
                </Stack>

                {anyUndoable && (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconArrowBackUp size={14} />}
                    loading={undoingId === entry.entryId}
                    onClick={() => void handleUndo(entry)}
                  >
                    Undo
                  </Button>
                )}
              </Group>
            </Card>
          );
        })}
      </Stack>
    </Card>
  );
}
