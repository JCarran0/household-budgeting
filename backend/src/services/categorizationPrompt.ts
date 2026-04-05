/**
 * AI Categorization — Prompt & Tool Definition
 *
 * Used by CategorizationService for batch transaction classification.
 * SEC-002: Financial data flows through tool results, not interpolated into prompts.
 */

import Anthropic from '@anthropic-ai/sdk';

export const CATEGORIZATION_SYSTEM_PROMPT = `You are a transaction classifier for a household budgeting app. Your job is to classify uncategorized bank transactions into the user's existing budget categories.

Instructions:
- Classify each transaction into the MOST appropriate category from the provided hierarchy.
- Use the examples of previously categorized transactions as strong signals for the user's preferences.
- If a merchant appears in the examples under a specific category, use that same category.
- Consider transaction names, merchant names, and amounts when classifying.
- Assign confidence levels honestly:
  - "high": Clear match — merchant/pattern appears in examples or is unambiguous (e.g., STARBUCKS → Coffee)
  - "medium": Reasonable guess from context but not certain (e.g., unfamiliar merchant, amount pattern)
  - "low": Genuinely uncertain — multiple categories could apply or the transaction is ambiguous
- Provide brief reasoning (1 sentence) for each classification.
- If no category fits well, still pick the closest match but set confidence to "low".
- Use subcategory IDs (children) when available, not parent category IDs.`;

export const CATEGORIZATION_TOOL: Anthropic.Tool = {
  name: 'classify_transactions',
  description: 'Classify a batch of uncategorized transactions into budget categories.',
  input_schema: {
    type: 'object' as const,
    properties: {
      classifications: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            transactionId: { type: 'string' },
            suggestedCategoryId: { type: 'string', description: 'The category ID from the provided hierarchy' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            reasoning: { type: 'string', description: 'Brief 1-sentence explanation' },
          },
          required: ['transactionId', 'suggestedCategoryId', 'confidence', 'reasoning'],
        },
      },
    },
    required: ['classifications'],
  },
};

export const RULE_SUGGESTION_SYSTEM_PROMPT = `You are analyzing categorized transactions to suggest auto-categorization rules. A rule has patterns (text to match in transaction names) and a target category.

Instructions:
- Look for repeated merchant names or transaction name patterns that consistently map to the same category.
- Only suggest rules where you see 2+ transactions matching the same pattern.
- Patterns should be merchant names or distinctive keywords, not generic words.
- Don't suggest rules that duplicate the existing rules provided.
- Keep patterns concise — prefer "COSTCO" over "COSTCO WHOLESALE #123".`;

export const RULE_SUGGESTION_TOOL: Anthropic.Tool = {
  name: 'suggest_rules',
  description: 'Suggest auto-categorization rules based on categorized transactions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            patterns: { type: 'array', items: { type: 'string' }, description: 'Text patterns to match (case-insensitive contains)' },
            categoryId: { type: 'string' },
            categoryName: { type: 'string' },
            matchingTransactionCount: { type: 'number' },
            exampleTransactions: { type: 'array', items: { type: 'string' }, description: 'Example transaction names that match' },
          },
          required: ['patterns', 'categoryId', 'categoryName', 'matchingTransactionCount', 'exampleTransactions'],
        },
      },
    },
    required: ['suggestions'],
  },
};
