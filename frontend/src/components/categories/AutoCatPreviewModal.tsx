import { useState, useEffect } from 'react';
import {
  Stack,
  Group,
  Button,
  Text,
  Table,
  Badge,
  Checkbox,
  Tooltip,
  ThemeIcon,
  Divider,
  ScrollArea,
} from '@mantine/core';
import { ResponsiveModal } from '../ResponsiveModal';
import { IconEye, IconArrowRight } from '@tabler/icons-react';
import { format } from 'date-fns';
import { formatCurrency } from '../../utils/formatters';

export interface TransactionChange {
  transactionId: string;
  date: string;
  description: string;
  amount: number;
  oldCategoryId: string | null;
  oldCategoryName: string | null;
  newCategoryId: string;
  newCategoryName: string;
}

interface AutoCatPreviewModalProps {
  opened: boolean;
  onClose: () => void;
  changes: TransactionChange[];
  counts: {
    wouldCategorize: number;
    wouldRecategorize: number;
  };
  onApply: (selectedTransactionIds: string[] | undefined) => void;
  applyLoading: boolean;
}

export function AutoCatPreviewModal({
  opened,
  onClose,
  changes,
  counts,
  onApply,
  applyLoading,
}: AutoCatPreviewModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset selection to all when changes update
  useEffect(() => {
    if (opened && changes.length > 0) {
      setSelectedIds(new Set(changes.map(c => c.transactionId)));
    }
  }, [opened, changes]);

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={
        <Group gap="xs">
          <ThemeIcon variant="light" size="sm">
            <IconEye size={14} />
          </ThemeIcon>
          <Text fw={600}>Preview Categorization Changes</Text>
        </Group>
      }
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="md">
        <div>
          {counts.wouldCategorize > 0 && (
            <Text size="sm">
              <Text span fw={600}>{counts.wouldCategorize}</Text> transaction{counts.wouldCategorize !== 1 ? 's' : ''} will be categorized
            </Text>
          )}
          {counts.wouldRecategorize > 0 && (
            <Text size="sm" c="yellow">
              <Text span fw={600}>{counts.wouldRecategorize}</Text> transaction{counts.wouldRecategorize !== 1 ? 's' : ''} will be recategorized
            </Text>
          )}
        </div>

        <Divider />

        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40}>
                <Checkbox
                  checked={selectedIds.size === changes.length}
                  indeterminate={selectedIds.size > 0 && selectedIds.size < changes.length}
                  onChange={() => {
                    if (selectedIds.size === changes.length) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(changes.map(c => c.transactionId)));
                    }
                  }}
                  aria-label="Select all"
                />
              </Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
              <Table.Th>Current</Table.Th>
              <Table.Th />
              <Table.Th>New Category</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {changes.map((change) => (
              <Table.Tr
                key={change.transactionId}
                style={{ opacity: selectedIds.has(change.transactionId) ? 1 : 0.5 }}
              >
                <Table.Td>
                  <Checkbox
                    checked={selectedIds.has(change.transactionId)}
                    onChange={(e) => {
                      const isChecked = e.currentTarget.checked;
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        if (isChecked) {
                          next.add(change.transactionId);
                        } else {
                          next.delete(change.transactionId);
                        }
                        return next;
                      });
                    }}
                    aria-label={`Select ${change.description}`}
                  />
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{format(new Date(change.date + 'T00:00:00'), 'MMM dd')}</Text>
                </Table.Td>
                <Table.Td>
                  <Tooltip label={change.description} disabled={change.description.length <= 30}>
                    <Text size="sm" truncate maw={200}>{change.description}</Text>
                  </Tooltip>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Text size="sm">{formatCurrency(Math.abs(change.amount))}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {change.oldCategoryName ?? 'Uncategorized'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <IconArrowRight size={14} style={{ opacity: 0.5 }} />
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" size="sm">{change.newCategoryName}</Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>

        <Divider />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={applyLoading}
            disabled={selectedIds.size === 0}
            onClick={() => {
              const ids = selectedIds.size === changes.length
                ? undefined
                : Array.from(selectedIds);
              onApply(ids);
            }}
          >
            Apply {selectedIds.size} Change{selectedIds.size !== 1 ? 's' : ''}
          </Button>
        </Group>
      </Stack>
    </ResponsiveModal>
  );
}
