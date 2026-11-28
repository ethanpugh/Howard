import { Hono } from 'hono';
import { getLocalDateKey, isValidDateKey } from '../../shared/dateUtils.ts';
import { createDefaultBloomSettings } from '../../shared/defaults.ts';
import {
  BloomFeederPutRequestSchema,
  BloomLogPutRequestSchema,
  BloomMoltPostRequestSchema,
  BloomSettingsPatchSchema,
  type BloomFeederCulture,
  type BloomSettings
} from '../../shared/schemas/bloom.ts';
import type { Profile } from '../../shared/schemas/profile.ts';
import type { RuntimeCache } from '../cache.ts';
import type { DatabaseContext } from '../db.ts';
import { getCallerProfile, jsonBody, requirePartner } from '../honoHelpers.ts';
import { isPlainObject } from '../utils.ts';
import {
  buildCaregiverItems,
  enrichBloomCareRecord,
  enrichBloomMoltRecord,
  normalizeBloomSettings,
  resolveBloomCareRecord,
  resolveBloomMoltRecord
} from './profileResolve.ts';

const CAREGIVER_LIVE_PREY_KEYS = new Set([
  'livePreyInside',
  'livePreyNote',
  'livePreyAt',
  'livePreyBy',
  'livePreyByProfileId'
]);

function isLivePreyOnlyPatch(patch: Record<string, unknown>): boolean {
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((k) => CAREGIVER_LIVE_PREY_KEYS.has(k));
}

function validateBloomRanges(settings: BloomSettings): string | null {
  const tMin = Number(settings.dayTempMinC);
  const tMax = Number(settings.dayTempMaxC);
  const hMin = Number(settings.humidityMinPct);
  const hMax = Number(settings.humidityMaxPct);
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMin < 5 || tMax > 50 || tMin > tMax) {
    return 'Invalid Bloom temperature range (5-50C, min <= max)';
  }
  if (!Number.isFinite(hMin) || !Number.isFinite(hMax) || hMin < 0 || hMax > 100 || hMin > hMax) {
    return 'Invalid Bloom humidity range (0-100%, min <= max)';
  }
  return null;
}

