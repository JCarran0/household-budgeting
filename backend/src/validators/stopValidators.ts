/**
 * Trip Stop — Zod Validators
 *
 * Validates create / update / reorder request bodies for the nested stop
 * endpoints under /api/v1/trips/:tripId/stops. Uses z.discriminatedUnion
 * keyed on `type` so each variant carries its own required fields.
 */

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD');
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time format. Use HH:mm (24-hour)');

const verifiedLocationSchema = z.object({
  kind: z.literal('verified'),
  label: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  placeId: z.string().min(1).max(500),
});

const freeTextLocationSchema = z.object({
  kind: z.literal('freeText'),
  label: z.string().min(1).max(200),
});

const locationSchema = z.discriminatedUnion('kind', [
  verifiedLocationSchema,
  freeTextLocationSchema,
]);

const transitModeSchema = z.enum(['drive', 'flight', 'train', 'walk', 'shuttle', 'other']);

// =============================================================================
// Create schemas
// =============================================================================

const baseCreateFields = {
  date: isoDate,
  time: timeOfDay.nullable().optional(),
  notes: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
};

const createStaySchema = z
  .object({
    type: z.literal('stay'),
    ...baseCreateFields,
    name: z.string().min(1).max(200),
    location: verifiedLocationSchema,
    endDate: isoDate,
  })
  .refine((data) => data.endDate >= data.date, {
    message: 'endDate must be on or after date',
    path: ['endDate'],
  });

const createEatSchema = z.object({
  type: z.literal('eat'),
  ...baseCreateFields,
  name: z.string().min(1).max(200),
  location: locationSchema.nullable().optional(),
});

const createPlaySchema = z.object({
  type: z.literal('play'),
  ...baseCreateFields,
  name: z.string().min(1).max(200),
  location: locationSchema.nullable().optional(),
  durationMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
});

const createTransitSchema = z.object({
  type: z.literal('transit'),
  ...baseCreateFields,
  mode: transitModeSchema,
  fromLocation: locationSchema.nullable().optional(),
  toLocation: locationSchema.nullable().optional(),
  durationMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
});

export const createStopSchema = z.discriminatedUnion('type', [
  createStaySchema,
  createEatSchema,
  createPlaySchema,
  createTransitSchema,
]);

export type CreateStopInput = z.infer<typeof createStopSchema>;

// =============================================================================
// Update schemas — every field optional, `type` still required to discriminate.
// =============================================================================

const baseUpdateFields = {
  date: isoDate.optional(),
  time: timeOfDay.nullable().optional(),
  notes: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
};

const updateStaySchema = z.object({
  type: z.literal('stay'),
  ...baseUpdateFields,
  name: z.string().min(1).max(200).optional(),
  location: verifiedLocationSchema.optional(),
  endDate: isoDate.optional(),
});

const updateEatSchema = z.object({
  type: z.literal('eat'),
  ...baseUpdateFields,
  name: z.string().min(1).max(200).optional(),
  location: locationSchema.nullable().optional(),
});

const updatePlaySchema = z.object({
  type: z.literal('play'),
  ...baseUpdateFields,
  name: z.string().min(1).max(200).optional(),
  location: locationSchema.nullable().optional(),
  durationMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
});

const updateTransitSchema = z.object({
  type: z.literal('transit'),
  ...baseUpdateFields,
  mode: transitModeSchema.optional(),
  fromLocation: locationSchema.nullable().optional(),
  toLocation: locationSchema.nullable().optional(),
  durationMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
});

export const updateStopSchema = z.discriminatedUnion('type', [
  updateStaySchema,
  updateEatSchema,
  updatePlaySchema,
  updateTransitSchema,
]);

export type UpdateStopInput = z.infer<typeof updateStopSchema>;

// =============================================================================
// Reorder schema
// =============================================================================

export const reorderStopsSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().min(1),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1),
});

export type ReorderStopsInput = z.infer<typeof reorderStopsSchema>;
