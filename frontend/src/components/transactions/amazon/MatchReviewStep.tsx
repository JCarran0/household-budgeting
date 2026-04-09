import { useState } from 'react';
import { Stack, Text, Paper, Group, Badge, Checkbox, Button, Select, Divider, Accordion } from '@mantine/core';
import { IconCheck, IconQuestionMark, IconAlertTriangle } from '@tabler/icons-react';
import type { AmazonTransactionMatch, AmbiguousAmazonMatch, ParsedAmazonOrder } from '../../../../../shared/types';

interface MatchReviewStepProps {
  matches: AmazonTransactionMatch[];
  ambiguous: AmbiguousAmazonMatch[];
  unmatched: ParsedAmazonOrder[];
  onConfirm: (confirmedMatchIds: string[]) => void;
  onResolveAmbiguous: (resolutions: { orderNumber: string; transactionId: string }[]) => void;
  isProcessing: boolean;
}

const confidenceColor = (c: string) => {
  switch (c) {
    case 'high': return 'green';
    case 'medium': return 'yellow';
    case 'low': return 'orange';
    case 'manual': return 'blue';
    default: return 'gray';
  }
};

export function MatchReviewStep({
  matches,
  ambiguous,
  unmatched,
  onConfirm,
  onResolveAmbiguous,
  isProcessing,
}: MatchReviewStepProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    // Pre-select high-confidence matches
    return new Set(matches.filter(m => m.matchConfidence === 'high').map(m => m.id));
  });
  const [ambiguousResolutions, setAmbiguousResolutions] = useState<Record<string, string>>({});

  const toggleMatch = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(matches.map(m => m.id)));

  const handleContinue = () => {
    // First resolve any ambiguous matches
    const resolutions = Object.entries(ambiguousResolutions)
      .filter(([, txId]) => txId)
      .map(([orderNumber, transactionId]) => ({ orderNumber, transactionId }));

    if (resolutions.length > 0) {
      onResolveAmbiguous(resolutions);
    }

    onConfirm([...selectedIds]);
  };

  const highMatches = matches.filter(m => m.matchConfidence === 'high');
  const mediumMatches = matches.filter(m => m.matchConfidence === 'medium');
  const manualMatches = matches.filter(m => m.matchConfidence === 'manual');

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={500}>
          {matches.length} matched, {ambiguous.length} ambiguous, {unmatched.length} unmatched
        </Text>
        <Button variant="subtle" size="xs" onClick={selectAll}>
          Select All
        </Button>
      </Group>

      <Accordion variant="separated" multiple defaultValue={['high', 'medium']}>
        {highMatches.length > 0 && (
          <Accordion.Item value="high">
            <Accordion.Control icon={<IconCheck size={16} color="var(--mantine-color-green-6)" />}>
              High Confidence ({highMatches.length})
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                {highMatches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    selected={selectedIds.has(match.id)}
                    onToggle={() => toggleMatch(match.id)}
                  />
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {mediumMatches.length > 0 && (
          <Accordion.Item value="medium">
            <Accordion.Control icon={<IconQuestionMark size={16} color="var(--mantine-color-yellow-6)" />}>
              Likely Matches ({mediumMatches.length})
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                {mediumMatches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    selected={selectedIds.has(match.id)}
                    onToggle={() => toggleMatch(match.id)}
                  />
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {manualMatches.length > 0 && (
          <Accordion.Item value="manual">
            <Accordion.Control>Manually Resolved ({manualMatches.length})</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                {manualMatches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    selected={selectedIds.has(match.id)}
                    onToggle={() => toggleMatch(match.id)}
                  />
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {ambiguous.length > 0 && (
          <Accordion.Item value="ambiguous">
            <Accordion.Control icon={<IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" />}>
              Ambiguous — Needs Your Input ({ambiguous.length})
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                {ambiguous.map(amb => (
                  <Paper key={amb.order.orderNumber} p="sm" withBorder>
                    <Text size="sm" fw={500} mb="xs">
                      Order {amb.order.orderNumber} — ${amb.order.totalAmount.toFixed(2)}
                    </Text>
                    <Text size="xs" c="dimmed" mb="xs">
                      {amb.order.items.map(i => i.name).join(', ')}
                    </Text>
                    <Select
                      placeholder="Select matching transaction"
                      data={amb.candidates.map(c => ({
                        value: c.transactionId,
                        label: `${c.description} — $${Math.abs(c.amount).toFixed(2)} (${c.date})`,
                      }))}
                      value={ambiguousResolutions[amb.order.orderNumber] || null}
                      onChange={val =>
                        setAmbiguousResolutions(prev => ({
                          ...prev,
                          [amb.order.orderNumber]: val || '',
                        }))
                      }
                      size="xs"
                    />
                  </Paper>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {unmatched.length > 0 && (
          <Accordion.Item value="unmatched">
            <Accordion.Control>
              Unmatched Orders ({unmatched.length})
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                {unmatched.map(order => (
                  <Paper key={order.orderNumber} p="sm" withBorder>
                    <Text size="sm" c="dimmed">
                      Order {order.orderNumber} — ${order.totalAmount.toFixed(2)} ({order.orderDate})
                    </Text>
                    <Text size="xs" c="dimmed">
                      {order.items.map(i => i.name).join(', ')}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      No matching bank transaction found
                    </Text>
                  </Paper>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}
      </Accordion>

      <Divider />

      <Button
        onClick={handleContinue}
        disabled={selectedIds.size === 0}
        loading={isProcessing}
      >
        Continue to Categorization ({selectedIds.size} selected)
      </Button>
    </Stack>
  );
}

function MatchCard({
  match,
  selected,
  onToggle,
}: {
  match: AmazonTransactionMatch;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Paper p="sm" withBorder>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Checkbox checked={selected} onChange={onToggle} />
          <div>
            <Group gap="xs">
              <Text size="sm" fw={500}>
                {match.items.map(i => i.name).join(', ')}
              </Text>
              <Badge size="xs" color={confidenceColor(match.matchConfidence)}>
                {match.matchConfidence}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Order {match.orderNumber} — {match.items.length} item{match.items.length > 1 ? 's' : ''}
            </Text>
          </div>
        </Group>
      </Group>
    </Paper>
  );
}