function mutateBloomEntryList(
  list: unknown,
  appendEntry: unknown,
  removeId: unknown,
  idPrefix: string,
  nowIso: string
): { next: Array<Record<string, unknown>>; appended: Record<string, unknown> | null } {
  let next: Array<Record<string, unknown>> = Array.isArray(list)
    ? list.filter(isPlainObject).map((item) => ({ ...item }))
    : [];
  let appended: Record<string, unknown> | null = null;
  if (isPlainObject(appendEntry)) {
    const entryId = String(
      appendEntry.id || `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    );
    appended = {
      ...appendEntry,
      id: entryId,
      timestamp: typeof appendEntry.timestamp === 'string' && appendEntry.timestamp ? appendEntry.timestamp : nowIso
    };
    if (!next.some((item) => item.id === entryId)) {
      next.push(appended);
    }
  }
  if (removeId !== undefined && removeId !== null && String(removeId) !== '') {
    const remId = String(removeId);
    next = next.filter((item) => item.id !== remId);
  }
  return { next, appended };
}

function mergeBloomSettingsPatch(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
  profilesList: Profile[]
): BloomSettings {
  const baseEnc = isPlainObject(base.enclosureInfo) ? base.enclosureInfo : {};
  const patchEnc = isPlainObject(patch.enclosureInfo) ? patch.enclosureInfo : {};
  const merged: Record<string, unknown> = {
    ...base,
    ...patch,
    enclosureInfo: {
      ...baseEnc,
      ...patchEnc
    }
  };
  if (Array.isArray(patch.caregivers)) {
    merged.caregiverItems = buildCaregiverItems(patch.caregivers, profilesList);
  } else if (Array.isArray(base.caregiverItems)) {
    merged.caregiverItems = base.caregiverItems;
  }
  return normalizeBloomSettings(merged, base, profilesList);
}

export function createBloomRoutes({
  dbCtx,
  cache
}: {
  dbCtx: DatabaseContext;
  cache: RuntimeCache;
}) {
  return new Hono()
    .get('/state', (c) => {
      return c.json(cache.getCachedBloomState(), 200);
    })
    .put('/settings', ...jsonBody(BloomSettingsPatchSchema), (c) => {
      const caller = getCallerProfile(c);
      const incoming = c.req.valid('json') as Record<string, unknown>;
      if (caller === 'caregiver' && !isLivePreyOnlyPatch(incoming)) {
        return c.json({ error: 'Caregiver profile cannot modify Bloom care settings' }, 403);
      }

      const nowIso = new Date().toISOString();
      const { profilesList } = cache.getProfilesContext();

      const rangeErr = dbCtx.runInTransaction(() => {
        const defaultSettings = createDefaultBloomSettings();
        const { data: rawCurrent } = dbCtx.readHowardKey('bloom_settings', defaultSettings);
        const base: Record<string, unknown> = isPlainObject(rawCurrent)
          ? rawCurrent
          : { ...defaultSettings };
        const updatedRaw = mergeBloomSettingsPatch(base, incoming, profilesList);
        const errMsg = validateBloomRanges(updatedRaw);
        if (errMsg) return errMsg;
        dbCtx.stmts.howardUpsert.run('bloom_settings', JSON.stringify(updatedRaw), nowIso);
        return null;
      });

      if (rangeErr) {
        return c.json({ error: rangeErr }, 400);
      }

      cache.bumpRevision('bloom');
      return c.json(
        {
          settings: cache.readBloomSettings().settings,
          updatedAt: nowIso
        },
        200
      );
    })
    .put('/logs/:dateKey', ...jsonBody(BloomLogPutRequestSchema), (c) => {
      const dateKey = c.req.param('dateKey');
      if (!dateKey || !isValidDateKey(dateKey)) {
        return c.json({ error: 'Invalid dateKey format (expected YYYY-MM-DD)' }, 400);
      }
      const caller = getCallerProfile(c);
      const incoming = c.req.valid('json');
      const {
        settingsPatch,
        appendMist,
        removeMistId,
        appendFeeding,
        removeFeedingId,
        appendClimateCheck,
        removeClimateCheckId,
        toggleBehavior,
        ...scalarLogPatch
      } = incoming;

      if (isPlainObject(settingsPatch) && caller === 'caregiver' && !isLivePreyOnlyPatch(settingsPatch)) {
        return c.json({ error: 'Caregiver profile can only update live-prey alerts' }, 403);
      }

      const nowIso = new Date().toISOString();
      const { profilesList, profilesById } = cache.getProfilesContext();

      const txResult = dbCtx.runInTransaction(() => {
        const currentRecord = dbCtx.readDayJsonRow(dbCtx.stmts.bloomGetLogByDate, dateKey, {
          dateKey,
          mists: [],
          feedings: [],
          climateChecks: [],
          behaviors: []
        });
        const nextRecord: Record<string, unknown> = {
          ...currentRecord,
          ...(scalarLogPatch.abdomenStatus !== undefined ? { abdomenStatus: scalarLogPatch.abdomenStatus } : {}),
          ...(scalarLogPatch.abdomenUpdatedAt !== undefined
            ? { abdomenUpdatedAt: scalarLogPatch.abdomenUpdatedAt }
            : {}),
          ...(scalarLogPatch.journalNote !== undefined ? { journalNote: scalarLogPatch.journalNote } : {}),
          dateKey,
          updatedAt: nowIso
        };
        const behaviors = Array.isArray(nextRecord.behaviors)
          ? nextRecord.behaviors.filter((b): b is string => typeof b === 'string')
          : [];

        const mistRes = mutateBloomEntryList(
          nextRecord.mists,
          appendMist,
          removeMistId,
          'mist',
          nowIso
        );
        nextRecord.mists = mistRes.next;
        if (mistRes.appended?.dropletDrinkObserved && !behaviors.includes('Drank Droplets')) {
          behaviors.push('Drank Droplets');
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
          nextRecord.behaviors = behaviors.includes(tag)
            ? behaviors.filter((b) => b !== tag)
            : [...behaviors, tag];
        } else {
          nextRecord.behaviors = behaviors;
        }

        let nextSettings: BloomSettings | null = null;
        if (isPlainObject(settingsPatch)) {
          const defaultSettings = createDefaultBloomSettings();
          const { data: rawCurrent } = dbCtx.readHowardKey('bloom_settings', defaultSettings);
          const base: Record<string, unknown> = isPlainObject(rawCurrent)
            ? rawCurrent
            : { ...defaultSettings };
          const candidateSettings = mergeBloomSettingsPatch(base, settingsPatch, profilesList);
          const errMsg = validateBloomRanges(candidateSettings);
          if (errMsg) {
            return { error: errMsg as string } as const;
          }
          nextSettings = candidateSettings;
          dbCtx.stmts.howardUpsert.run('bloom_settings', JSON.stringify(nextSettings), nowIso);
        }

        const enrichedRecord = enrichBloomCareRecord(nextRecord, profilesList, profilesById);
        dbCtx.stmts.bloomUpsertLog.run(dateKey, JSON.stringify(enrichedRecord), nowIso);

        return { updatedRecord: enrichedRecord, updatedSettings: nextSettings } as const;
      });

      if ('error' in txResult) {
        return c.json({ error: txResult.error }, 400);
      }

      cache.bumpRevision('bloom');
      return c.json(
        {
          dateKey,
          record: resolveBloomCareRecord(txResult.updatedRecord, profilesById),
          ...(txResult.updatedSettings ? { settings: cache.readBloomSettings().settings } : {})
        },
        200
      );
    })
    .post('/molts', ...jsonBody(BloomMoltPostRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const incoming = c.req.valid('json');
      const nowIso = new Date().toISOString();
      const dateKey =
        incoming.dateKey && isValidDateKey(incoming.dateKey)
          ? incoming.dateKey
          : getLocalDateKey(new Date());
      const moltId =
        incoming.id || `molt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let validLengthMm: number | null = null;
      if (incoming.lengthMm !== null && incoming.lengthMm !== undefined) {
        if (!Number.isFinite(incoming.lengthMm) || incoming.lengthMm <= 0) {
          return c.json({ error: 'Body length must be a positive number' }, 400);
        }
        validLengthMm = incoming.lengthMm;
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
          const defaultSettings = createDefaultBloomSettings();
          const { data: rawCurrent } = dbCtx.readHowardKey('bloom_settings', defaultSettings);
          const base: Record<string, unknown> = isPlainObject(rawCurrent)
            ? rawCurrent
            : { ...defaultSettings };
          const parsedHard = Number(base.hardeningHours);
          const hardHours = Number.isFinite(parsedHard) && parsedHard >= 0 ? parsedHard : 36;
          const startHardening = incoming.startHardening !== false && hardHours > 0;
          const hardeningUntilIso = startHardening
            ? new Date(Date.now() + hardHours * 3600000).toISOString()
            : null;
          const baseEnc = isPlainObject(base.enclosureInfo) ? base.enclosureInfo : {};

          const nextSettings = mergeBloomSettingsPatch(
            base,
            {
              currentInstar: moltRecord.toInstar || base.currentInstar,
              ...(moltRecord.colorShift ? { currentColorMorph: moltRecord.colorShift } : {}),
              lifecycleStatus: startHardening ? 'hardening' : 'normal',
              premoltStartedAt: null,
              hardeningUntil: hardeningUntilIso,
              enclosureInfo: {
                ...baseEnc,
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
      return c.json(
        {
          molt: resolveBloomMoltRecord(moltRecord, profilesById),
          molts,
          settings,
          updatedAt: nowIso
        },
        200
      );
    })
    .delete('/molts/:moltId', (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const moltId = c.req.param('moltId');
      if (!moltId) {
        return c.json({ error: 'Invalid or missing molt ID' }, 400);
      }
      const nowIso = new Date().toISOString();
      const { profilesList } = cache.getProfilesContext();
      const deleted = dbCtx.runInTransaction(() => {
        const beforeMolts = cache.readBloomMolts().molts;
        const deletedIndex = beforeMolts.findIndex((m) => m.id === moltId);
        const deletedMolt = deletedIndex >= 0 ? beforeMolts[deletedIndex] : null;
        const res = dbCtx.stmts.bloomDeleteMolt.run(moltId);
        if (deletedMolt && deletedIndex === 0) {
          const remaining = cache.readBloomMolts().molts;
          const defaultSettings = createDefaultBloomSettings();
          const { data: rawCurrent } = dbCtx.readHowardKey('bloom_settings', defaultSettings);
          const base: Record<string, unknown> = isPlainObject(rawCurrent)
            ? rawCurrent
            : { ...defaultSettings };
          const revertedInstar =
            remaining[0]?.toInstar || deletedMolt.fromInstar || base.currentInstar;
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
        return res.changes > 0;
      });
      if (deleted) {
        cache.bumpRevision('bloom');
      }
      const { molts, settings } = cache.getCachedBloomState();
      return c.json({ deleted: true, id: moltId, molts, settings }, 200);
    })
    .put('/feeders/:feederId', ...jsonBody(BloomFeederPutRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const feederId = c.req.param('feederId');
      if (!feederId) {
        return c.json({ error: 'Invalid or missing feeder ID' }, 400);
      }
      const incoming = c.req.valid('json');
      const nameTrimmed = incoming.name.trim();
      if (!nameTrimmed) {
        return c.json({ error: 'Feeder culture name cannot be empty' }, 400);
      }
      const shelfLife = incoming.shelfLifeDays !== undefined ? incoming.shelfLifeDays : 28;
      if (!Number.isFinite(shelfLife) || shelfLife < 1 || shelfLife > 365) {
        return c.json({ error: 'Feeder shelf life must be between 1 and 365 days' }, 400);
      }
      const nowIso = new Date().toISOString();
      const feederRecord: BloomFeederCulture = {
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
      return c.json({ feeder: feederRecord, feeders, updatedAt: nowIso }, 200);
    })
    .delete('/feeders/:feederId', (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const feederId = c.req.param('feederId');
      if (!feederId) {
        return c.json({ error: 'Invalid or missing feeder ID' }, 400);
      }
      const res = dbCtx.stmts.bloomDeleteFeeder.run(feederId);
      if (res.changes > 0) {
        cache.bumpRevision('bloom');
      }
      const { feeders } = cache.getCachedBloomState();
      return c.json({ deleted: true, id: feederId, feeders }, 200);
    });
}
