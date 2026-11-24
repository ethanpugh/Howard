import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT =
  process.env.PORT !== undefined && process.env.PORT !== '' ? Number(process.env.PORT) : 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DIST_DIR = path.join(__dirname, 'dist');

const HOWARD_DB_PATH = path.join(DATA_DIR, 'howard.db');
const LEGACY_DB_FILES = ['cadence.db', 'bloom.db', 'floodgate.db'];
const CURRENT_SCHEMA_VERSION = 5;
const VALID_LEDGER_KINDS = new Set(['expense', 'recurring', 'income']);
const VALID_LEDGER_OWNERS = new Set(['joint', 'partner1', 'partner2']);
const VALID_DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const createHttpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};
const VALID_APP_IDS = new Set([
  'foyer',
  'cadence',
  'bloom',
  'almanac',
  'floodgate',
  'ledger',
  'beacon'
]);

// Ensure persistent data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));

function runInTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors if transaction already aborted
    }
    throw err;
  }
}

function getSchemaVersion(dbInstance) {
  try {
    const row = dbInstance.prepare('PRAGMA user_version').get();
    return Number(row?.user_version || 0);
  } catch {
    return 0;
  }
}

const getLocalDateKey = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ============================================================================
// 1. INITIALIZE SINGLE UNIFIED SQLITE DATABASE (OPTION B + HYBRID SCHEMA)
// ============================================================================
const howardDb = new DatabaseSync(HOWARD_DB_PATH);
const requestedJournal = String(process.env.SQLITE_JOURNAL_MODE || 'WAL').toUpperCase();
let activeJournalMode = 'WAL';

howardDb.exec('PRAGMA busy_timeout = 5000;');
howardDb.exec('PRAGMA foreign_keys = ON;');
if (requestedJournal === 'TRUNCATE') {
  howardDb.exec('PRAGMA journal_mode = TRUNCATE;');
  howardDb.exec('PRAGMA synchronous = FULL;');
  activeJournalMode = 'TRUNCATE';
} else {
  try {
    howardDb.exec('PRAGMA journal_mode = WAL;');
    howardDb.exec('PRAGMA synchronous = NORMAL;');
    activeJournalMode = 'WAL';
  } catch {
    howardDb.exec('PRAGMA journal_mode = TRUNCATE;');
    howardDb.exec('PRAGMA synchronous = FULL;');
    activeJournalMode = 'TRUNCATE';
  }
}

function checkpointDatabase() {
  try {
    howardDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    // ignore checkpoint errors
  }
}

