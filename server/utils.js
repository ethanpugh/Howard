import fs from 'node:fs';
import path from 'node:path';
import { VALID_DATE_KEY_RE } from '../shared/dateUtils.js';

export const LEGACY_DB_FILES = ['cadence.db', 'bloom.db', 'floodgate.db'];
export const CURRENT_SCHEMA_VERSION = 6;
export const VALID_LEDGER_KINDS = new Set(['expense', 'recurring', 'income']);
export const VALID_LEDGER_OWNERS = new Set(['joint', 'partner1', 'partner2']);

const RESERVED_PROFILE_NAMES = new Set(['both', 'pets', 'household', 'caregiver']);

export const createHttpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

export const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));

export function runInTransaction(db, fn) {
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

export function getSchemaVersion(dbInstance) {
  try {
    const row = dbInstance.prepare('PRAGMA user_version').get();
    return Number(row?.user_version || 0);
  } catch {
    return 0;
  }
}

export function validateProfileNameCandidate(rawName, errorPrefix = 'Name') {
  const cleaned = typeof rawName === 'string' ? rawName.trim() : '';
  if (!cleaned) {
    return { valid: false, cleaned, error: `${errorPrefix} cannot be empty` };
  }
  if (cleaned.length > 24) {
    return { valid: false, cleaned, error: `${errorPrefix} must be 24 characters or fewer` };
  }
  if (RESERVED_PROFILE_NAMES.has(cleaned.toLowerCase())) {
    return {
      valid: false,
      cleaned,
      error: `"${cleaned}" is reserved for household assignments`
    };
  }
  return { valid: true, cleaned, error: '' };
}

export function validateAlmanacEventFields(evt) {
  if (!isPlainObject(evt)) {
    return 'Invalid Almanac event payload';
  }
  if (typeof evt.title !== 'string' || !evt.title.trim()) {
    return 'Almanac event title cannot be empty';
  }
  if (typeof evt.date !== 'string' || !VALID_DATE_KEY_RE.test(evt.date)) {
    return 'Almanac event date must be YYYY-MM-DD';
  }
  return null;
}

export function vacuumSnapshotTo(dbInstance, destPath) {
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
