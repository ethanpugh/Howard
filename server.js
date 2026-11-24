import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_SCHEMA_VERSION } from './server/utils.js';
import { openDatabase } from './server/db.js';
import { runVersionedMigrations } from './server/migrations.js';
import { createRuntimeCache } from './server/cache.js';
import { runDailyBackupSnapshots } from './server/backup.js';
import { createHttpServer } from './server/http.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createHowardApp({
  dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'),
  distDir = path.join(__dirname, 'dist'),
  enableTimers = true
} = {}) {
  const dbCtx = openDatabase(dataDir);
  runVersionedMigrations(dbCtx);

  const cache = createRuntimeCache(dbCtx, { enableTimers });
  const server = createHttpServer({ dbCtx, cache, distDir });

  let dailySnapshotTimer = null;
  let initialSnapshotTimer = null;

  if (enableTimers) {
    dailySnapshotTimer = setInterval(() => runDailyBackupSnapshots(dbCtx), 6 * 3600 * 1000);
    dailySnapshotTimer.unref?.();
  }

  let closed = false;
  function close({ timeoutMs = 2500 } = {}) {
    if (closed) return Promise.resolve();
    closed = true;
    if (initialSnapshotTimer) clearTimeout(initialSnapshotTimer);
    if (dailySnapshotTimer) clearInterval(dailySnapshotTimer);
    cache.cleanupTimers();

    return new Promise((resolve) => {
      const forceTimer = setTimeout(() => {
        server.closeAllConnections?.();
        dbCtx.close();
        resolve();
      }, timeoutMs);
      forceTimer.unref?.();

      server.close(() => {
        clearTimeout(forceTimer);
        dbCtx.close();
        resolve();
      });
    });
  }

  function scheduleInitialSnapshot() {
    if (!enableTimers) return;
    initialSnapshotTimer = setTimeout(() => runDailyBackupSnapshots(dbCtx), 2000);
    initialSnapshotTimer.unref?.();
  }

  return { server, dbCtx, cache, scheduleInitialSnapshot, close };
}

const isDirectEntry =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectEntry) {
  const port =
    process.env.PORT !== undefined && process.env.PORT !== '' ? Number(process.env.PORT) : 3001;
  const app = createHowardApp({ enableTimers: true });

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
    app.close().then(() => process.exit(0));
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
}
