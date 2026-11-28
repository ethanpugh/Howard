import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { isPlainObject, runInTransaction } from './utils.ts';

export interface DbStatements {
  howardGet: StatementSync;
  howardUpsert: StatementSync;
  howardInsertIgnore: StatementSync;

  almanacCount: StatementSync;
  almanacGetAll: StatementSync;
  almanacGetById: StatementSync;
  almanacUpsert: StatementSync;
  almanacDelete: StatementSync;
  almanacClearAll: StatementSync;

  ledgerCount: StatementSync;
  ledgerGetAll: StatementSync;
  ledgerGetById: StatementSync;
  ledgerUpsert: StatementSync;
  ledgerDelete: StatementSync;
  ledgerClearAll: StatementSync;

  cadenceGetAllLogs: StatementSync;
  cadenceGetLogByDate: StatementSync;
  cadenceUpsertLog: StatementSync;
  cadenceInsertIgnoreLog: StatementSync;
  cadenceClearLogs: StatementSync;

  bloomGetAllLogs: StatementSync;
  bloomGetLogByDate: StatementSync;
  bloomUpsertLog: StatementSync;
  bloomInsertIgnoreLog: StatementSync;
  bloomClearLogs: StatementSync;

  bloomGetAllMolts: StatementSync;
  bloomUpsertMolt: StatementSync;
  bloomInsertIgnoreMolt: StatementSync;
  bloomDeleteMolt: StatementSync;
  bloomClearMolts: StatementSync;

  bloomGetAllFeeders: StatementSync;
  bloomUpsertFeeder: StatementSync;
  bloomInsertIgnoreFeeder: StatementSync;
  bloomDeleteFeeder: StatementSync;
  bloomClearFeeders: StatementSync;

  floodgateGetAllLogs: StatementSync;
  floodgateGetLogByDate: StatementSync;
  floodgateUpsertLog: StatementSync;
  floodgateInsertIgnoreLog: StatementSync;
  floodgateDeleteLog: StatementSync;
  floodgateClearLogs: StatementSync;

  quillGetAll: StatementSync;
  quillGetById: StatementSync;
  quillUpsert: StatementSync;
  quillDelete: StatementSync;
  quillClearAll: StatementSync;
}

export interface JsonRowMetadata {
  id?: string | undefined;
  date_key?: string | undefined;
  kind?: string | undefined;
  owner_profile_id?: string | undefined;
  visibility?: string | undefined;
  status?: string | undefined;
  pinned?: number | undefined;
  position?: number | undefined;
  revision?: number | undefined;
  data: string;
  updated_at: string;
}

export function isJsonRowMetadata(v: unknown): v is JsonRowMetadata {
  return isPlainObject(v) && typeof v.data === 'string' && typeof v.updated_at === 'string';
}

export interface DatabaseContext {
  db: DatabaseSync;
  dataDir: string;
  dbPath: string;
  activeJournalMode: 'WAL' | 'TRUNCATE';
  stmts: DbStatements;
  initLedgerStatements: () => void;
  runInTransaction: <T>(fn: () => T) => T;
  readHowardKey: <T>(
    key: string,
    fallback: T,
    guard?: (val: unknown) => val is T
  ) => { data: T; updatedAt: string };
  writeHowardKey: (key: string, value: unknown) => string;
  queryAll: <T>(stmt: StatementSync, guard: (row: unknown) => row is T) => T[];
  readTableJsonRows: (
    stmt: StatementSync,
    onRow: (parsed: Record<string, unknown>, row: JsonRowMetadata) => void
  ) => string;
  readDayJsonRow: <T extends Record<string, unknown>>(
    stmt: StatementSync,
    dateKey: string,
    baseRecord?: T
  ) => T;
  checkpointDatabase: () => void;
  close: () => void;
}

