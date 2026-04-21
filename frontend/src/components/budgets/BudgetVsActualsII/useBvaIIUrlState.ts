import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL-backed state for the Budget vs. Actuals II tab.
 *
 * Persisted params per BUDGET-VS-ACTUALS-II-BRD §6.1:
 *   - rollover   — '1' when on; omitted when off
 *   - types      — csv subset of spending,income,savings; omitted when all
 *   - variance   — under | over | serious; omitted when 'all'
 *
 * `month` and `view` are managed by the parent Budgets page, not this hook.
 * Invalid values silently fall back to defaults (REQ-047). Params are omitted
 * when at default to keep URLs clean.
 */

export const CATEGORY_TYPES = ['spending', 'income', 'savings'] as const;
export type CategoryTypeFilter = typeof CATEGORY_TYPES[number];

export type VarianceFilter = 'all' | 'under' | 'over' | 'serious';

export interface BvaIIUrlState {
  rollover: boolean;
  types: Set<CategoryTypeFilter>;
  variance: VarianceFilter;
  setRollover: (next: boolean) => void;
  setTypes: (next: Set<CategoryTypeFilter>) => void;
  setVariance: (next: VarianceFilter) => void;
}

const ALL_TYPES: ReadonlySet<CategoryTypeFilter> = new Set(CATEGORY_TYPES);

function parseTypes(raw: string | null): Set<CategoryTypeFilter> {
  if (!raw) return new Set(ALL_TYPES);
  const tokens = raw.split(',').map(t => t.trim()).filter(Boolean);
  const next = new Set<CategoryTypeFilter>();
  for (const t of tokens) {
    if ((CATEGORY_TYPES as readonly string[]).includes(t)) {
      next.add(t as CategoryTypeFilter);
    }
  }
  // Invalid payloads → silent default (REQ-047).
  if (next.size === 0) return new Set(ALL_TYPES);
  return next;
}

function parseVariance(raw: string | null): VarianceFilter {
  if (raw === 'under' || raw === 'over' || raw === 'serious') return raw;
  return 'all';
}

function typesEqualAll(types: Set<CategoryTypeFilter>): boolean {
  if (types.size !== ALL_TYPES.size) return false;
  for (const t of ALL_TYPES) if (!types.has(t)) return false;
  return true;
}

export function useBvaIIUrlState(): BvaIIUrlState {
  const [searchParams, setSearchParams] = useSearchParams();

  const rollover = searchParams.get('rollover') === '1';
  const types = useMemo(() => parseTypes(searchParams.get('types')), [searchParams]);
  const variance = parseVariance(searchParams.get('variance'));

  const setRollover = useCallback((next: boolean) => {
    setSearchParams(prev => {
      if (next) prev.set('rollover', '1');
      else prev.delete('rollover');
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const setTypes = useCallback((next: Set<CategoryTypeFilter>) => {
    setSearchParams(prev => {
      if (next.size === 0 || typesEqualAll(next)) {
        // Represent "all three selected" as omitted for clean URLs.
        // Empty selection is meaningful (BRD REQ-017 empty-state) but we
        // still represent it explicitly so it survives reload — use a
        // sentinel 'none' value.
        if (next.size === 0) prev.set('types', 'none');
        else prev.delete('types');
      } else {
        const ordered = CATEGORY_TYPES.filter(t => next.has(t));
        prev.set('types', ordered.join(','));
      }
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const setVariance = useCallback((next: VarianceFilter) => {
    setSearchParams(prev => {
      if (next === 'all') prev.delete('variance');
      else prev.set('variance', next);
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  // Special-case: if the URL has types=none, honor the empty-selection state.
  const typesAccountingForNone = useMemo(() => {
    if (searchParams.get('types') === 'none') return new Set<CategoryTypeFilter>();
    return types;
  }, [searchParams, types]);

  return {
    rollover,
    types: typesAccountingForNone,
    variance,
    setRollover,
    setTypes,
    setVariance,
  };
}
