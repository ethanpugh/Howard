import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AlmanacEvent } from '../shared/schemas/almanac.ts';
import type { BloomCareLog, BloomMoltRecord, BloomSnapshot } from '../shared/schemas/bloom.ts';
import type { CadenceDayLog, CadenceSnapshot } from '../shared/schemas/cadence.ts';
import type { FloodgateSnapshot } from '../shared/schemas/floodgate.ts';
import type { PublicProfile } from '../shared/schemas/profile.ts';
import type {
  DbInfo,
  HealthResponse,
  HowardProjectedState,
  RestoreResponse
} from '../shared/schemas/sync.ts';

interface SyncTestPayload {
  dbInfo: DbInfo;
  howard: HowardProjectedState;
  cadence: CadenceSnapshot;
  bloom: BloomSnapshot;
  floodgate: FloodgateSnapshot | null;
}

interface BackupTestPayload {
  howard: HowardProjectedState;
  cadence: CadenceSnapshot;
  bloom: BloomSnapshot;
  floodgate: FloodgateSnapshot;
}

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SERVER_ENTRY = path.join(REPO_ROOT, 'server.ts');
const STARTUP_TIMEOUT_MS = 10000;

function createTempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'howard-int-'));
}

function removeDirWithRetry(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function spawnServerProcess(dataDir: string) {
  return spawn(process.execPath, [SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: '0',
      TZ: 'Europe/London'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function startTestServer(prepareDataDirFn?: (dataDir: string) => void | Promise<void>) {
  const dataDir = createTempDataDir();
  try {
    if (typeof prepareDataDirFn === 'function') {
      await prepareDataDirFn(dataDir);
    }
  } catch (err) {
    removeDirWithRetry(dataDir);
    throw err;
  }

  const child = spawnServerProcess(dataDir);
  let stdout = '';
  let stderr = '';
  let processStopped = false;
  let dirRemoved = false;

  const closedPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      child.once('close', (code, signal) => {
        processStopped = true;
        resolve({ code, signal });
      });
    }
  );

  const stopProcess = async () => {
    if (!processStopped && child.exitCode === null && child.signalCode === null) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore if already terminated
      }
      let forceTimer: ReturnType<typeof setTimeout> | null = null;
      await Promise.race([
        closedPromise,
        new Promise<void>((resolve) => {
          forceTimer = setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              // ignore kill errors
            }
            resolve();
          }, 3000);
          forceTimer.unref?.();
        })
      ]);
      if (forceTimer) clearTimeout(forceTimer);
    }
    await closedPromise;
    processStopped = true;
  };

  const stop = async () => {
    await stopProcess();
    if (!dirRemoved) {
      dirRemoved = true;
      removeDirWithRetry(dataDir);
    }
  };

  const port = await new Promise<number>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `Timed out waiting for test server startup.\nstdout: ${stdout}\nstderr: ${stderr}`
        )
      );
    }, STARTUP_TIMEOUT_MS);
    timeout.unref?.();

    const finishError = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      const match = stdout.match(/listening on http:\/\/0\.0\.0\.0:(\d+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.once('error', (err) => {
      finishError(err);
    });

    void closedPromise.then(({ code, signal }) => {
      finishError(
        new Error(
          `Test server exited before listening (code=${code}, signal=${signal}).\nstdout: ${stdout}\nstderr: ${stderr}`
        )
      );
    });
  }).catch(async (err) => {
    await stop();
    throw err;
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    dataDir,
    port,
    stopProcess,
    stop,
    getLogs: () => ({ stdout, stderr })
  };
}

async function runServerExpectExit(prepareDataDirFn?: (dataDir: string) => void | Promise<void>) {
  const dataDir = createTempDataDir();
  try {
    if (typeof prepareDataDirFn === 'function') {
      await prepareDataDirFn(dataDir);
    }

    const child = spawnServerProcess(dataDir);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    const result = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        reject(
          new Error(`Expected server to exit immediately, but it stayed running.\nstdout: ${stdout}`)
        );
      }, STARTUP_TIMEOUT_MS);
      timeout.unref?.();

      child.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.once('close', (code, signal) => {
        clearTimeout(timeout);
        resolve({ code, signal, stdout, stderr });
      });
    });

    return result;
  } finally {
    removeDirWithRetry(dataDir);
  }
}