export function openDatabase(dataDir: string): DatabaseContext {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'howard.db');
  const db = new DatabaseSync(dbPath);
  const requestedJournal = String(process.env.SQLITE_JOURNAL_MODE || 'WAL').toUpperCase();
  let activeJournalMode: 'WAL' | 'TRUNCATE' = 'WAL';

  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  if (requestedJournal === 'TRUNCATE') {
    db.exec('PRAGMA journal_mode = TRUNCATE;');
    db.exec('PRAGMA synchronous = FULL;');
    activeJournalMode = 'TRUNCATE';
  } else {
    try {
      const modeRow = db.prepare('PRAGMA journal_mode = WAL').get() as
        | { journal_mode?: unknown }
        | undefined;
      const mode =
        typeof modeRow?.journal_mode === 'string' ? modeRow.journal_mode.toLowerCase() : '';
      if (mode === 'wal') {
        db.exec('PRAGMA synchronous = NORMAL;');
        activeJournalMode = 'WAL';
      } else {
        db.exec('PRAGMA journal_mode = TRUNCATE;');
        db.exec('PRAGMA synchronous = FULL;');
        activeJournalMode = 'TRUNCATE';
      }
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

    CREATE TABLE IF NOT EXISTS quill_notes (
      id TEXT PRIMARY KEY,
      owner_profile_id TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK (visibility IN ('shared', 'private')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'trashed')),
      pinned INTEGER NOT NULL DEFAULT 0,
      position REAL NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      data TEXT NOT NULL CHECK (json_valid(data)),
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_almanac_events_date_updated ON almanac_events (date_key ASC, updated_at ASC);
    CREATE INDEX IF NOT EXISTS idx_ledger_items_kind_updated ON ledger_items (kind, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bloom_molt_logs_date_updated ON bloom_molt_logs (date_key DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bloom_feeder_cultures_updated ON bloom_feeder_cultures (updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quill_notes_board ON quill_notes (visibility, owner_profile_id, status, pinned, position);
  `);

  const prepareLedgerStatements = () => ({
    ledgerCount: db.prepare('SELECT COUNT(*) AS cnt FROM ledger_items'),
    ledgerGetAll: db.prepare(
      'SELECT id, kind, data, updated_at FROM ledger_items ORDER BY updated_at DESC'
    ),
    ledgerGetById: db.prepare('SELECT id, kind, data, updated_at FROM ledger_items WHERE id = ?'),
    ledgerUpsert: db.prepare(`
      INSERT INTO ledger_items (id, kind, data, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        data = excluded.data,
        updated_at = excluded.updated_at
    `),
    ledgerDelete: db.prepare('DELETE FROM ledger_items WHERE id = ?'),
    ledgerClearAll: db.prepare('DELETE FROM ledger_items')
  });

  const stmts: DbStatements = {
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
    almanacGetById: db.prepare(
      'SELECT id, date_key, data, updated_at FROM almanac_events WHERE id = ?'
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

    ...prepareLedgerStatements(),

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
    floodgateClearLogs: db.prepare('DELETE FROM floodgate_logs'),

    quillGetAll: db.prepare(
      'SELECT id, owner_profile_id, visibility, status, pinned, position, revision, data, updated_at FROM quill_notes ORDER BY pinned DESC, position ASC, updated_at DESC'
    ),
    quillGetById: db.prepare(
      'SELECT id, owner_profile_id, visibility, status, pinned, position, revision, data, updated_at FROM quill_notes WHERE id = ?'
    ),
    quillUpsert: db.prepare(`
      INSERT INTO quill_notes (id, owner_profile_id, visibility, status, pinned, position, revision, data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        owner_profile_id = excluded.owner_profile_id,
        visibility = excluded.visibility,
        status = excluded.status,
        pinned = excluded.pinned,
        position = excluded.position,
        revision = excluded.revision,
        data = excluded.data,
        updated_at = excluded.updated_at
    `),
    quillDelete: db.prepare('DELETE FROM quill_notes WHERE id = ?'),
    quillClearAll: db.prepare('DELETE FROM quill_notes')
  };

  function initLedgerStatements(): void {
    const fresh = prepareLedgerStatements();
    stmts.ledgerCount = fresh.ledgerCount;
    stmts.ledgerGetAll = fresh.ledgerGetAll;
    stmts.ledgerGetById = fresh.ledgerGetById;
    stmts.ledgerUpsert = fresh.ledgerUpsert;
    stmts.ledgerDelete = fresh.ledgerDelete;
    stmts.ledgerClearAll = fresh.ledgerClearAll;
  }

  function queryAll<T>(stmt: StatementSync, guard: (row: unknown) => row is T): T[] {
    const rows = stmt.all();
    const out: T[] = [];
    for (const row of rows) {
      if (guard(row)) out.push(row);
    }
    return out;
  }

  function readHowardKey<T>(
    key: string,
    fallback: T,
    guard?: (val: unknown) => val is T
  ): { data: T; updatedAt: string } {
    const row = stmts.howardGet.get(key) as { data: string; updated_at: string } | undefined;
    if (!row) return { data: fallback, updatedAt: new Date().toISOString() };
    try {
      const parsed: unknown = JSON.parse(row.data);
      if (guard && !guard(parsed)) {
        console.error(`[SQLite] Invalid shape in howard_store key "${key}"; using fallback.`);
        return { data: fallback, updatedAt: row.updated_at };
      }
      if (!guard && fallback !== null) {
        if (Array.isArray(fallback) && !Array.isArray(parsed)) {
          console.error(`[SQLite] Expected array in howard_store key "${key}"; using fallback.`);
          return { data: fallback, updatedAt: row.updated_at };
        }
        if (isPlainObject(fallback) && !isPlainObject(parsed)) {
          console.error(`[SQLite] Expected object in howard_store key "${key}"; using fallback.`);
          return { data: fallback, updatedAt: row.updated_at };
        }
      }
      return { data: parsed as T, updatedAt: row.updated_at };
    } catch (err) {
      console.error(
        `[SQLite] Failed parsing howard_store key "${key}":`,
        err instanceof Error ? err.message : err
      );
      return { data: fallback, updatedAt: row.updated_at };
    }
  }

  function writeHowardKey(key: string, value: unknown): string {
    const nowIso = new Date().toISOString();
    stmts.howardUpsert.run(key, JSON.stringify(value), nowIso);
    return nowIso;
  }

  function readTableJsonRows(
    stmt: StatementSync,
    onRow: (parsed: Record<string, unknown>, row: JsonRowMetadata) => void
  ): string {
    const rows = queryAll(stmt, isJsonRowMetadata);
    let latestUpdatedAt = '';
    for (const row of rows) {
      try {
        const parsed: unknown = JSON.parse(row.data);
        if (isPlainObject(parsed)) {
          onRow(parsed, row);
        } else {
          console.error(
            `[SQLite] Non-object JSON row skipped (id=${row.id || row.date_key || 'unknown'}).`
          );
        }
        if (row.updated_at > latestUpdatedAt) latestUpdatedAt = row.updated_at;
      } catch (err) {
        console.error(
          `[SQLite] Malformed JSON row skipped (id=${row.id || row.date_key || 'unknown'}):`,
          err instanceof Error ? err.message : err
        );
      }
    }
    return latestUpdatedAt;
  }

  function readDayJsonRow<T extends Record<string, unknown>>(
    stmt: StatementSync,
    dateKey: string,
    baseRecord?: T
  ): T {
    const fallback = (baseRecord ? { ...baseRecord } : {}) as T;
    const existingRow = stmt.get(dateKey) as { data: string } | undefined;
    if (!existingRow) return fallback;
    try {
      const parsed: unknown = JSON.parse(existingRow.data);
      if (!isPlainObject(parsed)) {
        console.error(`[SQLite] Corrupted non-object day row for ${dateKey}.`);
        throw new Error(`Corrupted database record for ${dateKey}`);
      }
      return { ...fallback, ...parsed };
    } catch (err) {
      console.error(
        `[SQLite] Failed reading day row ${dateKey}:`,
        err instanceof Error ? err.message : err
      );
      throw err instanceof Error ? err : new Error(`Failed reading day row ${dateKey}`);
    }
  }

  let isClosed = false;

  function checkpointDatabase(): void {
    if (isClosed) return;
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (err) {
      console.warn('[SQLite] WAL checkpoint warning:', err instanceof Error ? err.message : err);
    }
  }

  function close(): void {
    if (isClosed) return;
    try {
      db.exec('PRAGMA optimize;');
    } catch {
      // ignore optimize errors
    }
    checkpointDatabase();
    isClosed = true;
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
    runInTransaction: <T>(fn: () => T) => runInTransaction(db, fn),
    readHowardKey,
    writeHowardKey,
    queryAll,
    readTableJsonRows,
    readDayJsonRow,
    checkpointDatabase,
    close
  };
}
