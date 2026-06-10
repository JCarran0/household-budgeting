/**
 * StatementPreview — on-screen rendering of the page-1 statement layout.
 *
 * Renders the business + client header, the royalty table (disbursement date,
 * payout, commission, royalty), royalty subtotal, the "Other fees & charges"
 * lines (all subtypes incl. $0), and the remittance total.
 *
 * Uses the persisted statement's stored values — no recalculation here.
 */
import { Stack, Group, Text, Table, Divider, Box, Title } from '@mantine/core';
import type { BusinessStatement } from '../../../../shared/types';
import { DEFAULT_STATEMENT_NOTES } from '../../../../shared/utils/businessStatementCalc';

interface StatementPreviewProps {
  statement: BusinessStatement;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  // Parse YYYY-MM-DD as local date (avoid UTC shift)
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function StatementPreview({ statement }: StatementPreviewProps) {
  const { clientHeader, lineItems, royaltySubtotal, charges, remittanceTotal } = statement;
  // Legacy statements snapshotted before footer notes existed have no notes;
  // fall back to the standard footer. An explicit '' (cleared) stays omitted.
  const notes = clientHeader.notes ?? DEFAULT_STATEMENT_NOTES;

  return (
    <Stack gap="lg" p="md" style={{ fontFamily: 'serif', maxWidth: 760 }}>
      {/* Header block */}
      <Group justify="space-between" align="flex-start">
        <Box>
          <Title order={4}>{clientHeader.businessName}</Title>
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-line' }}>
            {clientHeader.businessAddress}
          </Text>
        </Box>
        <Box ta="right">
          <Text fw={700}>Statement of Account</Text>
          <Text size="sm">
            Payment #{String(statement.paymentNumber).padStart(3, '0')}
          </Text>
          <Text size="sm">Period: {statement.periodMonth}</Text>
          <Text size="sm">Date: {formatDate(statement.paymentDate)}</Text>
        </Box>
      </Group>

      <Divider />

      {/* Client identity */}
      <Box>
        <Text fw={600} mb={4}>Prepared for:</Text>
        <Text>{clientHeader.clientName}</Text>
        {clientHeader.clientCompany && <Text size="sm">{clientHeader.clientCompany}</Text>}
        <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-line' }}>
          {clientHeader.clientAddress}
        </Text>
      </Box>

      <Divider />

      {/* Royalty table */}
      <Box>
        <Text fw={600} mb={8}>Royalty Disbursements</Text>
        <Table striped withTableBorder withColumnBorders fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Disbursement Date</Table.Th>
              <Table.Th ta="right">Payout</Table.Th>
              <Table.Th ta="right">Commission ({(statement.commissionRate * 100).toFixed(0)}%)</Table.Th>
              <Table.Th ta="right">Royalty</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lineItems.map((item) => (
              <Table.Tr key={item.transactionId}>
                <Table.Td>{formatDate(item.disbursementDate)}</Table.Td>
                <Table.Td ta="right">{formatMoney(item.payout)}</Table.Td>
                <Table.Td ta="right">{formatMoney(item.commission)}</Table.Td>
                <Table.Td ta="right">{formatMoney(item.royalty)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>

      {/* Royalty subtotal */}
      <Group justify="flex-end">
        <Text fw={700}>Royalty Subtotal: {formatMoney(royaltySubtotal)}</Text>
      </Group>

      <Divider />

      {/* Other fees & charges */}
      <Box>
        <Text fw={600} mb={8}>Other Fees &amp; Charges</Text>
        <Table withTableBorder withColumnBorders fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Description</Table.Th>
              <Table.Th ta="right">Amount</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {charges.map((charge) => (
              <Table.Tr key={charge.subType}>
                <Table.Td>{charge.label}</Table.Td>
                <Table.Td ta="right">{formatMoney(charge.amount)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>

      <Divider />

      {/* Remittance total */}
      <Group justify="flex-end">
        <Text fz="lg" fw={700} c="teal">
          Remittance Total: {formatMoney(remittanceTotal)}
        </Text>
      </Group>

      {/* Footer notes */}
      {notes && (
        <>
          <Divider />
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-line' }}>
            {notes}
          </Text>
        </>
      )}
    </Stack>
  );
}
