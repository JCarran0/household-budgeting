import { useMemo, useState } from 'react';
import {
  Stack,
  Group,
  Text,
  ActionIcon,
  Tooltip,
  Loader,
  Button,
} from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { IconRefresh } from '@tabler/icons-react';
import { api } from '../../lib/api';
import type { AutoCatSuggestion, AutoCategorizeRule } from '../../../../shared/types';
import { normalizeRulePattern } from '../../../../shared/utils/merchantNormalization';
import { useDismissedAutoCatSuggestions } from './useDismissedAutoCatSuggestions';
import { SuggestedRuleCard, type SuggestedRuleAction } from './SuggestedRuleCard';

const QUERY_KEY = ['autocategorize-suggestions'];
const VISIBLE_DEFAULT = 10;

/**
 * Mirrors the backend MAX_PATTERNS_PER_RULE in routes/autoCategorize.ts.
 * If you bump one, bump the other (also bumped in AutoCategorization.tsx).
 */
const MAX_PATTERNS_PER_RULE = 10;

interface MutationVariables {
  suggestion: AutoCatSuggestion;
  action: SuggestedRuleAction;
}

export function SuggestedRulesSection() {
  const queryClient = useQueryClient();
  const { dismissed, dismiss, undismiss } = useDismissedAutoCatSuggestions();
  const [showAll, setShowAll] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.getAutoCatSuggestions(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const { data: existingRules = [] } = useQuery({
    queryKey: ['autocategorize-rules'],
    queryFn: () => api.getAutoCategorizeRules(),
  });

  const visibleSuggestions = useMemo(() => {
    if (!data) return [];
    return data.suggestions.filter(s => !dismissed.has(s.normalizedKey));
  }, [data, dismissed]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['autocategorize-rules'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['uncategorized-count'] });
  };

  const ruleActionMutation = useMutation({
    mutationFn: async ({ suggestion, action }: MutationVariables) => {
      const rules = await ensureRules(queryClient);

      if (action.kind === 'append') {
        const target = rules.find(r => r.id === action.ruleId);
        if (!target) {
          throw new Error('That rule no longer exists. Refresh and try again.');
        }
        if (target.patterns.length >= MAX_PATTERNS_PER_RULE) {
          throw new Error(
            `Rule "${target.description}" is at the ${MAX_PATTERNS_PER_RULE}-pattern limit. Remove a pattern from it first, or create a new rule.`,
          );
        }
        // Defensive: if the cluster key already lives on a different rule, bail
        // — the user's request is already covered.
        const conflictingOwner = rules.find(
          r =>
            r.id !== target.id &&
            r.patterns.some(p => normalizeRulePattern(p) === suggestion.normalizedKey),
        );
        if (conflictingOwner) {
          throw new Error(
            `"${suggestion.normalizedKey}" already exists on rule "${conflictingOwner.description}".`,
          );
        }
        // No-op if the pattern is already on this rule.
        const alreadyOnTarget = target.patterns.some(
          p => normalizeRulePattern(p) === suggestion.normalizedKey,
        );
        if (alreadyOnTarget) {
          return { kind: 'noop-already-on-target' as const, target };
        }

        await api.updateAutoCategorizeRule(target.id, {
          patterns: [...target.patterns, suggestion.normalizedKey],
          source: 'suggestion',
          suggestionMeta: {
            clusterSize: suggestion.clusterSize,
            topCategoryCount: suggestion.topCategoryCount,
            agreementPct: suggestion.agreementPct,
            pendingMatchCount: suggestion.pendingMatchCount,
            outcome: 'appended',
            addedToExistingRuleId: target.id,
          },
        });
        const applyResult = await api.applyAutoCategorizeRules(
          false,
          suggestion.pendingTxnIds,
        );
        return {
          kind: 'appended' as const,
          appliedTo: applyResult.categorized,
          target,
        };
      }

      // action.kind === 'create' — preserve the original Create-with-collision flow.
      const collision = findRuleCollision(rules, suggestion.normalizedKey);

      if (collision && collision.categoryId === suggestion.topCategoryId) {
        return { kind: 'duplicate' as const };
      }

      if (collision) {
        const proceed = await confirmReplace(collision, suggestion);
        if (!proceed) return { kind: 'cancelled' as const };
        await api.updateAutoCategorizeRule(collision.id, {
          categoryId: suggestion.topCategoryId,
          categoryName: suggestion.topCategoryName,
          source: 'suggestion',
          suggestionMeta: {
            clusterSize: suggestion.clusterSize,
            topCategoryCount: suggestion.topCategoryCount,
            agreementPct: suggestion.agreementPct,
            pendingMatchCount: suggestion.pendingMatchCount,
            outcome: 'replaced',
            replacedExisting: true,
          },
        });
        const applyResult = await api.applyAutoCategorizeRules(
          false,
          suggestion.pendingTxnIds,
        );
        return {
          kind: 'replaced' as const,
          appliedTo: applyResult.categorized,
        };
      }

      await api.createAutoCategorizeRule({
        description: suggestion.displayLabel,
        patterns: [suggestion.normalizedKey],
        categoryId: suggestion.topCategoryId,
        categoryName: suggestion.topCategoryName,
        isActive: true,
        source: 'suggestion',
        suggestionMeta: {
          clusterSize: suggestion.clusterSize,
          topCategoryCount: suggestion.topCategoryCount,
          agreementPct: suggestion.agreementPct,
          pendingMatchCount: suggestion.pendingMatchCount,
          outcome: 'created',
          replacedExisting: false,
        },
      });
      const applyResult = await api.applyAutoCategorizeRules(
        false,
        suggestion.pendingTxnIds,
      );
      return { kind: 'created' as const, appliedTo: applyResult.categorized };
    },
    onSuccess: (result, { suggestion }) => {
      if (result.kind === 'cancelled') return;

      // Auto-clear dismissal entry on a successful action.
      undismiss(suggestion.normalizedKey);

      if (result.kind === 'duplicate') {
        notifications.show({
          title: 'Rule already exists',
          message: `An auto-cat rule for ${suggestion.displayLabel} is already in place.`,
          color: 'blue',
        });
      } else if (result.kind === 'noop-already-on-target') {
        notifications.show({
          title: 'Already on that rule',
          message: `"${suggestion.normalizedKey}" is already a pattern on "${result.target.description}".`,
          color: 'blue',
        });
      } else if (result.kind === 'appended') {
        notifications.show({
          title: 'Pattern added',
          message: `Added to "${result.target.description}". Categorized ${result.appliedTo} ${
            result.appliedTo === 1 ? 'transaction' : 'transactions'
          }.`,
          color: 'green',
        });
      } else {
        const verb = result.kind === 'replaced' ? 'updated' : 'created';
        notifications.show({
          title: `Rule ${verb}`,
          message: `Categorized ${result.appliedTo} ${
            result.appliedTo === 1 ? 'transaction' : 'transactions'
          }.`,
          color: 'green',
        });
      }
      invalidate();
    },
    onError: (error: unknown) => {
      notifications.show({
        title: 'Could not update rule',
        message: error instanceof Error ? error.message : 'Please try again.',
        color: 'red',
      });
    },
    onSettled: () => {
      setBusyKey(null);
    },
  });

  if (isLoading || !data) {
    if (isLoading) {
      return (
        <Group gap="xs" mb="md">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            Looking for suggested rules…
          </Text>
        </Group>
      );
    }
    return null;
  }

  if (visibleSuggestions.length === 0) return null;

  const limit = showAll ? visibleSuggestions.length : VISIBLE_DEFAULT;
  const cardsToRender = visibleSuggestions.slice(0, limit);
  const hiddenCount = visibleSuggestions.length - limit;

  return (
    <Stack gap="sm" mb="lg">
      <Group justify="space-between" align="center">
        <Text fw={600} size="md">
          Suggested Rules ({visibleSuggestions.length})
        </Text>
        <Tooltip label="Refresh suggestions">
          <ActionIcon
            variant="subtle"
            aria-label="Refresh suggestions"
            onClick={() => queryClient.invalidateQueries({ queryKey: QUERY_KEY })}
          >
            <IconRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Stack gap="sm">
        {cardsToRender.map(suggestion => (
          <SuggestedRuleCard
            key={suggestion.normalizedKey}
            suggestion={suggestion}
            existingRules={existingRules}
            isBusy={busyKey === suggestion.normalizedKey}
            onAction={(s, action) => {
              setBusyKey(s.normalizedKey);
              ruleActionMutation.mutate({ suggestion: s, action });
            }}
            onDismiss={dismiss}
          />
        ))}
      </Stack>
      {hiddenCount > 0 && (
        <Group justify="center">
          <Button variant="subtle" size="xs" onClick={() => setShowAll(true)}>
            Show {hiddenCount} more
          </Button>
        </Group>
      )}
    </Stack>
  );
}

