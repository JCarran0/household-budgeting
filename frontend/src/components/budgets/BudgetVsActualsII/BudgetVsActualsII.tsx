import { Fragment, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Center,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import {
  IconChevronRight,
  IconEdit,
  IconX,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, parse } from 'date-fns';
import { api } from '../../../lib/api';
import type { Category } from '../../../../../shared/types';
import { composeBvaII } from '../../../../../shared/utils/bvaIIDataComposition';
import {
  SECTION_LABEL,
  SECTION_ORDER,
  getSectionType,
  getVarianceTone,
  type SectionType,
  type VarianceTone,
} from '../../../../../shared/utils/bvaIIDisplay';
import { formatCurrency } from '../../../utils/formatters';
import { useBvaIIUrlState } from './useBvaIIUrlState';
import { useDismissedParentIds } from './useDismissedParentIds';
import type { TreeAggregation } from '../../../../../shared/utils/budgetCalculations';

interface BudgetVsActualsIIProps {
  /** Currently-selected month, shared with the parent Budgets page. YYYY-MM. */
  selectedMonth: string;
  /** Whether this tab is currently active. Gates fetches + expensive compute. */
  active: boolean;
}

interface SectionGroup {
  section: SectionType;
  trees: TreeAggregation[];
}

function toneMantineColor(tone: VarianceTone): string | undefined {
  if (tone === 'favorable') return 'green';
  if (tone === 'unfavorable') return 'red';
  return undefined;
}

/** Signed variance formatter — never flips sign by section (REQ-032). */
function formatSignedVariance(variance: number): string {
  if (variance > 0) return `+${formatCurrency(variance)}`;
  if (variance < 0) return `−${formatCurrency(Math.abs(variance))}`;
  return formatCurrency(0);
}

/** A11y pair for color — icon carries direction for colorblind users (REQ-051). */
function toneIcon(tone: VarianceTone) {
  if (tone === 'favorable') return <IconTrendingUp size={14} />;
  if (tone === 'unfavorable') return <IconTrendingDown size={14} />;
  return <IconMinus size={14} />;
}

export function BudgetVsActualsII({ selectedMonth, active }: BudgetVsActualsIIProps) {
  const urlState = useBvaIIUrlState();
  const dismissed = useDismissedParentIds();
  // Session-only accordion expand state (REQ-007). Not URL-persisted.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const selectedYear = Number(selectedMonth.slice(0, 4));
  const selectedDate = useMemo(
    () => parse(`${selectedMonth}-01`, 'yyyy-MM-dd', new Date()),
    [selectedMonth],
  );
  const ytdEnd = useMemo(() => format(endOfMonth(selectedDate), 'yyyy-MM-dd'), [selectedDate]);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    enabled: active,
  });

  const { data: yearlyBudgetData, isLoading: budgetsLoading } = useQuery({
    queryKey: ['budgets', 'year', selectedYear],
    queryFn: () => api.getYearlyBudgets(selectedYear),
    enabled: active,
  });

  const { data: ytdTransactionData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['bva-ii', 'transactions', selectedYear, selectedMonth],
    queryFn: () => api.getTransactions({
      startDate: `${selectedYear}-01-01`,
      endDate: ytdEnd,
    }),
    enabled: active,
  });

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    if (categories) for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const composition = useMemo(() => {
    if (!categories || !yearlyBudgetData || !ytdTransactionData) return null;
    return composeBvaII({
      categories,
      yearlyBudgets: yearlyBudgetData.budgets,
      yearlyTransactions: ytdTransactionData.transactions,
      selectedMonth,
      useRollover: urlState.rollover,
    });
  }, [categories, yearlyBudgetData, ytdTransactionData, selectedMonth, urlState.rollover]);

  const sections = useMemo<SectionGroup[]>(() => {
    if (!composition || categoryById.size === 0) return [];
    const groups: Record<SectionType, TreeAggregation[]> = {
      income: [],
      spending: [],
      savings: [],
    };
    for (const tree of composition.trees.values()) {
      const s = getSectionType(tree, categoryById);
      groups[s].push(tree);
    }
    for (const key of Object.keys(groups) as SectionType[]) {
      groups[key].sort((a, b) => a.parentName.localeCompare(b.parentName));
    }
    return SECTION_ORDER.map(section => ({ section, trees: groups[section] }));
  }, [composition, categoryById]);

  // Filter-visible trees feed the summary strip. In Phase 3 with no filters,
  // this is simply "not in the dismissed set (unless showDismissed is on)".
  // Type / variance filters land in Phase 4.
  const visibleTreesFlat = useMemo<TreeAggregation[]>(() => {
    return sections.flatMap(({ trees }) =>
      trees.filter(t => dismissed.showDismissed || !dismissed.dismissedIds.has(t.parentId)),
    );
  }, [sections, dismissed.showDismissed, dismissed.dismissedIds]);

  const summary = useMemo(() => {
    let actual = 0;
    let budgeted = 0;
    const mixedSections = new Set<SectionType>();
    for (const t of visibleTreesFlat) {
      actual += t.effectiveActual;
      budgeted += t.effectiveBudget;
      mixedSections.add(getSectionType(t, categoryById));
    }
    const variance = actual - budgeted;
    // Aggregate goodness only meaningful when all visible rows share a section.
    const sole = mixedSections.size === 1 ? [...mixedSections][0] : null;
    const tone: VarianceTone = sole ? getVarianceTone(sole, actual, budgeted) : 'neutral';
    return { actual, budgeted, variance, tone };
  }, [visibleTreesFlat, categoryById]);

  if (!active) return null;

  const loading = budgetsLoading || transactionsLoading || !categories;

  const toggleExpanded = (parentId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  const renderVarianceCell = (section: SectionType, actual: number, budgeted: number) => {
    const variance = actual - budgeted;
    const tone = getVarianceTone(section, actual, budgeted);
    const color = toneMantineColor(tone);
    return (
      <Group gap={4} wrap="nowrap">
        <Text c={color} fw={500} component="span">
          {formatSignedVariance(variance)}
        </Text>
        <Text c={color} component="span" aria-hidden>{toneIcon(tone)}</Text>
      </Group>
    );
  };

  const renderSection = ({ section, trees }: SectionGroup) => {
    const visible = trees.filter(
      t => dismissed.showDismissed || !dismissed.dismissedIds.has(t.parentId),
    );
    if (visible.length === 0) return null;

    return (
      <Paper key={section} withBorder p="sm">
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>{SECTION_LABEL[section]}</Title>
            <Badge variant="light" color={section === 'income' ? 'green' : section === 'savings' ? 'blue' : 'gray'}>
              {visible.length} {visible.length === 1 ? 'row' : 'rows'}
            </Badge>
          </Group>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: '40%' }}>Category</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Actual</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Budgeted</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Variance</Table.Th>
                <Table.Th style={{ width: 80, textAlign: 'right' }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map(tree => {
                const isExpanded = expanded.has(tree.parentId);
                const isDismissed = dismissed.dismissedIds.has(tree.parentId);
                const hasChildren = tree.children.length > 0;
                const rowOpacity = isDismissed ? 0.5 : 1;

                return (
                  <Fragment key={tree.parentId}>
                    <Table.Tr style={{ opacity: rowOpacity, cursor: hasChildren ? 'pointer' : 'default' }}>
                      <Table.Td onClick={() => hasChildren && toggleExpanded(tree.parentId)}>
                        <Group gap="xs">
                          {hasChildren ? (
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(tree.parentId);
                              }}
                              aria-label={isExpanded ? 'Collapse' : 'Expand'}
                              style={{
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 120ms',
                              }}
                            >
                              <IconChevronRight size={14} />
                            </ActionIcon>
                          ) : (
                            <Box w={22} />
                          )}
                          <Text fw={500} td={isDismissed ? 'line-through' : undefined}>
                            {tree.parentName}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {formatCurrency(tree.effectiveActual)}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {formatCurrency(tree.effectiveBudget)}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {renderVarianceCell(section, tree.effectiveActual, tree.effectiveBudget)}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            aria-label="Edit budget"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            color={isDismissed ? 'blue' : 'gray'}
                            aria-label={isDismissed ? 'Restore row' : 'Dismiss row'}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isDismissed) dismissed.restore(tree.parentId);
                              else dismissed.dismiss(tree.parentId);
                            }}
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                    {isExpanded && tree.children.map(child => (
                      <Table.Tr key={`${tree.parentId}-${child.categoryId}`} style={{ opacity: rowOpacity }}>
                        <Table.Td pl="xl">
                          <Text size="sm" pl="lg">↳ {child.categoryName}</Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>
                          {formatCurrency(child.actual)}
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>
                          {formatCurrency(child.budgeted)}
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>
                          {renderVarianceCell(section, child.actual, child.budgeted)}
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            aria-label="Edit budget"
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Fragment>
                );
              })}
            </Table.Tbody>
          </Table>
        </Stack>
      </Paper>
    );
  };

  return (
    <Stack gap="md">
      {/* Summary strip (BRD §9). Sums the filter-visible rows only. */}
      <Paper withBorder p="sm">
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text size="xs" c="dimmed">Total Actual</Text>
            <Text fw={600}>{formatCurrency(summary.actual)}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">Total Budgeted</Text>
            <Text fw={600}>{formatCurrency(summary.budgeted)}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">Total Variance</Text>
            <Group gap={4} wrap="nowrap">
              <Text fw={600} c={toneMantineColor(summary.tone)}>
                {formatSignedVariance(summary.variance)}
              </Text>
              <Text c={toneMantineColor(summary.tone)} component="span" aria-hidden>
                {toneIcon(summary.tone)}
              </Text>
            </Group>
          </div>
          <div>
            <Text size="xs" c="dimmed">Rollover</Text>
            <Text fw={600}>{urlState.rollover ? 'On' : 'Off'}</Text>
          </div>
        </Group>
      </Paper>

      {loading ? (
        <Center p="md"><Loader /></Center>
      ) : sections.every(s => s.trees.length === 0) ? (
        <Paper withBorder p="md">
          <Text c="dimmed">No budget data for this month yet.</Text>
        </Paper>
      ) : (
        sections.map(renderSection)
      )}
    </Stack>
  );
}
