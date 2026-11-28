import type { AppId, ProfileId } from './schemas/common.ts';
import type { Profile } from './schemas/profile.ts';

export const VALID_APP_IDS: ReadonlySet<AppId> = new Set<AppId>([
  'foyer',
  'cadence',
  'bloom',
  'almanac',
  'floodgate',
  'ledger',
  'quill',
  'beacon'
]);

export const DEFAULT_PROFILES: Profile[] = [
  {
    id: 'partner1',
    name: 'Partner 1',
    role: 'Household Member',
    color: 'teal',
    badgeEmoji: '⚡',
    pinEnabled: false,
    pin: '',
    pinHash: '',
    allowedApps: ['foyer', 'cadence', 'bloom', 'almanac', 'ledger', 'quill', 'beacon'],
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
    pinHash: '',
    allowedApps: ['foyer', 'cadence', 'bloom', 'almanac', 'floodgate', 'ledger', 'quill', 'beacon'],
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
    pinHash: '',
    lockedOutOfPin: true,
    allowedApps: ['foyer', 'cadence', 'bloom', 'quill', 'beacon'],
    caregiverName: 'Caregiver'
  }
];

interface ProfileLike {
  id?: string | undefined;
  name?: string | undefined;
  caregiverName?: string | undefined;
}

export const isProfileId = (value: unknown): value is ProfileId =>
  value === 'partner1' || value === 'partner2' || value === 'caregiver';

export const normalizeProfileId = (
  value: unknown,
  fallback: ProfileId = 'caregiver'
): ProfileId => (isProfileId(value) ? value : fallback);

export const inferProfileIdFromName = (
  profiles: ProfileLike[] | Record<string, ProfileLike> = [],
  rawName = ''
): ProfileId | null => {
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
      if (isProfileId(prof.id)) {
        return prof.id;
      }
    }
  }
  if (lower === 'partner 1' || lower === 'partner1') return 'partner1';
  if (lower === 'partner 2' || lower === 'partner2') return 'partner2';
  if (lower === 'caregiver') return 'caregiver';
  return null;
};

export const resolveProfileDisplayName = (
  profilesOrMap: ProfileLike[] | Record<string, ProfileLike | undefined> = [],
  profileId: string | null | undefined,
  fallbackName = ''
): string => {
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

export interface AlmanacVisibilityTarget {
  linkToGpReport?: boolean | undefined;
  category?: string | undefined;
  assignedToProfileId?: string | null | undefined;
  assignedTo?: string | undefined;
}

/**
 * Single canonical visibility predicate used by both backend projection and Almanac UI.
 * Prevents partner2-private clinical/GP events from leaking across server sync.
 */
export const isAlmanacEventVisibleToProfile = (
  evt: AlmanacVisibilityTarget | null | undefined,
  activeProfileOrId: string | { id?: string } | null | undefined,
  partner2OrProfiles: string | ProfileLike[] = 'Partner 2'
): boolean => {
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

  const assignedLower = String(evt.assignedTo || '').trim().toLowerCase();
  const partner2Lower = partner2Name.trim().toLowerCase();

  if (
    evt.category === 'medical' &&
    (evt.assignedToProfileId === 'partner2' ||
      assignedLower === 'partner 2' ||
      assignedLower === 'partner2' ||
      (partner2Lower !== '' && assignedLower === partner2Lower))
  ) {
    return false;
  }
  return true;
};
