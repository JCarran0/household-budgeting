import { useState, useMemo } from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Button,
  ActionIcon,
  Tooltip,
  Collapse,
  Table,
  Badge,
  Box,
  Menu,
  Divider,
} from '@mantine/core';
import {
  IconX,
  IconChevronDown,
  IconChevronUp,
  IconCaretDownFilled,
} from '@tabler/icons-react';
import type {
  AutoCatSuggestion,
  AutoCatSuggestionTxn,
  AutoCategorizeRule,
} from '../../../../shared/types';
import { formatCurrency } from '../../utils/formatters';

const MAX_PATTERNS_PER_RULE = 10;

export type SuggestedRuleAction =
  | { kind: 'create' }
  | { kind: 'append'; ruleId: string };

interface Props {
  suggestion: AutoCatSuggestion;
  /** All existing auto-cat rules; drives the "Add to existing" submenu. */
  existingRules: AutoCategorizeRule[];
  onAction: (suggestion: AutoCatSuggestion, action: SuggestedRuleAction) => void;
  onDismiss: (normalizedKey: string) => void;
  isBusy?: boolean;
}

function pluralize(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
}

function PreviewTable({
  title,
  txns,
  emptyText,
}: {
  title: string;
  txns: AutoCatSuggestionTxn[];
  emptyText: string;
}) {
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600} c="dimmed">
        {title}
      </Text>
      {txns.length === 0 ? (
        <Text size="xs" c="dimmed" fs="italic">
          {emptyText}
        </Text>
      ) : (
        <Table fz="xs" verticalSpacing={4} highlightOnHover>
          <Table.Tbody>
            {txns.map(t => (
              <Table.Tr key={t.id}>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{t.date}</Table.Td>
                <Table.Td>{t.description}</Table.Td>
                <Table.Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {formatCurrency(t.amount, true)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}

interface RuleMenuEntry {
  rule: AutoCategorizeRule;
  isSameCategory: boolean;
  atCap: boolean;
}

function buildRuleMenuEntries(
  rules: AutoCategorizeRule[],
  topCategoryId: string,
): { sameCategory: RuleMenuEntry[]; otherCategory: RuleMenuEntry[] } {
  const same: RuleMenuEntry[] = [];
  const other: RuleMenuEntry[] = [];
  for (const rule of rules) {
    const entry: RuleMenuEntry = {
      rule,
      isSameCategory: rule.categoryId === topCategoryId,
      atCap: rule.patterns.length >= MAX_PATTERNS_PER_RULE,
    };
    if (entry.isSameCategory) same.push(entry);
    else other.push(entry);
  }
  // Within each group, sort by priority (lower = higher priority).
  same.sort((a, b) => a.rule.priority - b.rule.priority);
  other.sort((a, b) => a.rule.priority - b.rule.priority);
  return { sameCategory: same, otherCategory: other };
}

export function SuggestedRuleCard({
  suggestion,
  existingRules,
  onAction,
  onDismiss,
  isBusy,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const { sameCategory, otherCategory } = useMemo(
    () => buildRuleMenuEntries(existingRules, suggestion.topCategoryId),
    [existingRules, suggestion.topCategoryId],
  );

  const renderMenuItem = (entry: RuleMenuEntry) => {
    const tooltip = entry.atCap
      ? `At the ${MAX_PATTERNS_PER_RULE}-pattern limit — remove a pattern from this rule first.`
      : `${entry.rule.categoryName ?? 'Unknown'} · ${entry.rule.patterns.length}/${MAX_PATTERNS_PER_RULE} patterns`;
    return (
      <Tooltip
        key={entry.rule.id}
        label={tooltip}
        position="left"
        withinPortal
      >
        <Menu.Item
          disabled={entry.atCap}
          onClick={() =>
            onAction(suggestion, { kind: 'append', ruleId: entry.rule.id })
          }
        >
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Text size="sm" truncate>
              {entry.rule.description}
            </Text>
            <Badge
              variant="light"
              color={entry.isSameCategory ? 'green' : 'gray'}
              size="xs"
            >
              {entry.rule.categoryName ?? '—'}
            </Badge>
          </Group>
        </Menu.Item>
      </Tooltip>
    );
  };

  const hasAnyRules = sameCategory.length + otherCategory.length > 0;

  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" wrap="wrap">
            <Text fw={600} size="md">
              {suggestion.displayLabel}
            </Text>
            <Badge variant="dot" color="green" size="sm">
              {suggestion.topCategoryName}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            You categorize this as{' '}
            <Text span fw={500} c="bright">
              {suggestion.topCategoryName}
            </Text>{' '}
            {suggestion.agreementPct}% of the time ({suggestion.topCategoryCount} of{' '}
            {suggestion.clusterSize} past matches in the last 180 days)
          </Text>
          <Text size="sm">
            Would categorize{' '}
            <Text span fw={600}>
              {suggestion.pendingMatchCount}
            </Text>{' '}
            pending uncategorized {pluralize('transaction', suggestion.pendingMatchCount)}
          </Text>
        </Stack>
        <Tooltip label="Dismiss suggestion">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Dismiss suggestion"
            onClick={() => onDismiss(suggestion.normalizedKey)}
          >
            <IconX size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Group mt="sm" justify="space-between">
        <Button
          variant="subtle"
          size="xs"
          rightSection={
            previewOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
          }
          onClick={() => setPreviewOpen(o => !o)}
        >
          {previewOpen ? 'Hide preview' : 'Preview matches'}
        </Button>
        <Group gap={0} wrap="nowrap">
          <Button
            size="xs"
            loading={isBusy}
            onClick={() => onAction(suggestion, { kind: 'create' })}
            style={{
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
            }}
          >
            Create rule
          </Button>
          <Menu position="bottom-end" withinPortal shadow="md">
            <Menu.Target>
              <ActionIcon
                size="md"
                variant="filled"
                disabled={isBusy}
                aria-label="More rule actions"
                style={{
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  borderLeft: '1px solid var(--mantine-color-blue-7)',
                  height: 'auto',
                  alignSelf: 'stretch',
                }}
              >
                <IconCaretDownFilled size={12} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                onClick={() => onAction(suggestion, { kind: 'create' })}
              >
                Create new rule
              </Menu.Item>
              {hasAnyRules && (
                <>
                  <Divider />
                  <Menu.Label>Add to existing rule</Menu.Label>
                  {sameCategory.length === 0 && otherCategory.length === 0 && (
                    <Menu.Item disabled>No existing rules</Menu.Item>
                  )}
                  {sameCategory.map(renderMenuItem)}
                  {sameCategory.length > 0 && otherCategory.length > 0 && (
                    <Divider />
                  )}
                  {otherCategory.map(renderMenuItem)}
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <Collapse in={previewOpen}>
        <Box mt="sm">
          <Stack gap="md">
            <PreviewTable
              title={`Pending matches (${suggestion.pendingMatchCount})`}
              txns={suggestion.pendingTxns}
              emptyText="None — the rule has nothing to apply to right now."
            />
            <PreviewTable
              title={`Categorized examples (showing ${suggestion.sampleCategorizedTxns.length} of ${suggestion.clusterSize})`}
              txns={suggestion.sampleCategorizedTxns}
              emptyText="No examples available."
            />
          </Stack>
        </Box>
      </Collapse>
    </Card>
  );
}
