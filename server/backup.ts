import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isValidDateKey, VALID_DATE_KEY_RE, getLocalDateKey } from '../shared/dateUtils.ts';
import { DEFAULT_PROFILES } from '../shared/profileUtils.ts';
import {
  DEFAULT_BEACON_INFO,
  DEFAULT_FLOODGATE_SETTINGS,
  DEFAULT_QUILL_SETTINGS,
  createDefaultBloomSettings,
  createDefaultCadenceSettings
} from '../shared/defaults.ts';
import type { ProfileId } from '../shared/schemas/common.ts';
import type { Profile } from '../shared/schemas/profile.ts';
import { BackupRestorePayloadSchema, type RestoreResponse } from '../shared/schemas/sync.ts';
import type { RuntimeCache } from './cache.ts';
import type { DatabaseContext } from './db.ts';
import {
  MAX_HOUSEHOLD_LABELS,
  VALID_NOTE_COLORS,
  normalizeQuillLabels,
  validateAndNormalizeQuillNote
} from './domains/quill.ts';
import {
  CURRENT_SCHEMA_VERSION,
  createHttpError,
  hashPin,
  isPlainObject,
  validateAlmanacEventFields,
  validateProfileNameCandidate,
  vacuumSnapshotTo
} from './utils.ts';
import { writeLedgerItemsInTx } from './migrations.ts';
import {
  buildProfilesByIdMap,
  enrichAlmanacEvent,
  enrichBloomCareRecord,
  enrichBloomMoltRecord,
  enrichCadenceRecord,
  mergeBeaconInfo,
  normalizeBeaconInfo,
  normalizeBloomSettings,
  normalizeCadenceSettings,
  normalizeLedgerData
} from './domains/profileResolve.ts';

export function runDailyBackupSnapshots(dbCtx: DatabaseContext): void {
  try {
    const backupsRoot = path.join(dbCtx.dataDir, 'backups');
    const todayDir = path.join(backupsRoot, getLocalDateKey(new Date()));
    fs.mkdirSync(todayDir, { recursive: true });

    const finalPath = path.join(todayDir, 'howard.db');
    if (!fs.existsSync(finalPath)) {
      try {
        vacuumSnapshotTo(dbCtx.db, finalPath);
      } catch (snapErr) {
        console.warn(
          'Daily snapshot warning (howard.db):',
          snapErr instanceof Error ? snapErr.message : snapErr
        );
      }
    }

    const datedDirs = fs
      .readdirSync(backupsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && VALID_DATE_KEY_RE.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const oldDir of datedDirs.slice(7)) {
      try {
        fs.rmSync(path.join(backupsRoot, oldDir), { recursive: true, force: true });
      } catch (pruneErr) {
        console.warn(
          `Daily snapshot prune warning (${oldDir}):`,
          pruneErr instanceof Error ? pruneErr.message : pruneErr
        );
      }
    }
  } catch (err) {
    console.warn('Daily snapshot warning:', err instanceof Error ? err.message : err);
  }
}

export function createPreRestoreSnapshot(dbCtx: DatabaseContext): {
  dirName: string;
  filePath: string;
  createdAt: string;
} {
  const backupsRoot = path.join(dbCtx.dataDir, 'backups');
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const rand = crypto.randomBytes(3).toString('hex');
  const dirName = `pre-restore-${stamp}-${rand}`;
  const dirPath = path.join(backupsRoot, dirName);
  const filePath = path.join(dirPath, 'howard.db');
  dbCtx.checkpointDatabase();
  try {
    vacuumSnapshotTo(dbCtx.db, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch {
      // ignore empty snapshot cleanup errors
    }
    throw createHttpError(
      500,
      `Failed to create pre-restore safety snapshot: ${err instanceof Error ? err.message : err}`
    );
  }

  try {
    const preRestoreDirs = fs
      .readdirSync(backupsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('pre-restore-'))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const oldDir of preRestoreDirs.slice(10)) {
      fs.rmSync(path.join(backupsRoot, oldDir), { recursive: true, force: true });
    }
  } catch (pruneErr) {
    console.warn(
      'Pre-restore snapshot prune warning:',
      pruneErr instanceof Error ? pruneErr.message : pruneErr
    );
  }

  return { dirName, filePath, createdAt: now.toISOString() };
}

