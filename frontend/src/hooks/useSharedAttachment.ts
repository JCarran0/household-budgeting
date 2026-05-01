import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const SHARE_CACHE_NAME = 'share-target-v1';

/**
 * Reads a file shared into the PWA via the Web Share Target API.
 *
 * Flow: SW intercepts POST /share-target → stores File in Cache Storage at
 * /__share/<id> → 303s to /?share=<id>. This hook consumes the param,
 * fetches the file, deletes the cache entry, and strips the param from
 * the URL. Returns the File once.
 */
export function useSharedAttachment(): File | null {
  const [searchParams, setSearchParams] = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const shareId = searchParams.get('share');

  useEffect(() => {
    if (!shareId) return;
    let cancelled = false;

    (async () => {
      try {
        if (typeof caches === 'undefined') return;
        const cache = await caches.open(SHARE_CACHE_NAME);
        const key = `/__share/${shareId}`;
        const response = await cache.match(key);
        if (!response) return;

        const blob = await response.blob();
        const filenameHeader = response.headers.get('x-share-filename');
        const filename = filenameHeader
          ? decodeURIComponent(filenameHeader)
          : `shared-${Date.now()}`;
        const mimeType =
          response.headers.get('content-type') || blob.type || 'application/octet-stream';

        await cache.delete(key);

        if (cancelled) return;
        setFile(new File([blob], filename, { type: mimeType }));
      } finally {
        if (!cancelled) {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete('share');
              return next;
            },
            { replace: true },
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareId, setSearchParams]);

  return file;
}
