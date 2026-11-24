import { VALID_DATE_KEY_RE } from '../../shared/dateUtils.js';
import { createDefaultCadenceSettings } from '../../shared/defaults.js';
import { isPlainObject } from '../utils.js';
import {
  buildCaregiverItems,
  enrichCadenceRecord,
  normalizeCadenceSettings,
  resolveCadenceRecord
} from './profileResolve.js';

export async function handleCadenceRoutes({ req, res, pathname, dbCtx, cache, helpers }) {
  if (pathname === '/api/cadence/state' && req.method === 'GET') {
    helpers.sendJson(res, 200, cache.getCachedCadenceState());
    return true;
  }

  if (pathname === '/api/cadence/settings' && req.method === 'PUT') {
    const incoming = await helpers.parseJsonBody(req);
    const { data: rawCurrent } = dbCtx.readHowardKey(
      'cadence_settings',
      createDefaultCadenceSettings()
    );
    const nowIso = new Date().toISOString();
    const base = isPlainObject(rawCurrent) ? rawCurrent : createDefaultCadenceSettings();
    if (incoming.bottleShelfLifeDays !== undefined) {
      const shelf = Number(incoming.bottleShelfLifeDays);
      if (!Number.isFinite(shelf) || shelf < 7 || shelf > 365) {
        helpers.sendJson(res, 400, { error: 'Bottle shelf life must be 7 to 365 days' });
        return true;
      }
    }
    if (
      incoming.bottleOpenedDate !== undefined &&
      !VALID_DATE_KEY_RE.test(incoming.bottleOpenedDate)
    ) {
      helpers.sendJson(res, 400, { error: 'bottleOpenedDate must be YYYY-MM-DD' });
      return true;
    }
    const { profilesList } = cache.getProfilesContext();
    const patch = { ...incoming };
    if (Array.isArray(incoming.caregivers) && !Array.isArray(incoming.caregiverItems)) {
      patch.caregiverItems = buildCaregiverItems(incoming.caregivers, profilesList);
    }
    const updatedRaw = normalizeCadenceSettings(patch, base, profilesList);
    dbCtx.stmts.howardUpsert.run('cadence_settings', JSON.stringify(updatedRaw), nowIso);
    cache.bumpRevision('cadence');
    helpers.sendJson(res, 200, {
      settings: cache.readCadenceSettings().settings,
      updatedAt: nowIso
    });
    return true;
  }

  if (pathname.startsWith('/api/cadence/logs/') && req.method === 'PUT') {
    const dateKey = helpers.parseDateKeySegment(pathname, '/api/cadence/logs/');
    if (!dateKey) {
      helpers.sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      return true;
    }
    const incoming = await helpers.parseJsonBody(req);
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
          updatedAt: typeof incoming.updatedAt === 'string' ? incoming.updatedAt : nowIso
        },
        profilesList,
        profilesById
      );
      dbCtx.stmts.cadenceUpsertLog.run(dateKey, JSON.stringify(nextRecord), nextRecord.updatedAt);
      return nextRecord;
    });

    cache.bumpRevision('cadence');
    helpers.sendJson(res, 200, {
      dateKey,
      record: resolveCadenceRecord(updatedRecord, profilesById)
    });
    return true;
  }

  return false;
}
