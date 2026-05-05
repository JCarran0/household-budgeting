import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL-backed disclosure — drop-in replacement for Mantine's `useDisclosure`
 * that mirrors open/close to a search param. Browser Back closes the modal,
 * deep links open it, refresh preserves it.
 *
 * Param convention: `?<key>=1` when open; omitted when closed. Multiple
 * modals can coexist in the URL by using distinct keys.
 *
 * History semantics:
 *   - open()       → push a new history entry, so Back closes the modal
 *   - close()      → replace the current entry, so Back skips the just-closed
 *                    state and lands on whatever came before the open
 *   - browser Back → URL changes; `opened` derives from URL, modal closes
 *
 * For modals keyed to an entity (e.g. edit-task with an id), prefer a sibling
 * `useUrlEntityModal(key)` that stores the id directly (`?editTask=<id>`).
 */
export function useUrlDisclosure(
  key: string,
): [boolean, { open: () => void; close: () => void; toggle: () => void }] {
  const [searchParams, setSearchParams] = useSearchParams();
  const opened = searchParams.get(key) === '1';

  const open = useCallback(() => {
    if (searchParams.get(key) === '1') return;
    setSearchParams(prev => {
      prev.set(key, '1');
      return prev;
    });
  }, [key, searchParams, setSearchParams]);

  const close = useCallback(() => {
    if (!searchParams.has(key)) return;
    setSearchParams(
      prev => {
        prev.delete(key);
        return prev;
      },
      { replace: true },
    );
  }, [key, searchParams, setSearchParams]);

  const toggle = useCallback(() => {
    if (opened) close();
    else open();
  }, [opened, open, close]);

  return [opened, { open, close, toggle }];
}
