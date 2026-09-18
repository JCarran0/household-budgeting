/**
 * Wishlist — Zod Validators
 *
 * Neutral module (not the route) so any future chat action re-uses the exact
 * schema the HTTP route parses, and so importing it can never create the
 * `services/index -> chatActions -> routes/X -> services/index` cycle that
 * resolves a route-owned schema to `undefined` at module-eval time. See TD-031
 * and the note at the top of taskValidators.ts.
 */

import { z } from 'zod';
import { WISHLIST_URL_LIMITS, WISHLIST_NOTES_MAX_LENGTH } from '../shared/types';

export const wishlistStatusSchema = z.enum(['PENDING', 'AGREED', 'REJECTED']);

export const wishlistMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month. Use YYYY-MM');

/**
 * SECURITY: the protocol allowlist is the point of this schema, not decoration.
 * Zod's `z.string().url()` accepts ANY parseable scheme — `javascript:alert(1)`
 * and `data:text/html,...` both pass it — and these strings are rendered
 * straight into an `href`. Restricting to http/https here means the stored value
 * can never be a script URL, so no rendering site has to re-check.
 */
export const wishlistUrlSchema = z
  .url({ protocol: /^https?$/, error: 'Links must start with http:// or https://' })
  .max(WISHLIST_URL_LIMITS.maxLength, `Link must be ${WISHLIST_URL_LIMITS.maxLength} characters or fewer`);

export const wishlistUrlsSchema = z
  .array(wishlistUrlSchema)
  .max(WISHLIST_URL_LIMITS.maxCount, `At most ${WISHLIST_URL_LIMITS.maxCount} links per item`);

/**
 * Free text, so there is no format to validate — only a length cap, matching
 * the 1000-char ceiling budgets and project line items already use. An empty
 * string is a legitimate value: it is how the UI clears a note.
 */
export const wishlistNotesSchema = z
  .string()
  .max(WISHLIST_NOTES_MAX_LENGTH, `Note must be ${WISHLIST_NOTES_MAX_LENGTH} characters or fewer`);

export const createWishlistItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer'),
  estimatedAmount: z.number().positive('Amount must be positive'),
  estimatedMonth: wishlistMonthSchema,
  categoryId: z.string().min(1, 'Category is required'),
  status: wishlistStatusSchema.optional(),
  urls: wishlistUrlsSchema.optional(),
  notes: wishlistNotesSchema.optional(),
});

export const updateWishlistItemSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer').optional(),
    estimatedAmount: z.number().positive('Amount must be positive').optional(),
    estimatedMonth: wishlistMonthSchema.optional(),
    categoryId: z.string().min(1, 'Category is required').optional(),
    status: wishlistStatusSchema.optional(),
    // Full replacement, not a merge: [] is a meaningful value that clears links.
    urls: wishlistUrlsSchema.optional(),
    // Likewise '' is meaningful here — it clears the note.
    notes: wishlistNotesSchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });
