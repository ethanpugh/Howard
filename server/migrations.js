import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { VALID_DATE_KEY_RE, getLocalDateKey } from '../shared/dateUtils.js';
import { DEFAULT_PROFILES, VALID_APP_IDS } from '../shared/profileUtils.js';
import {
  DEFAULT_BEACON_INFO,
  DEFAULT_FLOODGATE_SETTINGS,
  DEFAULT_LEDGER_DATA,
  DEFAULT_QUILL_SETTINGS,
  createDefaultBloomSettings,
  createDefaultCadenceSettings
} from '../shared/defaults.js';
import {
  CURRENT_SCHEMA_VERSION,
  LEGACY_DB_FILES,
  getSchemaVersion,
  isPlainObject,
  vacuumSnapshotTo
} from './utils.js';
import {
  buildCaregiverItems,
  buildProfilesByIdMap,
  enrichAlmanacEvent,
  enrichBloomCareRecord,
  enrichBloomMoltRecord,
  enrichCadenceRecord,
  normalizeBeaconInfo,
  normalizeBloomSettings,
  normalizeCadenceSettings,
  normalizeLedgerData
} from './domains/profileResolve.js';

function isMissingTableError(err) {
  return Boolean(err && typeof err.message === 'string' && /no such table/i.test(err.message));
}