export function buildFullBackupPayload(
  dbCtx: DatabaseContext,
  cache: RuntimeCache,
  { includeFloodgate = true }: { includeFloodgate?: boolean } = {}
) {
  dbCtx.checkpointDatabase();
  const howardState = cache.getCachedHowardState();
  const cadenceExportSettings = cache.readCadenceSettings({ includeInternal: true }).settings;
  const cadenceState = cache.getCachedCadenceState();
  const bloomExportSettings = cache.readBloomSettings({ includeInternal: true }).settings;
  const bloomState = cache.getCachedBloomState();
  const quillRaw = cache.getCachedQuillRawState();

  const payload: {
    app: string;
    version: string;
    schemaVersion: number;
    exportedAt: string;
    howard: {
      profiles: typeof howardState.profiles;
      almanacEvents: typeof howardState.almanacEvents;
      ledgerData: typeof howardState.ledgerData;
      beaconInfo: typeof howardState.beaconInfo;
    };
    cadence: {
      settings: typeof cadenceExportSettings;
      logsByDate: typeof cadenceState.logsByDate;
    };
    bloom: {
      settings: typeof bloomExportSettings;
      logsByDate: typeof bloomState.logsByDate;
      molts: typeof bloomState.molts;
      feeders: typeof bloomState.feeders;
    };
    quill: {
      settings: { labels: string[] };
      notes: typeof quillRaw.notes;
    };
    floodgate?: ReturnType<RuntimeCache['getCachedFloodgateState']>;
  } = {
    app: 'Howard',
    version: '2.0.0',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    howard: {
      profiles: howardState.profiles,
      almanacEvents: howardState.almanacEvents,
      ledgerData: howardState.ledgerData,
      beaconInfo: howardState.beaconInfo
    },
    cadence: {
      settings: cadenceExportSettings,
      logsByDate: cadenceState.logsByDate
    },
    bloom: {
      settings: bloomExportSettings,
      logsByDate: bloomState.logsByDate,
      molts: bloomState.molts,
      feeders: bloomState.feeders
    },
    quill: {
      settings: { labels: quillRaw.labels },
      notes: quillRaw.notes
    }
  };

  if (includeFloodgate) {
    const fgState = cache.getCachedFloodgateState();
    payload.floodgate = {
      settings: fgState.settings,
      logsByDate: fgState.logsByDate
    };
  }

  return payload;
}

function mergeArrayEntriesById(baseArr: unknown, incArr: unknown): unknown[] {
  const byId = new Map<unknown, Record<string, unknown>>();
  const unkeyed: unknown[] = [];
  for (const entry of Array.isArray(baseArr) ? baseArr : []) {
    if (isPlainObject(entry) && entry.id) byId.set(entry.id, entry);
    else if (entry !== undefined) unkeyed.push(entry);
  }
  for (const entry of Array.isArray(incArr) ? incArr : []) {
    if (isPlainObject(entry) && entry.id) byId.set(entry.id, entry);
    else if (entry !== undefined) unkeyed.push(entry);
  }
  return [...Array.from(byId.values()), ...unkeyed];
}

