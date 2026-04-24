import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CATEGORY_TYPES,
  parseTypes,
  parseVariance,
  serializeTypes,
  serializeVariance,
  type CategoryTypeFilter,
  type VarianceFilter,
} from '../../../../../shared/utils/bvaSerialization';

/**
 * URL-backed state for the Budget vs. Actuals tab.
 *
 * Persisted params per BUDGET-VS-ACTUALS-II-BRD §6.1:
 *   - rollover   — '1' when on; omitted when off
 *   - types      — csv subset of spending,income,savings; omitted when all;
 *                  'none' sentinel when deliberately empty (REQ-017)
 *   - variance   — under | over | serious; omitted when 'all'
 *
 * `month` and `view` are managed by the parent Budgets page, not this hook.
 * Pure (de)serialization lives in shared/utils/bvaSerialization.ts.
 */

export { CATEGORY_TYPES };
export type { CategoryTypeFilter, VarianceFilter };

export interface BvaUrlState {
  rollover: boolean;
  types: Set<CategoryTypeFilter>;
  variance: VarianceFilter;
  setRollover: (next: boolean) => void;
  setTypes: (next: Set<CategoryTypeFilter>) => void;
  setVariance: (next: VarianceFilter) => void;
}

export function useBvaUrlState(): BvaUrlState {
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
      const serialized = serializeTypes(next);
      if (serialized === null) prev.delete('types');
      else prev.set('types', serialized);
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const setVariance = useCallback((next: VarianceFilter) => {
    setSearchParams(prev => {
      const serialized = serializeVariance(next);
      if (serialized === null) prev.delete('variance');
      else prev.set('variance', serialized);
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  return {
    rollover,
    types,
    variance,
    setRollover,
    setTypes,
    setVariance,
  };
}
