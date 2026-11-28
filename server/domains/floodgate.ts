import { Hono } from 'hono';
import { isValidDateKey } from '../../shared/dateUtils.ts';
import { DEFAULT_FLOODGATE_SETTINGS } from '../../shared/defaults.ts';
import {
  FloodgateBatchRequestSchema,
  FloodgateDayLogPutSchema,
  FloodgateSettingsPatchSchema,
  type FloodgateDayLog,
  type FloodgateDayLogPut
} from '../../shared/schemas/floodgate.ts';
import type { RuntimeCache } from '../cache.ts';
import type { DatabaseContext } from '../db.ts';
import { getCallerProfile, jsonBody } from '../honoHelpers.ts';
import { isPlainObject } from '../utils.ts';

export function createFloodgateRoutes({
  dbCtx,
  cache
}: {
  dbCtx: DatabaseContext;
  cache: RuntimeCache;
}) {
  return new Hono()
    .use('*', async (c, next): Promise<Response | void> => {
      const callerProfile = getCallerProfile(c);
      if (callerProfile !== 'partner2') {
        return c.json({ error: 'Floodgate routes are restricted to Partner 2' }, 403);
      }
      await next();
      return undefined;
    })
    .get('/state', (c) => {
      return c.json(cache.getCachedFloodgateState(), 200);
    })
    .put('/settings', ...jsonBody(FloodgateSettingsPatchSchema), (c) => {
      const incoming = c.req.valid('json');
      const nowIso = new Date().toISOString();

      dbCtx.runInTransaction(() => {
        const { data: rawCurrent } = dbCtx.readHowardKey(
          'floodgate_settings',
          DEFAULT_FLOODGATE_SETTINGS
        );
        const updatedRaw = {
          ...DEFAULT_FLOODGATE_SETTINGS,
          ...(isPlainObject(rawCurrent) ? rawCurrent : {}),
          ...incoming,
          ownerProfileId: 'partner2'
        };
        dbCtx.stmts.howardUpsert.run('floodgate_settings', JSON.stringify(updatedRaw), nowIso);
      });

      cache.bumpRevision('floodgate');
      return c.json(
        {
          settings: cache.readFloodgateSettings().settings,
          updatedAt: nowIso
        },
        200
      );
    })
    .post('/logs/batch', ...jsonBody(FloodgateBatchRequestSchema), (c) => {
      const incoming = c.req.valid('json');
      const rawLogs = Array.isArray(incoming)
        ? incoming
        : 'logs' in incoming && incoming.logs !== undefined
          ? incoming.logs
          : incoming;

      const entries: Array<[string | null, FloodgateDayLogPut]> = Array.isArray(rawLogs)
        ? rawLogs.map((item) => [null, item])
        : Object.entries(rawLogs);
      const nowIso = new Date().toISOString();

      const upsertedCount = dbCtx.runInTransaction(() => {
        let count = 0;
        for (const [key, item] of entries) {
          if (!isPlainObject(item)) continue;
          const dateKey =
            (typeof item.date === 'string' && item.date) ||
            (typeof item.dateKey === 'string' && item.dateKey) ||
            key;
          if (!dateKey || !isValidDateKey(dateKey)) continue;

          const currentRecord = dbCtx.readDayJsonRow(dbCtx.stmts.floodgateGetLogByDate, dateKey, {
            date: dateKey
          });
          const updatedRecord: FloodgateDayLog = {
            ...currentRecord,
            ...(item as Partial<FloodgateDayLog>),
            date: dateKey,
            updatedAt: nowIso
          };
          dbCtx.stmts.floodgateUpsertLog.run(dateKey, JSON.stringify(updatedRecord), nowIso);
          count += 1;
        }
        return count;
      });

      cache.bumpRevision('floodgate');
      const { logsByDate, updatedAt } = cache.getCachedFloodgateState();
      return c.json(
        {
          count: upsertedCount,
          logsByDate,
          updatedAt: updatedAt || nowIso
        },
        200
      );
    })
    .put('/logs/:dateKey', ...jsonBody(FloodgateDayLogPutSchema), (c) => {
      const dateKey = c.req.param('dateKey');
      if (!dateKey || !isValidDateKey(dateKey)) {
        return c.json({ error: 'Invalid dateKey format (expected YYYY-MM-DD)' }, 400);
      }
      const incoming = c.req.valid('json');
      const nowIso = new Date().toISOString();

      const updatedRecord = dbCtx.runInTransaction(() => {
        const currentRecord = dbCtx.readDayJsonRow(dbCtx.stmts.floodgateGetLogByDate, dateKey, {
          date: dateKey
        });
        const nextRecord: FloodgateDayLog = {
          ...currentRecord,
          ...(incoming as Partial<FloodgateDayLog>),
          date: dateKey,
          updatedAt: nowIso
        };
        dbCtx.stmts.floodgateUpsertLog.run(dateKey, JSON.stringify(nextRecord), nowIso);
        return nextRecord;
      });

      cache.bumpRevision('floodgate');
      return c.json({ dateKey, record: updatedRecord }, 200);
    })
    .delete('/logs/:dateKey', (c) => {
      const dateKey = c.req.param('dateKey');
      if (!dateKey || !isValidDateKey(dateKey)) {
        return c.json({ error: 'Invalid dateKey format (expected YYYY-MM-DD)' }, 400);
      }
      const res = dbCtx.stmts.floodgateDeleteLog.run(dateKey);
      if (res.changes > 0) {
        cache.bumpRevision('floodgate');
      }
      return c.json({ deleted: true, dateKey }, 200);
    });
}
