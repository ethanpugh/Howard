import path from 'node:path';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { isValidDateKey, getLocalDateKey } from '../../shared/dateUtils.ts';
import { DEFAULT_PROFILES, isAlmanacEventVisibleToProfile } from '../../shared/profileUtils.ts';
import { DEFAULT_BEACON_INFO } from '../../shared/defaults.ts';
import type { ProfileId } from '../../shared/schemas/common.ts';
import {
  AlmanacBatchRequestSchema,
  AlmanacReplaceRequestSchema,
  AlmanacSinglePutBodySchema,
  type AlmanacEvent
} from '../../shared/schemas/almanac.ts';
import { BeaconPutRequestSchema } from '../../shared/schemas/beacon.ts';
import {
  LedgerItemPutRequestSchema,
  LedgerReplacePutRequestSchema,
  LedgerSettingsRequestSchema,
  type LedgerKind,
  type LedgerOwner
} from '../../shared/schemas/ledger.ts';
import {
  UpdatePinRequestSchema,
  UpdateProfileNameRequestSchema,
  VerifyPinRequestSchema,
  type Profile
} from '../../shared/schemas/profile.ts';
import {
  BackupRestorePayloadSchema,
  type SyncDomain,
  type UnifiedSyncResponse
} from '../../shared/schemas/sync.ts';
import { MAX_SSE_CLIENTS, type RuntimeCache, type SseClient } from '../cache.ts';
import type { DatabaseContext } from '../db.ts';
import {
  createPinRateLimiter,
  getCallerProfile,
  jsonBody,
  requirePartner,
  requireSelfPartner
} from '../honoHelpers.ts';
import {
  CURRENT_SCHEMA_VERSION,
  VALID_LEDGER_KINDS,
  VALID_LEDGER_OWNERS,
  hashPin,
  isPlainObject,
  validateAlmanacEventFields,
  validateProfileNameCandidate,
  verifyPinHash
} from '../utils.ts';
import { buildFullBackupPayload, executeRestorePayload } from '../backup.ts';
import { writeLedgerItemsInTx } from '../migrations.ts';
import {
  enrichAlmanacEvent,
  mergeBeaconInfo,
  normalizeLedgerData,
  resolveAlmanacEvent,
  resolveBeaconInfo,
  sanitizeProfilesForClient
} from './profileResolve.ts';

function isStoredAlmanacVisible(
  dbCtx: DatabaseContext,
  eventId: string,
  callerProfile: ProfileId,
  profilesList: Profile[]
): boolean {
  const row = dbCtx.stmts.almanacGetById.get(eventId) as { data: string } | undefined;
  if (!row) return true;
  try {
    const parsed: unknown = JSON.parse(row.data);
    if (!isPlainObject(parsed)) return true;
    return isAlmanacEventVisibleToProfile(parsed, callerProfile, profilesList);
  } catch {
    return true;
  }
}

