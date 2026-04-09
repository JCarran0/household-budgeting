/**
 * Amazon Receipt Matching — Zod Validators
 *
 * Two categories of schemas:
 * 1. Claude output validation — defense-in-depth against adversarial PDF content.
 *    These validate structured data extracted by Claude before it is persisted.
 * 2. API request validation — standard input validation for route handlers.
 */

import { z } from 'zod';

// =============================================================================
// Claude Output Validation (defense-in-depth, SEC-002)
// =============================================================================

const MIN_DATE = '2020-01-01';
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates ISO date string within a reasonable range.
 * Rejects dates before 2020 or more than 7 days in the future.
 */
const reasonableDateSchema = z.string().refine(
  (val) => {
    if (!isoDateRegex.test(val)) return false;
    const d = new Date(val);
    if (isNaN(d.getTime())) return false;
    const min = new Date(MIN_DATE);
    const max = new Date();
    max.setDate(max.getDate() + 7);
    return d >= min && d <= max;
  },
  { message: 'Date must be a valid YYYY-MM-DD between 2020-01-01 and 7 days from now' },
);

export const parsedAmazonItemSchema = z.object({
  name: z.string().max(500),
  estimatedPrice: z.number().min(0).max(99999).nullable().default(null),
  quantity: z.number().int().min(1).max(999).default(1),
});

export const parsedAmazonOrderSchema = z.object({
  orderNumber: z.string().min(3).max(30).regex(
    /^[A-Za-z0-9-]+$/,
    'Order number must be alphanumeric with hyphens',
  ),
  orderDate: reasonableDateSchema,
  totalAmount: z.number().min(0).max(99999),
  items: z.array(parsedAmazonItemSchema).max(50),
});

export const parsedAmazonChargeSchema = z.object({
  orderNumber: z.string().min(3).max(30).regex(
    /^[A-Za-z0-9-]+$/,
    'Order number must be alphanumeric with hyphens',
  ),
  chargeDate: reasonableDateSchema,
  amount: z.number().min(0).max(99999),
  cardLastFour: z.string().regex(/^\d{4}$/, 'Card last four must be exactly 4 digits'),
  merchantLabel: z.string().max(200),
});

/** Top-level schema for Claude's extract_amazon_data tool output. */
export const pdfExtractionOutputSchema = z.object({
  pdfType: z.enum(['orders', 'transactions']),
  orders: z.array(parsedAmazonOrderSchema).max(500).optional(),
  charges: z.array(parsedAmazonChargeSchema).max(500).optional(),
});

export type PdfExtractionOutput = z.infer<typeof pdfExtractionOutputSchema>;

// =============================================================================
// API Request Validation
// =============================================================================

export const resolveAmbiguousSchema = z.object({
  resolutions: z.array(z.object({
    orderNumber: z.string().min(1),
    transactionId: z.string().min(1),
  })).min(1, 'At least one resolution required'),
});

export const categorizeRequestSchema = z.object({
  matchIds: z.array(z.string().min(1)).min(1, 'At least one matchId required'),
});

const applySplitSchema = z.object({
  amount: z.number().positive(),
  categoryId: z.string().min(1),
  description: z.string().optional(),
});

const applyActionSchema = z.discriminatedUnion('type', [
  z.object({
    matchId: z.string().min(1),
    type: z.literal('categorize'),
    categoryId: z.string().min(1),
  }),
  z.object({
    matchId: z.string().min(1),
    type: z.literal('split'),
    splits: z.array(applySplitSchema).min(2, 'Split requires at least 2 parts'),
  }),
  z.object({
    matchId: z.string().min(1),
    type: z.literal('skip'),
  }),
]);

export const applyActionsSchema = z.object({
  actions: z.array(applyActionSchema).min(1, 'At least one action required'),
});
