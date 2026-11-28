import {
  DEFAULT_PROFILES,
  inferProfileIdFromName,
  isProfileId,
  resolveProfileDisplayName
} from '../../shared/profileUtils.ts';
import {
  DEFAULT_BEACON_INFO,
  DEFAULT_LEDGER_DATA,
  createDefaultBloomSettings,
  createDefaultCadenceSettings
} from '../../shared/defaults.ts';
import type { CaregiverItem, ProfileId } from '../../shared/schemas/common.ts';
import type { Profile, PublicProfile } from '../../shared/schemas/profile.ts';
import type { AlmanacEvent } from '../../shared/schemas/almanac.ts';
import type { BeaconContact, BeaconInfo } from '../../shared/schemas/beacon.ts';
import type {
  BloomCareLog,
  BloomMoltRecord,
  BloomSettings
} from '../../shared/schemas/bloom.ts';
import type {
  CadenceDayLog,
  CadenceDose,
  CadenceSettings
} from '../../shared/schemas/cadence.ts';
import { LedgerItemSchema, type LedgerData, type LedgerItem } from '../../shared/schemas/ledger.ts';
import type { QuillNote } from '../../shared/schemas/quill.ts';
import { isPlainObject } from '../utils.ts';

export type ProfilesByIdMap = Record<string, Profile>;

export function buildProfilesByIdMap(profilesList: Profile[] = DEFAULT_PROFILES): ProfilesByIdMap {
  const map: ProfilesByIdMap = {};
  for (const prof of profilesList || []) {
    if (prof && typeof prof.id === 'string') {
      map[prof.id] = prof;
    }
  }
  return map;
}

export function sanitizeProfilesForClient(profiles?: Profile[] | null): PublicProfile[] {
  return (profiles || DEFAULT_PROFILES).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    color: p.color,
    badgeEmoji: p.badgeEmoji,
    pinEnabled: Boolean(p.pinEnabled && (p.pinHash || p.pin)),
    lockedOutOfPin: Boolean(p.lockedOutOfPin || p.id === 'caregiver'),
    allowedApps: Array.isArray(p.allowedApps)
      ? p.allowedApps
      : ['foyer', 'cadence', 'bloom', 'quill', 'beacon'],
    caregiverName: p.caregiverName || p.name
  }));
}

export function buildCaregiverItems(
  rawCaregivers: unknown,
  profilesList: Profile[] = DEFAULT_PROFILES
): CaregiverItem[] {
  const list = Array.isArray(rawCaregivers)
    ? rawCaregivers
    : ['Partner 1', 'Partner 2', 'Caregiver'];
  const items: CaregiverItem[] = [];
  const seenProfileIds = new Set<ProfileId>();
  const seenCustom = new Set<string>();
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const pid = inferProfileIdFromName(profilesList, trimmed);
    if (pid) {
      if (seenProfileIds.has(pid)) continue;
      seenProfileIds.add(pid);
      items.push({ profileId: pid, name: trimmed });
    } else {
      const key = trimmed.toLowerCase();
      if (seenCustom.has(key)) continue;
      seenCustom.add(key);
      items.push({ profileId: null, name: trimmed });
    }
  }
  return items.length > 0
    ? items
    : [
        { profileId: 'partner1', name: 'Partner 1' },
        { profileId: 'partner2', name: 'Partner 2' },
        { profileId: 'caregiver', name: 'Caregiver' }
      ];
}

