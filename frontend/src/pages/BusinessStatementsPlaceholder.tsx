/**
 * BusinessStatementsPlaceholder — Phase 2.3
 *
 * Dark-launched placeholder for the /business/statements route. The route
 * exists so the nav item can link without a 404, and so the RouteErrorBoundary
 * is in place before the real Statement UI ships (PR4/PR5). This page is only
 * reachable from within a business workspace.
 */
import { Center, Stack, Text, Title } from '@mantine/core';
import { IconFileInvoice } from '@tabler/icons-react';

export function BusinessStatementsPlaceholder() {
  return (
    <Center h="60vh">
      <Stack align="center" gap="md">
        <IconFileInvoice size={48} color="gray" />
        <Title order={3} c="dimmed">Client Statements</Title>
        <Text c="dimmed" size="sm" ta="center" maw={360}>
          The statement generator is coming soon. Once available, you will be
          able to generate and export monthly client royalty statements from
          your tagged transactions.
        </Text>
      </Stack>
    </Center>
  );
}
