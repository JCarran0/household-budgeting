import { useState } from 'react';
import { Table, Select, Button, Group, Text, Stack, Badge, ScrollArea } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useCategoryOptions } from '../../hooks/useCategoryOptions';
import { formatCurrency } from '../../utils/formatters';
import type { ClassificationBucket } from '../../../../shared/types';

interface BucketReviewStepProps {
  bucket: ClassificationBucket;
  bucketIndex: number;
  totalBuckets: number;
  onApply: (selections: { transactionId: string; categoryId: string }[]) => void;
  onSkip: () => void;
  isApplying: boolean;
}

export function BucketReviewStep({
  bucket,
  bucketIndex,
  totalBuckets,
  onApply,
  onSkip,
  isApplying,
}: BucketReviewStepProps) {
  const { options: categoryOptions } = useCategoryOptions({ includeUncategorized: false });

  // Track per-row category selections (default to AI suggestion)
  const [selections, setSelections] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    bucket.transactions.forEach(t => {
      if (t.selectedCategoryId) map.set(t.id, t.selectedCategoryId);
    });
    return map;
  });

  const handleCategoryChange = (transactionId: string, categoryId: string | null) => {
    setSelections(prev => {
      const next = new Map(prev);
      if (categoryId) {
        next.set(transactionId, categoryId);
      } else {
        next.delete(transactionId);
      }
      return next;
    });
  };

  const handleApply = () => {
    const results = bucket.transactions
      .map(t => ({
        transactionId: t.id,
        categoryId: selections.get(t.id) || t.suggestedCategoryId,
      }))
      .filter(r => r.categoryId);
    onApply(results);
  };

  const isUnsure = bucket.categoryId === '';
  const confidenceColor = bucket.confidence === 'high' ? 'green' : bucket.confidence === 'medium' ? 'yellow' : 'gray';

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text size="lg" fw={600}>
            {isUnsure
              ? 'These transactions need your help'
              : `Categorize as "${bucket.categoryName}"?`}
          </Text>
          <Text size="sm" c="dimmed">
            {bucket.transactions.length} transaction{bucket.transactions.length !== 1 ? 's' : ''} — {formatCurrency(bucket.totalAmount)}
          </Text>
        </div>
        <Group gap="xs">
          <Badge color={confidenceColor} variant="light">
            {bucket.confidence} confidence
          </Badge>
          <Text size="sm" c="dimmed">
            {bucketIndex + 1} of {totalBuckets}
          </Text>
        </Group>
      </Group>

      <ScrollArea h={350}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
              <Table.Th>Category</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {bucket.transactions.map(t => (
              <Table.Tr key={t.id}>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{t.date}</Table.Td>
                <Table.Td>
                  <Text size="sm" lineClamp={1}>{t.name}</Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {formatCurrency(Math.abs(t.amount))}
                </Table.Td>
                <Table.Td style={{ minWidth: 200 }}>
                  <Select
                    size="xs"
                    data={categoryOptions}
                    value={selections.get(t.id) || t.suggestedCategoryId || null}
                    onChange={(v) => handleCategoryChange(t.id, v)}
                    searchable
                    clearable={isUnsure}
                    placeholder={isUnsure ? 'Select category...' : undefined}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={onSkip} disabled={isApplying}>
          Skip
        </Button>
        <Button
          leftSection={<IconCheck size={16} />}
          onClick={handleApply}
          loading={isApplying}
        >
          Apply {bucket.transactions.length} categorization{bucket.transactions.length !== 1 ? 's' : ''}
        </Button>
      </Group>
    </Stack>
  );
}