async function ensureRules(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<AutoCategorizeRule[]> {
  const cached = queryClient.getQueryData<AutoCategorizeRule[]>([
    'autocategorize-rules',
  ]);
  if (cached) return cached;
  return queryClient.fetchQuery({
    queryKey: ['autocategorize-rules'],
    queryFn: () => api.getAutoCategorizeRules(),
  });
}

function findRuleCollision(
  rules: AutoCategorizeRule[],
  normalizedKey: string,
): AutoCategorizeRule | null {
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      if (normalizeRulePattern(pattern) === normalizedKey) return rule;
    }
  }
  return null;
}

function confirmReplace(
  existingRule: AutoCategorizeRule,
  suggestion: AutoCatSuggestion,
): Promise<boolean> {
  return new Promise(resolve => {
    modals.openConfirmModal({
      title: 'Replace existing rule?',
      children: (
        <Text size="sm">
          A rule for{' '}
          <Text span fw={600}>
            "{suggestion.normalizedKey}"
          </Text>{' '}
          already maps to{' '}
          <Text span fw={600}>
            {existingRule.categoryName ?? 'another category'}
          </Text>
          . Replace with{' '}
          <Text span fw={600}>
            {suggestion.topCategoryName}
          </Text>
          ?
        </Text>
      ),
      labels: { confirm: 'Replace', cancel: 'Cancel' },
      confirmProps: { color: 'orange' },
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false),
    });
  });
}
