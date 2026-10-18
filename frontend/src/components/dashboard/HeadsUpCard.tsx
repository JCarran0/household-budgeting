import { Anchor, Card, Group, Text, ThemeIcon } from '@mantine/core';
import { IconCalendarDue } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useLedger } from '../../hooks/useLedger';
import { HeadsUpList } from '../household/HeadsUpList';

const MAX_ON_DASHBOARD = 5;

/**
 * Dashboard Heads-up card (HOUSEHOLD-LEDGER-BRD REQ-H052). Renders nothing
 * when nothing needs attention, or when the ledger is unavailable (the
 * business workspace is refused by the API) — the dashboard is not the place
 * to explain either.
 */
export function HeadsUpCard() {
  const { query } = useLedger();
  const view = query.data;
  if (!view || view.headsUp.length === 0) return null;

  const items = view.headsUp.slice(0, MAX_ON_DASHBOARD);
  const more = view.headsUp.length - items.length;

  return (
    <Card padding="lg" radius="md" withBorder>
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <ThemeIcon variant="light" color="yellow" radius="md">
            <IconCalendarDue size={18} />
          </ThemeIcon>
          <Text fw={600}>Heads-up</Text>
        </Group>
        <Anchor component={Link} to="/household" size="sm">
          {more > 0 ? `${more} more on Household` : 'Household'}
        </Anchor>
      </Group>
      <HeadsUpList items={items} today={view.today} linkToFacts />
    </Card>
  );
}