function readLegacyTableSafely(dbInstance, sql) {
  try {
    return dbInstance.prepare(sql).all();
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

function readLegacySingleKeySafely(dbInstance, table, key) {
  try {
    return dbInstance.prepare(`SELECT data, updated_at FROM ${table} WHERE id = ?`).get(key) || null;
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

export function writeLedgerItemsInTx(
  dbCtx,
  normalized,
  { nowIso, idPrefix = '' } = {}
) {
  const groups = [
    ['expense', normalized.expenses, 'exp'],
    ['recurring', normalized.recurring, 'rec'],
    ['income', normalized.incomes, 'inc']
  ];
  for (const [kind, list, prefix] of groups) {
    list.forEach((item, idx) => {
      if (!isPlainObject(item)) return;
      const id = String(item.id || `${prefix}-${idPrefix}${Date.now()}-${idx}`);
      const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : nowIso;
      dbCtx.stmts.ledgerUpsert.run(id, kind, JSON.stringify({ ...item, id }), updatedAt);
    });
  }
}

function normalizeProfilesAppsList(
  dbCtx,
  profiles,
  { ensureBloom = true, ensureQuill = false, stripUnknown = false } = {}
) {
  const nowIso = new Date().toISOString();
  if (!Array.isArray(profiles)) return false;
  let changed = false;
  const targetProfiles = new Set(['partner1', 'partner2', 'caregiver']);
  const next = profiles.map((prof) => {
    if (!isPlainObject(prof)) return prof;
    let apps = Array.isArray(prof.allowedApps)
      ? [...prof.allowedApps]
      : ['foyer', 'cadence', 'beacon'];
    if (stripUnknown) {
      const filtered = apps.filter((id) => VALID_APP_IDS.has(id));
      if (filtered.length !== apps.length) {
        apps = filtered;
        changed = true;
      }
    }
    if (ensureBloom && targetProfiles.has(prof.id) && !apps.includes('bloom')) {
      changed = true;
      const cadenceIdx = apps.indexOf('cadence');
      if (cadenceIdx !== -1) apps.splice(cadenceIdx + 1, 0, 'bloom');
      else apps.push('bloom');
    }
    if (ensureQuill && targetProfiles.has(prof.id) && !apps.includes('quill')) {
      changed = true;
      const beaconIdx = apps.indexOf('beacon');
      if (beaconIdx !== -1) apps.splice(beaconIdx, 0, 'quill');
      else apps.push('quill');
    }
    return { ...prof, allowedApps: apps };
  });
  if (changed) {
    dbCtx.stmts.howardUpsert.run('profiles', JSON.stringify(next), nowIso);
  }
  return changed;
}

function migrateV1LegacyHowardBlobs(dbCtx) {
  const nowIso = new Date().toISOString();
  const fallbackDate = getLocalDateKey(new Date());

  const existingEvtCount = Number(dbCtx.stmts.almanacCount.get()?.cnt || 0);
  if (existingEvtCount === 0) {
    const legacyEventsObj = dbCtx.readHowardKey('almanac_events', []);
    if (Array.isArray(legacyEventsObj.data) && legacyEventsObj.data.length > 0) {
      legacyEventsObj.data.forEach((evt, idx) => {
        if (!isPlainObject(evt)) return;
        const id = String(evt.id || `evt-mig-${Date.now()}-${idx}`);
        const dateKey =
          typeof evt.date === 'string' && VALID_DATE_KEY_RE.test(evt.date)
            ? evt.date
            : fallbackDate;
        dbCtx.stmts.almanacUpsert.run(
          id,
          dateKey,
          JSON.stringify({ ...evt, id, date: dateKey }),
          typeof evt.updatedAt === 'string' ? evt.updatedAt : legacyEventsObj.updatedAt || nowIso
        );
      });
    }
  }

  const legacyLedgerRow = dbCtx.stmts.howardGet.get('ledger_data');
  if (legacyLedgerRow) {
    const legacyLedgerObj = dbCtx.readHowardKey('ledger_data', DEFAULT_LEDGER_DATA);
    const normalized = normalizeLedgerData(legacyLedgerObj.data);
    const existingLedgerCount = Number(dbCtx.stmts.ledgerCount.get()?.cnt || 0);
    if (existingLedgerCount === 0) {
      dbCtx.stmts.howardUpsert.run(
        'ledger_settings',
        JSON.stringify({ splitRule: normalized.splitRule }),
        legacyLedgerObj.updatedAt || nowIso
      );
      writeLedgerItemsInTx(dbCtx, normalized, {
        nowIso: legacyLedgerObj.updatedAt || nowIso,
        idPrefix: 'mig-'
      });
    }
  }
}

function migrateV3ConsolidateLegacyDatabases(dbCtx) {
  const nowIso = new Date().toISOString();
  const archiveStamp = nowIso.replace(/[:.]/g, '-');
  const archiveDir = path.join(dbCtx.dataDir, 'backups', `legacy-4db-${archiveStamp}`);
  const existingLegacyPaths = LEGACY_DB_FILES.map((name) => path.join(dbCtx.dataDir, name)).filter(
    (p) => fs.existsSync(p)
  );

  if (existingLegacyPaths.length > 0) {
    try {
      dbCtx.checkpointDatabase();
      vacuumSnapshotTo(dbCtx.db, path.join(archiveDir, 'howard.db'));
    } catch (archErr) {
      console.warn('Legacy archive warning (howard.db):', archErr.message || archErr);
    }
  }

  let legacyCadenceSettings = null;
  let legacyCadenceLogs = [];
  let legacyBloomSettings = null;
  let legacyBloomCareLogs = [];
  let legacyBloomMolts = [];
  let legacyBloomFeeders = [];
  let legacyFloodgateSettings = null;
  let legacyFloodgateLogs = [];

  for (const legacyFile of LEGACY_DB_FILES) {
    const legacyPath = path.join(dbCtx.dataDir, legacyFile);
    if (!fs.existsSync(legacyPath)) continue;
    let legacyDb = null;
    try {
      legacyDb = new DatabaseSync(legacyPath);
      try {
        legacyDb.exec('PRAGMA busy_timeout = 5000;');
        legacyDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch {
        // ignore checkpoint error on read
      }
      try {
        vacuumSnapshotTo(legacyDb, path.join(archiveDir, legacyFile));
      } catch {
        fs.mkdirSync(archiveDir, { recursive: true });
        fs.copyFileSync(legacyPath, path.join(archiveDir, legacyFile));
      }

      if (legacyFile === 'cadence.db') {
        legacyCadenceSettings = readLegacySingleKeySafely(legacyDb, 'household_settings', 'config');
        legacyCadenceLogs = readLegacyTableSafely(
          legacyDb,
          'SELECT date_key, data, updated_at FROM medication_logs'
        );
      } else if (legacyFile === 'bloom.db') {
        legacyBloomSettings = readLegacySingleKeySafely(legacyDb, 'bloom_settings', 'config');
        legacyBloomCareLogs = readLegacyTableSafely(
          legacyDb,
          'SELECT date_key, data, updated_at FROM care_logs'
        );
        legacyBloomMolts = readLegacyTableSafely(
          legacyDb,
          'SELECT id, date_key, data, updated_at FROM molt_logs'
        );
        legacyBloomFeeders = readLegacyTableSafely(
          legacyDb,
          'SELECT id, data, updated_at FROM feeder_cultures'
        );
      } else if (legacyFile === 'floodgate.db') {
        legacyFloodgateSettings = readLegacySingleKeySafely(legacyDb, 'app_settings', 'config');
        legacyFloodgateLogs = readLegacyTableSafely(
          legacyDb,
          'SELECT date_key, data, updated_at FROM daily_logs'
        );
      }
    } catch (err) {
      console.error(`Legacy DB read error (${legacyFile}):`, err);
      throw err;
    } finally {
      try {
        legacyDb?.close();
      } catch {
        // ignore close error
      }
    }
  }

  dbCtx.runInTransaction(() => {
    if (legacyCadenceSettings) {
      dbCtx.stmts.howardInsertIgnore.run(
        'cadence_settings',
        legacyCadenceSettings.data,
        legacyCadenceSettings.updated_at || nowIso
      );
    }
    for (const row of legacyCadenceLogs) {
      dbCtx.stmts.cadenceInsertIgnoreLog.run(row.date_key, row.data, row.updated_at || nowIso);
    }

    if (legacyBloomSettings) {
      dbCtx.stmts.howardInsertIgnore.run(
        'bloom_settings',
        legacyBloomSettings.data,
        legacyBloomSettings.updated_at || nowIso
      );
    }
    for (const row of legacyBloomCareLogs) {
      dbCtx.stmts.bloomInsertIgnoreLog.run(row.date_key, row.data, row.updated_at || nowIso);
    }
    for (const row of legacyBloomMolts) {
      dbCtx.stmts.bloomInsertIgnoreMolt.run(row.id, row.date_key, row.data, row.updated_at || nowIso);
    }
    for (const row of legacyBloomFeeders) {
      dbCtx.stmts.bloomInsertIgnoreFeeder.run(row.id, row.data, row.updated_at || nowIso);
    }

    if (legacyFloodgateSettings) {
      dbCtx.stmts.howardInsertIgnore.run(
        'floodgate_settings',
        legacyFloodgateSettings.data,
        legacyFloodgateSettings.updated_at || nowIso
      );
    }
    for (const row of legacyFloodgateLogs) {
      dbCtx.stmts.floodgateInsertIgnoreLog.run(row.date_key, row.data, row.updated_at || nowIso);
    }

    dbCtx.db.exec('DROP TABLE IF EXISTS notes;');
    const profilesRow = dbCtx.stmts.howardGet.get('profiles');
    if (profilesRow) {
      try {
        normalizeProfilesAppsList(dbCtx, JSON.parse(profilesRow.data), {
          ensureBloom: true,
          stripUnknown: true
        });
      } catch {
        // ignore malformed profile JSON
      }
    }
    dbCtx.db.exec('PRAGMA user_version = 3;');
  });

  for (const legacyFile of LEGACY_DB_FILES) {
    for (const suffix of ['', '-wal', '-shm']) {
      const target = path.join(dbCtx.dataDir, `${legacyFile}${suffix}`);
      try {
        if (fs.existsSync(target)) {
          fs.unlinkSync(target);
        }
      } catch (rmErr) {
        console.warn(`Legacy file cleanup warning (${legacyFile}${suffix}):`, rmErr.message || rmErr);
      }
    }
  }
}

function ensureDefaultSeeds(dbCtx) {
  const nowIso = new Date().toISOString();
  dbCtx.stmts.howardInsertIgnore.run('profiles', JSON.stringify(DEFAULT_PROFILES), nowIso);
  dbCtx.stmts.howardInsertIgnore.run('ledger_settings', JSON.stringify({ splitRule: '50-50' }), nowIso);
  dbCtx.stmts.howardInsertIgnore.run('beacon_info', JSON.stringify(DEFAULT_BEACON_INFO), nowIso);
  dbCtx.stmts.howardInsertIgnore.run(
    'cadence_settings',
    JSON.stringify(createDefaultCadenceSettings()),
    nowIso
  );
  dbCtx.stmts.howardInsertIgnore.run(
    'bloom_settings',
    JSON.stringify(createDefaultBloomSettings()),
    nowIso
  );
  dbCtx.stmts.howardInsertIgnore.run(
    'floodgate_settings',
    JSON.stringify(DEFAULT_FLOODGATE_SETTINGS),
    nowIso
  );
  dbCtx.stmts.howardInsertIgnore.run(
    'quill_settings',
    JSON.stringify(DEFAULT_QUILL_SETTINGS),
    nowIso
  );
}

function migrateV4BackfillStableProfileIds(dbCtx) {
  const nowIso = new Date().toISOString();
  dbCtx.runInTransaction(() => {
    const { data: parsedProfiles } = dbCtx.readHowardKey('profiles', DEFAULT_PROFILES);
    const profiles =
      Array.isArray(parsedProfiles) && parsedProfiles.length > 0 ? parsedProfiles : DEFAULT_PROFILES;
    const profilesById = buildProfilesByIdMap(profiles);

    for (const row of dbCtx.stmts.almanacGetAll.all()) {
      try {
        const parsed = JSON.parse(row.data);
        if (!isPlainObject(parsed)) continue;
        const enriched = enrichAlmanacEvent(
          { ...parsed, id: row.id, date: parsed.date || row.date_key },
          profiles,
          profilesById
        );
        if (enriched.assignedToProfileId !== parsed.assignedToProfileId) {
          dbCtx.stmts.almanacUpsert.run(
            row.id,
            enriched.date || row.date_key,
            JSON.stringify(enriched),
            row.updated_at || nowIso
          );
        }
      } catch {
        // skip malformed row
      }
    }

    const beaconRow = dbCtx.stmts.howardGet.get('beacon_info');
    if (beaconRow) {
      try {
        const normalizedBeacon = normalizeBeaconInfo(JSON.parse(beaconRow.data), {
          profilesList: profiles,
          profilesById
        });
        dbCtx.stmts.howardUpsert.run(
          'beacon_info',
          JSON.stringify(normalizedBeacon),
          beaconRow.updated_at || nowIso
        );
      } catch {
        // skip malformed JSON
      }
    }

    const cadSettingsRow = dbCtx.stmts.howardGet.get('cadence_settings');
    if (cadSettingsRow) {
      try {
        const normalized = normalizeCadenceSettings(
          JSON.parse(cadSettingsRow.data),
          null,
          profiles
        );
        dbCtx.stmts.howardUpsert.run(
          'cadence_settings',
          JSON.stringify({
            ...normalized,
            caregiverItems: buildCaregiverItems(normalized.caregivers, profiles)
          }),
          cadSettingsRow.updated_at || nowIso
        );
      } catch {
        // skip malformed JSON
      }
    }

    for (const row of dbCtx.stmts.cadenceGetAllLogs.all()) {
      try {
        const parsed = JSON.parse(row.data);
        if (!isPlainObject(parsed)) continue;
        const enriched = enrichCadenceRecord(parsed, profiles, profilesById);
        dbCtx.stmts.cadenceUpsertLog.run(
          row.date_key,
          JSON.stringify(enriched),
          row.updated_at || nowIso
        );
      } catch {
        // skip malformed row
      }
    }

    const blSettingsRow = dbCtx.stmts.howardGet.get('bloom_settings');
    if (blSettingsRow) {
      try {
        const normalized = normalizeBloomSettings(JSON.parse(blSettingsRow.data), null, profiles);
        dbCtx.stmts.howardUpsert.run(
          'bloom_settings',
          JSON.stringify({
            ...normalized,
            caregiverItems: buildCaregiverItems(normalized.caregivers, profiles)
          }),
          blSettingsRow.updated_at || nowIso
        );
      } catch {
        // skip malformed JSON
      }
    }

    for (const row of dbCtx.stmts.bloomGetAllLogs.all()) {
      try {
        const parsed = JSON.parse(row.data);
        if (!isPlainObject(parsed)) continue;
        const enriched = enrichBloomCareRecord(parsed, profiles, profilesById);
        dbCtx.stmts.bloomUpsertLog.run(
          row.date_key,
          JSON.stringify(enriched),
          row.updated_at || nowIso
        );
      } catch {
        // skip malformed row
      }
    }

    for (const row of dbCtx.stmts.bloomGetAllMolts.all()) {
      try {
        const parsed = JSON.parse(row.data);
        if (!isPlainObject(parsed)) continue;
        const enriched = enrichBloomMoltRecord(parsed, profiles, profilesById);
        dbCtx.stmts.bloomUpsertMolt.run(
          row.id,
          row.date_key,
          JSON.stringify(enriched),
          row.updated_at || nowIso
        );
      } catch {
        // skip malformed row
      }
    }

    const fgSettingsRow = dbCtx.stmts.howardGet.get('floodgate_settings');
    if (fgSettingsRow) {
      try {
        const parsed = JSON.parse(fgSettingsRow.data);
        if (isPlainObject(parsed)) {
          dbCtx.stmts.howardUpsert.run(
            'floodgate_settings',
            JSON.stringify({
              ...DEFAULT_FLOODGATE_SETTINGS,
              ...parsed,
              ownerProfileId: 'partner2'
            }),
            fgSettingsRow.updated_at || nowIso
          );
        }
      } catch {
        // skip malformed JSON
      }
    }

    dbCtx.db.exec('PRAGMA user_version = 4;');
  });
}

function migrateV5Hardening(dbCtx) {
  dbCtx.runInTransaction(() => {
    dbCtx.db.exec("DELETE FROM howard_store WHERE key IN ('almanac_events', 'ledger_data');");
    dbCtx.db.exec(`
      DROP INDEX IF EXISTS idx_cadence_logs_updated;
      DROP INDEX IF EXISTS idx_bloom_care_logs_updated;
      DROP INDEX IF EXISTS idx_floodgate_logs_updated;
    `);
    const tableSqlRow = dbCtx.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ledger_items'")
      .get();
    const hasCheck =
      typeof tableSqlRow?.sql === 'string' &&
      /CHECK\s*\(\s*kind\s+IN/i.test(tableSqlRow.sql) &&
      /json_valid/i.test(tableSqlRow.sql);
    if (!hasCheck) {
      dbCtx.db.exec(`
        CREATE TABLE ledger_items_v5 (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('expense', 'recurring', 'income')),
          data TEXT NOT NULL CHECK (json_valid(data)),
          updated_at TEXT NOT NULL
        );
        INSERT INTO ledger_items_v5 (id, kind, data, updated_at)
        SELECT
          id,
          CASE WHEN kind IN ('expense', 'recurring', 'income') THEN kind ELSE 'expense' END,
          data,
          updated_at
        FROM ledger_items
        WHERE json_valid(data);
        DROP TABLE ledger_items;
        ALTER TABLE ledger_items_v5 RENAME TO ledger_items;
        CREATE INDEX IF NOT EXISTS idx_ledger_items_kind_updated ON ledger_items (kind, updated_at DESC);
      `);
    }
    dbCtx.db.exec('PRAGMA user_version = 5;');
  });
}

function migrateV6QuillNotes(dbCtx) {
  dbCtx.runInTransaction(() => {
    const profilesRow = dbCtx.stmts.howardGet.get('profiles');
    if (profilesRow) {
      try {
        normalizeProfilesAppsList(dbCtx, JSON.parse(profilesRow.data), {
          ensureBloom: true,
          ensureQuill: true,
          stripUnknown: true
        });
      } catch {
        // ignore malformed JSON
      }
    }
    dbCtx.stmts.howardInsertIgnore.run(
      'quill_settings',
      JSON.stringify(DEFAULT_QUILL_SETTINGS),
      new Date().toISOString()
    );
    dbCtx.db.exec('PRAGMA user_version = 6;');
  });
}

export function runVersionedMigrations(dbCtx) {
  const initialVersion = getSchemaVersion(dbCtx.db);
  if (initialVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${initialVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}; refusing downgrade.`
    );
  }

  dbCtx.initLedgerStatements();

  if (getSchemaVersion(dbCtx.db) < 1) {
    dbCtx.runInTransaction(() => {
      migrateV1LegacyHowardBlobs(dbCtx);
      dbCtx.db.exec('PRAGMA user_version = 1;');
    });
  }
  if (getSchemaVersion(dbCtx.db) < 2) {
    dbCtx.runInTransaction(() => {
      const profilesRow = dbCtx.stmts.howardGet.get('profiles');
      if (profilesRow) {
        try {
          normalizeProfilesAppsList(dbCtx, JSON.parse(profilesRow.data), {
            ensureBloom: true,
            stripUnknown: false
          });
        } catch {
          // ignore malformed JSON
        }
      }
      dbCtx.db.exec('PRAGMA user_version = 2;');
    });
  }
  if (getSchemaVersion(dbCtx.db) < 3) {
    migrateV3ConsolidateLegacyDatabases(dbCtx);
  }
  ensureDefaultSeeds(dbCtx);
  if (getSchemaVersion(dbCtx.db) < 4) {
    migrateV4BackfillStableProfileIds(dbCtx);
  }
  if (getSchemaVersion(dbCtx.db) < 5) {
    migrateV5Hardening(dbCtx);
    dbCtx.initLedgerStatements();
  }
  if (getSchemaVersion(dbCtx.db) < 6) {
    migrateV6QuillNotes(dbCtx);
  }
}
