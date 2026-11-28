import { z } from 'zod';
import { DateKeySchema, ProfileIdSchema } from './common.ts';

export const AlmanacRecurrenceSchema = z.enum([
  'none',
  'weekly',
  'fortnightly',
  'monthly',
  'annual'
]);
export type AlmanacRecurrence = z.infer<typeof AlmanacRecurrenceSchema>;

export const AlmanacCategorySchema = z.enum([
  'household',
  'pet',
  'medical',
  'bins',
  'social',
  'general',
  'vet',
  'personal'
]);
export type AlmanacCategory = z.infer<typeof AlmanacCategorySchema>;

export const AlmanacEventSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  date: DateKeySchema,
  time: z.string().optional(),
  category: AlmanacCategorySchema.optional(),
  recurrence: AlmanacRecurrenceSchema.optional(),
  untilDate: z.string().optional(),
  skippedDates: z.array(DateKeySchema).optional(),
  assignedTo: z.string().optional(),
  assignedToProfileId: ProfileIdSchema.nullable().optional(),
  notes: z.string().optional(),
  linkToGpReport: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
export type AlmanacEvent = z.infer<typeof AlmanacEventSchema>;

export const AlmanacSinglePutBodySchema = z.object({
  title: z.string().trim().min(1).optional(),
  date: DateKeySchema.optional(),
  time: z.string().optional(),
  category: AlmanacCategorySchema.optional(),
  recurrence: AlmanacRecurrenceSchema.optional(),
  untilDate: z.string().optional(),
  skippedDates: z.array(DateKeySchema).optional(),
  assignedTo: z.string().optional(),
  assignedToProfileId: ProfileIdSchema.nullable().optional(),
  notes: z.string().optional(),
  linkToGpReport: z.boolean().optional(),
  createdAt: z.string().optional(),
  event: AlmanacEventSchema.partial({ id: true }).optional()
});
export type AlmanacSinglePutBody = z.infer<typeof AlmanacSinglePutBodySchema>;

export const AlmanacBatchRequestSchema = z.object({
  upserts: z.array(AlmanacEventSchema).optional(),
  deleteIds: z.array(z.string().trim().min(1)).optional()
});
export type AlmanacBatchRequest = z.infer<typeof AlmanacBatchRequestSchema>;

export const AlmanacReplaceRequestSchema = z.object({
  events: z.array(AlmanacEventSchema)
});
export type AlmanacReplaceRequest = z.infer<typeof AlmanacReplaceRequestSchema>;
