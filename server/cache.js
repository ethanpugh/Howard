import {
  DEFAULT_PROFILES,
  isAlmanacEventVisibleToProfile,
  resolveProfileDisplayName
} from '../shared/profileUtils.js';
import {
  DEFAULT_BEACON_INFO,
  DEFAULT_FLOODGATE_SETTINGS,
  DEFAULT_QUILL_SETTINGS,
  createDefaultCadenceSettings
} from '../shared/defaults.js';
import {
  buildProfilesByIdMap,
  normalizeBloomSettings,
  normalizeCadenceSettings,
  resolveAlmanacEvent,
  resolveBeaconInfo,
  resolveBloomCareRecord,
  resolveBloomMoltRecord,
  resolveCadenceRecord,
  resolveCaregiverList,
  resolveQuillNote,
  sanitizeProfilesForClient
} from './domains/profileResolve.js';

export function createRuntimeCache(dbCtx, { enableTimers = true } = {}) {
  const bootId = Date.now().toString(36);
  const domainRevisions = {
    howard: 1,
    cadence: 1,
    bloom: 1,
    floodgate: 1,
    quill: 1
  };

  let rawProfilesCache = null; // { profilesList, profilesById, updatedAt }
  let cacheHowardProfiles = null;
  let cacheHowardAlmanac = null;
  let cacheHowardLedger = null;
  let cacheHowardBeacon = null;
  let cacheHowardCombined = null;
  let projectedHowardCache = new Map(); // profileId -> { rev, state }
  let cacheCadence = null;
  let cacheBloom = null;
  let cacheFloodgate = null;
  let cacheQuillRaw = null;
  let projectedQuillCache = new Map(); // profileId -> { rev, state }

  const sseClients = new Set();

  function getProfilesContext() {
    if (!rawProfilesCache) {
      const obj = dbCtx.readHowardKey('profiles', DEFAULT_PROFILES);
      const list = Array.isArray(obj.data) && obj.data.length > 0 ? obj.data : DEFAULT_PROFILES;
      rawProfilesCache = {
        profilesList: list,
        profilesById: buildProfilesByIdMap(list),
        updatedAt: obj.updatedAt
      };
    }
    return rawProfilesCache;
  }

  function getCachedHowardProfiles() {
    if (!cacheHowardProfiles) {
      const { profilesList, updatedAt } = getProfilesContext();
      cacheHowardProfiles = {
        profiles: sanitizeProfilesForClient(profilesList),
        updatedAt
      };
    }
    return cacheHowardProfiles;
  }

  function readAlmanacEventsFromTable() {
    const { profilesById } = getProfilesContext();
    const events = [];
    const updatedAt = dbCtx.readTableJsonRows(dbCtx.stmts.almanacGetAll, (parsed, row) => {
      const base = { ...parsed, id: row.id, date: parsed.date || row.date_key };
      events.push(resolveAlmanacEvent(base, profilesById));
    });
    return { events, updatedAt };
  }

  function getCachedHowardAlmanac() {
    if (!cacheHowardAlmanac) {
      const eventsObj = readAlmanacEventsFromTable();
      cacheHowardAlmanac = {
        almanacEvents: eventsObj.events,
        updatedAt: eventsObj.updatedAt
      };
    }
    return cacheHowardAlmanac;
  }

  function readLedgerDataFromTable() {
    const settingsObj = dbCtx.readHowardKey('ledger_settings', { splitRule: '50-50' });
    const splitRule = settingsObj.data?.splitRule === 'proportional' ? 'proportional' : '50-50';
    const expenses = [];
    const recurring = [];
    const incomes = [];

    const latestItemUpdate = dbCtx.readTableJsonRows(dbCtx.stmts.ledgerGetAll, (parsed, row) => {
      const item = { ...parsed, id: row.id };
      if (row.kind === 'expense') expenses.push(item);
      else if (row.kind === 'recurring') recurring.push(item);
      else if (row.kind === 'income') incomes.push(item);
    });

    expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    recurring.sort(
      (a, b) => (a.title || '').localeCompare(b.title || '') || (a.id || '').localeCompare(b.id || '')
    );

    const updatedAt =
      latestItemUpdate > (settingsObj.updatedAt || '') ? latestItemUpdate : settingsObj.updatedAt || '';

    return {
      ledgerData: { splitRule, incomes, recurring, expenses },
      updatedAt
    };
  }

  function getCachedHowardLedger() {
    if (!cacheHowardLedger) {
      cacheHowardLedger = readLedgerDataFromTable();
    }
    return cacheHowardLedger;
  }

  function getCachedHowardBeacon() {
    if (!cacheHowardBeacon) {
      const { profilesList, profilesById } = getProfilesContext();
      const beaconObj = dbCtx.readHowardKey('beacon_info', DEFAULT_BEACON_INFO);
      cacheHowardBeacon = {
        beaconInfo: resolveBeaconInfo(beaconObj.data, profilesById, profilesList),
        updatedAt: beaconObj.updatedAt
      };
    }
    return cacheHowardBeacon;
  }

  function getCachedHowardState() {
    if (!cacheHowardCombined) {
      const p = getCachedHowardProfiles();
      const a = getCachedHowardAlmanac();
      const l = getCachedHowardLedger();
      const b = getCachedHowardBeacon();
      const latest =
        [p.updatedAt, a.updatedAt, l.updatedAt, b.updatedAt].filter(Boolean).sort().pop() ||
        new Date().toISOString();
      cacheHowardCombined = {
        profiles: p.profiles,
        almanacEvents: a.almanacEvents,
        ledgerData: l.ledgerData,
        beaconInfo: b.beaconInfo,
        updatedAt: latest
      };
    }
    return cacheHowardCombined;
  }

  function projectHowardStateForProfile(activeProfile) {
    const howardState = getCachedHowardState();
    const safeProfile = activeProfile || 'caregiver';
    const cached = projectedHowardCache.get(safeProfile);
    if (cached && cached.rev === domainRevisions.howard) {
      return cached.state;
    }

    let projected = howardState;
    if (safeProfile === 'caregiver') {
      projected = {
        ...howardState,
        almanacEvents: [],
        ledgerData: {
          splitRule: '50-50',
          incomes: [],
          recurring: [],
          expenses: []
        }
      };
    } else if (safeProfile === 'partner1') {
      const { profilesList } = getProfilesContext();
      projected = {
        ...howardState,
        almanacEvents: (howardState.almanacEvents || []).filter((evt) =>
          isAlmanacEventVisibleToProfile(evt, 'partner1', profilesList)
        )
      };
    }

    projectedHowardCache.set(safeProfile, { rev: domainRevisions.howard, state: projected });
    return projected;
  }

  function readCadenceSettings({ includeInternal = false } = {}) {
    const { profilesList, profilesById } = getProfilesContext();
    const defaults = createDefaultCadenceSettings();
    const rowObj = dbCtx.readHowardKey('cadence_settings', null);
    const parsed = rowObj.data
      ? normalizeCadenceSettings(rowObj.data, null, profilesList)
      : defaults;
    const resolved = {
      ...parsed,
      caregivers: resolveCaregiverList(
        parsed.caregiverItems,
        parsed.caregivers,
        profilesById,
        profilesList
      )
    };
    if (!includeInternal) delete resolved.caregiverItems;
    return { settings: resolved, updatedAt: rowObj.updatedAt };
  }

  function readCadenceLogs() {
    const { profilesById } = getProfilesContext();
    const logsByDate = {};
    const latestLogUpdate = dbCtx.readTableJsonRows(dbCtx.stmts.cadenceGetAllLogs, (parsed, row) => {
      logsByDate[row.date_key] = resolveCadenceRecord(parsed, profilesById);
    });
    return { logsByDate, latestLogUpdate };
  }

  function getCachedCadenceState() {
    if (!cacheCadence) {
      const { settings, updatedAt: cSetUpd } = readCadenceSettings();
      const { logsByDate, latestLogUpdate: cLogUpd } = readCadenceLogs();
      cacheCadence = {
        settings,
        logsByDate,
        updatedAt: cLogUpd > cSetUpd ? cLogUpd : cSetUpd
      };
    }
    return cacheCadence;
  }

  function readBloomSettings({ includeInternal = false } = {}) {
    const { profilesList, profilesById } = getProfilesContext();
    const row = dbCtx.stmts.howardGet.get('bloom_settings');
    let rawData = null;
    let updatedAt = new Date().toISOString();
    if (row) {
      updatedAt = row.updated_at;
      try {
        rawData = JSON.parse(row.data);
      } catch {
        rawData = null;
      }
    }
    const parsed = normalizeBloomSettings(rawData || {}, null, profilesList);
    const resolved = {
      ...parsed,
      caregivers: resolveCaregiverList(
        parsed.caregiverItems,
        parsed.caregivers,
        profilesById,
        profilesList
      )
    };
    if (resolved.livePreyInside && resolved.livePreyByProfileId) {
      const byName = resolveProfileDisplayName(profilesById, resolved.livePreyByProfileId, '');
      if (byName) {
        resolved.livePreyNote = resolved.livePreyAt
          ? `offered at ${resolved.livePreyAt} by ${byName}`
          : `offered by ${byName}`;
      }
    }
    if (!includeInternal) delete resolved.caregiverItems;
    return { settings: resolved, updatedAt };
  }

  function readBloomLogs() {
    const { profilesById } = getProfilesContext();
    const logsByDate = {};
    const latestLogUpdate = dbCtx.readTableJsonRows(dbCtx.stmts.bloomGetAllLogs, (parsed, row) => {
      logsByDate[row.date_key] = resolveBloomCareRecord(parsed, profilesById);
    });
    return { logsByDate, latestLogUpdate };
  }

  function readBloomMolts() {
    const { profilesById } = getProfilesContext();
    const molts = [];
    const latestMoltUpdate = dbCtx.readTableJsonRows(dbCtx.stmts.bloomGetAllMolts, (parsed, row) => {
      molts.push(
        resolveBloomMoltRecord({ id: row.id, dateKey: row.date_key, ...parsed }, profilesById)
      );
    });
    return { molts, latestMoltUpdate };
  }

  function readBloomFeeders() {
    const feeders = [];
    const latestFeederUpdate = dbCtx.readTableJsonRows(
      dbCtx.stmts.bloomGetAllFeeders,
      (parsed, row) => {
        feeders.push({ id: row.id, ...parsed });
      }
    );
    return { feeders, latestFeederUpdate };
  }

  function getCachedBloomState() {
    if (!cacheBloom) {
      const { settings, updatedAt: sUpd } = readBloomSettings();
      const { logsByDate, latestLogUpdate: lUpd } = readBloomLogs();
      const { molts, latestMoltUpdate: mUpd } = readBloomMolts();
      const { feeders, latestFeederUpdate: fUpd } = readBloomFeeders();
      const updatedAt =
        [sUpd, lUpd, mUpd, fUpd].filter(Boolean).sort().pop() || new Date().toISOString();
      cacheBloom = { settings, logsByDate, molts, feeders, updatedAt };
    }
    return cacheBloom;
  }

  function readFloodgateSettings() {
    const { profilesById } = getProfilesContext();
    const obj = dbCtx.readHowardKey('floodgate_settings', DEFAULT_FLOODGATE_SETTINGS);
    const merged = { ...DEFAULT_FLOODGATE_SETTINGS, ...obj.data };
    const ownerProfileId = merged.ownerProfileId || 'partner2';
    return {
      settings: {
        ...merged,
        ownerProfileId,
        ownerName: resolveProfileDisplayName(profilesById, ownerProfileId, merged.ownerName)
      },
      updatedAt: obj.updatedAt
    };
  }

  function readFloodgateLogs() {
    const logsByDate = {};
    const latestLogUpdate = dbCtx.readTableJsonRows(
      dbCtx.stmts.floodgateGetAllLogs,
      (parsed, row) => {
        logsByDate[row.date_key] = parsed;
      }
    );
    return { logsByDate, latestLogUpdate };
  }

  function getCachedFloodgateState() {
    if (!cacheFloodgate) {
      const { settings, updatedAt: fSetUpd } = readFloodgateSettings();
      const { logsByDate, latestLogUpdate: fLogUpd } = readFloodgateLogs();
      cacheFloodgate = {
        settings,
        logsByDate,
        updatedAt: fLogUpd > fSetUpd ? fLogUpd : fSetUpd
      };
    }
    return cacheFloodgate;
  }

  function getCachedQuillRawState() {
    if (!cacheQuillRaw) {
      const { profilesById } = getProfilesContext();
      const settingsObj = dbCtx.readHowardKey('quill_settings', DEFAULT_QUILL_SETTINGS);
      const labels = Array.isArray(settingsObj.data?.labels) ? settingsObj.data.labels : [];
      const notes = [];
      const latestNoteUpdate = dbCtx.readTableJsonRows(dbCtx.stmts.quillGetAll, (parsed, row) => {
        const base = {
          ...parsed,
          id: row.id,
          ownerProfileId: row.owner_profile_id,
          visibility: row.visibility,
          status: row.status,
          pinned: Boolean(row.pinned),
          position: Number(row.position),
          revision: Number(row.revision),
          updatedAt: parsed.updatedAt || row.updated_at
        };
        notes.push(resolveQuillNote(base, profilesById));
      });
      notes.sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          Number(a.position) - Number(b.position) ||
          (b.updatedAt || '').localeCompare(a.updatedAt || '')
      );
      const updatedAt =
        latestNoteUpdate > (settingsObj.updatedAt || '')
          ? latestNoteUpdate
          : settingsObj.updatedAt || new Date().toISOString();
      cacheQuillRaw = { notes, labels, updatedAt };
    }
    return cacheQuillRaw;
  }

  function projectQuillStateForProfile(activeProfile) {
    const safeProfile =
      activeProfile === 'partner1' || activeProfile === 'partner2' ? activeProfile : 'caregiver';
    const cached = projectedQuillCache.get(safeProfile);
    if (cached && cached.rev === domainRevisions.quill) {
      return cached.state;
    }

    const raw = getCachedQuillRawState();
    let projected;
    if (safeProfile === 'caregiver') {
      const visibleNotes = raw.notes.filter(
        (n) => n.visibility === 'shared' && n.status === 'active' && Boolean(n.caregiverVisible)
      );
      const usedLabels = new Set();
      for (const n of visibleNotes) {
        for (const lbl of n.labels || []) usedLabels.add(lbl.toLowerCase());
      }
      projected = {
        notes: visibleNotes,
        labels: raw.labels.filter((l) => usedLabels.has(String(l).toLowerCase())),
        updatedAt: raw.updatedAt
      };
    } else {
      projected = {
        notes: raw.notes.filter(
          (n) => n.visibility === 'shared' || n.ownerProfileId === safeProfile
        ),
        labels: raw.labels,
        updatedAt: raw.updatedAt
      };
    }

    projectedQuillCache.set(safeProfile, { rev: domainRevisions.quill, state: projected });
    return projected;
  }

  function getSyncTokenForProfile(profileId) {
    const safeProfile = profileId || 'caregiver';
    const fgRev = safeProfile === 'partner2' ? domainRevisions.floodgate : 0;
    return `${bootId}:${safeProfile}:${domainRevisions.howard}.${domainRevisions.cadence}.${domainRevisions.bloom}.${fgRev}.${domainRevisions.quill}`;
  }

  function parseSyncToken(token, expectedProfile) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split(':');
    if (parts.length !== 3) return null;
    const [tokenBootId, profilePart, revPart] = parts;
    if (tokenBootId !== bootId || profilePart !== (expectedProfile || 'caregiver')) {
      return null;
    }
    const revSegments = revPart.split('.');
    if (revSegments.length !== 5) return null;
    const nums = revSegments.map((s) => Number(s));
    if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
    return {
      howard: nums[0],
      cadence: nums[1],
      bloom: nums[2],
      floodgate: nums[3],
      quill: nums[4]
    };
  }

  function broadcastSseEvent(domain) {
    for (const client of sseClients) {
      if (domain === 'floodgate' && client.profileId !== 'partner2') continue;
      try {
        if (client.res.writableEnded || client.res.destroyed) {
          sseClients.delete(client);
          continue;
        }
        client.res.write(
          `event: sync\ndata: ${JSON.stringify({
            domain,
            syncToken: getSyncTokenForProfile(client.profileId)
          })}\n\n`
        );
      } catch {
        sseClients.delete(client);
        try {
          client.res.end();
        } catch {
          // ignore close error
        }
      }
    }
  }

  const sseHeartbeatTimer = enableTimers
    ? setInterval(() => {
        for (const client of sseClients) {
          try {
            if (client.res.writableEnded || client.res.destroyed) {
              sseClients.delete(client);
              continue;
            }
            client.res.write(': ping\n\n');
          } catch {
            sseClients.delete(client);
          }
        }
      }, 25000)
    : null;
  sseHeartbeatTimer?.unref?.();

  function bumpRevision(domain = 'all') {
    const broadcastDomains = [];
    if (domain === 'profiles' || domain === 'howard' || domain === 'all') {
      rawProfilesCache = null;
      cacheHowardProfiles = null;
    }
    if (domain === 'almanac' || domain === 'howard' || domain === 'all') {
      cacheHowardAlmanac = null;
    }
    if (domain === 'ledger' || domain === 'howard' || domain === 'all') {
      cacheHowardLedger = null;
    }
    if (domain === 'beacon' || domain === 'howard' || domain === 'all') {
      cacheHowardBeacon = null;
    }
    if (
      domain === 'profiles' ||
      domain === 'almanac' ||
      domain === 'ledger' ||
      domain === 'beacon' ||
      domain === 'howard' ||
      domain === 'all'
    ) {
      cacheHowardCombined = null;
      projectedHowardCache = new Map();
      domainRevisions.howard += 1;
      broadcastDomains.push('howard');
    }
    if (domain === 'cadence' || domain === 'all') {
      cacheCadence = null;
      domainRevisions.cadence += 1;
      broadcastDomains.push('cadence');
    }
    if (domain === 'bloom' || domain === 'all') {
      cacheBloom = null;
      domainRevisions.bloom += 1;
      broadcastDomains.push('bloom');
    }
    if (domain === 'floodgate' || domain === 'all') {
      cacheFloodgate = null;
      domainRevisions.floodgate += 1;
      broadcastDomains.push('floodgate');
    }
    if (domain === 'profiles' || domain === 'quill' || domain === 'all') {
      cacheQuillRaw = null;
      projectedQuillCache = new Map();
      domainRevisions.quill += 1;
      broadcastDomains.push('quill');
    }
    if (broadcastDomains.length > 0) {
      broadcastSseEvent(broadcastDomains.length > 1 ? 'all' : broadcastDomains[0]);
    }
  }

  function cleanupTimers() {
    if (sseHeartbeatTimer) clearInterval(sseHeartbeatTimer);
    for (const client of sseClients) {
      try {
        client.res.end();
      } catch {
        // ignore close error
      }
    }
    sseClients.clear();
  }

  return {
    domainRevisions,
    sseClients,
    getProfilesContext,
    getCachedHowardProfiles,
    getCachedHowardAlmanac,
    getCachedHowardLedger,
    getCachedHowardBeacon,
    getCachedHowardState,
    projectHowardStateForProfile,
    readCadenceSettings,
    getCachedCadenceState,
    readBloomSettings,
    readBloomMolts,
    getCachedBloomState,
    readFloodgateSettings,
    getCachedFloodgateState,
    getCachedQuillRawState,
    projectQuillStateForProfile,
    getSyncTokenForProfile,
    parseSyncToken,
    bumpRevision,
    cleanupTimers
  };
}
