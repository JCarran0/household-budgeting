/**
 * Amazon Receipt Matching — Prompt & Tool Definitions
 *
 * Used by AmazonReceiptService for PDF parsing via Claude vision.
 * SEC-002: PDF content is sent as a document content block (base64),
 * never interpolated into prompt text.
 */

import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// PDF Parsing
// =============================================================================

export const PDF_PARSING_SYSTEM_PROMPT = `You are a document parser extracting structured data from Amazon PDFs.
The user has uploaded a PDF from Amazon. Determine if it is an Orders page or a Payments > Transactions page, then extract the relevant data.

For Orders pages (amazon.com/gp/css/order-history):
- Extract each order: order number, order date, order total, and item names with quantities.
- If per-item prices are visible, include them. If not, set estimatedPrice to null.
- Order numbers look like: 111-1234567-1234567 or D01-1234567-1234567.
- Order dates are the dates orders were placed, not delivery dates.
- Include ALL orders visible on ALL pages of the PDF.

For Payments > Transactions pages (amazon.com/cpe/yourpayments/transactions):
- Extract each charge: charge date, amount, order number, card last-4 digits, merchant label.
- Amounts are the dollar amounts charged to the card.
- Card last-4 is the last 4 digits of the payment card used.
- Merchant labels are things like "Amazon.com", "AMZN Mktp US", "AMAZON DIGITAL", etc.

Important:
- Extract ALL items/charges visible in the PDF, across all pages.
- Use the exact order numbers as shown (preserve hyphens and formatting).
- Amounts should be positive numbers (e.g., 25.99 not -25.99).
- Dates should be in YYYY-MM-DD format.
- For items, capture the full product name as shown.`;

/**
 * Tool definition for structured PDF extraction.
 *
 * SEC-002 hardening: strict type constraints on all fields limit the attack
 * surface for prompt injection via adversarial product descriptions. Works
 * in tandem with server-side Zod validation (defense-in-depth).
 */
export const PDF_EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'extract_amazon_data',
  description: 'Extract structured order/charge data from an Amazon PDF.',
  input_schema: {
    type: 'object' as const,
    properties: {
      pdfType: {
        type: 'string',
        enum: ['orders', 'transactions'],
        description: 'Whether this is an Orders page or Payments > Transactions page',
      },
      orders: {
        type: 'array',
        description: 'Extracted orders (only for orders-type PDFs)',
        maxItems: 500,
        items: {
          type: 'object',
          properties: {
            orderNumber: {
              type: 'string',
              description: 'Amazon order number (e.g., 111-1234567-1234567)',
              maxLength: 30,
            },
            orderDate: {
              type: 'string',
              description: 'Date order was placed in YYYY-MM-DD format',
            },
            totalAmount: {
              type: 'number',
              description: 'Order total in dollars',
              minimum: 0,
              maximum: 99999,
            },
            items: {
              type: 'array',
              maxItems: 50,
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Full product name',
                    maxLength: 500,
                  },
                  estimatedPrice: {
                    type: ['number', 'null'],
                    description: 'Per-item price if visible, null otherwise',
                    minimum: 0,
                    maximum: 99999,
                  },
                  quantity: {
                    type: 'number',
                    description: 'Quantity ordered',
                    minimum: 1,
                    maximum: 999,
                  },
                },
                required: ['name', 'quantity'],
              },
            },
          },
          required: ['orderNumber', 'orderDate', 'totalAmount', 'items'],
        },
      },
      charges: {
        type: 'array',
        description: 'Extracted charges (only for transactions-type PDFs)',
        maxItems: 500,
        items: {
          type: 'object',
          properties: {
            orderNumber: {
              type: 'string',
              description: 'Associated order number',
              maxLength: 30,
            },
            chargeDate: {
              type: 'string',
              description: 'Date card was charged in YYYY-MM-DD format',
            },
            amount: {
              type: 'number',
              description: 'Charge amount in dollars',
              minimum: 0,
              maximum: 99999,
            },
            cardLastFour: {
              type: 'string',
              description: 'Last 4 digits of payment card',
              pattern: '^[0-9]{4}$',
            },
            merchantLabel: {
              type: 'string',
              description: 'Merchant name as shown (e.g., "Amazon.com", "AMZN Mktp US")',
              maxLength: 200,
            },
          },
          required: ['orderNumber', 'chargeDate', 'amount', 'cardLastFour', 'merchantLabel'],
        },
      },
    },
    required: ['pdfType'],
  },
};

// =============================================================================
// Item Categorization
// =============================================================================

export const AMAZON_CATEGORIZATION_SYSTEM_PROMPT = `You are categorizing Amazon purchases for a household budget.
For each matched order, assign the most appropriate category from the user's hierarchy.
Use the provided examples of how this user categorizes similar purchases.

For multi-item orders where items belong to DIFFERENT categories, recommend splitting the transaction.
For each split item, estimate the per-item price if not provided. Mark estimated prices clearly.
Ensure estimated amounts sum exactly to the order total.

If all items in a multi-item order belong to the SAME category, recommend a simple recategorization — no split needed.

Assign numeric confidence 0.0–1.0:
- ≥0.85: Clear category match (e.g., "NutriSource Adult Dry Dog Food" → Pet Food)
- 0.5–0.84: Reasonable but ambiguous (e.g., "ZOMAKE Lightweight Packable Backpack" — Travel? Kids? Home?)
- <0.5: Genuinely uncertain — multiple categories could apply

Use subcategory IDs (children) when available, not parent category IDs.
Provide brief reasoning (1 sentence) for each classification.`;

export const AMAZON_CATEGORIZATION_TOOL: Anthropic.Tool = {
  name: 'categorize_amazon_items',
  description: 'Categorize Amazon purchase items and recommend splits for multi-item orders.',
  input_schema: {
    type: 'object' as const,
    properties: {
      categorizations: {
        type: 'array',
        description: 'Category recommendations for single-item orders or same-category multi-item orders',
        items: {
          type: 'object',
          properties: {
            matchId: { type: 'string' },
            suggestedCategoryId: { type: 'string', description: 'Category ID from the provided hierarchy' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string', description: 'Brief 1-sentence explanation', maxLength: 500 },
            itemName: { type: 'string', description: 'Primary item name for display', maxLength: 500 },
          },
          required: ['matchId', 'suggestedCategoryId', 'confidence', 'reasoning', 'itemName'],
        },
      },
      splitRecommendations: {
        type: 'array',
        description: 'Split recommendations for multi-item orders spanning different categories',
        items: {
          type: 'object',
          properties: {
            matchId: { type: 'string' },
            splits: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  itemName: { type: 'string', maxLength: 500 },
                  estimatedAmount: { type: 'number', minimum: 0, maximum: 99999 },
                  suggestedCategoryId: { type: 'string' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                  isEstimatedPrice: { type: 'boolean' },
                },
                required: ['itemName', 'estimatedAmount', 'suggestedCategoryId', 'confidence', 'isEstimatedPrice'],
              },
            },
          },
          required: ['matchId', 'splits'],
        },
      },
    },
    required: ['categorizations', 'splitRecommendations'],
  },
};
