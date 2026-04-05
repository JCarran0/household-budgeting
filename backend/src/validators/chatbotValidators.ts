import { z } from 'zod';

const pageContextSchema = z.object({
  path: z.string(),
  pageName: z.string(),
  params: z.record(z.string(), z.string()),
  description: z.string(),
});

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
});

export const chatRequestSchema = z.object({
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(10000, 'Message too long'),
  conversationHistory: z.array(chatMessageSchema).default([]),
  pageContext: pageContextSchema,
  model: z.enum(['haiku', 'sonnet', 'opus']),
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
