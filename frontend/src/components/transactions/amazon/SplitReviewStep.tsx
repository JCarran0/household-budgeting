import { useState } from 'react';
import { Stack, Text, Paper, Group, Badge, Button, NumberInput, Select, Divider, Alert } from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { useCategoryOptions } from '../../../hooks/useCategoryOptions';
import type { AmazonSplitRecommendation, AmazonApplyAction } from '../../../../../shared/types';

interface SplitReviewStepProps {
  splitRecommendations: AmazonSplitRecommendation[];
  onComplete: (actions: AmazonApplyAction[]) => void;
  isProcessing: boolean;
}

interface EditableSplit {
  itemName: string;
  amount: number;
  categoryId: string;
  isEstimatedPrice: boolean;
}

export function SplitReviewStep({
  splitRecommendations,
  onComplete,
  isProcessing,
}: SplitReviewStepProps) {
  const { options: categoryOptions } = useCategoryOptions();

  // Track editable state per recommendation
  const [editState, setEditState] = useState<Record<string, EditableSplit[]>>(() => {
    const initial: Record<string, EditableSplit[]> = {};
    for (const sr of splitRecommendations) {
      initial[sr.matchId] = sr.splits.map(s => ({
        itemName: s.itemName,
        amount: s.estimatedAmount,
        categoryId: s.suggestedCategoryId,
        isEstimatedPrice: s.isEstimatedPrice,
      }));
    }
    return initial;
  });

  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const updateSplit = (matchId: string, index: number, field: 'amount' | 'categoryId', value: number | string) => {
    setEditState(prev => {
      const splits = [...(prev[matchId] || [])];
      splits[index] = { ...splits[index], [field]: value };
      return { ...prev, [matchId]: splits };
    });
  };

  const autoAdjustLast = (matchId: string, originalAmount: number) => {
    setEditState(prev => {
      const splits = [...(prev[matchId] || [])];
      if (splits.length < 2) return prev;
      const othersSum = splits.slice(0, -1).reduce((sum, s) => sum + s.amount, 0);
      splits[splits.length - 1] = {
        ...splits[splits.length - 1],
        amount: Math.round((originalAmount - othersSum) * 100) / 100,
      };
      return { ...prev, [matchId]: splits };
    });
  };

  const handleApply = () => {
    const actions: AmazonApplyAction[] = [];
    for (const sr of splitRecommendations) {
      if (skipped.has(sr.matchId)) {
        actions.push({ matchId: sr.matchId, type: 'skip' });
        continue;
      }
      const splits = editState[sr.matchId] || [];
      actions.push({
        matchId: sr.matchId,
        type: 'split',
        splits: splits.map(s => ({
          amount: s.amount,
          categoryId: s.categoryId,
          description: s.itemName,
        })),
      });
    }
    onComplete(actions);
  };

  if (splitRecommendations.length === 0) {
    return (
      <Stack gap="md">
        <Text c="dimmed">No multi-item orders to split.</Text>
        <Button onClick={() => onComplete([])}>Continue</Button>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text fw={500}>{splitRecommendations.length} split recommendation{splitRecommendations.length !== 1 ? 's' : ''}</Text>

      {splitRecommendations.map(sr => {
        const splits = editState[sr.matchId] || [];
        const total = splits.reduce((sum, s) => sum + s.amount, 0);
        const isBalanced = Math.abs(total - sr.originalAmount) < 0.01;
        const isSkipped = skipped.has(sr.matchId);

        return (
          <Paper key={sr.matchId} p="md" withBorder style={{ opacity: isSkipped ? 0.5 : 1 }}>
            <Group justify="space-between" mb="sm">
              <Text size="sm" fw={500}>
                Original: ${sr.originalAmount.toFixed(2)}
              </Text>
              <Group gap="xs">
                {isBalanced ? (
                  <Badge color="green" leftSection={<IconCheck size={12} />} size="sm">
                    Balanced
                  </Badge>
                ) : (
                  <Badge color="red" leftSection={<IconAlertCircle size={12} />} size="sm">
                    ${total.toFixed(2)} / ${sr.originalAmount.toFixed(2)}
                  </Badge>
                )}
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => autoAdjustLast(sr.matchId, sr.originalAmount)}
                >
                  Auto-adjust
                </Button>
              </Group>
            </Group>

            <Stack gap="xs">
              {splits.map((split, i) => (
                <Group key={i} gap="xs" wrap="nowrap">
                  <Text size="xs" style={{ flex: 1, minWidth: 120 }} lineClamp={1}>
                    {split.isEstimatedPrice ? '~' : ''}{split.itemName}
                  </Text>
                  <NumberInput
                    size="xs"
                    value={split.amount}
                    onChange={val => updateSplit(sr.matchId, i, 'amount', Number(val) || 0)}
                    min={0}
                    decimalScale={2}
                    prefix="$"
                    style={{ width: 100 }}
                    disabled={isSkipped}
                  />
                  <Select
                    size="xs"
                    data={categoryOptions}
                    value={split.categoryId}
                    onChange={val => {
                      if (val) updateSplit(sr.matchId, i, 'categoryId', val);
                    }}
                    style={{ width: 200 }}
                    searchable
                    disabled={isSkipped}
                  />
                </Group>
              ))}
            </Stack>

            <Group mt="sm" justify="flex-end">
              <Button
                size="xs"
                variant={isSkipped ? 'filled' : 'light'}
                color="gray"
                onClick={() => setSkipped(prev => {
                  const next = new Set(prev);
                  if (next.has(sr.matchId)) next.delete(sr.matchId);
                  else next.add(sr.matchId);
                  return next;
                })}
              >
                {isSkipped ? 'Unskip' : 'Skip'}
              </Button>
            </Group>
          </Paper>
        );
      })}

      {splitRecommendations.some(sr => {
        const splits = editState[sr.matchId] || [];
        const total = splits.reduce((sum, s) => sum + s.amount, 0);
        return !skipped.has(sr.matchId) && Math.abs(total - sr.originalAmount) >= 0.01;
      }) && (
        <Alert color="orange" icon={<IconAlertCircle size={16} />}>
          Some splits don't sum to the original amount. Use "Auto-adjust" or fix manually.
        </Alert>
      )}

      <Divider />

      <Button onClick={handleApply} loading={isProcessing}>
        Apply Splits
      </Button>
    </Stack>
  );
}