export function resolveCaregiverList(
  caregiverItems: unknown,
  rawCaregivers: unknown,
  profilesById: ProfilesByIdMap | null | undefined,
  profilesList: Profile[] = DEFAULT_PROFILES
): string[] {
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const items =
    Array.isArray(caregiverItems) && caregiverItems.length > 0
      ? caregiverItems
      : buildCaregiverItems(rawCaregivers, profilesList);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!isPlainObject(item)) continue;
    const pid = typeof item.profileId === 'string' ? item.profileId : null;
    const fallback = typeof item.name === 'string' ? item.name : '';
    const resolved = resolveProfileDisplayName(map, pid, fallback);
    const cleaned = String(resolved || '').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function normalizeCaregiverFields(
  src: Record<string, unknown>,
  base: Record<string, unknown>,
  defaults: { caregivers: string[]; caregiverItems?: CaregiverItem[] | undefined },
  profilesList: Profile[]
): { caregivers: string[]; caregiverItems: CaregiverItem[] } {
  const rawCaregivers = Array.isArray(src.caregivers)
    ? src.caregivers.filter((c): c is string => typeof c === 'string')
    : Array.isArray(base.caregivers)
      ? base.caregivers.filter((c): c is string => typeof c === 'string')
      : defaults.caregivers;
  const srcItems = Array.isArray(src.caregiverItems)
    ? src.caregiverItems.filter(
        (it): it is CaregiverItem =>
          isPlainObject(it) &&
          typeof it.name === 'string' &&
          (it.profileId === null || isProfileId(it.profileId))
      )
    : [];
  const baseItems = Array.isArray(base.caregiverItems)
    ? base.caregiverItems.filter(
        (it): it is CaregiverItem =>
          isPlainObject(it) &&
          typeof it.name === 'string' &&
          (it.profileId === null || isProfileId(it.profileId))
      )
    : [];
  const items =
    srcItems.length > 0
      ? srcItems
      : Array.isArray(src.caregivers)
        ? buildCaregiverItems(rawCaregivers, profilesList)
        : baseItems.length > 0
          ? baseItems
          : buildCaregiverItems(rawCaregivers, profilesList);
  return { caregivers: rawCaregivers, caregiverItems: items };
}

export function normalizeBloomSettings(
  parsed: Record<string, unknown> = {},
  baseSettings: Record<string, unknown> | BloomSettings | null = null,
  profilesList: Profile[] = DEFAULT_PROFILES
): BloomSettings {
  const defaults = createDefaultBloomSettings();
  const src = isPlainObject(parsed) ? parsed : {};
  const base: Record<string, unknown> = isPlainObject(baseSettings)
    ? baseSettings
    : { ...defaults };
  const { caregivers, caregiverItems } = normalizeCaregiverFields(
    src,
    base,
    defaults,
    profilesList
  );
  const baseObj = base as Partial<BloomSettings>;
  const srcObj = src as Partial<BloomSettings>;
  return {
    ...defaults,
    ...baseObj,
    ...srcObj,
    caregivers,
    caregiverItems,
    enclosureInfo: {
      ...defaults.enclosureInfo,
      ...(isPlainObject(base.enclosureInfo) ? (base.enclosureInfo as Partial<BloomSettings['enclosureInfo']>) : {}),
      ...(isPlainObject(src.enclosureInfo) ? (src.enclosureInfo as Partial<BloomSettings['enclosureInfo']>) : {})
    }
  };
}

export function normalizeCadenceSettings(
  parsed: Record<string, unknown> = {},
  baseSettings: Record<string, unknown> | CadenceSettings | null = null,
  profilesList: Profile[] = DEFAULT_PROFILES
): CadenceSettings {
  const defaults = createDefaultCadenceSettings();
  const src = isPlainObject(parsed) ? parsed : {};
  const base: Record<string, unknown> = isPlainObject(baseSettings)
    ? baseSettings
    : { ...defaults };
  const { caregivers, caregiverItems } = normalizeCaregiverFields(
    src,
    base,
    defaults,
    profilesList
  );
  return {
    ...defaults,
    ...(base as Partial<CadenceSettings>),
    ...(src as Partial<CadenceSettings>),
    caregivers,
    caregiverItems
  };
}

export function enrichAlmanacEvent(
  evt: Record<string, unknown>,
  profilesList: Profile[] = DEFAULT_PROFILES,
  profilesById: ProfilesByIdMap | null = null
): AlmanacEvent {
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const explicitId =
    typeof evt.assignedToProfileId === 'string' && map[evt.assignedToProfileId] && isProfileId(evt.assignedToProfileId)
      ? evt.assignedToProfileId
      : null;
  const inferredId =
    explicitId ||
    inferProfileIdFromName(profilesList, typeof evt.assignedTo === 'string' ? evt.assignedTo : '');
  return { ...(evt as AlmanacEvent), assignedToProfileId: inferredId };
}

