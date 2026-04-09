import { useState, useCallback, useEffect } from 'react';
import { Modal, Text, Stack, Center, Loader, Button, Group } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { UploadStep } from './amazon/UploadStep';
import { MatchReviewStep } from './amazon/MatchReviewStep';
import { CategoryReviewStep } from './amazon/CategoryReviewStep';
import { SplitReviewStep } from './amazon/SplitReviewStep';
import { SummaryStep } from './amazon/SummaryStep';
import type {
  AmazonTransactionMatch,
  AmbiguousAmazonMatch,
  ParsedAmazonOrder,
  AmazonCategoryRecommendation,
  AmazonSplitRecommendation,
  AmazonApplyAction,
  AmazonApplyResponse,
} from '../../../../shared/types';

type FlowStep =
  | 'upload'
  | 'parsing'
  | 'matching'
  | 'review-matches'
  | 'categorizing'
  | 'review-categories'
  | 'review-splits'
  | 'applying'
  | 'summary'
  | 'error';

interface AmazonReceiptFlowModalProps {
  opened: boolean;
  onClose: () => void;
}

export function AmazonReceiptFlowModal({ opened, onClose }: AmazonReceiptFlowModalProps) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<FlowStep>('upload');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Match data
  const [matches, setMatches] = useState<AmazonTransactionMatch[]>([]);
  const [ambiguous, setAmbiguous] = useState<AmbiguousAmazonMatch[]>([]);
  const [unmatched, setUnmatched] = useState<ParsedAmazonOrder[]>([]);

  // Category data
  const [recommendations, setRecommendations] = useState<AmazonCategoryRecommendation[]>([]);
  const [splitRecommendations, setSplitRecommendations] = useState<AmazonSplitRecommendation[]>([]);

  // Results
  const [applyResult, setApplyResult] = useState<AmazonApplyResponse | null>(null);
  const [rulesCreated, setRulesCreated] = useState(0);
  const [totalCostUsed, setTotalCostUsed] = useState(0);

  // Accumulated actions from category + split review
  const [accumulatedActions, setAccumulatedActions] = useState<AmazonApplyAction[]>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (opened) {
      setStep('upload');
      setSessionId(null);
      setError(null);
      setMatches([]);
      setAmbiguous([]);
      setUnmatched([]);
      setRecommendations([]);
      setSplitRecommendations([]);
      setApplyResult(null);
      setRulesCreated(0);
      setTotalCostUsed(0);
      setAccumulatedActions([]);
    }
  }, [opened]);

  // Step 1: Upload PDFs
  const handleUpload = useCallback(async (files: File[]) => {
    setStep('parsing');
    setError(null);
    try {
      const result = await api.uploadAmazonReceipts(files);
      setSessionId(result.sessionId);
      setTotalCostUsed(prev => prev + (result.costUsed || 0));

      if (result.parsedOrders.length === 0 && result.parsedCharges.length === 0) {
        setError('No orders or charges found in the uploaded PDF(s). Please check the file format.');
        setStep('error');
        return;
      }

      // Auto-proceed to matching
      setStep('matching');
      const matchResult = await api.matchAmazonOrders(result.sessionId);
      setMatches(matchResult.matches);
      setAmbiguous(matchResult.ambiguous);
      setUnmatched(matchResult.unmatched);

      if (matchResult.matches.length === 0 && matchResult.ambiguous.length === 0) {
        setError('No matching bank transactions found for the uploaded orders.');
        setStep('error');
        return;
      }

      setStep('review-matches');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      const axiosError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(axiosError || message);
      setStep('error');
    }
  }, []);

  // Step 2: Confirm matches and categorize
  const handleConfirmMatches = useCallback(async (confirmedMatchIds: string[]) => {
    if (!sessionId) return;
    setStep('categorizing');
    try {
      const result = await api.categorizeAmazonMatches(sessionId, confirmedMatchIds);
      setRecommendations(result.recommendations);
      setSplitRecommendations(result.splitRecommendations);
      setTotalCostUsed(prev => prev + (result.costUsed || 0));

      if (result.recommendations.length === 0 && result.splitRecommendations.length === 0) {
        // Nothing to categorize — go directly to summary
        setStep('summary');
        setApplyResult({ applied: 0, splits: 0, skipped: 0, rulesCreated: 0, summary: { totalDollarsRecategorized: 0, categoriesUpdated: [] } });
        return;
      }

      setStep('review-categories');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Categorization failed';
      const axiosError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(axiosError || message);
      setStep('error');
    }
  }, [sessionId]);

  const handleResolveAmbiguous = useCallback(async (
    resolutions: { orderNumber: string; transactionId: string }[],
  ) => {
    if (!sessionId || resolutions.length === 0) return;
    try {
      await api.resolveAmbiguousMatches(sessionId, resolutions);
    } catch (err) {
      console.warn('Failed to resolve ambiguous matches:', err);
    }
  }, [sessionId]);

  // Apply all actions (defined first so callbacks below can reference it)
  const applyAll = useCallback(async (actions: AmazonApplyAction[]) => {
    if (!sessionId) return;
    setStep('applying');
    try {
      const result = await api.applyAmazonActions(sessionId, actions);
      setApplyResult(result);

      // Try to get rule suggestions (non-blocking)
      try {
        const rules = await api.suggestAmazonRules(sessionId);
        setRulesCreated(rules.suggestions.length);
      } catch {
        // Rule suggestions are optional
      }

      setStep('summary');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply changes';
      const axiosError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(axiosError || message);
      setStep('error');
    }
  }, [sessionId]);

  // Step 3: Category review complete → check for splits
  const handleCategoryComplete = useCallback((categoryActions: AmazonApplyAction[]) => {
    setAccumulatedActions(categoryActions);

    if (splitRecommendations.length > 0) {
      setStep('review-splits');
    } else {
      applyAll(categoryActions);
    }
  }, [splitRecommendations, applyAll]);

  // Step 4: Split review complete → apply all
  const handleSplitComplete = useCallback((splitActions: AmazonApplyAction[]) => {
    const allActions = [...accumulatedActions, ...splitActions];
    applyAll(allActions);
  }, [accumulatedActions, applyAll]);

  const handleClose = () => {
    // Invalidate transaction queries to refresh the list
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['uncategorized-count'] });
    onClose();
  };

  const stepTitle: Record<FlowStep, string> = {
    upload: 'Upload Amazon Receipts',
    parsing: 'Parsing PDFs...',
    matching: 'Matching Orders...',
    'review-matches': 'Review Matches',
    categorizing: 'Categorizing Items...',
    'review-categories': 'Review Categories',
    'review-splits': 'Review Splits',
    applying: 'Applying Changes...',
    summary: 'Summary',
    error: 'Error',
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={stepTitle[step]}
      size="lg"
      centered
    >
      {step === 'upload' && (
        <UploadStep onUpload={handleUpload} isUploading={false} />
      )}

      {(step === 'parsing' || step === 'matching' || step === 'categorizing' || step === 'applying') && (
        <Center py="xl">
          <Stack align="center" gap="sm">
            <Loader size="lg" />
            <Text c="dimmed" size="sm">
              {step === 'parsing' && 'Extracting order data from your PDFs...'}
              {step === 'matching' && 'Matching orders against your bank transactions...'}
              {step === 'categorizing' && 'Generating category recommendations...'}
              {step === 'applying' && 'Applying your changes...'}
            </Text>
          </Stack>
        </Center>
      )}

      {step === 'review-matches' && (
        <MatchReviewStep
          matches={matches}
          ambiguous={ambiguous}
          unmatched={unmatched}
          onConfirm={handleConfirmMatches}
          onResolveAmbiguous={handleResolveAmbiguous}
          isProcessing={false}
        />
      )}

      {step === 'review-categories' && (
        <CategoryReviewStep
          recommendations={recommendations}
          onComplete={handleCategoryComplete}
          isProcessing={false}
        />
      )}

      {step === 'review-splits' && (
        <SplitReviewStep
          splitRecommendations={splitRecommendations}
          onComplete={handleSplitComplete}
          isProcessing={false}
        />
      )}

      {step === 'summary' && applyResult && (
        <SummaryStep
          result={applyResult}
          unmatchedCount={unmatched.length}
          rulesCreated={rulesCreated}
          totalCostUsed={totalCostUsed}
          onClose={handleClose}
        />
      )}

      {step === 'error' && (
        <Stack gap="md" py="md">
          <Text c="red" size="sm">{error}</Text>
          <Group gap="sm">
            <Button variant="light" size="xs" onClick={() => setStep('upload')}>
              Try again
            </Button>
            {error?.includes('already processed') && (
              <Button
                variant="light"
                size="xs"
                color="orange"
                onClick={async () => {
                  try {
                    await api.deleteAllAmazonReceiptSessions();
                    setError(null);
                    setStep('upload');
                  } catch {
                    setError('Failed to clear sessions');
                  }
                }}
              >
                Clear previous sessions & retry
              </Button>
            )}
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
