import {
  Home,
  Cat,
  Flower2,
  Calendar,
  Heart,
  Wallet,
  StickyNote,
  ShieldAlert,
  type LucideIcon
} from 'lucide-react';
import type { AppId, ProfileId } from '../../shared/schemas/common.ts';
import type { AlmanacEvent } from '../../shared/schemas/almanac.ts';
import type { BeaconInfo } from '../../shared/schemas/beacon.ts';
import type { CadenceSnapshot } from '../../shared/schemas/cadence.ts';
import type { FloodgateSnapshot } from '../../shared/schemas/floodgate.ts';
import type { LedgerData } from '../../shared/schemas/ledger.ts';
import type { PublicProfile } from '../../shared/schemas/profile.ts';
import type { QuillSnapshot } from '../../shared/schemas/quill.ts';
import {
  computeBottleStatus,
  doesAlmanacEventOccurOnDate,
  getLedgerScheduleInfo,
  isAlmanacEventVisibleToProfile,
  type BloomSummary
} from './householdHelpers.ts';
import {
  MODULE_ACCENT_BY_ID,
  MODULE_THEMES,
  type ModuleAccentKey
} from './moduleThemes.ts';

export interface AppRegistryEntry {
  id: AppId;
  name: string;
  subtitle: string;
  icon: LucideIcon;
  accentKey: ModuleAccentKey;
  accent: string;
  activeBadgeClass?: string;
  activeCardClass: string;
  privateTo?: ProfileId;
}

export interface ModuleStatusBadge {
  label: string;
  urgent: boolean;
}

function createRegistryEntry(
  id: AppId,
  name: string,
  subtitle: string,
  icon: LucideIcon,
  extra: { privateTo?: ProfileId } = {}
): AppRegistryEntry {
  const accentKey = MODULE_ACCENT_BY_ID[id] || 'teal';
  const theme = MODULE_THEMES[accentKey] || MODULE_THEMES.teal;
  return {
    id,
    name,
    subtitle,
    icon,
    accentKey,
    accent: theme.activeTab.replace(/\s*shadow-xs$/, ''),
    ...(theme.activeTabBadge ? { activeBadgeClass: theme.activeTabBadge } : {}),
    activeCardClass: theme.activeCardClass,
    ...extra
  };
}

export const APP_REGISTRY: AppRegistryEntry[] = [
  createRegistryEntry('foyer', 'Foyer', 'Daily Briefing', Home),
  createRegistryEntry('cadence', 'Cadence', 'Pet Meds', Cat),
  createRegistryEntry('bloom', 'Bloom', 'Mantis Care', Flower2),
  createRegistryEntry('almanac', 'Almanac', 'Calendar', Calendar),
  createRegistryEntry('floodgate', 'Floodgate', 'Cycle & GP Log', Heart, { privateTo: 'partner2' }),
  createRegistryEntry('ledger', 'Ledger', 'Finances & Bills', Wallet),
  createRegistryEntry('quill', 'Quill', 'Notes & Shared Board', StickyNote),
  createRegistryEntry('beacon', 'Beacon', 'House & Vet Guide', ShieldAlert)
];

