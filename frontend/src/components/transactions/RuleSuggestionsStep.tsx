import { useState } from 'react';
import { Card, Text, Group, Button, Badge, Stack } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { api } from '../../lib/api';
import { notifications } from '@mantine/notifications';
import type { RuleSuggestion } from '../../../../shared/types';

interface RuleSuggestionsStepProps {
  suggestions: RuleSuggestion[];
  onDone: (createdCount: number) => void;
}

export function RuleSuggestionsStep({ suggestions, onDone }: RuleSuggestionsStepProps) {
  const [remaining, setRemaining] = useState<RuleSuggestion[]>(suggestions);
  const [creating, setCreating] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);

  const handleCreate = async (suggestion: RuleSuggestion) => {
    setCreating(suggestion.patterns.join(','));
    try {
      await api.createAutoCategorizeRule({
        description: `${suggestion.categoryName} — ${suggestion.patterns.join(', ')}`,
        patterns: suggestion.patterns,
        categoryId: suggestion.categoryId,
        isActive: true,
      });
      setRemaining(prev => prev.filter(s => s !== suggestion));
      setCreatedCount(prev => prev + 1);
      notifications.show({ title: 'Rule Created', message: `Auto-categorize "${suggestion.patterns.join(', ')}" → ${suggestion.categoryName}`, color: 'green' });
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to create rule', color: 'red' });
    } finally {
      setCreating(null);
    }
  };

  const handleDismiss = (suggestion: RuleSuggestion) => {
    setRemaining(prev => prev.filter(s => s !== suggestion));
  };

  if (remaining.length === 0) {
    return (
      <Stack align="center" gap="md" py="xl">
        <Text size="lg" fw={600}>
          {createdCount > 0 ? `Created ${createdCount} new rule${createdCount !== 1 ? 's' : ''}!` : 'No rules to create.'}
        </Text>
        <Button onClick={() => onDone(createdCount)}>Continue to Summary</Button>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text size="lg" fw={600}>Suggested Auto-Categorization Rules</Text>
      <Text size="sm" c="dimmed">
        These rules will automatically categorize future transactions matching these patterns.
      </Text>

      {remaining.map((suggestion, i) => (
        <Card key={i} withBorder padding="sm">
          <Group justify="space-between" align="flex-start">
            <div>
              <Group gap="xs" mb={4}>
                {suggestion.patterns.map(p => (
                  <Badge key={p} variant="light">{p}</Badge>
                ))}
                <Text size="sm" c="dimmed">→</Text>
                <Badge color="blue" variant="light">{suggestion.categoryName}</Badge>
              </Group>
              <Text size="xs" c="dimmed">
                Matches {suggestion.matchingTransactionCount} transaction{suggestion.matchingTransactionCount !== 1 ? 's' : ''}: {suggestion.exampleTransactions.slice(0, 3).join(', ')}
              </Text>
            </div>
            <Group gap="xs">
              <Button
                size="xs"
                leftSection={<IconCheck size={14} />}
                onClick={() => handleCreate(suggestion)}
                loading={creating === suggestion.patterns.join(',')}
              >
                Create
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<IconX size={14} />}
                onClick={() => handleDismiss(suggestion)}
              >
                Dismiss
              </Button>
            </Group>
          </Group>
        </Card>
      ))}

      <Group justify="flex-end">
        <Button variant="subtle" onClick={() => onDone(createdCount)}>
          Skip All & Finish
        </Button>
      </Group>
    </Stack>
  );
}
