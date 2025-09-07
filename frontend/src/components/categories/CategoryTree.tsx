import { 
  Stack, 
  Group, 
  Text, 
  Badge, 
  ActionIcon, 
  Collapse,
  Paper,
  ThemeIcon,
  Box,
  Tooltip,
} from '@mantine/core';
import { useState } from 'react';
import {
  IconChevronDown,
  IconChevronRight,
  IconEdit,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconPigMoney,
  IconCategory,
  IconSubtask,
} from '@tabler/icons-react';
import type { CategoryWithChildren } from '../../lib/api';
import type { Category } from '../../../../shared/types';
import { TransactionPreviewTrigger } from '../transactions/TransactionPreviewTrigger';

interface CategoryTreeProps {
  categories: CategoryWithChildren[];
  onEdit: (category: Category) => void;
  onDelete: (categoryId: string) => void;
  transactionCounts?: Record<string, number>;
  dateRange?: { startDate: string; endDate: string };
}

interface CategoryNodeProps {
  category: CategoryWithChildren;
  onEdit: (category: Category) => void;
  onDelete: (categoryId: string) => void;
  level?: number;
  transactionCounts?: Record<string, number>;
  dateRange?: { startDate: string; endDate: string };
}

function CategoryNode({ category, onEdit, onDelete, level = 0, transactionCounts, dateRange }: CategoryNodeProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const hasChildren = category.children && category.children.length > 0;
  const transactionCount = transactionCounts?.[category.id] || 0;
  const isSubcategory = level > 0;

  const handleToggle = (): void => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleEdit = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onEdit(category);
  };

  const handleDelete = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onDelete(category.id);
  };

  return (
    <Box>
      <Paper
        p="sm"
        radius="sm"
        withBorder
        style={{
          marginLeft: level * 24,
          cursor: hasChildren ? 'pointer' : 'default',
        }}
        onClick={handleToggle}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            {hasChildren && (
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={handleToggle}
              >
                {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
              </ActionIcon>
            )}
            
            {!hasChildren && !isSubcategory && (
              <Box w={28} />
            )}

            <ThemeIcon
              size="sm"
              variant="light"
              color={isSubcategory ? "blue" : "indigo"}
            >
              {isSubcategory ? <IconSubtask size={14} /> : <IconCategory size={14} />}
            </ThemeIcon>

            {category.isHidden ? (
              <Tooltip label="Hidden from budgets">
                <IconEyeOff size={16} color="var(--mantine-color-dimmed)" />
              </Tooltip>
            ) : (
              <Tooltip label="Visible in budgets">
                <IconEye size={16} color="var(--mantine-color-dimmed)" />
              </Tooltip>
            )}

            <Tooltip 
              label={category.description || "No description available"} 
              withArrow
              multiline
              maw={300}
              openDelay={500}
              disabled={!category.description}
            >
              <Text fw={isSubcategory ? 400 : 500} size={isSubcategory ? "sm" : "md"}>
                {category.name}
              </Text>
            </Tooltip>

            {category.isHidden && (
              <Text size="xs" c="dimmed">
                (Excluded from budgets)
              </Text>
            )}

            <Group gap={4}>
              {category.isRollover && (
                <Tooltip label="Rollover category">
                  <Badge
                    size="xs"
                    variant="light"
                    color="yellow"
                    leftSection={<IconPigMoney size={10} />}
                  >
                    Rollover
                  </Badge>
                </Tooltip>
              )}
              {transactionCounts && transactionCount > 0 && dateRange ? (
                <TransactionPreviewTrigger
                  categoryId={category.id}
                  categoryName={category.name}
                  dateRange={dateRange}
                  tooltipText={`Click to preview ${transactionCount} transaction${transactionCount === 1 ? '' : 's'}`}
                >
                  <Badge
                    size="xs"
                    variant="filled"
                    color="blue"
                    style={{ cursor: 'pointer' }}
                  >
                    {transactionCount}
                  </Badge>
                </TransactionPreviewTrigger>
              ) : transactionCounts && transactionCount > 0 ? (
                <Tooltip label={`${transactionCount} transaction${transactionCount === 1 ? '' : 's'}`}>
                  <Badge
                    size="xs"
                    variant="filled"
                    color="blue"
                  >
                    {transactionCount}
                  </Badge>
                </Tooltip>
              ) : null}
            </Group>
          </Group>

          <Group gap={4} wrap="nowrap">
            {hasChildren && (
              <Text size="xs" c="dimmed">
                {category.children?.length} subcategor{category.children?.length === 1 ? 'y' : 'ies'}
              </Text>
            )}
            
            <Tooltip label="Edit category">
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={handleEdit}
              >
                <IconEdit size={16} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Delete category">
              <ActionIcon
                variant="subtle"
                size="sm"
                color="red"
                onClick={handleDelete}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Paper>

      {hasChildren && (
        <Collapse in={isExpanded}>
          <Stack gap={4} mt={4}>
            {category.children?.map((child) => (
              <CategoryNode
                key={child.id}
                category={{ ...child, children: [] }}
                onEdit={onEdit}
                onDelete={onDelete}
                level={level + 1}
                transactionCounts={transactionCounts}
                dateRange={dateRange}
              />
            ))}
          </Stack>
        </Collapse>
      )}
    </Box>
  );
}

export function CategoryTree({ categories, onEdit, onDelete, transactionCounts, dateRange }: CategoryTreeProps) {
  return (
    <Stack gap="xs">
      {categories.map((category) => (
        <CategoryNode
          key={category.id}
          category={category}
          onEdit={onEdit}
          onDelete={onDelete}
          transactionCounts={transactionCounts}
          dateRange={dateRange}
        />
      ))}
    </Stack>
  );
}