export function computeModuleStatuses({
  todayKey,
  hour,
  cadenceSnapshot,
  bloomSummary,
  almanacEvents,
  floodgateSnapshot,
  ledgerData,
  quillSnapshot,
  beaconInfo,
  activeProfile,
  profiles
}: {
  todayKey: string;
  hour: number;
  cadenceSnapshot: CadenceSnapshot;
  bloomSummary: BloomSummary;
  almanacEvents: AlmanacEvent[];
  floodgateSnapshot: FloodgateSnapshot;
  ledgerData: LedgerData;
  quillSnapshot: QuillSnapshot;
  beaconInfo: BeaconInfo | null;
  activeProfile: PublicProfile;
  profiles: PublicProfile[];
}): Record<AppId, ModuleStatusBadge> {
  const todayCadence = cadenceSnapshot?.logsByDate?.[todayKey] || {};
  const amDone = Boolean(todayCadence.morning?.given);
  const pmDone = Boolean(todayCadence.evening?.given);
  const amTarget = cadenceSnapshot?.settings?.morningTargetTime || '08:00';
  const pmTarget = cadenceSnapshot?.settings?.eveningTargetTime || '20:00';
  const bottle = computeBottleStatus(cadenceSnapshot?.settings, todayKey);

  let cadenceStatus: ModuleStatusBadge = { label: '2/2 done', urgent: false };
  if (bottle.daysRemaining <= 0) {
    cadenceStatus = { label: 'Bottle exp.', urgent: true };
  } else if (!amDone) {
    cadenceStatus = { label: `AM ${amTarget}`, urgent: true };
  } else if (!pmDone) {
    cadenceStatus = { label: `PM ${pmTarget}`, urgent: hour >= 17 };
  } else if (bottle.daysRemaining <= 14) {
    cadenceStatus = { label: `${bottle.daysRemaining}d bottle`, urgent: true };
  }

  let bloomStatus: ModuleStatusBadge = {
    label: `${bloomSummary.settings.currentInstar} OK`,
    urgent: false
  };
  if (bloomSummary.settings.livePreyInside) {
    bloomStatus = { label: 'Prey inside', urgent: true };
  } else if (bloomSummary.isNoFeedLockout) {
    bloomStatus = {
      label: bloomSummary.effectiveStatus === 'premolt' ? 'Premolt' : 'Hardening',
      urgent: true
    };
  } else if (bloomSummary.isMistDue) {
    bloomStatus = { label: 'Mist due', urgent: true };
  } else if (bloomSummary.feederAlerts.length > 0 && activeProfile.id !== 'caregiver') {
    bloomStatus = { label: 'Feeder low', urgent: true };
  }

  const partner2Name = (profiles || []).find((p) => p.id === 'partner2')?.name || 'Partner 2';
  const todayEvents = (almanacEvents || []).filter(
    (evt) =>
      doesAlmanacEventOccurOnDate(evt, todayKey) &&
      isAlmanacEventVisibleToProfile(evt, activeProfile, partner2Name)
  );
  const almanacStatus: ModuleStatusBadge =
    todayEvents.length > 0
      ? { label: `${todayEvents.length} today`, urgent: true }
      : { label: 'Clear', urgent: false };

  const fgToday = floodgateSnapshot?.logsByDate?.[todayKey];
  const floodgateStatus: ModuleStatusBadge = fgToday
    ? { label: 'Logged', urgent: false }
    : { label: 'Private', urgent: false };

  const activeRecurring = (ledgerData?.recurring || []).filter((r) => r.active !== false);
  const refDate = new Date(`${todayKey}T12:00:00`);
  const dueSoonCount = activeRecurring.filter((r) => {
    const { daysUntil } = getLedgerScheduleInfo(r, false, refDate);
    return daysUntil >= 0 && daysUntil <= 3;
  }).length;
  const ledgerStatus: ModuleStatusBadge =
    dueSoonCount > 0
      ? { label: `${dueSoonCount} due soon`, urgent: true }
      : { label: 'Synced', urgent: false };

  const activeNotes = (quillSnapshot?.notes || []).filter((n) => n.status === 'active');
  const caregiverNotes = activeNotes.filter(
    (n) => n.visibility === 'shared' && Boolean(n.caregiverVisible)
  );
  const pinnedNotesCount = activeNotes.filter((n) => n.pinned).length;
  const quillStatus: ModuleStatusBadge =
    activeProfile?.id === 'caregiver'
      ? {
          label: caregiverNotes.length > 0 ? `${caregiverNotes.length} house` : 'None',
          urgent: false
        }
      : {
          label:
            pinnedNotesCount > 0
              ? `${pinnedNotesCount} pinned`
              : activeNotes.length > 0
                ? `${activeNotes.length} notes`
                : 'Empty',
          urgent: false
        };

  const hasBeaconDetails = Boolean(
    beaconInfo?.vetInfo?.phone ||
      beaconInfo?.vetInfo?.emergencyPhone ||
      beaconInfo?.houseGuide?.wifiName
  );
  const beaconStatus: ModuleStatusBadge = {
    label: hasBeaconDetails ? 'Ready' : 'Guide',
    urgent: false
  };

  return {
    foyer: { label: 'Home', urgent: false },
    cadence: cadenceStatus,
    bloom: bloomStatus,
    almanac: almanacStatus,
    floodgate: floodgateStatus,
    ledger: ledgerStatus,
    quill: quillStatus,
    beacon: beaconStatus
  };
}