export function executeRestorePayload(
  dbCtx: DatabaseContext,
  cache: RuntimeCache,
  incoming: Record<string, unknown>
): RestoreResponse {
  if (incoming.schemaVersion !== undefined) {
    const sv = Number(incoming.schemaVersion);
    if (!Number.isInteger(sv) || sv < 1 || sv > CURRENT_SCHEMA_VERSION) {
      throw createHttpError(400, `Unsupported backup schemaVersion (${incoming.schemaVersion})`);
    }
  }

  const schemaCheck = BackupRestorePayloadSchema.safeParse(incoming);
  if (!schemaCheck.success) {
    const issue = schemaCheck.error.issues[0];
    throw createHttpError(400, issue?.message || 'Invalid backup restore payload');
  }

  const howardSec = isPlainObject(incoming.howard) ? incoming.howard : null;
  const cadenceSec = isPlainObject(incoming.cadence) ? incoming.cadence : null;
  const bloomSec = isPlainObject(incoming.bloom) ? incoming.bloom : null;
  const floodgateSec = isPlainObject(incoming.floodgate) ? incoming.floodgate : null;
  const quillSec = isPlainObject(incoming.quill) ? incoming.quill : null;

  if (!howardSec && !cadenceSec && !bloomSec && !floodgateSec && !quillSec) {
    throw createHttpError(
      400,
      'Backup payload must include at least one howard, cadence, bloom, floodgate, or quill section'
    );
  }

  const isMerge = incoming.mode === 'merge';
  const nowIso = new Date().toISOString();
  const fallbackDate = getLocalDateKey(new Date());

  let validatedProfilesPatch: Profile[] | null = null;
  if (howardSec && howardSec.profiles !== undefined) {
    if (!Array.isArray(howardSec.profiles)) {
      throw createHttpError(400, 'howard.profiles must be an array');
    }
    const rawIncomingProfiles = howardSec.profiles.filter(
      (p): p is Record<string, unknown> => isPlainObject(p) && typeof p.id === 'string'
    );
    const currentProfiles = cache.getProfilesContext().profilesList;
    const incomingById = new Map(rawIncomingProfiles.map((p) => [String(p.id), p]));
    const candidateProfiles = (
      Array.isArray(currentProfiles) ? currentProfiles : DEFAULT_PROFILES
    ).map((prof) => {
      if (prof.id !== 'partner1' && prof.id !== 'partner2') return prof;
      const inc = incomingById.get(prof.id);
      if (!inc) return prof;
      const check = validateProfileNameCandidate(inc.name);
      if (!check.valid) {
        throw createHttpError(400, `Invalid imported profile name for ${prof.id}`);
      }
      const nextEmoji =
        typeof inc.badgeEmoji === 'string' && inc.badgeEmoji.trim()
          ? inc.badgeEmoji.trim()
          : prof.badgeEmoji;
      let nextPinHash = prof.pinHash || '';
      if (typeof inc.pin === 'string' && inc.pin.trim() && inc.pinEnabled) {
        nextPinHash = hashPin(inc.pin.trim());
      }
      return {
        ...prof,
        name: check.cleaned,
        caregiverName: check.cleaned,
        badgeEmoji: nextEmoji,
        pin: '',
        pinHash: nextPinHash
      };
    });
    const seenNames = new Set<string>();
    for (const p of candidateProfiles) {
      const key = String(p.name || '').trim().toLowerCase();
      if (seenNames.has(key)) {
        throw createHttpError(400, `Duplicate profile name "${p.name}" in backup`);
      }
      seenNames.add(key);
    }
    validatedProfilesPatch = candidateProfiles;
  }

  if (howardSec && Array.isArray(howardSec.almanacEvents)) {
    for (const evt of howardSec.almanacEvents) {
      if (!isPlainObject(evt)) {
        throw createHttpError(400, 'Each imported Almanac event must be an object');
      }
      const dateToValidate =
        typeof evt.date === 'string' && evt.date.trim() ? evt.date : fallbackDate;
      const errMsg = validateAlmanacEventFields({ ...evt, date: dateToValidate });
      if (errMsg) {
        throw createHttpError(400, errMsg);
      }
    }
  }

  let validatedLedgerPlan: {
    normalized: ReturnType<typeof normalizeLedgerData>;
    hasExplicitSplitRule: boolean;
  } | null = null;
  if (howardSec && isPlainObject(howardSec.ledgerData)) {
    const normalized = normalizeLedgerData(howardSec.ledgerData);
    const seenLedgerIds = new Set<string>();
    for (const item of [...normalized.expenses, ...normalized.recurring, ...normalized.incomes]) {
      const cleanedId = String(item.id || '').trim();
      if (!cleanedId) {
        throw createHttpError(400, 'Each imported ledger item requires a non-empty id');
      }
      if (seenLedgerIds.has(cleanedId)) {
        throw createHttpError(
          400,
          `Duplicate ledger item id "${cleanedId}" across backup sections`
        );
      }
      seenLedgerIds.add(cleanedId);
    }
    validatedLedgerPlan = {
      normalized,
      hasExplicitSplitRule:
        howardSec.ledgerData.splitRule === '50-50' ||
        howardSec.ledgerData.splitRule === 'proportional'
    };
  }

  const howardPlan = howardSec
    ? {
        profiles: validatedProfilesPatch,
        events: Array.isArray(howardSec.almanacEvents)
          ? howardSec.almanacEvents
              .filter((evt): evt is Record<string, unknown> => isPlainObject(evt))
              .map((evt, idx) => {
                const rawId = typeof evt.id === 'string' ? evt.id.trim() : '';
                const id = rawId || `evt-${Date.now()}-${idx}`;
                const dateKey =
                  typeof evt.date === 'string' && isValidDateKey(evt.date)
                    ? evt.date
                    : fallbackDate;
                const updatedAt = typeof evt.updatedAt === 'string' ? evt.updatedAt : nowIso;
                return {
                  id,
                  dateKey,
                  record: { ...evt, title: String(evt.title).trim(), id, date: dateKey },
                  updatedAt
                };
              })
          : null,
        ledger: validatedLedgerPlan,
        beacon: isPlainObject(howardSec.beaconInfo) ? howardSec.beaconInfo : null
      }
    : null;

  const cadencePlan = cadenceSec
    ? {
        settings: isPlainObject(cadenceSec.settings) ? cadenceSec.settings : null,
        logs: isPlainObject(cadenceSec.logsByDate)
          ? Object.entries(cadenceSec.logsByDate)
              .filter(
                (entry): entry is [string, Record<string, unknown>] =>
                  isValidDateKey(entry[0]) && isPlainObject(entry[1])
              )
              .map(([dk, rec]) => ({
                dateKey: dk,
                record: { ...rec, dateKey: dk } as Record<string, unknown>,
                updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : nowIso
              }))
          : null
      }
    : null;

  const bloomPlan = bloomSec
    ? {
        settings: isPlainObject(bloomSec.settings) ? bloomSec.settings : null,
        logs: isPlainObject(bloomSec.logsByDate)
          ? Object.entries(bloomSec.logsByDate)
              .filter(
                (entry): entry is [string, Record<string, unknown>] =>
                  isValidDateKey(entry[0]) && isPlainObject(entry[1])
              )
              .map(([dk, rec]) => ({
                dateKey: dk,
                record: { ...rec, dateKey: dk } as Record<string, unknown>,
                updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : nowIso
              }))
          : null,
        molts: Array.isArray(bloomSec.molts)
          ? bloomSec.molts
              .filter(
                (m): m is Record<string, unknown> =>
                  isPlainObject(m) &&
                  m.id !== undefined &&
                  m.id !== null &&
                  String(m.id).trim() !== '' &&
                  typeof m.dateKey === 'string' &&
                  isValidDateKey(m.dateKey)
              )
              .map((m) => {
                const id = String(m.id).trim();
                return {
                  id,
                  dateKey: String(m.dateKey),
                  record: { ...m, id },
                  updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : nowIso
                };
              })
          : null,
        feeders: Array.isArray(bloomSec.feeders)
          ? bloomSec.feeders
              .filter(
                (f): f is Record<string, unknown> =>
                  isPlainObject(f) &&
                  f.id !== undefined &&
                  f.id !== null &&
                  String(f.id).trim() !== ''
              )
              .map((f) => {
                const id = String(f.id).trim();
                return {
                  id,
                  record: { ...f, id },
                  updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : nowIso
                };
              })
          : null
      }
    : null;

  const rawFgLogs = floodgateSec
    ? isPlainObject(floodgateSec.logsByDate)
      ? floodgateSec.logsByDate
      : isPlainObject(floodgateSec.logs)
        ? floodgateSec.logs
        : null
    : null;

  const floodgatePlan = floodgateSec
    ? {
        settings: isPlainObject(floodgateSec.settings) ? floodgateSec.settings : null,
        logs: rawFgLogs
          ? Object.entries(rawFgLogs)
              .filter(
                (entry): entry is [string, Record<string, unknown>] =>
                  isValidDateKey(entry[0]) && isPlainObject(entry[1])
              )
              .map(([dk, rec]) => ({
                dateKey: dk,
                record: { ...rec, date: dk },
                updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : nowIso
              }))
          : null
      }
    : null;

  const quillPlan = quillSec
    ? {
        labels:
          isPlainObject(quillSec.settings) && Array.isArray(quillSec.settings.labels)
            ? normalizeQuillLabels(quillSec.settings.labels, MAX_HOUSEHOLD_LABELS)
            : null,
        notes: Array.isArray(quillSec.notes)
          ? quillSec.notes.filter(
              (n): n is Record<string, unknown> =>
                isPlainObject(n) && typeof n.id === 'string' && Boolean(n.id.trim())
            )
          : null
      }
    : null;

  const snapshot = createPreRestoreSnapshot(dbCtx);

  dbCtx.runInTransaction(() => {
    const dbProfiles = dbCtx.readHowardKey<Profile[]>('profiles', DEFAULT_PROFILES);
    let effectiveProfiles =
      Array.isArray(dbProfiles.data) && dbProfiles.data.length > 0
        ? dbProfiles.data
        : DEFAULT_PROFILES;

    if (howardPlan?.profiles) {
      effectiveProfiles = howardPlan.profiles;
      dbCtx.stmts.howardUpsert.run('profiles', JSON.stringify(howardPlan.profiles), nowIso);
    }
    const effectiveMap = buildProfilesByIdMap(effectiveProfiles);

    if (howardPlan?.events) {
      if (!isMerge) dbCtx.stmts.almanacClearAll.run();
      for (const item of howardPlan.events) {
        const enriched = enrichAlmanacEvent(item.record, effectiveProfiles, effectiveMap);
        dbCtx.stmts.almanacUpsert.run(
          item.id,
          item.dateKey,
          JSON.stringify(enriched),
          item.updatedAt
        );
      }
    }

    if (howardPlan?.ledger) {
      if (!isMerge || howardPlan.ledger.hasExplicitSplitRule) {
        dbCtx.stmts.howardUpsert.run(
          'ledger_settings',
          JSON.stringify({ splitRule: howardPlan.ledger.normalized.splitRule }),
          nowIso
        );
      }
      if (!isMerge) dbCtx.stmts.ledgerClearAll.run();
      writeLedgerItemsInTx(dbCtx, howardPlan.ledger.normalized, { nowIso });
    }

    if (howardPlan?.beacon) {
      const nextBeacon = isMerge
        ? mergeBeaconInfo(
            dbCtx.readHowardKey('beacon_info', DEFAULT_BEACON_INFO).data,
            howardPlan.beacon,
            effectiveProfiles,
            { mergeContacts: true, profilesById: effectiveMap }
          )
        : normalizeBeaconInfo(howardPlan.beacon, {
            profilesList: effectiveProfiles,
            profilesById: effectiveMap
          });
      dbCtx.stmts.howardUpsert.run('beacon_info', JSON.stringify(nextBeacon), nowIso);
    }

    if (cadencePlan?.settings) {
      const defaultCad = createDefaultCadenceSettings();
      const base = isMerge
        ? dbCtx.readHowardKey('cadence_settings', defaultCad).data
        : defaultCad;
      const merged = normalizeCadenceSettings(cadencePlan.settings, base, effectiveProfiles);
      dbCtx.stmts.howardUpsert.run('cadence_settings', JSON.stringify(merged), nowIso);
    }
    if (cadencePlan?.logs) {
      if (!isMerge) dbCtx.stmts.cadenceClearLogs.run();
      for (const item of cadencePlan.logs) {
        let nextRec: Record<string, unknown> = item.record;
        if (isMerge) {
          const existingRow = dbCtx.stmts.cadenceGetLogByDate.get(item.dateKey) as
            | { data: string }
            | undefined;
          if (existingRow) {
            try {
              const currentDay: unknown = JSON.parse(existingRow.data);
              if (isPlainObject(currentDay)) {
                nextRec = {
                  ...currentDay,
                  ...item.record,
                  dateKey: item.dateKey,
                  ...(currentDay.morning !== undefined && !isPlainObject(item.record.morning)
                    ? { morning: currentDay.morning }
                    : {}),
                  ...(currentDay.evening !== undefined && !isPlainObject(item.record.evening)
                    ? { evening: currentDay.evening }
                    : {})
                };
              }
            } catch (err) {
              console.error(`[Restore] Corrupt existing Cadence row ${item.dateKey}:`, err);
            }
          }
        }
        const enriched = enrichCadenceRecord(nextRec, effectiveProfiles, effectiveMap);
        dbCtx.stmts.cadenceUpsertLog.run(item.dateKey, JSON.stringify(enriched), item.updatedAt);
      }
    }

    if (bloomPlan?.settings) {
      const defaultBloom = createDefaultBloomSettings();
      const current = dbCtx.readHowardKey('bloom_settings', defaultBloom).data;
      const merged = isMerge
        ? normalizeBloomSettings(bloomPlan.settings, current, effectiveProfiles)
        : normalizeBloomSettings(bloomPlan.settings, null, effectiveProfiles);
      dbCtx.stmts.howardUpsert.run('bloom_settings', JSON.stringify(merged), nowIso);
    }
    if (bloomPlan?.logs) {
      if (!isMerge) dbCtx.stmts.bloomClearLogs.run();
      for (const item of bloomPlan.logs) {
        let nextRec: Record<string, unknown> = item.record;
        if (isMerge) {
          const existingRow = dbCtx.stmts.bloomGetLogByDate.get(item.dateKey) as
            | { data: string }
            | undefined;
          if (existingRow) {
            try {
              const cur: unknown = JSON.parse(existingRow.data);
              if (isPlainObject(cur)) {
                const curAbdAt =
                  typeof cur.abdomenUpdatedAt === 'string' ? cur.abdomenUpdatedAt : '';
                const incAbdAt =
                  typeof item.record.abdomenUpdatedAt === 'string'
                    ? item.record.abdomenUpdatedAt
                    : '';
                const keepCurAbdomen =
                  Boolean(cur.abdomenStatus) &&
                  (!item.record.abdomenStatus || (Boolean(curAbdAt) && curAbdAt > incAbdAt));
                nextRec = {
                  ...cur,
                  ...item.record,
                  dateKey: item.dateKey,
                  mists: mergeArrayEntriesById(cur.mists, item.record.mists),
                  feedings: mergeArrayEntriesById(cur.feedings, item.record.feedings),
                  climateChecks: mergeArrayEntriesById(cur.climateChecks, item.record.climateChecks),
                  behaviors: Array.from(
                    new Set([
                      ...(Array.isArray(cur.behaviors) ? (cur.behaviors as string[]) : []),
                      ...(Array.isArray(item.record.behaviors)
                        ? (item.record.behaviors as string[])
                        : [])
                    ])
                  ),
                  abdomenStatus: keepCurAbdomen ? cur.abdomenStatus : item.record.abdomenStatus,
                  abdomenUpdatedAt: keepCurAbdomen
                    ? cur.abdomenUpdatedAt
                    : item.record.abdomenUpdatedAt,
                  journalNote:
                    typeof item.record.journalNote === 'string' && item.record.journalNote.trim()
                      ? item.record.journalNote
                      : cur.journalNote || ''
                };
              }
            } catch (err) {
              console.error(`[Restore] Corrupt existing Bloom row ${item.dateKey}:`, err);
            }
          }
        }
        const enriched = enrichBloomCareRecord(nextRec, effectiveProfiles, effectiveMap);
        dbCtx.stmts.bloomUpsertLog.run(item.dateKey, JSON.stringify(enriched), item.updatedAt);
      }
    }
    if (bloomPlan?.molts) {
      if (!isMerge) dbCtx.stmts.bloomClearMolts.run();
      for (const m of bloomPlan.molts) {
        const enriched = enrichBloomMoltRecord(m.record, effectiveProfiles, effectiveMap);
        dbCtx.stmts.bloomUpsertMolt.run(m.id, m.dateKey, JSON.stringify(enriched), m.updatedAt);
      }
    }
    if (bloomPlan?.feeders) {
      if (!isMerge) dbCtx.stmts.bloomClearFeeders.run();
      for (const f of bloomPlan.feeders) {
        dbCtx.stmts.bloomUpsertFeeder.run(f.id, JSON.stringify(f.record), f.updatedAt);
      }
    }

    if (floodgatePlan?.settings) {
      const base = isMerge
        ? dbCtx.readHowardKey('floodgate_settings', DEFAULT_FLOODGATE_SETTINGS).data
        : DEFAULT_FLOODGATE_SETTINGS;
      const merged = {
        ...DEFAULT_FLOODGATE_SETTINGS,
        ...base,
        ...floodgatePlan.settings,
        ownerProfileId: 'partner2'
      };
      dbCtx.stmts.howardUpsert.run('floodgate_settings', JSON.stringify(merged), nowIso);
    }
    if (floodgatePlan?.logs) {
      if (!isMerge) dbCtx.stmts.floodgateClearLogs.run();
      for (const item of floodgatePlan.logs) {
        if (isMerge) {
          const existingRow = dbCtx.stmts.floodgateGetLogByDate.get(item.dateKey) as
            | { data: string }
            | undefined;
          if (existingRow) {
            try {
              const cur: unknown = JSON.parse(existingRow.data);
              const curUpd = isPlainObject(cur) && typeof cur.updatedAt === 'string' ? cur.updatedAt : '';
              if (curUpd && item.updatedAt && curUpd > item.updatedAt) {
                continue;
              }
            } catch (err) {
              console.error(`[Restore] Corrupt Floodgate row ${item.dateKey}:`, err);
            }
          }
        }
        dbCtx.stmts.floodgateUpsertLog.run(item.dateKey, JSON.stringify(item.record), item.updatedAt);
      }
    }

    if (quillPlan?.labels) {
      const currentLabels = isMerge
        ? dbCtx.readHowardKey('quill_settings', DEFAULT_QUILL_SETTINGS).data?.labels || []
        : [];
      const mergedLabels = normalizeQuillLabels(
        [...currentLabels, ...quillPlan.labels],
        MAX_HOUSEHOLD_LABELS
      );
      dbCtx.stmts.howardUpsert.run('quill_settings', JSON.stringify({ labels: mergedLabels }), nowIso);
    }
    if (quillPlan?.notes) {
      if (!isMerge) dbCtx.stmts.quillClearAll.run();
      const restoredSharedLabels: string[] = [];
      for (let i = 0; i < quillPlan.notes.length; i++) {
        const rawNote = quillPlan.notes[i];
        if (!rawNote) continue;
        const noteId = String(rawNote.id).trim();
        const ownerPid: ProfileId =
          rawNote.ownerProfileId === 'partner1' || rawNote.ownerProfileId === 'partner2'
            ? rawNote.ownerProfileId
            : 'partner1';
        const validActor = (pid: unknown, fallback: ProfileId): ProfileId =>
          pid === 'partner1' || pid === 'partner2' || pid === 'caregiver' ? pid : fallback;
        const createdByPid = validActor(rawNote.createdByProfileId, ownerPid);
        const updatedByPid = validActor(rawNote.updatedByProfileId, ownerPid);

        const incomingUpdatedAt = typeof rawNote.updatedAt === 'string' ? rawNote.updatedAt : '';
        if (isMerge) {
          const existingRow = dbCtx.stmts.quillGetById.get(noteId) as
            | { updated_at?: string }
            | undefined;
          if (existingRow?.updated_at && existingRow.updated_at > incomingUpdatedAt) {
            continue;
          }
        }

        const safeColor =
          typeof rawNote.color === 'string' &&
          VALID_NOTE_COLORS.has(rawNote.color as typeof VALID_NOTE_COLORS extends Set<infer U> ? U : never)
            ? rawNote.color
            : 'default';
        const validated = validateAndNormalizeQuillNote(
          { ...rawNote, id: noteId, color: safeColor },
          null,
          {
            callerProfile: ownerPid,
            profilesById: effectiveMap,
            nowIso: incomingUpdatedAt || nowIso,
            defaultPosition: (i + 1) * 1000,
            preserveOwner: true
          }
        );
        if (validated.error !== undefined) {
          throw createHttpError(400, `Invalid Quill note "${noteId}": ${validated.error}`);
        }
        const rec = {
          ...validated.record,
          id: noteId,
          ownerProfileId: ownerPid,
          createdByProfileId: createdByPid,
          createdBy:
            effectiveMap[createdByPid]?.name ||
            (typeof rawNote.createdBy === 'string' && rawNote.createdBy) ||
            validated.record.createdBy,
          updatedByProfileId: updatedByPid,
          updatedBy:
            effectiveMap[updatedByPid]?.name ||
            (typeof rawNote.updatedBy === 'string' && rawNote.updatedBy) ||
            validated.record.updatedBy,
          revision:
            Number.isInteger(Number(rawNote.revision)) && Number(rawNote.revision) > 0
              ? Number(rawNote.revision)
              : 1,
          createdAt: typeof rawNote.createdAt === 'string' ? rawNote.createdAt : nowIso,
          updatedAt: incomingUpdatedAt || nowIso,
          trashedAt:
            validated.record.status === 'trashed'
              ? typeof rawNote.trashedAt === 'string'
                ? rawNote.trashedAt
                : nowIso
              : null
        };
        if (rec.visibility === 'shared' && Array.isArray(rec.labels)) {
          restoredSharedLabels.push(...rec.labels);
        }
        dbCtx.stmts.quillUpsert.run(
          rec.id,
          rec.ownerProfileId,
          rec.visibility,
          rec.status,
          rec.pinned ? 1 : 0,
          rec.position,
          rec.revision,
          JSON.stringify(rec),
          rec.updatedAt
        );
      }
      if (restoredSharedLabels.length > 0) {
        const curLabels =
          dbCtx.readHowardKey('quill_settings', DEFAULT_QUILL_SETTINGS).data?.labels || [];
        const nextLabels = normalizeQuillLabels(
          [...curLabels, ...restoredSharedLabels],
          MAX_HOUSEHOLD_LABELS
        );
        dbCtx.stmts.howardUpsert.run('quill_settings', JSON.stringify({ labels: nextLabels }), nowIso);
      }
    }
  });

  cache.bumpRevision('all');

  return {
    restored: true,
    mode: isMerge ? 'merge' : 'replace',
    preRestoreSnapshot: snapshot.dirName,
    updatedAt: nowIso
  };
}
