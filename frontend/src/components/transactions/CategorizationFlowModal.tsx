import { useState, useCallback, useEffect } from 'react';
import { Modal, Text, Stack, Center, Loader, Button, Group, ThemeIcon, Progress } from '@mantine/core';
import { IconSparkles, IconCheck } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { notifications } from '@mantine/notifications';
import { BucketReviewStep } from './BucketReviewStep';
import { RuleSuggestionsStep } from './RuleSuggestionsStep';
import type { ClassificationBucket, RuleSuggestion } from '../../../../shared/types';

type FlowStep = 'loading' | 'review' | 'rules' | 'summary' | 'error';

interface CategorizationFlowModalProps {
  opened: boolean;
  onClose: () => void;
  uncategorizedCount: number;
}

export function CategorizationFlowModal({ opened, onClose, uncategorizedCount }: CategorizationFlowModalProps) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<FlowStep>('loading');
  const [buckets, setBuckets] = useState<ClassificationBucket[]>([]);
  const [unsureBucket, setUnsureBucket] = useState<ClassificationBucket | null>(null);
  const [currentBucketIndex, setCurrentBucketIndex] = useState(0);
  const [appliedCount, setAppliedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [isApplying, setIsApplying] = useState(false);
  const [ruleSuggestions, setRuleSuggestions] = useState<RuleSuggestion[]>([]);
  const [createdRulesCount, setCreatedRulesCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Track all categorizations for rule suggestion
  const [allCategorizations, setAllCategorizations] = useState<{ transactionId: string; categoryId: string }[]>([]);

  // All buckets including unsure at the end
  const allBuckets = [...buckets, ...(unsureBucket && unsureBucket.transactions.length > 0 ? [unsureBucket] : [])];
  const totalBuckets = allBuckets.length;
  const currentBucket = allBuckets[currentBucketIndex];

  // Start classification when modal opens
  useEffect(() => {
    if (opened) {
      setStep('loading');
      setCurrentBucketIndex(0);
      setAppliedCount(0);
      setSkippedCount(0);
      setAllCategorizations([]);
      setCreatedRulesCount(0);
      setError(null);

      api.classifyTransactions()
        .then(result => {
          setBuckets(result.buckets);
          setUnsureBucket(result.unsureBucket);
          if (result.buckets.length === 0 && result.unsureBucket.transactions.length === 0) {
            setStep('summary');
          } else {
            setStep('review');
          }
        })
        .catch(err => {
          const axiosError = err?.response?.data?.error;
          const message = axiosError || (err instanceof Error ? err.message : 'Classification failed');
          setError(message);
          setStep('error');
        });
    }
  }, [opened]);

  const advanceBucket = useCallback(() => {
    const nextIndex = currentBucketIndex + 1;
    if (nextIndex < totalBuckets) {
      setCurrentBucketIndex(nextIndex);
    } else {
      // All buckets done — suggest rules if we have categorizations
      if (allCategorizations.length >= 2) {
        setStep('loading');
        api.suggestCategorizeRules(allCategorizations)
          .then(result => {
            if (result.suggestions.length > 0) {
              setRuleSuggestions(result.suggestions);
              setStep('rules');
            } else {
              setStep('summary');
            }
          })
          .catch(() => setStep('summary'));
      } else {
        setStep('summary');
      }
    }
  }, [currentBucketIndex, totalBuckets, allCategorizations]);

  const handleApply = useCallback(async (selections: { transactionId: string; categoryId: string }[]) => {
    setIsApplying(true);
    try {
      // Group by categoryId and send bulk updates
      const byCat = new Map<string, string[]>();
      for (const s of selections) {
        if (!byCat.has(s.categoryId)) byCat.set(s.categoryId, []);
        byCat.get(s.categoryId)!.push(s.transactionId);
      }

      for (const [categoryId, ids] of byCat) {
        await api.bulkUpdateTransactions(ids, { categoryId });
      }

      setAppliedCount(prev => prev + selections.length);
      setAllCategorizations(prev => [...prev, ...selections]);
      advanceBucket();
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to apply categories', color: 'red' });
    } finally {
      setIsApplying(false);
    }
  }, [advanceBucket]);

  const handleSkip = useCallback(() => {
    if (currentBucket) {
      setSkippedCount(prev => prev + currentBucket.transactions.length);
    }
    advanceBucket();
  }, [advanceBucket, currentBucket]);

  const handleRulesDone = useCallback((count: number) => {
    setCreatedRulesCount(count);
    setStep('summary');
  }, []);

  const handleClose = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['transactions', 'uncategorized', 'count'] });
    onClose();
  }, [queryClient, onClose]);

  const progressPct = totalBuckets > 0 ? ((currentBucketIndex) / totalBuckets) * 100 : 0;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <IconSparkles size={20} />
          <Text fw={600}>AI Categorization</Text>
        </Group>
      }
      size="xl"
      closeOnClickOutside={false}
    >
      {step === 'loading' && (
        <Center py="xl">
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text c="dimmed">Analyzing {uncategorizedCount} transactions...</Text>
          </Stack>
        </Center>
      )}

      {step === 'review' && currentBucket && (
        <Stack gap="sm">
          <Progress value={progressPct} size="xs" />
          <BucketReviewStep
            bucket={currentBucket}
            bucketIndex={currentBucketIndex}
            totalBuckets={totalBuckets}
            onApply={handleApply}
            onSkip={handleSkip}
            isApplying={isApplying}
          />
        </Stack>
      )}

      {step === 'rules' && (
        <RuleSuggestionsStep
          suggestions={ruleSuggestions}
          onDone={handleRulesDone}
        />
      )}

      {step === 'error' && (
        <Stack align="center" gap="md" py="xl">
          <ThemeIcon size={60} radius="xl" variant="light" color="red">
            <IconSparkles size={30} />
          </ThemeIcon>
          <Text size="lg" fw={600}>Classification Failed</Text>
          <Text size="sm" c="dimmed" ta="center" maw={400}>{error}</Text>
          <Group>
            <Button variant="light" onClick={() => { setError(null); setStep('loading'); api.classifyTransactions().then(result => { setBuckets(result.buckets); setUnsureBucket(result.unsureBucket); setStep(result.buckets.length === 0 && result.unsureBucket.transactions.length === 0 ? 'summary' : 'review'); }).catch(err => { setError(err?.response?.data?.error || 'Classification failed'); setStep('error'); }); }}>
              Retry
            </Button>
            <Button variant="subtle" color="gray" onClick={handleClose}>Close</Button>
          </Group>
        </Stack>
      )}

      {step === 'summary' && (
        <Stack align="center" gap="md" py="xl">
          <ThemeIcon size={60} radius="xl" variant="light" color="green">
            <IconCheck size={30} />
          </ThemeIcon>
          <Text size="lg" fw={600}>Categorization Complete</Text>
          <Stack gap={4} align="center">
            <Text size="sm">{appliedCount} transaction{appliedCount !== 1 ? 's' : ''} categorized</Text>
            {skippedCount > 0 && <Text size="sm" c="dimmed">{skippedCount} skipped</Text>}
            {createdRulesCount > 0 && <Text size="sm" c="blue">{createdRulesCount} new auto-categorization rule{createdRulesCount !== 1 ? 's' : ''} created</Text>}
          </Stack>
          <Button onClick={handleClose}>Done</Button>
        </Stack>
      )}
    </Modal>
  );
}