export function createHowardRoutes({
  dbCtx,
  cache
}: {
  dbCtx: DatabaseContext;
  cache: RuntimeCache;
}) {
  const pinLimiter = createPinRateLimiter();

  return new Hono()
    .get('/health', (c) => {
      const payload = {
        status: 'ok' as const,
        app: 'Howard Household Suite',
        dbFolder: path.basename(dbCtx.dataDir) || 'data',
        dbFile: 'howard.db',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        journalMode: dbCtx.activeJournalMode,
        serverTime: new Date().toISOString()
      };
      return c.json(payload, 200);
    })
    .get('/howard/events', (c) => {
      if (cache.sseClients.size >= MAX_SSE_CLIENTS) {
        return c.json({ error: 'Too many active SSE connections' }, 503);
      }
      const activeProfile = getCallerProfile(c);
      c.header('Cache-Control', 'no-cache, no-transform');
      c.header('X-Accel-Buffering', 'no');
      return streamSSE(c, async (stream) => {
        let closed = false;
        const keepAliveState: { resolve: (() => void) | null } = { resolve: null };
        const keepAlivePromise = new Promise<void>((resolve) => {
          keepAliveState.resolve = resolve;
        });

        const client: SseClient = {
          profileId: activeProfile,
          send: (event, data) => stream.writeSSE({ event, data }),
          ping: async () => {
            await stream.writeln(': ping');
          },
          close: () => {
            if (closed) return;
            closed = true;
            keepAliveState.resolve?.();
            void stream.close().catch(() => {});
          },
          isClosed: () => closed || stream.closed || stream.aborted
        };

        cache.sseClients.add(client);
        stream.onAbort(() => {
          closed = true;
          cache.sseClients.delete(client);
          keepAliveState.resolve?.();
        });

        try {
          if (!closed && !stream.aborted && !stream.closed) {
            await stream.writeSSE({
              event: 'ready',
              data: JSON.stringify({ syncToken: cache.getSyncTokenForProfile(activeProfile) })
            });
          }
          if (!closed && !stream.aborted && !stream.closed) {
            await keepAlivePromise;
          }
        } finally {
          closed = true;
          cache.sseClients.delete(client);
          keepAliveState.resolve?.();
        }
      });
    })
    .get('/howard/sync', (c) => {
      const activeProfile = getCallerProfile(c);
      const clientSince = c.req.query('since') || '';
      const syncToken = cache.getSyncTokenForProfile(activeProfile);
      const prev = cache.parseSyncToken(clientSince, activeProfile);

      const curH = cache.domainRevisions.howard;
      const curC = cache.domainRevisions.cadence;
      const curB = cache.domainRevisions.bloom;
      const curF = activeProfile === 'partner2' ? cache.domainRevisions.floodgate : 0;
      const curQ = cache.domainRevisions.quill;

      if (
        prev &&
        prev.howard === curH &&
        prev.cadence === curC &&
        prev.bloom === curB &&
        prev.floodgate === curF &&
        prev.quill === curQ
      ) {
        const unchangedPayload: UnifiedSyncResponse = { unchanged: true, syncToken };
        return c.json(unchangedPayload, 200);
      }

      const dbInfo = {
        file: 'data/howard.db',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        journalMode: dbCtx.activeJournalMode
      };

      if (prev) {
        const changedDomains: SyncDomain[] = [];
        const payload: Extract<UnifiedSyncResponse, { unchanged: false }> = {
          unchanged: false,
          partial: true,
          syncToken,
          changedDomains,
          serverTime: new Date().toISOString()
        };
        if (prev.howard !== curH) {
          payload.howard = cache.projectHowardStateForProfile(activeProfile);
          payload.dbInfo = dbInfo;
          changedDomains.push('howard');
        }
        if (prev.cadence !== curC) {
          payload.cadence = cache.getCachedCadenceState();
          changedDomains.push('cadence');
        }
        if (prev.bloom !== curB) {
          payload.bloom = cache.getCachedBloomState();
          changedDomains.push('bloom');
        }
        if (activeProfile === 'partner2' && prev.floodgate !== curF) {
          payload.floodgate = cache.getCachedFloodgateState();
          changedDomains.push('floodgate');
        }
        if (prev.quill !== curQ) {
          payload.quill = cache.projectQuillStateForProfile(activeProfile);
          changedDomains.push('quill');
        }
        return c.json(payload, 200);
      }

      const howardState = cache.projectHowardStateForProfile(activeProfile);
      const cadence = cache.getCachedCadenceState();
      const bloom = cache.getCachedBloomState();
      const floodgate = activeProfile === 'partner2' ? cache.getCachedFloodgateState() : null;
      const quill = cache.projectQuillStateForProfile(activeProfile);
      const changedDomains: SyncDomain[] = ['howard', 'cadence', 'bloom', 'quill'];
      if (floodgate) changedDomains.push('floodgate');

      const fullPayload: UnifiedSyncResponse = {
        unchanged: false,
        partial: false,
        syncToken,
        changedDomains,
        dbInfo,
        howard: howardState,
        cadence,
        bloom,
        floodgate,
        quill,
        serverTime: new Date().toISOString()
      };
      return c.json(fullPayload, 200);
    })
    .post('/howard/profiles/verify-pin', ...jsonBody(VerifyPinRequestSchema), (c) => {
      const { profileId, pin } = c.req.valid('json');
      const rate = pinLimiter.check(c, profileId);
      if (!rate.allowed) {
        c.header('Retry-After', String(rate.retryAfterSec));
        return c.json(
          { verified: false, error: 'Too many incorrect PIN attempts. Try again shortly.' },
          429
        );
      }

      const { data: profiles } = dbCtx.readHowardKey<Profile[]>('profiles', DEFAULT_PROFILES);
      const target = profiles.find((p) => p.id === profileId);
      if (!target) {
        return c.json({ error: 'Profile not found' }, 404);
      }
      if (!target.pinEnabled || (!target.pinHash && !target.pin) || target.id === 'caregiver') {
        pinLimiter.reset(c, profileId);
        const sanitized = sanitizeProfilesForClient([target])[0];
        if (!sanitized) return c.json({ error: 'Profile not found' }, 404);
        return c.json({ verified: true, profile: sanitized }, 200);
      }
      if (!verifyPinHash(pin, target)) {
        pinLimiter.recordFailure(c, profileId);
        return c.json({ verified: false, error: 'Incorrect PIN' }, 401);
      }
      pinLimiter.reset(c, profileId);
      const sanitized = sanitizeProfilesForClient([target])[0];
      if (!sanitized) return c.json({ error: 'Profile not found' }, 404);
      return c.json({ verified: true, profile: sanitized }, 200);
    })
    .put('/howard/profiles/pin', ...jsonBody(UpdatePinRequestSchema), (c) => {
      const { profileId, currentPin, newPin, pinEnabled } = c.req.valid('json');
      const auth = requireSelfPartner(c, profileId);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const rate = pinLimiter.check(c, profileId);
      if (!rate.allowed) {
        c.header('Retry-After', String(rate.retryAfterSec));
        return c.json({ error: 'Too many PIN attempts. Try again shortly.' }, 429);
      }

      const txResult = dbCtx.runInTransaction(() => {
        const { data: profiles } = dbCtx.readHowardKey<Profile[]>('profiles', DEFAULT_PROFILES);
        const idx = profiles.findIndex((p) => p.id === profileId);
        if (idx === -1) {
          return { error: 'Profile not found', status: 404 as const };
        }
        const target = profiles[idx];
        if (!target) {
          return { error: 'Profile not found', status: 404 as const };
        }
        if (target.id === 'caregiver') {
          return { error: 'Caregiver profile must remain unlocked', status: 400 as const };
        }
        if (target.pinEnabled && (target.pinHash || target.pin)) {
          if (!verifyPinHash(currentPin || '', target)) {
            return { error: 'Current PIN is incorrect', status: 401 as const };
          }
        }
        const nextProfiles = [...profiles];
        if (pinEnabled) {
          const cleaned = String(newPin || '').trim();
          if (!/^\d{4,8}$/.test(cleaned)) {
            return { error: 'PIN must be 4 to 8 digits', status: 400 as const };
          }
          nextProfiles[idx] = { ...target, pinEnabled: true, pin: '', pinHash: hashPin(cleaned) };
        } else {
          nextProfiles[idx] = { ...target, pinEnabled: false, pin: '', pinHash: '' };
        }
        dbCtx.writeHowardKey('profiles', nextProfiles);
        return { profiles: nextProfiles } as const;
      });

      if ('error' in txResult) {
        if (txResult.status === 401) pinLimiter.recordFailure(c, profileId);
        return c.json({ error: txResult.error }, txResult.status);
      }

      pinLimiter.reset(c, profileId);
      cache.bumpRevision('profiles');
      return c.json({ profiles: sanitizeProfilesForClient(txResult.profiles) }, 200);
    })
    .put('/howard/profiles/name', ...jsonBody(UpdateProfileNameRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const { profileId, name } = c.req.valid('json');
      if (profileId === 'caregiver') {
        return c.json({ error: 'Caregiver profile display name cannot be changed' }, 400);
      }
      const check = validateProfileNameCandidate(name, 'Name');
      if (!check.valid) {
        return c.json({ error: check.error }, 400);
      }

      const nowIso = new Date().toISOString();
      const txResult = dbCtx.runInTransaction(() => {
        const { data: profiles } = dbCtx.readHowardKey<Profile[]>('profiles', DEFAULT_PROFILES);
        const idx = profiles.findIndex((p) => p.id === profileId);
        const target = idx !== -1 ? profiles[idx] : undefined;
        if (!target) {
          return { error: 'Profile not found', status: 404 as const };
        }
        const lowerCleaned = check.cleaned.toLowerCase();
        const duplicate = profiles.some(
          (p) => p.id !== profileId && String(p.name || '').trim().toLowerCase() === lowerCleaned
        );
        if (duplicate) {
          return { error: 'Another profile already uses that name', status: 400 as const };
        }
        const nextProfiles = [...profiles];
        nextProfiles[idx] = {
          ...target,
          name: check.cleaned,
          caregiverName: check.cleaned
        };
        dbCtx.stmts.howardUpsert.run('profiles', JSON.stringify(nextProfiles), nowIso);
        return { profiles: nextProfiles } as const;
      });

      if ('error' in txResult) {
        return c.json({ error: txResult.error }, txResult.status);
      }

      cache.bumpRevision('profiles');
      return c.json({ profiles: sanitizeProfilesForClient(txResult.profiles) }, 200);
    })
    .post('/howard/almanac/events/batch', ...jsonBody(AlmanacBatchRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const incoming = c.req.valid('json');
      const upserts = Array.isArray(incoming.upserts) ? incoming.upserts : [];
      const deleteIds = Array.isArray(incoming.deleteIds) ? incoming.deleteIds : [];
      const nowIso = new Date().toISOString();
      const { profilesList, profilesById } = cache.getProfilesContext();

      for (const evt of upserts) {
        const errMsg = validateAlmanacEventFields(evt);
        if (errMsg) {
          return c.json({ error: errMsg }, 400);
        }
      }

      const forbiddenErr = dbCtx.runInTransaction(() => {
        for (const id of deleteIds) {
          if (!isStoredAlmanacVisible(dbCtx, id, auth.profileId, profilesList)) {
            return 'Almanac event not found';
          }
        }
        for (const evt of upserts) {
          if (!isStoredAlmanacVisible(dbCtx, evt.id, auth.profileId, profilesList)) {
            return 'Almanac event not found';
          }
        }

        for (const id of deleteIds) {
          if (id) dbCtx.stmts.almanacDelete.run(id);
        }
        for (const evt of upserts) {
          const record = enrichAlmanacEvent(
            { ...evt, title: evt.title.trim(), id: evt.id, date: evt.date, updatedAt: nowIso },
            profilesList,
            profilesById
          );
          dbCtx.stmts.almanacUpsert.run(evt.id, evt.date, JSON.stringify(record), nowIso);
        }
        return null;
      });

      if (forbiddenErr) {
        return c.json({ error: forbiddenErr }, 404);
      }

      cache.bumpRevision('almanac');
      const projected = cache.projectHowardStateForProfile(auth.profileId);
      return c.json({ almanacEvents: projected.almanacEvents, updatedAt: nowIso }, 200);
    })
    .put('/howard/almanac/events/:eventId', ...jsonBody(AlmanacSinglePutBodySchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const eventId = c.req.param('eventId');
      if (!eventId) {
        return c.json({ error: 'Invalid or missing event ID' }, 400);
      }
      const nowIso = new Date().toISOString();
      const incoming = c.req.valid('json');
      const evt: Record<string, unknown> = incoming.event
        ? { ...incoming.event }
        : { ...incoming };
      const errMsg = validateAlmanacEventFields(evt);
      if (errMsg) {
        return c.json({ error: errMsg }, 400);
      }

      const dateKey = String(evt.date);
      const { profilesList, profilesById } = cache.getProfilesContext();

      const saved = dbCtx.runInTransaction(() => {
        if (!isStoredAlmanacVisible(dbCtx, eventId, auth.profileId, profilesList)) {
          return null;
        }
        const record = enrichAlmanacEvent(
          { ...evt, title: String(evt.title).trim(), id: eventId, date: dateKey, updatedAt: nowIso },
          profilesList,
          profilesById
        );
        dbCtx.stmts.almanacUpsert.run(eventId, dateKey, JSON.stringify(record), nowIso);
        return record;
      });

      if (!saved) {
        return c.json({ error: 'Almanac event not found' }, 404);
      }

      cache.bumpRevision('almanac');
      return c.json(
        {
          event: resolveAlmanacEvent(saved, profilesById),
          updatedAt: nowIso
        },
        200
      );
    })
    .delete('/howard/almanac/events/:eventId', (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const eventId = c.req.param('eventId');
      if (!eventId) {
        return c.json({ error: 'Invalid or missing event ID' }, 400);
      }
      const nowIso = new Date().toISOString();
      const { profilesList } = cache.getProfilesContext();

      const outcome = dbCtx.runInTransaction(() => {
        if (!isStoredAlmanacVisible(dbCtx, eventId, auth.profileId, profilesList)) {
          return { notFound: true, changed: false } as const;
        }
        const res = dbCtx.stmts.almanacDelete.run(eventId);
        return { notFound: false, changed: res.changes > 0 } as const;
      });

      if (outcome.notFound) {
        return c.json({ error: 'Almanac event not found' }, 404);
      }
      if (outcome.changed) {
        cache.bumpRevision('almanac');
      }
      return c.json({ deleted: true, id: eventId, updatedAt: nowIso }, 200);
    })
    .put('/howard/almanac', ...jsonBody(AlmanacReplaceRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const incoming = c.req.valid('json');
      const nowIso = new Date().toISOString();
      const fallbackDate = getLocalDateKey(new Date());
      const { profilesList, profilesById } = cache.getProfilesContext();

      dbCtx.runInTransaction(() => {
        const preservedPrivate: AlmanacEvent[] = [];
        if (auth.profileId === 'partner1') {
          for (const existingEvt of cache.getCachedHowardAlmanac().almanacEvents) {
            if (!isAlmanacEventVisibleToProfile(existingEvt, 'partner1', profilesList)) {
              preservedPrivate.push(existingEvt);
            }
          }
        }
        dbCtx.stmts.almanacClearAll.run();
        for (const privEvt of preservedPrivate) {
          dbCtx.stmts.almanacUpsert.run(
            privEvt.id,
            privEvt.date,
            JSON.stringify(privEvt),
            privEvt.updatedAt || nowIso
          );
        }
        incoming.events.forEach((evt, idx) => {
          const id = String(evt.id || `evt-${Date.now()}-${idx}`);
          const dateKey = isValidDateKey(evt.date) ? evt.date : fallbackDate;
          const updatedAt = typeof evt.updatedAt === 'string' ? evt.updatedAt : nowIso;
          const record = enrichAlmanacEvent(
            { ...evt, id, date: dateKey },
            profilesList,
            profilesById
          );
          dbCtx.stmts.almanacUpsert.run(id, dateKey, JSON.stringify(record), updatedAt);
        });
      });

      cache.bumpRevision('almanac');
      const projected = cache.projectHowardStateForProfile(auth.profileId);
      return c.json(
        {
          almanacEvents: projected.almanacEvents,
          updatedAt: nowIso
        },
        200
      );
    })
    .put('/howard/ledger/settings', ...jsonBody(LedgerSettingsRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const incoming = c.req.valid('json');
      const splitRule = incoming.splitRule === 'proportional' ? 'proportional' : '50-50';
      const updatedAt = dbCtx.writeHowardKey('ledger_settings', { splitRule });
      cache.bumpRevision('ledger');
      return c.json({ splitRule, updatedAt }, 200);
    })
    .put('/howard/ledger/items/:itemId', ...jsonBody(LedgerItemPutRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const itemId = c.req.param('itemId');
      if (!itemId) {
        return c.json({ error: 'Invalid or missing ledger item ID' }, 400);
      }
      const nowIso = new Date().toISOString();
      const incoming = c.req.valid('json');
      const kind: LedgerKind = VALID_LEDGER_KINDS.has(incoming.kind as LedgerKind)
        ? (incoming.kind as LedgerKind)
        : 'expense';
      const rawItem = isPlainObject(incoming.item) ? incoming.item : incoming;
      if (typeof rawItem.title !== 'string' || !rawItem.title.trim()) {
        return c.json({ error: 'Ledger item title cannot be empty' }, 400);
      }
      if (typeof rawItem.amount !== 'number' || !Number.isFinite(rawItem.amount) || rawItem.amount < 0) {
        return c.json({ error: 'Ledger amount must be a non-negative finite number' }, 400);
      }
      if (rawItem.owner !== undefined && !VALID_LEDGER_OWNERS.has(rawItem.owner as LedgerOwner)) {
        return c.json({ error: 'Invalid ledger owner' }, 400);
      }
      if (
        kind === 'expense' &&
        rawItem.paidBy !== undefined &&
        !VALID_LEDGER_OWNERS.has(rawItem.paidBy as LedgerOwner)
      ) {
        return c.json({ error: 'Invalid expense paidBy value' }, 400);
      }

      const trimmedTitle = rawItem.title.trim();
      const amount = rawItem.amount;

      const txResult = dbCtx.runInTransaction(() => {
        const existingRow = dbCtx.stmts.ledgerGetById.get(itemId) as
          | { id: string; kind: string }
          | undefined;
        if (existingRow && existingRow.kind !== kind) {
          return {
            error: `Ledger item "${itemId}" already exists as kind "${existingRow.kind}"`
          } as const;
        }
        const record = {
          ...rawItem,
          title: trimmedTitle,
          amount,
          id: itemId,
          updatedAt: nowIso
        };
        dbCtx.stmts.ledgerUpsert.run(itemId, kind, JSON.stringify(record), nowIso);
        return { record } as const;
      });

      if ('error' in txResult) {
        return c.json({ error: txResult.error }, 409);
      }

      cache.bumpRevision('ledger');
      return c.json({ id: itemId, kind, item: txResult.record, updatedAt: nowIso }, 200);
    })
    .delete('/howard/ledger/items/:itemId', (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const itemId = c.req.param('itemId');
      if (!itemId) {
        return c.json({ error: 'Invalid or missing ledger item ID' }, 400);
      }
      const nowIso = new Date().toISOString();
      const res = dbCtx.stmts.ledgerDelete.run(itemId);
      if (res.changes > 0) {
        cache.bumpRevision('ledger');
      }
      return c.json({ deleted: true, id: itemId, updatedAt: nowIso }, 200);
    })
    .put('/howard/ledger', ...jsonBody(LedgerReplacePutRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const incoming = c.req.valid('json');
      const rawLedger = incoming.ledgerData !== undefined ? incoming.ledgerData : incoming;
      const hasLedgerField =
        isPlainObject(rawLedger) &&
        ['splitRule', 'incomes', 'recurring', 'expenses'].some((k) =>
          Object.prototype.hasOwnProperty.call(rawLedger, k)
        );
      if (!hasLedgerField) {
        return c.json(
          {
            error: 'Expected ledgerData object with splitRule, incomes, recurring, or expenses'
          },
          400
        );
      }
      const nowIso = new Date().toISOString();
      const normalized = normalizeLedgerData(rawLedger);
      const seenIds = new Set<string>();
      for (const item of [...normalized.expenses, ...normalized.recurring, ...normalized.incomes]) {
        if (seenIds.has(item.id)) {
          return c.json({ error: `Duplicate ledger item id "${item.id}"` }, 400);
        }
        seenIds.add(item.id);
      }

      dbCtx.runInTransaction(() => {
        dbCtx.stmts.howardUpsert.run(
          'ledger_settings',
          JSON.stringify({ splitRule: normalized.splitRule }),
          nowIso
        );
        dbCtx.stmts.ledgerClearAll.run();
        writeLedgerItemsInTx(dbCtx, normalized, { nowIso });
      });
      cache.bumpRevision('ledger');
      return c.json({ ledgerData: normalized, updatedAt: nowIso }, 200);
    })
    .put('/howard/beacon', ...jsonBody(BeaconPutRequestSchema), (c) => {
      const auth = requirePartner(c);
      if (!auth.ok) return c.json({ error: auth.error }, 403);

      const incoming = c.req.valid('json');
      const patch = incoming.beaconInfo !== undefined ? incoming.beaconInfo : incoming;
      const { profilesList, profilesById } = cache.getProfilesContext();

      const { updated, updatedAt } = dbCtx.runInTransaction(() => {
        const { data: current } = dbCtx.readHowardKey('beacon_info', DEFAULT_BEACON_INFO);
        const merged = mergeBeaconInfo(current, patch, profilesList, {
          mergeContacts: false,
          profilesById
        });
        const ts = dbCtx.writeHowardKey('beacon_info', merged);
        return { updated: merged, updatedAt: ts };
      });

      cache.bumpRevision('beacon');
      return c.json(
        {
          beaconInfo: resolveBeaconInfo(updated, profilesById, profilesList),
          updatedAt
        },
        200
      );
    })
    .get('/howard/backup', (c) => {
      const reqProfile = getCallerProfile(c);
      if (reqProfile !== 'partner1' && reqProfile !== 'partner2') {
        return c.json({ error: 'Caregiver profile cannot export database backups' }, 403);
      }
      // Option 2B: Both household partners can export full disaster-recovery household backups
      const includeFloodgate = c.req.query('includeFloodgate') !== '0';
      const payload = buildFullBackupPayload(dbCtx, cache, { includeFloodgate });
      return c.json(payload, 200);
    })
    .post('/howard/restore', ...jsonBody(BackupRestorePayloadSchema), (c) => {
      const actorProfileId = getCallerProfile(c);
      if (actorProfileId !== 'partner1') {
        return c.json({ error: 'Only the primary household profile can restore backups' }, 403);
      }
      const incoming = c.req.valid('json') as Record<string, unknown>;
      const result = executeRestorePayload(dbCtx, cache, incoming);
      return c.json(result, 200);
    });
}
