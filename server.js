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
// 1. INITIALIZE THREE SEPARATE SQLITE DATABASES (DROP-IN COMPATIBLE)
// ============================================================================
const howardDb = new DatabaseSync(HOWARD_DB_PATH);
const cadenceDb = new DatabaseSync(CADENCE_DB_PATH);
const floodgateDb = new DatabaseSync(FLOODGATE_DB_PATH);

for (const dbInstance of [howardDb, cadenceDb, floodgateDb]) {
  dbInstance.exec('PRAGMA journal_mode = DELETE;');
  dbInstance.exec('PRAGMA synchronous = NORMAL;');
}

// ----------------------------------------------------------------------------
// A. CADENCE DATABASE SCHEMA & DEFAULTS (Pet Medication)
// ----------------------------------------------------------------------------
const DEFAULT_CADENCE_SETTINGS = {
  catName: 'Mochi',
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
// C. HOWARD DATABASE SCHEMA & DEFAULTS (Profiles, Almanac, Ledger, Beacon)
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
    allowedApps: ['foyer', 'cadence', 'almanac', 'ledger', 'beacon'],
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
    allowedApps: ['foyer', 'cadence', 'almanac', 'floodgate', 'ledger', 'beacon'],
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
    allowedApps: ['foyer', 'cadence', 'beacon'],
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
    petName: 'Mochi',
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

const DEFAULT_MONZO_CONFIG = {
  clientId: '',
  clientSecret: '',
  redirectUri: 'http://localhost:5170/api/howard/monzo/oauth/callback',
  webhookBaseUrl: '',
  connections: {
    partner1: null,
    partner2: null
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
ensureHowardSeed('monzo_config', DEFAULT_MONZO_CONFIG);

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
    allowedApps: Array.isArray(p.allowedApps) ? p.allowedApps : ['foyer', 'cadence', 'beacon'],
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

function sanitizeMonzoConfigForClient(rawConfig) {
  const cfg = { ...DEFAULT_MONZO_CONFIG, ...(rawConfig || {}) };
  const conns = cfg.connections || {};
  const sanitizeConn = (c) => {
    if (!c || !c.accessToken) return null;
    return {
      connected: true,
      accountId: c.accountId || '',
      accountName: c.accountName || 'Monzo Account',
      accountType: c.accountType || '',
      lastSyncedAt: c.lastSyncedAt || null,
      webhookId: c.webhookId || null,
      webhookUrl: c.webhookUrl || null
    };
  };
  return {
    hasOAuthClient: Boolean(cfg.clientId && cfg.clientSecret),
    clientId: cfg.clientId || '',
    redirectUri: cfg.redirectUri || 'http://localhost:5170/api/howard/monzo/oauth/callback',
    webhookBaseUrl: cfg.webhookBaseUrl || '',
    connections: {
      partner1: sanitizeConn(conns.partner1),
      partner2: sanitizeConn(conns.partner2)
    }
  };
}

const MONZO_CATEGORY_MAP = {
  bills: 'Utilities & Bills',
  groceries: 'Groceries & Household',
  eating_out: 'Dining & Leisure',
  entertainment: 'Subscriptions & Media',
  transport: 'Transport',
  personal_care: 'Health & Pharmacy',
  health: 'Health & Pharmacy',
  pets: 'Pet & Vet Care',
  shopping: 'Personal',
  general: 'Other'
};

// Ingest a single Monzo API transaction object into LedgerData (de-duplicated by monzoTxId)
function ingestMonzoTransaction(ledgerData, tx, slotOwner = 'joint') {
  if (!tx || !tx.id) return { added: false, reason: 'missing_id' };
  // Skip declined transactions or zero-amount active card checks
  if (tx.decline_reason || !tx.amount || tx.amount === 0) {
    return { added: false, reason: 'zero_or_declined' };
  }
  // Skip internal Monzo pot transfers unless user wants them
  if (tx.scheme === 'uk_retail_pot' || (tx.metadata && tx.metadata.pot_id)) {
    return { added: false, reason: 'pot_transfer' };
  }

  const txId = String(tx.id);
  const alreadyInExpenses = (ledgerData.expenses || []).some((e) => e.monzoTxId === txId);
  const alreadyInIncomes = (ledgerData.incomes || []).some((i) => i.monzoTxId === txId);
  if (alreadyInExpenses || alreadyInIncomes) {
    return { added: false, reason: 'duplicate' };
  }

  const createdIso = tx.created || new Date().toISOString();
  const dateStr = createdIso.slice(0, 10);
  const amountGBP = Math.round((Math.abs(Number(tx.amount)) / 100) * 100) / 100;
  const merchantName =
    tx.merchant?.name ||
    tx.counterparty?.name ||
    tx.description ||
    'Monzo Transaction';
  const mappedCategory =
    MONZO_CATEGORY_MAP[tx.category] ||
    (tx.merchant?.category ? MONZO_CATEGORY_MAP[tx.merchant.category] : null) ||
    'Other';

  const isDirectDebit =
    tx.scheme === 'bacs' ||
    Boolean(tx.metadata?.mastercard_Original_message_type) ||
    (tx.description || '').toUpperCase().includes('DIRECT DEBIT');

  // Positive amount in Monzo = Money In (One-Off / Variable Income or Salary)
  if (Number(tx.amount) > 0) {
    const newInc = {
      id: `inc-mz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      monzoTxId: txId,
      title: merchantName,
      amount: amountGBP,
      frequency: 'one-off',
      date: dateStr,
      owner: slotOwner === 'joint' ? 'joint' : slotOwner,
      category: 'One-Off / Variable',
      notes: `Synced from Monzo (${dateStr})${tx.notes ? ` • ${tx.notes}` : ''}`
    };
    ledgerData.incomes = [newInc, ...(ledgerData.incomes || [])];
    return { added: true, kind: 'income', record: newInc };
  }

  // Negative amount in Monzo = Outgoing (Direct Debit, Subscription, or Expense)
  // Check if this matches an existing recurring Direct Debit or Subscription to update its lastPaidDate & amount
  const normMerchant = merchantName.toLowerCase().trim();
  const matchedRecIdx = (ledgerData.recurring || []).findIndex((r) => {
    const rTitle = (r.title || '').toLowerCase();
    return (
      normMerchant.length >= 3 &&
      (rTitle.includes(normMerchant) || normMerchant.includes(rTitle.split(' ')[0]))
    );
  });

  if (matchedRecIdx !== -1) {
    const existingRec = ledgerData.recurring[matchedRecIdx];
    ledgerData.recurring[matchedRecIdx] = {
      ...existingRec,
      lastPaidDate: dateStr,
      lastPaidAmount: amountGBP,
      monzoLastTxId: txId
    };
  } else if (isDirectDebit) {
    // Automatically register newly discovered Direct Debit in recurring list
    const billingDay = Number(dateStr.split('-')[2]) || 1;
    ledgerData.recurring = [
      ...(ledgerData.recurring || []),
      {
        id: `rec-mz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: merchantName,
        amount: amountGBP,
        cycle: 'monthly',
        billingDay,
        type: 'direct-debit',
        owner: slotOwner,
        category: mappedCategory === 'Other' ? 'Utilities & Bills' : mappedCategory,
        active: true,
        lastPaidDate: dateStr,
        lastPaidAmount: amountGBP,
        monzoLastTxId: txId,
        notes: 'Auto-detected Direct Debit from Monzo'
      }
    ];
  }

  const newExp = {
    id: `exp-mz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    monzoTxId: txId,
    title: merchantName,
    amount: amountGBP,
    date: dateStr,
    paidBy: slotOwner,
    owner: slotOwner,
    category: mappedCategory,
    notes: `${isDirectDebit ? '[Direct Debit] ' : ''}Synced from Monzo${tx.notes ? ` • ${tx.notes}` : ''}`
  };
  ledgerData.expenses = [newExp, ...(ledgerData.expenses || [])];
  return { added: true, kind: 'expense', record: newExp };
}

function readHowardState() {
  const profilesObj = readHowardKey('profiles', DEFAULT_PROFILES);
  const eventsObj = readHowardKey('almanac_events', DEFAULT_ALMANAC_EVENTS);
  const ledgerObj = readHowardKey('ledger_data', DEFAULT_LEDGER_DATA);
  const beaconObj = readHowardKey('beacon_info', DEFAULT_BEACON_INFO);
  const monzoObj = readHowardKey('monzo_config', DEFAULT_MONZO_CONFIG);

  const latest = [
    profilesObj.updatedAt,
    eventsObj.updatedAt,
    ledgerObj.updatedAt,
    beaconObj.updatedAt,
    monzoObj.updatedAt
  ].sort().pop() || new Date().toISOString();

  return {
    profiles: sanitizeProfilesForClient(profilesObj.data),
    almanacEvents: eventsObj.data,
    ledgerData: normalizeLedgerData(ledgerObj.data),
    beaconInfo: beaconObj.data,
    monzoStatus: sanitizeMonzoConfigForClient(monzoObj.data),
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

    // ------------------------------------------------------------------------
    // MONZO DEVELOPER API & REAL-TIME WEBHOOK INTEGRATION (OPTION B)
    // ------------------------------------------------------------------------
    // 1. Save Monzo OAuth Client Credentials (client_id, client_secret, redirectUri, webhookBaseUrl)
    if (pathname === '/api/howard/monzo/config' && req.method === 'PUT') {
      const incoming = await parseJsonBody(req);
      const { data: current } = readHowardKey('monzo_config', DEFAULT_MONZO_CONFIG);
      const updated = {
        ...DEFAULT_MONZO_CONFIG,
        ...current,
        clientId: typeof incoming.clientId === 'string' ? incoming.clientId.trim() : current.clientId,
        clientSecret:
          typeof incoming.clientSecret === 'string' && incoming.clientSecret.trim()
            ? incoming.clientSecret.trim()
            : current.clientSecret,
        redirectUri:
          typeof incoming.redirectUri === 'string' && incoming.redirectUri.trim()
            ? incoming.redirectUri.trim()
            : current.redirectUri,
        webhookBaseUrl:
          typeof incoming.webhookBaseUrl === 'string'
            ? incoming.webhookBaseUrl.trim()
            : current.webhookBaseUrl
      };
      writeHowardKey('monzo_config', updated);
      return sendJson(res, 200, { monzoStatus: sanitizeMonzoConfigForClient(updated) });
    }

    // 2. Connect a Monzo Account via Direct Access Token (e.g. from developers.monzo.com Playground)
    if (pathname === '/api/howard/monzo/connect-token' && req.method === 'POST') {
      const { slot: rawSlot = 'partner1', accessToken, accountId: manualAccountId } = await parseJsonBody(req);
      const slot = rawSlot === 'partner2' ? 'partner2' : 'partner1';
      if (!accessToken || !String(accessToken).trim()) {
        return sendJson(res, 400, { error: 'Please provide a valid Monzo Access Token' });
      }
      const token = String(accessToken).trim();
      const { data: monzoCfg } = readHowardKey('monzo_config', DEFAULT_MONZO_CONFIG);

      // Fetch accounts from Monzo API to discover retail account_id
      const accRes = await fetch('https://api.monzo.com/accounts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!accRes.ok) {
        const errText = await accRes.text().catch(() => '');
        return sendJson(res, 400, {
          error: `Monzo API rejected token (HTTP ${accRes.status}). Remember to approve access in your Monzo app first! ${errText}`
        });
      }
      const accData = await accRes.json();
      const accounts = (accData.accounts || []).filter((a) => !a.closed);
      if (accounts.length === 0) {
        return sendJson(res, 400, { error: 'No open Monzo accounts found for this token.' });
      }

      let chosen = accounts.find((a) => a.id === manualAccountId);
      if (!chosen) {
        chosen = accounts.find((a) => a.type === 'uk_retail') || accounts[0];
      }

      const updatedConnections = {
        ...(monzoCfg.connections || {}),
        [slot]: {
          accountId: chosen.id,
          accountName: `Monzo Personal (${chosen.description || slot})`,
          accountType: chosen.type,
          accessToken: token,
          refreshToken: monzoCfg.connections?.[slot]?.refreshToken || '',
          lastSyncedAt: null,
          webhookId: monzoCfg.connections?.[slot]?.webhookId || null,
          webhookUrl: monzoCfg.connections?.[slot]?.webhookUrl || null
        }
      };

      const nextCfg = { ...monzoCfg, connections: updatedConnections };
      writeHowardKey('monzo_config', nextCfg);
      return sendJson(res, 200, {
        monzoStatus: sanitizeMonzoConfigForClient(nextCfg),
        availableAccounts: accounts.map((a) => ({
          id: a.id,
          type: a.type,
          description: a.description
        }))
      });
    }

    // 3. Start Monzo OAuth2 Redirect Flow
    if (pathname === '/api/howard/monzo/oauth/start' && req.method === 'GET') {
      const rawSlot = parsedUrl.searchParams.get('slot') || 'partner1';
      const slot = rawSlot === 'partner2' ? 'partner2' : 'partner1';
      const { data: monzoCfg } = readHowardKey('monzo_config', DEFAULT_MONZO_CONFIG);
      if (!monzoCfg.clientId) {
        return sendJson(res, 400, { error: 'Set your Monzo OAuth Client ID first' });
      }
      const redirectUri =
        monzoCfg.redirectUri || `http://${req.headers.host || 'localhost:5170'}/api/howard/monzo/oauth/callback`;
      const stateToken = `${slot}:${Date.now().toString(36)}`;
      const authUrl = `https://auth.monzo.com/?client_id=${encodeURIComponent(
        monzoCfg.clientId
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(
        stateToken
      )}`;
      res.writeHead(302, { Location: authUrl });
      res.end();
      return;
    }

    // 4. Monzo OAuth2 Callback (Exchanges code -> access_token + refresh_token)
    if (pathname === '/api/howard/monzo/oauth/callback' && req.method === 'GET') {
      const code = parsedUrl.searchParams.get('code');
      const stateParam = parsedUrl.searchParams.get('state') || 'partner1:0';
      const rawSlot = stateParam.split(':')[0] || 'partner1';
      const slot = rawSlot === 'partner2' ? 'partner2' : 'partner1';
      const { data: monzoCfg } = readHowardKey('monzo_config', DEFAULT_MONZO_CONFIG);

      if (!code || !monzoCfg.clientId || !monzoCfg.clientSecret) {
        res.writeHead(302, { Location: '/?monzo_error=missing_code_or_client' });
        res.end();
        return;
      }

      const redirectUri =
        monzoCfg.redirectUri || `http://${req.headers.host || 'localhost:5170'}/api/howard/monzo/oauth/callback`;

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: monzoCfg.clientId,
        client_secret: monzoCfg.clientSecret,
        redirect_uri: redirectUri,
        code
      });

      const tokenRes = await fetch('https://api.monzo.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      if (!tokenRes.ok) {
        res.writeHead(302, { Location: '/?monzo_error=token_exchange_failed' });
        res.end();
        return;
      }

      const tokenData = await tokenRes.json();
      const updatedConnections = {
        ...(monzoCfg.connections || {}),
        [slot]: {
          accountId: '',
          accountName: `Monzo (${slot}) — Approve in Monzo App then click Sync`,
          accountType: '',
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || '',
          lastSyncedAt: null,
          webhookId: null
        }
      };
      writeHowardKey('monzo_config', { ...monzoCfg, connections: updatedConnections });
      res.writeHead(302, { Location: '/?monzo_connected=' + encodeURIComponent(slot) });
      res.end();
      return;
    }

    // 5. Pull / Sync Latest Transactions from Monzo API (`GET https://api.monzo.com/transactions`)
    if (pathname === '/api/howard/monzo/sync' && req.method === 'POST') {
      const { slot: rawSlot = 'partner1', daysBack = 85 } = await parseJsonBody(req);
      const slot = rawSlot === 'partner2' ? 'partner2' : 'partner1';
      const { data: monzoCfg } = readHowardKey('monzo_config', DEFAULT_MONZO_CONFIG);
      const conn = monzoCfg.connections?.[slot];
      if (!conn || !conn.accessToken) {
        return sendJson(res, 400, { error: `No Monzo connection configured for ${slot}` });
      }

      let accessToken = conn.accessToken;
      let accountId = conn.accountId;
      let accountName = conn.accountName;
      let accountType = conn.accountType;

      // If accountId wasn't resolved yet (e.g. right after OAuth SCA approval in Monzo app), resolve it now
      if (!accountId) {
        const accRes = await fetch('https://api.monzo.com/accounts', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!accRes.ok) {
          return sendJson(res, 400, {
            error: `Could not list Monzo accounts (HTTP ${accRes.status}). Make sure you tapped "Approve" in your Monzo phone app!`
          });
        }
        const accData = await accRes.json();
        const openAccounts = (accData.accounts || []).filter((a) => !a.closed);
        const chosen = openAccounts.find((a) => a.type === 'uk_retail') || openAccounts[0];
        if (!chosen) {
          return sendJson(res, 400, { error: 'No open Monzo account found.' });
        }
        accountId = chosen.id;
        accountType = chosen.type;
        accountName = `Monzo Personal (${chosen.description || slot})`;
      }

      const sinceDate = new Date(Date.now() - Math.min(89, Math.max(1, Number(daysBack) || 85)) * 86400000).toISOString();
      const txUrl = `https://api.monzo.com/transactions?expand[]=merchant&account_id=${encodeURIComponent(
        accountId
      )}&since=${encodeURIComponent(sinceDate)}`;

      const txRes = await fetch(txUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!txRes.ok) {
        const errBody = await txRes.text().catch(() => '');
        return sendJson(res, 400, {
          error: `Monzo transactions fetch failed (HTTP ${txRes.status}). If using a newly issued token, ensure you approved SCA in the Monzo app. ${errBody}`
        });
      }

      const txData = await txRes.json();
      const transactions = txData.transactions || [];
      const { data: rawLedger } = readHowardKey('ledger_data', DEFAULT_LEDGER_DATA);
      const ledgerData = normalizeLedgerData(rawLedger);

      let addedExpenses = 0;
      let addedIncomes = 0;
      let skippedDuplicates = 0;

      for (const tx of transactions) {
        const resIngest = ingestMonzoTransaction(ledgerData, tx, slot);
        if (resIngest.added) {
          if (resIngest.kind === 'income') addedIncomes += 1;
          else addedExpenses += 1;
        } else if (resIngest.reason === 'duplicate') {
          skippedDuplicates += 1;
        }
      }

      writeHowardKey('ledger_data', ledgerData);

      const nowIso = new Date().toISOString();
      const nextCfg = {
        ...monzoCfg,
        connections: {
          ...(monzoCfg.connections || {}),
          [slot]: {
            ...conn,
            accountId,
            accountName,
            accountType,
            lastSyncedAt: nowIso
          }
        }
      };
      writeHowardKey('monzo_config', nextCfg);

      return sendJson(res, 200, {
        synced: true,
        fetchedCount: transactions.length,
        addedExpenses,
        addedIncomes,
        skippedDuplicates,
        ledgerData,
        monzoStatus: sanitizeMonzoConfigForClient(nextCfg)
      });
    }

    // 6. Register a Real-Time Monzo Webhook (`POST https://api.monzo.com/webhooks`)
    if (pathname === '/api/howard/monzo/register-webhook' && req.method === 'POST') {
      const { slot: rawSlot = 'partner1', webhookBaseUrl } = await parseJsonBody(req);
      const slot = rawSlot === 'partner2' ? 'partner2' : 'partner1';
      const { data: monzoCfg } = readHowardKey('monzo_config', DEFAULT_MONZO_CONFIG);
      const conn = monzoCfg.connections?.[slot];
      if (!conn || !conn.accessToken || !conn.accountId) {
        return sendJson(res, 400, { error: `Connect & sync ${slot}'s Monzo account first.` });
      }
      const baseUrl = String(webhookBaseUrl || monzoCfg.webhookBaseUrl || '').trim().replace(/\/+$/, '');
      if (!baseUrl.startsWith('http')) {
        return sendJson(res, 400, {
          error: 'Provide a reachable base URL (e.g. your Cloudflare Tunnel or Tailscale Funnel URL)'
        });
      }

      const targetWebhookUrl = `${baseUrl}/api/howard/monzo/webhook?slot=${encodeURIComponent(slot)}`;
      const params = new URLSearchParams({
        account_id: conn.accountId,
        url: targetWebhookUrl
      });

      const whRes = await fetch('https://api.monzo.com/webhooks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!whRes.ok) {
        const errText = await whRes.text().catch(() => '');
        return sendJson(res, 400, { error: `Failed to register Monzo webhook: ${errText}` });
      }

      const whData = await whRes.json();
      const nextCfg = {
        ...monzoCfg,
        webhookBaseUrl: baseUrl,
        connections: {
          ...(monzoCfg.connections || {}),
          [slot]: {
            ...conn,
            webhookId: whData.webhook?.id || 'registered',
            webhookUrl: targetWebhookUrl
          }
        }
      };
      writeHowardKey('monzo_config', nextCfg);
      return sendJson(res, 200, { monzoStatus: sanitizeMonzoConfigForClient(nextCfg) });
    }

    // 7. Disconnect a Monzo Account Slot
    if (pathname === '/api/howard/monzo/disconnect' && req.method === 'POST') {
      const { slot: rawSlot = 'partner1' } = await parseJsonBody(req);
      const slot = rawSlot === 'partner2' ? 'partner2' : 'partner1';
      const { data: monzoCfg } = readHowardKey('monzo_config', DEFAULT_MONZO_CONFIG);
      const nextCfg = {
        ...monzoCfg,
        connections: {
          ...(monzoCfg.connections || {}),
          [slot]: null
        }
      };
      writeHowardKey('monzo_config', nextCfg);
      return sendJson(res, 200, { monzoStatus: sanitizeMonzoConfigForClient(nextCfg) });
    }

    // 8. Incoming Real-Time Monzo Webhook Receiver (`transaction.created`)
    if (pathname === '/api/howard/monzo/webhook' && req.method === 'POST') {
      const rawSlot = parsedUrl.searchParams.get('slot') || 'partner1';
      const slot = rawSlot === 'partner2' ? 'partner2' : 'partner1';
      const payload = await parseJsonBody(req);
      const tx = payload.data || payload.transaction || payload;

      if (!tx || !tx.id) {
        return sendJson(res, 400, { error: 'Expected Monzo transaction.created payload' });
      }

      const { data: rawLedger } = readHowardKey('ledger_data', DEFAULT_LEDGER_DATA);
      const ledgerData = normalizeLedgerData(rawLedger);
      const result = ingestMonzoTransaction(ledgerData, tx, slot);

      if (result.added) {
        writeHowardKey('ledger_data', ledgerData);
      }

      return sendJson(res, 200, {
        received: true,
        ...result,
        ledgerData
      });
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

      const payload = {
        app: 'Howard',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        howard: {
          almanacEvents: howardState.almanacEvents,
          ledgerData: howardState.ledgerData,
          beaconInfo: howardState.beaconInfo
        },
        cadence: {
          settings: cadenceSettings,
          logsByDate: cadenceLogs
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
  console.log(`   • Floodgate: ${FLOODGATE_DB_PATH}`);
});

const shutdown = () => {
  server.close(() => {
    for (const dbInstance of [howardDb, cadenceDb, floodgateDb]) {
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
