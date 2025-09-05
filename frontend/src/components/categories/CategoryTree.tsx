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

interface CategoryTreeProps {
  categories: CategoryWithChildren[];
  onEdit: (category: Category) => void;
  onDelete: (categoryId: string) => void;
}

interface CategoryNodeProps {
  category: CategoryWithChildren;
  onEdit: (category: Category) => void;
  onDelete: (categoryId: string) => void;
  level?: number;
}

function CategoryNode({ category, onEdit, onDelete, level = 0 }: CategoryNodeProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const hasChildren = category.children && category.children.length > 0;
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

            <Text fw={isSubcategory ? 400 : 500} size={isSubcategory ? "sm" : "md"}>
              {category.name}
            </Text>

            {category.isHidden && (
              <Text size="xs" c="dimmed">
                (Excluded from budgets)
              </Text>
            )}

            <Group gap={4}>
              {category.isSavings && (
                <Tooltip label="Savings category">
                  <Badge
                    size="xs"
                    variant="light"
                    color="yellow"
                    leftSection={<IconPigMoney size={10} />}
                  >
                    Savings
                  </Badge>
                </Tooltip>
              )}
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
              />
            ))}
          </Stack>
        </Collapse>
      )}
    </Box>
  );
}

export function CategoryTree({ categories, onEdit, onDelete }: CategoryTreeProps) {
  return (
    <Stack gap="xs">
      {categories.map((category) => (
        <CategoryNode
          key={category.id}
          category={category}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </Stack>
  );
}