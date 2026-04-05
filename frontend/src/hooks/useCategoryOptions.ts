import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Category } from '../../../shared/types';

interface UseCategoryOptionsConfig {
  /** Pass categories directly instead of fetching. When provided, the internal query is disabled. */
  categories?: Category[];
  /** Include "Uncategorized" as the first option. Default: false */
  includeUncategorized?: boolean;
  /** How to handle hidden categories. 'include' labels them; 'exclude' removes them. Default: 'include' */
  hiddenMode?: 'include' | 'exclude';
  /** Optional prefix function for labels (e.g., emoji indicators) */
  labelPrefix?: (category: Category, allCategories: Category[]) => string;
  /** Optional filter predicate applied after hidden filtering */
  filter?: (category: Category, allCategories: Category[]) => boolean;
  /** Whether the internal query is enabled (for modals). Default: true */
  enabled?: boolean;
}

interface UseCategoryOptionsReturn {
  options: Array<{ value: string; label: string }>;
  categories: Category[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useCategoryOptions(config: UseCategoryOptionsConfig = {}): UseCategoryOptionsReturn {
  const {
    categories: categoriesProp,
    includeUncategorized = false,
    hiddenMode = 'include',
    labelPrefix,
    filter,
    enabled = true,
  } = config;

  const { data: fetchedCategories, isLoading, error } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
    enabled: !categoriesProp && enabled,
    staleTime: 5 * 60 * 1000,
  });

  const categories = categoriesProp ?? fetchedCategories;

  const options = useMemo(() => {
    if (!categories || categories.length === 0) return [];

    const result: Array<{ value: string; label: string }> = [];

    if (includeUncategorized) {
      result.push({ value: 'uncategorized', label: 'Uncategorized' });
    }

    let filtered = categories;

    if (hiddenMode === 'exclude') {
      const hiddenParentIds = new Set(
        categories.filter(c => !c.parentId && c.isHidden).map(c => c.id)
      );
      filtered = filtered.filter(cat => {
        if (cat.isHidden) return false;
        if (cat.parentId && hiddenParentIds.has(cat.parentId)) return false;
        return true;
      });
    }

    if (filter) {
      filtered = filtered.filter(cat => filter(cat, categories));
    }

    for (const cat of filtered) {
      const parentCategory = cat.parentId
        ? categories.find(p => p.id === cat.parentId)
        : null;

      let label = parentCategory
        ? `${parentCategory.name} → ${cat.name}`
        : cat.name || '';

      if (hiddenMode === 'include' && cat.isHidden) {
        label = `${label} (Excluded from budgets)`;
      }

      if (labelPrefix) {
        label = `${labelPrefix(cat, categories)}${label}`;
      }

      if (cat.id && label) {
        result.push({ value: cat.id, label });
      }
    }

    return result.sort((a, b) => a.label.localeCompare(b.label));
  }, [categories, includeUncategorized, hiddenMode, filter, labelPrefix]);

  return {
    options,
    categories,
    isLoading: !categoriesProp && isLoading,
    error: !categoriesProp ? error : null,
  };
}
