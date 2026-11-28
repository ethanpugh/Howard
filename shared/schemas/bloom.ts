import { z } from 'zod';
import { CaregiverItemSchema, DateKeySchema, ProfileIdSchema } from './common.ts';

export const BloomInstarStageSchema = z.enum([
  'L1',
  'L2',
  'L3',
  'L4',
  'L5',
  'L6',
  'L7',
  'L8',
  'Subadult',
  'Adult'
]);
export type BloomInstarStage = z.infer<typeof BloomInstarStageSchema>;

export const BloomMantisSexSchema = z.enum(['Male', 'Female', 'Unsexed']);
export type BloomMantisSex = z.infer<typeof BloomMantisSexSchema>;

export const BloomAbdomenLevelSchema = z.enum(['flat', 'moderate', 'plump', 'very_full']);
export type BloomAbdomenLevel = z.infer<typeof BloomAbdomenLevelSchema>;

export const BloomFeedingOutcomeSchema = z.enum(['eaten', 'refused', 'partial']);
export type BloomFeedingOutcome = z.infer<typeof BloomFeedingOutcomeSchema>;

export const BloomMoltQualitySchema = z.enum(['clean', 'minor_issue', 'mismolt']);
export type BloomMoltQuality = z.infer<typeof BloomMoltQualitySchema>;

export const BloomFeederStatusSchema = z.enum(['booming', 'low', 'crashed']);
export type BloomFeederStatus = z.infer<typeof BloomFeederStatusSchema>;

export const BloomEnclosureInfoSchema = z.object({
  currentSizeLabel: z.string(),
  meshType: z.string(),
  substrate: z.string(),
  lastDeepCleanDate: z.string(),
  currentBodyLengthMm: z.number().finite(),
  enclosureHeightMm: z.number().finite(),
  enclosureWidthMm: z.number().finite()
});
export type BloomEnclosureInfo = z.infer<typeof BloomEnclosureInfoSchema>;

export const BloomSettingsSchema = z.object({
  mantisName: z.string(),
  speciesPreset: z.string(),
  commonName: z.string(),
  scientificName: z.string(),
  sex: z.string(),
  pronouns: z.string(),
  currentInstar: z.string(),
  arrivalDate: z.string(),
  hatchDate: z.string(),
  currentColorMorph: z.string(),
  lifecycleStatus: z.string(),
  premoltStartedAt: z.string().nullable(),
  hardeningUntil: z.string().nullable(),
  hardeningHours: z.number().finite(),
  livePreyInside: z.boolean(),
  livePreyNote: z.string(),
  livePreyAt: z.string().nullable().optional(),
  livePreyBy: z.string().optional(),
  livePreyByProfileId: ProfileIdSchema.nullable().optional(),
  dayTempMinC: z.number().finite(),
  dayTempMaxC: z.number().finite(),
  nightTempMinC: z.number().finite(),
  humidityMinPct: z.number().finite(),
  humidityMaxPct: z.number().finite(),
  mistTargetHours: z.number().finite(),
  typicalInterMoltDays: z.number().finite(),
  enclosureInfo: BloomEnclosureInfoSchema,
  caregivers: z.array(z.string()),
  caregiverItems: z.array(CaregiverItemSchema).optional(),
  careNote: z.string()
});
export type BloomSettings = z.infer<typeof BloomSettingsSchema>;

export const BloomSettingsPatchSchema = z.object({
  mantisName: z.string().optional(),
  speciesPreset: z.string().optional(),
  commonName: z.string().optional(),
  scientificName: z.string().optional(),
  sex: z.string().optional(),
  pronouns: z.string().optional(),
  currentInstar: z.string().optional(),
  arrivalDate: z.string().optional(),
  hatchDate: z.string().optional(),
  currentColorMorph: z.string().optional(),
  lifecycleStatus: z.string().optional(),
  premoltStartedAt: z.string().nullable().optional(),
  hardeningUntil: z.string().nullable().optional(),
  hardeningHours: z.number().finite().min(0).max(168).optional(),
  livePreyInside: z.boolean().optional(),
  livePreyNote: z.string().optional(),
  livePreyAt: z.string().nullable().optional(),
  livePreyBy: z.string().optional(),
  livePreyByProfileId: ProfileIdSchema.nullable().optional(),
  dayTempMinC: z.number().finite().min(5).max(50).optional(),
  dayTempMaxC: z.number().finite().min(5).max(50).optional(),
  nightTempMinC: z.number().finite().min(5).max(50).optional(),
  humidityMinPct: z.number().finite().min(0).max(100).optional(),
  humidityMaxPct: z.number().finite().min(0).max(100).optional(),
  mistTargetHours: z.number().finite().min(1).max(168).optional(),
  typicalInterMoltDays: z.number().finite().min(1).max(180).optional(),
  enclosureInfo: BloomEnclosureInfoSchema.partial().optional(),
  caregivers: z.array(z.string()).optional(),
  caregiverItems: z.array(CaregiverItemSchema).optional(),
  careNote: z.string().optional()
});
export type BloomSettingsPatch = z.infer<typeof BloomSettingsPatchSchema>;

