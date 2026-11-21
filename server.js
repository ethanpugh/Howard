import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DIST_DIR = path.join(__dirname, 'dist');

const HOWARD_DB_PATH = path.join(DATA_DIR, 'howard.db');
const CADENCE_DB_PATH = path.join(DATA_DIR, 'cadence.db');
const FLOODGATE_DB_PATH = path.join(DATA_DIR, 'floodgate.db');
const BLOOM_DB_PATH = path.join(DATA_DIR, 'bloom.db');

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

function ensureSchemaVersion(dbInstance, targetVersion) {
  try {
    const row = dbInstance.prepare('PRAGMA user_version').get();
    const current = Number(row?.user_version || 0);
    if (current < targetVersion) {
      dbInstance.exec(`PRAGMA user_version = ${targetVersion};`);
    }
  } catch {
    // ignore pragma errors
  }
}

const getLocalDateKey = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ============================================================================
// 1. INITIALIZE FOUR SEPARATE SQLITE DATABASES (DROP-IN COMPATIBLE)
// ============================================================================
const howardDb = new DatabaseSync(HOWARD_DB_PATH);
const cadenceDb = new DatabaseSync(CADENCE_DB_PATH);
const floodgateDb = new DatabaseSync(FLOODGATE_DB_PATH);
const bloomDb = new DatabaseSync(BLOOM_DB_PATH);

const requestedJournal = String(process.env.SQLITE_JOURNAL_MODE || 'WAL').toUpperCase();

for (const dbInstance of [howardDb, cadenceDb, floodgateDb, bloomDb]) {
  dbInstance.exec('PRAGMA busy_timeout = 5000;');
  if (requestedJournal === 'TRUNCATE') {
    dbInstance.exec('PRAGMA journal_mode = TRUNCATE;');
    dbInstance.exec('PRAGMA synchronous = FULL;');
  } else {
    try {
      dbInstance.exec('PRAGMA journal_mode = WAL;');
      dbInstance.exec('PRAGMA synchronous = NORMAL;');
    } catch {
      dbInstance.exec('PRAGMA journal_mode = TRUNCATE;');
      dbInstance.exec('PRAGMA synchronous = FULL;');
    }
  }
}

function checkpointAllDatabases() {
  for (const dbInstance of [howardDb, cadenceDb, floodgateDb, bloomDb]) {
    try {
      dbInstance.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      // ignore checkpoint errors
    }
  }
}

