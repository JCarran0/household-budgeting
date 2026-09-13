import { useMemo } from 'react';
import {
  Table,
  Text,
  Paper,
  Badge,
  Tooltip,
  Group,
  Code,
  Stack,
  Alert,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { formatCurrency } from '../../utils/formatters';
import { computeAllocationHint } from '../../../../shared/utils/projectHelpers';
import type { ProjectSummary } from '../../../../shared/types';

export interface LineItemDrillDown {
  lineItemName: string;
  lineItemTag: string;
  projectTag: string;
}

interface ProjectLineItemsProps {
  project: ProjectSummary;
  onLineItemClick: (drill: LineItemDrillDown) => void;
}

/**
 * The project-management axis: itemized estimates with their tag-matched actuals.
 *
 * Deliberately prints NO total for the Actual column. Matching is naive — a
 * transaction carrying two line item tags counts fully toward both — so the
 * column can legitimately exceed Total Spend and a sum would misrepresent it
 * (BRD §5.5.5). "Unattributed" is shown instead, which is well-defined.
 */
export function ProjectLineItems({ project, onLineItemClick }: ProjectLineItemsProps) {
  const spendingByItemId = useMemo(() => {
    const map = new Map<string, { actual: number; matchCount: number }>();
    for (const row of project.lineItemSpending ?? []) {
      map.set(row.lineItemId, { actual: row.actual, matchCount: row.matchCount });
    }
    return map;
  }, [project.lineItemSpending]);

  const lineItems = project.lineItems ?? [];

  const hint =
    project.totalBudget !== null
      ? computeAllocationHint(project.totalBudget, lineItems, formatCurrency)
      : null;

  if (lineItems.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No line items yet. Edit the project to add itemized estimates, then tag
        the matching transactions to track actual spend against them.
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      <Paper withBorder p="xs">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Item</Table.Th>
              <Table.Th ta="right">Estimated</Table.Th>
              <Table.Th ta="right">Actual</Table.Th>
              <Table.Th ta="right">Variance</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lineItems.map((li) => {
              const spend = spendingByItemId.get(li.id);
              const actual = spend?.actual ?? 0;
              const matched = (spend?.matchCount ?? 0) > 0;
              const variance = li.estimatedCost - actual;

              return (
                <Table.Tr
                  key={li.id}
                  style={{ cursor: matched ? 'pointer' : 'default' }}
                  onClick={
                    matched
                      ? () =>
                          onLineItemClick({
                            lineItemName: li.name,
                            lineItemTag: li.tag,
                            projectTag: project.tag,
                          })
                      : undefined
                  }
                >
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Tooltip label={li.notes ?? ''} disabled={!li.notes}>
                        <Text size="sm">{li.name}</Text>
                      </Tooltip>
                      <Code style={{ fontSize: 10 }}>{li.tag}</Code>
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" c="dimmed">
                      {formatCurrency(li.estimatedCost, true)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    {matched ? (
                      <Text size="sm">{formatCurrency(actual, true)}</Text>
                    ) : (
                      <Badge size="xs" variant="light" color="gray">
                        not yet purchased
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    {matched ? (
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

      {hint?.label && (
        <Text size="xs" c={hint.kind === 'over' ? 'orange' : 'dimmed'}>
          {hint.label} (estimates vs. total budget)
        </Text>
      )}

      {project.unattributedSpent !== 0 && (
        <Alert
          variant="light"
          color="gray"
          icon={<IconInfoCircle size={14} />}
          p="xs"
        >
          <Text size="xs">
            <strong>{formatCurrency(project.unattributedSpent, true)}</strong> of
            project spend carries none of these tags. Tag those transactions to
            attribute them to a line item.
          </Text>
        </Alert>
      )}
    </Stack>
  );
}
