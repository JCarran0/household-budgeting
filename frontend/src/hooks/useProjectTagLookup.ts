/**
 * Hook: useProjectTagLookup
 *
 * Returns a map from project tag → { id, name } for all known projects.
 * Used by TaskCard and task detail to render the inverse project chip.
 *
 * The hook fetches project summaries via the existing ['projects', 'summaries']
 * React Query key so the data is shared with the Projects page cache.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ProjectSummary } from '../../../shared/types';

export interface ProjectMeta {
  id: string;
  name: string;
}

/**
 * Returns a stable Map<tag, ProjectMeta>.
 * Falls back to an empty map while loading or on error.
 */
export function useProjectTagLookup(): Map<string, ProjectMeta> {
  const { data: projects } = useQuery<ProjectSummary[]>({
    queryKey: ['projects', 'summaries', null],
    queryFn: () => api.getProjectsSummaries(),
    staleTime: 1000 * 60 * 5,
  });

  return useMemo(() => {
    const map = new Map<string, ProjectMeta>();
    if (!projects) return map;
    for (const p of projects) {
      map.set(p.tag, { id: p.id, name: p.name });
    }
    return map;
  }, [projects]);
}
