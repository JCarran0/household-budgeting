import { ActionIcon, Anchor, Badge, Group, Menu, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlarmSnooze, IconCheck, IconChecklist } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { HeadsUpItem } from '../../../../shared/types';
import { addOffset } from '../../../../shared/utils/ledgerDates';
import { useLedger } from '../../hooks/useLedger';
import { PHASE_COLOR, PHASE_LABEL, isHandleable, whenText } from './ledgerFormat';

interface HeadsUpListProps {
  items: HeadsUpItem[];
  today: string;
  /** Link each title to its fact on the Household page (the dashboard card does; the page itself does not). */
  linkToFacts?: boolean;
}

/**
 * REQ-H052. Done is shared with the household; snooze hides the item for the
 * person who snoozed only; make-a-task hands ownership to the task board.
 */
export function HeadsUpList({ items, today, linkToFacts = false }: HeadsUpListProps) {
  const { markHandled, snooze, makeTask } = useLedger({ enabled: false });

  const snoozeOptions = (item: HeadsUpItem) => {
    const options = [
      { label: 'For 3 days', until: addOffset(today, { days: 3 }) },
      { label: 'For a week', until: addOffset(today, { days: 7 }) },
    ];
    // Snoozing past the date would hide the last chance to act on it.
    const weekBefore = addOffset(item.dueDate, { days: -7 });
    if (weekBefore > addOffset(today, { days: 7 })) options.push({ label: 'Until a week before', until: weekBefore });
    return options.filter(o => o.until > today);
  };

  return (
    <Stack gap="sm">
      {items.map(item => (
        <Group key={item.occurrenceKey} justify="space-between" wrap="nowrap" align="flex-start">
          <div style={{ minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              <Badge size="xs" color={PHASE_COLOR[item.phase]} variant="light">{PHASE_LABEL[item.phase]}</Badge>
              <Text size="xs" c="dimmed" truncate>{item.subject}</Text>
            </Group>
            {linkToFacts ? (
              <Anchor component={Link} to={`/household?factId=${encodeURIComponent(item.factId)}`} size="sm" fw={500} lineClamp={2} c="inherit">
                {item.title}
              </Anchor>
            ) : (
              <Text size="sm" fw={500} lineClamp={2}>{item.title}</Text>
            )}
            <Text size="xs" c={item.phase === 'overdue' ? 'red' : 'dimmed'}>{whenText(item)}</Text>
          </div>
          <Group gap={4} wrap="nowrap">
            {isHandleable(item.kind) && (
              <Tooltip label="Done — marks it handled for both of you">
                <ActionIcon
                  variant="light"
                  color="green"
                  aria-label={`Mark "${item.title}" handled`}
                  loading={markHandled.isPending && markHandled.variables?.factId === item.factId}
                  onClick={() => markHandled.mutate({ factId: item.factId, occurrenceDate: item.dueDate })}
                >
                  <IconCheck size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            {item.phase !== 'expired' && (
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <Tooltip label="Snooze for you only">
                    <ActionIcon variant="light" color="gray" aria-label={`Snooze "${item.title}"`}>
                      <IconAlarmSnooze size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  {snoozeOptions(item).map(o => (
                    <Menu.Item key={o.label} onClick={() => snooze.mutate({ key: item.occurrenceKey, until: o.until })}>
                      {o.label}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
            {isHandleable(item.kind) && (
              <Tooltip label="Make a task — completing it marks this handled">
                <ActionIcon
                  variant="light"
                  aria-label={`Make a task for "${item.title}"`}
                  loading={makeTask.isPending && makeTask.variables?.factId === item.factId}
                  onClick={() => makeTask.mutate({ factId: item.factId, occurrenceDate: item.dueDate })}
                >
                  <IconChecklist size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      ))}
    </Stack>
  );
}
