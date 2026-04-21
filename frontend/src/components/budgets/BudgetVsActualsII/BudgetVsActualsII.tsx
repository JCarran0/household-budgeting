import { Fragment, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  ActionIcon,
  Box,
  Center,
  Chip,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconChevronRight,
  IconEdit,
  IconX,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconAlertTriangle,
  IconInfoCircle,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, parse, startOfMonth } from 'date-fns';
import { TransactionPreviewTrigger } from '../../transactions/TransactionPreviewTrigger';
import { api } from '../../../lib/api';
import type { Category } from '../../../../../shared/types';
import {
  composeBvaII,
  type BvaIIParentRow,
} from '../../../../../shared/utils/bvaIIDataComposition';
import {
  SECTION_LABEL,
  SECTION_ORDER,
  type SectionType,
} from '../../../../../shared/utils/bvaIIDisplay';
import {
  classifyAvailable,
  type VarianceFilter,
} from '../../../../../shared/utils/bvaIIFilters';
import { formatCurrency } from '../../../utils/formatters';
import { CATEGORY_TYPES, useBvaIIUrlState, type CategoryTypeFilter } from './useBvaIIUrlState';
import { useDismissedParentIds } from './useDismissedParentIds';
import { BudgetEditModal } from './BudgetEditModal';
import { isBudgetableCategory } from '../../../../../shared/utils/categoryHelpers';

interface BudgetVsActualsIIProps {
  /** Currently-selected month, shared with the parent Budgets page. YYYY-MM. */
  selectedMonth: string;
  /** Whether this tab is currently active. Gates fetches + expensive compute. */
  active: boolean;
}

interface FilteredParent {
  parent: BvaIIParentRow;
  deEmphasizedChildIds: Set<string>;
}

interface FilteredSection {
  section: SectionType;
  parents: FilteredParent[];
}

/**
 * Tone → Mantine color. Tone is derived from Available sign under BRD Rev-2:
 * positive = favorable (green), negative = unfavorable (red), zero = neutral.
 */
function availableColor(value: number): string | undefined {
  if (value > 0) return 'green';
  if (value < 0) return 'red';
  return undefined;
}

/** Signed formatter — `+$X`, `−$X`, or `$0`. */
function formatSigned(value: number): string {
  if (value > 0) return `+${formatCurrency(value)}`;
  if (value < 0) return `−${formatCurrency(Math.abs(value))}`;
  return formatCurrency(0);
}

/** Direction icon tracks sign of the number. */
function directionIcon(value: number) {
  if (value > 0) return <IconTrendingUp size={14} />;
  if (value < 0) return <IconTrendingDown size={14} />;
  return <IconMinus size={14} />;
}

/**
 * Summary-strip cell: label + info icon with hover tooltip + value.
 * The tooltip is the primary onboarding surface for "what is this number."
 */
function SummaryCell({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="xs" c="dimmed">{label}</Text>
        <Tooltip
          multiline
          w={320}
          withArrow
          position="bottom"
          label={<Stack gap={2}>{tooltip}</Stack>}
        >
          <IconInfoCircle size={12} style={{ color: 'var(--mantine-color-dimmed)', cursor: 'help' }} />
        </Tooltip>
      </Group>
      {children}
    </div>
  );
}

/**
 * BvA II — five-column layout (Category / Actual / Budgeted / Rollover / Available / Actions).
 *
 * Available is tone-signed: positive = ahead of plan, negative = behind plan,
 * consistent across every section. Rollover column is always visible; its
 * styling dims when the Use Rollover toggle is off. See BRD Revision 2.
 */
