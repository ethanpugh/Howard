import { VALID_DATE_KEY_RE, getLocalDateKey } from '../../shared/dateUtils.js';
import { DEFAULT_PROFILES } from '../../shared/profileUtils.js';
import { DEFAULT_BEACON_INFO } from '../../shared/defaults.js';
import {
  CURRENT_SCHEMA_VERSION,
  VALID_LEDGER_KINDS,
  VALID_LEDGER_OWNERS,
  isPlainObject,
  validateAlmanacEventFields,
  validateProfileNameCandidate
} from '../utils.js';
import { buildFullBackupPayload, executeRestorePayload } from '../backup.js';
import { writeLedgerItemsInTx } from '../migrations.js';
import {
  enrichAlmanacEvent,
  mergeBeaconInfo,
  normalizeLedgerData,
  resolveAlmanacEvent,
  resolveBeaconInfo,
  sanitizeProfilesForClient
} from './profileResolve.js';

export async function handleHowardRoutes({
  req,
  res,
  pathname,
  parsedUrl,
  dbCtx,
  cache,
  helpers
}) {
  if (pathname === '/api/health' && (req.method === 'GET' || req.method === 'HEAD')) {
    const payload = {
      status: 'ok',
      app: 'Howard Household Suite',
      dbFolder: dbCtx.dataDir,
      dbFile: 'howard.db',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      journalMode: dbCtx.activeJournalMode,
      serverTime: new Date().toISOString()
    };
    if (req.method === 'HEAD') {
      const body = JSON.stringify(payload);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Length': Buffer.byteLength(body)
      });
      res.end();
      return true;
    }
    helpers.sendJson(res, 200, payload);
    return true;
  }

  if (pathname === '/api/howard/events' && req.method === 'GET') {
    const activeProfile = helpers.getCallerProfile(req, parsedUrl);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders?.();
    const client = { res, profileId: activeProfile };
    cache.sseClients.add(client);
    res.write(
      `event: ready\ndata: ${JSON.stringify({ syncToken: cache.getSyncTokenForProfile(activeProfile) })}\n\n`
    );
    const cleanup = () => {
      cache.sseClients.delete(client);
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
    return true;
  }

  if (pathname === '/api/howard/sync' && req.method === 'GET') {
    const activeProfile = helpers.getCallerProfile(req, parsedUrl);
    const clientSince = parsedUrl.searchParams.get('since') || '';
    const syncToken = cache.getSyncTokenForProfile(activeProfile);
    const prev = cache.parseSyncToken(clientSince, activeProfile);

    const curH = cache.domainRevisions.howard;
    const curC = cache.domainRevisions.cadence;
    const curB = cache.domainRevisions.bloom;
    const curF = activeProfile === 'partner2' ? cache.domainRevisions.floodgate : 0;

    if (
      prev &&
      prev.howard === curH &&
      prev.cadence === curC &&
      prev.bloom === curB &&
      prev.floodgate === curF
    ) {
      helpers.sendJson(res, 200, { unchanged: true, syncToken });
      return true;
    }

    const dbInfo = {
      file: 'data/howard.db',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      journalMode: dbCtx.activeJournalMode
    };

    if (prev) {
      const changedDomains = [];
      const payload = {
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
      helpers.sendJson(res, 200, payload);
      return true;
    }

    const howardState = cache.projectHowardStateForProfile(activeProfile);
    const cadence = cache.getCachedCadenceState();
    const bloom = cache.getCachedBloomState();
    const floodgate = activeProfile === 'partner2' ? cache.getCachedFloodgateState() : null;
    const changedDomains = ['howard', 'cadence', 'bloom'];
    if (floodgate) changedDomains.push('floodgate');

    helpers.sendJson(res, 200, {
      unchanged: false,
      partial: false,
      syncToken,
      changedDomains,
      dbInfo,
      howard: howardState,
      cadence,
      bloom,
      floodgate,
      serverTime: new Date().toISOString()
    });
    return true;
  }

  if (pathname === '/api/howard/profiles/verify-pin' && req.method === 'POST') {
    const { profileId, pin } = await helpers.parseJsonBody(req);
    const { data: profiles } = dbCtx.readHowardKey('profiles', DEFAULT_PROFILES);
    const target = profiles.find((p) => p.id === profileId);
    if (!target) {
      helpers.sendJson(res, 404, { error: 'Profile not found' });
      return true;
    }
    if (!target.pinEnabled || !target.pin || target.id === 'caregiver') {
      helpers.sendJson(res, 200, {
        verified: true,
        profile: sanitizeProfilesForClient([target])[0]
      });
      return true;
    }
    if (String(pin || '').trim() !== String(target.pin).trim()) {
      helpers.sendJson(res, 401, { verified: false, error: 'Incorrect PIN' });
      return true;
    }
    helpers.sendJson(res, 200, {
      verified: true,
      profile: sanitizeProfilesForClient([target])[0]
    });
    return true;
  }

  if (pathname === '/api/howard/profiles/pin' && req.method === 'PUT') {
    const { profileId, currentPin, newPin, pinEnabled } = await helpers.parseJsonBody(req);
    const { data: profiles } = dbCtx.readHowardKey('profiles', DEFAULT_PROFILES);
    const idx = profiles.findIndex((p) => p.id === profileId);
    if (idx === -1) {
      helpers.sendJson(res, 404, { error: 'Profile not found' });
      return true;
    }
    const target = profiles[idx];
    if (target.id === 'caregiver') {
      helpers.sendJson(res, 400, { error: 'Caregiver profile must remain unlocked' });
      return true;
    }
    if (target.pinEnabled && target.pin) {
      if (String(currentPin || '').trim() !== String(target.pin).trim()) {
        helpers.sendJson(res, 401, { error: 'Current PIN is incorrect' });
        return true;
      }
    }
    const nextProfiles = [...profiles];
    if (pinEnabled) {
      const cleaned = String(newPin || '').trim();
      if (!/^\d{4,8}$/.test(cleaned)) {
        helpers.sendJson(res, 400, { error: 'PIN must be 4 to 8 digits' });
        return true;
      }
      nextProfiles[idx] = { ...target, pinEnabled: true, pin: cleaned };
    } else {
      nextProfiles[idx] = { ...target, pinEnabled: false, pin: '' };
    }
    dbCtx.writeHowardKey('profiles', nextProfiles);
    cache.bumpRevision('profiles');
    helpers.sendJson(res, 200, { profiles: sanitizeProfilesForClient(nextProfiles) });
    return true;
  }

  if (pathname === '/api/howard/profiles/name' && req.method === 'PUT') {
    const { profileId, name } = await helpers.parseJsonBody(req);
    if (profileId === 'caregiver') {
      helpers.sendJson(res, 400, { error: 'Caregiver profile display name cannot be changed' });
      return true;
    }
    const check = validateProfileNameCandidate(name, 'Name');
    if (!check.valid) {
      helpers.sendJson(res, 400, { error: check.error });
      return true;
    }
    const { data: profiles } = dbCtx.readHowardKey('profiles', DEFAULT_PROFILES);
    const idx = profiles.findIndex((p) => p.id === profileId);
    if (idx === -1) {
      helpers.sendJson(res, 404, { error: 'Profile not found' });
      return true;
    }
    const lowerCleaned = check.cleaned.toLowerCase();
    const duplicate = profiles.some(
      (p) => p.id !== profileId && String(p.name || '').trim().toLowerCase() === lowerCleaned
    );
    if (duplicate) {
      helpers.sendJson(res, 400, { error: 'Another profile already uses that name' });
      return true;
    }

    const nowIso = new Date().toISOString();
    const nextProfiles = [...profiles];
    nextProfiles[idx] = {
      ...nextProfiles[idx],
      name: check.cleaned,
      caregiverName: check.cleaned
    };

    dbCtx.runInTransaction(() => {
      dbCtx.stmts.howardUpsert.run('profiles', JSON.stringify(nextProfiles), nowIso);
    });
    cache.bumpRevision('all');

    helpers.sendJson(res, 200, { profiles: sanitizeProfilesForClient(nextProfiles) });
    return true;
  }

  if (pathname === '/api/howard/almanac/events/batch') {
    if (req.method !== 'POST') {
      helpers.sendJson(res, 405, { error: 'Method not allowed' });
      return true;
    }
    const incoming = await helpers.parseJsonBody(req);
    const upserts = Array.isArray(incoming.upserts) ? incoming.upserts : [];
    const deleteIds = Array.isArray(incoming.deleteIds) ? incoming.deleteIds : [];
    const nowIso = new Date().toISOString();
    const { profilesList, profilesById } = cache.getProfilesContext();

    for (const evt of upserts) {
      if (!isPlainObject(evt) || !evt.id) {
        helpers.sendJson(res, 400, { error: 'Each Almanac upsert requires a valid event id' });
        return true;
      }
      const errMsg = validateAlmanacEventFields(evt);
      if (errMsg) {
        helpers.sendJson(res, 400, { error: errMsg });
        return true;
      }
    }

    dbCtx.runInTransaction(() => {
      for (const id of deleteIds) {
        if (id) dbCtx.stmts.almanacDelete.run(String(id));
      }
      for (const evt of upserts) {
        const id = String(evt.id);
        const dateKey = evt.date;
        const record = enrichAlmanacEvent(
          { ...evt, title: evt.title.trim(), id, date: dateKey, updatedAt: nowIso },
          profilesList,
          profilesById
        );
        dbCtx.stmts.almanacUpsert.run(id, dateKey, JSON.stringify(record), nowIso);
      }
    });

    cache.bumpRevision('almanac');
    const { almanacEvents } = cache.getCachedHowardAlmanac();
    helpers.sendJson(res, 200, { almanacEvents, updatedAt: nowIso });
    return true;
  }

  if (pathname.startsWith('/api/howard/almanac/events/')) {
    const eventId = helpers.parseRequiredSegment(pathname, '/api/howard/almanac/events/');
    if (!eventId) {
      helpers.sendJson(res, 400, { error: 'Invalid or missing event ID' });
      return true;
    }
    const nowIso = new Date().toISOString();

    if (req.method === 'PUT') {
      const incoming = await helpers.parseJsonBody(req);
      const evt = incoming.event || incoming;
      const errMsg = validateAlmanacEventFields(evt);
      if (errMsg) {
        helpers.sendJson(res, 400, { error: errMsg });
        return true;
      }
      const dateKey = evt.date;
      const { profilesList, profilesById } = cache.getProfilesContext();
      const record = enrichAlmanacEvent(
        { ...evt, title: evt.title.trim(), id: eventId, date: dateKey, updatedAt: nowIso },
        profilesList,
        profilesById
      );
      dbCtx.stmts.almanacUpsert.run(eventId, dateKey, JSON.stringify(record), nowIso);
      cache.bumpRevision('almanac');
      helpers.sendJson(res, 200, {
        event: resolveAlmanacEvent(record, profilesById),
        updatedAt: nowIso
      });
      return true;
    }

    if (req.method === 'DELETE') {
      dbCtx.stmts.almanacDelete.run(eventId);
      cache.bumpRevision('almanac');
      helpers.sendJson(res, 200, { deleted: true, id: eventId, updatedAt: nowIso });
      return true;
    }
  }

  if (pathname === '/api/howard/almanac' && req.method === 'PUT') {
    const incoming = await helpers.parseJsonBody(req);
    if (!Array.isArray(incoming.events)) {
      helpers.sendJson(res, 400, { error: 'Expected events array' });
      return true;
    }
    const nowIso = new Date().toISOString();
    const fallbackDate = getLocalDateKey(new Date());
    const { profilesList, profilesById } = cache.getProfilesContext();
    dbCtx.runInTransaction(() => {
      dbCtx.stmts.almanacClearAll.run();
      incoming.events.forEach((evt, idx) => {
        if (!isPlainObject(evt)) return;
        const id = String(evt.id || `evt-${Date.now()}-${idx}`);
        const dateKey =
          typeof evt.date === 'string' && VALID_DATE_KEY_RE.test(evt.date)
            ? evt.date
            : fallbackDate;
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
    helpers.sendJson(res, 200, {
      almanacEvents: cache.getCachedHowardAlmanac().almanacEvents,
      updatedAt: nowIso
    });
    return true;
  }

  if (pathname === '/api/howard/ledger/settings' && req.method === 'PUT') {
    const incoming = await helpers.parseJsonBody(req);
    const splitRule = incoming.splitRule === 'proportional' ? 'proportional' : '50-50';
    const updatedAt = dbCtx.writeHowardKey('ledger_settings', { splitRule });
    cache.bumpRevision('ledger');
    helpers.sendJson(res, 200, { splitRule, updatedAt });
    return true;
  }

  if (pathname.startsWith('/api/howard/ledger/items/')) {
    const itemId = helpers.parseRequiredSegment(pathname, '/api/howard/ledger/items/');
    if (!itemId) {
      helpers.sendJson(res, 400, { error: 'Invalid or missing ledger item ID' });
      return true;
    }
    const nowIso = new Date().toISOString();

    if (req.method === 'PUT') {
      const incoming = await helpers.parseJsonBody(req);
      if (incoming.kind !== undefined && !VALID_LEDGER_KINDS.has(incoming.kind)) {
        helpers.sendJson(res, 400, { error: 'Invalid ledger item kind' });
        return true;
      }
      const kind = VALID_LEDGER_KINDS.has(incoming.kind) ? incoming.kind : 'expense';
      const rawItem = isPlainObject(incoming.item) ? incoming.item : incoming;
      if (typeof rawItem.title !== 'string' || !rawItem.title.trim()) {
        helpers.sendJson(res, 400, { error: 'Ledger item title cannot be empty' });
        return true;
      }
      const parsedAmount = Number(rawItem.amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
        helpers.sendJson(res, 400, { error: 'Ledger amount must be a non-negative finite number' });
        return true;
      }
      if (rawItem.owner !== undefined && !VALID_LEDGER_OWNERS.has(rawItem.owner)) {
        helpers.sendJson(res, 400, { error: 'Invalid ledger owner' });
        return true;
      }
      if (
        kind === 'expense' &&
        rawItem.paidBy !== undefined &&
        !VALID_LEDGER_OWNERS.has(rawItem.paidBy)
      ) {
        helpers.sendJson(res, 400, { error: 'Invalid expense paidBy value' });
        return true;
      }
      const record = {
        ...rawItem,
        title: rawItem.title.trim(),
        amount: parsedAmount,
        id: itemId,
        updatedAt: nowIso
      };
      dbCtx.stmts.ledgerUpsert.run(itemId, kind, JSON.stringify(record), nowIso);
      cache.bumpRevision('ledger');
      helpers.sendJson(res, 200, { id: itemId, kind, item: record, updatedAt: nowIso });
      return true;
    }

    if (req.method === 'DELETE') {
      dbCtx.stmts.ledgerDelete.run(itemId);
      cache.bumpRevision('ledger');
      helpers.sendJson(res, 200, { deleted: true, id: itemId, updatedAt: nowIso });
      return true;
    }
  }

  if (pathname === '/api/howard/ledger' && req.method === 'PUT') {
    const incoming = await helpers.parseJsonBody(req);
    const rawLedger = incoming.ledgerData !== undefined ? incoming.ledgerData : incoming;
    const hasLedgerField =
      isPlainObject(rawLedger) &&
      ['splitRule', 'incomes', 'recurring', 'expenses'].some((k) =>
        Object.prototype.hasOwnProperty.call(rawLedger, k)
      );
    if (!hasLedgerField) {
      helpers.sendJson(res, 400, {
        error: 'Expected ledgerData object with splitRule, incomes, recurring, or expenses'
      });
      return true;
    }
    const nowIso = new Date().toISOString();
    const normalized = normalizeLedgerData(rawLedger);
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
    helpers.sendJson(res, 200, { ledgerData: normalized, updatedAt: nowIso });
    return true;
  }

  if (pathname === '/api/howard/beacon' && req.method === 'PUT') {
    const incoming = await helpers.parseJsonBody(req);
    const patch = isPlainObject(incoming.beaconInfo) ? incoming.beaconInfo : incoming;
    const { data: current } = dbCtx.readHowardKey('beacon_info', DEFAULT_BEACON_INFO);
    const { profilesList, profilesById } = cache.getProfilesContext();
    const updated = mergeBeaconInfo(current, patch, profilesList, {
      mergeContacts: false,
      profilesById
    });
    const updatedAt = dbCtx.writeHowardKey('beacon_info', updated);
    cache.bumpRevision('beacon');
    helpers.sendJson(res, 200, {
      beaconInfo: resolveBeaconInfo(updated, profilesById, profilesList),
      updatedAt
    });
    return true;
  }

  if (pathname === '/api/howard/backup' && req.method === 'GET') {
    const reqProfile = helpers.getCallerProfile(req, parsedUrl);
    if (reqProfile !== 'partner1' && reqProfile !== 'partner2') {
      helpers.sendJson(res, 403, { error: 'Caregiver profile cannot export database backups' });
      return true;
    }
    const includeFloodgate = parsedUrl.searchParams.get('includeFloodgate') !== '0';
    const payload = buildFullBackupPayload(dbCtx, cache, { includeFloodgate });
    helpers.sendJson(res, 200, payload);
    return true;
  }

  if (pathname === '/api/howard/restore' && req.method === 'POST') {
    const incoming = await helpers.parseJsonBody(req);
    const actorProfileId = String(
      parsedUrl.searchParams.get('profile') ||
        req.headers['x-howard-profile'] ||
        incoming.profileId ||
        'caregiver'
    );
    if (actorProfileId !== 'partner1') {
      helpers.sendJson(res, 403, {
        error: 'Only the primary household profile can restore backups'
      });
      return true;
    }
    const result = executeRestorePayload(dbCtx, cache, incoming);
    helpers.sendJson(res, 200, result);
    return true;
  }

  return false;
}
