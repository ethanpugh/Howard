import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_SCHEMA_VERSION } from './server/utils.ts';
import { openDatabase } from './server/db.ts';
import { runVersionedMigrations } from './server/migrations.ts';
import { createRuntimeCache } from './server/cache.ts';
import { runDailyBackupSnapshots } from './server/backup.ts';
import { createHttpServer } from './server/http.ts';
import { purgeExpiredTrashedNotes } from './server/domains/quill.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createHowardApp({
  dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'),
  distDir = path.join(__dirname, 'dist'),
  enableTimers = true
}: {
  dataDir?: string;
  distDir?: string;
  enableTimers?: boolean;
} = {}) {
  const dbCtx = openDatabase(dataDir);
  runVersionedMigrations(dbCtx);

  const cache = createRuntimeCache(dbCtx, { enableTimers });
  purgeExpiredTrashedNotes(dbCtx, cache);
  const server = createHttpServer({ dbCtx, cache, distDir });

  let dailySnapshotTimer: ReturnType<typeof setInterval> | null = null;
  let initialSnapshotTimer: ReturnType<typeof setTimeout> | null = null;

  if (enableTimers) {
    dailySnapshotTimer = setInterval(() => {
      runDailyBackupSnapshots(dbCtx);
      purgeExpiredTrashedNotes(dbCtx, cache);
    }, 6 * 3600 * 1000);
    dailySnapshotTimer.unref?.();
  }

  let closingPromise: Promise<void> | null = null;
  function close({ timeoutMs = 2500 }: { timeoutMs?: number } = {}): Promise<void> {
    if (closingPromise) return closingPromise;
    if (initialSnapshotTimer) clearTimeout(initialSnapshotTimer);
    if (dailySnapshotTimer) clearInterval(dailySnapshotTimer);
    cache.cleanupTimers();

    closingPromise = new Promise((resolve) => {
      let settled = false;
      const finalize = () => {
        if (settled) return;
        settled = true;
        dbCtx.close();
        resolve();
      };

      const forceTimer = setTimeout(() => {
        server.closeAllConnections?.();
        finalize();
      }, timeoutMs);
      forceTimer.unref?.();

      server.close(() => {
        clearTimeout(forceTimer);
        finalize();
      });
    });

    return closingPromise;
  }

  function scheduleInitialSnapshot(): void {
    if (!enableTimers) return;
    initialSnapshotTimer = setTimeout(() => runDailyBackupSnapshots(dbCtx), 2000);
    initialSnapshotTimer.unref?.();
  }

  return { server, dbCtx, cache, scheduleInitialSnapshot, close };
}

const entryArg = process.argv[1];
const isDirectEntry = Boolean(entryArg) && path.resolve(entryArg ?? '') === path.resolve(__filename);

if (isDirectEntry) {
  const rawPort = process.env.PORT;
  const port = rawPort !== undefined && rawPort !== '' ? Number(rawPort) : 3001;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`Invalid PORT value: "${rawPort}"`);
    process.exit(1);
  }

  const app = createHowardApp({ enableTimers: true });

  app.server.on('error', (err) => {
    console.error('Server listen error:', err);
    app.close().finally(() => process.exit(1));
  });

  app.server.listen(port, '0.0.0.0', () => {
    const addr = app.server.address();
    const actualPort = addr && typeof addr === 'object' ? addr.port : port;
    console.log(`🎩 Howard Household Hub listening on http://0.0.0.0:${actualPort}`);
    console.log(
      `💾 Unified SQLite Database: ${app.dbCtx.dbPath} (schema v${CURRENT_SCHEMA_VERSION}, ${app.dbCtx.activeJournalMode})`
    );
    app.scheduleInitialSnapshot();
  });

  const handleSignal = () => {
    app
      .close()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('Shutdown error:', err);
        process.exit(1);
      });
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
}
