import { z } from 'zod';
import { AlmanacEventSchema } from './almanac.ts';
import { BeaconInfoSchema, BeaconPatchSchema } from './beacon.ts';
import {
  BloomCareLogSchema,
  BloomFeederCultureSchema,
  BloomMoltRecordSchema,
  BloomSettingsPatchSchema,
  BloomSnapshotSchema
} from './bloom.ts';
import {
  CadenceDayLogSchema,
  CadenceSettingsPatchSchema,
  CadenceSnapshotSchema
} from './cadence.ts';
import { DateKeySchema } from './common.ts';
import {
  FloodgateDayLogSchema,
  FloodgateSettingsPatchSchema,
  FloodgateSnapshotSchema
} from './floodgate.ts';
import { LedgerDataPatchSchema, LedgerDataSchema } from './ledger.ts';
import { ProfileSchema, PublicProfileSchema } from './profile.ts';
import { QuillNoteSchema, QuillSettingsSchema, QuillSnapshotSchema } from './quill.ts';

export const DbInfoSchema = z.object({
  file: z.string(),
  schemaVersion: z.number(),
  journalMode: z.string()
});
export type DbInfo = z.infer<typeof DbInfoSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  app: z.string(),
  dbFolder: z.string(),
  dbFile: z.string(),
  schemaVersion: z.number(),
  journalMode: z.string(),
  serverTime: z.string()
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const HowardProjectedStateSchema = z.object({
  profiles: z.array(PublicProfileSchema),
  almanacEvents: z.array(AlmanacEventSchema),
  ledgerData: LedgerDataSchema,
  beaconInfo: BeaconInfoSchema,
  updatedAt: z.string()
});
export type HowardProjectedState = z.infer<typeof HowardProjectedStateSchema>;

export const SyncDomainSchema = z.enum(['howard', 'cadence', 'bloom', 'floodgate', 'quill']);
export type SyncDomain = z.infer<typeof SyncDomainSchema>;

export const UnifiedSyncResponseSchema = z.union([
  z.object({
    unchanged: z.literal(true),
    syncToken: z.string()
  }),
  z.object({
    unchanged: z.literal(false),
    partial: z.boolean(),
    syncToken: z.string(),
    changedDomains: z.array(SyncDomainSchema),
    dbInfo: DbInfoSchema.optional(),
    howard: HowardProjectedStateSchema.optional(),
    cadence: CadenceSnapshotSchema.optional(),
    bloom: BloomSnapshotSchema.optional(),
    floodgate: FloodgateSnapshotSchema.nullable().optional(),
    quill: QuillSnapshotSchema.optional(),
    serverTime: z.string()
  })
]);
export type UnifiedSyncResponse = z.infer<typeof UnifiedSyncResponseSchema>;

export const RestoreResponseSchema = z.object({
  restored: z.literal(true),
  mode: z.enum(['merge', 'replace']),
  preRestoreSnapshot: z.string(),
  updatedAt: z.string()
});
export type RestoreResponse = z.infer<typeof RestoreResponseSchema>;

export const BackupProfileInputSchema = ProfileSchema.partial().extend({
  id: z.string().min(1)
});

export const BackupHowardSectionSchema = z.object({
  profiles: z.array(BackupProfileInputSchema).optional(),
  almanacEvents: z.array(AlmanacEventSchema.partial({ id: true, date: true }).extend({ title: z.string().trim().min(1) })).optional(),
  ledgerData: LedgerDataPatchSchema.optional(),
  beaconInfo: BeaconPatchSchema.optional()
});

export const BackupCadenceSectionSchema = z.object({
  settings: CadenceSettingsPatchSchema.optional(),
  logsByDate: z.record(DateKeySchema, CadenceDayLogSchema).optional()
});

export const BackupBloomSectionSchema = z.object({
  settings: BloomSettingsPatchSchema.optional(),
  logsByDate: z.record(DateKeySchema, BloomCareLogSchema).optional(),
  molts: z.array(BloomMoltRecordSchema).optional(),
  feeders: z.array(BloomFeederCultureSchema).optional()
});

export const BackupFloodgateSectionSchema = z.object({
  settings: FloodgateSettingsPatchSchema.optional(),
  logsByDate: z.record(DateKeySchema, FloodgateDayLogSchema).optional()
});

export const BackupQuillSectionSchema = z.object({
  settings: QuillSettingsSchema.optional(),
  labels: z.array(z.string()).optional(),
  notes: z.array(QuillNoteSchema.partial().extend({ id: z.string().trim().min(1) })).optional()
});

export const BackupRestorePayloadSchema = z.object({
  schemaVersion: z.number().int().positive().max(7).optional(),
  mode: z.enum(['merge', 'replace']).optional(),
  app: z.string().optional(),
  version: z.string().optional(),
  exportedAt: z.string().optional(),
  howard: BackupHowardSectionSchema.optional(),
  cadence: BackupCadenceSectionSchema.optional(),
  bloom: BackupBloomSectionSchema.optional(),
  floodgate: BackupFloodgateSectionSchema.nullable().optional(),
  quill: BackupQuillSectionSchema.optional(),
  settings: z.union([CadenceSettingsPatchSchema, BloomSettingsPatchSchema, FloodgateSettingsPatchSchema]).optional(),
  logsByDate: z
    .union([
      z.record(DateKeySchema, CadenceDayLogSchema),
      z.record(DateKeySchema, BloomCareLogSchema),
      z.record(DateKeySchema, FloodgateDayLogSchema)
    ])
    .optional(),
  logs: z.record(DateKeySchema, FloodgateDayLogSchema).optional(),
  molts: z.array(BloomMoltRecordSchema).optional(),
  feeders: z.array(BloomFeederCultureSchema).optional()
});
export type BackupRestorePayload = z.infer<typeof BackupRestorePayloadSchema>;
