import { z } from 'zod';
import { CaregiverItemSchema, DateKeySchema, ProfileIdSchema } from './common.ts';

export const CadenceSettingsSchema = z.object({
  catName: z.string(),
  medicationName: z.string(),
  dosageLabel: z.string(),
  morningTargetTime: z.string(),
  eveningTargetTime: z.string(),
  bottleOpenedDate: z.string(),
  bottleShelfLifeDays: z.number().finite(),
  caregivers: z.array(z.string()),
  caregiverItems: z.array(CaregiverItemSchema).optional(),
  administrationNote: z.string()
});
export type CadenceSettings = z.infer<typeof CadenceSettingsSchema>;

export const CadenceSettingsPatchSchema = z.object({
  catName: z.string().optional(),
  medicationName: z.string().optional(),
  dosageLabel: z.string().optional(),
  morningTargetTime: z.string().optional(),
  eveningTargetTime: z.string().optional(),
  bottleOpenedDate: DateKeySchema.optional(),
  bottleShelfLifeDays: z.number().finite().min(7).max(365).optional(),
  caregivers: z.array(z.string()).optional(),
  caregiverItems: z.array(CaregiverItemSchema).optional(),
  administrationNote: z.string().optional()
});
export type CadenceSettingsPatch = z.infer<typeof CadenceSettingsPatchSchema>;

export const CadenceDoseSchema = z.object({
  given: z.boolean().optional(),
  givenBy: z.string().optional(),
  givenByProfileId: ProfileIdSchema.nullable().optional(),
  time: z.string().optional(),
  timestamp: z.string().optional(),
  dosage: z.string().optional(),
  note: z.string().optional()
});
export type CadenceDose = z.infer<typeof CadenceDoseSchema>;

export const CadenceDayLogSchema = z.object({
  dateKey: DateKeySchema.optional(),
  morning: CadenceDoseSchema.nullable().optional(),
  evening: CadenceDoseSchema.nullable().optional(),
  updatedAt: z.string().optional()
});
export type CadenceDayLog = z.infer<typeof CadenceDayLogSchema>;

export const CadenceDayLogPutRequestSchema = z.object({
  morning: CadenceDoseSchema.nullable().optional(),
  evening: CadenceDoseSchema.nullable().optional(),
  updatedAt: z.string().optional()
});
export type CadenceDayLogPutRequest = z.infer<typeof CadenceDayLogPutRequestSchema>;

export const CadenceSnapshotSchema = z.object({
  settings: CadenceSettingsSchema,
  logsByDate: z.record(z.string(), CadenceDayLogSchema),
  updatedAt: z.string()
});
export type CadenceSnapshot = z.infer<typeof CadenceSnapshotSchema>;
