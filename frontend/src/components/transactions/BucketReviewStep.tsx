import { useState } from 'react';
import { Table, Select, Button, Group, Text, TextInput, Stack, Badge, ScrollArea, ActionIcon, Tooltip } from '@mantine/core';
import { IconCheck, IconX, IconArrowBackUp } from '@tabler/icons-react';
import { useCategoryOptions } from '../../hooks/useCategoryOptions';
import { formatCurrency } from '../../utils/formatters';
import type { ClassificationBucket } from '../../../../shared/types';

export interface BucketApplySelection {
  transactionId: string;
  categoryId: string;
  userDescription?: string;
}

interface BucketReviewStepProps {
  bucket: ClassificationBucket;
  bucketIndex: number;
  totalBuckets: number;
  onApply: (selections: BucketApplySelection[]) => void;
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

  // Track per-row description edits
  const [descriptionEdits, setDescriptionEdits] = useState<Map<string, string>>(new Map());

  // Track which rows the user has skipped within this bucket (won't be included in Apply)
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  const toggleSkip = (transactionId: string) => {
    setSkippedIds(prev => {
      const next = new Set(prev);
      if (next.has(transactionId)) next.delete(transactionId);
      else next.add(transactionId);
      return next;
    });
  };

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

  const handleDescriptionChange = (transactionId: string, value: string) => {
    setDescriptionEdits(prev => {
      const next = new Map(prev);
      next.set(transactionId, value);
      return next;
    });
  };

  const handleApply = () => {
    const results: BucketApplySelection[] = bucket.transactions
      .filter(t => !skippedIds.has(t.id))
      .map(t => {
        const edited = descriptionEdits.get(t.id);
        return {
          transactionId: t.id,
          categoryId: selections.get(t.id) || t.suggestedCategoryId,
          // Only include if the user actually changed it
          ...(edited !== undefined && edited !== t.name ? { userDescription: edited } : {}),
        };
      })
      .filter(r => r.categoryId);
    onApply(results);
  };

  const isUnsure = bucket.categoryId === '';
  const confidenceColor = bucket.confidence === 'high' ? 'green' : bucket.confidence === 'medium' ? 'yellow' : 'gray';
  const applyCount = bucket.transactions.length - skippedIds.size;

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
              <Table.Th style={{ width: 40 }} />
              <Table.Th>Date</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
              <Table.Th>Category</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {bucket.transactions.map(t => {
              const isSkipped = skippedIds.has(t.id);
              return (
                <Table.Tr key={t.id} style={{ opacity: isSkipped ? 0.45 : 1 }}>
                  <Table.Td>
                    <Tooltip label={isSkipped ? 'Include this transaction' : 'Skip this transaction'} withArrow>
                      <ActionIcon
                        size="sm"
                        variant={isSkipped ? 'light' : 'subtle'}
                        color={isSkipped ? 'orange' : 'gray'}
                        onClick={() => toggleSkip(t.id)}
                        aria-label={isSkipped ? 'Include this transaction' : 'Skip this transaction'}
                      >
                        {isSkipped ? <IconArrowBackUp size={14} /> : <IconX size={14} />}
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap', textDecoration: isSkipped ? 'line-through' : undefined }}>{t.date}</Table.Td>
                  <Table.Td>
                    <TextInput
                      size="xs"
                      variant="unstyled"
                      value={descriptionEdits.get(t.id) ?? t.name}
                      onChange={(e) => handleDescriptionChange(t.id, e.currentTarget.value)}
                      disabled={isSkipped}
                      styles={{ input: { fontSize: 'var(--mantine-font-size-sm)', textDecoration: isSkipped ? 'line-through' : undefined } }}
                    />
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right', whiteSpace: 'nowrap', textDecoration: isSkipped ? 'line-through' : undefined }}>
                    {formatCurrency(Math.abs(t.amount))}
                  </Table.Td>
                  <Table.Td style={{ minWidth: 200 }}>
                    <Select
                      size="xs"
                      data={categoryOptions}
                      value={selections.get(t.id) || t.suggestedCategoryId || null}
                      onChange={(v) => handleCategoryChange(t.id, v)}
                      disabled={isSkipped}
                      searchable
                      clearable={isUnsure}
                      placeholder={isUnsure ? 'Select category...' : undefined}
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Group justify="space-between">
        {skippedIds.size > 0 ? (
          <Text size="xs" c="dimmed">{skippedIds.size} skipped in this bucket</Text>
        ) : <span />}
        <Group gap="xs">
          <Button variant="subtle" color="gray" onClick={onSkip} disabled={isApplying}>
            Skip bucket
          </Button>
          <Button
            leftSection={<IconCheck size={16} />}
            onClick={handleApply}
            loading={isApplying}
            disabled={applyCount === 0}
          >
            Apply {applyCount} categorization{applyCount !== 1 ? 's' : ''}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
