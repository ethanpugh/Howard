import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { isValidDateKey } from '../shared/dateUtils.ts';
import type { LedgerKind, LedgerOwner } from '../shared/schemas/ledger.ts';

export const LEGACY_DB_FILES = ['cadence.db', 'bloom.db', 'floodgate.db'] as const;
export const CURRENT_SCHEMA_VERSION = 7;
export const VALID_LEDGER_KINDS: ReadonlySet<LedgerKind> = new Set<LedgerKind>([
  'expense',
  'recurring',
  'income'
]);
export const VALID_LEDGER_OWNERS: ReadonlySet<LedgerOwner> = new Set<LedgerOwner>([
  'joint',
  'partner1',
  'partner2'
]);

const RESERVED_PROFILE_NAMES = new Set([
  'both',
  'pets',
  'household',
  'caregiver',
  'partner 1',
  'partner1',
  'partner 2',
  'partner2'
]);

export interface HttpError extends Error {
  statusCode: number;
}

export const createHttpError = (statusCode: number, message: string): HttpError => {
  const err = new Error(message) as HttpError;
  err.statusCode = statusCode;
  return err;
};

export const isHttpError = (err: unknown): err is HttpError => {
  if (!(err instanceof Error)) return false;
  if (!('statusCode' in err)) return false;
  const code = (err as { statusCode: unknown }).statusCode;
  return typeof code === 'number' && Number.isInteger(code) && code >= 400 && code <= 599;
};

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === 'object' && !Array.isArray(v));

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 32).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPinHash(
  candidatePin: string,
  stored: { pin?: string | undefined; pinHash?: string | undefined }
): boolean {
  const cleanedCandidate = String(candidatePin || '').trim();
  const storedHash = typeof stored.pinHash === 'string' ? stored.pinHash.trim() : '';
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    const salt = parts[1];
    const hashHex = parts[2];
    if (!salt || !hashHex) return false;
    try {
      const expected = Buffer.from(hashHex, 'hex');
      const actual = crypto.scryptSync(cleanedCandidate, salt, expected.length);
      return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }
  const legacyPin = typeof stored.pin === 'string' ? stored.pin.trim() : '';
  if (!legacyPin) return false;
  const a = Buffer.from(cleanedCandidate, 'utf8');
  const b = Buffer.from(legacyPin, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function runInTransaction<T>(db: DatabaseSync, fn: () => T): T {
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

export function getSchemaVersion(dbInstance: DatabaseSync): number {
  try {
    const row = dbInstance.prepare('PRAGMA user_version').get() as
      | { user_version?: number }
      | undefined;
    return Number(row?.user_version || 0);
  } catch {
    return 0;
  }
}

export interface ProfileNameValidationResult {
  valid: boolean;
  cleaned: string;
  error: string;
}

export function validateProfileNameCandidate(
  rawName: unknown,
  errorPrefix = 'Name'
): ProfileNameValidationResult {
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

export function validateAlmanacEventFields(evt: unknown): string | null {
  if (!isPlainObject(evt)) {
    return 'Invalid Almanac event payload';
  }
  if (typeof evt.title !== 'string' || !evt.title.trim()) {
    return 'Almanac event title cannot be empty';
  }
  if (typeof evt.date !== 'string' || !isValidDateKey(evt.date)) {
    return 'Almanac event date must be a valid calendar YYYY-MM-DD';
  }
  return null;
}

export function vacuumSnapshotTo(dbInstance: DatabaseSync, destPath: string): void {
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${destPath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
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
