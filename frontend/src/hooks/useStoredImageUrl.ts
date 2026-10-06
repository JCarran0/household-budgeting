import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * Object URL for a stored image (`ImageRef.id`), for use as an `<img src>`.
 *
 * The bytes are fetched once per id through the authenticated client and
 * cached for the session: an image id is immutable (replacing an image mints a
 * new id), so the cache can never go stale. Each caller gets its own object
 * URL from the cached Blob and revokes it on unmount or id change, so cached
 * Blobs are shared without leaking URLs.
 */
export function useStoredImageUrl(imageId: string | undefined): {
  url: string | null;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: ['stored-image', imageId],
    queryFn: () => api.getImageBlob(imageId as string),
    enabled: Boolean(imageId),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const [url, setUrl] = useState<string | null>(null);
  const blob = query.data;

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return { url, isError: query.isError };
}
