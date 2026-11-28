import crypto from 'node:crypto';
import {
  DEFAULT_PROFILES,
  isAlmanacEventVisibleToProfile,
  normalizeProfileId,
  resolveProfileDisplayName
} from '../shared/profileUtils.ts';
import {
  DEFAULT_BEACON_INFO,
  DEFAULT_FLOODGATE_SETTINGS,
  DEFAULT_QUILL_SETTINGS,
  createDefaultCadenceSettings
} from '../shared/defaults.ts';
import type { ProfileId } from '../shared/schemas/common.ts';
import type { Profile, PublicProfile } from '../shared/schemas/profile.ts';
import type { AlmanacEvent } from '../shared/schemas/almanac.ts';
import type { BeaconInfo } from '../shared/schemas/beacon.ts';
import type {
  BloomCareLog,
  BloomFeederCulture,
  BloomMoltRecord,
  BloomSettings,
  BloomSnapshot
} from '../shared/schemas/bloom.ts';
import type {
  CadenceDayLog,
  CadenceSettings,
  CadenceSnapshot
} from '../shared/schemas/cadence.ts';
import type {
  FloodgateDayLog,
  FloodgateSettings,
  FloodgateSnapshot
} from '../shared/schemas/floodgate.ts';
import type { LedgerData, LedgerItem } from '../shared/schemas/ledger.ts';
import type { QuillNote } from '../shared/schemas/quill.ts';
import type { HowardProjectedState } from '../shared/schemas/sync.ts';
import type { DatabaseContext } from './db.ts';
import { isPlainObject } from './utils.ts';
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
  sanitizeProfilesForClient,
  type ProfilesByIdMap
} from './domains/profileResolve.ts';

export const MAX_SSE_CLIENTS = 64;

export type RevisionDomain =
  | 'all'
  | 'profiles'
  | 'howard'
  | 'almanac'
  | 'ledger'
  | 'beacon'
  | 'cadence'
  | 'bloom'
  | 'floodgate'
  | 'quill';

export interface SseClient {
  profileId: ProfileId;
  send: (event: string, data: string) => Promise<void> | void;
  ping: () => Promise<void> | void;
  close: () => void;
  isClosed: () => boolean;
}

export interface ParsedSyncToken {
  howard: number;
  cadence: number;
  bloom: number;
  floodgate: number;
  quill: number;
}

export interface QuillProjectedState {
  notes: QuillNote[];
  labels: string[];
  updatedAt: string;
}

export interface RuntimeCache {
  domainRevisions: {
    howard: number;
    cadence: number;
    bloom: number;
    floodgate: number;
    quill: number;
  };
  sseClients: Set<SseClient>;
  getProfilesContext: () => {
    profilesList: Profile[];
    profilesById: ProfilesByIdMap;
    updatedAt: string;
  };
  getCachedHowardProfiles: () => { profiles: PublicProfile[]; updatedAt: string };
  getCachedHowardAlmanac: () => { almanacEvents: AlmanacEvent[]; updatedAt: string };
  getCachedHowardLedger: () => { ledgerData: LedgerData; updatedAt: string };
  getCachedHowardBeacon: () => { beaconInfo: BeaconInfo; updatedAt: string };
  getCachedHowardState: () => HowardProjectedState;
  projectHowardStateForProfile: (activeProfile: ProfileId) => HowardProjectedState;
  readCadenceSettings: (opts?: { includeInternal?: boolean }) => {
    settings: CadenceSettings;
    updatedAt: string;
  };
  getCachedCadenceState: () => CadenceSnapshot;
  readBloomSettings: (opts?: { includeInternal?: boolean }) => {
    settings: BloomSettings;
    updatedAt: string;
  };
  readBloomMolts: () => { molts: BloomMoltRecord[]; latestMoltUpdate: string };
  getCachedBloomState: () => BloomSnapshot;
  readFloodgateSettings: () => { settings: FloodgateSettings; updatedAt: string };
  getCachedFloodgateState: () => FloodgateSnapshot;
  getCachedQuillRawState: () => QuillProjectedState;
  projectQuillStateForProfile: (activeProfile: ProfileId) => QuillProjectedState;
  getSyncTokenForProfile: (profileId: ProfileId) => string;
  parseSyncToken: (token: string, expectedProfile: ProfileId) => ParsedSyncToken | null;
  bumpRevision: (domain?: RevisionDomain) => void;
  cleanupTimers: () => void;
}

