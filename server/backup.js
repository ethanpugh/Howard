import fs from 'node:fs';
import path from 'node:path';
import { VALID_DATE_KEY_RE, getLocalDateKey } from '../shared/dateUtils.js';
import { DEFAULT_PROFILES } from '../shared/profileUtils.js';
import {
  DEFAULT_BEACON_INFO,
  DEFAULT_FLOODGATE_SETTINGS,
  createDefaultBloomSettings,
  createDefaultCadenceSettings
} from '../shared/defaults.js';
import {
  CURRENT_SCHEMA_VERSION,
  createHttpError,
  isPlainObject,
  validateProfileNameCandidate,
  vacuumSnapshotTo
} from './utils.js';
import { writeLedgerItemsInTx } from './migrations.js';
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
} from './domains/profileResolve.js';

export function runDailyBackupSnapshots(dbCtx) {
  try {
    const backupsRoot = path.join(dbCtx.dataDir, 'backups');
    const todayDir = path.join(backupsRoot, getLocalDateKey(new Date()));
    fs.mkdirSync(todayDir, { recursive: true });

    const finalPath = path.join(todayDir, 'howard.db');
    if (!fs.existsSync(finalPath)) {
      try {
        vacuumSnapshotTo(dbCtx.db, finalPath);
      } catch (snapErr) {
        console.warn('Daily snapshot warning (howard.db):', snapErr.message || snapErr);
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
        console.warn(`Daily snapshot prune warning (${oldDir}):`, pruneErr.message || pruneErr);
      }
    }
  } catch (err) {
    console.warn('Daily snapshot warning:', err.message || err);
  }
}

export function createPreRestoreSnapshot(dbCtx) {
  const backupsRoot = path.join(dbCtx.dataDir, 'backups');
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const dirName = `pre-restore-${stamp}`;
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
      `Failed to create pre-restore safety snapshot: ${err?.message || err}`
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
    console.warn('Pre-restore snapshot prune warning:', pruneErr.message || pruneErr);
  }

  return { dirName, filePath, createdAt: now.toISOString() };
}