export function resolveAlmanacEvent(
  parsed: Record<string, unknown>,
  profilesById: ProfilesByIdMap
): AlmanacEvent {
  if (!parsed.assignedToProfileId) {
    return parsed as AlmanacEvent;
  }
  const fallback = typeof parsed.assignedTo === 'string' ? parsed.assignedTo : '';
  const resolvedName = resolveProfileDisplayName(
    profilesById,
    String(parsed.assignedToProfileId),
    fallback
  );
  return (
    resolvedName === parsed.assignedTo ? parsed : { ...parsed, assignedTo: resolvedName }
  ) as AlmanacEvent;
}

export function enrichDoseSlot(
  slot: Record<string, unknown>,
  profilesList: Profile[] = DEFAULT_PROFILES,
  profilesById: ProfilesByIdMap | null = null
): CadenceDose {
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const hasExplicitKey = Object.prototype.hasOwnProperty.call(slot, 'givenByProfileId');
  const explicitId =
    typeof slot.givenByProfileId === 'string' && map[slot.givenByProfileId] && isProfileId(slot.givenByProfileId)
      ? slot.givenByProfileId
      : null;
  const givenByStr = typeof slot.givenBy === 'string' ? slot.givenBy : '';
  const resolvedId = hasExplicitKey
    ? explicitId ||
      (slot.givenByProfileId === null ? null : inferProfileIdFromName(profilesList, givenByStr))
    : inferProfileIdFromName(profilesList, givenByStr);
  const next: Record<string, unknown> = { ...slot };
  delete next.recordedByUid;
  next.givenByProfileId = resolvedId || null;
  return next as CadenceDose;
}

export function enrichCadenceRecord(
  rec: Record<string, unknown>,
  profilesList: Profile[] = DEFAULT_PROFILES,
  profilesById: ProfilesByIdMap | null = null
): CadenceDayLog {
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const next: Record<string, unknown> = { ...rec };
  if (isPlainObject(next.morning)) next.morning = enrichDoseSlot(next.morning, profilesList, map);
  if (isPlainObject(next.evening)) next.evening = enrichDoseSlot(next.evening, profilesList, map);
  return next as CadenceDayLog;
}

export function resolveCadenceRecord(
  rec: Record<string, unknown>,
  profilesById: ProfilesByIdMap
): CadenceDayLog {
  const resolveSlot = (slot: unknown): CadenceDose | null | undefined => {
    if (slot === null || slot === undefined) return slot;
    if (!isPlainObject(slot)) return undefined;
    if (!slot.givenByProfileId) return slot as CadenceDose;
    const fallback = typeof slot.givenBy === 'string' ? slot.givenBy : '';
    const resolvedName = resolveProfileDisplayName(
      profilesById,
      String(slot.givenByProfileId),
      fallback
    );
    return (
      resolvedName === slot.givenBy ? slot : { ...slot, givenBy: resolvedName }
    ) as CadenceDose;
  };
  const morning = resolveSlot(rec.morning);
  const evening = resolveSlot(rec.evening);
  return {
    ...(rec as CadenceDayLog),
    ...(rec.morning !== undefined && morning !== undefined ? { morning } : {}),
    ...(rec.evening !== undefined && evening !== undefined ? { evening } : {})
  };
}

export function enrichBloomEntryList(
  arr: unknown,
  profilesList: Profile[] = DEFAULT_PROFILES,
  profilesById: ProfilesByIdMap | null = null
): Array<Record<string, unknown>> {
  if (!Array.isArray(arr)) return [];
  const map = profilesById || buildProfilesByIdMap(profilesList);
  return arr.filter(isPlainObject).map((item) => {
    const explicitId =
      typeof item.byProfileId === 'string' && map[item.byProfileId] && isProfileId(item.byProfileId)
        ? item.byProfileId
        : null;
    const inferredId =
      explicitId ||
      inferProfileIdFromName(profilesList, typeof item.by === 'string' ? item.by : '');
    return inferredId ? { ...item, byProfileId: inferredId } : { ...item };
  });
}