export function createRuntimeCache(
  dbCtx: DatabaseContext,
  { enableTimers = true }: { enableTimers?: boolean } = {}
): RuntimeCache {
  const bootId = crypto.randomBytes(6).toString('hex');
  const domainRevisions = {
    howard: 1,
    cadence: 1,
    bloom: 1,
    floodgate: 1,
    quill: 1
  };

  let rawProfilesCache: {
    profilesList: Profile[];
    profilesById: ProfilesByIdMap;
    updatedAt: string;
  } | null = null;
  let cacheHowardProfiles: { profiles: PublicProfile[]; updatedAt: string } | null = null;
  let cacheHowardAlmanac: { almanacEvents: AlmanacEvent[]; updatedAt: string } | null = null;
  let cacheHowardLedger: { ledgerData: LedgerData; updatedAt: string } | null = null;
  let cacheHowardBeacon: { beaconInfo: BeaconInfo; updatedAt: string } | null = null;
  let cacheHowardCombined: HowardProjectedState | null = null;
  let projectedHowardCache = new Map<ProfileId, { rev: number; state: HowardProjectedState }>();
  let cacheCadence: CadenceSnapshot | null = null;
  let cacheBloom: BloomSnapshot | null = null;
  let cacheFloodgate: FloodgateSnapshot | null = null;
  let cacheQuillRaw: QuillProjectedState | null = null;
  let projectedQuillCache = new Map<ProfileId, { rev: number; state: QuillProjectedState }>();

  const sseClients = new Set<SseClient>();
  const clientWriteQueues = new WeakMap<SseClient, Promise<void>>();

  function enqueueClientWrite(client: SseClient, op: () => Promise<void> | void): void {
    const prev = clientWriteQueues.get(client) || Promise.resolve();
    const next = prev
      .then(() => {
        if (client.isClosed()) return undefined;
        return op();
      })
      .catch(() => {
        sseClients.delete(client);
        client.close();
      });
    clientWriteQueues.set(client, next);
  }

  function getProfilesContext() {
    if (!rawProfilesCache) {
      const obj = dbCtx.readHowardKey<Profile[]>('profiles', DEFAULT_PROFILES);
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
    const events: AlmanacEvent[] = [];
    const updatedAt = dbCtx.readTableJsonRows(dbCtx.stmts.almanacGetAll, (parsed, row) => {
      const base = {
        ...parsed,
        id: row.id || String(parsed.id || ''),
        date: typeof parsed.date === 'string' ? parsed.date : row.date_key || ''
      };
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
    const settingsObj = dbCtx.readHowardKey<{ splitRule?: string }>('ledger_settings', {
      splitRule: '50-50'
    });
    const splitRule = settingsObj.data?.splitRule === 'proportional' ? 'proportional' : '50-50';
    const expenses: LedgerItem[] = [];
    const recurring: LedgerItem[] = [];
    const incomes: LedgerItem[] = [];

    const latestItemUpdate = dbCtx.readTableJsonRows(dbCtx.stmts.ledgerGetAll, (parsed, row) => {
      const item: LedgerItem = {
        ...(parsed as Omit<LedgerItem, 'id' | 'title' | 'amount'>),
        id: row.id || String(parsed.id || ''),
        title: typeof parsed.title === 'string' ? parsed.title : '',
        amount: typeof parsed.amount === 'number' && Number.isFinite(parsed.amount) ? parsed.amount : 0
      };
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
      ledgerData: { splitRule, incomes, recurring, expenses } satisfies LedgerData,
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

  function getCachedHowardState(): HowardProjectedState {
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

  function projectHowardStateForProfile(activeProfile: ProfileId): HowardProjectedState {
    const howardState = getCachedHowardState();
    const safeProfile = normalizeProfileId(activeProfile, 'caregiver');
    const cached = projectedHowardCache.get(safeProfile);
    if (cached && cached.rev === domainRevisions.howard) {
      return cached.state;
    }

    let projected: HowardProjectedState;
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
    } else {
      projected = howardState;
    }

    projectedHowardCache.set(safeProfile, { rev: domainRevisions.howard, state: projected });
    return projected;
  }

  function readCadenceSettings({ includeInternal = false }: { includeInternal?: boolean } = {}) {
    const { profilesList, profilesById } = getProfilesContext();
    const defaults = createDefaultCadenceSettings();
    const rowObj = dbCtx.readHowardKey<Record<string, unknown> | null>('cadence_settings', null);
    const parsed = rowObj.data
      ? normalizeCadenceSettings(rowObj.data, null, profilesList)
      : defaults;
    const resolved: CadenceSettings = {
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
    const logsByDate: Record<string, CadenceDayLog> = {};
    const latestLogUpdate = dbCtx.readTableJsonRows(dbCtx.stmts.cadenceGetAllLogs, (parsed, row) => {
      if (row.date_key) {
        logsByDate[row.date_key] = resolveCadenceRecord(parsed, profilesById);
      }
    });
    return { logsByDate, latestLogUpdate };
  }

  function getCachedCadenceState(): CadenceSnapshot {
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

  function readBloomSettings({ includeInternal = false }: { includeInternal?: boolean } = {}) {
    const { profilesList, profilesById } = getProfilesContext();
    const row = dbCtx.stmts.howardGet.get('bloom_settings') as
      | { data: string; updated_at: string }
      | undefined;
    let rawData: Record<string, unknown> | null = null;
    let updatedAt = new Date().toISOString();
    if (row) {
      updatedAt = row.updated_at;
      try {
        const parsedJson: unknown = JSON.parse(row.data);
        rawData = isPlainObject(parsedJson) ? parsedJson : null;
      } catch (err) {
        console.error('[SQLite] Failed reading bloom_settings:', err instanceof Error ? err.message : err);
        rawData = null;
      }
    }
    const parsed = normalizeBloomSettings(rawData || {}, null, profilesList);
    const resolved: BloomSettings = {
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
    const logsByDate: Record<string, BloomCareLog> = {};
    const latestLogUpdate = dbCtx.readTableJsonRows(dbCtx.stmts.bloomGetAllLogs, (parsed, row) => {
      if (row.date_key) {
        logsByDate[row.date_key] = resolveBloomCareRecord(parsed, profilesById);
      }
    });
    return { logsByDate, latestLogUpdate };
  }

  function readBloomMolts() {
    const { profilesById } = getProfilesContext();
    const molts: BloomMoltRecord[] = [];
    const latestMoltUpdate = dbCtx.readTableJsonRows(dbCtx.stmts.bloomGetAllMolts, (parsed, row) => {
      molts.push(
        resolveBloomMoltRecord(
          { id: row.id || '', dateKey: row.date_key || '', ...parsed },
          profilesById
        )
      );
    });
    return { molts, latestMoltUpdate };
  }

  function readBloomFeeders() {
    const feeders: BloomFeederCulture[] = [];
    const latestFeederUpdate = dbCtx.readTableJsonRows(
      dbCtx.stmts.bloomGetAllFeeders,
      (parsed, row) => {
        feeders.push({ id: row.id || '', name: String(parsed.name || ''), ...parsed });
      }
    );
    return { feeders, latestFeederUpdate };
  }

  function getCachedBloomState(): BloomSnapshot {
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
    const obj = dbCtx.readHowardKey<Partial<FloodgateSettings>>(
      'floodgate_settings',
      DEFAULT_FLOODGATE_SETTINGS
    );
    const merged: FloodgateSettings = { ...DEFAULT_FLOODGATE_SETTINGS, ...obj.data };
    const ownerProfileId: ProfileId = merged.ownerProfileId || 'partner2';
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
    const logsByDate: Record<string, FloodgateDayLog> = {};
    const latestLogUpdate = dbCtx.readTableJsonRows(
      dbCtx.stmts.floodgateGetAllLogs,
      (parsed, row) => {
        if (row.date_key) {
          logsByDate[row.date_key] = {
            ...(parsed as Omit<FloodgateDayLog, 'date'>),
            date: row.date_key
          };
        }
      }
    );
    return { logsByDate, latestLogUpdate };
  }

  function getCachedFloodgateState(): FloodgateSnapshot {
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

  function getCachedQuillRawState(): QuillProjectedState {
    if (!cacheQuillRaw) {
      const { profilesById } = getProfilesContext();
      const settingsObj = dbCtx.readHowardKey<{ labels?: string[] }>(
        'quill_settings',
        DEFAULT_QUILL_SETTINGS
      );
      const labels = Array.isArray(settingsObj.data?.labels) ? settingsObj.data.labels : [];
      const notes: QuillNote[] = [];
      const latestNoteUpdate = dbCtx.readTableJsonRows(dbCtx.stmts.quillGetAll, (parsed, row) => {
        const base = {
          ...parsed,
          id: row.id || '',
          ownerProfileId: row.owner_profile_id || 'partner1',
          visibility: row.visibility || 'shared',
          status: row.status || 'active',
          pinned: Boolean(row.pinned),
          position: Number(row.position),
          revision: Number(row.revision),
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : row.updated_at
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

  function projectQuillStateForProfile(activeProfile: ProfileId): QuillProjectedState {
    const safeProfile = normalizeProfileId(activeProfile, 'caregiver');
    const cached = projectedQuillCache.get(safeProfile);
    if (cached && cached.rev === domainRevisions.quill) {
      return cached.state;
    }

    const raw = getCachedQuillRawState();
    let projected: QuillProjectedState;
    if (safeProfile === 'caregiver') {
      const visibleNotes = raw.notes.filter(
        (n) => n.visibility === 'shared' && n.status === 'active' && Boolean(n.caregiverVisible)
      );
      const usedLabels = new Set<string>();
      for (const n of visibleNotes) {
        for (const lbl of n.labels || []) usedLabels.add(lbl.toLowerCase());
      }
      projected = {
        notes: visibleNotes,
        labels: raw.labels.filter((l) => usedLabels.has(String(l).toLowerCase())),
        updatedAt: raw.updatedAt
      };
    } else {
      const visibleNotes = raw.notes.filter(
        (n) => n.visibility === 'shared' || n.ownerProfileId === safeProfile
      );
      const hiddenNotes = raw.notes.filter(
        (n) => n.visibility === 'private' && n.ownerProfileId !== safeProfile
      );
      const visibleLabelSet = new Set<string>();
      for (const n of visibleNotes) {
        for (const lbl of n.labels || []) visibleLabelSet.add(lbl.toLowerCase());
      }
      const hiddenOnlyLabels = new Set<string>();
      for (const n of hiddenNotes) {
        for (const lbl of n.labels || []) {
          const lower = lbl.toLowerCase();
          if (!visibleLabelSet.has(lower)) {
            hiddenOnlyLabels.add(lower);
          }
        }
      }
      const partnerLabels: string[] = [];
      const seenLabels = new Set<string>();
      for (const lbl of raw.labels) {
        const lower = String(lbl).toLowerCase();
        if (hiddenOnlyLabels.has(lower) || seenLabels.has(lower)) continue;
        seenLabels.add(lower);
        partnerLabels.push(lbl);
      }
      for (const n of visibleNotes) {
        for (const lbl of n.labels || []) {
          const lower = lbl.toLowerCase();
          if (seenLabels.has(lower)) continue;
          seenLabels.add(lower);
          partnerLabels.push(lbl);
        }
      }
      projected = {
        notes: visibleNotes,
        labels: partnerLabels,
        updatedAt: raw.updatedAt
      };
    }

    projectedQuillCache.set(safeProfile, { rev: domainRevisions.quill, state: projected });
    return projected;
  }

  function getSyncTokenForProfile(profileId: ProfileId): string {
    const safeProfile = normalizeProfileId(profileId, 'caregiver');
    const fgRev = safeProfile === 'partner2' ? domainRevisions.floodgate : 0;
    return `${bootId}:${safeProfile}:${domainRevisions.howard}.${domainRevisions.cadence}.${domainRevisions.bloom}.${fgRev}.${domainRevisions.quill}`;
  }

  function parseSyncToken(token: string, expectedProfile: ProfileId): ParsedSyncToken | null {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split(':');
    if (parts.length !== 3) return null;
    const [tokenBootId, profilePart, revPart] = parts;
    const safeExpected = normalizeProfileId(expectedProfile, 'caregiver');
    if (tokenBootId !== bootId || profilePart !== safeExpected) {
      return null;
    }
    if (!revPart) return null;
    const revSegments = revPart.split('.');
    if (revSegments.length !== 5) return null;
    const nums = revSegments.map((s) => Number(s));
    if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
    const [howard, cadence, bloom, floodgate, quill] = nums;
    if (
      howard === undefined ||
      cadence === undefined ||
      bloom === undefined ||
      floodgate === undefined ||
      quill === undefined
    ) {
      return null;
    }
    return { howard, cadence, bloom, floodgate, quill };
  }

  function broadcastSseEvent(domain: string): void {
    for (const client of sseClients) {
      if (domain === 'floodgate' && client.profileId !== 'partner2') continue;
      if (client.isClosed()) {
        sseClients.delete(client);
        continue;
      }
      const data = JSON.stringify({
        domain,
        syncToken: getSyncTokenForProfile(client.profileId)
      });
      enqueueClientWrite(client, () => client.send('sync', data));
    }
  }

  const sseHeartbeatTimer = enableTimers
    ? setInterval(() => {
        for (const client of sseClients) {
          if (client.isClosed()) {
            sseClients.delete(client);
            continue;
          }
          enqueueClientWrite(client, () => client.ping());
        }
      }, 25000)
    : null;
  sseHeartbeatTimer?.unref?.();

  function bumpRevision(domain: RevisionDomain = 'all'): void {
    const broadcastDomains: string[] = [];
    if (domain === 'profiles' || domain === 'howard' || domain === 'all') {
      rawProfilesCache = null;
      cacheHowardProfiles = null;
    }
    if (domain === 'profiles' || domain === 'almanac' || domain === 'howard' || domain === 'all') {
      cacheHowardAlmanac = null;
    }
    if (domain === 'ledger' || domain === 'howard' || domain === 'all') {
      cacheHowardLedger = null;
    }
    if (domain === 'profiles' || domain === 'beacon' || domain === 'howard' || domain === 'all') {
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
    if (domain === 'profiles' || domain === 'cadence' || domain === 'all') {
      cacheCadence = null;
      domainRevisions.cadence += 1;
      broadcastDomains.push('cadence');
    }
    if (domain === 'profiles' || domain === 'bloom' || domain === 'all') {
      cacheBloom = null;
      domainRevisions.bloom += 1;
      broadcastDomains.push('bloom');
    }
    if (domain === 'profiles' || domain === 'floodgate' || domain === 'all') {
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
      const firstDomain = broadcastDomains[0] ?? 'all';
      broadcastSseEvent(broadcastDomains.length > 1 ? 'all' : firstDomain);
    }
  }

  function cleanupTimers(): void {
    if (sseHeartbeatTimer) clearInterval(sseHeartbeatTimer);
    for (const client of sseClients) {
      try {
        client.close();
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
