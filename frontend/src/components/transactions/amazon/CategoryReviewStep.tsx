import { useState } from 'react';
import { Stack, Text, Paper, Group, Badge, Button, Select, Divider } from '@mantine/core';
import { useCategoryOptions } from '../../../hooks/useCategoryOptions';
import type { AmazonCategoryRecommendation, AmazonApplyAction } from '../../../../../shared/types';

interface CategoryReviewStepProps {
  recommendations: AmazonCategoryRecommendation[];
  onComplete: (actions: AmazonApplyAction[]) => void;
  isProcessing: boolean;
}

const confidenceLabel = (c: number) => {
  if (c >= 0.85) return 'High';
  if (c >= 0.5) return 'Medium';
  return 'Low';
};

const confidenceColor = (c: number) => {
  if (c >= 0.85) return 'green';
  if (c >= 0.5) return 'yellow';
  return 'orange';
};

export function CategoryReviewStep({
  recommendations,
  onComplete,
  isProcessing,
}: CategoryReviewStepProps) {
  const { options: categoryOptions } = useCategoryOptions();

  // Track user decisions per recommendation
  const [decisions, setDecisions] = useState<Record<string, { type: 'approve' | 'skip'; categoryId?: string }>>(() => {
    // Pre-approve high-confidence recommendations
    const initial: Record<string, { type: 'approve' | 'skip'; categoryId?: string }> = {};
    for (const rec of recommendations) {
      if (rec.confidence >= 0.85 && !rec.isAlreadyCategorized) {
        initial[rec.matchId] = { type: 'approve', categoryId: rec.suggestedCategoryId };
      }
    }
    return initial;
  });

  const setDecision = (matchId: string, type: 'approve' | 'skip', categoryId?: string) => {
    setDecisions(prev => ({ ...prev, [matchId]: { type, categoryId } }));
  };

  const approveAllHighConfidence = () => {
    const next = { ...decisions };
    for (const rec of recommendations) {
      if (rec.confidence >= 0.85 && !rec.isAlreadyCategorized) {
        next[rec.matchId] = { type: 'approve', categoryId: rec.suggestedCategoryId };
      }
    }
    setDecisions(next);
  };

  const handleApply = () => {
    const actions: AmazonApplyAction[] = [];
    for (const rec of recommendations) {
      const decision = decisions[rec.matchId];
      if (!decision) {
        actions.push({ matchId: rec.matchId, type: 'skip' });
      } else if (decision.type === 'approve' && decision.categoryId) {
        actions.push({ matchId: rec.matchId, type: 'categorize', categoryId: decision.categoryId });
      } else {
        actions.push({ matchId: rec.matchId, type: 'skip' });
      }
    }
    onComplete(actions);
  };

  const approvedCount = Object.values(decisions).filter(d => d.type === 'approve').length;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={500}>{recommendations.length} category recommendations</Text>
        <Button variant="subtle" size="xs" onClick={approveAllHighConfidence}>
          Approve All High Confidence
        </Button>
      </Group>

      <Stack gap="xs">
        {recommendations.map(rec => {
          const decision = decisions[rec.matchId];
          const isApproved = decision?.type === 'approve';
          const selectedCategory = decision?.categoryId || rec.suggestedCategoryId;

          return (
            <Paper key={rec.matchId} p="sm" withBorder>
              <Group justify="space-between" wrap="nowrap" mb="xs">
                <div style={{ flex: 1 }}>
                  <Group gap="xs" mb={2}>
                    <Text size="sm" fw={500}>{rec.itemName}</Text>
                    <Badge size="xs" color={confidenceColor(rec.confidence)}>
                      {confidenceLabel(rec.confidence)} ({rec.confidence.toFixed(2)})
                    </Badge>
                    {rec.isAlreadyCategorized && (
                      <Badge size="xs" color="gray" variant="outline">Already categorized</Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">{rec.reasoning}</Text>
                </div>
              </Group>

              <Group gap="sm" mt="xs">
                <Select
                  size="xs"
                  data={categoryOptions}
                  value={selectedCategory}
                  onChange={val => {
                    if (val) setDecision(rec.matchId, 'approve', val);
                  }}
                  style={{ flex: 1, maxWidth: 300 }}
                  searchable
                />
                <Button
                  size="xs"
                  variant={isApproved ? 'filled' : 'light'}
                  color="green"
                  onClick={() => setDecision(rec.matchId, 'approve', selectedCategory)}
                >
                  Approve
                </Button>
                <Button
                  size="xs"
                  variant={decision?.type === 'skip' ? 'filled' : 'light'}
                  color="gray"
                  onClick={() => setDecision(rec.matchId, 'skip')}
                >
                  Skip
                </Button>
              </Group>
            </Paper>
          );
        })}
      </Stack>

      <Divider />

      <Button onClick={handleApply} loading={isProcessing}>
        Apply {approvedCount} Categorization{approvedCount !== 1 ? 's' : ''}
      </Button>
    </Stack>
  );
}
