import { Paper, Table, Text } from '@mantine/core';
import type { TripSummary } from '../../../../shared/types';
import { formatCurrency } from '../../utils/formatters';

export interface TripDrillDownTarget {
  categoryId: string | null;
  categoryName: string;
  tripTag: string;
}

interface TripSpendingBreakdownProps {
  trip: TripSummary;
  onCategoryClick: (target: TripDrillDownTarget) => void;
}

/**
 * Category-level spending breakdown rendered on both the Trips accordion panel
 * (retrospective list view) and the Trip Detail page's Spending tab. Extracted
 * here so the two surfaces render the same content without drift.
 */
export function TripSpendingBreakdown({ trip, onCategoryClick }: TripSpendingBreakdownProps) {
  if (trip.categorySpending.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No categorized spending found for this trip.
      </Text>
    );
  }

  return (
    <Paper withBorder p="xs">
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Category</Table.Th>
            <Table.Th ta="right">Spent</Table.Th>
            <Table.Th ta="right">Budget</Table.Th>
            <Table.Th ta="right">Variance</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {trip.categorySpending.map((row) => {
            const variance = row.budgeted !== null ? row.budgeted - row.spent : null;
            return (
              <Table.Tr
                key={row.categoryId}
                style={{ cursor: 'pointer' }}
                onClick={() =>
                  onCategoryClick({
                    categoryId: row.categoryId === '__uncategorized__' ? null : row.categoryId,
                    categoryName: row.categoryName,
                    tripTag: trip.tag,
                  })
                }
              >
                <Table.Td>
                  <Text size="sm">{row.categoryName}</Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Text size="sm">{formatCurrency(row.spent, true)}</Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Text size="sm" c="dimmed">
                    {row.budgeted !== null ? formatCurrency(row.budgeted, true) : '—'}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  {variance !== null ? (
                    <Text size="sm" c={variance < 0 ? 'red' : 'green'}>
                      {variance < 0 ? '-' : '+'}
                      {formatCurrency(Math.abs(variance), true)}
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