async function requestJson<T = Record<string, unknown>>(
  baseUrl: string,
  urlPath: string,
  {
    method = 'GET',
    body,
    headers = {}
  }: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const fetchOptions: RequestInit = {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    }
  };
  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${urlPath}`, fetchOptions);
  const text = await res.text();
  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json: json as T, text };
}

describe('1. SQLite Migrations & Schema v6 (runVersionedMigrations)', () => {
  it('migrates v0 howard.db blobs and legacy 4-DB files into schema v6 with constraints', async (t) => {
    const nowIso = '2026-04-10T10:00:00.000Z';

    const srv = await startTestServer((dataDir) => {
      const howardDb = new DatabaseSync(path.join(dataDir, 'howard.db'));
      try {
        howardDb.exec(`
          PRAGMA user_version = 0;
          CREATE TABLE howard_store (
            key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE ledger_items (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE notes (
            id TEXT PRIMARY KEY,
            body TEXT
          );
        `);

        const insertStore = howardDb.prepare(
          'INSERT INTO howard_store (key, data, updated_at) VALUES (?, ?, ?)'
        );
        insertStore.run(
          'profiles',
          JSON.stringify([
            {
              id: 'partner1',
              name: 'Partner 1',
              role: 'Household Member',
              color: 'teal',
              badgeEmoji: '⚡',
              pinEnabled: false,
              pin: '',
              allowedApps: ['foyer', 'cadence', 'jot', 'almanac', 'ledger', 'beacon'],
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
          ]),
          nowIso
        );
        insertStore.run(
          'almanac_events',
          JSON.stringify([
            {
              id: 'evt-legacy-1',
              title: 'Legacy Vet Checkup',
              date: '2026-04-15',
              assignedTo: 'Partner 1',
              category: 'pet'
            }
          ]),
          nowIso
        );
        insertStore.run(
          'ledger_data',
          JSON.stringify({
            splitRule: 'proportional',
            incomes: [
              { id: 'inc-legacy-1', title: 'Salary', amount: 3200, owner: 'partner1', frequency: 'monthly' }
            ],
            recurring: [
              { id: 'rec-legacy-1', title: 'Broadband', amount: 42, owner: 'joint', cycle: 'monthly' }
            ],
            expenses: [
              {
                id: 'exp-legacy-1',
                title: 'Pet Supplies',
                amount: 24.5,
                owner: 'joint',
                paidBy: 'partner1',
                date: '2026-04-10'
              }
            ]
          }),
          nowIso
        );
      } finally {
        howardDb.close();
      }

      const cadenceDb = new DatabaseSync(path.join(dataDir, 'cadence.db'));
      try {
        cadenceDb.exec(`
          CREATE TABLE household_settings (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
          CREATE TABLE medication_logs (date_key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
        `);
        cadenceDb
          .prepare('INSERT INTO household_settings (id, data, updated_at) VALUES (?, ?, ?)')
          .run(
            'config',
            JSON.stringify({
              catName: 'Pet',
              medicationName: 'Legacy Oral Solution',
              caregivers: ['Partner 1', 'Partner 2', 'Caregiver']
            }),
            nowIso
          );
        cadenceDb
          .prepare('INSERT INTO medication_logs (date_key, data, updated_at) VALUES (?, ?, ?)')
          .run(
            '2026-04-10',
            JSON.stringify({
              dateKey: '2026-04-10',
              morning: { given: true, givenBy: 'Partner 1', time: '08:05' }
            }),
            nowIso
          );
      } finally {
        cadenceDb.close();
      }

      const bloomDb = new DatabaseSync(path.join(dataDir, 'bloom.db'));
      try {
        bloomDb.exec(`
          CREATE TABLE bloom_settings (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
          CREATE TABLE care_logs (date_key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
          CREATE TABLE molt_logs (id TEXT PRIMARY KEY, date_key TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);
          CREATE TABLE feeder_cultures (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
        `);
        bloomDb
          .prepare('INSERT INTO bloom_settings (id, data, updated_at) VALUES (?, ?, ?)')
          .run(
            'config',
            JSON.stringify({
              mantisName: 'Mantis',
              currentInstar: 'L2',
              caregivers: ['Partner 1', 'Partner 2', 'Caregiver']
            }),
            nowIso
          );
        bloomDb
          .prepare('INSERT INTO care_logs (date_key, data, updated_at) VALUES (?, ?, ?)')
          .run(
            '2026-04-10',
            JSON.stringify({
              dateKey: '2026-04-10',
              mists: [{ id: 'mist-leg-1', by: 'Partner 1', timestamp: '2026-04-10T09:00:00.000Z' }],
              feedings: [],
              climateChecks: [],
              behaviors: []
            }),
            nowIso
          );
        bloomDb
          .prepare('INSERT INTO molt_logs (id, date_key, data, updated_at) VALUES (?, ?, ?, ?)')
          .run(
            'molt-leg-1',
            '2026-04-09',
            JSON.stringify({
              fromInstar: 'L1',
              toInstar: 'L2',
              loggedBy: 'Partner 2',
              quality: 'clean'
            }),
            nowIso
          );
        bloomDb
          .prepare('INSERT INTO feeder_cultures (id, data, updated_at) VALUES (?, ?, ?)')
          .run(
            'feeder-leg-1',
            JSON.stringify({
              name: 'Legacy Hydei Culture',
              feederType: 'hydei',
              startedDate: '2026-04-01',
              shelfLifeDays: 28,
              status: 'booming',
              active: true
            }),
            nowIso
          );
      } finally {
        bloomDb.close();
      }

      const floodgateDb = new DatabaseSync(path.join(dataDir, 'floodgate.db'));
      try {
        floodgateDb.exec(`
          CREATE TABLE app_settings (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
          CREATE TABLE daily_logs (date_key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
        `);
        floodgateDb
          .prepare('INSERT INTO app_settings (id, data, updated_at) VALUES (?, ?, ?)')
          .run(
            'config',
            JSON.stringify({ ownerName: 'Partner 2', appName: 'Floodgate' }),
            nowIso
          );
        floodgateDb
          .prepare('INSERT INTO daily_logs (date_key, data, updated_at) VALUES (?, ?, ?)')
          .run(
            '2026-04-10',
            JSON.stringify({ date: '2026-04-10', note: 'Legacy floodgate entry' }),
            nowIso
          );
      } finally {
        floodgateDb.close();
      }
    });

    t.after(async () => {
      await srv.stop();
    });

    const health = await requestJson<HealthResponse>(srv.baseUrl, '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.schemaVersion, 7);

    const syncRes = await requestJson<SyncTestPayload>(srv.baseUrl, '/api/howard/sync?profile=partner2');
    assert.equal(syncRes.status, 200);
    assert.equal(syncRes.json.dbInfo.schemaVersion, 7);

    const p1Profile = syncRes.json.howard.profiles.find((p) => p.id === 'partner1')!;
    assert.equal(p1Profile.allowedApps.includes('bloom'), true);
    assert.equal(p1Profile.allowedApps.includes('quill'), true);
    assert.equal((p1Profile.allowedApps as string[]).includes('jot'), false);

    assert.equal(syncRes.json.howard.almanacEvents.length, 1);
    assert.equal(syncRes.json.howard.almanacEvents[0]?.id, 'evt-legacy-1');
    assert.equal(syncRes.json.howard.almanacEvents[0]?.assignedToProfileId, 'partner1');

    assert.equal(syncRes.json.howard.ledgerData.splitRule, 'proportional');
    assert.equal(syncRes.json.howard.ledgerData.expenses[0]?.id, 'exp-legacy-1');
    assert.equal(syncRes.json.howard.ledgerData.recurring[0]?.id, 'rec-legacy-1');
    assert.equal(syncRes.json.howard.ledgerData.incomes[0]?.id, 'inc-legacy-1');

    assert.equal(syncRes.json.cadence.settings.medicationName, 'Legacy Oral Solution');
    assert.equal(syncRes.json.cadence.logsByDate['2026-04-10']?.morning?.givenByProfileId, 'partner1');

    assert.equal(syncRes.json.bloom.logsByDate['2026-04-10']?.mists?.[0]?.id, 'mist-leg-1');
    assert.equal(syncRes.json.bloom.logsByDate['2026-04-10']?.mists?.[0]?.byProfileId, 'partner1');
    assert.equal(syncRes.json.bloom.molts[0]?.id, 'molt-leg-1');
    assert.equal(syncRes.json.bloom.molts[0]?.loggedByProfileId, 'partner2');
    assert.equal(syncRes.json.bloom.feeders[0]?.id, 'feeder-leg-1');

    assert.equal(
      syncRes.json.floodgate?.logsByDate['2026-04-10']?.note,
      'Legacy floodgate entry'
    );

    // Legacy standalone DB files must be removed from dataDir and archived under backups/legacy-4db-*
    for (const legacyFile of ['cadence.db', 'bloom.db', 'floodgate.db']) {
      assert.equal(fs.existsSync(path.join(srv.dataDir, legacyFile)), false);
    }

    const backupsDir = path.join(srv.dataDir, 'backups');
    const archiveEntries = fs
      .readdirSync(backupsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('legacy-4db-'));
    assert.equal(archiveEntries.length, 1);

    const archiveDirPath = path.join(backupsDir, archiveEntries[0]!.name);
    for (const expectedArchiveFile of ['howard.db', 'cadence.db', 'bloom.db', 'floodgate.db']) {
      assert.equal(fs.existsSync(path.join(archiveDirPath, expectedArchiveFile)), true);
    }

    // Stop child cleanly before inspecting howard.db directly and testing CHECK constraints
    await srv.stopProcess();

    const db = new DatabaseSync(path.join(srv.dataDir, 'howard.db'));
    try {
      const versionRow = db.prepare('PRAGMA user_version').get() as { user_version: number };
      assert.equal(versionRow.user_version, 7);

      const staleStoreCount = db
        .prepare(
          "SELECT COUNT(*) AS cnt FROM howard_store WHERE key IN ('almanac_events', 'ledger_data')"
        )
        .get() as { cnt: number };
      assert.equal(Number(staleStoreCount.cnt), 0);

      for (const expectedKey of [
        'profiles',
        'ledger_settings',
        'cadence_settings',
        'bloom_settings',
        'floodgate_settings',
        'quill_settings',
        'beacon_info'
      ]) {
        const keyRow = db.prepare('SELECT key FROM howard_store WHERE key = ?').get(expectedKey);
        assert.ok(keyRow, `Expected ${expectedKey} in howard_store`);
      }

      const notesTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes'")
        .get();
      assert.equal(notesTable, undefined);

      assert.equal(
        Number((db.prepare('SELECT COUNT(*) AS cnt FROM almanac_events').get() as { cnt: number }).cnt),
        1
      );
      assert.equal(
        Number((db.prepare('SELECT COUNT(*) AS cnt FROM ledger_items').get() as { cnt: number }).cnt),
        3
      );
      assert.equal(
        Number((db.prepare('SELECT COUNT(*) AS cnt FROM cadence_logs').get() as { cnt: number }).cnt),
        1
      );
      assert.equal(
        Number((db.prepare('SELECT COUNT(*) AS cnt FROM bloom_care_logs').get() as { cnt: number }).cnt),
        1
      );
      assert.equal(
        Number((db.prepare('SELECT COUNT(*) AS cnt FROM bloom_molt_logs').get() as { cnt: number }).cnt),
        1
      );
      assert.equal(
        Number(
          (db.prepare('SELECT COUNT(*) AS cnt FROM bloom_feeder_cultures').get() as { cnt: number }).cnt
        ),
        1
      );
      assert.equal(
        Number((db.prepare('SELECT COUNT(*) AS cnt FROM floodgate_logs').get() as { cnt: number }).cnt),
        1
      );

      assert.throws(() => {
        db.prepare(
          'INSERT INTO ledger_items (id, kind, data, updated_at) VALUES (?, ?, ?, ?)'
        ).run('bad-ledger', 'invalid_kind', '{}', nowIso);
      }, /CHECK constraint failed/i);

      assert.throws(() => {
        db.prepare(
          'INSERT INTO almanac_events (id, date_key, data, updated_at) VALUES (?, ?, ?, ?)'
        ).run('bad-almanac', '2026-05-01', '{not-valid-json', nowIso);
      }, /CHECK constraint failed/i);
    } finally {
      db.close();
    }
  });

  it('refuses to start against a newer schema version (PRAGMA user_version = 99)', async () => {
    const result = await runServerExpectExit((dataDir) => {
      const db = new DatabaseSync(path.join(dataDir, 'howard.db'));
      try {
        db.exec('PRAGMA user_version = 99;');
      } finally {
        db.close();
      }
    });

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /schema version 99.*refusing downgrade/i);
  });
});

describe('2. DB-ARCH-2 Rename Propagation & Custom Caregiver Attribution', () => {
  it('propagates profile renames live across modules while preserving unlinked custom caregiver names', async (t) => {
    const srv = await startTestServer();
    t.after(async () => {
      await srv.stop();
    });

    // 1. Cadence dose by Partner 1 and unlinked custom caregiver 'Auntie'
    const day1Res = await requestJson<{ record: CadenceDayLog }>(srv.baseUrl, '/api/cadence/logs/2026-05-10', {
      method: 'PUT',
      body: {
        morning: { given: true, givenBy: 'Partner 1', time: '08:00' },
        evening: { given: true, givenBy: 'Auntie', givenByProfileId: null, time: '20:00' }
      }
    });
    assert.equal(day1Res.status, 200);
    assert.equal(day1Res.json.record.morning?.givenByProfileId, 'partner1');
    assert.equal(day1Res.json.record.evening?.givenBy, 'Auntie');
    assert.equal(day1Res.json.record.evening?.givenByProfileId, null);

    // Legacy payload with recordedByUid and NO givenByProfileId: enrichDoseSlot must NOT overwrite 'Auntie'
    const legacyDayRes = await requestJson<{ record: CadenceDayLog }>(srv.baseUrl, '/api/cadence/logs/2026-05-11', {
      method: 'PUT',
      body: {
        morning: {
          given: true,
          givenBy: 'Auntie',
          recordedByUid: 'howard-partner1',
          time: '08:15'
        }
      }
    });
    assert.equal(legacyDayRes.status, 200);
    assert.equal(legacyDayRes.json.record.morning?.givenBy, 'Auntie');
    assert.equal(legacyDayRes.json.record.morning?.givenByProfileId, null);
    assert.equal(
      Object.prototype.hasOwnProperty.call(legacyDayRes.json.record.morning, 'recordedByUid'),
      false
    );

    // 2. Bloom mist, feeding, and molt logged by Partner 1
    const bloomDayRes = await requestJson<{ record: BloomCareLog }>(srv.baseUrl, '/api/bloom/logs/2026-05-10', {
      method: 'PUT',
      body: {
        appendMist: {
          id: 'mist-p1-1',
          by: 'Partner 1',
          timestamp: '2026-05-10T09:00:00.000Z'
        },
        appendFeeding: {
          id: 'feed-p1-1',
          by: 'Partner 1',
          preyLabel: 'D. hydei',
          count: 2,
          outcome: 'eaten',
          timestamp: '2026-05-10T12:00:00.000Z'
        }
      }
    });
    assert.equal(bloomDayRes.status, 200);
    assert.equal(bloomDayRes.json.record.mists?.[0]?.byProfileId, 'partner1');
    assert.equal(bloomDayRes.json.record.feedings?.[0]?.byProfileId, 'partner1');

    const moltRes = await requestJson<{ molt: BloomMoltRecord }>(srv.baseUrl, '/api/bloom/molts?profile=partner1', {
      method: 'POST',
      body: {
        id: 'molt-p1-1',
        dateKey: '2026-05-10',
        fromInstar: 'L2',
        toInstar: 'L3',
        lengthMm: 14,
        loggedBy: 'Partner 1',
        quality: 'clean'
      }
    });
    assert.equal(moltRes.status, 200);
    assert.equal(moltRes.json.molt.loggedByProfileId, 'partner1');

    // 3. Almanac medical event assigned to Partner 2
    const evtRes = await requestJson<{ event: AlmanacEvent }>(srv.baseUrl, '/api/howard/almanac/events/evt-p2-med?profile=partner2', {
      method: 'PUT',
      body: {
        title: 'Specialist Follow-up',
        date: '2026-05-20',
        assignedTo: 'Partner 2',
        category: 'medical',
        linkToGpReport: true
      }
    });
    assert.equal(evtRes.status, 200);
    assert.equal(evtRes.json.event.assignedToProfileId, 'partner2');

    // 4. Verify initial Beacon contact c-partner1 before rename
    const preRenameSync = await requestJson<SyncTestPayload>(srv.baseUrl, '/api/howard/sync?profile=partner2');
    assert.equal(preRenameSync.status, 200);
    const preContactP1 = preRenameSync.json.howard.beaconInfo.contacts.find(
      (c) => c.id === 'c-partner1'
    );
    assert.equal(preContactP1?.name, 'Partner 1');

    // 5. Rename Partner 1 -> 'Alex' and Partner 2 -> 'Jordan'
    const renameP1 = await requestJson<{ profiles: PublicProfile[] }>(srv.baseUrl, '/api/howard/profiles/name?profile=partner1', {
      method: 'PUT',
      body: { profileId: 'partner1', name: 'Alex' }
    });
    assert.equal(renameP1.status, 200);
    assert.equal(renameP1.json.profiles.find((p) => p.id === 'partner1')?.name, 'Alex');

    const renameP2 = await requestJson<{ profiles: PublicProfile[] }>(srv.baseUrl, '/api/howard/profiles/name?profile=partner1', {
      method: 'PUT',
      body: { profileId: 'partner2', name: 'Jordan' }
    });
    assert.equal(renameP2.status, 200);
    assert.equal(renameP2.json.profiles.find((p) => p.id === 'partner2')?.name, 'Jordan');

    // 6. Verify /api/howard/sync?profile=partner2 reflects live rename propagation
    const postRenameSync = await requestJson<SyncTestPayload>(srv.baseUrl, '/api/howard/sync?profile=partner2');
    assert.equal(postRenameSync.status, 200);

    const { howard, cadence, bloom, floodgate } = postRenameSync.json;
    assert.equal(cadence.logsByDate['2026-05-10']?.morning?.givenBy, 'Alex');
    assert.equal(cadence.logsByDate['2026-05-10']?.evening?.givenBy, 'Auntie');
    assert.equal(cadence.logsByDate['2026-05-10']?.evening?.givenByProfileId, null);
    assert.equal(cadence.logsByDate['2026-05-11']?.morning?.givenBy, 'Auntie');
    assert.equal(cadence.logsByDate['2026-05-11']?.morning?.givenByProfileId, null);

    assert.equal(bloom.logsByDate['2026-05-10']?.mists?.[0]?.by, 'Alex');
    assert.equal(bloom.logsByDate['2026-05-10']?.feedings?.[0]?.by, 'Alex');
    assert.equal(bloom.molts.find((m) => m.id === 'molt-p1-1')?.loggedBy, 'Alex');

    assert.equal(howard.beaconInfo.contacts.find((c) => c.id === 'c-partner1')?.name, 'Alex');
    assert.equal(howard.beaconInfo.contacts.find((c) => c.id === 'c-partner2')?.name, 'Jordan');

    assert.equal(howard.almanacEvents.find((e) => e.id === 'evt-p2-med')?.assignedTo, 'Jordan');
    assert.equal(floodgate?.settings.ownerName, 'Jordan');
    assert.equal(cadence.settings.caregivers.includes('Alex'), true);
    assert.equal(cadence.settings.caregivers.includes('Jordan'), true);
    assert.equal(bloom.settings.caregivers.includes('Alex'), true);
    assert.equal(bloom.settings.caregivers.includes('Jordan'), true);

    // 7. Validation checks on PUT /api/howard/profiles/name
    const badCaregiverRename = await requestJson(srv.baseUrl, '/api/howard/profiles/name?profile=partner1', {
      method: 'PUT',
      body: { profileId: 'caregiver', name: 'Guest' }
    });
    assert.equal(badCaregiverRename.status, 400);

    const badHousehold = await requestJson(srv.baseUrl, '/api/howard/profiles/name?profile=partner1', {
      method: 'PUT',
      body: { profileId: 'partner1', name: 'household' }
    });
    assert.equal(badHousehold.status, 400);

    const badBoth = await requestJson(srv.baseUrl, '/api/howard/profiles/name?profile=partner1', {
      method: 'PUT',
      body: { profileId: 'partner1', name: 'both' }
    });
    assert.equal(badBoth.status, 400);

    const badTooLong = await requestJson(srv.baseUrl, '/api/howard/profiles/name?profile=partner1', {
      method: 'PUT',
      body: { profileId: 'partner1', name: 'A'.repeat(25) }
    });
    assert.equal(badTooLong.status, 400);
  });
});

describe('3. Household RBAC & Server Input Validation', () => {
  it('enforces profile RBAC boundaries and validates invalid inputs with 400', async (t) => {
    const srv = await startTestServer();
    t.after(async () => {
      await srv.stop();
    });

    // Seed Almanac, Ledger, and Floodgate data
    assert.equal(
      (
        await requestJson(srv.baseUrl, '/api/howard/almanac/events/evt-p2-med?profile=partner2', {
          method: 'PUT',
          body: {
            title: 'Private Medical Appointment',
            date: '2026-05-15',
            assignedTo: 'Partner 2',
            category: 'medical'
          }
        })
      ).status,
      200
    );
    assert.equal(
      (
        await requestJson(srv.baseUrl, '/api/howard/almanac/events/evt-p2-gp?profile=partner2', {
          method: 'PUT',
          body: {
            title: 'Private GP Report Link',
            date: '2026-05-16',
            assignedTo: 'Partner 2',
            category: 'personal',
            linkToGpReport: true
          }
        })
      ).status,
      200
    );
    assert.equal(
      (
        await requestJson(srv.baseUrl, '/api/howard/almanac/events/evt-shared?profile=partner1', {
          method: 'PUT',
          body: {
            title: 'Shared Household Bin Day',
            date: '2026-05-17',
            assignedTo: 'Both',
            category: 'general'
          }
        })
      ).status,
      200
    );

    assert.equal(
      (
        await requestJson(srv.baseUrl, '/api/howard/ledger/items/exp-1?profile=partner1', {
          method: 'PUT',
          body: {
            kind: 'expense',
            title: 'Groceries',
            amount: 55.25,
            owner: 'joint',
            paidBy: 'partner1',
            date: '2026-05-10'
          }
        })
      ).status,
      200
    );
    assert.equal(
      (
        await requestJson(srv.baseUrl, '/api/howard/ledger/items/rec-1?profile=partner1', {
          method: 'PUT',
          body: {
            kind: 'recurring',
            title: 'Utilities',
            amount: 140,
            owner: 'joint',
            cycle: 'monthly'
          }
        })
      ).status,
      200
    );
    assert.equal(
      (
        await requestJson(srv.baseUrl, '/api/howard/ledger/items/inc-1?profile=partner1', {
          method: 'PUT',
          body: {
            kind: 'income',
            title: 'Monthly Pay',
            amount: 3100,
            owner: 'partner1',
            frequency: 'monthly'
          }
        })
      ).status,
      200
    );

    assert.equal(
      (
        await requestJson(srv.baseUrl, '/api/floodgate/logs/2026-05-10?profile=partner2', {
          method: 'PUT',
          body: { note: 'Seeded Partner 2 log' }
        })
      ).status,
      200
    );

    // 1. /api/howard/backup RBAC
    assert.equal((await requestJson(srv.baseUrl, '/api/howard/backup')).status, 403);
    assert.equal((await requestJson(srv.baseUrl, '/api/howard/backup?profile=')).status, 403);
    assert.equal(
      (await requestJson(srv.baseUrl, '/api/howard/backup?profile=caregiver')).status,
      403
    );

    for (const allowedProfile of ['partner1', 'partner2']) {
      const backupRes = await requestJson<BackupTestPayload>(
        srv.baseUrl,
        `/api/howard/backup?profile=${allowedProfile}`
      );
      assert.equal(backupRes.status, 200);
      assert.ok(backupRes.json.floodgate);
      assert.ok(backupRes.json.floodgate.settings);
      assert.ok(backupRes.json.floodgate.logsByDate);
      assert.equal(Array.isArray(backupRes.json.cadence.settings.caregiverItems), true);
      assert.equal(Array.isArray(backupRes.json.bloom.settings.caregiverItems), true);
    }

    // 2. /api/howard/sync?profile=caregiver strips Almanac, Ledger, and Floodgate
    const caregiverSync = await requestJson<SyncTestPayload>(srv.baseUrl, '/api/howard/sync?profile=caregiver');
    assert.equal(caregiverSync.status, 200);
    assert.deepEqual(caregiverSync.json.howard.almanacEvents, []);
    assert.deepEqual(caregiverSync.json.howard.ledgerData.expenses, []);
    assert.deepEqual(caregiverSync.json.howard.ledgerData.recurring, []);
    assert.deepEqual(caregiverSync.json.howard.ledgerData.incomes, []);
    assert.equal(caregiverSync.json.floodgate, null);

    // 3. /api/howard/sync?profile=partner1 hides Partner 2 private medical/GP events while keeping 'Both'
    const p1Sync = await requestJson<SyncTestPayload>(srv.baseUrl, '/api/howard/sync?profile=partner1');
    assert.equal(p1Sync.status, 200);
    const p1EventIds = p1Sync.json.howard.almanacEvents.map((e) => e.id);
    assert.equal(p1EventIds.includes('evt-p2-med'), false);
    assert.equal(p1EventIds.includes('evt-p2-gp'), false);
    assert.equal(p1EventIds.includes('evt-shared'), true);
    assert.equal(p1Sync.json.floodgate, null);

    const p2Sync = await requestJson<SyncTestPayload>(srv.baseUrl, '/api/howard/sync?profile=partner2');
    assert.equal(p2Sync.status, 200);
    const p2EventIds = p2Sync.json.howard.almanacEvents.map((e) => e.id);
    assert.equal(p2EventIds.includes('evt-p2-med'), true);
    assert.equal(p2EventIds.includes('evt-p2-gp'), true);
    assert.equal(p2EventIds.includes('evt-shared'), true);
    assert.ok(p2Sync.json.floodgate);

    // 4. /api/floodgate/* RBAC
    for (const deniedQuery of ['', '?profile=caregiver', '?profile=partner1']) {
      assert.equal(
        (await requestJson(srv.baseUrl, `/api/floodgate/state${deniedQuery}`)).status,
        403
      );
      assert.equal(
        (
          await requestJson(srv.baseUrl, `/api/floodgate/logs/2026-05-12${deniedQuery}`, {
            method: 'PUT',
            body: { note: 'Unauthorized write' }
          })
        ).status,
        403
      );
      assert.equal(
        (
          await requestJson(srv.baseUrl, `/api/floodgate/settings${deniedQuery}`, {
            method: 'PUT',
            body: { appName: 'Floodgate' }
          })
        ).status,
        403
      );
    }

    assert.equal(
      (await requestJson(srv.baseUrl, '/api/floodgate/state?profile=partner2')).status,
      200
    );
    assert.equal(
      (
        await requestJson(srv.baseUrl, '/api/floodgate/logs/2026-05-12?profile=partner2', {
          method: 'PUT',
          body: { note: 'Authorized write' }
        })
      ).status,
      200
    );
    assert.equal(
      (
        await requestJson(srv.baseUrl, '/api/floodgate/settings?profile=partner2', {
          method: 'PUT',
          body: { appName: 'Floodgate' }
        })
      ).status,
      200
    );

    // 5. Server input validation 400 responses
    const badAlmanacTitle = await requestJson(
      srv.baseUrl,
      '/api/howard/almanac/events/evt-bad-title?profile=partner1',
      {
        method: 'PUT',
        body: { title: '   ', date: '2026-05-10' }
      }
    );
    assert.equal(badAlmanacTitle.status, 400);

    const badAlmanacDate = await requestJson(
      srv.baseUrl,
      '/api/howard/almanac/events/evt-bad-date?profile=partner1',
      {
        method: 'PUT',
        body: { title: 'Vet Check', date: '10-05-2026' }
      }
    );
    assert.equal(badAlmanacDate.status, 400);

    const badLedgerNegAmount = await requestJson(
      srv.baseUrl,
      '/api/howard/ledger/items/exp-bad-neg?profile=partner1',
      {
        method: 'PUT',
        body: { kind: 'expense', title: 'Refund', amount: -15, owner: 'joint', paidBy: 'partner1' }
      }
    );
    assert.equal(badLedgerNegAmount.status, 400);

    const badLedgerOwner = await requestJson(
      srv.baseUrl,
      '/api/howard/ledger/items/exp-bad-owner?profile=partner1',
      {
        method: 'PUT',
        body: {
          kind: 'expense',
          title: 'Unknown Payer',
          amount: 20,
          owner: 'outsider',
          paidBy: 'partner1'
        }
      }
    );
    assert.equal(badLedgerOwner.status, 400);

    const badBloomFeeder = await requestJson(srv.baseUrl, '/api/bloom/feeders/feeder-bad?profile=partner1', {
      method: 'PUT',
      body: { name: 'D. hydei', shelfLifeDays: -5 }
    });
    assert.equal(badBloomFeeder.status, 400);

    // 6. Hardened Caregiver 403 RBAC & Partner-permitted live-prey update (SEC-04)
    for (const [method, url, body] of [
      ['PUT', '/api/howard/profiles/name?profile=caregiver', { profileId: 'partner1', name: 'X' }],
      ['PUT', '/api/howard/almanac/events/evt-cg?profile=caregiver', { title: 'Test', date: '2026-05-10' }],
      ['PUT', '/api/howard/ledger/items/exp-cg?profile=caregiver', { kind: 'expense', title: 'X', amount: 1 }],
      ['PUT', '/api/howard/beacon?profile=caregiver', { contacts: [] }],
      ['PUT', '/api/cadence/settings?profile=caregiver', { medicationName: 'X' }],
      ['PUT', '/api/bloom/settings?profile=caregiver', { spiderName: 'X' }],
      ['POST', '/api/bloom/molts?profile=caregiver', { dateKey: '2026-05-10', fromInstar: 'L2', toInstar: 'L3' }],
      ['PUT', '/api/bloom/feeders/f-cg?profile=caregiver', { name: 'Roach' }]
    ] as const) {
      const denied = await requestJson(srv.baseUrl, url, { method, body });
      assert.equal(denied.status, 403, `Expected 403 for ${method} ${url}`);
    }

    const cgLivePreyClear = await requestJson(srv.baseUrl, '/api/bloom/settings?profile=caregiver', {
      method: 'PUT',
      body: { livePreyInside: false, livePreyNote: '', livePreyAt: null, livePreyBy: 'Caregiver', livePreyByProfileId: 'caregiver' }
    });
    assert.equal(cgLivePreyClear.status, 200);

    // 7. Partner 1 Almanac privacy & Ledger cross-kind conflict (SEC-03, DB-03)
    const p1DeleteP2Med = await requestJson(
      srv.baseUrl,
      '/api/howard/almanac/events/evt-p2-med?profile=partner1',
      { method: 'DELETE' }
    );
    assert.equal(p1DeleteP2Med.status, 404);

    const p1BatchDeleteHidden = await requestJson(
      srv.baseUrl,
      '/api/howard/almanac/events/batch?profile=partner1',
      {
        method: 'POST',
        body: { deleteIds: ['evt-p2-med'] }
      }
    );
    assert.equal(p1BatchDeleteHidden.status, 404);

    const p1BatchRes = await requestJson(
      srv.baseUrl,
      '/api/howard/almanac/events/batch?profile=partner1',
      {
        method: 'POST',
        body: {
          upserts: [{ id: 'evt-p1-new', title: 'P1 Task', date: '2026-05-18', category: 'general' }]
        }
      }
    );
    assert.equal(p1BatchRes.status, 200);
    const p1BatchIds = (p1BatchRes.json.almanacEvents as Array<{ id: string }>).map((e) => e.id);
    assert.equal(p1BatchIds.includes('evt-p2-med'), false);
    assert.equal(p1BatchIds.includes('evt-p1-new'), true);

    const crossKindRes = await requestJson(srv.baseUrl, '/api/howard/ledger/items/exp-1?profile=partner1', {
      method: 'PUT',
      body: { kind: 'income', title: 'Flip Attempt', amount: 50, owner: 'partner1', frequency: 'monthly' }
    });
    assert.equal(crossKindRes.status, 409);

    // 8. scrypt PIN hashing, backup redaction & rate limit (SEC-07)
    const setPinRes = await requestJson(srv.baseUrl, '/api/howard/profiles/pin?profile=partner2', {
      method: 'PUT',
      body: { profileId: 'partner2', pinEnabled: true, newPin: '2468' }
    });
    assert.equal(setPinRes.status, 200);

    const backupAfterPin = await requestJson<BackupTestPayload>(srv.baseUrl, '/api/howard/backup?profile=partner1');
    assert.equal(backupAfterPin.status, 200);
    const p2BackupProfile = backupAfterPin.json.howard.profiles.find(
      (p) => p.id === 'partner2'
    );
    assert.equal('pin' in (p2BackupProfile || {}), false);

    const goodVerify = await requestJson(srv.baseUrl, '/api/howard/profiles/verify-pin?profile=partner2', {
      method: 'POST',
      body: { profileId: 'partner2', pin: '2468' }
    });
    assert.equal(goodVerify.status, 200);
    assert.equal(goodVerify.json.verified, true);

    for (let i = 0; i < 5; i += 1) {
      const badVerify = await requestJson(srv.baseUrl, '/api/howard/profiles/verify-pin?profile=partner2', {
        method: 'POST',
        body: { profileId: 'partner2', pin: '0000' }
      });
      assert.equal(badVerify.status, 401);
      assert.equal(badVerify.json.verified, false);
    }
    const lockedVerify = await requestJson(srv.baseUrl, '/api/howard/profiles/verify-pin?profile=partner2', {
      method: 'POST',
      body: { profileId: 'partner2', pin: '2468' }
    });
    assert.equal(lockedVerify.status, 429);
  });
});

describe('4. Backup, Deep-Merge Restore, Rollback & VACUUM INTO Snapshots', () => {
  it('performs deep-merge restore with pre-restore VACUUM INTO integrity check and rejects invalid/unauthorized restores', async (t) => {
    const srv = await startTestServer();
    t.after(async () => {
      await srv.stop();
    });

    // 1. Seed existing Cadence day with morning dose, Bloom day with 1 mist, and Beacon contacts
    assert.equal(
      (
        await requestJson(srv.baseUrl, '/api/cadence/logs/2026-05-12', {
          method: 'PUT',
          body: {
            morning: { given: true, givenBy: 'Partner 1', time: '08:00' }
          }
        })
      ).status,
      200
    );

    assert.equal(
      (
        await requestJson(srv.baseUrl, '/api/bloom/logs/2026-05-12', {
          method: 'PUT',
          body: {
            appendMist: {
              id: 'mist-existing-1',
              by: 'Partner 1',
              timestamp: '2026-05-12T08:30:00.000Z'
            }
          }
        })
      ).status,
      200
    );

    assert.equal(
      (
        await requestJson(srv.baseUrl, '/api/howard/beacon?profile=partner1', {
          method: 'PUT',
          body: {
            contacts: [
              {
                id: 'c-partner1',
                profileId: 'partner1',
                name: 'Partner 1',
                role: 'Household Member',
                phone: '07700 900001',
                note: ''
              },
              {
                id: 'c-partner2',
                profileId: 'partner2',
                name: 'Partner 2',
                role: 'Household Member',
                phone: '07700 900002',
                note: ''
              },
              {
                id: 'c-vet-1',
                profileId: null,
                name: 'Emergency Vet',
                role: 'Veterinarian',
                phone: '07700 900003',
                note: '24h clinic'
              }
            ]
          }
        })
      ).status,
      200
    );

    // 2. Partner 2 cannot restore backups (403)
    const p2Restore = await requestJson(srv.baseUrl, '/api/howard/restore?profile=partner2', {
      method: 'POST',
      body: {
        schemaVersion: 5,
        mode: 'merge',
        cadence: { logsByDate: {} }
      }
    });
    assert.equal(p2Restore.status, 403);

    // 3. Invalid restore payloads must return 400 without mutating DB state or creating snapshots
    const badSchemaRestore = await requestJson(
      srv.baseUrl,
      '/api/howard/restore?profile=partner1',
      {
        method: 'POST',
        body: {
          schemaVersion: 999,
          mode: 'replace',
          howard: {
            profiles: [{ id: 'partner1', name: 'Mutated' }]
          }
        }
      }
    );
    assert.equal(badSchemaRestore.status, 400);

    const dupProfileRestore = await requestJson(
      srv.baseUrl,
      '/api/howard/restore?profile=partner1',
      {
        method: 'POST',
        body: {
          schemaVersion: 5,
          mode: 'merge',
          howard: {
            profiles: [
              { id: 'partner1', name: 'Alex' },
              { id: 'partner2', name: 'alex' }
            ]
          },
          cadence: {
            logsByDate: {
              '2026-05-12': {
                evening: { given: true, givenBy: 'Partner 2', time: '20:00' }
              }
            }
          }
        }
      }
    );
    assert.equal(dupProfileRestore.status, 400);

    // Confirm state remained untouched and no pre-restore-* snapshot was created by rejected payloads
    const preSync = await requestJson<SyncTestPayload>(srv.baseUrl, '/api/howard/sync?profile=partner1');
    assert.equal(preSync.status, 200);
    assert.equal(
      preSync.json.howard.profiles.find((p) => p.id === 'partner1')?.name,
      'Partner 1'
    );
    assert.equal(preSync.json.cadence.logsByDate['2026-05-12']?.morning?.given, true);
    assert.equal(preSync.json.cadence.logsByDate['2026-05-12']?.evening, undefined);
    assert.equal(preSync.json.bloom.logsByDate['2026-05-12']?.mists?.length, 1);
    assert.equal(preSync.json.bloom.logsByDate['2026-05-12']?.feedings?.length, 0);

    const backupsDir = path.join(srv.dataDir, 'backups');
    if (fs.existsSync(backupsDir)) {
      const rejectedSnapshots = fs
        .readdirSync(backupsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('pre-restore-'));
      assert.equal(rejectedSnapshots.length, 0);
    }

    // 4. Deep-merge restore via POST /api/howard/restore?profile=partner1
    const mergeRes = await requestJson<RestoreResponse>(srv.baseUrl, '/api/howard/restore?profile=partner1', {
      method: 'POST',
      body: {
        schemaVersion: 5,
        mode: 'merge',
        howard: {
          beaconInfo: {
            contacts: [
              {
                id: 'c-sitter-1',
                profileId: null,
                name: 'Auntie',
                role: 'Pet Sitter',
                phone: '07700 900004',
                note: 'Weekend backup'
              }
            ]
          }
        },
        cadence: {
          logsByDate: {
            '2026-05-12': {
              evening: { given: true, givenBy: 'Partner 2', time: '20:00' }
            }
          }
        },
        bloom: {
          logsByDate: {
            '2026-05-12': {
              feedings: [
                {
                  id: 'feed-merged-1',
                  by: 'Partner 2',
                  preyLabel: 'D. hydei',
                  count: 2,
                  outcome: 'eaten',
                  timestamp: '2026-05-12T18:00:00.000Z'
                }
              ]
            }
          }
        }
      }
    });
    assert.equal(mergeRes.status, 200);
    assert.equal(mergeRes.json.restored, true);
    assert.equal(mergeRes.json.mode, 'merge');
    assert.match(mergeRes.json.preRestoreSnapshot, /^pre-restore-/);

    // Verify pre-restore VACUUM INTO snapshot exists and passes PRAGMA integrity_check
    const snapshotDirs = fs
      .readdirSync(backupsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('pre-restore-'));
    assert.equal(snapshotDirs.length, 1);
    assert.equal(snapshotDirs[0]!.name, mergeRes.json.preRestoreSnapshot);

    const snapshotDbPath = path.join(backupsDir, snapshotDirs[0]!.name, 'howard.db');
    assert.equal(fs.existsSync(snapshotDbPath), true);

    const snapDb = new DatabaseSync(snapshotDbPath);
    try {
      const integrityRow = snapDb.prepare('PRAGMA integrity_check').get() as {
        integrity_check: string;
      };
      assert.equal(integrityRow.integrity_check, 'ok');

      const snapCadenceRow = snapDb
        .prepare('SELECT data FROM cadence_logs WHERE date_key = ?')
        .get('2026-05-12') as { data: string } | undefined;
      assert.ok(snapCadenceRow);
      const snapCadenceData = JSON.parse(snapCadenceRow.data) as {
        morning: { given: boolean };
        evening?: unknown;
      };
      assert.equal(snapCadenceData.morning.given, true);
      assert.equal(snapCadenceData.evening, undefined);
    } finally {
      snapDb.close();
    }

    // Verify merged Cadence, Bloom, and Beacon records coexist side-by-side
    const mergedSync = await requestJson<SyncTestPayload>(srv.baseUrl, '/api/howard/sync?profile=partner1');
    assert.equal(mergedSync.status, 200);

    const mergedCadenceDay = mergedSync.json.cadence.logsByDate['2026-05-12']!;
    assert.equal(mergedCadenceDay.morning?.given, true);
    assert.equal(mergedCadenceDay.morning?.givenBy, 'Partner 1');
    assert.equal(mergedCadenceDay.evening?.given, true);
    assert.equal(mergedCadenceDay.evening?.givenBy, 'Partner 2');
    assert.equal(mergedCadenceDay.evening?.givenByProfileId, 'partner2');

    const mergedBloomDay = mergedSync.json.bloom.logsByDate['2026-05-12']!;
    assert.deepEqual(
      (mergedBloomDay.mists || []).map((m) => m.id),
      ['mist-existing-1']
    );
    assert.deepEqual(
      (mergedBloomDay.feedings || []).map((f) => f.id),
      ['feed-merged-1']
    );

    const mergedContactIds = mergedSync.json.howard.beaconInfo.contacts.map((c) => c.id);
    assert.equal(mergedContactIds.includes('c-partner1'), true);
    assert.equal(mergedContactIds.includes('c-partner2'), true);
    assert.equal(mergedContactIds.includes('c-vet-1'), true);
    assert.equal(mergedContactIds.includes('c-sitter-1'), true);
  });
});
