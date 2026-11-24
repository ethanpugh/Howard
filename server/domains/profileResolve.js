import {
  DEFAULT_PROFILES,
  inferProfileIdFromName,
  resolveProfileDisplayName
} from '../../shared/profileUtils.js';
import {
  DEFAULT_BEACON_INFO,
  DEFAULT_LEDGER_DATA,
  createDefaultBloomSettings,
  createDefaultCadenceSettings
} from '../../shared/defaults.js';
import { isPlainObject } from '../utils.js';

export function buildProfilesByIdMap(profilesList = DEFAULT_PROFILES) {
  const map = {};
  for (const prof of profilesList || []) {
    if (prof && typeof prof.id === 'string') {
      map[prof.id] = prof;
    }
  }
  return map;
}

export function sanitizeProfilesForClient(profiles) {
  return (profiles || DEFAULT_PROFILES).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    color: p.color,
    badgeEmoji: p.badgeEmoji,
    pinEnabled: Boolean(p.pinEnabled && p.pin),
    lockedOutOfPin: Boolean(p.lockedOutOfPin || p.id === 'caregiver'),
    allowedApps: Array.isArray(p.allowedApps)
      ? p.allowedApps
      : ['foyer', 'cadence', 'bloom', 'beacon'],
    caregiverName: p.caregiverName || p.name
  }));
}

