import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 80;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DIST_DIR = path.join(__dirname, 'dist');

const HOWARD_DB_PATH = path.join(DATA_DIR, 'howard.db');
const CADENCE_DB_PATH = path.join(DATA_DIR, 'cadence.db');
const FLOODGATE_DB_PATH = path.join(DATA_DIR, 'floodgate.db');
const BLOOM_DB_PATH = path.join(DATA_DIR, 'bloom.db');

// Ensure persistent data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

const getLocalDateKey = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDateKey = (dateKey, deltaDays) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateKey(dt);
};

// ============================================================================
// 1. INITIALIZE FOUR SEPARATE SQLITE DATABASES (DROP-IN COMPATIBLE)
// ============================================================================
const howardDb = new DatabaseSync(HOWARD_DB_PATH);
const cadenceDb = new DatabaseSync(CADENCE_DB_PATH);
const floodgateDb = new DatabaseSync(FLOODGATE_DB_PATH);
const bloomDb = new DatabaseSync(BLOOM_DB_PATH);

for (const dbInstance of [howardDb, cadenceDb, floodgateDb, bloomDb]) {
  dbInstance.exec('PRAGMA journal_mode = DELETE;');
  dbInstance.exec('PRAGMA synchronous = NORMAL;');
}

// ----------------------------------------------------------------------------
// A. CADENCE DATABASE SCHEMA & DEFAULTS (Pet Medication)
// ----------------------------------------------------------------------------
const DEFAULT_CADENCE_SETTINGS = {
  catName: 'Pet',
  medicationName: 'Oral Solution',
  dosageLabel: '2.5 mg / 0.5 ml',
  morningTargetTime: '08:00',
  eveningTargetTime: '20:00',
  bottleOpenedDate: getLocalDateKey(new Date()),
  bottleShelfLifeDays: 180,
  caregivers: ['Partner 1', 'Partner 2', 'Caregiver'],
  administrationNote:
    'Give directly by mouth or with a small portion of wet food. Wipe syringe tip clean after each use.'
};

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

if (!cadenceGetSettingsStmt.get('config')) {
  cadenceUpsertSettingsStmt.run('config', JSON.stringify(DEFAULT_CADENCE_SETTINGS), new Date().toISOString());
}