export function enrichBloomCareRecord(
  rec: Record<string, unknown>,
  profilesList: Profile[] = DEFAULT_PROFILES,
  profilesById: ProfilesByIdMap | null = null
): BloomCareLog {
  const map = profilesById || buildProfilesByIdMap(profilesList);
  return {
    ...(rec as BloomCareLog),
    ...(Array.isArray(rec.mists)
      ? { mists: enrichBloomEntryList(rec.mists, profilesList, map) as BloomCareLog['mists'] }
      : {}),
    ...(Array.isArray(rec.feedings)
      ? { feedings: enrichBloomEntryList(rec.feedings, profilesList, map) as BloomCareLog['feedings'] }
      : {}),
    ...(Array.isArray(rec.climateChecks)
      ? {
          climateChecks: enrichBloomEntryList(
            rec.climateChecks,
            profilesList,
            map
          ) as BloomCareLog['climateChecks']
        }
      : {})
  };
}

function resolveBloomEntryList(
  arr: unknown,
  profilesById: ProfilesByIdMap
): Array<Record<string, unknown>> {
  if (!Array.isArray(arr)) return [];
  return arr.filter(isPlainObject).map((item) => {
    if (!item.byProfileId) return item;
    const fallback = typeof item.by === 'string' ? item.by : '';
    const resolvedName = resolveProfileDisplayName(
      profilesById,
      String(item.byProfileId),
      fallback
    );
    return resolvedName === item.by ? item : { ...item, by: resolvedName };
  });
}

export function resolveBloomCareRecord(
  rec: Record<string, unknown>,
  profilesById: ProfilesByIdMap
): BloomCareLog {
  return {
    ...(rec as BloomCareLog),
    ...(Array.isArray(rec.mists)
      ? { mists: resolveBloomEntryList(rec.mists, profilesById) as BloomCareLog['mists'] }
      : {}),
    ...(Array.isArray(rec.feedings)
      ? { feedings: resolveBloomEntryList(rec.feedings, profilesById) as BloomCareLog['feedings'] }
      : {}),
    ...(Array.isArray(rec.climateChecks)
      ? {
          climateChecks: resolveBloomEntryList(
            rec.climateChecks,
            profilesById
          ) as BloomCareLog['climateChecks']
        }
      : {})
  };
}

export function enrichBloomMoltRecord(
  rec: Record<string, unknown>,
  profilesList: Profile[] = DEFAULT_PROFILES,
  profilesById: ProfilesByIdMap | null = null
): BloomMoltRecord {
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const explicitId =
    typeof rec.loggedByProfileId === 'string' &&
    map[rec.loggedByProfileId] &&
    isProfileId(rec.loggedByProfileId)
      ? rec.loggedByProfileId
      : null;
  const inferredId =
    explicitId ||
    inferProfileIdFromName(profilesList, typeof rec.loggedBy === 'string' ? rec.loggedBy : '');
  return (inferredId ? { ...rec, loggedByProfileId: inferredId } : { ...rec }) as BloomMoltRecord;
}

export function resolveBloomMoltRecord(
  rec: Record<string, unknown>,
  profilesById: ProfilesByIdMap
): BloomMoltRecord {
  if (!rec.loggedByProfileId) {
    return rec as BloomMoltRecord;
  }
  const fallback = typeof rec.loggedBy === 'string' ? rec.loggedBy : '';
  const resolvedName = resolveProfileDisplayName(
    profilesById,
    String(rec.loggedByProfileId),
    fallback
  );
  return (
    resolvedName === rec.loggedBy ? rec : { ...rec, loggedBy: resolvedName }
  ) as BloomMoltRecord;
}