export function buildFullBackupPayload(dbCtx, cache, { includeFloodgate = true } = {}) {
  dbCtx.checkpointDatabase();
  const howardState = cache.getCachedHowardState();
  const cadenceExportSettings = cache.readCadenceSettings({ includeInternal: true }).settings;
  const cadenceState = cache.getCachedCadenceState();
  const bloomExportSettings = cache.readBloomSettings({ includeInternal: true }).settings;
  const bloomState = cache.getCachedBloomState();

  const payload = {
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

function mergeArrayEntriesById(baseArr, incArr) {
  const byId = new Map();
  const unkeyed = [];
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

export function executeRestorePayload(dbCtx, cache, incoming) {
  if (incoming.schemaVersion !== undefined) {
    const sv = Number(incoming.schemaVersion);
    if (!Number.isInteger(sv) || sv < 1 || sv > CURRENT_SCHEMA_VERSION) {
      throw createHttpError(400, `Unsupported backup schemaVersion (${incoming.schemaVersion})`);
    }
  }

  const hasHoward = isPlainObject(incoming.howard);
  const hasCadence = isPlainObject(incoming.cadence);
  const hasBloom = isPlainObject(incoming.bloom);
  const hasFloodgate = isPlainObject(incoming.floodgate);
  if (!hasHoward && !hasCadence && !hasBloom && !hasFloodgate) {
    throw createHttpError(
      400,
      'Backup payload must include at least one howard, cadence, bloom, or floodgate section'
    );
  }

  const isMerge = incoming.mode === 'merge';
  const nowIso = new Date().toISOString();
  const fallbackDate = getLocalDateKey(new Date());

  let validatedProfilesPatch = null;
  if (hasHoward && incoming.howard.profiles !== undefined) {
    if (!Array.isArray(incoming.howard.profiles)) {
      throw createHttpError(400, 'howard.profiles must be an array');
    }
    const rawIncomingProfiles = incoming.howard.profiles.filter(
      (p) => isPlainObject(p) && typeof p.id === 'string'
    );
    const currentProfiles = cache.getProfilesContext().profilesList;
    const incomingById = new Map(rawIncomingProfiles.map((p) => [p.id, p]));
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
      return {
        ...prof,
        name: check.cleaned,
        caregiverName: check.cleaned,
        badgeEmoji: nextEmoji
      };
    });
    const seenNames = new Set();
    for (const p of candidateProfiles) {
      const key = String(p.name || '').trim().toLowerCase();
      if (seenNames.has(key)) {
        throw createHttpError(400, `Duplicate profile name "${p.name}" in backup`);
      }
      seenNames.add(key);
    }
    validatedProfilesPatch = candidateProfiles;
  }

  const howardPlan = hasHoward
    ? {
        profiles: validatedProfilesPatch,
        events: Array.isArray(incoming.howard.almanacEvents)
          ? incoming.howard.almanacEvents
              .filter((evt) => isPlainObject(evt))
              .map((evt, idx) => {
                const id = String(evt.id || `evt-${Date.now()}-${idx}`);
                const dateKey =
                  typeof evt.date === 'string' && VALID_DATE_KEY_RE.test(evt.date)
                    ? evt.date
                    : fallbackDate;
                const updatedAt = typeof evt.updatedAt === 'string' ? evt.updatedAt : nowIso;
                return { id, dateKey, record: { ...evt, id, date: dateKey }, updatedAt };
              })
          : null,
        ledger: isPlainObject(incoming.howard.ledgerData)
          ? {
              normalized: normalizeLedgerData(incoming.howard.ledgerData),
              hasExplicitSplitRule:
                incoming.howard.ledgerData.splitRule === '50-50' ||
                incoming.howard.ledgerData.splitRule === 'proportional'
            }
          : null,
        beacon: isPlainObject(incoming.howard.beaconInfo) ? incoming.howard.beaconInfo : null
      }
    : null;

  const cadencePlan = hasCadence
    ? {
        settings: isPlainObject(incoming.cadence.settings) ? incoming.cadence.settings : null,
        logs: isPlainObject(incoming.cadence.logsByDate)
          ? Object.entries(incoming.cadence.logsByDate)
              .filter(([dk, rec]) => VALID_DATE_KEY_RE.test(dk) && isPlainObject(rec))
              .map(([dk, rec]) => ({
                dateKey: dk,
                record: { ...rec, dateKey: dk },
                updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : nowIso
              }))
          : null
      }
    : null;

  const bloomPlan = hasBloom
    ? {
        settings: isPlainObject(incoming.bloom.settings) ? incoming.bloom.settings : null,
        logs: isPlainObject(incoming.bloom.logsByDate)
          ? Object.entries(incoming.bloom.logsByDate)
              .filter(([dk, rec]) => VALID_DATE_KEY_RE.test(dk) && isPlainObject(rec))
              .map(([dk, rec]) => ({
                dateKey: dk,
                record: { ...rec, dateKey: dk },
                updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : nowIso
              }))
          : null,
        molts: Array.isArray(incoming.bloom.molts)
          ? incoming.bloom.molts
              .filter(
                (m) =>
                  isPlainObject(m) &&
                  m.id !== undefined &&
                  m.id !== null &&
                  String(m.id).trim() !== '' &&
                  typeof m.dateKey === 'string' &&
                  VALID_DATE_KEY_RE.test(m.dateKey)
              )
              .map((m) => {
                const id = String(m.id);
                return {
                  id,
                  dateKey: m.dateKey,
                  record: { ...m, id },
                  updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : nowIso
                };
              })
          : null,
        feeders: Array.isArray(incoming.bloom.feeders)
          ? incoming.bloom.feeders
              .filter(
                (f) =>
                  isPlainObject(f) &&
                  f.id !== undefined &&
                  f.id !== null &&
                  String(f.id).trim() !== ''
              )
              .map((f) => {
                const id = String(f.id);
                return {
                  id,
                  record: { ...f, id },
                  updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : nowIso
                };
              })
          : null
      }
    : null;

  const rawFgLogs = hasFloodgate
    ? isPlainObject(incoming.floodgate.logsByDate)
      ? incoming.floodgate.logsByDate
      : isPlainObject(incoming.floodgate.logs)
        ? incoming.floodgate.logs
        : null
    : null;

  const floodgatePlan = hasFloodgate
    ? {
        settings: isPlainObject(incoming.floodgate.settings) ? incoming.floodgate.settings : null,
        logs: rawFgLogs
          ? Object.entries(rawFgLogs)
              .filter(([dk, rec]) => VALID_DATE_KEY_RE.test(dk) && isPlainObject(rec))
              .map(([dk, rec]) => ({
                dateKey: dk,
                record: { ...rec, date: dk },
                updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : nowIso
              }))
          : null
      }
    : null;

  const snapshot = createPreRestoreSnapshot(dbCtx);

  dbCtx.runInTransaction(() => {
    let effectiveProfiles = cache.getProfilesContext().profilesList;
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
      const base = isMerge
        ? dbCtx.readHowardKey('cadence_settings', createDefaultCadenceSettings()).data
        : createDefaultCadenceSettings();
      const merged = normalizeCadenceSettings(cadencePlan.settings, base, effectiveProfiles);
      dbCtx.stmts.howardUpsert.run('cadence_settings', JSON.stringify(merged), nowIso);
    }
    if (cadencePlan?.logs) {
      if (!isMerge) dbCtx.stmts.cadenceClearLogs.run();
      for (const item of cadencePlan.logs) {
        let nextRec = item.record;
        if (isMerge) {
          const existingRow = dbCtx.stmts.cadenceGetLogByDate.get(item.dateKey);
          if (existingRow) {
            try {
              const currentDay = JSON.parse(existingRow.data);
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
            } catch {
              // fall back to incoming
            }
          }
        }
        const enriched = enrichCadenceRecord(nextRec, effectiveProfiles, effectiveMap);
        dbCtx.stmts.cadenceUpsertLog.run(item.dateKey, JSON.stringify(enriched), item.updatedAt);
      }
    }

    if (bloomPlan?.settings) {
      const current = dbCtx.readHowardKey('bloom_settings', createDefaultBloomSettings()).data;
      const merged = isMerge
        ? normalizeBloomSettings(bloomPlan.settings, current, effectiveProfiles)
        : normalizeBloomSettings(bloomPlan.settings, null, effectiveProfiles);
      dbCtx.stmts.howardUpsert.run('bloom_settings', JSON.stringify(merged), nowIso);
    }
    if (bloomPlan?.logs) {
      if (!isMerge) dbCtx.stmts.bloomClearLogs.run();
      for (const item of bloomPlan.logs) {
        let nextRec = item.record;
        if (isMerge) {
          const existingRow = dbCtx.stmts.bloomGetLogByDate.get(item.dateKey);
          if (existingRow) {
            try {
              const cur = JSON.parse(existingRow.data);
              const curAbdAt = cur.abdomenUpdatedAt || '';
              const incAbdAt = item.record.abdomenUpdatedAt || '';
              const keepCurAbdomen =
                cur.abdomenStatus && (!item.record.abdomenStatus || (curAbdAt && curAbdAt > incAbdAt));
              nextRec = {
                ...cur,
                ...item.record,
                dateKey: item.dateKey,
                mists: mergeArrayEntriesById(cur.mists, item.record.mists),
                feedings: mergeArrayEntriesById(cur.feedings, item.record.feedings),
                climateChecks: mergeArrayEntriesById(cur.climateChecks, item.record.climateChecks),
                behaviors: Array.from(
                  new Set([
                    ...(Array.isArray(cur.behaviors) ? cur.behaviors : []),
                    ...(Array.isArray(item.record.behaviors) ? item.record.behaviors : [])
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
            } catch {
              // fall back to incoming
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
          const existingRow = dbCtx.stmts.floodgateGetLogByDate.get(item.dateKey);
          if (existingRow) {
            try {
              const cur = JSON.parse(existingRow.data);
              if (cur?.updatedAt && item.updatedAt && cur.updatedAt > item.updatedAt) {
                continue;
              }
            } catch {
              // overwrite malformed row
            }
          }
        }
        dbCtx.stmts.floodgateUpsertLog.run(item.dateKey, JSON.stringify(item.record), item.updatedAt);
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
