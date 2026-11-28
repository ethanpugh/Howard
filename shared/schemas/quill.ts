import { z } from 'zod';
import { ProfileIdSchema } from './common.ts';

export const QuillNoteTypeSchema = z.enum(['text', 'checklist']);
export type QuillNoteType = z.infer<typeof QuillNoteTypeSchema>;

export const QuillVisibilitySchema = z.enum(['shared', 'private']);
export type QuillVisibility = z.infer<typeof QuillVisibilitySchema>;

export const QuillStatusSchema = z.enum(['active', 'archived', 'trashed']);
export type QuillStatus = z.infer<typeof QuillStatusSchema>;

export const QuillColorSchema = z.enum([
  'default',
  'coral',
  'peach',
  'sand',
  'mint',
  'sage',
  'fog',
  'storm',
  'dusk',
  'blossom',
  'clay',
  'chalk'
]);
export type QuillColor = z.infer<typeof QuillColorSchema>;

export const QuillChecklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  checked: z.boolean()
});
export type QuillChecklistItem = z.infer<typeof QuillChecklistItemSchema>;

export const QuillNoteSchema = z.object({
  id: z.string(),
  type: QuillNoteTypeSchema,
  title: z.string(),
  body: z.string(),
  items: z.array(QuillChecklistItemSchema),
  color: QuillColorSchema,
  labels: z.array(z.string()),
  visibility: QuillVisibilitySchema,
  ownerProfileId: ProfileIdSchema,
  ownerName: z.string().optional(),
  caregiverVisible: z.boolean(),
  pinned: z.boolean(),
  status: QuillStatusSchema,
  position: z.number().finite(),
  revision: z.number().finite(),
  createdAt: z.string(),
  createdByProfileId: ProfileIdSchema,
  createdBy: z.string(),
  updatedAt: z.string(),
  updatedByProfileId: ProfileIdSchema,
  updatedBy: z.string(),
  trashedAt: z.string().nullable()
});
export type QuillNote = z.infer<typeof QuillNoteSchema>;

export const QuillSettingsSchema = z.object({
  labels: z.array(z.string())
});
export type QuillSettings = z.infer<typeof QuillSettingsSchema>;

export const QuillSnapshotSchema = z.object({
  notes: z.array(QuillNoteSchema),
  labels: z.array(z.string()),
  updatedAt: z.string().optional()
});
export type QuillSnapshot = z.infer<typeof QuillSnapshotSchema>;

export const QuillReorderRequestSchema = z.object({
  moves: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        position: z.number().finite(),
        pinned: z.boolean().optional()
      })
    )
    .min(1)
});
export type QuillReorderRequest = z.infer<typeof QuillReorderRequestSchema>;

export const QuillLabelsRequestSchema = z.object({
  labels: z.array(z.string()).optional(),
  rename: z
    .object({
      from: z.string().optional(),
      to: z.string().optional()
    })
    .optional(),
  deleteLabel: z.string().optional()
});
export type QuillLabelsRequest = z.infer<typeof QuillLabelsRequestSchema>;

export const QuillItemPatchRequestSchema = z.object({
  checked: z.boolean().optional(),
  text: z.string().optional(),
  delete: z.boolean().optional()
});
export type QuillItemPatchRequest = z.infer<typeof QuillItemPatchRequestSchema>;

export const QuillNoteDraftInputSchema = z.object({
  id: z.string().optional(),
  type: QuillNoteTypeSchema.optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  items: z.array(QuillChecklistItemSchema).optional(),
  color: QuillColorSchema.optional(),
  labels: z.array(z.string()).optional(),
  visibility: QuillVisibilitySchema.optional(),
  caregiverVisible: z.boolean().optional(),
  pinned: z.boolean().optional(),
  status: QuillStatusSchema.optional(),
  position: z.number().finite().optional(),
  baseRevision: z.number().int().positive().nullable().optional()
});

export const QuillPutNoteRequestSchema = QuillNoteDraftInputSchema.extend({
  note: QuillNoteDraftInputSchema.optional()
});
export type QuillPutNoteRequest = z.infer<typeof QuillPutNoteRequestSchema>;

export const QuillPatchNoteRequestSchema = z.object({
  baseRevision: z.number().int().positive().nullable().optional(),
  title: z.string().optional(),
  pinned: z.boolean().optional(),
  color: QuillColorSchema.optional(),
  status: QuillStatusSchema.optional(),
  labels: z.array(z.string()).optional(),
  visibility: QuillVisibilitySchema.optional(),
  caregiverVisible: z.boolean().optional(),
  position: z.number().finite().optional(),
  type: QuillNoteTypeSchema.optional(),
  body: z.string().optional(),
  items: z.array(QuillChecklistItemSchema).optional()
});
export type QuillPatchNoteRequest = z.infer<typeof QuillPatchNoteRequestSchema>;