function vacuumSnapshotTo(dbInstance, destPath) {
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${destPath}.tmp`;
  try {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    const escapedTmp = tmpPath.replace(/'/g, "''");
    dbInstance.exec(`VACUUM INTO '${escapedTmp}'`);
    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup failure
    }
    throw err;
  }
}

function runDailyBackupSnapshots() {
  try {
    const backupsRoot = path.join(DATA_DIR, 'backups');
    const todayDir = path.join(backupsRoot, getLocalDateKey(new Date()));
    fs.mkdirSync(todayDir, { recursive: true });

    const finalPath = path.join(todayDir, 'howard.db');
    if (!fs.existsSync(finalPath)) {
      try {
        vacuumSnapshotTo(howardDb, finalPath);
      } catch (snapErr) {
        console.warn('Daily snapshot warning (howard.db):', snapErr.message || snapErr);
      }
    }

    const datedDirs = fs
      .readdirSync(backupsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
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

function createPreRestoreSnapshot() {
  const backupsRoot = path.join(DATA_DIR, 'backups');
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const dirName = `pre-restore-${stamp}`;
  const dirPath = path.join(backupsRoot, dirName);
  const filePath = path.join(dirPath, 'howard.db');
  checkpointDatabase();
  try {
    vacuumSnapshotTo(howardDb, filePath);
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

// ============================================================================
// 2. UNIFIED DATABASE SCHEMA & PREPARED STATEMENTS (DB-ARCH-3 HYBRID)
// ============================================================================
howardDb.exec(`
  CREATE TABLE IF NOT EXISTS howard_store (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL CHECK (json_valid(data)),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS almanac_events (
    id TEXT PRIMARY KEY,
    date_key TEXT NOT NULL,
    data TEXT NOT NULL CHECK (json_valid(data)),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ledger_items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('expense', 'recurring', 'income')),
    data TEXT NOT NULL CHECK (json_valid(data)),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cadence_logs (
    date_key TEXT PRIMARY KEY,
    data TEXT NOT NULL CHECK (json_valid(data)),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bloom_care_logs (
    date_key TEXT PRIMARY KEY,
    data TEXT NOT NULL CHECK (json_valid(data)),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bloom_molt_logs (
    id TEXT PRIMARY KEY,
    date_key TEXT NOT NULL,
    data TEXT NOT NULL CHECK (json_valid(data)),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bloom_feeder_cultures (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL CHECK (json_valid(data)),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS floodgate_logs (
    date_key TEXT PRIMARY KEY,
    data TEXT NOT NULL CHECK (json_valid(data)),
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_almanac_events_date_updated ON almanac_events (date_key ASC, updated_at ASC);
  CREATE INDEX IF NOT EXISTS idx_ledger_items_kind_updated ON ledger_items (kind, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bloom_molt_logs_date_updated ON bloom_molt_logs (date_key DESC, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bloom_feeder_cultures_updated ON bloom_feeder_cultures (updated_at DESC);
`);

const howardGetStmt = howardDb.prepare('SELECT data, updated_at FROM howard_store WHERE key = ?');
const howardUpsertStmt = howardDb.prepare(`
  INSERT INTO howard_store (key, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const howardInsertIgnoreStmt = howardDb.prepare(`
  INSERT OR IGNORE INTO howard_store (key, data, updated_at)
  VALUES (?, ?, ?)
`);

const almanacCountStmt = howardDb.prepare('SELECT COUNT(*) AS cnt FROM almanac_events');
const almanacGetAllStmt = howardDb.prepare(
  'SELECT id, date_key, data, updated_at FROM almanac_events ORDER BY date_key ASC, updated_at ASC'
);
const almanacUpsertStmt = howardDb.prepare(`
  INSERT INTO almanac_events (id, date_key, data, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    date_key = excluded.date_key,
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const almanacDeleteStmt = howardDb.prepare('DELETE FROM almanac_events WHERE id = ?');
const almanacClearAllStmt = howardDb.prepare('DELETE FROM almanac_events');

let ledgerCountStmt;
let ledgerGetAllStmt;
let ledgerUpsertStmt;
let ledgerDeleteStmt;
let ledgerClearAllStmt;

function initLedgerStatements() {
  ledgerCountStmt = howardDb.prepare('SELECT COUNT(*) AS cnt FROM ledger_items');
  ledgerGetAllStmt = howardDb.prepare(
    'SELECT id, kind, data, updated_at FROM ledger_items ORDER BY updated_at DESC'
  );
  ledgerUpsertStmt = howardDb.prepare(`
    INSERT INTO ledger_items (id, kind, data, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      data = excluded.data,
      updated_at = excluded.updated_at
  `);
  ledgerDeleteStmt = howardDb.prepare('DELETE FROM ledger_items WHERE id = ?');
  ledgerClearAllStmt = howardDb.prepare('DELETE FROM ledger_items');
}

initLedgerStatements();

const cadenceGetAllLogsStmt = howardDb.prepare('SELECT date_key, data, updated_at FROM cadence_logs');
const cadenceGetLogByDateStmt = howardDb.prepare('SELECT data FROM cadence_logs WHERE date_key = ?');
const cadenceUpsertLogStmt = howardDb.prepare(`
  INSERT INTO cadence_logs (date_key, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(date_key) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const cadenceInsertIgnoreLogStmt = howardDb.prepare(`
  INSERT OR IGNORE INTO cadence_logs (date_key, data, updated_at)
  VALUES (?, ?, ?)
`);
const cadenceClearLogsStmt = howardDb.prepare('DELETE FROM cadence_logs');

const bloomGetAllLogsStmt = howardDb.prepare('SELECT date_key, data, updated_at FROM bloom_care_logs');
const bloomGetLogByDateStmt = howardDb.prepare('SELECT data FROM bloom_care_logs WHERE date_key = ?');
const bloomUpsertLogStmt = howardDb.prepare(`
  INSERT INTO bloom_care_logs (date_key, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(date_key) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const bloomInsertIgnoreLogStmt = howardDb.prepare(`
  INSERT OR IGNORE INTO bloom_care_logs (date_key, data, updated_at)
  VALUES (?, ?, ?)
`);
const bloomClearLogsStmt = howardDb.prepare('DELETE FROM bloom_care_logs');

const bloomGetAllMoltsStmt = howardDb.prepare(
  'SELECT id, date_key, data, updated_at FROM bloom_molt_logs ORDER BY date_key DESC, updated_at DESC'
);
const bloomUpsertMoltStmt = howardDb.prepare(`
  INSERT INTO bloom_molt_logs (id, date_key, data, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    date_key = excluded.date_key,
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const bloomInsertIgnoreMoltStmt = howardDb.prepare(`
  INSERT OR IGNORE INTO bloom_molt_logs (id, date_key, data, updated_at)
  VALUES (?, ?, ?, ?)
`);
const bloomDeleteMoltStmt = howardDb.prepare('DELETE FROM bloom_molt_logs WHERE id = ?');
const bloomClearMoltsStmt = howardDb.prepare('DELETE FROM bloom_molt_logs');

const bloomGetAllFeedersStmt = howardDb.prepare(
  'SELECT id, data, updated_at FROM bloom_feeder_cultures ORDER BY updated_at DESC'
);
const bloomUpsertFeederStmt = howardDb.prepare(`
  INSERT INTO bloom_feeder_cultures (id, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const bloomInsertIgnoreFeederStmt = howardDb.prepare(`
  INSERT OR IGNORE INTO bloom_feeder_cultures (id, data, updated_at)
  VALUES (?, ?, ?)
`);
const bloomDeleteFeederStmt = howardDb.prepare('DELETE FROM bloom_feeder_cultures WHERE id = ?');
const bloomClearFeedersStmt = howardDb.prepare('DELETE FROM bloom_feeder_cultures');

const floodgateGetAllLogsStmt = howardDb.prepare('SELECT date_key, data, updated_at FROM floodgate_logs');
const floodgateGetLogByDateStmt = howardDb.prepare('SELECT data FROM floodgate_logs WHERE date_key = ?');
const floodgateUpsertLogStmt = howardDb.prepare(`
  INSERT INTO floodgate_logs (date_key, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(date_key) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const floodgateInsertIgnoreLogStmt = howardDb.prepare(`
  INSERT OR IGNORE INTO floodgate_logs (date_key, data, updated_at)
  VALUES (?, ?, ?)
`);
const floodgateDeleteLogStmt = howardDb.prepare('DELETE FROM floodgate_logs WHERE date_key = ?');
const floodgateClearLogsStmt = howardDb.prepare('DELETE FROM floodgate_logs');

// ============================================================================
// 3. DEFAULT FACTORIES & STABLE PROFILE-ID RESOLUTION HELPERS (DB-ARCH-2)
// ============================================================================
const DEFAULT_PROFILES = [
  {
    id: 'partner1',
    name: 'Partner 1',
    role: 'Household Member',
    color: 'teal',
    badgeEmoji: '⚡',
    pinEnabled: false,
    pin: '',
    allowedApps: ['foyer', 'cadence', 'bloom', 'almanac', 'ledger', 'beacon'],
    caregiverName: 'Partner 1'
  },
  {
    id: 'partner2',
    name: 'Partner 2',
    role: 'Household Member',
    color: 'rose',
    badgeEmoji: '🌸',
    pinEnabled: false,
    pin: '',
    allowedApps: ['foyer', 'cadence', 'bloom', 'almanac', 'floodgate', 'ledger', 'beacon'],
    caregiverName: 'Partner 2'
  },
  {
    id: 'caregiver',
    name: 'Caregiver',
    role: 'Pet Sitter / Guest',
    color: 'amber',
    badgeEmoji: '🐾',
    pinEnabled: false,
    pin: '',
    lockedOutOfPin: true,
    allowedApps: ['foyer', 'cadence', 'bloom', 'beacon'],
    caregiverName: 'Caregiver'
  }
];

function createDefaultCadenceSettings(dateObj = new Date()) {
  return {
    catName: 'Pet',
    medicationName: 'Oral Solution',
    dosageLabel: '2.5 mg / 0.5 ml',
    morningTargetTime: '08:00',
    eveningTargetTime: '20:00',
    bottleOpenedDate: getLocalDateKey(dateObj),
    bottleShelfLifeDays: 180,
    caregivers: ['Partner 1', 'Partner 2', 'Caregiver'],
    caregiverItems: [
      { profileId: 'partner1', name: 'Partner 1' },
      { profileId: 'partner2', name: 'Partner 2' },
      { profileId: 'caregiver', name: 'Caregiver' }
    ],
    administrationNote:
      'Give directly by mouth or with a small portion of wet food. Wipe syringe tip clean after each use.'
  };
}

const DEFAULT_FLOODGATE_SETTINGS = {
  ownerProfileId: 'partner2',
  ownerName: 'Partner 2',
  appName: 'Floodgate'
};

function createDefaultBloomSettings(dateObj = new Date()) {
  const todayKey = getLocalDateKey(dateObj);
  return {
    mantisName: 'Mantis',
    speciesPreset: 'spiny_flower',
    commonName: 'Spiny Flower Mantis',
    scientificName: 'Pseudocreobotra wahlbergii',
    sex: 'Unsexed',
    pronouns: 'they/them',
    currentInstar: 'L2',
    arrivalDate: todayKey,
    hatchDate: '',
    currentColorMorph: 'Spiky creamy-white & dark banded nymph',
    lifecycleStatus: 'normal', // 'normal' | 'premolt' | 'hardening'
    premoltStartedAt: null,
    hardeningUntil: null,
    hardeningHours: 36,
    livePreyInside: false,
    livePreyNote: '',
    dayTempMinC: 25,
    dayTempMaxC: 28,
    nightTempMinC: 20,
    humidityMinPct: 50,
    humidityMaxPct: 65,
    mistTargetHours: 24,
    typicalInterMoltDays: 14,
    enclosureInfo: {
      currentSizeLabel: 'Ventilated Nymph Cup / Mini Tall Enclosure',
      meshType: 'Soft nylon / fabric mesh (tarsal-safe)',
      substrate: 'Paper towel / coco fibre + climbing twigs & blossoms',
      lastDeepCleanDate: todayKey,
      currentBodyLengthMm: 10,
      enclosureHeightMm: 110,
      enclosureWidthMm: 75
    },
    caregivers: ['Partner 1', 'Partner 2', 'Caregiver'],
    caregiverItems: [
      { profileId: 'partner1', name: 'Partner 1' },
      { profileId: 'partner2', name: 'Partner 2' },
      { profileId: 'caregiver', name: 'Caregiver' }
    ],
    careNote:
      'Mist one enclosure wall lightly once daily for drinking droplets—never spray the mantis directly, and let the enclosure dry between mists (Spiny Flower Mantises need cross-ventilation!). Do NOT offer live prey during Premolt Watch or Post-Molt Hardening.'
  };
}

const DEFAULT_LEDGER_DATA = {
  splitRule: '50-50', // '50-50' | 'proportional'
  incomes: [],
  recurring: [],
  expenses: []
};

const DEFAULT_BEACON_INFO = {
  petCare: {
    summary: '',
    feedingGuide: '',
    carrierAndSupplies: '',
    quirksAndNotes: ''
  },
  vetInfo: {
    clinicName: '',
    phone: '',
    emergencyPhone: '',
    address: '',
    policyNumber: '',
    notes: ''
  },
  contacts: [
    { id: 'c-partner1', profileId: 'partner1', name: 'Partner 1', role: 'Household Member', phone: '', note: '' },
    { id: 'c-partner2', profileId: 'partner2', name: 'Partner 2', role: 'Household Member', phone: '', note: '' }
  ],
  houseGuide: {
    wifiName: '',
    wifiPassword: '',
    binDayInfo: '',
    utilitiesInfo: '',
    emergencyNotes: ''
  }
};

function readHowardKey(key, fallback) {
  const row = howardGetStmt.get(key);
  if (!row) return { data: fallback, updatedAt: new Date().toISOString() };
  try {
    return { data: JSON.parse(row.data), updatedAt: row.updated_at };
  } catch {
    return { data: fallback, updatedAt: row.updated_at };
  }
}

function writeHowardKey(key, value) {
  const nowIso = new Date().toISOString();
  howardUpsertStmt.run(key, JSON.stringify(value), nowIso);
  return nowIso;
}

function getProfilesList() {
  const row = howardGetStmt.get('profiles');
  if (!row) return DEFAULT_PROFILES;
  try {
    const parsed = JSON.parse(row.data);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_PROFILES;
  } catch {
    return DEFAULT_PROFILES;
  }
}

function getProfilesByIdMap(profilesList = getProfilesList()) {
  const map = {};
  for (const prof of profilesList || []) {
    if (prof && typeof prof.id === 'string') {
      map[prof.id] = prof;
    }
  }
  return map;
}

function inferProfileIdFromName(rawName, profilesList = getProfilesList()) {
  const lower = String(rawName || '').trim().toLowerCase();
  if (!lower || lower === 'both' || lower === 'pets' || lower === 'household') {
    return null;
  }
  for (const prof of profilesList || []) {
    if (!prof || typeof prof.id !== 'string') continue;
    const pName = String(prof.name || '').trim().toLowerCase();
    const pCaregiver = String(prof.caregiverName || '').trim().toLowerCase();
    if (lower === prof.id.toLowerCase() || (pName && lower === pName) || (pCaregiver && lower === pCaregiver)) {
      return prof.id;
    }
  }
  if (lower === 'partner 1' || lower === 'partner1') return 'partner1';
  if (lower === 'partner 2' || lower === 'partner2') return 'partner2';
  if (lower === 'caregiver') return 'caregiver';
  return null;
}

function resolveProfileDisplayName(profileId, fallbackName, profilesById = getProfilesByIdMap()) {
  if (profileId && profilesById[profileId]?.name) {
    return profilesById[profileId].name;
  }
  return fallbackName;
}

function buildCaregiverItems(rawCaregivers, profilesList = getProfilesList()) {
  const list = Array.isArray(rawCaregivers) ? rawCaregivers : ['Partner 1', 'Partner 2', 'Caregiver'];
  const items = [];
  const seenProfileIds = new Set();
  const seenCustom = new Set();
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const pid = inferProfileIdFromName(trimmed, profilesList);
    if (pid) {
      if (seenProfileIds.has(pid)) continue;
      seenProfileIds.add(pid);
      items.push({ profileId: pid, name: trimmed });
    } else {
      const key = trimmed.toLowerCase();
      if (seenCustom.has(key)) continue;
      seenCustom.add(key);
      items.push({ profileId: null, name: trimmed });
    }
  }
  return items.length > 0
    ? items
    : [
        { profileId: 'partner1', name: 'Partner 1' },
        { profileId: 'partner2', name: 'Partner 2' },
        { profileId: 'caregiver', name: 'Caregiver' }
      ];
}

function resolveCaregiverList(caregiverItems, rawCaregivers, profilesById = getProfilesByIdMap(), profilesList = getProfilesList()) {
  const items =
    Array.isArray(caregiverItems) && caregiverItems.length > 0
      ? caregiverItems
      : buildCaregiverItems(rawCaregivers, profilesList);
  const out = [];
  const seen = new Set();
  for (const item of items) {
    if (!isPlainObject(item)) continue;
    const resolved = resolveProfileDisplayName(item.profileId, item.name, profilesById);
    const cleaned = String(resolved || '').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function enrichAlmanacEvent(evt, profilesList = getProfilesList()) {
  if (!isPlainObject(evt)) return evt;
  const profilesById = getProfilesByIdMap(profilesList);
  const explicitId =
    typeof evt.assignedToProfileId === 'string' && profilesById[evt.assignedToProfileId]
      ? evt.assignedToProfileId
      : null;
  const inferredId = explicitId || inferProfileIdFromName(evt.assignedTo, profilesList);
  return {
    ...evt,
    assignedToProfileId: inferredId
  };
}

function resolveAlmanacEvent(parsed, profilesById = getProfilesByIdMap()) {
  if (!isPlainObject(parsed)) return parsed;
  if (!parsed.assignedToProfileId) return parsed;
  const resolvedName = resolveProfileDisplayName(
    parsed.assignedToProfileId,
    parsed.assignedTo,
    profilesById
  );
  return resolvedName === parsed.assignedTo ? parsed : { ...parsed, assignedTo: resolvedName };
}

function enrichDoseSlot(slot, profilesList = getProfilesList()) {
  if (!isPlainObject(slot)) return slot;
  const profilesById = getProfilesByIdMap(profilesList);
  const hasExplicitKey = Object.prototype.hasOwnProperty.call(slot, 'givenByProfileId');
  const explicitId =
    typeof slot.givenByProfileId === 'string' && profilesById[slot.givenByProfileId]
      ? slot.givenByProfileId
      : null;
  const resolvedId = hasExplicitKey
    ? explicitId || (slot.givenByProfileId === null ? null : inferProfileIdFromName(slot.givenBy, profilesList))
    : inferProfileIdFromName(slot.givenBy, profilesList);
  const next = { ...slot };
  delete next.recordedByUid;
  next.givenByProfileId = resolvedId || null;
  return next;
}

function enrichCadenceRecord(rec, profilesList = getProfilesList()) {
  if (!isPlainObject(rec)) return rec;
  const next = { ...rec };
  if (isPlainObject(next.morning)) next.morning = enrichDoseSlot(next.morning, profilesList);
  if (isPlainObject(next.evening)) next.evening = enrichDoseSlot(next.evening, profilesList);
  return next;
}

function resolveCadenceRecord(rec, profilesById = getProfilesByIdMap()) {
  if (!isPlainObject(rec)) return rec;
  const resolveSlot = (slot) => {
    if (!isPlainObject(slot) || !slot.givenByProfileId) return slot;
    const resolvedName = resolveProfileDisplayName(slot.givenByProfileId, slot.givenBy, profilesById);
    return resolvedName === slot.givenBy ? slot : { ...slot, givenBy: resolvedName };
  };
  return {
    ...rec,
    ...(rec.morning !== undefined ? { morning: resolveSlot(rec.morning) } : {}),
    ...(rec.evening !== undefined ? { evening: resolveSlot(rec.evening) } : {})
  };
}

function enrichBloomEntryList(arr, profilesList = getProfilesList()) {
  if (!Array.isArray(arr)) return [];
  const profilesById = getProfilesByIdMap(profilesList);
  return arr.map((item) => {
    if (!isPlainObject(item)) return item;
    const explicitId =
      typeof item.byProfileId === 'string' && profilesById[item.byProfileId] ? item.byProfileId : null;
    const inferredId = explicitId || inferProfileIdFromName(item.by, profilesList);
    return inferredId ? { ...item, byProfileId: inferredId } : { ...item };
  });
}

function enrichBloomCareRecord(rec, profilesList = getProfilesList()) {
  if (!isPlainObject(rec)) return rec;
  return {
    ...rec,
    ...(Array.isArray(rec.mists) ? { mists: enrichBloomEntryList(rec.mists, profilesList) } : {}),
    ...(Array.isArray(rec.feedings)
      ? { feedings: enrichBloomEntryList(rec.feedings, profilesList) }
      : {}),
    ...(Array.isArray(rec.climateChecks)
      ? { climateChecks: enrichBloomEntryList(rec.climateChecks, profilesList) }
      : {})
  };
}

function resolveBloomEntryList(arr, profilesById = getProfilesByIdMap()) {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => {
    if (!isPlainObject(item) || !item.byProfileId) return item;
    const resolvedName = resolveProfileDisplayName(item.byProfileId, item.by, profilesById);
    return resolvedName === item.by ? item : { ...item, by: resolvedName };
  });
}

function resolveBloomCareRecord(rec, profilesById = getProfilesByIdMap()) {
  if (!isPlainObject(rec)) return rec;
  return {
    ...rec,
    ...(Array.isArray(rec.mists) ? { mists: resolveBloomEntryList(rec.mists, profilesById) } : {}),
    ...(Array.isArray(rec.feedings)
      ? { feedings: resolveBloomEntryList(rec.feedings, profilesById) }
      : {}),
    ...(Array.isArray(rec.climateChecks)
      ? { climateChecks: resolveBloomEntryList(rec.climateChecks, profilesById) }
      : {})
  };
}

function enrichBloomMoltRecord(rec, profilesList = getProfilesList()) {
  if (!isPlainObject(rec)) return rec;
  const profilesById = getProfilesByIdMap(profilesList);
  const explicitId =
    typeof rec.loggedByProfileId === 'string' && profilesById[rec.loggedByProfileId]
      ? rec.loggedByProfileId
      : null;
  const inferredId = explicitId || inferProfileIdFromName(rec.loggedBy, profilesList);
  return inferredId ? { ...rec, loggedByProfileId: inferredId } : { ...rec };
}

function resolveBloomMoltRecord(rec, profilesById = getProfilesByIdMap()) {
  if (!isPlainObject(rec) || !rec.loggedByProfileId) return rec;
  const resolvedName = resolveProfileDisplayName(rec.loggedByProfileId, rec.loggedBy, profilesById);
  return resolvedName === rec.loggedBy ? rec : { ...rec, loggedBy: resolvedName };
}

function sanitizeProfilesForClient(profiles) {
  return (profiles || DEFAULT_PROFILES).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    color: p.color,
    badgeEmoji: p.badgeEmoji,
    pinEnabled: Boolean(p.pinEnabled && p.pin),
    lockedOutOfPin: Boolean(p.lockedOutOfPin || p.id === 'caregiver'),
    allowedApps: Array.isArray(p.allowedApps) ? p.allowedApps : ['foyer', 'cadence', 'bloom', 'beacon'],
    caregiverName: p.caregiverName || p.name
  }));
}

function normalizeLedgerData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_LEDGER_DATA };
  }
  return {
    splitRule: raw.splitRule === 'proportional' ? 'proportional' : '50-50',
    incomes: Array.isArray(raw.incomes) ? raw.incomes : DEFAULT_LEDGER_DATA.incomes,
    recurring: Array.isArray(raw.recurring) ? raw.recurring : DEFAULT_LEDGER_DATA.recurring,
    expenses: Array.isArray(raw.expenses) ? raw.expenses : DEFAULT_LEDGER_DATA.expenses
  };
}

function normalizeBeaconContacts(contacts, baseContacts = [], profilesList = getProfilesList()) {
  const profilesById = getProfilesByIdMap(profilesList);
  const baseById = new Map(
    (Array.isArray(baseContacts) ? baseContacts : [])
      .filter((b) => isPlainObject(b) && b.id)
      .map((b) => [b.id, b])
  );
  return (Array.isArray(contacts) ? contacts : []).map((c) => {
    if (!isPlainObject(c)) return c;
    const prev = c.id ? baseById.get(c.id) : null;
    const prevProfileId = prev?.profileId && profilesById[prev.profileId] ? prev.profileId : null;
    const hasExplicitPid = Object.prototype.hasOwnProperty.call(c, 'profileId');

    let nextProfileId = null;
    if (hasExplicitPid) {
      if (typeof c.profileId === 'string' && profilesById[c.profileId]) {
        nextProfileId = c.profileId;
      } else if (c.profileId === null) {
        nextProfileId = null;
      } else {
        nextProfileId = inferProfileIdFromName(c.name, profilesList);
      }
    } else {
      nextProfileId = prevProfileId || null;
      if (!nextProfileId && (c.id === 'c-partner1' || c.id === 'c-partner2')) {
        const targetId = c.id.slice(2);
        const inferred = inferProfileIdFromName(c.name, profilesList);
        if (!c.name || inferred === targetId) {
          nextProfileId = targetId;
        }
      } else if (!nextProfileId && c.name) {
        nextProfileId = inferProfileIdFromName(c.name, profilesList);
      }
    }

    return {
      ...c,
      profileId: nextProfileId || null
    };
  });
}

function normalizeBeaconInfo(raw = {}, { baseContacts = [], profilesList = getProfilesList() } = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const contacts = Array.isArray(src.contacts)
    ? normalizeBeaconContacts(src.contacts, baseContacts, profilesList)
    : DEFAULT_BEACON_INFO.contacts.map((c) => ({ ...c }));
  return {
    petCare: {
      ...DEFAULT_BEACON_INFO.petCare,
      ...(isPlainObject(src.petCare) ? src.petCare : {})
    },
    vetInfo: {
      ...DEFAULT_BEACON_INFO.vetInfo,
      ...(isPlainObject(src.vetInfo) ? src.vetInfo : {})
    },
    contacts,
    houseGuide: {
      ...DEFAULT_BEACON_INFO.houseGuide,
      ...(isPlainObject(src.houseGuide) ? src.houseGuide : {})
    }
  };
}

function mergeBeaconInfo(
  current,
  incoming,
  profilesList = getProfilesList(),
  { mergeContacts = false } = {}
) {
  const base = normalizeBeaconInfo(current, { profilesList });
  if (!isPlainObject(incoming)) return base;
  let nextContacts = base.contacts;
  if (Array.isArray(incoming.contacts)) {
    const normalizedIncoming = normalizeBeaconContacts(incoming.contacts, base.contacts, profilesList);
    if (mergeContacts) {
      const mergedMap = new Map();
      for (const c of base.contacts) {
        if (isPlainObject(c) && c.id) mergedMap.set(c.id, c);
      }
      for (const c of normalizedIncoming) {
        if (!isPlainObject(c)) continue;
        if (c.id) mergedMap.set(c.id, c);
        else mergedMap.set(`c-${Date.now()}-${mergedMap.size}`, c);
      }
      nextContacts = Array.from(mergedMap.values());
    } else {
      nextContacts = normalizedIncoming;
    }
  }
  return {
    petCare: {
      ...base.petCare,
      ...(isPlainObject(incoming.petCare) ? incoming.petCare : {})
    },
    vetInfo: {
      ...base.vetInfo,
      ...(isPlainObject(incoming.vetInfo) ? incoming.vetInfo : {})
    },
    contacts: nextContacts,
    houseGuide: {
      ...base.houseGuide,
      ...(isPlainObject(incoming.houseGuide) ? incoming.houseGuide : {})
    }
  };
}

function resolveBeaconInfo(raw, profilesById = getProfilesByIdMap()) {
  const normalized = normalizeBeaconInfo(raw);
  return {
    ...normalized,
    contacts: normalized.contacts.map((c) => {
      if (!isPlainObject(c) || !c.profileId) return c;
      const resolvedName = resolveProfileDisplayName(c.profileId, c.name, profilesById);
      return resolvedName === c.name ? c : { ...c, name: resolvedName };
    })
  };
}

function normalizeBloomSettings(parsed = {}, baseSettings = null, profilesList = getProfilesList()) {
  const defaults = createDefaultBloomSettings();
  const src = isPlainObject(parsed) ? parsed : {};
  const base = isPlainObject(baseSettings) ? baseSettings : defaults;
  const rawCaregivers = Array.isArray(src.caregivers)
    ? src.caregivers
    : Array.isArray(base.caregivers)
      ? base.caregivers
      : defaults.caregivers;
  const items = Array.isArray(src.caregiverItems) && src.caregiverItems.length > 0
    ? src.caregiverItems
    : Array.isArray(src.caregivers)
      ? buildCaregiverItems(src.caregivers, profilesList)
      : Array.isArray(base.caregiverItems) && base.caregiverItems.length > 0
        ? base.caregiverItems
        : buildCaregiverItems(rawCaregivers, profilesList);
  return {
    ...defaults,
    ...base,
    ...src,
    caregivers: rawCaregivers,
    caregiverItems: items,
    enclosureInfo: {
      ...defaults.enclosureInfo,
      ...(isPlainObject(base.enclosureInfo) ? base.enclosureInfo : {}),
      ...(isPlainObject(src.enclosureInfo) ? src.enclosureInfo : {})
    }
  };
}

function normalizeCadenceSettings(parsed = {}, baseSettings = null, profilesList = getProfilesList()) {
  const defaults = createDefaultCadenceSettings();
  const src = isPlainObject(parsed) ? parsed : {};
  const base = isPlainObject(baseSettings) ? baseSettings : defaults;
  const rawCaregivers = Array.isArray(src.caregivers)
    ? src.caregivers
    : Array.isArray(base.caregivers)
      ? base.caregivers
      : defaults.caregivers;
  const items = Array.isArray(src.caregiverItems) && src.caregiverItems.length > 0
    ? src.caregiverItems
    : Array.isArray(src.caregivers)
      ? buildCaregiverItems(src.caregivers, profilesList)
      : Array.isArray(base.caregiverItems) && base.caregiverItems.length > 0
        ? base.caregiverItems
        : buildCaregiverItems(rawCaregivers, profilesList);
  return {
    ...defaults,
    ...base,
    ...src,
    caregivers: rawCaregivers,
    caregiverItems: items
  };
}

// ============================================================================
// 4. VERSIONED PRAGMA user_version MIGRATIONS (DB-ARCH-1 & OPTION B MERGE)
// ============================================================================
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

function migrateV1LegacyHowardBlobs() {
  const nowIso = new Date().toISOString();
  const fallbackDate = getLocalDateKey(new Date());

  const existingEvtCount = Number(almanacCountStmt.get()?.cnt || 0);
  if (existingEvtCount === 0) {
    const legacyEventsObj = readHowardKey('almanac_events', []);
    if (Array.isArray(legacyEventsObj.data) && legacyEventsObj.data.length > 0) {
      legacyEventsObj.data.forEach((evt, idx) => {
        if (!isPlainObject(evt)) return;
        const id = String(evt.id || `evt-mig-${Date.now()}-${idx}`);
        const dateKey =
          typeof evt.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(evt.date)
            ? evt.date
            : fallbackDate;
        almanacUpsertStmt.run(
          id,
          dateKey,
          JSON.stringify({ ...evt, id, date: dateKey }),
          typeof evt.updatedAt === 'string' ? evt.updatedAt : legacyEventsObj.updatedAt || nowIso
        );
      });
    }
  }

  const legacyLedgerRow = howardGetStmt.get('ledger_data');
  if (legacyLedgerRow) {
    const legacyLedgerObj = readHowardKey('ledger_data', DEFAULT_LEDGER_DATA);
    const normalized = normalizeLedgerData(legacyLedgerObj.data);
    const existingLedgerCount = Number(ledgerCountStmt.get()?.cnt || 0);
    if (existingLedgerCount === 0) {
      howardUpsertStmt.run(
        'ledger_settings',
        JSON.stringify({ splitRule: normalized.splitRule }),
        legacyLedgerObj.updatedAt || nowIso
      );
      normalized.expenses.forEach((exp, idx) => {
        if (!isPlainObject(exp)) return;
        const id = String(exp.id || `exp-mig-${Date.now()}-${idx}`);
        ledgerUpsertStmt.run(
          id,
          'expense',
          JSON.stringify({ ...exp, id }),
          typeof exp.updatedAt === 'string' ? exp.updatedAt : legacyLedgerObj.updatedAt || nowIso
        );
      });
      normalized.recurring.forEach((rec, idx) => {
        if (!isPlainObject(rec)) return;
        const id = String(rec.id || `rec-mig-${Date.now()}-${idx}`);
        ledgerUpsertStmt.run(
          id,
          'recurring',
          JSON.stringify({ ...rec, id }),
          typeof rec.updatedAt === 'string' ? rec.updatedAt : legacyLedgerObj.updatedAt || nowIso
        );
      });
      normalized.incomes.forEach((inc, idx) => {
        if (!isPlainObject(inc)) return;
        const id = String(inc.id || `inc-mig-${Date.now()}-${idx}`);
        ledgerUpsertStmt.run(
          id,
          'income',
          JSON.stringify({ ...inc, id }),
          typeof inc.updatedAt === 'string' ? inc.updatedAt : legacyLedgerObj.updatedAt || nowIso
        );
      });
    }
  }
}

function normalizeProfilesAppsList(profiles, { ensureBloom = true, stripUnknown = false } = {}) {
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
      if (cadenceIdx !== -1) {
        apps.splice(cadenceIdx + 1, 0, 'bloom');
      } else {
        apps.push('bloom');
      }
    }
    return { ...prof, allowedApps: apps };
  });
  if (changed) {
    howardUpsertStmt.run('profiles', JSON.stringify(next), nowIso);
  }
  return changed;
}

function migrateV3ConsolidateLegacyDatabases() {
  const nowIso = new Date().toISOString();
  const archiveStamp = nowIso.replace(/[:.]/g, '-');
  const archiveDir = path.join(DATA_DIR, 'backups', `legacy-4db-${archiveStamp}`);
  const existingLegacyPaths = LEGACY_DB_FILES.map((name) => path.join(DATA_DIR, name)).filter((p) =>
    fs.existsSync(p)
  );

  // Archive checkpointed legacy files before touching anything
  if (existingLegacyPaths.length > 0) {
    try {
      checkpointDatabase();
      vacuumSnapshotTo(howardDb, path.join(archiveDir, 'howard.db'));
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
    const legacyPath = path.join(DATA_DIR, legacyFile);
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

  runInTransaction(howardDb, () => {
    if (legacyCadenceSettings) {
      howardInsertIgnoreStmt.run(
        'cadence_settings',
        legacyCadenceSettings.data,
        legacyCadenceSettings.updated_at || nowIso
      );
    }
    for (const row of legacyCadenceLogs) {
      cadenceInsertIgnoreLogStmt.run(row.date_key, row.data, row.updated_at || nowIso);
    }

    if (legacyBloomSettings) {
      howardInsertIgnoreStmt.run(
        'bloom_settings',
        legacyBloomSettings.data,
        legacyBloomSettings.updated_at || nowIso
      );
    }
    for (const row of legacyBloomCareLogs) {
      bloomInsertIgnoreLogStmt.run(row.date_key, row.data, row.updated_at || nowIso);
    }
    for (const row of legacyBloomMolts) {
      bloomInsertIgnoreMoltStmt.run(row.id, row.date_key, row.data, row.updated_at || nowIso);
    }
    for (const row of legacyBloomFeeders) {
      bloomInsertIgnoreFeederStmt.run(row.id, row.data, row.updated_at || nowIso);
    }

    if (legacyFloodgateSettings) {
      howardInsertIgnoreStmt.run(
        'floodgate_settings',
        legacyFloodgateSettings.data,
        legacyFloodgateSettings.updated_at || nowIso
      );
    }
    for (const row of legacyFloodgateLogs) {
      floodgateInsertIgnoreLogStmt.run(row.date_key, row.data, row.updated_at || nowIso);
    }

    // Remove orphaned experimental Jot notes table and strip 'jot' from saved profiles
    howardDb.exec('DROP TABLE IF EXISTS notes;');
    const profilesRow = howardGetStmt.get('profiles');
    if (profilesRow) {
      try {
        const parsedProfiles = JSON.parse(profilesRow.data);
        normalizeProfilesAppsList(parsedProfiles, { ensureBloom: true, stripUnknown: true });
      } catch {
        // ignore malformed profile JSON
      }
    }
    howardDb.exec('PRAGMA user_version = 3;');
  });

  // Delete migrated standalone legacy .db + sidecar files from DATA_DIR
  for (const legacyFile of LEGACY_DB_FILES) {
    for (const suffix of ['', '-wal', '-shm']) {
      const target = path.join(DATA_DIR, `${legacyFile}${suffix}`);
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

function ensureDefaultSeeds() {
  const nowIso = new Date().toISOString();
  howardInsertIgnoreStmt.run('profiles', JSON.stringify(DEFAULT_PROFILES), nowIso);
  howardInsertIgnoreStmt.run('ledger_settings', JSON.stringify({ splitRule: '50-50' }), nowIso);
  howardInsertIgnoreStmt.run('beacon_info', JSON.stringify(DEFAULT_BEACON_INFO), nowIso);
  howardInsertIgnoreStmt.run(
    'cadence_settings',
    JSON.stringify(createDefaultCadenceSettings()),
    nowIso
  );
  howardInsertIgnoreStmt.run('bloom_settings', JSON.stringify(createDefaultBloomSettings()), nowIso);
  howardInsertIgnoreStmt.run(
    'floodgate_settings',
    JSON.stringify(DEFAULT_FLOODGATE_SETTINGS),
    nowIso
  );
}

function migrateV4BackfillStableProfileIds() {
  const nowIso = new Date().toISOString();
  runInTransaction(howardDb, () => {
    const profiles = getProfilesList();

    // 1. Almanac events
    for (const row of almanacGetAllStmt.all()) {
      try {
        const parsed = JSON.parse(row.data);
        if (!isPlainObject(parsed)) continue;
        const enriched = enrichAlmanacEvent({ ...parsed, id: row.id, date: parsed.date || row.date_key }, profiles);
        if (enriched.assignedToProfileId !== parsed.assignedToProfileId) {
          almanacUpsertStmt.run(
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

    // 2. Beacon partner contacts
    const beaconRow = howardGetStmt.get('beacon_info');
    if (beaconRow) {
      try {
        const parsedBeacon = JSON.parse(beaconRow.data);
        const normalizedBeacon = normalizeBeaconInfo(parsedBeacon, { profilesList: profiles });
        howardUpsertStmt.run(
          'beacon_info',
          JSON.stringify(normalizedBeacon),
          beaconRow.updated_at || nowIso
        );
      } catch {
        // skip malformed JSON
      }
    }

    // 3. Cadence settings & logs
    const cadSettingsRow = howardGetStmt.get('cadence_settings');
    if (cadSettingsRow) {
      try {
        const parsed = JSON.parse(cadSettingsRow.data);
        const normalized = normalizeCadenceSettings(parsed);
        howardUpsertStmt.run(
          'cadence_settings',
          JSON.stringify({ ...normalized, caregiverItems: buildCaregiverItems(normalized.caregivers, profiles) }),
          cadSettingsRow.updated_at || nowIso
        );
      } catch {
        // skip malformed JSON
      }
    }
    for (const row of cadenceGetAllLogsStmt.all()) {
      try {
        const parsed = JSON.parse(row.data);
        if (!isPlainObject(parsed)) continue;
        const enriched = enrichCadenceRecord(parsed, profiles);
        cadenceUpsertLogStmt.run(row.date_key, JSON.stringify(enriched), row.updated_at || nowIso);
      } catch {
        // skip malformed row
      }
    }

    // 4. Bloom settings, care logs & molt logs
    const blSettingsRow = howardGetStmt.get('bloom_settings');
    if (blSettingsRow) {
      try {
        const parsed = JSON.parse(blSettingsRow.data);
        const normalized = normalizeBloomSettings(parsed);
        howardUpsertStmt.run(
          'bloom_settings',
          JSON.stringify({ ...normalized, caregiverItems: buildCaregiverItems(normalized.caregivers, profiles) }),
          blSettingsRow.updated_at || nowIso
        );
      } catch {
        // skip malformed JSON
      }
    }
    for (const row of bloomGetAllLogsStmt.all()) {
      try {
        const parsed = JSON.parse(row.data);
        if (!isPlainObject(parsed)) continue;
        const enriched = enrichBloomCareRecord(parsed, profiles);
        bloomUpsertLogStmt.run(row.date_key, JSON.stringify(enriched), row.updated_at || nowIso);
      } catch {
        // skip malformed row
      }
    }
    for (const row of bloomGetAllMoltsStmt.all()) {
      try {
        const parsed = JSON.parse(row.data);
        if (!isPlainObject(parsed)) continue;
        const enriched = enrichBloomMoltRecord(parsed, profiles);
        bloomUpsertMoltStmt.run(
          row.id,
          row.date_key,
          JSON.stringify(enriched),
          row.updated_at || nowIso
        );
      } catch {
        // skip malformed row
      }
    }

    // 5. Floodgate settings
    const fgSettingsRow = howardGetStmt.get('floodgate_settings');
    if (fgSettingsRow) {
      try {
        const parsed = JSON.parse(fgSettingsRow.data);
        if (isPlainObject(parsed)) {
          howardUpsertStmt.run(
            'floodgate_settings',
            JSON.stringify({ ...DEFAULT_FLOODGATE_SETTINGS, ...parsed, ownerProfileId: 'partner2' }),
            fgSettingsRow.updated_at || nowIso
          );
        }
      } catch {
        // skip malformed JSON
      }
    }

    howardDb.exec('PRAGMA user_version = 4;');
  });
}

function migrateV5Hardening() {
  runInTransaction(howardDb, () => {
    howardDb.exec("DELETE FROM howard_store WHERE key IN ('almanac_events', 'ledger_data');");
    howardDb.exec(`
      DROP INDEX IF EXISTS idx_cadence_logs_updated;
      DROP INDEX IF EXISTS idx_bloom_care_logs_updated;
      DROP INDEX IF EXISTS idx_floodgate_logs_updated;
    `);
    const tableSqlRow = howardDb
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ledger_items'")
      .get();
    const hasCheck =
      typeof tableSqlRow?.sql === 'string' &&
      /CHECK\s*\(\s*kind\s+IN/i.test(tableSqlRow.sql) &&
      /json_valid/i.test(tableSqlRow.sql);
    if (!hasCheck) {
      howardDb.exec(`
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
    howardDb.exec('PRAGMA user_version = 5;');
  });
}

function runVersionedMigrations() {
  const initialVersion = getSchemaVersion(howardDb);
  if (initialVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${initialVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}; refusing downgrade.`
    );
  }
  if (getSchemaVersion(howardDb) < 1) {
    runInTransaction(howardDb, () => {
      migrateV1LegacyHowardBlobs();
      howardDb.exec('PRAGMA user_version = 1;');
    });
  }
  if (getSchemaVersion(howardDb) < 2) {
    runInTransaction(howardDb, () => {
      const profilesRow = howardGetStmt.get('profiles');
      if (profilesRow) {
        try {
          normalizeProfilesAppsList(JSON.parse(profilesRow.data), {
            ensureBloom: true,
            stripUnknown: false
          });
        } catch {
          // ignore malformed JSON
        }
      }
      howardDb.exec('PRAGMA user_version = 2;');
    });
  }
  if (getSchemaVersion(howardDb) < 3) {
    migrateV3ConsolidateLegacyDatabases();
  }
  ensureDefaultSeeds();
  if (getSchemaVersion(howardDb) < 4) {
    migrateV4BackfillStableProfileIds();
  }
  if (getSchemaVersion(howardDb) < 5) {
    migrateV5Hardening();
  }
}

runVersionedMigrations();
initLedgerStatements();
setInterval(runDailyBackupSnapshots, 6 * 3600 * 1000).unref?.();

// ============================================================================
// 5. UNIFIED DOMAIN READERS & PROJECTION HELPERS
// ============================================================================
function readAlmanacEventsFromTable() {
  const profilesById = getProfilesByIdMap();
  const rows = almanacGetAllStmt.all();
  const events = [];
  let updatedAt = '';
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.data);
      const base = { ...parsed, id: row.id, date: parsed.date || row.date_key };
      events.push(resolveAlmanacEvent(base, profilesById));
      if (row.updated_at > updatedAt) updatedAt = row.updated_at;
    } catch {
      // skip malformed row
    }
  }
  return { events, updatedAt };
}

function writeAlmanacEventsInTx(events, { nowIso, clearExisting = true, profilesList } = {}) {
  const fallbackDate = getLocalDateKey(new Date());
  if (clearExisting) {
    almanacClearAllStmt.run();
  }
  (Array.isArray(events) ? events : []).forEach((evt, idx) => {
    if (!isPlainObject(evt)) return;
    const id = String(evt.id || `evt-${Date.now()}-${idx}`);
    const dateKey =
      typeof evt.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(evt.date) ? evt.date : fallbackDate;
    const updatedAt = typeof evt.updatedAt === 'string' ? evt.updatedAt : nowIso;
    const record = enrichAlmanacEvent({ ...evt, id, date: dateKey }, profilesList);
    almanacUpsertStmt.run(id, dateKey, JSON.stringify(record), updatedAt);
  });
}

function replaceAllAlmanacEventsInTable(
  events,
  nowIso = new Date().toISOString(),
  { clearExisting = true } = {}
) {
  const profilesList = getProfilesList();
  runInTransaction(howardDb, () => {
    writeAlmanacEventsInTx(events, { nowIso, clearExisting, profilesList });
  });
  return nowIso;
}

function readLedgerDataFromTable() {
  const settingsObj = readHowardKey('ledger_settings', { splitRule: '50-50' });
  const splitRule = settingsObj.data?.splitRule === 'proportional' ? 'proportional' : '50-50';
  const rows = ledgerGetAllStmt.all();

  const expenses = [];
  const recurring = [];
  const incomes = [];
  let latestItemUpdate = settingsObj.updatedAt || '';

  for (const row of rows) {
    try {
      const parsed = { ...JSON.parse(row.data), id: row.id };
      if (row.kind === 'expense') expenses.push(parsed);
      else if (row.kind === 'recurring') recurring.push(parsed);
      else if (row.kind === 'income') incomes.push(parsed);
      if (row.updated_at > latestItemUpdate) latestItemUpdate = row.updated_at;
    } catch {
      // skip malformed row
    }
  }

  expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  recurring.sort(
    (a, b) => (a.title || '').localeCompare(b.title || '') || (a.id || '').localeCompare(b.id || '')
  );

  return {
    ledgerData: {
      splitRule,
      incomes,
      recurring,
      expenses
    },
    updatedAt: latestItemUpdate
  };
}

function writeLedgerDataInTx(rawLedger, { nowIso, clearExisting = true } = {}) {
  const normalized = normalizeLedgerData(rawLedger);
  const hasExplicitSplitRule =
    isPlainObject(rawLedger) &&
    (rawLedger.splitRule === '50-50' || rawLedger.splitRule === 'proportional');
  if (clearExisting || hasExplicitSplitRule) {
    howardUpsertStmt.run(
      'ledger_settings',
      JSON.stringify({ splitRule: normalized.splitRule }),
      nowIso
    );
  }
  if (clearExisting) {
    ledgerClearAllStmt.run();
  }
  normalized.expenses.forEach((exp, idx) => {
    if (!isPlainObject(exp)) return;
    const id = String(exp.id || `exp-${Date.now()}-${idx}`);
    const updatedAt = typeof exp.updatedAt === 'string' ? exp.updatedAt : nowIso;
    ledgerUpsertStmt.run(id, 'expense', JSON.stringify({ ...exp, id }), updatedAt);
  });
  normalized.recurring.forEach((rec, idx) => {
    if (!isPlainObject(rec)) return;
    const id = String(rec.id || `rec-${Date.now()}-${idx}`);
    const updatedAt = typeof rec.updatedAt === 'string' ? rec.updatedAt : nowIso;
    ledgerUpsertStmt.run(id, 'recurring', JSON.stringify({ ...rec, id }), updatedAt);
  });
  normalized.incomes.forEach((inc, idx) => {
    if (!isPlainObject(inc)) return;
    const id = String(inc.id || `inc-${Date.now()}-${idx}`);
    const updatedAt = typeof inc.updatedAt === 'string' ? inc.updatedAt : nowIso;
    ledgerUpsertStmt.run(id, 'income', JSON.stringify({ ...inc, id }), updatedAt);
  });
  return normalized;
}

function replaceAllLedgerDataInTable(
  rawLedger,
  nowIso = new Date().toISOString(),
  { clearExisting = true } = {}
) {
  let normalized;
  runInTransaction(howardDb, () => {
    normalized = writeLedgerDataInTx(rawLedger, { nowIso, clearExisting });
  });
  return { ledgerData: normalized, updatedAt: nowIso };
}

function readCadenceSettings({ includeInternal = false } = {}) {
  const profilesList = getProfilesList();
  const profilesById = getProfilesByIdMap(profilesList);
  const defaults = createDefaultCadenceSettings();
  const row = howardGetStmt.get('cadence_settings');
  if (!row) {
    const resolved = {
      ...defaults,
      caregivers: resolveCaregiverList(defaults.caregiverItems, defaults.caregivers, profilesById, profilesList)
    };
    if (!includeInternal) delete resolved.caregiverItems;
    return { settings: resolved, updatedAt: new Date().toISOString() };
  }
  try {
    const parsed = normalizeCadenceSettings(JSON.parse(row.data));
    const resolved = {
      ...parsed,
      caregivers: resolveCaregiverList(parsed.caregiverItems, parsed.caregivers, profilesById, profilesList)
    };
    if (!includeInternal) delete resolved.caregiverItems;
    return { settings: resolved, updatedAt: row.updated_at };
  } catch {
    const resolved = {
      ...defaults,
      caregivers: resolveCaregiverList(defaults.caregiverItems, defaults.caregivers, profilesById, profilesList)
    };
    if (!includeInternal) delete resolved.caregiverItems;
    return { settings: resolved, updatedAt: row.updated_at };
  }
}

function readCadenceLogs() {
  const profilesById = getProfilesByIdMap();
  const rows = cadenceGetAllLogsStmt.all();
  const logsByDate = {};
  let latestLogUpdate = '';
  for (const row of rows) {
    try {
      logsByDate[row.date_key] = resolveCadenceRecord(JSON.parse(row.data), profilesById);
      if (row.updated_at > latestLogUpdate) latestLogUpdate = row.updated_at;
    } catch {
      // skip malformed row
    }
  }
  return { logsByDate, latestLogUpdate };
}

function resolveBloomSettingsPayload(parsed, profilesById, profilesList, includeInternal) {
  const resolved = {
    ...parsed,
    caregivers: resolveCaregiverList(parsed.caregiverItems, parsed.caregivers, profilesById, profilesList)
  };
  if (resolved.livePreyInside && resolved.livePreyByProfileId) {
    const byName = resolveProfileDisplayName(resolved.livePreyByProfileId, '', profilesById);
    if (byName) {
      resolved.livePreyNote = resolved.livePreyAt
        ? `offered at ${resolved.livePreyAt} by ${byName}`
        : `offered by ${byName}`;
    }
  }
  if (!includeInternal) delete resolved.caregiverItems;
  return resolved;
}

function readBloomSettings({ includeInternal = false } = {}) {
  const profilesList = getProfilesList();
  const profilesById = getProfilesByIdMap(profilesList);
  const row = howardGetStmt.get('bloom_settings');
  if (!row) {
    const defaults = normalizeBloomSettings({}, null, profilesList);
    return {
      settings: resolveBloomSettingsPayload(defaults, profilesById, profilesList, includeInternal),
      updatedAt: new Date().toISOString()
    };
  }
  try {
    const parsed = normalizeBloomSettings(JSON.parse(row.data), null, profilesList);
    return {
      settings: resolveBloomSettingsPayload(parsed, profilesById, profilesList, includeInternal),
      updatedAt: row.updated_at
    };
  } catch {
    const defaults = normalizeBloomSettings({}, null, profilesList);
    return {
      settings: resolveBloomSettingsPayload(defaults, profilesById, profilesList, includeInternal),
      updatedAt: row.updated_at
    };
  }
}

function readBloomLogs() {
  const profilesById = getProfilesByIdMap();
  const rows = bloomGetAllLogsStmt.all();
  const logsByDate = {};
  let latestLogUpdate = '';
  for (const row of rows) {
    try {
      logsByDate[row.date_key] = resolveBloomCareRecord(JSON.parse(row.data), profilesById);
      if (row.updated_at > latestLogUpdate) latestLogUpdate = row.updated_at;
    } catch {
      // skip malformed row
    }
  }
  return { logsByDate, latestLogUpdate };
}

function readBloomMolts() {
  const profilesById = getProfilesByIdMap();
  const rows = bloomGetAllMoltsStmt.all();
  const molts = [];
  let latestMoltUpdate = '';
  for (const row of rows) {
    try {
      const parsed = { id: row.id, dateKey: row.date_key, ...JSON.parse(row.data) };
      molts.push(resolveBloomMoltRecord(parsed, profilesById));
      if (row.updated_at > latestMoltUpdate) latestMoltUpdate = row.updated_at;
    } catch {
      // skip malformed row
    }
  }
  return { molts, latestMoltUpdate };
}

function readBloomFeeders() {
  const rows = bloomGetAllFeedersStmt.all();
  const feeders = [];
  let latestFeederUpdate = '';
  for (const row of rows) {
    try {
      feeders.push({ id: row.id, ...JSON.parse(row.data) });
      if (row.updated_at > latestFeederUpdate) latestFeederUpdate = row.updated_at;
    } catch {
      // skip malformed row
    }
  }
  return { feeders, latestFeederUpdate };
}

function readBloomState() {
  const { settings, updatedAt: sUpd } = readBloomSettings();
  const { logsByDate, latestLogUpdate: lUpd } = readBloomLogs();
  const { molts, latestMoltUpdate: mUpd } = readBloomMolts();
  const { feeders, latestFeederUpdate: fUpd } = readBloomFeeders();
  const updatedAt = [sUpd, lUpd, mUpd, fUpd].filter(Boolean).sort().pop() || new Date().toISOString();
  return { settings, logsByDate, molts, feeders, updatedAt };
}

function readFloodgateSettings() {
  const profilesById = getProfilesByIdMap();
  const row = howardGetStmt.get('floodgate_settings');
  if (!row) {
    const resolved = {
      ...DEFAULT_FLOODGATE_SETTINGS,
      ownerName: resolveProfileDisplayName('partner2', DEFAULT_FLOODGATE_SETTINGS.ownerName, profilesById)
    };
    return { settings: resolved, updatedAt: new Date().toISOString() };
  }
  try {
    const parsed = JSON.parse(row.data);
    const merged = { ...DEFAULT_FLOODGATE_SETTINGS, ...parsed };
    const ownerProfileId = merged.ownerProfileId || 'partner2';
    return {
      settings: {
        ...merged,
        ownerProfileId,
        ownerName: resolveProfileDisplayName(ownerProfileId, merged.ownerName, profilesById)
      },
      updatedAt: row.updated_at
    };
  } catch {
    return {
      settings: {
        ...DEFAULT_FLOODGATE_SETTINGS,
        ownerName: resolveProfileDisplayName('partner2', DEFAULT_FLOODGATE_SETTINGS.ownerName, profilesById)
      },
      updatedAt: row.updated_at
    };
  }
}

function readFloodgateLogs() {
  const rows = floodgateGetAllLogsStmt.all();
  const logsByDate = {};
  let latestLogUpdate = '';
  for (const row of rows) {
    try {
      logsByDate[row.date_key] = JSON.parse(row.data);
      if (row.updated_at > latestLogUpdate) latestLogUpdate = row.updated_at;
    } catch {
      // skip malformed row
    }
  }
  return { logsByDate, latestLogUpdate };
}

// ============================================================================
// 6. IN-MEMORY DOMAIN CACHE, PER-DOMAIN REVISION TOKENS & SSE PUSH HUB
// ============================================================================
const SERVER_BOOT_ID = Date.now().toString(36);
const domainRevisions = {
  howard: 1,
  cadence: 1,
  bloom: 1,
  floodgate: 1
};
let cacheHowardProfiles = null;
let cacheHowardAlmanac = null;
let cacheHowardLedger = null;
let cacheHowardBeacon = null;
let cacheHowardCombined = null;
let cacheCadence = null;
let cacheBloom = null;
let cacheFloodgate = null;

const sseClients = new Set();

function getCachedHowardProfiles() {
  if (!cacheHowardProfiles) {
    const profilesObj = readHowardKey('profiles', DEFAULT_PROFILES);
    cacheHowardProfiles = {
      profiles: sanitizeProfilesForClient(profilesObj.data),
      updatedAt: profilesObj.updatedAt
    };
  }
  return cacheHowardProfiles;
}

function getCachedHowardAlmanac() {
  if (!cacheHowardAlmanac) {
    const eventsObj = readAlmanacEventsFromTable();
    cacheHowardAlmanac = {
      almanacEvents: eventsObj.events,
      updatedAt: eventsObj.updatedAt
    };
  }
  return cacheHowardAlmanac;
}

function getCachedHowardLedger() {
  if (!cacheHowardLedger) {
    cacheHowardLedger = readLedgerDataFromTable();
  }
  return cacheHowardLedger;
}

function getCachedHowardBeacon() {
  if (!cacheHowardBeacon) {
    const beaconObj = readHowardKey('beacon_info', DEFAULT_BEACON_INFO);
    cacheHowardBeacon = {
      beaconInfo: resolveBeaconInfo(beaconObj.data),
      updatedAt: beaconObj.updatedAt
    };
  }
  return cacheHowardBeacon;
}

function getCachedHowardState() {
  if (!cacheHowardCombined) {
    const p = getCachedHowardProfiles();
    const a = getCachedHowardAlmanac();
    const l = getCachedHowardLedger();
    const b = getCachedHowardBeacon();
    const latest =
      [p.updatedAt, a.updatedAt, l.updatedAt, b.updatedAt].filter(Boolean).sort().pop() ||
      new Date().toISOString();
    cacheHowardCombined = {
      profiles: p.profiles,
      almanacEvents: a.almanacEvents,
      ledgerData: l.ledgerData,
      beaconInfo: b.beaconInfo,
      updatedAt: latest
    };
  }
  return cacheHowardCombined;
}

function isPartner2PrivateAlmanacEvent(evt, profilesList = getProfilesList()) {
  if (!isPlainObject(evt)) return false;
  const isPrivateMed = Boolean(evt.linkToGpReport || evt.category === 'medical');
  if (!isPrivateMed) return false;
  if (evt.assignedToProfileId === 'partner2') return true;
  if (evt.assignedToProfileId) return false;
  return inferProfileIdFromName(evt.assignedTo, profilesList) === 'partner2';
}

function projectHowardStateForProfile(howardState, activeProfile) {
  if (!howardState) return howardState;
  const safeProfile = activeProfile || 'caregiver';
  if (safeProfile === 'caregiver') {
    return {
      ...howardState,
      almanacEvents: [],
      ledgerData: {
        splitRule: '50-50',
        incomes: [],
        recurring: [],
        expenses: []
      }
    };
  }
  if (safeProfile === 'partner1') {
    const profilesList = getProfilesList();
    return {
      ...howardState,
      almanacEvents: (howardState.almanacEvents || []).filter(
        (evt) => !isPartner2PrivateAlmanacEvent(evt, profilesList)
      )
    };
  }
  return howardState;
}

function getSyncTokenForProfile(profileId) {
  const safeProfile = profileId || 'caregiver';
  const fgRev = safeProfile === 'partner2' ? domainRevisions.floodgate : 0;
  return `${SERVER_BOOT_ID}:${safeProfile}:${domainRevisions.howard}.${domainRevisions.cadence}.${domainRevisions.bloom}.${fgRev}`;
}

function parseSyncToken(token, expectedProfile) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split(':');
  if (parts.length !== 3) return null;
  const [bootId, profilePart, revPart] = parts;
  if (bootId !== SERVER_BOOT_ID || profilePart !== (expectedProfile || 'caregiver')) {
    return null;
  }
  const revSegments = revPart.split('.');
  if (revSegments.length !== 4) return null;
  const nums = revSegments.map((s) => Number(s));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return {
    howard: nums[0],
    cadence: nums[1],
    bloom: nums[2],
    floodgate: nums[3]
  };
}

function broadcastSseEvent(domain) {
  for (const client of sseClients) {
    if (domain === 'floodgate' && client.profileId !== 'partner2') continue;
    try {
      if (client.res.writableEnded || client.res.destroyed) {
        sseClients.delete(client);
        continue;
      }
      client.res.write(
        `event: sync\ndata: ${JSON.stringify({
          domain,
          syncToken: getSyncTokenForProfile(client.profileId)
        })}\n\n`
      );
    } catch {
      sseClients.delete(client);
      try {
        client.res.end();
      } catch {
        // ignore close error
      }
    }
  }
}

const sseHeartbeatTimer = setInterval(() => {
  for (const client of sseClients) {
    try {
      if (client.res.writableEnded || client.res.destroyed) {
        sseClients.delete(client);
        continue;
      }
      client.res.write(': ping\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 25000);
sseHeartbeatTimer.unref?.();

function bumpRevision(domain = 'all') {
  const broadcastDomains = [];
  if (domain === 'profiles' || domain === 'howard' || domain === 'all') {
    cacheHowardProfiles = null;
  }
  if (domain === 'almanac' || domain === 'howard' || domain === 'all') {
    cacheHowardAlmanac = null;
  }
  if (domain === 'ledger' || domain === 'howard' || domain === 'all') {
    cacheHowardLedger = null;
  }
  if (domain === 'beacon' || domain === 'howard' || domain === 'all') {
    cacheHowardBeacon = null;
  }
  if (
    domain === 'profiles' ||
    domain === 'almanac' ||
    domain === 'ledger' ||
    domain === 'beacon' ||
    domain === 'howard' ||
    domain === 'all'
  ) {
    cacheHowardCombined = null;
    domainRevisions.howard += 1;
    broadcastDomains.push('howard');
  }
  if (domain === 'cadence' || domain === 'all') {
    cacheCadence = null;
    domainRevisions.cadence += 1;
    broadcastDomains.push('cadence');
  }
  if (domain === 'bloom' || domain === 'all') {
    cacheBloom = null;
    domainRevisions.bloom += 1;
    broadcastDomains.push('bloom');
  }
  if (domain === 'floodgate' || domain === 'all') {
    cacheFloodgate = null;
    domainRevisions.floodgate += 1;
    broadcastDomains.push('floodgate');
  }
  if (broadcastDomains.length > 0) {
    broadcastSseEvent(broadcastDomains.length > 1 ? 'all' : broadcastDomains[0]);
  }
}

function getCachedCadenceState() {
  if (!cacheCadence) {
    const { settings, updatedAt: cSetUpd } = readCadenceSettings();
    const { logsByDate, latestLogUpdate: cLogUpd } = readCadenceLogs();
    cacheCadence = {
      settings,
      logsByDate,
      updatedAt: cLogUpd > cSetUpd ? cLogUpd : cSetUpd
    };
  }
  return cacheCadence;
}

function getCachedBloomState() {
  if (!cacheBloom) cacheBloom = readBloomState();
  return cacheBloom;
}

function getCachedFloodgateState() {
  if (!cacheFloodgate) {
    const { settings, updatedAt: fSetUpd } = readFloodgateSettings();
    const { logsByDate, latestLogUpdate: fLogUpd } = readFloodgateLogs();
    cacheFloodgate = {
      settings,
      logsByDate,
      updatedAt: fLogUpd > fSetUpd ? fLogUpd : fSetUpd
    };
  }
  return cacheFloodgate;
}

// ============================================================================
// HTTP HELPERS & STATIC FILE SERVER
// ============================================================================
function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const rawBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const wantsGzip =
    rawBuf.length >= 1024 && /\bgzip\b/i.test(String(res.__acceptEncoding || ''));
  if (wantsGzip) {
    const gzBuf = zlib.gzipSync(rawBuf);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Content-Encoding': 'gzip',
      Vary: 'Accept-Encoding',
      'Content-Length': gzBuf.length,
      ...extraHeaders
    });
    res.end(gzBuf);
    return;
  }
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Vary: 'Accept-Encoding',
    'Content-Length': rawBuf.length,
    ...extraHeaders
  });
  res.end(rawBuf);
}

function safeDecodeUriSegment(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

const MAX_JSON_BODY_BYTES = 1024 * 5120;

function parseJsonBody(req, { allowArray = false } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        const err = new Error('Payload too large');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      if (tooLarge) return;
      if (chunks.length === 0) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const err = new Error('Invalid JSON payload');
        err.statusCode = 400;
        reject(err);
        return;
      }
      const valid = allowArray
        ? isPlainObject(parsed) || Array.isArray(parsed)
        : isPlainObject(parsed);
      if (!valid) {
        const err = new Error('Invalid JSON object payload');
        err.statusCode = 400;
        reject(err);
        return;
      }
      resolve(parsed);
    });

    req.on('error', (err) => {
      if (!tooLarge) reject(err);
    });
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const STATIC_ASSET_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.css',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.map'
]);

function serveStaticFile(res, filePath, isImmutableAsset = false, isHead = false) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(isHead ? undefined : 'Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isHtml = ext === '.html';
    const cacheControl = isHtml
      ? 'no-cache'
      : isImmutableAsset
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'Content-Length': content.length
    });
    res.end(isHead ? undefined : content);
  });
}

// ============================================================================
// HTTP REQUEST ROUTER
// ============================================================================
const server = http.createServer(async (req, res) => {
  try {
    res.__acceptEncoding = String(req.headers['accept-encoding'] || '');
    let parsedUrl;
    try {
      parsedUrl = new URL(req.url || '/', 'http://localhost');
    } catch {
      return sendJson(res, 400, { error: 'Invalid request URL' });
    }
    const { pathname } = parsedUrl;

    // ------------------------------------------------------------------------
    // HEALTH CHECK
    // ------------------------------------------------------------------------
    if (pathname === '/api/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      const payload = {
        status: 'ok',
        app: 'Howard Household Suite',
        dbFolder: DATA_DIR,
        dbFile: 'howard.db',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        journalMode: activeJournalMode,
        serverTime: new Date().toISOString()
      };
      if (req.method === 'HEAD') {
        const body = JSON.stringify(payload);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Content-Length': Buffer.byteLength(body)
        });
        res.end();
        return;
      }
      return sendJson(res, 200, payload);
    }

    // ------------------------------------------------------------------------
    // 1. UNIFIED HOWARD LIVE SYNC & SSE EVENTS ENDPOINTS
    // ------------------------------------------------------------------------
    if (pathname === '/api/howard/events' && req.method === 'GET') {
      const activeProfile = parsedUrl.searchParams.get('profile') || 'caregiver';
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.flushHeaders?.();
      const client = { res, profileId: activeProfile };
      sseClients.add(client);
      res.write(
        `event: ready\ndata: ${JSON.stringify({ syncToken: getSyncTokenForProfile(activeProfile) })}\n\n`
      );
      const cleanup = () => {
        sseClients.delete(client);
      };
      req.on('close', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);
      return;
    }

    if (pathname === '/api/howard/sync' && req.method === 'GET') {
      const activeProfile = parsedUrl.searchParams.get('profile') || 'caregiver';
      const clientSince = parsedUrl.searchParams.get('since') || '';
      const syncToken = getSyncTokenForProfile(activeProfile);
      const prev = parseSyncToken(clientSince, activeProfile);

      const curH = domainRevisions.howard;
      const curC = domainRevisions.cadence;
      const curB = domainRevisions.bloom;
      const curF = activeProfile === 'partner2' ? domainRevisions.floodgate : 0;

      if (
        prev &&
        prev.howard === curH &&
        prev.cadence === curC &&
        prev.bloom === curB &&
        prev.floodgate === curF
      ) {
        return sendJson(res, 200, {
          unchanged: true,
          syncToken
        });
      }

      const dbInfo = {
        file: 'data/howard.db',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        journalMode: activeJournalMode
      };

      if (prev) {
        const changedDomains = [];
        const payload = {
          unchanged: false,
          partial: true,
          syncToken,
          changedDomains,
          serverTime: new Date().toISOString()
        };
        if (prev.howard !== curH) {
          payload.howard = projectHowardStateForProfile(getCachedHowardState(), activeProfile);
          payload.dbInfo = dbInfo;
          changedDomains.push('howard');
        }
        if (prev.cadence !== curC) {
          payload.cadence = getCachedCadenceState();
          changedDomains.push('cadence');
        }
        if (prev.bloom !== curB) {
          payload.bloom = getCachedBloomState();
          changedDomains.push('bloom');
        }
        if (activeProfile === 'partner2' && prev.floodgate !== curF) {
          payload.floodgate = getCachedFloodgateState();
          changedDomains.push('floodgate');
        }
        return sendJson(res, 200, payload);
      }

      const howardState = projectHowardStateForProfile(getCachedHowardState(), activeProfile);
      const cadence = getCachedCadenceState();
      const bloom = getCachedBloomState();
      const floodgate = activeProfile === 'partner2' ? getCachedFloodgateState() : null;
      const changedDomains = ['howard', 'cadence', 'bloom'];
      if (floodgate) changedDomains.push('floodgate');

      return sendJson(res, 200, {
        unchanged: false,
        partial: false,
        syncToken,
        changedDomains,
        dbInfo,
        howard: howardState,
        cadence,
        bloom,
        floodgate,
        serverTime: new Date().toISOString()
      });
    }

    // Verify a profile's PIN before switching
    if (pathname === '/api/howard/profiles/verify-pin' && req.method === 'POST') {
      const { profileId, pin } = await parseJsonBody(req);
      const { data: profiles } = readHowardKey('profiles', DEFAULT_PROFILES);
      const target = profiles.find((p) => p.id === profileId);
      if (!target) {
        return sendJson(res, 404, { error: 'Profile not found' });
      }
      if (!target.pinEnabled || !target.pin || target.id === 'caregiver') {
        return sendJson(res, 200, { verified: true, profile: sanitizeProfilesForClient([target])[0] });
      }
      const isMatch = String(pin || '').trim() === String(target.pin).trim();
      if (!isMatch) {
        return sendJson(res, 401, { verified: false, error: 'Incorrect PIN' });
      }
      return sendJson(res, 200, { verified: true, profile: sanitizeProfilesForClient([target])[0] });
    }

    // Set, change, or disable a profile's PIN (or update profile settings)
    if (pathname === '/api/howard/profiles/pin' && req.method === 'PUT') {
      const { profileId, currentPin, newPin, pinEnabled } = await parseJsonBody(req);
      const { data: profiles } = readHowardKey('profiles', DEFAULT_PROFILES);
      const idx = profiles.findIndex((p) => p.id === profileId);
      if (idx === -1) {
        return sendJson(res, 404, { error: 'Profile not found' });
      }
      const target = profiles[idx];
      if (target.id === 'caregiver') {
        return sendJson(res, 400, { error: 'Caregiver profile must remain unlocked' });
      }

      // If PIN is currently enabled, verify currentPin before changing/disabling
      if (target.pinEnabled && target.pin) {
        if (String(currentPin || '').trim() !== String(target.pin).trim()) {
          return sendJson(res, 401, { error: 'Current PIN is incorrect' });
        }
      }

      if (pinEnabled) {
        const cleaned = String(newPin || '').trim();
        if (!/^\d{4,8}$/.test(cleaned)) {
          return sendJson(res, 400, { error: 'PIN must be 4 to 8 digits' });
        }
        profiles[idx] = { ...target, pinEnabled: true, pin: cleaned };
      } else {
        profiles[idx] = { ...target, pinEnabled: false, pin: '' };
      }

      writeHowardKey('profiles', profiles);
      bumpRevision('profiles');
      return sendJson(res, 200, { profiles: sanitizeProfilesForClient(profiles) });
    }

    // Update a profile's display name (O(1) update via DB-ARCH-2 stable profileId resolution)
    if (pathname === '/api/howard/profiles/name' && req.method === 'PUT') {
      const { profileId, name } = await parseJsonBody(req);
      if (profileId === 'caregiver') {
        return sendJson(res, 400, { error: 'Caregiver profile display name cannot be changed' });
      }
      const cleanedName = String(name || '').trim();
      if (!cleanedName) {
        return sendJson(res, 400, { error: 'Name cannot be empty' });
      }
      if (cleanedName.length > 24) {
        return sendJson(res, 400, { error: 'Name must be 24 characters or fewer' });
      }
      const lowerCleaned = cleanedName.toLowerCase();
      if (
        lowerCleaned === 'both' ||
        lowerCleaned === 'pets' ||
        lowerCleaned === 'household' ||
        lowerCleaned === 'caregiver'
      ) {
        return sendJson(res, 400, { error: `"${cleanedName}" is reserved for household assignments` });
      }
      const { data: profiles } = readHowardKey('profiles', DEFAULT_PROFILES);
      const idx = profiles.findIndex((p) => p.id === profileId);
      if (idx === -1) {
        return sendJson(res, 404, { error: 'Profile not found' });
      }
      const duplicate = profiles.some(
        (p) => p.id !== profileId && String(p.name || '').trim().toLowerCase() === lowerCleaned
      );
      if (duplicate) {
        return sendJson(res, 400, { error: 'Another profile already uses that name' });
      }

      const nowIso = new Date().toISOString();
      profiles[idx] = {
        ...profiles[idx],
        name: cleanedName,
        caregiverName: cleanedName
      };

      runInTransaction(howardDb, () => {
        howardUpsertStmt.run('profiles', JSON.stringify(profiles), nowIso);
      });
      bumpRevision('all');

      return sendJson(res, 200, { profiles: sanitizeProfilesForClient(profiles) });
    }

    // Almanac Calendar Events — Atomic Row-Level Batch Upsert/Delete
    if (pathname === '/api/howard/almanac/events/batch') {
      if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Method not allowed' });
      }
      const incoming = await parseJsonBody(req);
      const upserts = Array.isArray(incoming.upserts) ? incoming.upserts : [];
      const deleteIds = Array.isArray(incoming.deleteIds) ? incoming.deleteIds : [];
      const nowIso = new Date().toISOString();
      const profilesList = getProfilesList();

      for (const evt of upserts) {
        if (!isPlainObject(evt) || !evt.id) {
          return sendJson(res, 400, { error: 'Each Almanac upsert requires a valid event id' });
        }
        if (typeof evt.title !== 'string' || !evt.title.trim()) {
          return sendJson(res, 400, { error: 'Almanac event title cannot be empty' });
        }
        if (typeof evt.date !== 'string' || !VALID_DATE_KEY_RE.test(evt.date)) {
          return sendJson(res, 400, { error: 'Almanac event date must be YYYY-MM-DD' });
        }
      }

      runInTransaction(howardDb, () => {
        for (const id of deleteIds) {
          if (id) almanacDeleteStmt.run(String(id));
        }
        for (const evt of upserts) {
          const id = String(evt.id);
          const dateKey = evt.date;
          const record = enrichAlmanacEvent(
            { ...evt, title: evt.title.trim(), id, date: dateKey, updatedAt: nowIso },
            profilesList
          );
          almanacUpsertStmt.run(id, dateKey, JSON.stringify(record), nowIso);
        }
      });

      bumpRevision('almanac');
      const { almanacEvents } = getCachedHowardAlmanac();
      return sendJson(res, 200, { almanacEvents, updatedAt: nowIso });
    }

    // Almanac Calendar Event — Single Row Upsert / Delete
    if (pathname.startsWith('/api/howard/almanac/events/')) {
      const eventId = safeDecodeUriSegment(pathname.slice('/api/howard/almanac/events/'.length));
      if (!eventId) return sendJson(res, 400, { error: 'Invalid or missing event ID' });
      const nowIso = new Date().toISOString();

      if (req.method === 'PUT') {
        const incoming = await parseJsonBody(req);
        const evt = incoming.event || incoming;
        if (typeof evt.title !== 'string' || !evt.title.trim()) {
          return sendJson(res, 400, { error: 'Almanac event title cannot be empty' });
        }
        if (typeof evt.date !== 'string' || !VALID_DATE_KEY_RE.test(evt.date)) {
          return sendJson(res, 400, { error: 'Almanac event date must be YYYY-MM-DD' });
        }
        const dateKey = evt.date;
        const profilesList = getProfilesList();
        const record = enrichAlmanacEvent(
          { ...evt, title: evt.title.trim(), id: eventId, date: dateKey, updatedAt: nowIso },
          profilesList
        );
        almanacUpsertStmt.run(eventId, dateKey, JSON.stringify(record), nowIso);
        bumpRevision('almanac');
        return sendJson(res, 200, {
          event: resolveAlmanacEvent(record, getProfilesByIdMap(profilesList)),
          updatedAt: nowIso
        });
      }

      if (req.method === 'DELETE') {
        almanacDeleteStmt.run(eventId);
        bumpRevision('almanac');
        return sendJson(res, 200, { deleted: true, id: eventId, updatedAt: nowIso });
      }
    }

    // Almanac Calendar Events — Legacy Bulk Replace (Backward-Compatible)
    if (pathname === '/api/howard/almanac' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      if (!Array.isArray(incoming.events)) {
        return sendJson(res, 400, { error: 'Expected events array' });
      }
      const updatedAt = replaceAllAlmanacEventsInTable(incoming.events);
      bumpRevision('almanac');
      return sendJson(res, 200, { almanacEvents: getCachedHowardAlmanac().almanacEvents, updatedAt });
    }

    // Ledger Bookkeeping — Split Rule Settings Update
    if (pathname === '/api/howard/ledger/settings' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const splitRule = incoming.splitRule === 'proportional' ? 'proportional' : '50-50';
      const updatedAt = writeHowardKey('ledger_settings', { splitRule });
      bumpRevision('ledger');
      return sendJson(res, 200, { splitRule, updatedAt });
    }

    // Ledger Bookkeeping — Single Row Item Upsert / Delete ('expense' | 'recurring' | 'income')
    if (pathname.startsWith('/api/howard/ledger/items/')) {
      const itemId = safeDecodeUriSegment(pathname.slice('/api/howard/ledger/items/'.length));
      if (!itemId) return sendJson(res, 400, { error: 'Invalid or missing ledger item ID' });
      const nowIso = new Date().toISOString();

      if (req.method === 'PUT') {
        const incoming = await parseJsonBody(req);
        if (incoming.kind !== undefined && !VALID_LEDGER_KINDS.has(incoming.kind)) {
          return sendJson(res, 400, { error: 'Invalid ledger item kind' });
        }
        const kind = VALID_LEDGER_KINDS.has(incoming.kind) ? incoming.kind : 'expense';
        const rawItem = isPlainObject(incoming.item) ? incoming.item : incoming;
        if (typeof rawItem.title !== 'string' || !rawItem.title.trim()) {
          return sendJson(res, 400, { error: 'Ledger item title cannot be empty' });
        }
        const parsedAmount = Number(rawItem.amount);
        if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
          return sendJson(res, 400, { error: 'Ledger amount must be a non-negative finite number' });
        }
        if (rawItem.owner !== undefined && !VALID_LEDGER_OWNERS.has(rawItem.owner)) {
          return sendJson(res, 400, { error: 'Invalid ledger owner' });
        }
        if (
          kind === 'expense' &&
          rawItem.paidBy !== undefined &&
          !VALID_LEDGER_OWNERS.has(rawItem.paidBy)
        ) {
          return sendJson(res, 400, { error: 'Invalid expense paidBy value' });
        }
        const record = {
          ...rawItem,
          title: rawItem.title.trim(),
          amount: parsedAmount,
          id: itemId,
          updatedAt: nowIso
        };
        ledgerUpsertStmt.run(itemId, kind, JSON.stringify(record), nowIso);
        bumpRevision('ledger');
        return sendJson(res, 200, { id: itemId, kind, item: record, updatedAt: nowIso });
      }

      if (req.method === 'DELETE') {
        ledgerDeleteStmt.run(itemId);
        bumpRevision('ledger');
        return sendJson(res, 200, { deleted: true, id: itemId, updatedAt: nowIso });
      }
    }

    // Ledger Bookkeeping Data — Legacy Bulk Replace (Backward-Compatible)
    if (pathname === '/api/howard/ledger' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const rawLedger = incoming.ledgerData !== undefined ? incoming.ledgerData : incoming;
      const hasLedgerField =
        isPlainObject(rawLedger) &&
        ['splitRule', 'incomes', 'recurring', 'expenses'].some((k) =>
          Object.prototype.hasOwnProperty.call(rawLedger, k)
        );
      if (!hasLedgerField) {
        return sendJson(res, 400, {
          error: 'Expected ledgerData object with splitRule, incomes, recurring, or expenses'
        });
      }
      const { ledgerData: normalized, updatedAt } = replaceAllLedgerDataInTable(rawLedger);
      bumpRevision('ledger');
      return sendJson(res, 200, { ledgerData: normalized, updatedAt });
    }

    // Beacon Emergency & House Guide CRUD
    if (pathname === '/api/howard/beacon' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const patch = isPlainObject(incoming.beaconInfo) ? incoming.beaconInfo : incoming;
      const { data: current } = readHowardKey('beacon_info', DEFAULT_BEACON_INFO);
      const profilesList = getProfilesList();
      const updated = mergeBeaconInfo(current, patch, profilesList, { mergeContacts: false });
      const updatedAt = writeHowardKey('beacon_info', updated);
      bumpRevision('beacon');
      return sendJson(res, 200, {
        beaconInfo: resolveBeaconInfo(updated, getProfilesByIdMap(profilesList)),
        updatedAt
      });
    }

    // Full Household Backup Export (Available to Partner 1 & Partner 2; includes Floodgate in its entirety)
    if (pathname === '/api/howard/backup' && req.method === 'GET') {
      const reqProfile = String(
        parsedUrl.searchParams.get('profile') || req.headers['x-howard-profile'] || 'caregiver'
      );
      if (reqProfile !== 'partner1' && reqProfile !== 'partner2') {
        return sendJson(res, 403, { error: 'Caregiver profile cannot export database backups' });
      }
      checkpointDatabase();
      const includeFloodgate = parsedUrl.searchParams.get('includeFloodgate') !== '0';
      const howardState = getCachedHowardState();
      const cadenceExportSettings = readCadenceSettings({ includeInternal: true }).settings;
      const cadenceState = getCachedCadenceState();
      const bloomExportSettings = readBloomSettings({ includeInternal: true }).settings;
      const bloomState = getCachedBloomState();

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
        const fgState = getCachedFloodgateState();
        payload.floodgate = {
          settings: fgState.settings,
          logsByDate: fgState.logsByDate
        };
      }

      return sendJson(res, 200, payload);
    }

    // Full Household Backup Restore (Partner 1 only; single-transaction ACID + DB-ARCH-4 safety snapshot)
    if (pathname === '/api/howard/restore' && req.method === 'POST') {
      const incoming = await parseJsonBody(req);
      const actorProfileId = String(
        parsedUrl.searchParams.get('profile') ||
          req.headers['x-howard-profile'] ||
          incoming.profileId ||
          'caregiver'
      );
      if (actorProfileId !== 'partner1') {
        return sendJson(res, 403, { error: 'Only the primary household profile can restore backups' });
      }

      if (incoming.schemaVersion !== undefined) {
        const sv = Number(incoming.schemaVersion);
        if (!Number.isInteger(sv) || sv < 1 || sv > CURRENT_SCHEMA_VERSION) {
          return sendJson(res, 400, {
            error: `Unsupported backup schemaVersion (${incoming.schemaVersion})`
          });
        }
      }

      const hasHoward = isPlainObject(incoming.howard);
      const hasCadence = isPlainObject(incoming.cadence);
      const hasBloom = isPlainObject(incoming.bloom);
      const hasFloodgate = isPlainObject(incoming.floodgate);
      if (!hasHoward && !hasCadence && !hasBloom && !hasFloodgate) {
        return sendJson(res, 400, {
          error: 'Backup payload must include at least one howard, cadence, bloom, or floodgate section'
        });
      }

      const isMerge = incoming.mode === 'merge';
      const nowIso = new Date().toISOString();
      const fallbackDate = getLocalDateKey(new Date());

      let validatedProfilesPatch = null;
      if (hasHoward && incoming.howard.profiles !== undefined) {
        if (!Array.isArray(incoming.howard.profiles)) {
          return sendJson(res, 400, { error: 'howard.profiles must be an array' });
        }
        const rawIncomingProfiles = incoming.howard.profiles.filter(
          (p) => isPlainObject(p) && typeof p.id === 'string'
        );
        const currentProfiles = getProfilesList();
        const incomingById = new Map(rawIncomingProfiles.map((p) => [p.id, p]));
        const candidateProfiles = (
          Array.isArray(currentProfiles) ? currentProfiles : DEFAULT_PROFILES
        ).map((prof) => {
          if (prof.id !== 'partner1' && prof.id !== 'partner2') return prof;
          const inc = incomingById.get(prof.id);
          if (!inc) return prof;
          const cleanedName = typeof inc.name === 'string' ? inc.name.trim() : '';
          const lowerName = cleanedName.toLowerCase();
          if (
            !cleanedName ||
            cleanedName.length > 24 ||
            lowerName === 'both' ||
            lowerName === 'pets' ||
            lowerName === 'household' ||
            lowerName === 'caregiver'
          ) {
            throw createHttpError(400, `Invalid imported profile name for ${prof.id}`);
          }
          const nextEmoji =
            typeof inc.badgeEmoji === 'string' && inc.badgeEmoji.trim()
              ? inc.badgeEmoji.trim()
              : prof.badgeEmoji;
          return {
            ...prof,
            name: cleanedName,
            caregiverName: cleanedName,
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

      // Pre-validate & normalize all payloads before taking snapshot or opening transaction
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

      // DB-ARCH-4: Always write an atomic pre-restore VACUUM INTO safety snapshot first
      const snapshot = createPreRestoreSnapshot();

      runInTransaction(howardDb, () => {
        let effectiveProfiles = getProfilesList();

        if (howardPlan?.profiles) {
          effectiveProfiles = howardPlan.profiles;
          howardUpsertStmt.run('profiles', JSON.stringify(howardPlan.profiles), nowIso);
        }

        if (howardPlan?.events) {
          if (!isMerge) almanacClearAllStmt.run();
          for (const item of howardPlan.events) {
            const enriched = enrichAlmanacEvent(item.record, effectiveProfiles);
            almanacUpsertStmt.run(
              item.id,
              item.dateKey,
              JSON.stringify(enriched),
              item.updatedAt
            );
          }
        }

        if (howardPlan?.ledger) {
          writeLedgerDataInTx(howardPlan.ledger.normalized, {
            nowIso,
            clearExisting: !isMerge
          });
          if (isMerge && howardPlan.ledger.hasExplicitSplitRule) {
            howardUpsertStmt.run(
              'ledger_settings',
              JSON.stringify({ splitRule: howardPlan.ledger.normalized.splitRule }),
              nowIso
            );
          }
        }

        if (howardPlan?.beacon) {
          const nextBeacon = isMerge
            ? mergeBeaconInfo(
                readHowardKey('beacon_info', DEFAULT_BEACON_INFO).data,
                howardPlan.beacon,
                effectiveProfiles,
                { mergeContacts: true }
              )
            : normalizeBeaconInfo(howardPlan.beacon, { profilesList: effectiveProfiles });
          howardUpsertStmt.run('beacon_info', JSON.stringify(nextBeacon), nowIso);
        }

        if (cadencePlan?.settings) {
          const base = isMerge
            ? readHowardKey('cadence_settings', createDefaultCadenceSettings()).data
            : createDefaultCadenceSettings();
          const merged = normalizeCadenceSettings(cadencePlan.settings, base, effectiveProfiles);
          howardUpsertStmt.run('cadence_settings', JSON.stringify(merged), nowIso);
        }
        if (cadencePlan?.logs) {
          if (!isMerge) cadenceClearLogsStmt.run();
          for (const item of cadencePlan.logs) {
            let nextRec = item.record;
            if (isMerge) {
              const existingRow = cadenceGetLogByDateStmt.get(item.dateKey);
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
                  // fall back to incoming record
                }
              }
            }
            const enriched = enrichCadenceRecord(nextRec, effectiveProfiles);
            cadenceUpsertLogStmt.run(item.dateKey, JSON.stringify(enriched), item.updatedAt);
          }
        }

        if (bloomPlan?.settings) {
          const current = readHowardKey('bloom_settings', createDefaultBloomSettings()).data;
          const merged = isMerge
            ? normalizeBloomSettings(bloomPlan.settings, current, effectiveProfiles)
            : normalizeBloomSettings(bloomPlan.settings, null, effectiveProfiles);
          howardUpsertStmt.run('bloom_settings', JSON.stringify(merged), nowIso);
        }
        if (bloomPlan?.logs) {
          if (!isMerge) bloomClearLogsStmt.run();
          const mergeArrById = (baseArr, incArr) => {
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
          };
          for (const item of bloomPlan.logs) {
            let nextRec = item.record;
            if (isMerge) {
              const existingRow = bloomGetLogByDateStmt.get(item.dateKey);
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
                    mists: mergeArrById(cur.mists, item.record.mists),
                    feedings: mergeArrById(cur.feedings, item.record.feedings),
                    climateChecks: mergeArrById(cur.climateChecks, item.record.climateChecks),
                    behaviors: Array.from(
                      new Set([
                        ...(Array.isArray(cur.behaviors) ? cur.behaviors : []),
                        ...(Array.isArray(item.record.behaviors) ? item.record.behaviors : [])
                      ])
                    ),
                    abdomenStatus: keepCurAbdomen ? cur.abdomenStatus : item.record.abdomenStatus,
                    abdomenUpdatedAt: keepCurAbdomen ? cur.abdomenUpdatedAt : item.record.abdomenUpdatedAt,
                    journalNote:
                      typeof item.record.journalNote === 'string' && item.record.journalNote.trim()
                        ? item.record.journalNote
                        : cur.journalNote || ''
                  };
                } catch {
                  // fall back to incoming record
                }
              }
            }
            const enriched = enrichBloomCareRecord(nextRec, effectiveProfiles);
            bloomUpsertLogStmt.run(item.dateKey, JSON.stringify(enriched), item.updatedAt);
          }
        }
        if (bloomPlan?.molts) {
          if (!isMerge) bloomClearMoltsStmt.run();
          for (const m of bloomPlan.molts) {
            const enriched = enrichBloomMoltRecord(m.record, effectiveProfiles);
            bloomUpsertMoltStmt.run(m.id, m.dateKey, JSON.stringify(enriched), m.updatedAt);
          }
        }
        if (bloomPlan?.feeders) {
          if (!isMerge) bloomClearFeedersStmt.run();
          for (const f of bloomPlan.feeders) {
            bloomUpsertFeederStmt.run(f.id, JSON.stringify(f.record), f.updatedAt);
          }
        }

        if (floodgatePlan?.settings) {
          const base = isMerge
            ? readHowardKey('floodgate_settings', DEFAULT_FLOODGATE_SETTINGS).data
            : DEFAULT_FLOODGATE_SETTINGS;
          const merged = {
            ...DEFAULT_FLOODGATE_SETTINGS,
            ...base,
            ...floodgatePlan.settings,
            ownerProfileId: 'partner2'
          };
          howardUpsertStmt.run('floodgate_settings', JSON.stringify(merged), nowIso);
        }
        if (floodgatePlan?.logs) {
          if (!isMerge) floodgateClearLogsStmt.run();
          for (const item of floodgatePlan.logs) {
            if (isMerge) {
              const existingRow = floodgateGetLogByDateStmt.get(item.dateKey);
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
            floodgateUpsertLogStmt.run(item.dateKey, JSON.stringify(item.record), item.updatedAt);
          }
        }
      });

      bumpRevision('all');

      return sendJson(res, 200, {
        restored: true,
        mode: isMerge ? 'merge' : 'replace',
        preRestoreSnapshot: snapshot.dirName,
        updatedAt: nowIso
      });
    }

    // ------------------------------------------------------------------------
    // 2. CADENCE API ROUTES (/api/cadence/*)
    // ------------------------------------------------------------------------
    if (pathname === '/api/cadence/state' && req.method === 'GET') {
      return sendJson(res, 200, getCachedCadenceState());
    }

    if (pathname === '/api/cadence/settings' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const { data: rawCurrent } = readHowardKey('cadence_settings', createDefaultCadenceSettings());
      const nowIso = new Date().toISOString();
      const base = isPlainObject(rawCurrent) ? rawCurrent : createDefaultCadenceSettings();
      if (incoming.bottleShelfLifeDays !== undefined) {
        const shelf = Number(incoming.bottleShelfLifeDays);
        if (!Number.isFinite(shelf) || shelf < 7 || shelf > 365) {
          return sendJson(res, 400, { error: 'Bottle shelf life must be 7 to 365 days' });
        }
      }
      if (incoming.bottleOpenedDate !== undefined && !VALID_DATE_KEY_RE.test(incoming.bottleOpenedDate)) {
        return sendJson(res, 400, { error: 'bottleOpenedDate must be YYYY-MM-DD' });
      }
      const profilesList = getProfilesList();
      const patch = { ...incoming };
      if (Array.isArray(incoming.caregivers) && !Array.isArray(incoming.caregiverItems)) {
        patch.caregiverItems = buildCaregiverItems(incoming.caregivers, profilesList);
      }
      const updatedRaw = normalizeCadenceSettings(patch, base, profilesList);
      howardUpsertStmt.run('cadence_settings', JSON.stringify(updatedRaw), nowIso);
      bumpRevision('cadence');
      return sendJson(res, 200, { settings: readCadenceSettings().settings, updatedAt: nowIso });
    }

    if (pathname.startsWith('/api/cadence/logs/') && req.method === 'PUT') {
      const dateKey = safeDecodeUriSegment(pathname.slice('/api/cadence/logs/'.length));
      if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      }
      const incoming = await parseJsonBody(req);
      const nowIso = new Date().toISOString();
      const profilesList = getProfilesList();

      const updatedRecord = runInTransaction(howardDb, () => {
        const existingRow = cadenceGetLogByDateStmt.get(dateKey);
        let currentRecord = { dateKey };
        if (existingRow) {
          try {
            currentRecord = { dateKey, ...JSON.parse(existingRow.data) };
          } catch {
            currentRecord = { dateKey };
          }
        }
        const nextRecord = enrichCadenceRecord(
          {
            ...currentRecord,
            ...incoming,
            dateKey,
            updatedAt: typeof incoming.updatedAt === 'string' ? incoming.updatedAt : nowIso
          },
          profilesList
        );
        cadenceUpsertLogStmt.run(dateKey, JSON.stringify(nextRecord), nextRecord.updatedAt);
        return nextRecord;
      });

      bumpRevision('cadence');
      return sendJson(res, 200, {
        dateKey,
        record: resolveCadenceRecord(updatedRecord, getProfilesByIdMap(profilesList))
      });
    }

    // ------------------------------------------------------------------------
    // 3. FLOODGATE API ROUTES (/api/floodgate/*) — Partner 2 Private Access
    // ------------------------------------------------------------------------
    if (pathname === '/api/floodgate/state' || pathname === '/api/floodgate/settings' || pathname.startsWith('/api/floodgate/logs')) {
      const fgCaller = String(
        parsedUrl.searchParams.get('profile') || req.headers['x-howard-profile'] || 'caregiver'
      );
      if (fgCaller !== 'partner2') {
        return sendJson(res, 403, { error: 'Floodgate routes are restricted to Partner 2' });
      }
    }

    if (pathname === '/api/floodgate/state' && req.method === 'GET') {
      return sendJson(res, 200, getCachedFloodgateState());
    }

    if (pathname === '/api/floodgate/settings' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const { data: rawCurrent } = readHowardKey('floodgate_settings', DEFAULT_FLOODGATE_SETTINGS);
      const nowIso = new Date().toISOString();
      const updatedRaw = {
        ...DEFAULT_FLOODGATE_SETTINGS,
        ...(isPlainObject(rawCurrent) ? rawCurrent : {}),
        ...incoming,
        ownerProfileId: 'partner2'
      };
      howardUpsertStmt.run('floodgate_settings', JSON.stringify(updatedRaw), nowIso);
      bumpRevision('floodgate');
      return sendJson(res, 200, { settings: readFloodgateSettings().settings, updatedAt: nowIso });
    }

    if (pathname === '/api/floodgate/logs/batch' && req.method === 'POST') {
      const incoming = await parseJsonBody(req, { allowArray: true });
      const rawLogs = Array.isArray(incoming)
        ? incoming
        : incoming.logs !== undefined
          ? incoming.logs
          : incoming;
      if (!rawLogs || typeof rawLogs !== 'object') {
        return sendJson(res, 400, { error: 'Expected logs object or array' });
      }
      const entries = Array.isArray(rawLogs)
        ? rawLogs.map((item) => [null, item])
        : Object.entries(rawLogs);
      const nowIso = new Date().toISOString();

      const upsertedCount = runInTransaction(howardDb, () => {
        let count = 0;
        for (const [key, item] of entries) {
          if (!isPlainObject(item)) continue;
          const dateKey = item.date || item.dateKey || key;
          if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;

          const existingRow = floodgateGetLogByDateStmt.get(dateKey);
          let currentRecord = { date: dateKey };
          if (existingRow) {
            try {
              currentRecord = { date: dateKey, ...JSON.parse(existingRow.data) };
            } catch {
              currentRecord = { date: dateKey };
            }
          }
          const updatedRecord = {
            ...currentRecord,
            ...item,
            date: dateKey,
            updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : nowIso
          };
          floodgateUpsertLogStmt.run(dateKey, JSON.stringify(updatedRecord), updatedRecord.updatedAt);
          count += 1;
        }
        return count;
      });

      bumpRevision('floodgate');
      const { logsByDate, updatedAt } = getCachedFloodgateState();
      return sendJson(res, 200, { count: upsertedCount, logsByDate, updatedAt: updatedAt || nowIso });
    }

    if (pathname.startsWith('/api/floodgate/logs/') && req.method === 'PUT') {
      const dateKey = safeDecodeUriSegment(pathname.slice('/api/floodgate/logs/'.length));
      if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      }
      const incoming = await parseJsonBody(req);
      const nowIso = new Date().toISOString();

      const updatedRecord = runInTransaction(howardDb, () => {
        const existingRow = floodgateGetLogByDateStmt.get(dateKey);
        let currentRecord = { date: dateKey };
        if (existingRow) {
          try {
            currentRecord = { date: dateKey, ...JSON.parse(existingRow.data) };
          } catch {
            currentRecord = { date: dateKey };
          }
        }
        const nextRecord = {
          ...currentRecord,
          ...incoming,
          date: dateKey,
          updatedAt: typeof incoming.updatedAt === 'string' ? incoming.updatedAt : nowIso
        };
        floodgateUpsertLogStmt.run(dateKey, JSON.stringify(nextRecord), nextRecord.updatedAt);
        return nextRecord;
      });

      bumpRevision('floodgate');
      return sendJson(res, 200, { dateKey, record: updatedRecord });
    }

    if (pathname.startsWith('/api/floodgate/logs/') && req.method === 'DELETE') {
      const dateKey = safeDecodeUriSegment(pathname.slice('/api/floodgate/logs/'.length));
      if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      }
      floodgateDeleteLogStmt.run(dateKey);
      bumpRevision('floodgate');
      return sendJson(res, 200, { deleted: true, dateKey });
    }

    // ------------------------------------------------------------------------
    // 4. BLOOM API ROUTES (/api/bloom/*)
    // ------------------------------------------------------------------------
    if (pathname === '/api/bloom/state' && req.method === 'GET') {
      return sendJson(res, 200, getCachedBloomState());
    }

    if (pathname === '/api/bloom/settings' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const { data: rawCurrent } = readHowardKey('bloom_settings', createDefaultBloomSettings());
      const base = isPlainObject(rawCurrent) ? rawCurrent : createDefaultBloomSettings();
      const nowIso = new Date().toISOString();
      const profilesList = getProfilesList();
      const merged = {
        ...base,
        ...incoming,
        enclosureInfo: {
          ...base.enclosureInfo,
          ...(incoming.enclosureInfo && typeof incoming.enclosureInfo === 'object'
            ? incoming.enclosureInfo
            : {})
        }
      };
      const tMin = Number(merged.dayTempMinC);
      const tMax = Number(merged.dayTempMaxC);
      const hMin = Number(merged.humidityMinPct);
      const hMax = Number(merged.humidityMaxPct);
      if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMin < 5 || tMax > 50 || tMin > tMax) {
        return sendJson(res, 400, { error: 'Invalid Bloom temperature range (5-50C, min <= max)' });
      }
      if (!Number.isFinite(hMin) || !Number.isFinite(hMax) || hMin < 0 || hMax > 100 || hMin > hMax) {
        return sendJson(res, 400, { error: 'Invalid Bloom humidity range (0-100%, min <= max)' });
      }
      const nextCaregiverItems = Array.isArray(incoming.caregivers)
        ? buildCaregiverItems(incoming.caregivers, profilesList)
        : Array.isArray(base.caregiverItems)
          ? base.caregiverItems
          : buildCaregiverItems(merged.caregivers, profilesList);
      const updatedRaw = normalizeBloomSettings(
        { ...merged, caregiverItems: nextCaregiverItems },
        base,
        profilesList
      );
      howardUpsertStmt.run('bloom_settings', JSON.stringify(updatedRaw), nowIso);
      bumpRevision('bloom');
      return sendJson(res, 200, { settings: readBloomSettings().settings, updatedAt: nowIso });
    }

    if (pathname.startsWith('/api/bloom/logs/') && req.method === 'PUT') {
      const dateKey = safeDecodeUriSegment(pathname.slice('/api/bloom/logs/'.length));
      if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      }
      const incoming = await parseJsonBody(req);
      const {
        settingsPatch,
        appendMist,
        removeMistId,
        appendFeeding,
        removeFeedingId,
        appendClimateCheck,
        removeClimateCheckId,
        toggleBehavior,
        ...logPayload
      } = incoming || {};
      const nowIso = new Date().toISOString();
      const profilesList = getProfilesList();

      const { updatedRecord, updatedSettings } = runInTransaction(howardDb, () => {
        const existingRow = bloomGetLogByDateStmt.get(dateKey);
        let currentRecord = { dateKey, mists: [], feedings: [], climateChecks: [], behaviors: [] };
        if (existingRow) {
          try {
            currentRecord = { ...currentRecord, ...JSON.parse(existingRow.data), dateKey };
          } catch {
            // keep clean default record
          }
        }
        const nextRecord = {
          ...currentRecord,
          ...logPayload,
          dateKey,
          updatedAt: typeof logPayload.updatedAt === 'string' ? logPayload.updatedAt : nowIso
        };
        nextRecord.mists = Array.isArray(nextRecord.mists) ? [...nextRecord.mists] : [];
        nextRecord.feedings = Array.isArray(nextRecord.feedings) ? [...nextRecord.feedings] : [];
        nextRecord.climateChecks = Array.isArray(nextRecord.climateChecks)
          ? [...nextRecord.climateChecks]
          : [];
        nextRecord.behaviors = Array.isArray(nextRecord.behaviors)
          ? [...nextRecord.behaviors]
          : [];

        if (isPlainObject(appendMist)) {
          const mistId = String(
            appendMist.id || `mist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          );
          const mistObj = {
            ...appendMist,
            id: mistId,
            timestamp: appendMist.timestamp || nowIso
          };
          if (!nextRecord.mists.some((m) => m && m.id === mistId)) {
            nextRecord.mists.push(mistObj);
          }
          if (mistObj.dropletDrinkObserved && !nextRecord.behaviors.includes('Drank Droplets')) {
            nextRecord.behaviors.push('Drank Droplets');
          }
        }
        if (removeMistId !== undefined && removeMistId !== null && String(removeMistId) !== '') {
          const remId = String(removeMistId);
          nextRecord.mists = nextRecord.mists.filter((m) => m && m.id !== remId);
        }

        if (isPlainObject(appendFeeding)) {
          const feedId = String(
            appendFeeding.id || `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          );
          const feedObj = {
            ...appendFeeding,
            id: feedId,
            timestamp: appendFeeding.timestamp || nowIso
          };
          if (!nextRecord.feedings.some((f) => f && f.id === feedId)) {
            nextRecord.feedings.push(feedObj);
          }
        }
        if (
          removeFeedingId !== undefined &&
          removeFeedingId !== null &&
          String(removeFeedingId) !== ''
        ) {
          const remId = String(removeFeedingId);
          nextRecord.feedings = nextRecord.feedings.filter((f) => f && f.id !== remId);
        }

        if (isPlainObject(appendClimateCheck)) {
          const climId = String(
            appendClimateCheck.id ||
              `clim-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
          );
          const climObj = {
            ...appendClimateCheck,
            id: climId,
            timestamp: appendClimateCheck.timestamp || nowIso
          };
          if (!nextRecord.climateChecks.some((c) => c && c.id === climId)) {
            nextRecord.climateChecks.push(climObj);
          }
        }
        if (
          removeClimateCheckId !== undefined &&
          removeClimateCheckId !== null &&
          String(removeClimateCheckId) !== ''
        ) {
          const remId = String(removeClimateCheckId);
          nextRecord.climateChecks = nextRecord.climateChecks.filter((c) => c && c.id !== remId);
        }

        if (typeof toggleBehavior === 'string' && toggleBehavior.trim()) {
          const tag = toggleBehavior.trim();
          if (nextRecord.behaviors.includes(tag)) {
            nextRecord.behaviors = nextRecord.behaviors.filter((b) => b !== tag);
          } else {
            nextRecord.behaviors.push(tag);
          }
        }

        const enrichedRecord = enrichBloomCareRecord(nextRecord, profilesList);
        bloomUpsertLogStmt.run(dateKey, JSON.stringify(enrichedRecord), enrichedRecord.updatedAt);

        let nextSettings = null;
        if (isPlainObject(settingsPatch)) {
          const { data: rawCurrent } = readHowardKey('bloom_settings', createDefaultBloomSettings());
          const base = isPlainObject(rawCurrent) ? rawCurrent : createDefaultBloomSettings();
          const merged = {
            ...base,
            ...settingsPatch,
            enclosureInfo: {
              ...base.enclosureInfo,
              ...(isPlainObject(settingsPatch.enclosureInfo) ? settingsPatch.enclosureInfo : {})
            }
          };
          if (Array.isArray(settingsPatch.caregivers)) {
            merged.caregiverItems = buildCaregiverItems(settingsPatch.caregivers, profilesList);
          } else if (Array.isArray(base.caregiverItems)) {
            merged.caregiverItems = base.caregiverItems;
          }
          nextSettings = normalizeBloomSettings(merged, base, profilesList);
          howardUpsertStmt.run('bloom_settings', JSON.stringify(nextSettings), nowIso);
        }

        return { updatedRecord: enrichedRecord, updatedSettings: nextSettings };
      });

      bumpRevision('bloom');
      return sendJson(res, 200, {
        dateKey,
        record: resolveBloomCareRecord(updatedRecord, getProfilesByIdMap(profilesList)),
        ...(updatedSettings ? { settings: readBloomSettings().settings } : {})
      });
    }

    if (pathname === '/api/bloom/molts' && req.method === 'POST') {
      const incoming = await parseJsonBody(req);
      const nowIso = new Date().toISOString();
      const dateKey =
        incoming.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(incoming.dateKey)
          ? incoming.dateKey
          : getLocalDateKey(new Date());
      const moltId = incoming.id || `molt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let validLengthMm = null;
      if (
        incoming.lengthMm !== null &&
        incoming.lengthMm !== undefined &&
        String(incoming.lengthMm).trim() !== ''
      ) {
        const parsedLen = Number(incoming.lengthMm);
        if (!Number.isFinite(parsedLen) || parsedLen <= 0) {
          return sendJson(res, 400, { error: 'Body length must be a positive number' });
        }
        validLengthMm = parsedLen;
      }

      const profilesList = getProfilesList();
      const moltRecord = enrichBloomMoltRecord(
        {
          id: moltId,
          dateKey,
          timestamp: incoming.timestamp || nowIso,
          fromInstar: incoming.fromInstar || 'L2',
          toInstar: incoming.toInstar || 'L3',
          lengthMm: validLengthMm,
          colorShift: String(incoming.colorShift || '').trim(),
          quality: incoming.quality || 'clean',
          loggedBy: incoming.loggedBy || 'Household',
          ...(incoming.loggedByProfileId ? { loggedByProfileId: incoming.loggedByProfileId } : {}),
          note: String(incoming.note || '').trim(),
          updatedAt: nowIso
        },
        profilesList
      );

      runInTransaction(howardDb, () => {
        bloomUpsertMoltStmt.run(moltId, dateKey, JSON.stringify(moltRecord), nowIso);

        if (incoming.advanceInstar !== false) {
          const { data: rawCurrent } = readHowardKey('bloom_settings', createDefaultBloomSettings());
          const base = isPlainObject(rawCurrent) ? rawCurrent : createDefaultBloomSettings();
          const parsedHard = Number(base.hardeningHours);
          const hardHours = Number.isFinite(parsedHard) && parsedHard >= 0 ? parsedHard : 36;
          const startHardening = incoming.startHardening !== false && hardHours > 0;
          const hardeningUntilIso = startHardening
            ? new Date(Date.now() + hardHours * 3600000).toISOString()
            : null;

          const nextSettings = normalizeBloomSettings({
            ...base,
            currentInstar: moltRecord.toInstar || base.currentInstar,
            ...(moltRecord.colorShift ? { currentColorMorph: moltRecord.colorShift } : {}),
            lifecycleStatus: startHardening ? 'hardening' : 'normal',
            premoltStartedAt: null,
            hardeningUntil: hardeningUntilIso,
            enclosureInfo: {
              ...base.enclosureInfo,
              ...(moltRecord.lengthMm ? { currentBodyLengthMm: moltRecord.lengthMm } : {})
            },
            ...(Array.isArray(base.caregiverItems) ? { caregiverItems: base.caregiverItems } : {})
          }, base, profilesList);
          howardUpsertStmt.run('bloom_settings', JSON.stringify(nextSettings), nowIso);
        }
      });

      bumpRevision('bloom');
      const { molts, settings } = getCachedBloomState();
      return sendJson(res, 200, {
        molt: resolveBloomMoltRecord(moltRecord, getProfilesByIdMap(profilesList)),
        molts,
        settings,
        updatedAt: nowIso
      });
    }

    if (pathname.startsWith('/api/bloom/molts/') && req.method === 'DELETE') {
      const moltId = safeDecodeUriSegment(pathname.slice('/api/bloom/molts/'.length));
      if (!moltId) return sendJson(res, 400, { error: 'Invalid or missing molt ID' });
      const nowIso = new Date().toISOString();
      runInTransaction(howardDb, () => {
        const beforeMolts = readBloomMolts().molts;
        const deletedIndex = beforeMolts.findIndex((m) => m.id === moltId);
        const deletedMolt = deletedIndex >= 0 ? beforeMolts[deletedIndex] : null;
        bloomDeleteMoltStmt.run(moltId);
        if (deletedMolt && deletedIndex === 0) {
          const remaining = readBloomMolts().molts;
          const { data: rawCurrent } = readHowardKey('bloom_settings', createDefaultBloomSettings());
          const base = isPlainObject(rawCurrent) ? rawCurrent : createDefaultBloomSettings();
          const revertedInstar = remaining[0]?.toInstar || deletedMolt.fromInstar || base.currentInstar;
          const nextSettings = normalizeBloomSettings(
            {
              ...base,
              currentInstar: revertedInstar,
              ...(base.lifecycleStatus === 'hardening'
                ? { lifecycleStatus: 'normal', hardeningUntil: null }
                : {})
            },
            base
          );
          howardUpsertStmt.run('bloom_settings', JSON.stringify(nextSettings), nowIso);
        }
      });
      bumpRevision('bloom');
      const { molts, settings } = getCachedBloomState();
      return sendJson(res, 200, { deleted: true, id: moltId, molts, settings });
    }

    if (pathname.startsWith('/api/bloom/feeders/') && req.method === 'PUT') {
      const feederId = safeDecodeUriSegment(pathname.slice('/api/bloom/feeders/'.length));
      if (!feederId) return sendJson(res, 400, { error: 'Invalid or missing feeder ID' });
      const incoming = await parseJsonBody(req);
      const nameTrimmed = String(incoming.name || '').trim();
      if (!nameTrimmed) {
        return sendJson(res, 400, { error: 'Feeder culture name cannot be empty' });
      }
      const shelfLife =
        incoming.shelfLifeDays !== undefined ? Number(incoming.shelfLifeDays) : 28;
      if (!Number.isFinite(shelfLife) || shelfLife < 1 || shelfLife > 365) {
        return sendJson(res, 400, { error: 'Feeder shelf life must be between 1 and 365 days' });
      }
      if (incoming.startedDate !== undefined && !VALID_DATE_KEY_RE.test(incoming.startedDate)) {
        return sendJson(res, 400, { error: 'Feeder startedDate must be YYYY-MM-DD' });
      }
      const nowIso = new Date().toISOString();
      const feederRecord = {
        id: feederId,
        name: nameTrimmed,
        feederType: incoming.feederType || 'hydei',
        startedDate: incoming.startedDate || getLocalDateKey(new Date()),
        shelfLifeDays: Math.round(shelfLife),
        status: incoming.status || 'booming',
        storageNote: String(incoming.storageNote || '').trim(),
        active: incoming.active !== false,
        updatedAt: nowIso
      };
      bloomUpsertFeederStmt.run(feederId, JSON.stringify(feederRecord), nowIso);
      bumpRevision('bloom');
      const { feeders } = getCachedBloomState();
      return sendJson(res, 200, { feeder: feederRecord, feeders, updatedAt: nowIso });
    }

    if (pathname.startsWith('/api/bloom/feeders/') && req.method === 'DELETE') {
      const feederId = safeDecodeUriSegment(pathname.slice('/api/bloom/feeders/'.length));
      if (!feederId) return sendJson(res, 400, { error: 'Invalid or missing feeder ID' });
      bloomDeleteFeederStmt.run(feederId);
      bumpRevision('bloom');
      const { feeders } = getCachedBloomState();
      return sendJson(res, 200, { deleted: true, id: feederId, feeders });
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'API endpoint not found' });
    }

    // ------------------------------------------------------------------------
    // 4. STATIC FRONTEND & SPA FALLBACK
    // ------------------------------------------------------------------------
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, {
        'Content-Type': 'text/plain; charset=utf-8',
        Allow: 'GET, HEAD'
      });
      res.end('Method not allowed');
      return;
    }

    const isHead = req.method === 'HEAD';
    const decodedPathname = safeDecodeUriSegment(pathname);
    if (decodedPathname === null) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(isHead ? undefined : 'Bad request');
      return;
    }
    const safeRelativePath = path
      .normalize(decodedPathname)
      .replace(/^(\.\.(\/|\\|$))+/, '')
      .replace(/^[/\\]+/, '');
    const candidatePath = path.join(DIST_DIR, safeRelativePath);

    if (
      decodedPathname !== '/' &&
      candidatePath.startsWith(DIST_DIR + path.sep) &&
      fs.existsSync(candidatePath) &&
      fs.statSync(candidatePath).isFile()
    ) {
      const isImmutableAsset = decodedPathname.startsWith('/assets/');
      return serveStaticFile(res, candidatePath, isImmutableAsset, isHead);
    }

    const reqExt = path.extname(decodedPathname).toLowerCase();
    if (decodedPathname.startsWith('/assets/') || STATIC_ASSET_EXTENSIONS.has(reqExt)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(isHead ? undefined : 'Not found');
      return;
    }

    const indexHtmlPath = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      return serveStaticFile(res, indexHtmlPath, false, isHead);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(isHead ? undefined : 'Frontend build not found. Run "npm run build" first.');
  } catch (err) {
    if (err && err.statusCode) {
      if (!res.headersSent) {
        const extraHeaders = err.statusCode === 413 ? { Connection: 'close' } : {};
        sendJson(res, err.statusCode, { error: err.message }, extraHeaders);
      }
      return;
    }
    console.error('Server error:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error' });
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const addr = server.address();
  const actualPort = addr && typeof addr === 'object' ? addr.port : PORT;
  console.log(`🎩 Howard Household Hub listening on http://0.0.0.0:${actualPort}`);
  console.log(
    `💾 Unified SQLite Database: ${HOWARD_DB_PATH} (schema v${CURRENT_SCHEMA_VERSION}, ${activeJournalMode})`
  );
  setTimeout(runDailyBackupSnapshots, 2000).unref?.();
});

let isShuttingDown = false;
const shutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  clearInterval(sseHeartbeatTimer);
  for (const client of sseClients) {
    try {
      client.res.end();
    } catch {
      // ignore close errors
    }
  }
  sseClients.clear();
  const forceTimer = setTimeout(() => {
    server.closeAllConnections?.();
  }, 2500);
  forceTimer.unref?.();
  server.close(() => {
    clearTimeout(forceTimer);
    try {
      howardDb.exec('PRAGMA optimize;');
    } catch {
      // ignore optimize errors
    }
    checkpointDatabase();
    try {
      howardDb.close();
    } catch {
      // ignore close errors
    }
    process.exit(0);
  });
  server.closeIdleConnections?.();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
