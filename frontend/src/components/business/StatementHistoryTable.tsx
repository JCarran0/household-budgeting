/**
 * StatementHistoryTable — list of past statements with view / export-PDF /
 * export-CSV actions.
 *
 * Fetches GET /business/statements via React Query. The PDF export is
 * lazy-loaded (dynamic import) so @react-pdf/renderer does not bloat the
 * main bundle for the personal app.
 */
import { useState } from 'react';
import {
  Stack,
  Table,
  Text,
  Button,
  Group,
  Loader,
  Center,
  Alert,
  Modal,
  ScrollArea,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconEye, IconFileTypeCsv, IconFileTypePdf, IconTrash } from '@tabler/icons-react';
import { api } from '../../lib/api';
import { exportStatementToCSV } from '../../utils/statementCsv';
import { StatementPreview } from './StatementPreview';
import type { BusinessStatement } from '../../../../shared/types';

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function StatementHistoryTable() {
  const queryClient = useQueryClient();
  const [viewTarget, setViewTarget] = useState<BusinessStatement | null>(null);
  const [viewOpened, { open: openView, close: closeView }] = useDisclosure(false);
  const [deleteTarget, setDeleteTarget] = useState<BusinessStatement | null>(null);
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null); // id of statement being exported

  const { data: statements, isLoading, error } = useQuery({
    queryKey: ['businessStatements'],
    queryFn: () => api.getStatements(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteStatement(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['businessStatements'] });
      notifications.show({
        title: 'Statement Deleted',
        message: 'The statement was removed; its number is free again if nothing higher remains.',
        color: 'green',
      });
      closeDelete();
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      notifications.show({
        title: 'Delete Failed',
        message: err instanceof Error ? err.message : 'Could not delete statement',
        color: 'red',
      });
    },
  });

  const handleView = (statement: BusinessStatement) => {
    setViewTarget(statement);
    openView();
  };

  const handleDelete = (statement: BusinessStatement) => {
    setDeleteTarget(statement);
    openDelete();
  };

  const handleCSV = (statement: BusinessStatement) => {
    exportStatementToCSV(statement);
  };

  const handlePDF = async (statement: BusinessStatement) => {
    setPdfLoading(statement.id);
    try {
      // Lazy-load @react-pdf/renderer so it doesn't bloat the main bundle
      const { pdf } = await import('@react-pdf/renderer');
      const { StatementPdf } = await import('./StatementPdf');

      // StatementPdf renders a <Document> at its root, satisfying the runtime
      // contract. The type mismatch is a library gap (pdf() expects
      // ReactElement<DocumentProps> but our component wraps it with own props).
      // Using Parameters<typeof pdf>[0] as the cast target avoids importing the
      // private DocumentProps type directly.
      const { createElement } = await import('react');
      type PdfInput = Parameters<typeof pdf>[0];
      const element = createElement(StatementPdf, { statement }) as unknown as PdfInput;
      const blob = await pdf(element).toBlob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `statement-${String(statement.paymentNumber).padStart(3, '0')}-${statement.periodMonth}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      notifications.show({
        title: 'PDF Exported',
        message: `Statement #${statement.paymentNumber} exported to PDF`,
        color: 'green',
      });
    } catch (err) {
      notifications.show({
        title: 'PDF Export Failed',
        message: err instanceof Error ? err.message : 'Could not generate PDF',
        color: 'red',
      });
    } finally {
      setPdfLoading(null);
    }
  };

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  if (error) {
    return (
      <Alert color="red" icon={<IconAlertTriangle size={16} />}>
        Failed to load statements:{' '}
        {error instanceof Error ? error.message : 'Unknown error'}
      </Alert>
    );
  }

  if (!statements || statements.length === 0) {
    return (
      <Center py="xl">
        <Text c="dimmed" size="sm">
          No statements yet. Generate your first statement above.
        </Text>
      </Center>
    );
  }

  return (
    <>
      <Stack gap="md">
        <Title order={3}>Statement History</Title>
        <Table withTableBorder withColumnBorders striped fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Payment #</Table.Th>
              <Table.Th>Period</Table.Th>
              <Table.Th>Payment Date</Table.Th>
              <Table.Th ta="right">Remittance</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {statements.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>#{String(s.paymentNumber).padStart(3, '0')}</Table.Td>
                <Table.Td>{s.periodMonth}</Table.Td>
                <Table.Td>{s.paymentDate}</Table.Td>
                <Table.Td ta="right" fw={600}>
                  {formatMoney(s.remittanceTotal)}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconEye size={14} />}
                      onClick={() => handleView(s)}
                    >
                      View
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="teal"
                      leftSection={<IconFileTypeCsv size={14} />}
                      onClick={() => handleCSV(s)}
                    >
                      CSV
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="red"
                      leftSection={<IconFileTypePdf size={14} />}
                      loading={pdfLoading === s.id}
                      onClick={() => void handlePDF(s)}
                    >
                      PDF
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => handleDelete(s)}
                    >
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>

      {/* View modal */}
      <Modal
        opened={viewOpened}
        onClose={closeView}
        title={viewTarget ? `Statement #${String(viewTarget.paymentNumber).padStart(3, '0')} — ${viewTarget.periodMonth}` : 'Statement'}
        size="xl"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        {viewTarget && <StatementPreview statement={viewTarget} />}
      </Modal>

      {/* Delete confirmation */}
      <Modal
        opened={deleteOpened}
        onClose={closeDelete}
        title="Delete statement?"
        size="md"
      >
        <Stack gap="md">
          <Text size="sm">
            Permanently delete statement{' '}
            <Text span fw={600}>
              #{deleteTarget ? String(deleteTarget.paymentNumber).padStart(3, '0') : ''}
            </Text>{' '}
            ({deleteTarget?.periodMonth})? If you have already sent it to the client, your
            records will no longer match theirs. Its payment number becomes available again
            only if no higher-numbered statement remains.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDelete}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