export function buildCaregiverItems(rawCaregivers, profilesList = DEFAULT_PROFILES) {
  const list = Array.isArray(rawCaregivers)
    ? rawCaregivers
    : ['Partner 1', 'Partner 2', 'Caregiver'];
  const items = [];
  const seenProfileIds = new Set();
  const seenCustom = new Set();
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
  caregiverItems,
  rawCaregivers,
  profilesById,
  profilesList = DEFAULT_PROFILES
) {
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const items =
    Array.isArray(caregiverItems) && caregiverItems.length > 0
      ? caregiverItems
      : buildCaregiverItems(rawCaregivers, profilesList);
  const out = [];
  const seen = new Set();
  for (const item of items) {
    if (!isPlainObject(item)) continue;
    const resolved = resolveProfileDisplayName(map, item.profileId, item.name);
    const cleaned = String(resolved || '').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function normalizeCaregiverFields(src, base, defaults, profilesList) {
  const rawCaregivers = Array.isArray(src.caregivers)
    ? src.caregivers
    : Array.isArray(base.caregivers)
      ? base.caregivers
      : defaults.caregivers;
  const items =
    Array.isArray(src.caregiverItems) && src.caregiverItems.length > 0
      ? src.caregiverItems
      : Array.isArray(src.caregivers)
        ? buildCaregiverItems(src.caregivers, profilesList)
        : Array.isArray(base.caregiverItems) && base.caregiverItems.length > 0
          ? base.caregiverItems
          : buildCaregiverItems(rawCaregivers, profilesList);
  return { caregivers: rawCaregivers, caregiverItems: items };
}

export function normalizeBloomSettings(
  parsed = {},
  baseSettings = null,
  profilesList = DEFAULT_PROFILES
) {
  const defaults = createDefaultBloomSettings();
  const src = isPlainObject(parsed) ? parsed : {};
  const base = isPlainObject(baseSettings) ? baseSettings : defaults;
  const { caregivers, caregiverItems } = normalizeCaregiverFields(
    src,
    base,
    defaults,
    profilesList
  );
  return {
    ...defaults,
    ...base,
    ...src,
    caregivers,
    caregiverItems,
    enclosureInfo: {
      ...defaults.enclosureInfo,
      ...(isPlainObject(base.enclosureInfo) ? base.enclosureInfo : {}),
      ...(isPlainObject(src.enclosureInfo) ? src.enclosureInfo : {})
    }
  };
}

export function normalizeCadenceSettings(
  parsed = {},
  baseSettings = null,
  profilesList = DEFAULT_PROFILES
) {
  const defaults = createDefaultCadenceSettings();
  const src = isPlainObject(parsed) ? parsed : {};
  const base = isPlainObject(baseSettings) ? baseSettings : defaults;
  const { caregivers, caregiverItems } = normalizeCaregiverFields(
    src,
    base,
    defaults,
    profilesList
  );
  return {
    ...defaults,
    ...base,
    ...src,
    caregivers,
    caregiverItems
  };
}

export function enrichAlmanacEvent(evt, profilesList = DEFAULT_PROFILES, profilesById = null) {
  if (!isPlainObject(evt)) return evt;
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const explicitId =
    typeof evt.assignedToProfileId === 'string' && map[evt.assignedToProfileId]
      ? evt.assignedToProfileId
      : null;
  const inferredId = explicitId || inferProfileIdFromName(profilesList, evt.assignedTo);
  return { ...evt, assignedToProfileId: inferredId };
}

export function resolveAlmanacEvent(parsed, profilesById) {
  if (!isPlainObject(parsed) || !parsed.assignedToProfileId) return parsed;
  const resolvedName = resolveProfileDisplayName(
    profilesById,
    parsed.assignedToProfileId,
    parsed.assignedTo
  );
  return resolvedName === parsed.assignedTo ? parsed : { ...parsed, assignedTo: resolvedName };
}

export function enrichDoseSlot(slot, profilesList = DEFAULT_PROFILES, profilesById = null) {
  if (!isPlainObject(slot)) return slot;
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const hasExplicitKey = Object.prototype.hasOwnProperty.call(slot, 'givenByProfileId');
  const explicitId =
    typeof slot.givenByProfileId === 'string' && map[slot.givenByProfileId]
      ? slot.givenByProfileId
      : null;
  const resolvedId = hasExplicitKey
    ? explicitId ||
      (slot.givenByProfileId === null ? null : inferProfileIdFromName(profilesList, slot.givenBy))
    : inferProfileIdFromName(profilesList, slot.givenBy);
  const next = { ...slot };
  delete next.recordedByUid;
  next.givenByProfileId = resolvedId || null;
  return next;
}

export function enrichCadenceRecord(rec, profilesList = DEFAULT_PROFILES, profilesById = null) {
  if (!isPlainObject(rec)) return rec;
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const next = { ...rec };
  if (isPlainObject(next.morning)) next.morning = enrichDoseSlot(next.morning, profilesList, map);
  if (isPlainObject(next.evening)) next.evening = enrichDoseSlot(next.evening, profilesList, map);
  return next;
}

export function resolveCadenceRecord(rec, profilesById) {
  if (!isPlainObject(rec)) return rec;
  const resolveSlot = (slot) => {
    if (!isPlainObject(slot) || !slot.givenByProfileId) return slot;
    const resolvedName = resolveProfileDisplayName(
      profilesById,
      slot.givenByProfileId,
      slot.givenBy
    );
    return resolvedName === slot.givenBy ? slot : { ...slot, givenBy: resolvedName };
  };
  return {
    ...rec,
    ...(rec.morning !== undefined ? { morning: resolveSlot(rec.morning) } : {}),
    ...(rec.evening !== undefined ? { evening: resolveSlot(rec.evening) } : {})
  };
}

export function enrichBloomEntryList(arr, profilesList = DEFAULT_PROFILES, profilesById = null) {
  if (!Array.isArray(arr)) return [];
  const map = profilesById || buildProfilesByIdMap(profilesList);
  return arr.map((item) => {
    if (!isPlainObject(item)) return item;
    const explicitId =
      typeof item.byProfileId === 'string' && map[item.byProfileId] ? item.byProfileId : null;
    const inferredId = explicitId || inferProfileIdFromName(profilesList, item.by);
    return inferredId ? { ...item, byProfileId: inferredId } : { ...item };
  });
}

export function enrichBloomCareRecord(rec, profilesList = DEFAULT_PROFILES, profilesById = null) {
  if (!isPlainObject(rec)) return rec;
  const map = profilesById || buildProfilesByIdMap(profilesList);
  return {
    ...rec,
    ...(Array.isArray(rec.mists)
      ? { mists: enrichBloomEntryList(rec.mists, profilesList, map) }
      : {}),
    ...(Array.isArray(rec.feedings)
      ? { feedings: enrichBloomEntryList(rec.feedings, profilesList, map) }
      : {}),
    ...(Array.isArray(rec.climateChecks)
      ? { climateChecks: enrichBloomEntryList(rec.climateChecks, profilesList, map) }
      : {})
  };
}

function resolveBloomEntryList(arr, profilesById) {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => {
    if (!isPlainObject(item) || !item.byProfileId) return item;
    const resolvedName = resolveProfileDisplayName(profilesById, item.byProfileId, item.by);
    return resolvedName === item.by ? item : { ...item, by: resolvedName };
  });
}

export function resolveBloomCareRecord(rec, profilesById) {
  if (!isPlainObject(rec)) return rec;
  return {
    ...rec,
    ...(Array.isArray(rec.mists) ? { mists: resolveBloomEntryList(rec.mists, profilesById) } : {}),
    ...(Array.isArray(rec.feedings)
      ? { feedings: resolveBloomEntryList(rec.feedings, profilesById) }
      : {}),
    ...(Array.isArray(rec.climateChecks)
      ? { climateChecks: resolveBloomEntryList(rec.climateChecks, profilesById) }
      : {})
  };
}

export function enrichBloomMoltRecord(rec, profilesList = DEFAULT_PROFILES, profilesById = null) {
  if (!isPlainObject(rec)) return rec;
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const explicitId =
    typeof rec.loggedByProfileId === 'string' && map[rec.loggedByProfileId]
      ? rec.loggedByProfileId
      : null;
  const inferredId = explicitId || inferProfileIdFromName(profilesList, rec.loggedBy);
  return inferredId ? { ...rec, loggedByProfileId: inferredId } : { ...rec };
}

export function resolveBloomMoltRecord(rec, profilesById) {
  if (!isPlainObject(rec) || !rec.loggedByProfileId) return rec;
  const resolvedName = resolveProfileDisplayName(
    profilesById,
    rec.loggedByProfileId,
    rec.loggedBy
  );
  return resolvedName === rec.loggedBy ? rec : { ...rec, loggedBy: resolvedName };
}

export function normalizeLedgerData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_LEDGER_DATA };
  }
  return {
    splitRule: raw.splitRule === 'proportional' ? 'proportional' : '50-50',
    incomes: Array.isArray(raw.incomes) ? raw.incomes : DEFAULT_LEDGER_DATA.incomes,
    recurring: Array.isArray(raw.recurring) ? raw.recurring : DEFAULT_LEDGER_DATA.recurring,
    expenses: Array.isArray(raw.expenses) ? raw.expenses : DEFAULT_LEDGER_DATA.expenses
  };
}

