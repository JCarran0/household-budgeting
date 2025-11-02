import { useMemo, type ComponentPropsWithoutRef } from 'react';
import { Select } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Category } from '../../../../shared/types';

interface CategoryPickerProps extends Omit<ComponentPropsWithoutRef<typeof Select>, 'data' | 'value' | 'onChange'> {
  value: string | null;
  onChange: (value: string | null) => void;
  excludeCategoryId?: string; // Category to exclude from options (e.g., category being deleted)
  includeUncategorized?: boolean; // Whether to include "Uncategorized" option
}

export function CategoryPicker({
  value,
  onChange,
  excludeCategoryId,
  includeUncategorized = false,
  ...selectProps
}: CategoryPickerProps) {
  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: api.getCategories,
  });

  // Build category options in hierarchical format
  const categoryOptions = useMemo(() => {
    if (!categories) return [];

    const options: Array<{ value: string; label: string }> = [];

    // Add uncategorized option if requested
    if (includeUncategorized) {
      options.push({ value: 'uncategorized', label: 'Uncategorized' });
    }

    // Filter out the excluded category
    const filteredCategories = categories.filter((c: Category) => c.id !== excludeCategoryId);

    // Build hierarchical options: parent categories with their children indented
    const parentCategories = filteredCategories.filter((c: Category) => !c.parentId);

    parentCategories.forEach((parent: Category) => {
      // Add parent category
      const parentLabel = parent.isHidden
        ? `👁️‍🗨️ ${parent.name} (Excluded from budgets)`
        : parent.name;
      options.push({ value: parent.id, label: parentLabel });

      // Add children with indentation
      const children = filteredCategories
        .filter((c: Category) => c.parentId === parent.id)
        .sort((a: Category, b: Category) => a.name.localeCompare(b.name));

      children.forEach((child: Category) => {
        const childLabel = child.isHidden
          ? `  → 👁️‍🗨️ ${child.name} (Excluded from budgets)`
          : `  → ${child.name}`;
        options.push({ value: child.id, label: childLabel });
      });
    });

    return options;
  }, [categories, excludeCategoryId, includeUncategorized]);

  return (
    <Select
      data={categoryOptions}
      value={value}
      onChange={onChange}
      searchable
      {...selectProps}
    />
  );
}
