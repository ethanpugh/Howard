import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isPlainObject, runInTransaction } from './utils.js';

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'howard.db');
  const db = new DatabaseSync(dbPath);
  const requestedJournal = String(process.env.SQLITE_JOURNAL_MODE || 'WAL').toUpperCase();
  let activeJournalMode = 'WAL';

  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  if (requestedJournal === 'TRUNCATE') {
    db.exec('PRAGMA journal_mode = TRUNCATE;');
    db.exec('PRAGMA synchronous = FULL;');
    activeJournalMode = 'TRUNCATE';
  } else {
    try {
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA synchronous = NORMAL;');
      activeJournalMode = 'WAL';
    } catch {
      db.exec('PRAGMA journal_mode = TRUNCATE;');
      db.exec('PRAGMA synchronous = FULL;');
      activeJournalMode = 'TRUNCATE';
    }
  }

  db.exec(`
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

  const stmts = {
    howardGet: db.prepare('SELECT data, updated_at FROM howard_store WHERE key = ?'),
    howardUpsert: db.prepare(`
      INSERT INTO howard_store (key, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `),
    howardInsertIgnore: db.prepare(`
      INSERT OR IGNORE INTO howard_store (key, data, updated_at)
      VALUES (?, ?, ?)
    `),

    almanacCount: db.prepare('SELECT COUNT(*) AS cnt FROM almanac_events'),
    almanacGetAll: db.prepare(
      'SELECT id, date_key, data, updated_at FROM almanac_events ORDER BY date_key ASC, updated_at ASC'
    ),
    almanacUpsert: db.prepare(`
      INSERT INTO almanac_events (id, date_key, data, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        date_key = excluded.date_key,
        data = excluded.data,
        updated_at = excluded.updated_at
    `),
    almanacDelete: db.prepare('DELETE FROM almanac_events WHERE id = ?'),
    almanacClearAll: db.prepare('DELETE FROM almanac_events'),

    ledgerCount: null,
    ledgerGetAll: null,
    ledgerUpsert: null,
    ledgerDelete: null,
    ledgerClearAll: null,

    cadenceGetAllLogs: db.prepare('SELECT date_key, data, updated_at FROM cadence_logs'),
    cadenceGetLogByDate: db.prepare('SELECT data FROM cadence_logs WHERE date_key = ?'),
    cadenceUpsertLog: db.prepare(`
      INSERT INTO cadence_logs (date_key, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(date_key) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `),
    cadenceInsertIgnoreLog: db.prepare(`
      INSERT OR IGNORE INTO cadence_logs (date_key, data, updated_at)
      VALUES (?, ?, ?)
    `),
    cadenceClearLogs: db.prepare('DELETE FROM cadence_logs'),

    bloomGetAllLogs: db.prepare('SELECT date_key, data, updated_at FROM bloom_care_logs'),
    bloomGetLogByDate: db.prepare('SELECT data FROM bloom_care_logs WHERE date_key = ?'),
    bloomUpsertLog: db.prepare(`
      INSERT INTO bloom_care_logs (date_key, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(date_key) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `),
    bloomInsertIgnoreLog: db.prepare(`
      INSERT OR IGNORE INTO bloom_care_logs (date_key, data, updated_at)
      VALUES (?, ?, ?)
    `),
    bloomClearLogs: db.prepare('DELETE FROM bloom_care_logs'),

    bloomGetAllMolts: db.prepare(
      'SELECT id, date_key, data, updated_at FROM bloom_molt_logs ORDER BY date_key DESC, updated_at DESC'
    ),
    bloomUpsertMolt: db.prepare(`
      INSERT INTO bloom_molt_logs (id, date_key, data, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        date_key = excluded.date_key,
        data = excluded.data,
        updated_at = excluded.updated_at
    `),
    bloomInsertIgnoreMolt: db.prepare(`
      INSERT OR IGNORE INTO bloom_molt_logs (id, date_key, data, updated_at)
      VALUES (?, ?, ?, ?)
    `),
    bloomDeleteMolt: db.prepare('DELETE FROM bloom_molt_logs WHERE id = ?'),
    bloomClearMolts: db.prepare('DELETE FROM bloom_molt_logs'),

    bloomGetAllFeeders: db.prepare(
      'SELECT id, data, updated_at FROM bloom_feeder_cultures ORDER BY updated_at DESC'
    ),
    bloomUpsertFeeder: db.prepare(`
      INSERT INTO bloom_feeder_cultures (id, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `),
    bloomInsertIgnoreFeeder: db.prepare(`
      INSERT OR IGNORE INTO bloom_feeder_cultures (id, data, updated_at)
      VALUES (?, ?, ?)
    `),
    bloomDeleteFeeder: db.prepare('DELETE FROM bloom_feeder_cultures WHERE id = ?'),
    bloomClearFeeders: db.prepare('DELETE FROM bloom_feeder_cultures'),

    floodgateGetAllLogs: db.prepare('SELECT date_key, data, updated_at FROM floodgate_logs'),
    floodgateGetLogByDate: db.prepare('SELECT data FROM floodgate_logs WHERE date_key = ?'),
    floodgateUpsertLog: db.prepare(`
      INSERT INTO floodgate_logs (date_key, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(date_key) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `),
    floodgateInsertIgnoreLog: db.prepare(`
      INSERT OR IGNORE INTO floodgate_logs (date_key, data, updated_at)
      VALUES (?, ?, ?)
    `),
    floodgateDeleteLog: db.prepare('DELETE FROM floodgate_logs WHERE date_key = ?'),
    floodgateClearLogs: db.prepare('DELETE FROM floodgate_logs')
  };

  function initLedgerStatements() {
    stmts.ledgerCount = db.prepare('SELECT COUNT(*) AS cnt FROM ledger_items');
    stmts.ledgerGetAll = db.prepare(
      'SELECT id, kind, data, updated_at FROM ledger_items ORDER BY updated_at DESC'
    );
    stmts.ledgerUpsert = db.prepare(`
      INSERT INTO ledger_items (id, kind, data, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        data = excluded.data,
        updated_at = excluded.updated_at
    `);
    stmts.ledgerDelete = db.prepare('DELETE FROM ledger_items WHERE id = ?');
    stmts.ledgerClearAll = db.prepare('DELETE FROM ledger_items');
  }

  function readHowardKey(key, fallback) {
    const row = stmts.howardGet.get(key);
    if (!row) return { data: fallback, updatedAt: new Date().toISOString() };
    try {
      return { data: JSON.parse(row.data), updatedAt: row.updated_at };
    } catch {
      return { data: fallback, updatedAt: row.updated_at };
    }
  }

  function writeHowardKey(key, value) {
    const nowIso = new Date().toISOString();
    stmts.howardUpsert.run(key, JSON.stringify(value), nowIso);
    return nowIso;
  }

  function readTableJsonRows(stmt, onRow) {
    const rows = stmt.all();
    let latestUpdatedAt = '';
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data);
        onRow(parsed, row);
        if (row.updated_at > latestUpdatedAt) latestUpdatedAt = row.updated_at;
      } catch {
        // skip malformed row
      }
    }
    return latestUpdatedAt;
  }

  function readDayJsonRow(stmt, dateKey, baseRecord = {}) {
    const existingRow = stmt.get(dateKey);
    if (!existingRow) return { ...baseRecord };
    try {
      const parsed = JSON.parse(existingRow.data);
      return isPlainObject(parsed) ? { ...baseRecord, ...parsed } : { ...baseRecord };
    } catch {
      return { ...baseRecord };
    }
  }

  function checkpointDatabase() {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      // ignore checkpoint errors
    }
  }

  function close() {
    try {
      db.exec('PRAGMA optimize;');
    } catch {
      // ignore optimize errors
    }
    checkpointDatabase();
    try {
      db.close();
    } catch {
      // ignore close errors
    }
  }

  return {
    db,
    dataDir,
    dbPath,
    activeJournalMode,
    stmts,
    initLedgerStatements,
    runInTransaction: (fn) => runInTransaction(db, fn),
    readHowardKey,
    writeHowardKey,
    readTableJsonRows,
    readDayJsonRow,
    checkpointDatabase,
    close
  };
}
