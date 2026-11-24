export const VALID_APP_IDS = new Set([
  'foyer',
  'cadence',
  'bloom',
  'almanac',
  'floodgate',
  'ledger',
  'beacon'
]);

export const DEFAULT_PROFILES = [
  {
    id: 'partner1',
    name: 'Partner 1',
    role: 'Household Member',
    color: 'teal',
    badgeEmoji: '⚡',
    pinEnabled: false,
    pin: '',
    allowedApps: ['foyer', 'cadence', 'bloom', 'almanac', 'ledger', 'beacon'],
    caregiverName: 'Partner 1'
  },
  {
    id: 'partner2',
    name: 'Partner 2',
    role: 'Household Member',
    color: 'rose',
    badgeEmoji: '🌸',
    pinEnabled: false,
    pin: '',
    allowedApps: ['foyer', 'cadence', 'bloom', 'almanac', 'floodgate', 'ledger', 'beacon'],
    caregiverName: 'Partner 2'
  },
  {
    id: 'caregiver',
    name: 'Caregiver',
    role: 'Pet Sitter / Guest',
    color: 'amber',
    badgeEmoji: '🐾',
    pinEnabled: false,
    pin: '',
    lockedOutOfPin: true,
    allowedApps: ['foyer', 'cadence', 'bloom', 'beacon'],
    caregiverName: 'Caregiver'
  }
];

export const inferProfileIdFromName = (profiles = [], rawName = '') => {
  const lower = String(rawName || '').trim().toLowerCase();
  if (!lower || lower === 'both' || lower === 'pets' || lower === 'household') {
    return null;
  }
  const list = Array.isArray(profiles) ? profiles : Object.values(profiles || {});
  for (const prof of list) {
    if (!prof || typeof prof.id !== 'string') continue;
    const pName = String(prof.name || '').trim().toLowerCase();
    const pCaregiver = String(prof.caregiverName || '').trim().toLowerCase();
    if (
      lower === prof.id.toLowerCase() ||
      (pName && lower === pName) ||
      (pCaregiver && lower === pCaregiver)
    ) {
      return prof.id;
    }
  }
  if (lower === 'partner 1' || lower === 'partner1') return 'partner1';
  if (lower === 'partner 2' || lower === 'partner2') return 'partner2';
  if (lower === 'caregiver') return 'caregiver';
  return null;
};

export const resolveProfileDisplayName = (profilesOrMap = [], profileId, fallbackName = '') => {
  if (profileId) {
    if (Array.isArray(profilesOrMap)) {
      const match = profilesOrMap.find((p) => p && p.id === profileId);
      if (match?.name) return match.name;
    } else if (profilesOrMap && typeof profilesOrMap === 'object') {
      const match = profilesOrMap[profileId];
      if (match?.name) return match.name;
    }
  }
  return fallbackName;
};

/**
 * Single canonical visibility predicate used by both backend projection and Almanac UI.
 * Prevents partner2-private clinical/GP events from leaking across server sync.
 */
export const isAlmanacEventVisibleToProfile = (
  evt,
  activeProfileOrId,
  partner2OrProfiles = 'Partner 2'
) => {
  if (!evt) return false;
  const activeId =
    typeof activeProfileOrId === 'string' ? activeProfileOrId : activeProfileOrId?.id;
  if (activeId === 'partner2') return true;
  if (evt.linkToGpReport) return false;

  let partner2Name = 'Partner 2';
  if (typeof partner2OrProfiles === 'string') {
    partner2Name = partner2OrProfiles;
  } else if (Array.isArray(partner2OrProfiles)) {
    const p2 = partner2OrProfiles.find((p) => p && p.id === 'partner2');
    if (p2?.name) partner2Name = p2.name;
  }

  if (
    evt.category === 'medical' &&
    (evt.assignedToProfileId === 'partner2' ||
      evt.assignedTo === 'Partner 2' ||
      (partner2Name && evt.assignedTo === partner2Name))
  ) {
    return false;
  }
  return true;
};