function readCadenceSettings() {
  const row = cadenceGetSettingsStmt.get('config');
  if (!row) return { settings: { ...DEFAULT_CADENCE_SETTINGS }, updatedAt: new Date().toISOString() };
  try {
    const parsed = JSON.parse(row.data);
    return {
      settings: { ...DEFAULT_CADENCE_SETTINGS, ...parsed },
      updatedAt: row.updated_at
    };
  } catch {
    return { settings: { ...DEFAULT_CADENCE_SETTINGS }, updatedAt: row.updated_at };
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
const DEFAULT_BLOOM_SETTINGS = {
  mantisName: 'Mantis',
  speciesPreset: 'spiny_flower',
  commonName: 'Spiny Flower Mantis',
  scientificName: 'Pseudocreobotra wahlbergii',
  sex: 'Male',
  pronouns: 'he/him',
  currentInstar: 'L2',
  arrivalDate: getLocalDateKey(new Date()),
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
    lastDeepCleanDate: getLocalDateKey(new Date()),
    currentBodyLengthMm: 10,
    enclosureHeightMm: 110,
    enclosureWidthMm: 75
  },
  caregivers: ['Partner 1', 'Partner 2', 'Caregiver'],
  careNote:
    'Mist one enclosure wall lightly once daily for drinking droplets—never spray the mantis directly, and let the enclosure dry between mists (Spiny Flower Mantises need cross-ventilation!). Do NOT offer live prey during Premolt Watch or Post-Molt Hardening.'
};

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

if (!bloomGetSettingsStmt.get('config')) {
  bloomUpsertSettingsStmt.run('config', JSON.stringify(DEFAULT_BLOOM_SETTINGS), new Date().toISOString());
}

function normalizeBloomSettings(parsed = {}) {
  return {
    ...DEFAULT_BLOOM_SETTINGS,
    ...parsed,
    enclosureInfo: {
      ...DEFAULT_BLOOM_SETTINGS.enclosureInfo,
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
`);

const howardGetStmt = howardDb.prepare('SELECT data, updated_at FROM howard_store WHERE key = ?');
const howardUpsertStmt = howardDb.prepare(`
  INSERT INTO howard_store (key, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at
`);

const todayStr = getLocalDateKey(new Date());

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

const DEFAULT_ALMANAC_EVENTS = [];

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
ensureHowardSeed('almanac_events', DEFAULT_ALMANAC_EVENTS);
ensureHowardSeed('ledger_data', DEFAULT_LEDGER_DATA);
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

function readHowardState() {
  const profilesObj = readHowardKey('profiles', DEFAULT_PROFILES);
  const eventsObj = readHowardKey('almanac_events', DEFAULT_ALMANAC_EVENTS);
  const ledgerObj = readHowardKey('ledger_data', DEFAULT_LEDGER_DATA);
  const beaconObj = readHowardKey('beacon_info', DEFAULT_BEACON_INFO);

  const latest = [
    profilesObj.updatedAt,
    eventsObj.updatedAt,
    ledgerObj.updatedAt,
    beaconObj.updatedAt
  ].sort().pop() || new Date().toISOString();

  return {
    profiles: sanitizeProfilesForClient(profilesObj.data),
    almanacEvents: eventsObj.data,
    ledgerData: normalizeLedgerData(ledgerObj.data),
    beaconInfo: beaconObj.data,
    updatedAt: latest
  };
}

// ============================================================================
// HTTP HELPERS & STATIC FILE SERVER
// ============================================================================
function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 5120) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
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

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable'
    });
    res.end(content);
  });
}

// ============================================================================
// HTTP REQUEST ROUTER
// ============================================================================
const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const { pathname } = parsedUrl;

    // CORS Preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    // ------------------------------------------------------------------------
    // HEALTH CHECK
    // ------------------------------------------------------------------------
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        status: 'ok',
        app: 'Howard Household Suite',
        dbFolder: DATA_DIR,
        serverTime: new Date().toISOString()
      });
    }

    // ------------------------------------------------------------------------
    // 1. UNIFIED HOWARD SYNC ENDPOINT (Polled every 2.5s by Foyer & Almanac)
    // ------------------------------------------------------------------------
    if (pathname === '/api/howard/sync' && req.method === 'GET') {
      const activeProfile = parsedUrl.searchParams.get('profile') || 'caregiver';
      const howardState = readHowardState();

      const { settings: cadenceSettings, updatedAt: cSetUpd } = readCadenceSettings();
      const { logsByDate: cadenceLogs, latestLogUpdate: cLogUpd } = readCadenceLogs();
      const cadenceUpdatedAt = cLogUpd > cSetUpd ? cLogUpd : cSetUpd;

      const bloom = readBloomState();

      let floodgate = null;
      if (activeProfile === 'partner2') {
        const { settings: fgSettings, updatedAt: fSetUpd } = readFloodgateSettings();
        const { logsByDate: fgLogs, latestLogUpdate: fLogUpd } = readFloodgateLogs();
        const fgUpdatedAt = fLogUpd > fSetUpd ? fLogUpd : fSetUpd;
        floodgate = {
          settings: fgSettings,
          logsByDate: fgLogs,
          updatedAt: fgUpdatedAt
        };
      }

      return sendJson(res, 200, {
        howard: howardState,
        cadence: {
          settings: cadenceSettings,
          logsByDate: cadenceLogs,
          updatedAt: cadenceUpdatedAt
        },
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
      return sendJson(res, 200, { profiles: sanitizeProfilesForClient(profiles) });
    }

    // Update a profile's display name (and sync to Cadence caregivers + Floodgate ownerName)
    if (pathname === '/api/howard/profiles/name' && req.method === 'PUT') {
      const { profileId, name } = await parseJsonBody(req);
      const cleanedName = String(name || '').trim();
      if (!cleanedName) {
        return sendJson(res, 400, { error: 'Name cannot be empty' });
      }
      const { data: profiles } = readHowardKey('profiles', DEFAULT_PROFILES);
      const idx = profiles.findIndex((p) => p.id === profileId);
      if (idx === -1) {
        return sendJson(res, 404, { error: 'Profile not found' });
      }
      const oldName = profiles[idx].name;
      profiles[idx] = {
        ...profiles[idx],
        name: cleanedName,
        caregiverName: cleanedName
      };
      writeHowardKey('profiles', profiles);

      // Sync updated caregiver names into Cadence settings
      const nowIso = new Date().toISOString();
      const { settings: cadSettings } = readCadenceSettings();
      const nextCaregivers = Array.isArray(cadSettings.caregivers)
        ? cadSettings.caregivers.map((c) => (c === oldName ? cleanedName : c))
        : profiles.map((p) => p.name);
      cadenceUpsertSettingsStmt.run(
        'config',
        JSON.stringify({ ...cadSettings, caregivers: nextCaregivers }),
        nowIso
      );

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

      // If renaming Partner 2, also update Floodgate ownerName
      if (profileId === 'partner2') {
        const { settings: fgSettings } = readFloodgateSettings();
        floodgateUpsertSettingsStmt.run(
          'config',
          JSON.stringify({ ...fgSettings, ownerName: cleanedName }),
          nowIso
        );
      }

      return sendJson(res, 200, { profiles: sanitizeProfilesForClient(profiles) });
    }

    // Almanac Calendar Events CRUD
    if (pathname === '/api/howard/almanac' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const events = Array.isArray(incoming.events) ? incoming.events : [];
      const updatedAt = writeHowardKey('almanac_events', events);
      return sendJson(res, 200, { almanacEvents: events, updatedAt });
    }

    // Ledger Bookkeeping Data CRUD
    if (pathname === '/api/howard/ledger' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const rawLedger = incoming.ledgerData || incoming;
      const normalized = normalizeLedgerData(rawLedger);
      const updatedAt = writeHowardKey('ledger_data', normalized);
      return sendJson(res, 200, { ledgerData: normalized, updatedAt });
    }

    // Beacon Emergency & House Guide CRUD
    if (pathname === '/api/howard/beacon' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const { data: current } = readHowardKey('beacon_info', DEFAULT_BEACON_INFO);
      const updated = { ...current, ...(incoming.beaconInfo || incoming) };
      const updatedAt = writeHowardKey('beacon_info', updated);
      return sendJson(res, 200, { beaconInfo: updated, updatedAt });
    }

    // Full Household Backup Export
    if (pathname === '/api/howard/backup' && req.method === 'GET') {
      const includeFloodgate = parsedUrl.searchParams.get('includeFloodgate') === '1';
      const howardState = readHowardState();
      const cadenceSettings = readCadenceSettings().settings;
      const cadenceLogs = readCadenceLogs().logsByDate;
      const bloomState = readBloomState();

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
          settings: cadenceSettings,
          logsByDate: cadenceLogs
        },
        bloom: {
          settings: bloomState.settings,
          logsByDate: bloomState.logsByDate,
          molts: bloomState.molts,
          feeders: bloomState.feeders
        }
      };

      if (includeFloodgate) {
        payload.floodgate = {
          settings: readFloodgateSettings().settings,
          logsByDate: readFloodgateLogs().logsByDate
        };
      }

      return sendJson(res, 200, payload);
    }

    // Full Household Backup Restore
    if (pathname === '/api/howard/restore' && req.method === 'POST') {
      const incoming = await parseJsonBody(req);
      const nowIso = new Date().toISOString();

      if (incoming.howard) {
        if (Array.isArray(incoming.howard.almanacEvents)) {
          writeHowardKey('almanac_events', incoming.howard.almanacEvents);
        }
        if (incoming.howard.ledgerData && typeof incoming.howard.ledgerData === 'object') {
          writeHowardKey('ledger_data', normalizeLedgerData(incoming.howard.ledgerData));
        }
        if (incoming.howard.beaconInfo && typeof incoming.howard.beaconInfo === 'object') {
          writeHowardKey('beacon_info', incoming.howard.beaconInfo);
        }
      }

      if (incoming.cadence) {
        if (incoming.cadence.settings) {
          const merged = { ...DEFAULT_CADENCE_SETTINGS, ...incoming.cadence.settings };
          cadenceUpsertSettingsStmt.run('config', JSON.stringify(merged), nowIso);
        }
        if (incoming.cadence.logsByDate && typeof incoming.cadence.logsByDate === 'object') {
          cadenceDb.exec('BEGIN IMMEDIATE');
          try {
            for (const [dateKey, rec] of Object.entries(incoming.cadence.logsByDate)) {
              if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey) && rec && typeof rec === 'object') {
                cadenceUpsertLogStmt.run(dateKey, JSON.stringify({ ...rec, dateKey }), rec.updatedAt || nowIso);
              }
            }
            cadenceDb.exec('COMMIT');
          } catch (e) {
            cadenceDb.exec('ROLLBACK');
            throw e;
          }
        }
      }

      if (incoming.bloom) {
        if (incoming.bloom.settings) {
          const merged = normalizeBloomSettings(incoming.bloom.settings);
          bloomUpsertSettingsStmt.run('config', JSON.stringify(merged), nowIso);
        }
        if (incoming.bloom.logsByDate && typeof incoming.bloom.logsByDate === 'object') {
          bloomDb.exec('BEGIN IMMEDIATE');
          try {
            for (const [dateKey, rec] of Object.entries(incoming.bloom.logsByDate)) {
              if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey) && rec && typeof rec === 'object') {
                bloomUpsertLogStmt.run(dateKey, JSON.stringify({ ...rec, dateKey }), rec.updatedAt || nowIso);
              }
            }
            bloomDb.exec('COMMIT');
          } catch (e) {
            bloomDb.exec('ROLLBACK');
            throw e;
          }
        }
        if (Array.isArray(incoming.bloom.molts)) {
          bloomDb.exec('BEGIN IMMEDIATE');
          try {
            for (const m of incoming.bloom.molts) {
              if (m && typeof m === 'object' && m.id && /^\d{4}-\d{2}-\d{2}$/.test(m.dateKey || '')) {
                bloomUpsertMoltStmt.run(m.id, m.dateKey, JSON.stringify(m), m.updatedAt || nowIso);
              }
            }
            bloomDb.exec('COMMIT');
          } catch (e) {
            bloomDb.exec('ROLLBACK');
            throw e;
          }
        }
        if (Array.isArray(incoming.bloom.feeders)) {
          bloomDb.exec('BEGIN IMMEDIATE');
          try {
            for (const f of incoming.bloom.feeders) {
              if (f && typeof f === 'object' && f.id) {
                bloomUpsertFeederStmt.run(f.id, JSON.stringify(f), f.updatedAt || nowIso);
              }
            }
            bloomDb.exec('COMMIT');
          } catch (e) {
            bloomDb.exec('ROLLBACK');
            throw e;
          }
        }
      }

      if (incoming.floodgate) {
        if (incoming.floodgate.settings) {
          const merged = { ...DEFAULT_FLOODGATE_SETTINGS, ...incoming.floodgate.settings };
          floodgateUpsertSettingsStmt.run('config', JSON.stringify(merged), nowIso);
        }
        const fgLogs = incoming.floodgate.logsByDate || incoming.floodgate.logs;
        if (fgLogs && typeof fgLogs === 'object') {
          floodgateDb.exec('BEGIN IMMEDIATE');
          try {
            for (const [dateKey, rec] of Object.entries(fgLogs)) {
              if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey) && rec && typeof rec === 'object') {
                floodgateUpsertLogStmt.run(dateKey, JSON.stringify({ ...rec, date: dateKey }), rec.updatedAt || nowIso);
              }
            }
            floodgateDb.exec('COMMIT');
          } catch (e) {
            floodgateDb.exec('ROLLBACK');
            throw e;
          }
        }
      }

      return sendJson(res, 200, { restored: true, updatedAt: nowIso });
    }

    // ------------------------------------------------------------------------
    // 2. CADENCE API ROUTES (/api/cadence/*)
    // ------------------------------------------------------------------------
    if (pathname === '/api/cadence/state' && req.method === 'GET') {
      const { settings, updatedAt: sUpd } = readCadenceSettings();
      const { logsByDate, latestLogUpdate: lUpd } = readCadenceLogs();
      const updatedAt = lUpd > sUpd ? lUpd : sUpd;
      return sendJson(res, 200, { settings, logsByDate, updatedAt });
    }

    if (pathname === '/api/cadence/settings' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const { settings: currentSettings } = readCadenceSettings();
      const nowIso = new Date().toISOString();
      const updatedSettings = {
        ...DEFAULT_CADENCE_SETTINGS,
        ...currentSettings,
        ...incoming
      };
      cadenceUpsertSettingsStmt.run('config', JSON.stringify(updatedSettings), nowIso);
      return sendJson(res, 200, { settings: updatedSettings, updatedAt: nowIso });
    }

    if (pathname.startsWith('/api/cadence/logs/') && req.method === 'PUT') {
      const dateKey = decodeURIComponent(pathname.slice('/api/cadence/logs/'.length));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      }
      const incoming = await parseJsonBody(req);
      const nowIso = new Date().toISOString();

      cadenceDb.exec('BEGIN IMMEDIATE');
      try {
        const existingRow = cadenceGetLogByDateStmt.get(dateKey);
        let currentRecord = { dateKey };
        if (existingRow) {
          try {
            currentRecord = { dateKey, ...JSON.parse(existingRow.data) };
          } catch {
            currentRecord = { dateKey };
          }
        }
        const updatedRecord = {
          ...currentRecord,
          ...incoming,
          dateKey,
          updatedAt: incoming.updatedAt || nowIso
        };
        cadenceUpsertLogStmt.run(dateKey, JSON.stringify(updatedRecord), updatedRecord.updatedAt);
        cadenceDb.exec('COMMIT');
        return sendJson(res, 200, { dateKey, record: updatedRecord });
      } catch (txErr) {
        cadenceDb.exec('ROLLBACK');
        throw txErr;
      }
    }

    // ------------------------------------------------------------------------
    // 3. FLOODGATE API ROUTES (/api/floodgate/*)
    // ------------------------------------------------------------------------
    if (pathname === '/api/floodgate/state' && req.method === 'GET') {
      const { settings, updatedAt: sUpd } = readFloodgateSettings();
      const { logsByDate, latestLogUpdate: lUpd } = readFloodgateLogs();
      const updatedAt = lUpd > sUpd ? lUpd : sUpd;
      return sendJson(res, 200, { settings, logsByDate, updatedAt });
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
      return sendJson(res, 200, { settings: updatedSettings, updatedAt: nowIso });
    }

    if (pathname === '/api/floodgate/logs/batch' && req.method === 'POST') {
      const incoming = await parseJsonBody(req);
      const rawLogs = incoming.logs || incoming;
      if (!rawLogs || typeof rawLogs !== 'object') {
        return sendJson(res, 400, { error: 'Expected logs object or array' });
      }
      const entries = Array.isArray(rawLogs) ? rawLogs : Object.values(rawLogs);
      const nowIso = new Date().toISOString();
      let upsertedCount = 0;

      floodgateDb.exec('BEGIN IMMEDIATE');
      try {
        for (const item of entries) {
          if (!item || typeof item !== 'object') continue;
          const dateKey = item.date || item.dateKey;
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
            updatedAt: item.updatedAt || nowIso
          };
          floodgateUpsertLogStmt.run(dateKey, JSON.stringify(updatedRecord), updatedRecord.updatedAt);
          upsertedCount += 1;
        }
        floodgateDb.exec('COMMIT');
        const { logsByDate, latestLogUpdate } = readFloodgateLogs();
        return sendJson(res, 200, { count: upsertedCount, logsByDate, updatedAt: latestLogUpdate || nowIso });
      } catch (txErr) {
        floodgateDb.exec('ROLLBACK');
        throw txErr;
      }
    }

    if (pathname.startsWith('/api/floodgate/logs/') && req.method === 'PUT') {
      const dateKey = decodeURIComponent(pathname.slice('/api/floodgate/logs/'.length));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      }
      const incoming = await parseJsonBody(req);
      const nowIso = new Date().toISOString();

      floodgateDb.exec('BEGIN IMMEDIATE');
      try {
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
          ...incoming,
          date: dateKey,
          updatedAt: incoming.updatedAt || nowIso
        };
        floodgateUpsertLogStmt.run(dateKey, JSON.stringify(updatedRecord), updatedRecord.updatedAt);
        floodgateDb.exec('COMMIT');
        return sendJson(res, 200, { dateKey, record: updatedRecord });
      } catch (txErr) {
        floodgateDb.exec('ROLLBACK');
        throw txErr;
      }
    }

    if (pathname.startsWith('/api/floodgate/logs/') && req.method === 'DELETE') {
      const dateKey = decodeURIComponent(pathname.slice('/api/floodgate/logs/'.length));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      }
      floodgateDeleteLogStmt.run(dateKey);
      return sendJson(res, 200, { deleted: true, dateKey });
    }

    // ------------------------------------------------------------------------
    // 4. BLOOM API ROUTES (/api/bloom/*)
    // ------------------------------------------------------------------------
    if (pathname === '/api/bloom/state' && req.method === 'GET') {
      return sendJson(res, 200, readBloomState());
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
      return sendJson(res, 200, { settings: updatedSettings, updatedAt: nowIso });
    }

    if (pathname.startsWith('/api/bloom/logs/') && req.method === 'PUT') {
      const dateKey = decodeURIComponent(pathname.slice('/api/bloom/logs/'.length));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      }
      const incoming = await parseJsonBody(req);
      const { settingsPatch, ...logPayload } = incoming || {};
      const nowIso = new Date().toISOString();

      bloomDb.exec('BEGIN IMMEDIATE');
      try {
        const existingRow = bloomGetLogByDateStmt.get(dateKey);
        let currentRecord = { dateKey, mists: [], feedings: [], climateChecks: [], behaviors: [] };
        if (existingRow) {
          try {
            currentRecord = { ...currentRecord, ...JSON.parse(existingRow.data), dateKey };
          } catch {
            // keep clean default record
          }
        }
        const updatedRecord = {
          ...currentRecord,
          ...logPayload,
          dateKey,
          updatedAt: logPayload.updatedAt || nowIso
        };
        bloomUpsertLogStmt.run(dateKey, JSON.stringify(updatedRecord), updatedRecord.updatedAt);

        let updatedSettings = null;
        if (settingsPatch && typeof settingsPatch === 'object') {
          const { settings: currentSettings } = readBloomSettings();
          updatedSettings = normalizeBloomSettings({
            ...currentSettings,
            ...settingsPatch,
            enclosureInfo: {
              ...currentSettings.enclosureInfo,
              ...settingsPatch.enclosureInfo
            }
          });
          bloomUpsertSettingsStmt.run('config', JSON.stringify(updatedSettings), nowIso);
        }

        bloomDb.exec('COMMIT');
        return sendJson(res, 200, {
          dateKey,
          record: updatedRecord,
          ...(updatedSettings ? { settings: updatedSettings } : {})
        });
      } catch (txErr) {
        bloomDb.exec('ROLLBACK');
        throw txErr;
      }
    }

    if (pathname === '/api/bloom/molts' && req.method === 'POST') {
      const incoming = await parseJsonBody(req);
      const nowIso = new Date().toISOString();
      const dateKey =
        incoming.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(incoming.dateKey)
          ? incoming.dateKey
          : getLocalDateKey(new Date());
      const moltId = incoming.id || `molt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const moltRecord = {
        id: moltId,
        dateKey,
        timestamp: incoming.timestamp || nowIso,
        fromInstar: incoming.fromInstar || 'L2',
        toInstar: incoming.toInstar || 'L3',
        lengthMm: incoming.lengthMm ? Number(incoming.lengthMm) : null,
        colorShift: String(incoming.colorShift || '').trim(),
        quality: incoming.quality || 'clean',
        loggedBy: incoming.loggedBy || 'Household',
        note: String(incoming.note || '').trim(),
        updatedAt: nowIso
      };

      bloomDb.exec('BEGIN IMMEDIATE');
      try {
        bloomUpsertMoltStmt.run(moltId, dateKey, JSON.stringify(moltRecord), nowIso);

        let { settings: currentSettings } = readBloomSettings();
        if (incoming.advanceInstar !== false) {
          const hardHours = Number(currentSettings.hardeningHours) || 36;
          const startHardening = incoming.startHardening !== false;
          const hardeningUntilIso = startHardening
            ? new Date(Date.now() + hardHours * 3600000).toISOString()
            : currentSettings.hardeningUntil;

          currentSettings = normalizeBloomSettings({
            ...currentSettings,
            currentInstar: moltRecord.toInstar || currentSettings.currentInstar,
            ...(moltRecord.colorShift ? { currentColorMorph: moltRecord.colorShift } : {}),
            lifecycleStatus: startHardening ? 'hardening' : 'normal',
            premoltStartedAt: null,
            hardeningUntil: startHardening ? hardeningUntilIso : null,
            enclosureInfo: {
              ...currentSettings.enclosureInfo,
              ...(moltRecord.lengthMm ? { currentBodyLengthMm: moltRecord.lengthMm } : {})
            }
          });
          bloomUpsertSettingsStmt.run('config', JSON.stringify(currentSettings), nowIso);
        }

        bloomDb.exec('COMMIT');
        const { molts } = readBloomMolts();
        return sendJson(res, 200, { molt: moltRecord, molts, settings: currentSettings, updatedAt: nowIso });
      } catch (txErr) {
        bloomDb.exec('ROLLBACK');
        throw txErr;
      }
    }

    if (pathname.startsWith('/api/bloom/molts/') && req.method === 'DELETE') {
      const moltId = decodeURIComponent(pathname.slice('/api/bloom/molts/'.length));
      if (!moltId) return sendJson(res, 400, { error: 'Missing molt ID' });
      bloomDeleteMoltStmt.run(moltId);
      const { molts } = readBloomMolts();
      return sendJson(res, 200, { deleted: true, id: moltId, molts });
    }

    if (pathname.startsWith('/api/bloom/feeders/') && req.method === 'PUT') {
      const feederId = decodeURIComponent(pathname.slice('/api/bloom/feeders/'.length));
      if (!feederId) return sendJson(res, 400, { error: 'Missing feeder ID' });
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
      const { feeders } = readBloomFeeders();
      return sendJson(res, 200, { feeder: feederRecord, feeders, updatedAt: nowIso });
    }

    if (pathname.startsWith('/api/bloom/feeders/') && req.method === 'DELETE') {
      const feederId = decodeURIComponent(pathname.slice('/api/bloom/feeders/'.length));
      if (!feederId) return sendJson(res, 400, { error: 'Missing feeder ID' });
      bloomDeleteFeederStmt.run(feederId);
      const { feeders } = readBloomFeeders();
      return sendJson(res, 200, { deleted: true, id: feederId, feeders });
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'API endpoint not found' });
    }

    // ------------------------------------------------------------------------
    // 4. STATIC FRONTEND & SPA FALLBACK
    // ------------------------------------------------------------------------
    const safeRelativePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
    const candidatePath = path.join(DIST_DIR, safeRelativePath);

    if (
      pathname !== '/' &&
      candidatePath.startsWith(DIST_DIR) &&
      fs.existsSync(candidatePath) &&
      fs.statSync(candidatePath).isFile()
    ) {
      return serveStaticFile(res, candidatePath);
    }

    const indexHtmlPath = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      return serveStaticFile(res, indexHtmlPath);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Frontend build not found. Run "npm run build" first.');
  } catch (err) {
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

const shutdown = () => {
  server.close(() => {
    for (const dbInstance of [howardDb, cadenceDb, floodgateDb, bloomDb]) {
      try {
        dbInstance.close();
      } catch {
        // ignore close errors
      }
    }
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