export const BloomMistEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string().optional(),
  by: z.string().optional(),
  byProfileId: ProfileIdSchema.nullable().optional(),
  dropletDrinkObserved: z.boolean().optional(),
  note: z.string().optional()
});
export type BloomMistEntry = z.infer<typeof BloomMistEntrySchema>;

export const BloomFeedingEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string().optional(),
  by: z.string().optional(),
  byProfileId: ProfileIdSchema.nullable().optional(),
  preyType: z.string().optional(),
  preyLabel: z.string().optional(),
  count: z.number().finite().optional(),
  outcome: z.string().optional(),
  abdomenAfter: z.string().optional(),
  note: z.string().optional()
});
export type BloomFeedingEntry = z.infer<typeof BloomFeedingEntrySchema>;

export const BloomClimateCheckSchema = z.object({
  id: z.string(),
  timestamp: z.string().optional(),
  by: z.string().optional(),
  byProfileId: ProfileIdSchema.nullable().optional(),
  tempC: z.number().finite().optional(),
  humidityPct: z.number().finite().optional(),
  note: z.string().optional()
});
export type BloomClimateCheck = z.infer<typeof BloomClimateCheckSchema>;

export const BloomCareLogSchema = z.object({
  dateKey: z.string().optional(),
  mists: z.array(BloomMistEntrySchema).optional(),
  feedings: z.array(BloomFeedingEntrySchema).optional(),
  climateChecks: z.array(BloomClimateCheckSchema).optional(),
  behaviors: z.array(z.string()).optional(),
  abdomenStatus: z.string().optional(),
  abdomenUpdatedAt: z.string().optional(),
  journalNote: z.string().optional(),
  updatedAt: z.string().optional()
});
export type BloomCareLog = z.infer<typeof BloomCareLogSchema>;

export const BloomLogPutRequestSchema = z.object({
  settingsPatch: BloomSettingsPatchSchema.optional(),
  appendMist: BloomMistEntrySchema.partial({ id: true }).optional(),
  removeMistId: z.string().optional(),
  appendFeeding: BloomFeedingEntrySchema.partial({ id: true }).optional(),
  removeFeedingId: z.string().optional(),
  appendClimateCheck: BloomClimateCheckSchema.partial({ id: true }).optional(),
  removeClimateCheckId: z.string().optional(),
  toggleBehavior: z.string().optional(),
  abdomenStatus: z.string().optional(),
  abdomenUpdatedAt: z.string().optional(),
  journalNote: z.string().optional(),
  updatedAt: z.string().optional()
});
export type BloomLogPutRequest = z.infer<typeof BloomLogPutRequestSchema>;

export const BloomMoltRecordSchema = z.object({
  id: z.string(),
  dateKey: z.string(),
  timestamp: z.string().optional(),
  fromInstar: z.string().optional(),
  toInstar: z.string().optional(),
  lengthMm: z.number().finite().nullable().optional(),
  colorShift: z.string().optional(),
  quality: z.string().optional(),
  loggedBy: z.string().optional(),
  loggedByProfileId: ProfileIdSchema.nullable().optional(),
  note: z.string().optional(),
  updatedAt: z.string().optional()
});
export type BloomMoltRecord = z.infer<typeof BloomMoltRecordSchema>;

export const BloomMoltPostRequestSchema = z.object({
  id: z.string().optional(),
  dateKey: DateKeySchema.optional(),
  timestamp: z.string().optional(),
  fromInstar: z.string().optional(),
  toInstar: z.string().optional(),
  lengthMm: z.number().finite().nullable().optional(),
  colorShift: z.string().optional(),
  quality: z.string().optional(),
  loggedBy: z.string().optional(),
  loggedByProfileId: ProfileIdSchema.nullable().optional(),
  note: z.string().optional(),
  advanceInstar: z.boolean().optional(),
  startHardening: z.boolean().optional()
});
export type BloomMoltPostRequest = z.infer<typeof BloomMoltPostRequestSchema>;

export const BloomFeederCultureSchema = z.object({
  id: z.string(),
  name: z.string(),
  feederType: z.string().optional(),
  startedDate: z.string().optional(),
  shelfLifeDays: z.number().finite().optional(),
  status: z.string().optional(),
  storageNote: z.string().optional(),
  active: z.boolean().optional(),
  updatedAt: z.string().optional()
});
export type BloomFeederCulture = z.infer<typeof BloomFeederCultureSchema>;

export const BloomFeederPutRequestSchema = z.object({
  name: z.string().trim().min(1, 'Feeder culture name cannot be empty'),
  feederType: z.string().optional(),
  startedDate: DateKeySchema.optional(),
  shelfLifeDays: z.number().finite().min(1).max(365).optional(),
  status: z.string().optional(),
  storageNote: z.string().optional(),
  active: z.boolean().optional()
});
export type BloomFeederPutRequest = z.infer<typeof BloomFeederPutRequestSchema>;

export const BloomSnapshotSchema = z.object({
  settings: BloomSettingsSchema,
  logsByDate: z.record(z.string(), BloomCareLogSchema),
  molts: z.array(BloomMoltRecordSchema),
  feeders: z.array(BloomFeederCultureSchema),
  updatedAt: z.string()
});
export type BloomSnapshot = z.infer<typeof BloomSnapshotSchema>;
