/**
 * BusinessStatements — the statement generator + history page.
 *
 * Only reachable inside a business workspace (MantineLayout.tsx nav gating,
 * Phase 2.3 / App.tsx RouteErrorBoundary).
 *
 * This page is intentionally thin: it composes StatementGenerator,
 * StatementHistoryTable, and StatementHeaderConfigForm. All domain logic
 * and data-fetching live in those components (<200 LOC budget for this file).
 */
import { Container, Stack, Title, Group, Tabs } from '@mantine/core';
import { IconFileInvoice, IconHistory, IconSettings } from '@tabler/icons-react';
import { StatementGenerator } from '../components/business/StatementGenerator';
import { StatementHistoryTable } from '../components/business/StatementHistoryTable';
import { StatementHeaderConfigForm } from '../components/business/StatementHeaderConfigForm';

export function BusinessStatements() {
  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group gap="sm">
          <IconFileInvoice size={32} />
          <Title order={1}>Client Statements</Title>
        </Group>

        <Tabs defaultValue="generate">
          <Tabs.List>
            <Tabs.Tab value="generate" leftSection={<IconFileInvoice size={16} />}>
              Generate
            </Tabs.Tab>
            <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>
              History
            </Tabs.Tab>
            <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>
              Header Settings
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="generate" pt="lg">
            <StatementGenerator />
          </Tabs.Panel>

          <Tabs.Panel value="history" pt="lg">
            <StatementHistoryTable />
          </Tabs.Panel>

          <Tabs.Panel value="settings" pt="lg">
            <StatementHeaderConfigForm />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}
