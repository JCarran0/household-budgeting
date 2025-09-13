import { z } from 'zod';

// Feedback submission validation schema
export const feedbackSchema = z.object({
  type: z.enum(['bug', 'feature']),
  title: z.string()
    .min(5, 'Title must be at least 5 characters long')
    .max(100, 'Title must be less than 100 characters')
    .trim(),
  description: z.string()
    .min(10, 'Description must be at least 10 characters long')
    .max(2000, 'Description must be less than 2000 characters')
    .trim(),
  email: z.string()
    .email('Invalid email format')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  applicationState: z.object({
    route: z.string(),
    searchParams: z.string(),
    userAgent: z.string(),
    timestamp: z.string(),
    username: z.string(),
    windowSize: z.object({
      width: z.number(),
      height: z.number(),
    }),
    filters: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});

export type FeedbackValidationInput = z.input<typeof feedbackSchema>;
export type FeedbackValidationOutput = z.output<typeof feedbackSchema>;