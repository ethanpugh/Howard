import { z } from 'zod';
import { DateKeySchema, ProfileIdSchema } from './common.ts';

export const FloodgateBleedingSeveritySchema = z.enum([
  'none',
  'spotting',
  'light',
  'moderate',
  'heavy',
  'flooding'
]);
export type FloodgateBleedingSeverity = z.infer<typeof FloodgateBleedingSeveritySchema>;

export const FloodgateBowelSeveritySchema = z.enum(['none', 'mild', 'moderate', 'severe']);
export type FloodgateBowelSeverity = z.infer<typeof FloodgateBowelSeveritySchema>;

export const FloodgateMedEffectivenessSchema = z.enum(['good', 'partial', 'none']);
export type FloodgateMedEffectiveness = z.infer<typeof FloodgateMedEffectivenessSchema>;

export const FloodgateSettingsSchema = z.object({
  ownerProfileId: ProfileIdSchema.optional(),
  ownerName: z.string(),
  appName: z.string()
});
export type FloodgateSettings = z.infer<typeof FloodgateSettingsSchema>;

export const FloodgateSettingsPatchSchema = z.object({
  ownerName: z.string().trim().min(1).optional(),
  appName: z.string().trim().min(1).optional()
});
export type FloodgateSettingsPatch = z.infer<typeof FloodgateSettingsPatchSchema>;

export const FloodgateMedicationEntrySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  dose: z.string().optional(),
  timeNotes: z.string().optional(),
  effective: z.string().optional()
});
export type FloodgateMedicationEntry = z.infer<typeof FloodgateMedicationEntrySchema>;

export const FloodgateDayLogSchema = z.object({
  date: z.string(),
  bleedingSeverity: z.string().optional(),
  padCount: z.number().finite().min(0).optional(),
  tamponCount: z.number().finite().min(0).optional(),
  cupCount: z.number().finite().min(0).optional(),
  leakedThrough: z.boolean().optional(),
  hasClots: z.boolean().optional(),
  clotCount: z.number().finite().min(0).optional(),
  clotSizes: z.array(z.string()).optional(),
  painScore: z.number().finite().min(0).max(10).optional(),
  painLocations: z.array(z.string()).optional(),
  painTypes: z.array(z.string()).optional(),
  bowelSeverity: z.string().optional(),
  bowelSymptoms: z.array(z.string()).optional(),
  bowelMovementsCount: z.number().finite().min(0).optional(),
  medications: z.array(FloodgateMedicationEntrySchema).optional(),
  externalFactors: z.array(z.string()).optional(),
  notes: z.string().optional(),
  note: z.string().optional(),
  updatedAt: z.string().optional()
});
export type FloodgateDayLog = z.infer<typeof FloodgateDayLogSchema>;

export const FloodgateDayLogPutSchema = z.object({
  date: DateKeySchema.optional(),
  dateKey: DateKeySchema.optional(),
  bleedingSeverity: z.string().optional(),
  padCount: z.number().finite().min(0).optional(),
  tamponCount: z.number().finite().min(0).optional(),
  cupCount: z.number().finite().min(0).optional(),
  leakedThrough: z.boolean().optional(),
  hasClots: z.boolean().optional(),
  clotCount: z.number().finite().min(0).optional(),
  clotSizes: z.array(z.string()).optional(),
  painScore: z.number().finite().min(0).max(10).optional(),
  painLocations: z.array(z.string()).optional(),
  painTypes: z.array(z.string()).optional(),
  bowelSeverity: z.string().optional(),
  bowelSymptoms: z.array(z.string()).optional(),
  bowelMovementsCount: z.number().finite().min(0).optional(),
  medications: z.array(FloodgateMedicationEntrySchema).optional(),
  externalFactors: z.array(z.string()).optional(),
  notes: z.string().optional(),
  note: z.string().optional(),
  updatedAt: z.string().optional()
});
export type FloodgateDayLogPut = z.infer<typeof FloodgateDayLogPutSchema>;

export const FloodgateBatchRequestSchema = z.union([
  z.array(FloodgateDayLogPutSchema),
  z.object({
    logs: z.union([
      z.array(FloodgateDayLogPutSchema),
      z.record(DateKeySchema, FloodgateDayLogPutSchema)
    ])
  }),
  z.record(DateKeySchema, FloodgateDayLogPutSchema)
]);
export type FloodgateBatchRequest = z.infer<typeof FloodgateBatchRequestSchema>;

export const FloodgateSnapshotSchema = z.object({
  settings: FloodgateSettingsSchema,
  logsByDate: z.record(z.string(), FloodgateDayLogSchema),
  updatedAt: z.string().optional()
});
export type FloodgateSnapshot = z.infer<typeof FloodgateSnapshotSchema>;
