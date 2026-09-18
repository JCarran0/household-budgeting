import { WISHLIST_URL_LIMITS } from '../../../../shared/types';

/**
 * SECURITY: the server's Zod schema (wishlistValidators.ts) is the gate that
 * keeps non-http(s) schemes out of storage. This is a second, independent read
 * of the same fact at the render site, so a `javascript:`/`data:` string that
 * reached storage some other way (a hand-edited JSON file, a schema widened by
 * accident) still never becomes a live href.
 */
export function isRenderableUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Short, human-readable label for a link: the hostname without `www.`, which
 * both reads better than a 200-character product URL and discloses where the
 * link actually goes before it is clicked.
 */
export function hostLabel(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, '');
  } catch {
    return value;
  }
}

/** Client-side mirror of the server rule; the server stays authoritative. */
export function validateUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isRenderableUrl(trimmed)) return 'Links must start with http:// or https://';
  if (trimmed.length > WISHLIST_URL_LIMITS.maxLength) {
    return `Link must be ${WISHLIST_URL_LIMITS.maxLength} characters or fewer`;
  }
  return null;
}
