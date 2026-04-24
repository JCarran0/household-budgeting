import { Fragment, type KeyboardEvent } from 'react';
import { ActionIcon, Box, Group, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { IconChevronRight, IconEdit, IconX } from '@tabler/icons-react';
import { TransactionPreviewTrigger } from '../../transactions/TransactionPreviewTrigger';
import type { Category } from '../../../../../shared/types';
import type { BvaIIParentRow } from '../../../../../shared/utils/bvaIIDataComposition';
import { SECTION_LABEL, type SectionType } from '../../../../../shared/utils/bvaIIDisplay';
import { isBudgetableCategory } from '../../../../../shared/utils/categoryHelpers';
import { formatCurrency } from '../../../utils/formatters';
import { renderAvailableCell, renderRolloverCell } from './bvaIIFormatHelpers';

export interface FilteredParent {
  parent: BvaIIParentRow;
  deEmphasizedChildIds: Set<string>;
}

export interface BvaIISectionTableProps {
  section: SectionType;
  parents: FilteredParent[];
  categories: Category[];
  monthDateRange: { startDate: string; endDate: string };
  rolloverOn: boolean;
  showDismissed: boolean;
  dismissedIds: Set<string>;
  onDismiss: (parentId: string) => void;
  onRestore: (parentId: string) => void;
  isExpanded: (parentId: string) => boolean;
  onToggleExpanded: (parentId: string, currentlyExpanded: boolean) => void;
  onEditBudget: (categoryId: string) => void;
}

export function BvaIISectionTable({
  section,
  parents,
  categories,
  monthDateRange,
  rolloverOn,
  showDismissed,
  dismissedIds,
  onDismiss,
  onRestore,
  isExpanded,
  onToggleExpanded,
  onEditBudget,
}: BvaIISectionTableProps) {
  const visible = parents.filter(
    fp => showDismissed || !dismissedIds.has(fp.parent.parentId),
  );
  if (visible.length === 0) return null;

  return (
    <Paper withBorder p="sm">
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
                const expanded = isExpanded(parent.parentId);
                const isDismissed = dismissedIds.has(parent.parentId);
                const hasChildren = parent.children.length > 0;
                const parentDim = isDismissed;

                return (
                  <Fragment key={parent.parentId}>
                    <Table.Tr
                      style={{ opacity: parentDim ? 0.5 : 1, cursor: hasChildren ? 'pointer' : 'default' }}
                      {...(hasChildren ? {
                        role: 'button',
                        tabIndex: 0,
                        'aria-expanded': expanded,
                        'aria-label': `${parent.parentName}, ${expanded ? 'expanded' : 'collapsed'}. Press Enter or Space to toggle.`,
                        onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onToggleExpanded(parent.parentId, expanded);
                          }
                        },
                      } : {})}
                    >
                      <Table.Td onClick={() => hasChildren && onToggleExpanded(parent.parentId, expanded)}>
                        <Group gap="xs" wrap="nowrap" align="center">
                          {hasChildren ? (
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleExpanded(parent.parentId, expanded);
                              }}
                              aria-label={expanded ? 'Collapse' : 'Expand'}
                              style={{
                                flexShrink: 0,
                                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
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
                      <Table.Td style={{ textAlign: 'right' }}>{renderRolloverCell(parent.rollover, rolloverOn, parentDim)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{renderAvailableCell(parent.available, parentDim)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          {isBudgetableCategory(parent.parentId, categories) && (
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              aria-label="Edit budget"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditBudget(parent.parentId);
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
                              if (isDismissed) onRestore(parent.parentId);
                              else onDismiss(parent.parentId);
                            }}
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                    {expanded && [...parent.children]
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
                            <Table.Td style={{ textAlign: 'right' }}>{renderRolloverCell(child.rollover, rolloverOn, dim)}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>{renderAvailableCell(child.available, dim)}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {isBudgetableCategory(child.categoryId, categories) && (
                                <ActionIcon
                                  variant="subtle"
                                  size="sm"
                                  aria-label="Edit budget"
                                  onClick={() => onEditBudget(child.categoryId)}
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
}