export function normalizeBeaconContacts(
  contacts,
  baseContacts = [],
  profilesList = DEFAULT_PROFILES,
  profilesById = null
) {
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const baseById = new Map(
    (Array.isArray(baseContacts) ? baseContacts : [])
      .filter((b) => isPlainObject(b) && b.id)
      .map((b) => [b.id, b])
  );
  return (Array.isArray(contacts) ? contacts : []).map((c) => {
    if (!isPlainObject(c)) return c;
    const prev = c.id ? baseById.get(c.id) : null;
    const prevProfileId = prev?.profileId && map[prev.profileId] ? prev.profileId : null;
    const hasExplicitPid = Object.prototype.hasOwnProperty.call(c, 'profileId');

    let nextProfileId = null;
    if (hasExplicitPid) {
      if (typeof c.profileId === 'string' && map[c.profileId]) {
        nextProfileId = c.profileId;
      } else if (c.profileId === null) {
        nextProfileId = null;
      } else {
        nextProfileId = inferProfileIdFromName(profilesList, c.name);
      }
    } else {
      nextProfileId = prevProfileId || null;
      if (!nextProfileId && (c.id === 'c-partner1' || c.id === 'c-partner2')) {
        const targetId = c.id.slice(2);
        const inferred = inferProfileIdFromName(profilesList, c.name);
        if (!c.name || inferred === targetId) {
          nextProfileId = targetId;
        }
      } else if (!nextProfileId && c.name) {
        nextProfileId = inferProfileIdFromName(profilesList, c.name);
      }
    }

    return {
      ...c,
      profileId: nextProfileId || null
    };
  });
}

export function normalizeBeaconInfo(
  raw = {},
  { baseContacts = [], profilesList = DEFAULT_PROFILES, profilesById = null } = {}
) {
  const src = isPlainObject(raw) ? raw : {};
  const contacts = Array.isArray(src.contacts)
    ? normalizeBeaconContacts(src.contacts, baseContacts, profilesList, profilesById)
    : DEFAULT_BEACON_INFO.contacts.map((c) => ({ ...c }));
  return {
    petCare: {
      ...DEFAULT_BEACON_INFO.petCare,
      ...(isPlainObject(src.petCare) ? src.petCare : {})
    },
    vetInfo: {
      ...DEFAULT_BEACON_INFO.vetInfo,
      ...(isPlainObject(src.vetInfo) ? src.vetInfo : {})
    },
    contacts,
    houseGuide: {
      ...DEFAULT_BEACON_INFO.houseGuide,
      ...(isPlainObject(src.houseGuide) ? src.houseGuide : {})
    }
  };
}

export function mergeBeaconInfo(
  current,
  incoming,
  profilesList = DEFAULT_PROFILES,
  { mergeContacts = false, profilesById = null } = {}
) {
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
      const mergedMap = new Map();
      for (const c of base.contacts) {
        if (isPlainObject(c) && c.id) mergedMap.set(c.id, c);
      }
      for (const c of normalizedIncoming) {
        if (!isPlainObject(c)) continue;
        if (c.id) mergedMap.set(c.id, c);
        else mergedMap.set(`c-${Date.now()}-${mergedMap.size}`, c);
      }
      nextContacts = Array.from(mergedMap.values());
    } else {
      nextContacts = normalizedIncoming;
    }
  }
  return {
    petCare: {
      ...base.petCare,
      ...(isPlainObject(incoming.petCare) ? incoming.petCare : {})
    },
    vetInfo: {
      ...base.vetInfo,
      ...(isPlainObject(incoming.vetInfo) ? incoming.vetInfo : {})
    },
    contacts: nextContacts,
    houseGuide: {
      ...base.houseGuide,
      ...(isPlainObject(incoming.houseGuide) ? incoming.houseGuide : {})
    }
  };
}

export function resolveBeaconInfo(
  raw,
  profilesById,
  profilesList = DEFAULT_PROFILES
) {
  const map = profilesById || buildProfilesByIdMap(profilesList);
  const normalized = normalizeBeaconInfo(raw, { profilesList, profilesById: map });
  return {
    ...normalized,
    contacts: normalized.contacts.map((c) => {
      if (!isPlainObject(c) || !c.profileId) return c;
      const resolvedName = resolveProfileDisplayName(map, c.profileId, c.name);
      return resolvedName === c.name ? c : { ...c, name: resolvedName };
    })
  };
}
