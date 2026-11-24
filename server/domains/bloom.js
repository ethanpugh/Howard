import { VALID_DATE_KEY_RE, getLocalDateKey } from '../../shared/dateUtils.js';
import { createDefaultBloomSettings } from '../../shared/defaults.js';
import { isPlainObject } from '../utils.js';
import {
  buildCaregiverItems,
  enrichBloomCareRecord,
  enrichBloomMoltRecord,
  normalizeBloomSettings,
  resolveBloomCareRecord,
  resolveBloomMoltRecord
} from './profileResolve.js';

function mutateBloomEntryList(list, appendEntry, removeId, idPrefix, nowIso) {
  let next = Array.isArray(list) ? [...list] : [];
  let appended = null;
  if (isPlainObject(appendEntry)) {
    const entryId = String(
      appendEntry.id || `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    );
    appended = {
      ...appendEntry,
      id: entryId,
      timestamp: appendEntry.timestamp || nowIso
    };
    if (!next.some((item) => item && item.id === entryId)) {
      next.push(appended);
    }
  }
  if (removeId !== undefined && removeId !== null && String(removeId) !== '') {
    const remId = String(removeId);
    next = next.filter((item) => item && item.id !== remId);
  }
  return { next, appended };
}

function mergeBloomSettingsPatch(base, patch, profilesList) {
  const merged = {
    ...base,
    ...patch,
    enclosureInfo: {
      ...base.enclosureInfo,
      ...(isPlainObject(patch.enclosureInfo) ? patch.enclosureInfo : {})
    }
  };
  if (Array.isArray(patch.caregivers)) {
    merged.caregiverItems = buildCaregiverItems(patch.caregivers, profilesList);
  } else if (Array.isArray(base.caregiverItems)) {
    merged.caregiverItems = base.caregiverItems;
  }
  return normalizeBloomSettings(merged, base, profilesList);
}

export async function handleBloomRoutes({ req, res, pathname, dbCtx, cache, helpers }) {
  if (pathname === '/api/bloom/state' && req.method === 'GET') {
    helpers.sendJson(res, 200, cache.getCachedBloomState());
    return true;
  }

  if (pathname === '/api/bloom/settings' && req.method === 'PUT') {
    const incoming = await helpers.parseJsonBody(req);
    const { data: rawCurrent } = dbCtx.readHowardKey('bloom_settings', createDefaultBloomSettings());
    const base = isPlainObject(rawCurrent) ? rawCurrent : createDefaultBloomSettings();
    const nowIso = new Date().toISOString();
    const { profilesList } = cache.getProfilesContext();

    const updatedRaw = mergeBloomSettingsPatch(base, incoming, profilesList);
    const tMin = Number(updatedRaw.dayTempMinC);
    const tMax = Number(updatedRaw.dayTempMaxC);
    const hMin = Number(updatedRaw.humidityMinPct);
    const hMax = Number(updatedRaw.humidityMaxPct);
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMin < 5 || tMax > 50 || tMin > tMax) {
      helpers.sendJson(res, 400, {
        error: 'Invalid Bloom temperature range (5-50C, min <= max)'
      });
      return true;
    }
    if (!Number.isFinite(hMin) || !Number.isFinite(hMax) || hMin < 0 || hMax > 100 || hMin > hMax) {
      helpers.sendJson(res, 400, {
        error: 'Invalid Bloom humidity range (0-100%, min <= max)'
      });
      return true;
    }

    dbCtx.stmts.howardUpsert.run('bloom_settings', JSON.stringify(updatedRaw), nowIso);
    cache.bumpRevision('bloom');
    helpers.sendJson(res, 200, {
      settings: cache.readBloomSettings().settings,
      updatedAt: nowIso
    });
    return true;
  }

  if (pathname.startsWith('/api/bloom/logs/') && req.method === 'PUT') {
    const dateKey = helpers.parseDateKeySegment(pathname, '/api/bloom/logs/');
    if (!dateKey) {
      helpers.sendJson(res, 400, { error: 'Invalid dateKey format (expected YYYY-MM-DD)' });
      return true;
    }
    const incoming = await helpers.parseJsonBody(req);
    const {
      settingsPatch,
      appendMist,
      removeMistId,
      appendFeeding,
      removeFeedingId,
      appendClimateCheck,
      removeClimateCheckId,
      toggleBehavior,
      ...logPayload
    } = incoming || {};
    const nowIso = new Date().toISOString();
    const { profilesList, profilesById } = cache.getProfilesContext();

    const { updatedRecord, updatedSettings } = dbCtx.runInTransaction(() => {
      const currentRecord = dbCtx.readDayJsonRow(dbCtx.stmts.bloomGetLogByDate, dateKey, {
        dateKey,
        mists: [],
        feedings: [],
        climateChecks: [],
        behaviors: []
      });
      const nextRecord = {
        ...currentRecord,
        ...logPayload,
        dateKey,
        updatedAt: typeof logPayload.updatedAt === 'string' ? logPayload.updatedAt : nowIso
      };
      nextRecord.behaviors = Array.isArray(nextRecord.behaviors) ? [...nextRecord.behaviors] : [];

      const mistRes = mutateBloomEntryList(
        nextRecord.mists,
        appendMist,
        removeMistId,
        'mist',
        nowIso
      );
      nextRecord.mists = mistRes.next;
      if (mistRes.appended?.dropletDrinkObserved && !nextRecord.behaviors.includes('Drank Droplets')) {
        nextRecord.behaviors.push('Drank Droplets');
      }

      nextRecord.feedings = mutateBloomEntryList(
        nextRecord.feedings,
        appendFeeding,
        removeFeedingId,
        'feed',
        nowIso
      ).next;

      nextRecord.climateChecks = mutateBloomEntryList(
        nextRecord.climateChecks,
        appendClimateCheck,
        removeClimateCheckId,
        'clim',
        nowIso
      ).next;

      if (typeof toggleBehavior === 'string' && toggleBehavior.trim()) {
        const tag = toggleBehavior.trim();
        nextRecord.behaviors = nextRecord.behaviors.includes(tag)
          ? nextRecord.behaviors.filter((b) => b !== tag)
          : [...nextRecord.behaviors, tag];
      }

      const enrichedRecord = enrichBloomCareRecord(nextRecord, profilesList, profilesById);
      dbCtx.stmts.bloomUpsertLog.run(
        dateKey,
        JSON.stringify(enrichedRecord),
        enrichedRecord.updatedAt
      );

      let nextSettings = null;
      if (isPlainObject(settingsPatch)) {
        const { data: rawCurrent } = dbCtx.readHowardKey(
          'bloom_settings',
          createDefaultBloomSettings()
        );
        const base = isPlainObject(rawCurrent) ? rawCurrent : createDefaultBloomSettings();
        nextSettings = mergeBloomSettingsPatch(base, settingsPatch, profilesList);
        dbCtx.stmts.howardUpsert.run('bloom_settings', JSON.stringify(nextSettings), nowIso);
      }

      return { updatedRecord: enrichedRecord, updatedSettings: nextSettings };
    });

    cache.bumpRevision('bloom');
    helpers.sendJson(res, 200, {
      dateKey,
      record: resolveBloomCareRecord(updatedRecord, profilesById),
      ...(updatedSettings ? { settings: cache.readBloomSettings().settings } : {})
    });
    return true;
  }

  if (pathname === '/api/bloom/molts' && req.method === 'POST') {
    const incoming = await helpers.parseJsonBody(req);
    const nowIso = new Date().toISOString();
    const dateKey =
      incoming.dateKey && VALID_DATE_KEY_RE.test(incoming.dateKey)
        ? incoming.dateKey
        : getLocalDateKey(new Date());
    const moltId = incoming.id || `molt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let validLengthMm = null;
    if (
      incoming.lengthMm !== null &&
      incoming.lengthMm !== undefined &&
      String(incoming.lengthMm).trim() !== ''
    ) {
      const parsedLen = Number(incoming.lengthMm);
      if (!Number.isFinite(parsedLen) || parsedLen <= 0) {
        helpers.sendJson(res, 400, { error: 'Body length must be a positive number' });
        return true;
      }
      validLengthMm = parsedLen;
    }

    const { profilesList, profilesById } = cache.getProfilesContext();
    const moltRecord = enrichBloomMoltRecord(
      {
        id: moltId,
        dateKey,
        timestamp: incoming.timestamp || nowIso,
        fromInstar: incoming.fromInstar || 'L2',
        toInstar: incoming.toInstar || 'L3',
        lengthMm: validLengthMm,
        colorShift: String(incoming.colorShift || '').trim(),
        quality: incoming.quality || 'clean',
        loggedBy: incoming.loggedBy || 'Household',
        ...(incoming.loggedByProfileId ? { loggedByProfileId: incoming.loggedByProfileId } : {}),
        note: String(incoming.note || '').trim(),
        updatedAt: nowIso
      },
      profilesList,
      profilesById
    );

    dbCtx.runInTransaction(() => {
      dbCtx.stmts.bloomUpsertMolt.run(moltId, dateKey, JSON.stringify(moltRecord), nowIso);

      if (incoming.advanceInstar !== false) {
        const { data: rawCurrent } = dbCtx.readHowardKey(
          'bloom_settings',
          createDefaultBloomSettings()
        );
        const base = isPlainObject(rawCurrent) ? rawCurrent : createDefaultBloomSettings();
        const parsedHard = Number(base.hardeningHours);
        const hardHours = Number.isFinite(parsedHard) && parsedHard >= 0 ? parsedHard : 36;
        const startHardening = incoming.startHardening !== false && hardHours > 0;
        const hardeningUntilIso = startHardening
          ? new Date(Date.now() + hardHours * 3600000).toISOString()
          : null;

        const nextSettings = mergeBloomSettingsPatch(
          base,
          {
            currentInstar: moltRecord.toInstar || base.currentInstar,
            ...(moltRecord.colorShift ? { currentColorMorph: moltRecord.colorShift } : {}),
            lifecycleStatus: startHardening ? 'hardening' : 'normal',
            premoltStartedAt: null,
            hardeningUntil: hardeningUntilIso,
            enclosureInfo: {
              ...base.enclosureInfo,
              ...(moltRecord.lengthMm ? { currentBodyLengthMm: moltRecord.lengthMm } : {})
            }
          },
          profilesList
        );
        dbCtx.stmts.howardUpsert.run('bloom_settings', JSON.stringify(nextSettings), nowIso);
      }
    });

    cache.bumpRevision('bloom');
    const { molts, settings } = cache.getCachedBloomState();
    helpers.sendJson(res, 200, {
      molt: resolveBloomMoltRecord(moltRecord, profilesById),
      molts,
      settings,
      updatedAt: nowIso
    });
    return true;
  }

  if (pathname.startsWith('/api/bloom/molts/') && req.method === 'DELETE') {
    const moltId = helpers.parseRequiredSegment(pathname, '/api/bloom/molts/');
    if (!moltId) {
      helpers.sendJson(res, 400, { error: 'Invalid or missing molt ID' });
      return true;
    }
    const nowIso = new Date().toISOString();
    const { profilesList } = cache.getProfilesContext();
    dbCtx.runInTransaction(() => {
      const beforeMolts = cache.readBloomMolts().molts;
      const deletedIndex = beforeMolts.findIndex((m) => m.id === moltId);
      const deletedMolt = deletedIndex >= 0 ? beforeMolts[deletedIndex] : null;
      dbCtx.stmts.bloomDeleteMolt.run(moltId);
      if (deletedMolt && deletedIndex === 0) {
        const remaining = cache.readBloomMolts().molts;
        const { data: rawCurrent } = dbCtx.readHowardKey(
          'bloom_settings',
          createDefaultBloomSettings()
        );
        const base = isPlainObject(rawCurrent) ? rawCurrent : createDefaultBloomSettings();
        const revertedInstar = remaining[0]?.toInstar || deletedMolt.fromInstar || base.currentInstar;
        const nextSettings = mergeBloomSettingsPatch(
          base,
          {
            currentInstar: revertedInstar,
            ...(base.lifecycleStatus === 'hardening'
              ? { lifecycleStatus: 'normal', hardeningUntil: null }
              : {})
          },
          profilesList
        );
        dbCtx.stmts.howardUpsert.run('bloom_settings', JSON.stringify(nextSettings), nowIso);
      }
    });
    cache.bumpRevision('bloom');
    const { molts, settings } = cache.getCachedBloomState();
    helpers.sendJson(res, 200, { deleted: true, id: moltId, molts, settings });
    return true;
  }

  if (pathname.startsWith('/api/bloom/feeders/') && req.method === 'PUT') {
    const feederId = helpers.parseRequiredSegment(pathname, '/api/bloom/feeders/');
    if (!feederId) {
      helpers.sendJson(res, 400, { error: 'Invalid or missing feeder ID' });
      return true;
    }
    const incoming = await helpers.parseJsonBody(req);
    const nameTrimmed = String(incoming.name || '').trim();
    if (!nameTrimmed) {
      helpers.sendJson(res, 400, { error: 'Feeder culture name cannot be empty' });
      return true;
    }
    const shelfLife =
      incoming.shelfLifeDays !== undefined ? Number(incoming.shelfLifeDays) : 28;
    if (!Number.isFinite(shelfLife) || shelfLife < 1 || shelfLife > 365) {
      helpers.sendJson(res, 400, { error: 'Feeder shelf life must be between 1 and 365 days' });
      return true;
    }
    if (incoming.startedDate !== undefined && !VALID_DATE_KEY_RE.test(incoming.startedDate)) {
      helpers.sendJson(res, 400, { error: 'Feeder startedDate must be YYYY-MM-DD' });
      return true;
    }
    const nowIso = new Date().toISOString();
    const feederRecord = {
      id: feederId,
      name: nameTrimmed,
      feederType: incoming.feederType || 'hydei',
      startedDate: incoming.startedDate || getLocalDateKey(new Date()),
      shelfLifeDays: Math.round(shelfLife),
      status: incoming.status || 'booming',
      storageNote: String(incoming.storageNote || '').trim(),
      active: incoming.active !== false,
      updatedAt: nowIso
    };
    dbCtx.stmts.bloomUpsertFeeder.run(feederId, JSON.stringify(feederRecord), nowIso);
    cache.bumpRevision('bloom');
    const { feeders } = cache.getCachedBloomState();
    helpers.sendJson(res, 200, { feeder: feederRecord, feeders, updatedAt: nowIso });
    return true;
  }

  if (pathname.startsWith('/api/bloom/feeders/') && req.method === 'DELETE') {
    const feederId = helpers.parseRequiredSegment(pathname, '/api/bloom/feeders/');
    if (!feederId) {
      helpers.sendJson(res, 400, { error: 'Invalid or missing feeder ID' });
      return true;
    }
    dbCtx.stmts.bloomDeleteFeeder.run(feederId);
    cache.bumpRevision('bloom');
    const { feeders } = cache.getCachedBloomState();
    helpers.sendJson(res, 200, { deleted: true, id: feederId, feeders });
    return true;
  }

  return false;
}
