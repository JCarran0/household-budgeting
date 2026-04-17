import { z } from 'zod';

const pageContextSchema = z.object({
  path: z.string(),
  pageName: z.string(),
  params: z.record(z.string(), z.string()),
  description: z.string(),
});

// `.passthrough()` preserves extra fields that the frontend may attach to
// history items (e.g., `proposal`, `proposalStatus`, `attachment`, `resource`
// added by the chat-actions feature). Without it, Zod silently strips them
// and the LLM loses pending-proposal context on refinement turns.
const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string(),
  model: z.string().optional(),
  tokenUsage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    estimatedCost: z.number(),
  }).optional(),
  pageContext: pageContextSchema.optional(),
}).passthrough();

export const chatRequestSchema = z.object({
  // `message` may be empty when the user sends only an attachment. The route
  // handler rejects requests where both message and attachment are empty.
  message: z.string().max(10000, 'Message too long'),
  conversationId: z.string().min(1, 'conversationId required'),
  conversationHistory: z.array(chatMessageSchema).default([]),
  pageContext: pageContextSchema,
  model: z.enum(['haiku', 'sonnet', 'opus']),
  userDisplayName: z.string().optional(),
});

export const confirmIssueSchema = z.object({
  draft: z.object({
    title: z.string().min(1).max(256),
    body: z.string().min(1).max(65536),
    labels: z.array(z.enum(['bug', 'enhancement'])),
  }),
});

export const classifyTransactionsSchema = z.object({
  transactionIds: z.array(z.string()).optional(),
});

export const suggestRulesSchema = z.object({
  categorizations: z.array(z.object({
    transactionId: z.string(),
    categoryId: z.string(),
  })).min(1, 'At least one categorization required'),
});