export function BudgetVsActualsII({ selectedMonth, active }: BudgetVsActualsIIProps) {
  const urlState = useBvaIIUrlState();
  const dismissed = useDismissedParentIds();
  const [userExpanded, setUserExpanded] = useState<Map<string, boolean>>(new Map());
  const [editTarget, setEditTarget] = useState<{ categoryId: string } | null>(null);

  const selectedYear = Number(selectedMonth.slice(0, 4));
  const isJanuary = selectedMonth.slice(5, 7) === '01';
  const selectedDate = useMemo(
    () => parse(`${selectedMonth}-01`, 'yyyy-MM-dd', new Date()),
    [selectedMonth],
  );
  const ytdEnd = useMemo(() => format(endOfMonth(selectedDate), 'yyyy-MM-dd'), [selectedDate]);
  const monthDateRange = useMemo(
    () => ({
      startDate: format(startOfMonth(selectedDate), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(selectedDate), 'yyyy-MM-dd'),
    }),
    [selectedDate],
  );

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

  const sections = useMemo<FilteredSection[]>(() => {
    if (!composition) return [];

    const buckets: Record<SectionType, FilteredParent[]> = {
      income: [],
      spending: [],
      savings: [],
    };

    for (const parent of composition.parents) {
      if (!urlState.types.has(parent.section)) continue;

      const decision = classifyAvailable({
        section: parent.section,
        parent: { budgeted: parent.budgeted, available: parent.available },
        children: parent.children.map(c => ({
          categoryId: c.categoryId,
          budgeted: c.budgeted,
          available: c.available,
        })),
        filter: urlState.variance,
      });
      if (!decision.include) continue;

      buckets[parent.section].push({
        parent,
        deEmphasizedChildIds: decision.deEmphasizedChildIds,
      });
    }

    // Sort by |available| descending; alphabetical tiebreak for stable ordering.
    for (const key of Object.keys(buckets) as SectionType[]) {
      buckets[key].sort((a, b) => {
        const aMag = Math.abs(a.parent.available);
        const bMag = Math.abs(b.parent.available);
        if (aMag !== bMag) return bMag - aMag;
        return a.parent.parentName.localeCompare(b.parent.parentName);
      });
    }

    return SECTION_ORDER
      .filter(section => urlState.types.has(section))
      .map(section => ({ section, parents: buckets[section] }));
  }, [composition, urlState.types, urlState.variance]);

  const visibleParents = useMemo<FilteredParent[]>(() => {
    return sections.flatMap(({ parents }) =>
      parents.filter(p => dismissed.showDismissed || !dismissed.dismissedIds.has(p.parent.parentId)),
    );
  }, [sections, dismissed.showDismissed, dismissed.dismissedIds]);

  const summary = useMemo(() => {
    // Cashflow-convention totals: Income contributes positive, Spending and
    // Savings contribute negative. This matches the dashboard's Cashflow
    // card math (Income − Spending − Savings) and lets the reader interpret
    // Net Actual as "cash left at the end of the month" rather than a
    // meaningless all-positive sum.
    //
    // Rollover and Available are already tone-signed — sum them directly.
    let netActual = 0;
    let netBudgeted = 0;
    let rollover = 0;
    let available = 0;
    let anyRollover = false;
    for (const fp of visibleParents) {
      if (dismissed.dismissedIds.has(fp.parent.parentId)) continue;
      const sign = fp.parent.section === 'income' ? 1 : -1;
      netActual += sign * fp.parent.actual;
      netBudgeted += sign * fp.parent.budgeted;
      if (fp.parent.rollover !== null) {
        rollover += fp.parent.rollover;
        anyRollover = true;
      }
      available += fp.parent.available;
    }
    return { netActual, netBudgeted, rollover, available, anyRollover };
  }, [visibleParents, dismissed.dismissedIds]);

  if (!active) return null;

  const loading = budgetsLoading || transactionsLoading || !categories;

  const effectiveExpanded = (parentId: string): boolean => {
    return userExpanded.get(parentId) ?? false;
  };

  const toggleExpanded = (parentId: string, currentlyExpanded: boolean) => {
    setUserExpanded(prev => {
      const next = new Map(prev);
      next.set(parentId, !currentlyExpanded);
      return next;
    });
  };

  const toggleType = (type: CategoryTypeFilter) => {
    const next = new Set(urlState.types);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    urlState.setTypes(next);
  };

  /**
   * Render the Rollover cell per REQ-010a:
   *   - value null                 → em-dash, dimmed
   *   - value !== null, toggle off → tone-signed number, dimmed (no green/red)
   *   - value !== null, toggle on  → tone-signed number, green/red by sign
   */
  const renderRolloverCell = (value: number | null, rowDim: boolean) => {
    if (value === null) {
      return <Text size="sm" c="dimmed" style={{ opacity: rowDim ? 0.5 : 1, whiteSpace: 'nowrap' }}>—</Text>;
    }
    if (!urlState.rollover) {
      return (
        <Text size="sm" c="dimmed" style={{ opacity: rowDim ? 0.5 : 1, whiteSpace: 'nowrap' }}>
          {formatSigned(value)}
        </Text>
      );
    }
    return (
      <Text size="sm" c={availableColor(value)} fw={500} style={{ opacity: rowDim ? 0.5 : 1, whiteSpace: 'nowrap' }}>
        {formatSigned(value)}
      </Text>
    );
  };

  const renderAvailableCell = (value: number, rowDim: boolean) => {
    const color = availableColor(value);
    return (
      <Group gap={4} wrap="nowrap" justify="flex-end" style={{ opacity: rowDim ? 0.5 : 1, whiteSpace: 'nowrap' }}>
        <Text c={color} fw={500} component="span" style={{ whiteSpace: 'nowrap' }}>{formatSigned(value)}</Text>
        <Text c={color} component="span" aria-hidden style={{ lineHeight: 0 }}>{directionIcon(value)}</Text>
      </Group>
    );
  };

  const renderSection = ({ section, parents }: FilteredSection) => {
    const visible = parents.filter(
      fp => dismissed.showDismissed || !dismissed.dismissedIds.has(fp.parent.parentId),
    );
    if (visible.length === 0) return null;

    return (
      <Paper key={section} withBorder p="sm">
        <Stack gap="xs">
          <Title order={5}>{SECTION_LABEL[section]}</Title>
          <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: '34%', minWidth: 180 }}>Category</Table.Th>
                <Table.Th style={{ textAlign: 'right', minWidth: 90 }}>Actual</Table.Th>
                <Table.Th style={{ textAlign: 'right', minWidth: 100 }}>Budgeted</Table.Th>
                <Table.Th style={{ textAlign: 'right', minWidth: 100 }}>Rollover</Table.Th>
                <Table.Th style={{ textAlign: 'right', minWidth: 120 }}>Available</Table.Th>
                <Table.Th style={{ width: 90, minWidth: 90, textAlign: 'right' }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map(({ parent, deEmphasizedChildIds }) => {
                const isExpanded = effectiveExpanded(parent.parentId);
                const isDismissed = dismissed.dismissedIds.has(parent.parentId);
                const hasChildren = parent.children.length > 0;
                const parentDim = isDismissed;

                return (
                  <Fragment key={parent.parentId}>
                    <Table.Tr
                      style={{ opacity: parentDim ? 0.5 : 1, cursor: hasChildren ? 'pointer' : 'default' }}
                      {...(hasChildren ? {
                        role: 'button',
                        tabIndex: 0,
                        'aria-expanded': isExpanded,
                        'aria-label': `${parent.parentName}, ${isExpanded ? 'expanded' : 'collapsed'}. Press Enter or Space to toggle.`,
                        onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleExpanded(parent.parentId, isExpanded);
                          }
                        },
                      } : {})}
                    >
                      <Table.Td onClick={() => hasChildren && toggleExpanded(parent.parentId, isExpanded)}>
                        <Group gap="xs" wrap="nowrap" align="center">
                          {hasChildren ? (
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(parent.parentId, isExpanded);
                              }}
                              aria-label={isExpanded ? 'Collapse' : 'Expand'}
                              style={{
                                flexShrink: 0,
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 120ms',
                              }}
                            >
                              <IconChevronRight size={14} />
                            </ActionIcon>
                          ) : (
                            <Box w={22} style={{ flexShrink: 0 }} />
                          )}
                          <Text
                            fw={500}
                            td={isDismissed ? 'line-through' : undefined}
                            truncate
                            style={{ minWidth: 0 }}
                          >
                            {parent.parentName}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <TransactionPreviewTrigger
                          categoryId={parent.parentId}
                          categoryName={parent.parentName}
                          dateRange={monthDateRange}
                          additionalCategoryIds={parent.children.map(c => c.categoryId)}
                          tooltipText="Click to preview transactions in this subtree"
                        >
                          <Text style={{ cursor: 'pointer', textAlign: 'right' }}>
                            {formatCurrency(parent.actual)}
                          </Text>
                        </TransactionPreviewTrigger>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatCurrency(parent.budgeted)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{renderRolloverCell(parent.rollover, parentDim)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{renderAvailableCell(parent.available, parentDim)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          {isBudgetableCategory(parent.parentId, categories ?? []) && (
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              aria-label="Edit budget"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditTarget({ categoryId: parent.parentId });
                              }}
                            >
                              <IconEdit size={14} />
                            </ActionIcon>
                          )}
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            color={isDismissed ? 'blue' : 'gray'}
                            aria-label={isDismissed ? 'Restore row' : 'Dismiss row'}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isDismissed) dismissed.restore(parent.parentId);
                              else dismissed.dismiss(parent.parentId);
                            }}
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                    {isExpanded && [...parent.children]
                      .sort((a, b) => {
                        const aMag = Math.abs(a.available);
                        const bMag = Math.abs(b.available);
                        if (aMag !== bMag) return bMag - aMag;
                        return a.categoryName.localeCompare(b.categoryName);
                      })
                      .map(child => {
                        const dim = parentDim || deEmphasizedChildIds.has(child.categoryId);
                        return (
                          <Table.Tr
                            key={`${parent.parentId}-${child.categoryId}`}
                            style={{ opacity: dim ? 0.5 : 1 }}
                          >
                            <Table.Td pl="xl">
                              <Text size="sm" pl="lg">↳ {child.categoryName}</Text>
                            </Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              <TransactionPreviewTrigger
                                categoryId={child.categoryId}
                                categoryName={child.categoryName}
                                dateRange={monthDateRange}
                                tooltipText="Click to preview transactions"
                              >
                                <Text size="sm" style={{ cursor: 'pointer', textAlign: 'right' }}>
                                  {formatCurrency(child.actual)}
                                </Text>
                              </TransactionPreviewTrigger>
                            </Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{formatCurrency(child.budgeted)}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{renderRolloverCell(child.rollover, dim)}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{renderAvailableCell(child.available, dim)}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {isBudgetableCategory(child.categoryId, categories ?? []) && (
                                <ActionIcon
                                  variant="subtle"
                                  size="sm"
                                  aria-label="Edit budget"
                                  onClick={() => setEditTarget({ categoryId: child.categoryId })}
                                >
                                  <IconEdit size={14} />
                                </ActionIcon>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        </Stack>
      </Paper>
    );
  };

  const allTypesOff = urlState.types.size === 0;

  return (
    <Stack gap="md">
      {/* Summary strip — cashflow-convention totals for filter-visible rows.
          Net Actual / Net Budgeted use Income − Spending − Savings (matches
          the dashboard Cashflow card). Rollover / Available are tone-signed
          and sum directly. */}
      <Paper withBorder p="sm">
        <Group justify="space-between" wrap="nowrap">
          <SummaryCell
            label="Net Actual"
            tooltip={
              <>
                <Text size="sm" fw={600} mb={4}>Income − Spending − Savings (actuals)</Text>
                <Text size="sm" mb={4}>
                  Answers: <i>"Am I living within my means this month?"</i>
                </Text>
                <Text size="sm">
                  Positive means you had cash left over after spending and
                  saving. Negative means you drew down reserves or took on
                  credit to cover the gap.
                </Text>
              </>
            }
          >
            <Text fw={600} c={availableColor(summary.netActual)}>
              {formatSigned(summary.netActual)}
            </Text>
          </SummaryCell>

          <SummaryCell
            label="Net Budgeted"
            tooltip={
              <>
                <Text size="sm" fw={600} mb={4}>Income − Spending − Savings (budgets)</Text>
                <Text size="sm" mb={4}>
                  Answers: <i>"What cashflow did I plan for this month?"</i>
                </Text>
                <Text size="sm">
                  Compare with Net Actual to see whether the household is
                  tracking the plan. Matches the Cashflow card on the
                  dashboard.
                </Text>
              </>
            }
          >
            <Text fw={600} c={availableColor(summary.netBudgeted)}>
              {formatSigned(summary.netBudgeted)}
            </Text>
          </SummaryCell>

          <SummaryCell
            label="Total Rollover"
            tooltip={
              <>
                <Text size="sm" fw={600} mb={4}>Sum of rollover carries (tone-signed)</Text>
                <Text size="sm" mb={4}>
                  Answers: <i>"Across my rollover categories, how much surplus or shortfall have I carried in from earlier this year?"</i>
                </Text>
                <Text size="sm">
                  Positive = favorable carry; negative = deficit carried.
                  Dimmed when the Use Rollover toggle is off — the number
                  is informational and isn't acting on Available.
                </Text>
              </>
            }
          >
            {summary.anyRollover ? (
              urlState.rollover ? (
                <Text fw={600} c={availableColor(summary.rollover)}>
                  {formatSigned(summary.rollover)}
                </Text>
              ) : (
                <Text fw={600} c="dimmed">{formatSigned(summary.rollover)}</Text>
              )
            ) : (
              <Text fw={600} c="dimmed">—</Text>
            )}
          </SummaryCell>

          <SummaryCell
            label="Total Available"
            tooltip={
              <>
                <Text size="sm" fw={600} mb={4}>Sum of Available across visible rows (tone-signed)</Text>
                <Text size="sm" mb={4}>
                  Answers: <i>"Across every line, how far ahead or behind plan am I overall?"</i>
                </Text>
                <Text size="sm">
                  Positive = household ahead of plan (surplus to
                  reallocate); negative = behind plan (needs attention).
                  Respects the Use Rollover toggle.
                </Text>
              </>
            }
          >
            <Group gap={4} wrap="nowrap" style={{ whiteSpace: 'nowrap' }}>
              <Text fw={600} c={availableColor(summary.available)}>
                {formatSigned(summary.available)}
              </Text>
              <Text c={availableColor(summary.available)} component="span" aria-hidden style={{ lineHeight: 0 }}>
                {directionIcon(summary.available)}
              </Text>
            </Group>
          </SummaryCell>
        </Group>
      </Paper>

      {/* Control row — type chips, rollover switch, variance filter, show-dismissed. */}
      <Paper withBorder p="sm">
        <Stack gap="xs">
          <Group wrap="wrap" gap="md" align="flex-end">
            <Chip.Group
              multiple
              value={Array.from(urlState.types)}
              onChange={(next) => urlState.setTypes(new Set(next as CategoryTypeFilter[]))}
            >
              <Group gap="xs">
                {CATEGORY_TYPES.map(type => (
                  <Chip key={type} value={type} size="sm" onClick={() => toggleType(type)}>
                    {SECTION_LABEL[type]}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>

            <Stack gap={2}>
              <Switch
                label="Use Rollover"
                checked={urlState.rollover}
                onChange={(e) => urlState.setRollover(e.currentTarget.checked)}
              />
              {urlState.rollover && isJanuary && (
                <Text size="xs" c="dimmed">
                  January is the start of the rollover year — no carry applies yet.
                </Text>
              )}
            </Stack>

            <Select
              label="Variance"
              value={urlState.variance}
              onChange={(v) => urlState.setVariance((v as VarianceFilter) ?? 'all')}
              data={[
                { value: 'all', label: 'All' },
                { value: 'under', label: 'Under budget' },
                { value: 'over', label: 'Over budget' },
                { value: 'serious', label: 'Seriously over budget' },
              ]}
              allowDeselect={false}
              w={200}
            />

            <Switch
              label="Show dismissed"
              checked={dismissed.showDismissed}
              onChange={(e) => dismissed.setShowDismissed(e.currentTarget.checked)}
              disabled={dismissed.dismissedIds.size === 0}
              description={
                dismissed.dismissedIds.size > 0
                  ? `${dismissed.dismissedIds.size} dismissed`
                  : undefined
              }
            />
          </Group>

          {urlState.variance === 'serious' && (
            <Group gap={4}>
              <IconAlertTriangle size={14} />
              <Text size="xs" c="dimmed">
                "Seriously over" — spending over 3× budget, or income/savings under 1/3 of budget.
                Categories with $0 budget excluded.
              </Text>
            </Group>
          )}
        </Stack>
      </Paper>

      {editTarget && categoryById.get(editTarget.categoryId) && composition && (
        <BudgetEditModal
          opened={true}
          onClose={() => setEditTarget(null)}
          category={categoryById.get(editTarget.categoryId)!}
          initialMonth={selectedMonth}
          existingBudgetsByMonth={composition.budgetsByCategoryByMonth.get(editTarget.categoryId) ?? new Map()}
          useRolloverToggleOn={urlState.rollover}
        />
      )}

      {loading ? (
        <Center p="md"><Loader /></Center>
      ) : allTypesOff ? (
        <Paper withBorder p="md">
          <Text c="dimmed">
            No category types selected. Toggle Spending, Income, or Savings above to see your budget.
          </Text>
        </Paper>
      ) : sections.every(s => s.parents.length === 0) ? (
        <Paper withBorder p="md">
          <Text c="dimmed">No matching rows for this filter.</Text>
        </Paper>
      ) : (
        sections.map(renderSection)
      )}
    </Stack>
  );
}