function runDailyBackupSnapshots() {
  try {
    const backupsRoot = path.join(DATA_DIR, 'backups');
    const todayDir = path.join(backupsRoot, getLocalDateKey(new Date()));
    fs.mkdirSync(todayDir, { recursive: true });

    const targets = [
      ['howard.db', howardDb],
      ['cadence.db', cadenceDb],
      ['bloom.db', bloomDb],
      ['floodgate.db', floodgateDb]
    ];

    for (const [filename, dbInstance] of targets) {
      const finalPath = path.join(todayDir, filename);
      if (fs.existsSync(finalPath)) continue;
      const tmpPath = `${finalPath}.tmp`;
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        const escapedTmp = tmpPath.replace(/'/g, "''");
        dbInstance.exec(`VACUUM INTO '${escapedTmp}'`);
        fs.renameSync(tmpPath, finalPath);
      } catch (snapErr) {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          // ignore cleanup failure
        }
        console.warn(`Daily snapshot warning (${filename}):`, snapErr.message || snapErr);
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

// ----------------------------------------------------------------------------
// A. CADENCE DATABASE SCHEMA & DEFAULTS (Pet Medication)
// ----------------------------------------------------------------------------
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
    administrationNote:
      'Give directly by mouth or with a small portion of wet food. Wipe syringe tip clean after each use.'
  };
}

cadenceDb.exec(`
  CREATE TABLE IF NOT EXISTS household_settings (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS medication_logs (
    date_key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const cadenceGetSettingsStmt = cadenceDb.prepare('SELECT data, updated_at FROM household_settings WHERE id = ?');
const cadenceUpsertSettingsStmt = cadenceDb.prepare(`
  INSERT INTO household_settings (id, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const cadenceGetAllLogsStmt = cadenceDb.prepare('SELECT date_key, data, updated_at FROM medication_logs');
const cadenceGetLogByDateStmt = cadenceDb.prepare('SELECT data FROM medication_logs WHERE date_key = ?');
const cadenceUpsertLogStmt = cadenceDb.prepare(`
  INSERT INTO medication_logs (date_key, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(date_key) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const cadenceClearLogsStmt = cadenceDb.prepare('DELETE FROM medication_logs');

if (!cadenceGetSettingsStmt.get('config')) {
  cadenceUpsertSettingsStmt.run('config', JSON.stringify(createDefaultCadenceSettings()), new Date().toISOString());
}

function readCadenceSettings() {
  const defaults = createDefaultCadenceSettings();
  const row = cadenceGetSettingsStmt.get('config');
  if (!row) return { settings: defaults, updatedAt: new Date().toISOString() };
  try {
    const parsed = JSON.parse(row.data);
    return {
      settings: { ...defaults, ...parsed },
      updatedAt: row.updated_at
    };
  } catch {
    return { settings: defaults, updatedAt: row.updated_at };
  }
}

function readCadenceLogs() {
  const rows = cadenceGetAllLogsStmt.all();
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

// ----------------------------------------------------------------------------
// B. FLOODGATE DATABASE SCHEMA & DEFAULTS (Cycle & Symptom Tracker)
// ----------------------------------------------------------------------------
const DEFAULT_FLOODGATE_SETTINGS = {
  ownerName: 'Partner 2',
  appName: 'Floodgate'
};

floodgateDb.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_logs (
    date_key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const floodgateGetSettingsStmt = floodgateDb.prepare('SELECT data, updated_at FROM app_settings WHERE id = ?');
const floodgateUpsertSettingsStmt = floodgateDb.prepare(`
  INSERT INTO app_settings (id, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const floodgateGetAllLogsStmt = floodgateDb.prepare('SELECT date_key, data, updated_at FROM daily_logs');
const floodgateGetLogByDateStmt = floodgateDb.prepare('SELECT data FROM daily_logs WHERE date_key = ?');
const floodgateUpsertLogStmt = floodgateDb.prepare(`
  INSERT INTO daily_logs (date_key, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(date_key) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const floodgateDeleteLogStmt = floodgateDb.prepare('DELETE FROM daily_logs WHERE date_key = ?');
const floodgateClearLogsStmt = floodgateDb.prepare('DELETE FROM daily_logs');

if (!floodgateGetSettingsStmt.get('config')) {
  floodgateUpsertSettingsStmt.run('config', JSON.stringify(DEFAULT_FLOODGATE_SETTINGS), new Date().toISOString());
}

function readFloodgateSettings() {
  const row = floodgateGetSettingsStmt.get('config');
  if (!row) return { settings: { ...DEFAULT_FLOODGATE_SETTINGS }, updatedAt: new Date().toISOString() };
  try {
    const parsed = JSON.parse(row.data);
    return {
      settings: { ...DEFAULT_FLOODGATE_SETTINGS, ...parsed },
      updatedAt: row.updated_at
    };
  } catch {
    return { settings: { ...DEFAULT_FLOODGATE_SETTINGS }, updatedAt: row.updated_at };
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

// ----------------------------------------------------------------------------
// C. BLOOM DATABASE SCHEMA & DEFAULTS (Flower Mantis Growth, Feeding & Habitat)
// ----------------------------------------------------------------------------
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
    careNote:
      'Mist one enclosure wall lightly once daily for drinking droplets—never spray the mantis directly, and let the enclosure dry between mists (Spiny Flower Mantises need cross-ventilation!). Do NOT offer live prey during Premolt Watch or Post-Molt Hardening.'
  };
}

bloomDb.exec(`
  CREATE TABLE IF NOT EXISTS bloom_settings (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS care_logs (
    date_key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS molt_logs (
    id TEXT PRIMARY KEY,
    date_key TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feeder_cultures (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const bloomGetSettingsStmt = bloomDb.prepare('SELECT data, updated_at FROM bloom_settings WHERE id = ?');
const bloomUpsertSettingsStmt = bloomDb.prepare(`
  INSERT INTO bloom_settings (id, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const bloomGetAllLogsStmt = bloomDb.prepare('SELECT date_key, data, updated_at FROM care_logs');
const bloomGetLogByDateStmt = bloomDb.prepare('SELECT data FROM care_logs WHERE date_key = ?');
const bloomUpsertLogStmt = bloomDb.prepare(`
  INSERT INTO care_logs (date_key, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(date_key) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const bloomClearLogsStmt = bloomDb.prepare('DELETE FROM care_logs');
const bloomGetAllMoltsStmt = bloomDb.prepare(
  'SELECT id, date_key, data, updated_at FROM molt_logs ORDER BY date_key DESC, updated_at DESC'
);
const bloomUpsertMoltStmt = bloomDb.prepare(`
  INSERT INTO molt_logs (id, date_key, data, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    date_key = excluded.date_key,
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const bloomDeleteMoltStmt = bloomDb.prepare('DELETE FROM molt_logs WHERE id = ?');
const bloomClearMoltsStmt = bloomDb.prepare('DELETE FROM molt_logs');
const bloomGetAllFeedersStmt = bloomDb.prepare(
  'SELECT id, data, updated_at FROM feeder_cultures ORDER BY updated_at DESC'
);
const bloomUpsertFeederStmt = bloomDb.prepare(`
  INSERT INTO feeder_cultures (id, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const bloomDeleteFeederStmt = bloomDb.prepare('DELETE FROM feeder_cultures WHERE id = ?');
const bloomClearFeedersStmt = bloomDb.prepare('DELETE FROM feeder_cultures');

if (!bloomGetSettingsStmt.get('config')) {
  bloomUpsertSettingsStmt.run('config', JSON.stringify(createDefaultBloomSettings()), new Date().toISOString());
}

function normalizeBloomSettings(parsed = {}) {
  const defaults = createDefaultBloomSettings();
  return {
    ...defaults,
    ...parsed,
    enclosureInfo: {
      ...defaults.enclosureInfo,
      ...(parsed.enclosureInfo && typeof parsed.enclosureInfo === 'object' ? parsed.enclosureInfo : {})
    }
  };
}

function readBloomSettings() {
  const row = bloomGetSettingsStmt.get('config');
  if (!row) return { settings: normalizeBloomSettings(), updatedAt: new Date().toISOString() };
  try {
    const parsed = JSON.parse(row.data);
    return {
      settings: normalizeBloomSettings(parsed),
      updatedAt: row.updated_at
    };
  } catch {
    return { settings: normalizeBloomSettings(), updatedAt: row.updated_at };
  }
}

function readBloomLogs() {
  const rows = bloomGetAllLogsStmt.all();
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

function readBloomMolts() {
  const rows = bloomGetAllMoltsStmt.all();
  const molts = [];
  let latestMoltUpdate = '';
  for (const row of rows) {
    try {
      molts.push({ id: row.id, dateKey: row.date_key, ...JSON.parse(row.data) });
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

// ----------------------------------------------------------------------------
// D. HOWARD DATABASE SCHEMA & DEFAULTS (Profiles, Almanac, Ledger, Beacon)
// ----------------------------------------------------------------------------
howardDb.exec(`
  CREATE TABLE IF NOT EXISTS howard_store (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS almanac_events (
    id TEXT PRIMARY KEY,
    date_key TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ledger_items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const howardGetStmt = howardDb.prepare('SELECT data, updated_at FROM howard_store WHERE key = ?');
const howardUpsertStmt = howardDb.prepare(`
  INSERT INTO howard_store (key, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
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

const ledgerCountStmt = howardDb.prepare('SELECT COUNT(*) AS cnt FROM ledger_items');
const ledgerGetAllStmt = howardDb.prepare(
  'SELECT id, kind, data, updated_at FROM ledger_items ORDER BY updated_at DESC'
);
const ledgerUpsertStmt = howardDb.prepare(`
  INSERT INTO ledger_items (id, kind, data, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    kind = excluded.kind,
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const ledgerDeleteStmt = howardDb.prepare('DELETE FROM ledger_items WHERE id = ?');
const ledgerClearAllStmt = howardDb.prepare('DELETE FROM ledger_items');

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
    { id: 'c-partner1', name: 'Partner 1', role: 'Household Member', phone: '', note: '' },
    { id: 'c-partner2', name: 'Partner 2', role: 'Household Member', phone: '', note: '' }
  ],
  houseGuide: {
    wifiName: '',
    wifiPassword: '',
    binDayInfo: '',
    utilitiesInfo: '',
    emergencyNotes: ''
  }
};

function ensureHowardSeed(key, defaultVal) {
  const existing = howardGetStmt.get(key);
  if (!existing) {
    howardUpsertStmt.run(key, JSON.stringify(defaultVal), new Date().toISOString());
  }
}

ensureHowardSeed('profiles', DEFAULT_PROFILES);
ensureHowardSeed('ledger_settings', { splitRule: '50-50' });
ensureHowardSeed('beacon_info', DEFAULT_BEACON_INFO);

// Non-destructively grant newly introduced household modules to existing saved profiles
function ensureProfileAppAccess(appId, targetProfileIds) {
  const row = howardGetStmt.get('profiles');
  if (!row) return;
  try {
    const parsed = JSON.parse(row.data);
    if (!Array.isArray(parsed)) return;
    let changed = false;
    const migrated = parsed.map((prof) => {
      if (!targetProfileIds.includes(prof.id)) return prof;
      const currentApps = Array.isArray(prof.allowedApps)
        ? [...prof.allowedApps]
        : ['foyer', 'cadence', 'beacon'];
      if (currentApps.includes(appId)) return prof;
      changed = true;
      const cadenceIdx = currentApps.indexOf('cadence');
      if (cadenceIdx !== -1) {
        currentApps.splice(cadenceIdx + 1, 0, appId);
      } else {
        currentApps.push(appId);
      }
      return { ...prof, allowedApps: currentApps };
    });
    if (changed) {
      howardUpsertStmt.run('profiles', JSON.stringify(migrated), new Date().toISOString());
    }
  } catch {
    // ignore malformed profile JSON
  }
}

ensureProfileAppAccess('bloom', ['partner1', 'partner2', 'caregiver']);

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

function normalizeBeaconInfo(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    petCare: {
      ...DEFAULT_BEACON_INFO.petCare,
      ...(src.petCare && typeof src.petCare === 'object' ? src.petCare : {})
    },
    vetInfo: {
      ...DEFAULT_BEACON_INFO.vetInfo,
      ...(src.vetInfo && typeof src.vetInfo === 'object' ? src.vetInfo : {})
    },
    contacts: Array.isArray(src.contacts)
      ? src.contacts
      : DEFAULT_BEACON_INFO.contacts.map((c) => ({ ...c })),
    houseGuide: {
      ...DEFAULT_BEACON_INFO.houseGuide,
      ...(src.houseGuide && typeof src.houseGuide === 'object' ? src.houseGuide : {})
    }
  };
}

function mergeBeaconInfo(current, incoming) {
  const base = normalizeBeaconInfo(current);
  if (!isPlainObject(incoming)) return base;
  return {
    petCare: {
      ...base.petCare,
      ...(isPlainObject(incoming.petCare) ? incoming.petCare : {})
    },
    vetInfo: {
      ...base.vetInfo,
      ...(isPlainObject(incoming.vetInfo) ? incoming.vetInfo : {})
    },
    contacts: Array.isArray(incoming.contacts) ? incoming.contacts : base.contacts,
    houseGuide: {
      ...base.houseGuide,
      ...(isPlainObject(incoming.houseGuide) ? incoming.houseGuide : {})
    }
  };
}

// Non-destructively migrate any existing legacy JSON blobs in howard_store into row-level tables on boot
function migrateLegacyHowardBlobsIfNeeded() {
  if (howardGetStmt.get('migration_v2_row_tables')) return;
  const nowIso = new Date().toISOString();
  const fallbackDate = getLocalDateKey(new Date());
  let migrationOk = true;

  // 1. Migrate legacy almanac_events JSON array if table is currently empty
  const existingEvtCount = Number(almanacCountStmt.get()?.cnt || 0);
  if (existingEvtCount === 0) {
    const legacyEventsObj = readHowardKey('almanac_events', []);
    if (Array.isArray(legacyEventsObj.data) && legacyEventsObj.data.length > 0) {
      try {
        runInTransaction(howardDb, () => {
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
        });
      } catch (err) {
        migrationOk = false;
        console.error('Almanac table migration error:', err);
      }
    }
  }

  // 2. Migrate legacy ledger_data JSON object if ledger_items table is currently empty
  const legacyLedgerRow = howardGetStmt.get('ledger_data');
  if (legacyLedgerRow) {
    const legacyLedgerObj = readHowardKey('ledger_data', DEFAULT_LEDGER_DATA);
    const normalized = normalizeLedgerData(legacyLedgerObj.data);

    const existingLedgerCount = Number(ledgerCountStmt.get()?.cnt || 0);
    if (existingLedgerCount === 0) {
      try {
        runInTransaction(howardDb, () => {
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
        });
      } catch (err) {
        migrationOk = false;
        console.error('Ledger table migration error:', err);
      }
    }
  }

  if (migrationOk) {
    howardUpsertStmt.run(
      'migration_v2_row_tables',
      JSON.stringify({ migratedAt: nowIso }),
      nowIso
    );
  }
}

migrateLegacyHowardBlobsIfNeeded();
ensureSchemaVersion(cadenceDb, 1);
ensureSchemaVersion(floodgateDb, 1);
ensureSchemaVersion(bloomDb, 1);
ensureSchemaVersion(howardDb, 2);
runDailyBackupSnapshots();
setInterval(runDailyBackupSnapshots, 6 * 3600 * 1000).unref?.();

function readAlmanacEventsFromTable() {
  const rows = almanacGetAllStmt.all();
  const events = [];
  let updatedAt = '';
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.data);
      events.push({ ...parsed, id: row.id, date: parsed.date || row.date_key });
      if (row.updated_at > updatedAt) updatedAt = row.updated_at;
    } catch {
      // skip malformed row
    }
  }
  return { events, updatedAt };
}

function replaceAllAlmanacEventsInTable(
  events,
  nowIso = new Date().toISOString(),
  { clearExisting = true } = {}
) {
  const fallbackDate = getLocalDateKey(new Date());
  runInTransaction(howardDb, () => {
    if (clearExisting) {
      almanacClearAllStmt.run();
    }
    (Array.isArray(events) ? events : []).forEach((evt, idx) => {
      if (!isPlainObject(evt)) return;
      const id = String(evt.id || `evt-${Date.now()}-${idx}`);
      const dateKey =
        typeof evt.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(evt.date)
          ? evt.date
          : fallbackDate;
      const updatedAt = typeof evt.updatedAt === 'string' ? evt.updatedAt : nowIso;
      almanacUpsertStmt.run(id, dateKey, JSON.stringify({ ...evt, id, date: dateKey }), updatedAt);
    });
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
  recurring.reverse();

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

function replaceAllLedgerDataInTable(
  rawLedger,
  nowIso = new Date().toISOString(),
  { clearExisting = true } = {}
) {
  const normalized = normalizeLedgerData(rawLedger);
  const hasExplicitSplitRule =
    isPlainObject(rawLedger) &&
    (rawLedger.splitRule === '50-50' || rawLedger.splitRule === 'proportional');
  runInTransaction(howardDb, () => {
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
  });
  return { ledgerData: normalized, updatedAt: nowIso };
}

function readHowardState() {
  const profilesObj = readHowardKey('profiles', DEFAULT_PROFILES);
  const eventsObj = readAlmanacEventsFromTable();
  const ledgerObj = readLedgerDataFromTable();
  const beaconObj = readHowardKey('beacon_info', DEFAULT_BEACON_INFO);

  const latest = [
    profilesObj.updatedAt,
    eventsObj.updatedAt,
    ledgerObj.updatedAt,
    beaconObj.updatedAt
  ]
    .filter(Boolean)
    .sort()
    .pop() || new Date().toISOString();

  return {
    profiles: sanitizeProfilesForClient(profilesObj.data),
    almanacEvents: eventsObj.events,
    ledgerData: ledgerObj.ledgerData,
    beaconInfo: normalizeBeaconInfo(beaconObj.data),
    updatedAt: latest
  };
}

// ============================================================================
// IN-MEMORY DOMAIN CACHE & INCREMENTAL SYNC TOKEN
// ============================================================================
const SERVER_BOOT_ID = Date.now().toString(36);
let revisionCounter = 1;
let cacheHoward = null;
let cacheCadence = null;
let cacheBloom = null;
let cacheFloodgate = null;

function bumpRevision(domain = 'all') {
  revisionCounter += 1;
  if (domain === 'howard' || domain === 'all') cacheHoward = null;
  if (domain === 'cadence' || domain === 'all') cacheCadence = null;
  if (domain === 'bloom' || domain === 'all') cacheBloom = null;
  if (domain === 'floodgate' || domain === 'all') cacheFloodgate = null;
}

function getSyncTokenForProfile(profileId) {
  return `${SERVER_BOOT_ID}:${profileId || 'caregiver'}:${revisionCounter}`;
}

function getCachedHowardState() {
  if (!cacheHoward) cacheHoward = readHowardState();
  return cacheHoward;
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
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
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
    // 1. UNIFIED HOWARD SYNC ENDPOINT (Incremental syncToken + In-Memory Cache)
    // ------------------------------------------------------------------------
    if (pathname === '/api/howard/sync' && req.method === 'GET') {
      const activeProfile = parsedUrl.searchParams.get('profile') || 'caregiver';
      const clientSince = parsedUrl.searchParams.get('since') || '';
      const syncToken = getSyncTokenForProfile(activeProfile);

      if (clientSince && clientSince === syncToken) {
        return sendJson(res, 200, {
          unchanged: true,
          syncToken
        });
      }

      const howardState = getCachedHowardState();
      const cadence = getCachedCadenceState();
      const bloom = getCachedBloomState();
      const floodgate = activeProfile === 'partner2' ? getCachedFloodgateState() : null;

      return sendJson(res, 200, {
        unchanged: false,
        syncToken,
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
      bumpRevision('howard');
      return sendJson(res, 200, { profiles: sanitizeProfilesForClient(profiles) });
    }

    // Update a profile's display name (and sync to Almanac, Cadence/Bloom caregivers, Beacon contacts + Floodgate ownerName)
    if (pathname === '/api/howard/profiles/name' && req.method === 'PUT') {
      const { profileId, name } = await parseJsonBody(req);
      const cleanedName = String(name || '').trim();
      if (!cleanedName) {
        return sendJson(res, 400, { error: 'Name cannot be empty' });
      }
      const lowerCleaned = cleanedName.toLowerCase();
      if (lowerCleaned === 'both' || lowerCleaned === 'pets') {
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

      const oldName = profiles[idx].name;
      const nowIso = new Date().toISOString();
      profiles[idx] = {
        ...profiles[idx],
        name: cleanedName,
        caregiverName: cleanedName
      };

      let anyDbTouched = false;
      try {
        runInTransaction(howardDb, () => {
          howardUpsertStmt.run('profiles', JSON.stringify(profiles), nowIso);

          if (profileId === 'partner1' || profileId === 'partner2') {
            const { data: rawBeacon } = readHowardKey('beacon_info', DEFAULT_BEACON_INFO);
            const beaconData = normalizeBeaconInfo(rawBeacon);
            let beaconChanged = false;
            const targetContactId = `c-${profileId}`;
            const nextContacts = beaconData.contacts.map((c) => {
              if (c && c.id === targetContactId && c.name !== cleanedName) {
                beaconChanged = true;
                return { ...c, name: cleanedName };
              }
              return c;
            });
            if (beaconChanged) {
              howardUpsertStmt.run(
                'beacon_info',
                JSON.stringify({ ...beaconData, contacts: nextContacts }),
                nowIso
              );
            }
          }

          const allEventRows = almanacGetAllStmt.all();
          for (const row of allEventRows) {
            let evt;
            try {
              evt = JSON.parse(row.data);
            } catch {
              continue;
            }
            if (!isPlainObject(evt)) continue;
            if (evt.assignedTo === oldName || evt.assignedToProfileId === profileId) {
              const updatedEvt = {
                ...evt,
                id: row.id,
                date: evt.date || row.date_key,
                assignedTo: cleanedName,
                assignedToProfileId: profileId,
                updatedAt: nowIso
              };
              almanacUpsertStmt.run(row.id, updatedEvt.date, JSON.stringify(updatedEvt), nowIso);
            }
          }
        });
        anyDbTouched = true;

        // Sync updated caregiver names into Cadence settings
        const { settings: cadSettings } = readCadenceSettings();
        const nextCaregivers = Array.isArray(cadSettings.caregivers)
          ? cadSettings.caregivers.map((c) => (c === oldName ? cleanedName : c))
          : profiles.map((p) => p.name);
        cadenceUpsertSettingsStmt.run(
          'config',
          JSON.stringify({ ...cadSettings, caregivers: nextCaregivers }),
          nowIso
        );
        anyDbTouched = true;

        // Sync updated caregiver names into Bloom settings
        const { settings: blSettings } = readBloomSettings();
        const nextBloomCaregivers = Array.isArray(blSettings.caregivers)
          ? blSettings.caregivers.map((c) => (c === oldName ? cleanedName : c))
          : profiles.map((p) => p.name);
        bloomUpsertSettingsStmt.run(
          'config',
          JSON.stringify({ ...blSettings, caregivers: nextBloomCaregivers }),
          nowIso
        );
        anyDbTouched = true;

        // If renaming Partner 2, also update Floodgate ownerName
        if (profileId === 'partner2') {
          const { settings: fgSettings } = readFloodgateSettings();
          floodgateUpsertSettingsStmt.run(
            'config',
            JSON.stringify({ ...fgSettings, ownerName: cleanedName }),
            nowIso
          );
          anyDbTouched = true;
        }
      } finally {
        if (anyDbTouched) bumpRevision('all');
      }

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
      const fallbackDate = getLocalDateKey(new Date());

      runInTransaction(howardDb, () => {
        for (const id of deleteIds) {
          if (id) almanacDeleteStmt.run(String(id));
        }
        for (const evt of upserts) {
          if (!isPlainObject(evt) || !evt.id) continue;
          const id = String(evt.id);
          const dateKey =
            typeof evt.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(evt.date)
              ? evt.date
              : fallbackDate;
          almanacUpsertStmt.run(
            id,
            dateKey,
            JSON.stringify({ ...evt, id, date: dateKey, updatedAt: nowIso }),
            nowIso
          );
        }
      });

      bumpRevision('howard');
      const { almanacEvents } = getCachedHowardState();
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
        const dateKey =
          typeof evt.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(evt.date)
            ? evt.date
            : getLocalDateKey(new Date());
        const record = { ...evt, id: eventId, date: dateKey, updatedAt: nowIso };
        almanacUpsertStmt.run(eventId, dateKey, JSON.stringify(record), nowIso);
        bumpRevision('howard');
        return sendJson(res, 200, { event: record, updatedAt: nowIso });
      }

      if (req.method === 'DELETE') {
        almanacDeleteStmt.run(eventId);
        bumpRevision('howard');
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
      bumpRevision('howard');
      return sendJson(res, 200, { almanacEvents: getCachedHowardState().almanacEvents, updatedAt });
    }

    // Ledger Bookkeeping — Split Rule Settings Update
    if (pathname === '/api/howard/ledger/settings' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const splitRule = incoming.splitRule === 'proportional' ? 'proportional' : '50-50';
      const updatedAt = writeHowardKey('ledger_settings', { splitRule });
      bumpRevision('howard');
      return sendJson(res, 200, { splitRule, updatedAt });
    }

    // Ledger Bookkeeping — Single Row Item Upsert / Delete ('expense' | 'recurring' | 'income')
    if (pathname.startsWith('/api/howard/ledger/items/')) {
      const itemId = safeDecodeUriSegment(pathname.slice('/api/howard/ledger/items/'.length));
      if (!itemId) return sendJson(res, 400, { error: 'Invalid or missing ledger item ID' });
      const nowIso = new Date().toISOString();

      if (req.method === 'PUT') {
        const incoming = await parseJsonBody(req);
        const validKinds = ['expense', 'recurring', 'income'];
        const kind = validKinds.includes(incoming.kind) ? incoming.kind : 'expense';
        const rawItem = incoming.item || incoming;
        const record = { ...rawItem, id: itemId, updatedAt: nowIso };
        ledgerUpsertStmt.run(itemId, kind, JSON.stringify(record), nowIso);
        bumpRevision('howard');
        return sendJson(res, 200, { id: itemId, kind, item: record, updatedAt: nowIso });
      }

      if (req.method === 'DELETE') {
        ledgerDeleteStmt.run(itemId);
        bumpRevision('howard');
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
      bumpRevision('howard');
      return sendJson(res, 200, { ledgerData: normalized, updatedAt });
    }

    // Beacon Emergency & House Guide CRUD
    if (pathname === '/api/howard/beacon' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const patch = isPlainObject(incoming.beaconInfo) ? incoming.beaconInfo : incoming;
      const { data: current } = readHowardKey('beacon_info', DEFAULT_BEACON_INFO);
      const updated = mergeBeaconInfo(current, patch);
      const updatedAt = writeHowardKey('beacon_info', updated);
      bumpRevision('howard');
      return sendJson(res, 200, { beaconInfo: updated, updatedAt });
    }

    // Full Household Backup Export (Checkpoints WAL files first for clean .db state)
    if (pathname === '/api/howard/backup' && req.method === 'GET') {
      checkpointAllDatabases();
      const includeFloodgate = parsedUrl.searchParams.get('includeFloodgate') === '1';
      const howardState = getCachedHowardState();
      const cadenceState = getCachedCadenceState();
      const bloomState = getCachedBloomState();

      const payload = {
        app: 'Howard',
        version: '1.1.0',
        exportedAt: new Date().toISOString(),
        howard: {
          almanacEvents: howardState.almanacEvents,
          ledgerData: howardState.ledgerData,
          beaconInfo: howardState.beaconInfo
        },
        cadence: {
          settings: cadenceState.settings,
          logsByDate: cadenceState.logsByDate
        },
        bloom: {
          settings: bloomState.settings,
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

    // Full Household Backup Restore (100% Compatible with v1.0 & v1.1 Backup Bundles)
    if (pathname === '/api/howard/restore' && req.method === 'POST') {
      const incoming = await parseJsonBody(req);
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

      // Pre-validate & normalize all payloads before touching any DB
      const howardPlan = hasHoward
        ? {
            events: Array.isArray(incoming.howard.almanacEvents)
              ? incoming.howard.almanacEvents
                  .filter((evt) => isPlainObject(evt))
                  .map((evt, idx) => {
                    const id = String(evt.id || `evt-${Date.now()}-${idx}`);
                    const dateKey =
                      typeof evt.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(evt.date)
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
                  .filter(([dk, rec]) => /^\d{4}-\d{2}-\d{2}$/.test(dk) && isPlainObject(rec))
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
                  .filter(([dk, rec]) => /^\d{4}-\d{2}-\d{2}$/.test(dk) && isPlainObject(rec))
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
                      /^\d{4}-\d{2}-\d{2}$/.test(m.dateKey)
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
                  .filter(([dk, rec]) => /^\d{4}-\d{2}-\d{2}$/.test(dk) && isPlainObject(rec))
                  .map(([dk, rec]) => ({
                    dateKey: dk,
                    record: { ...rec, date: dk },
                    updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : nowIso
                  }))
              : null
          }
        : null;

      let anyDbTouched = false;
      try {
        if (howardPlan && (howardPlan.events || howardPlan.ledger || howardPlan.beacon)) {
          runInTransaction(howardDb, () => {
            if (howardPlan.events) {
              if (!isMerge) almanacClearAllStmt.run();
              for (const item of howardPlan.events) {
                almanacUpsertStmt.run(
                  item.id,
                  item.dateKey,
                  JSON.stringify(item.record),
                  item.updatedAt
                );
              }
            }
            if (howardPlan.ledger) {
              const { normalized, hasExplicitSplitRule } = howardPlan.ledger;
              if (!isMerge || hasExplicitSplitRule) {
                howardUpsertStmt.run(
                  'ledger_settings',
                  JSON.stringify({ splitRule: normalized.splitRule }),
                  nowIso
                );
              }
              if (!isMerge) ledgerClearAllStmt.run();
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
            }
            if (howardPlan.beacon) {
              const nextBeacon = isMerge
                ? mergeBeaconInfo(
                    readHowardKey('beacon_info', DEFAULT_BEACON_INFO).data,
                    howardPlan.beacon
                  )
                : normalizeBeaconInfo(howardPlan.beacon);
              howardUpsertStmt.run('beacon_info', JSON.stringify(nextBeacon), nowIso);
            }
          });
          anyDbTouched = true;
        }

        if (cadencePlan && (cadencePlan.settings || cadencePlan.logs)) {
          runInTransaction(cadenceDb, () => {
            if (cadencePlan.settings) {
              const base = isMerge
                ? readCadenceSettings().settings
                : createDefaultCadenceSettings();
              const merged = { ...createDefaultCadenceSettings(), ...base, ...cadencePlan.settings };
              cadenceUpsertSettingsStmt.run('config', JSON.stringify(merged), nowIso);
            }
            if (cadencePlan.logs) {
              if (!isMerge) cadenceClearLogsStmt.run();
              for (const item of cadencePlan.logs) {
                cadenceUpsertLogStmt.run(
                  item.dateKey,
                  JSON.stringify(item.record),
                  item.updatedAt
                );
              }
            }
          });
          anyDbTouched = true;
        }

        if (
          bloomPlan &&
          (bloomPlan.settings || bloomPlan.logs || bloomPlan.molts || bloomPlan.feeders)
        ) {
          runInTransaction(bloomDb, () => {
            if (bloomPlan.settings) {
              const merged = isMerge
                ? (() => {
                    const current = readBloomSettings().settings;
                    return normalizeBloomSettings({
                      ...current,
                      ...bloomPlan.settings,
                      enclosureInfo: {
                        ...current.enclosureInfo,
                        ...(isPlainObject(bloomPlan.settings.enclosureInfo)
                          ? bloomPlan.settings.enclosureInfo
                          : {})
                      }
                    });
                  })()
                : normalizeBloomSettings(bloomPlan.settings);
              bloomUpsertSettingsStmt.run('config', JSON.stringify(merged), nowIso);
            }
            if (bloomPlan.logs) {
              if (!isMerge) bloomClearLogsStmt.run();
              for (const item of bloomPlan.logs) {
                bloomUpsertLogStmt.run(item.dateKey, JSON.stringify(item.record), item.updatedAt);
              }
            }
            if (bloomPlan.molts) {
              if (!isMerge) bloomClearMoltsStmt.run();
              for (const m of bloomPlan.molts) {
                bloomUpsertMoltStmt.run(m.id, m.dateKey, JSON.stringify(m.record), m.updatedAt);
              }
            }
            if (bloomPlan.feeders) {
              if (!isMerge) bloomClearFeedersStmt.run();
              for (const f of bloomPlan.feeders) {
                bloomUpsertFeederStmt.run(f.id, JSON.stringify(f.record), f.updatedAt);
              }
            }
          });
          anyDbTouched = true;
        }

        if (floodgatePlan && (floodgatePlan.settings || floodgatePlan.logs)) {
          runInTransaction(floodgateDb, () => {
            if (floodgatePlan.settings) {
              const base = isMerge
                ? readFloodgateSettings().settings
                : DEFAULT_FLOODGATE_SETTINGS;
              const merged = { ...DEFAULT_FLOODGATE_SETTINGS, ...base, ...floodgatePlan.settings };
              floodgateUpsertSettingsStmt.run('config', JSON.stringify(merged), nowIso);
            }
            if (floodgatePlan.logs) {
              if (!isMerge) floodgateClearLogsStmt.run();
              for (const item of floodgatePlan.logs) {
                floodgateUpsertLogStmt.run(
                  item.dateKey,
                  JSON.stringify(item.record),
                  item.updatedAt
                );
              }
            }
          });
          anyDbTouched = true;
        }
      } finally {
        if (anyDbTouched) bumpRevision('all');
      }

      return sendJson(res, 200, { restored: true, mode: isMerge ? 'merge' : 'replace', updatedAt: nowIso });
    }

    // ------------------------------------------------------------------------
    // 2. CADENCE API ROUTES (/api/cadence/*)
    // ------------------------------------------------------------------------
    if (pathname === '/api/cadence/state' && req.method === 'GET') {
      return sendJson(res, 200, getCachedCadenceState());
    }

    if (pathname === '/api/cadence/settings' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const { settings: currentSettings } = readCadenceSettings();
      const nowIso = new Date().toISOString();
      const updatedSettings = {
        ...createDefaultCadenceSettings(),
        ...currentSettings,
        ...incoming
      };
      cadenceUpsertSettingsStmt.run('config', JSON.stringify(updatedSettings), nowIso);
      bumpRevision('cadence');
      return sendJson(res, 200, { settings: updatedSettings, updatedAt: nowIso });
    }

    if (pathname.startsWith('/api/cadence/logs/') && req.method === 'PUT') {
      const dateKey = safeDecodeUriSegment(pathname.slice('/api/cadence/logs/'.length));
      if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      }
      const incoming = await parseJsonBody(req);
      const nowIso = new Date().toISOString();

      const updatedRecord = runInTransaction(cadenceDb, () => {
        const existingRow = cadenceGetLogByDateStmt.get(dateKey);
        let currentRecord = { dateKey };
        if (existingRow) {
          try {
            currentRecord = { dateKey, ...JSON.parse(existingRow.data) };
          } catch {
            currentRecord = { dateKey };
          }
        }
        const nextRecord = {
          ...currentRecord,
          ...incoming,
          dateKey,
          updatedAt: typeof incoming.updatedAt === 'string' ? incoming.updatedAt : nowIso
        };
        cadenceUpsertLogStmt.run(dateKey, JSON.stringify(nextRecord), nextRecord.updatedAt);
        return nextRecord;
      });

      bumpRevision('cadence');
      return sendJson(res, 200, { dateKey, record: updatedRecord });
    }

    // ------------------------------------------------------------------------
    // 3. FLOODGATE API ROUTES (/api/floodgate/*)
    // ------------------------------------------------------------------------
    if (pathname === '/api/floodgate/state' && req.method === 'GET') {
      return sendJson(res, 200, getCachedFloodgateState());
    }

    if (pathname === '/api/floodgate/settings' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const { settings: currentSettings } = readFloodgateSettings();
      const nowIso = new Date().toISOString();
      const updatedSettings = {
        ...DEFAULT_FLOODGATE_SETTINGS,
        ...currentSettings,
        ...incoming
      };
      floodgateUpsertSettingsStmt.run('config', JSON.stringify(updatedSettings), nowIso);
      bumpRevision('floodgate');
      return sendJson(res, 200, { settings: updatedSettings, updatedAt: nowIso });
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

      const upsertedCount = runInTransaction(floodgateDb, () => {
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

      const updatedRecord = runInTransaction(floodgateDb, () => {
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
      const { settings: currentSettings } = readBloomSettings();
      const nowIso = new Date().toISOString();
      const updatedSettings = normalizeBloomSettings({
        ...currentSettings,
        ...incoming,
        enclosureInfo: {
          ...currentSettings.enclosureInfo,
          ...(incoming.enclosureInfo && typeof incoming.enclosureInfo === 'object'
            ? incoming.enclosureInfo
            : {})
        }
      });
      bloomUpsertSettingsStmt.run('config', JSON.stringify(updatedSettings), nowIso);
      bumpRevision('bloom');
      return sendJson(res, 200, { settings: updatedSettings, updatedAt: nowIso });
    }

    if (pathname.startsWith('/api/bloom/logs/') && req.method === 'PUT') {
      const dateKey = safeDecodeUriSegment(pathname.slice('/api/bloom/logs/'.length));
      if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      }
      const incoming = await parseJsonBody(req);
      const { settingsPatch, ...logPayload } = incoming || {};
      const nowIso = new Date().toISOString();

      const { updatedRecord, updatedSettings } = runInTransaction(bloomDb, () => {
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
        bloomUpsertLogStmt.run(dateKey, JSON.stringify(nextRecord), nextRecord.updatedAt);

        let nextSettings = null;
        if (isPlainObject(settingsPatch)) {
          const { settings: currentSettings } = readBloomSettings();
          nextSettings = normalizeBloomSettings({
            ...currentSettings,
            ...settingsPatch,
            enclosureInfo: {
              ...currentSettings.enclosureInfo,
              ...(isPlainObject(settingsPatch.enclosureInfo) ? settingsPatch.enclosureInfo : {})
            }
          });
          bloomUpsertSettingsStmt.run('config', JSON.stringify(nextSettings), nowIso);
        }

        return { updatedRecord: nextRecord, updatedSettings: nextSettings };
      });

      bumpRevision('bloom');
      return sendJson(res, 200, {
        dateKey,
        record: updatedRecord,
        ...(updatedSettings ? { settings: updatedSettings } : {})
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

      const moltRecord = {
        id: moltId,
        dateKey,
        timestamp: incoming.timestamp || nowIso,
        fromInstar: incoming.fromInstar || 'L2',
        toInstar: incoming.toInstar || 'L3',
        lengthMm: validLengthMm,
        colorShift: String(incoming.colorShift || '').trim(),
        quality: incoming.quality || 'clean',
        loggedBy: incoming.loggedBy || 'Household',
        note: String(incoming.note || '').trim(),
        updatedAt: nowIso
      };

      const currentSettings = runInTransaction(bloomDb, () => {
        bloomUpsertMoltStmt.run(moltId, dateKey, JSON.stringify(moltRecord), nowIso);

        let { settings: nextSettings } = readBloomSettings();
        if (incoming.advanceInstar !== false) {
          const parsedHard = Number(nextSettings.hardeningHours);
          const hardHours = Number.isFinite(parsedHard) && parsedHard >= 0 ? parsedHard : 36;
          const startHardening = incoming.startHardening !== false && hardHours > 0;
          const hardeningUntilIso = startHardening
            ? new Date(Date.now() + hardHours * 3600000).toISOString()
            : null;

          nextSettings = normalizeBloomSettings({
            ...nextSettings,
            currentInstar: moltRecord.toInstar || nextSettings.currentInstar,
            ...(moltRecord.colorShift ? { currentColorMorph: moltRecord.colorShift } : {}),
            lifecycleStatus: startHardening ? 'hardening' : 'normal',
            premoltStartedAt: null,
            hardeningUntil: hardeningUntilIso,
            enclosureInfo: {
              ...nextSettings.enclosureInfo,
              ...(moltRecord.lengthMm ? { currentBodyLengthMm: moltRecord.lengthMm } : {})
            }
          });
          bloomUpsertSettingsStmt.run('config', JSON.stringify(nextSettings), nowIso);
        }
        return nextSettings;
      });

      bumpRevision('bloom');
      const { molts } = getCachedBloomState();
      return sendJson(res, 200, { molt: moltRecord, molts, settings: currentSettings, updatedAt: nowIso });
    }

    if (pathname.startsWith('/api/bloom/molts/') && req.method === 'DELETE') {
      const moltId = safeDecodeUriSegment(pathname.slice('/api/bloom/molts/'.length));
      if (!moltId) return sendJson(res, 400, { error: 'Invalid or missing molt ID' });
      bloomDeleteMoltStmt.run(moltId);
      bumpRevision('bloom');
      const { molts } = getCachedBloomState();
      return sendJson(res, 200, { deleted: true, id: moltId, molts });
    }

    if (pathname.startsWith('/api/bloom/feeders/') && req.method === 'PUT') {
      const feederId = safeDecodeUriSegment(pathname.slice('/api/bloom/feeders/'.length));
      if (!feederId) return sendJson(res, 400, { error: 'Invalid or missing feeder ID' });
      const incoming = await parseJsonBody(req);
      const nowIso = new Date().toISOString();
      const feederRecord = {
        id: feederId,
        name: String(incoming.name || 'Feeder Culture').trim(),
        feederType: incoming.feederType || 'hydei',
        startedDate:
          incoming.startedDate && /^\d{4}-\d{2}-\d{2}$/.test(incoming.startedDate)
            ? incoming.startedDate
            : getLocalDateKey(new Date()),
        shelfLifeDays: Number(incoming.shelfLifeDays) || 28,
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
  console.log(`🎩 Howard Household Hub listening on http://0.0.0.0:${PORT}`);
  console.log(`💾 Databases:`);
  console.log(`   • Howard:    ${HOWARD_DB_PATH}`);
  console.log(`   • Cadence:   ${CADENCE_DB_PATH}`);
  console.log(`   • Bloom:     ${BLOOM_DB_PATH}`);
  console.log(`   • Floodgate: ${FLOODGATE_DB_PATH}`);
});

let isShuttingDown = false;
const shutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  const forceTimer = setTimeout(() => {
    server.closeAllConnections?.();
  }, 2500);
  forceTimer.unref?.();
  server.close(() => {
    clearTimeout(forceTimer);
    checkpointAllDatabases();
    for (const dbInstance of [howardDb, cadenceDb, floodgateDb, bloomDb]) {
      try {
        dbInstance.close();
      } catch {
        // ignore close errors
      }
    }
    process.exit(0);
  });
  server.closeIdleConnections?.();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