function normalizeLedgerItemList(arr: unknown): LedgerItem[] {
  if (!Array.isArray(arr)) return [];
  const out: LedgerItem[] = [];
  for (const rawItem of arr) {
    if (!isPlainObject(rawItem)) continue;
    const parsed = LedgerItemSchema.safeParse(rawItem);
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  return out;
}

export function normalizeLedgerData(raw: unknown): LedgerData {
  if (!isPlainObject(raw)) {
    return { ...DEFAULT_LEDGER_DATA };
  }
  return {
    splitRule: raw.splitRule === 'proportional' ? 'proportional' : '50-50',
    incomes: normalizeLedgerItemList(raw.incomes),
    recurring: normalizeLedgerItemList(raw.recurring),
    expenses: normalizeLedgerItemList(raw.expenses)
  };
}

export function normalizeBeaconContacts(
  contacts: unknown,
  baseContacts: BeaconContact[] = [],
  profilesList: Profile[] = DEFAULT_PROFILES,
  profilesById: ProfilesByIdMap | null = null
): BeaconContact[] {
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const baseById = new Map<string, BeaconContact>(
    (Array.isArray(baseContacts) ? baseContacts : [])
      .filter((b) => isPlainObject(b) && Boolean(b.id))
      .map((b) => [b.id, b])
  );
  return (Array.isArray(contacts) ? contacts : []).filter(isPlainObject).map((c) => {
    const id = typeof c.id === 'string' ? c.id : '';
    const name = typeof c.name === 'string' ? c.name : '';
    const prev = id ? baseById.get(id) : undefined;
    const prevProfileId = prev?.profileId && map[prev.profileId] ? prev.profileId : null;
    const hasExplicitPid = Object.prototype.hasOwnProperty.call(c, 'profileId');

    let nextProfileId: ProfileId | null = null;
    if (hasExplicitPid) {
      if (typeof c.profileId === 'string' && map[c.profileId] && isProfileId(c.profileId)) {
        nextProfileId = c.profileId;
      } else if (c.profileId === null) {
        nextProfileId = null;
      } else {
        nextProfileId = inferProfileIdFromName(profilesList, name);
      }
    } else {
      nextProfileId = prevProfileId || null;
      if (!nextProfileId && (id === 'c-partner1' || id === 'c-partner2')) {
        const sliceId = id.slice(2);
        if (isProfileId(sliceId)) {
          const inferred = inferProfileIdFromName(profilesList, name);
          if (!name || inferred === sliceId) {
            nextProfileId = sliceId;
          }
        }
      } else if (!nextProfileId && name) {
        nextProfileId = inferProfileIdFromName(profilesList, name);
      }
    }

    return {
      id,
      name,
      ...(typeof c.role === 'string' ? { role: c.role } : {}),
      ...(typeof c.phone === 'string' ? { phone: c.phone } : {}),
      ...(typeof c.note === 'string' ? { note: c.note } : {}),
      profileId: nextProfileId
    };
  });
}

export function normalizeBeaconInfo(
  raw: unknown = {},
  {
    baseContacts = [],
    profilesList = DEFAULT_PROFILES,
    profilesById = null
  }: {
    baseContacts?: BeaconContact[];
    profilesList?: Profile[];
    profilesById?: ProfilesByIdMap | null;
  } = {}
): BeaconInfo {
  const src = isPlainObject(raw) ? raw : {};
  const contacts = Array.isArray(src.contacts)
    ? normalizeBeaconContacts(src.contacts, baseContacts, profilesList, profilesById)
    : DEFAULT_BEACON_INFO.contacts.map((c) => ({ ...c }));
  return {
    petCare: {
      ...DEFAULT_BEACON_INFO.petCare,
      ...(isPlainObject(src.petCare) ? (src.petCare as Partial<BeaconInfo['petCare']>) : {})
    },
    vetInfo: {
      ...DEFAULT_BEACON_INFO.vetInfo,
      ...(isPlainObject(src.vetInfo) ? (src.vetInfo as Partial<BeaconInfo['vetInfo']>) : {})
    },
    contacts,
    houseGuide: {
      ...DEFAULT_BEACON_INFO.houseGuide,
      ...(isPlainObject(src.houseGuide) ? (src.houseGuide as Partial<BeaconInfo['houseGuide']>) : {})
    }
  };
}

export function mergeBeaconInfo(
  current: unknown,
  incoming: unknown,
  profilesList: Profile[] = DEFAULT_PROFILES,
  {
    mergeContacts = false,
    profilesById = null
  }: { mergeContacts?: boolean; profilesById?: ProfilesByIdMap | null } = {}
): BeaconInfo {
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const base = normalizeBeaconInfo(current, { profilesList, profilesById: map });
  if (!isPlainObject(incoming)) return base;
  let nextContacts = base.contacts;
  if (Array.isArray(incoming.contacts)) {
    const normalizedIncoming = normalizeBeaconContacts(
      incoming.contacts,
      base.contacts,
      profilesList,
      map
    );
    if (mergeContacts) {
      const mergedMap = new Map<string, BeaconContact>();
      for (const c of base.contacts) {
        if (isPlainObject(c) && c.id) mergedMap.set(c.id, c);
      }
      for (const c of normalizedIncoming) {
        if (c.id) mergedMap.set(c.id, c);
        else {
          const genId = `c-${Date.now()}-${mergedMap.size}`;
          mergedMap.set(genId, { ...c, id: genId });
        }
      }
      nextContacts = Array.from(mergedMap.values());
    } else {
      nextContacts = normalizedIncoming;
    }
  }
  return {
    petCare: {
      ...base.petCare,
      ...(isPlainObject(incoming.petCare) ? (incoming.petCare as Partial<BeaconInfo['petCare']>) : {})
    },
    vetInfo: {
      ...base.vetInfo,
      ...(isPlainObject(incoming.vetInfo) ? (incoming.vetInfo as Partial<BeaconInfo['vetInfo']>) : {})
    },
    contacts: nextContacts,
    houseGuide: {
      ...base.houseGuide,
      ...(isPlainObject(incoming.houseGuide) ? (incoming.houseGuide as Partial<BeaconInfo['houseGuide']>) : {})
    }
  };
}

export function resolveBeaconInfo(
  raw: unknown,
  profilesById: ProfilesByIdMap | null | undefined,
  profilesList: Profile[] = DEFAULT_PROFILES
): BeaconInfo {
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const normalized = normalizeBeaconInfo(raw, { profilesList, profilesById: map });
  return {
    ...normalized,
    contacts: normalized.contacts.map((c) => {
      if (!c.profileId) return c;
      const resolvedName = resolveProfileDisplayName(map, c.profileId, c.name);
      return resolvedName === c.name ? c : { ...c, name: resolvedName };
    })
  };
}

export function resolveQuillNote(
  note: Record<string, unknown>,
  profilesById: ProfilesByIdMap
): QuillNote {
  const createdByProfileId =
    typeof note.createdByProfileId === 'string' ? note.createdByProfileId : '';
  const updatedByProfileId =
    typeof note.updatedByProfileId === 'string' ? note.updatedByProfileId : '';
  const ownerProfileId = typeof note.ownerProfileId === 'string' ? note.ownerProfileId : '';

  const createdBy = createdByProfileId
    ? resolveProfileDisplayName(
        profilesById,
        createdByProfileId,
        typeof note.createdBy === 'string' ? note.createdBy : ''
      )
    : typeof note.createdBy === 'string'
      ? note.createdBy
      : '';
  const updatedBy = updatedByProfileId
    ? resolveProfileDisplayName(
        profilesById,
        updatedByProfileId,
        typeof note.updatedBy === 'string' ? note.updatedBy : ''
      )
    : typeof note.updatedBy === 'string'
      ? note.updatedBy
      : '';
  const ownerName = ownerProfileId
    ? resolveProfileDisplayName(
        profilesById,
        ownerProfileId,
        typeof note.ownerName === 'string' ? note.ownerName : ''
      )
    : typeof note.ownerName === 'string'
      ? note.ownerName
      : '';
  return {
    ...(note as QuillNote),
    createdBy,
    updatedBy,
    ownerName
  };
}
