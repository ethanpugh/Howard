import { VALID_DATE_KEY_RE } from '../../shared/dateUtils.js';
import { DEFAULT_FLOODGATE_SETTINGS } from '../../shared/defaults.js';
import { isPlainObject } from '../utils.js';

export async function handleFloodgateRoutes({
  req,
  res,
  pathname,
  parsedUrl,
  dbCtx,
  cache,
  helpers
}) {
  const isFloodgateRoute =
    pathname === '/api/floodgate/state' ||
    pathname === '/api/floodgate/settings' ||
    pathname.startsWith('/api/floodgate/logs');

  if (!isFloodgateRoute) return false;

  const callerProfile = helpers.getCallerProfile(req, parsedUrl);
  if (callerProfile !== 'partner2') {
    helpers.sendJson(res, 403, { error: 'Floodgate routes are restricted to Partner 2' });
    return true;
  }

  if (pathname === '/api/floodgate/state' && req.method === 'GET') {
    helpers.sendJson(res, 200, cache.getCachedFloodgateState());
    return true;
  }

  if (pathname === '/api/floodgate/settings' && req.method === 'PUT') {
    const incoming = await helpers.parseJsonBody(req);
    const { data: rawCurrent } = dbCtx.readHowardKey(
      'floodgate_settings',
      DEFAULT_FLOODGATE_SETTINGS
    );
    const nowIso = new Date().toISOString();
    const updatedRaw = {
      ...DEFAULT_FLOODGATE_SETTINGS,
      ...(isPlainObject(rawCurrent) ? rawCurrent : {}),
      ...incoming,
      ownerProfileId: 'partner2'
    };
    dbCtx.stmts.howardUpsert.run('floodgate_settings', JSON.stringify(updatedRaw), nowIso);
    cache.bumpRevision('floodgate');
    helpers.sendJson(res, 200, {
      settings: cache.readFloodgateSettings().settings,
      updatedAt: nowIso
    });
    return true;
  }

  if (pathname === '/api/floodgate/logs/batch' && req.method === 'POST') {
    const incoming = await helpers.parseJsonBody(req, { allowArray: true });
    const rawLogs = Array.isArray(incoming)
      ? incoming
      : incoming.logs !== undefined
        ? incoming.logs
        : incoming;
    if (!rawLogs || typeof rawLogs !== 'object') {
      helpers.sendJson(res, 400, { error: 'Expected logs object or array' });
      return true;
    }
    const entries = Array.isArray(rawLogs)
      ? rawLogs.map((item) => [null, item])
      : Object.entries(rawLogs);
    const nowIso = new Date().toISOString();

    const upsertedCount = dbCtx.runInTransaction(() => {
      let count = 0;
      for (const [key, item] of entries) {
        if (!isPlainObject(item)) continue;
        const dateKey = item.date || item.dateKey || key;
        if (!dateKey || !VALID_DATE_KEY_RE.test(dateKey)) continue;

        const currentRecord = dbCtx.readDayJsonRow(dbCtx.stmts.floodgateGetLogByDate, dateKey, {
          date: dateKey
        });
        const updatedRecord = {
          ...currentRecord,
          ...item,
          date: dateKey,
          updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : nowIso
        };
        dbCtx.stmts.floodgateUpsertLog.run(
          dateKey,
          JSON.stringify(updatedRecord),
          updatedRecord.updatedAt
        );
        count += 1;
      }
      return count;
    });

    cache.bumpRevision('floodgate');
    const { logsByDate, updatedAt } = cache.getCachedFloodgateState();
    helpers.sendJson(res, 200, {
      count: upsertedCount,
      logsByDate,
      updatedAt: updatedAt || nowIso
    });
    return true;
  }

  if (pathname.startsWith('/api/floodgate/logs/') && req.method === 'PUT') {
    const dateKey = helpers.parseDateKeySegment(pathname, '/api/floodgate/logs/');
    if (!dateKey) {
      helpers.sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      return true;
    }
    const incoming = await helpers.parseJsonBody(req);
    const nowIso = new Date().toISOString();

    const updatedRecord = dbCtx.runInTransaction(() => {
      const currentRecord = dbCtx.readDayJsonRow(dbCtx.stmts.floodgateGetLogByDate, dateKey, {
        date: dateKey
      });
      const nextRecord = {
        ...currentRecord,
        ...incoming,
        date: dateKey,
        updatedAt: typeof incoming.updatedAt === 'string' ? incoming.updatedAt : nowIso
      };
      dbCtx.stmts.floodgateUpsertLog.run(
        dateKey,
        JSON.stringify(nextRecord),
        nextRecord.updatedAt
      );
      return nextRecord;
    });

    cache.bumpRevision('floodgate');
    helpers.sendJson(res, 200, { dateKey, record: updatedRecord });
    return true;
  }

  if (pathname.startsWith('/api/floodgate/logs/') && req.method === 'DELETE') {
    const dateKey = helpers.parseDateKeySegment(pathname, '/api/floodgate/logs/');
    if (!dateKey) {
      helpers.sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      return true;
    }
    dbCtx.stmts.floodgateDeleteLog.run(dateKey);
    cache.bumpRevision('floodgate');
    helpers.sendJson(res, 200, { deleted: true, dateKey });
    return true;
  }

  return false;
}
