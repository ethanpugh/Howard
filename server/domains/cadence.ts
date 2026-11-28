import { Hono } from 'hono';
import { isValidDateKey } from '../../shared/dateUtils.ts';
import { createDefaultCadenceSettings } from '../../shared/defaults.ts';
import {
  CadenceDayLogPutRequestSchema,
  CadenceSettingsPatchSchema
} from '../../shared/schemas/cadence.ts';
import type { RuntimeCache } from '../cache.ts';
import type { DatabaseContext } from '../db.ts';
import { jsonBody, requirePartner } from '../honoHelpers.ts';
import { isPlainObject } from '../utils.ts';
import {
  buildCaregiverItems,
  enrichCadenceRecord,
  normalizeCadenceSettings,
  resolveCadenceRecord
} from './profileResolve.ts';

export function createCadenceRoutes({
  dbCtx,
  cache
}: {
  dbCtx: DatabaseContext;
  cache: RuntimeCache;
}) {
  return new Hono()
    .get('/state', (c) => {
      return c.json(cache.getCachedCadenceState(), 200);
    })
    .put('/settings', ...jsonBody(CadenceSettingsPatchSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const incoming = c.req.valid('json');
      if (incoming.bottleShelfLifeDays !== undefined) {
        const shelf = Number(incoming.bottleShelfLifeDays);
        if (!Number.isFinite(shelf) || shelf < 7 || shelf > 365) {
          return c.json({ error: 'Bottle shelf life must be 7 to 365 days' }, 400);
        }
      }
      if (
        incoming.bottleOpenedDate !== undefined &&
        !isValidDateKey(incoming.bottleOpenedDate)
      ) {
        return c.json({ error: 'bottleOpenedDate must be YYYY-MM-DD' }, 400);
      }

      const nowIso = new Date().toISOString();
      const { profilesList } = cache.getProfilesContext();

      dbCtx.runInTransaction(() => {
        const defaultSettings = createDefaultCadenceSettings();
        const { data: rawCurrent } = dbCtx.readHowardKey('cadence_settings', defaultSettings);
        const base = isPlainObject(rawCurrent) ? rawCurrent : defaultSettings;
        const patch: Record<string, unknown> = { ...incoming };
        if (incoming.bottleShelfLifeDays !== undefined) {
          patch.bottleShelfLifeDays = Math.round(Number(incoming.bottleShelfLifeDays));
        }
        if (Array.isArray(incoming.caregivers) && !Array.isArray(incoming.caregiverItems)) {
          patch.caregiverItems = buildCaregiverItems(incoming.caregivers, profilesList);
        }
        const updatedRaw = normalizeCadenceSettings(patch, base, profilesList);
        dbCtx.stmts.howardUpsert.run('cadence_settings', JSON.stringify(updatedRaw), nowIso);
      });

      cache.bumpRevision('cadence');
      return c.json(
        {
          settings: cache.readCadenceSettings().settings,
          updatedAt: nowIso
        },
        200
      );
    })
    .put('/logs/:dateKey', ...jsonBody(CadenceDayLogPutRequestSchema), (c) => {
      const dateKey = c.req.param('dateKey');
      if (!dateKey || !isValidDateKey(dateKey)) {
        return c.json({ error: 'Invalid dateKey format (expected YYYY-MM-DD)' }, 400);
      }
      const incoming = c.req.valid('json');
      const nowIso = new Date().toISOString();
      const { profilesList, profilesById } = cache.getProfilesContext();

      const updatedRecord = dbCtx.runInTransaction(() => {
        const currentRecord = dbCtx.readDayJsonRow(dbCtx.stmts.cadenceGetLogByDate, dateKey, {
          dateKey
        });
        const nextRecord = enrichCadenceRecord(
          {
            ...currentRecord,
            ...incoming,
            dateKey,
            updatedAt: nowIso
          },
          profilesList,
          profilesById
        );
        dbCtx.stmts.cadenceUpsertLog.run(dateKey, JSON.stringify(nextRecord), nowIso);
        return nextRecord;
      });

      cache.bumpRevision('cadence');
      return c.json(
        {
          dateKey,
          record: resolveCadenceRecord(updatedRecord, profilesById)
        },
        200
      );
    });
}
