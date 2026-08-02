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
import {
  parseBvaSortDirection,
  parseBvaSortField,
  serializeBvaSortDirection,
  serializeBvaSortField,
  type BvaSortDirection,
  type BvaSortField,
} from '../../../../../shared/utils/bvaSort';

/**
 * URL-backed state for the Budget vs. Actuals tab.
 *
 * Persisted params per BUDGET-VS-ACTUALS-II-BRD §6.1:
 *   - rollover   — '1' when on; omitted when off
 *   - types      — csv subset of spending,income,savings; omitted when all;
 *                  'none' sentinel when deliberately empty (REQ-017)
 *   - variance   — under | over | serious; omitted when 'all'
 *   - sort       — actual | budgeted | rollover | available | name; omitted
 *                  when 'absoluteGap' (the default)
 *   - dir        — 'asc'; omitted when 'desc' (the default)
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
  sort: BvaSortField;
  direction: BvaSortDirection;
  setRollover: (next: boolean) => void;
  setTypes: (next: Set<CategoryTypeFilter>) => void;
  setVariance: (next: VarianceFilter) => void;
  setSort: (next: BvaSortField) => void;
  setDirection: (next: BvaSortDirection) => void;
}

export function useBvaUrlState(): BvaUrlState {
  const [searchParams, setSearchParams] = useSearchParams();

  const rollover = searchParams.get('rollover') === '1';
  const types = useMemo(() => parseTypes(searchParams.get('types')), [searchParams]);
  const variance = parseVariance(searchParams.get('variance'));
  const sort = parseBvaSortField(searchParams.get('sort'));
  const direction = parseBvaSortDirection(searchParams.get('dir'));

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

  const setSort = useCallback((next: BvaSortField) => {
    setSearchParams(prev => {
      const serialized = serializeBvaSortField(next);
      if (serialized === null) prev.delete('sort');
      else prev.set('sort', serialized);
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const setDirection = useCallback((next: BvaSortDirection) => {
    setSearchParams(prev => {
      const serialized = serializeBvaSortDirection(next);
      if (serialized === null) prev.delete('dir');
      else prev.set('dir', serialized);
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  return {
    rollover,
    types,
    variance,
    sort,
    direction,
    setRollover,
    setTypes,
    setVariance,
    setSort,
    setDirection,
  };
}
