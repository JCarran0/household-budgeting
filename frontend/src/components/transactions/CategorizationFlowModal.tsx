import { useState, useCallback, useEffect } from 'react';
import { Text, Stack, Center, Loader, Button, Group, ThemeIcon, Progress } from '@mantine/core';
import { ResponsiveModal } from '../ResponsiveModal';
import { IconSparkles } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/api/errors';
import { notifications } from '@mantine/notifications';
import { BucketReviewStep, type BucketApplySelection } from './BucketReviewStep';
import { RuleSuggestionsStep } from './RuleSuggestionsStep';
import { CategorizationSummaryStep } from './CategorizationSummaryStep';
import { bucketOutcomes, countChanged, mergeCounts, unsureReasons as countUnsureReasons } from './categorizationRunReport';
import type { ClassificationBucket, ClassifyTransactionsResponse, RuleSuggestion } from '../../../../shared/types';

type FlowStep = 'loading' | 'review' | 'rules' | 'summary' | 'error';

interface CategorizationFlowModalProps {
  opened: boolean;
  onClose: () => void;
  uncategorizedCount: number;
  // IDs of uncategorized transactions matching the user's current filter set.
  // The backend caps each batch to 50 newest; re-running with the same list
  // is safe because already-categorized rows are filtered out server-side.
  transactionIds: string[];
}

export function CategorizationFlowModal({ opened, onClose, uncategorizedCount, transactionIds }: CategorizationFlowModalProps) {
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
  const [costUsed, setCostUsed] = useState(0);
  const [remainingUncategorized, setRemainingUncategorized] = useState(0);
  const [isReclassifying, setIsReclassifying] = useState(false);
  // Run report (AI-CATEGORIZATION-BRD §12.4.1), accumulated across "next batch" runs
  const [runId, setRunId] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [classifiedCount, setClassifiedCount] = useState(0);
  const [changedCount, setChangedCount] = useState(0);
  const [unsureReasons, setUnsureReasons] = useState<Map<string, number>>(new Map());

  // Track all categorizations for rule suggestion
  const [allCategorizations, setAllCategorizations] = useState<{ transactionId: string; categoryId: string }[]>([]);

  // All buckets including unsure at the end
  const allBuckets = [...buckets, ...(unsureBucket && unsureBucket.transactions.length > 0 ? [unsureBucket] : [])];
  const totalBuckets = allBuckets.length;
  const currentBucket = allBuckets[currentBucketIndex];

  // One handler for the first run and every "Categorize next" run; the
  // session's totals accumulate across them.
  const acceptResult = useCallback((result: ClassifyTransactionsResponse) => {
    setBuckets(result.buckets);
    setUnsureBucket(result.unsureBucket);
    setCostUsed(prev => prev + result.costUsed);
    setRemainingUncategorized(result.remainingUncategorized);
    setRunId(result.runId);
    setModel(result.model);
    const sent = result.buckets.reduce((n, b) => n + b.transactions.length, 0) + result.unsureBucket.transactions.length;
    setSentCount(prev => prev + sent);
    setClassifiedCount(prev => prev + result.totalClassified);
    setUnsureReasons(prev => mergeCounts(prev, countUnsureReasons(result)));
    if (sent === 0) {
      setStep('summary');
    } else {
      setStep('review');
    }
  }, []);

  /**
   * Fire-and-forget: the record is for measurement, and failing to save it
   * must never look like failing to apply (REQ-133).
   */
  const reportOutcomes = useCallback((bucket: ClassificationBucket, applied: BucketApplySelection[]) => {
    if (!runId) return;
    api.recordClassificationOutcomes(runId, bucketOutcomes(bucket, applied)).catch(() => {
      // Intentionally silent to the user; the server logs the failure.
    });
  }, [runId]);

  // Start classification when modal opens
  useEffect(() => {
    if (opened) {
      setStep('loading');
      setCurrentBucketIndex(0);
      setAppliedCount(0);
      setSkippedCount(0);
      setAllCategorizations([]);
      setCreatedRulesCount(0);
      setCostUsed(0);
      setError(null);
      setRunId(null);
      setModel(null);
      setChangedCount(0);
      setSentCount(0);
      setClassifiedCount(0);
      setUnsureReasons(new Map());

      api.classifyTransactions(transactionIds)
        .then(acceptResult)
        .catch(err => {
          setError(getApiErrorMessage(err, 'Classification failed'));
          setStep('error');
        });
    }
    // transactionIds snapshot at open-time is intentional — changing filters
    // mid-flow shouldn't re-trigger classification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const startNextBatch = useCallback(() => {
    setIsReclassifying(true);
    setStep('loading');
    setBuckets([]);
    setUnsureBucket(null);
    setCurrentBucketIndex(0);
    setRuleSuggestions([]);
    setError(null);
    api.classifyTransactions(transactionIds)
      .then(acceptResult)
      .catch(err => {
        setError(getApiErrorMessage(err, 'Classification failed'));
        setStep('error');
      })
      .finally(() => setIsReclassifying(false));
  }, [transactionIds, acceptResult]);

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

  const handleApply = useCallback(async (selections: BucketApplySelection[]) => {
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

      // Apply description edits individually
      const descriptionEdits = selections.filter(s => s.userDescription !== undefined);
      for (const s of descriptionEdits) {
        await api.updateTransactionDescription(s.transactionId, s.userDescription!);
      }

      setAppliedCount(prev => prev + selections.length);
      // Any transactions in the bucket that weren't applied were skipped per-row
      const bucketSize = currentBucket?.transactions.length ?? selections.length;
      const perRowSkipped = bucketSize - selections.length;
      if (perRowSkipped > 0) {
        setSkippedCount(prev => prev + perRowSkipped);
      }
      setAllCategorizations(prev => [...prev, ...selections]);
      if (currentBucket) {
        setChangedCount(prev => prev + countChanged(currentBucket, selections));
        reportOutcomes(currentBucket, selections);
      }
      advanceBucket();
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to apply categories', color: 'red' });
    } finally {
      setIsApplying(false);
    }
  }, [advanceBucket, currentBucket, reportOutcomes]);

  const handleSkip = useCallback(() => {
    if (currentBucket) {
      setSkippedCount(prev => prev + currentBucket.transactions.length);
      reportOutcomes(currentBucket, []);
    }
    advanceBucket();
  }, [advanceBucket, currentBucket, reportOutcomes]);

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
    <ResponsiveModal
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
            <Text c="dimmed">
              Analyzing first {Math.min(50, uncategorizedCount)} of {uncategorizedCount} transaction{uncategorizedCount !== 1 ? 's' : ''}…
            </Text>
            {uncategorizedCount > 50 && (
              <Text size="xs" c="dimmed">Re-run after review to categorize the next batch</Text>
            )}
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
            <Button variant="light" onClick={startNextBatch}>Retry</Button>
            <Button variant="subtle" color="gray" onClick={handleClose}>Close</Button>
          </Group>
        </Stack>
      )}

      {step === 'summary' && (
        <CategorizationSummaryStep
          summary={{
            sentCount,
            classifiedCount,
            appliedCount,
            changedCount,
            skippedCount,
            createdRulesCount,
            unsureReasons,
            costUsed,
            model,
            remainingUncategorized,
          }}
          onNextBatch={startNextBatch}
          isReclassifying={isReclassifying}
          onDone={handleClose}
        />
      )}
    </ResponsiveModal>
  );
}
