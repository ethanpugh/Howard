import {
  Home,
  Cat,
  Flower2,
  Calendar,
  Heart,
  Wallet,
  StickyNote,
  ShieldAlert
} from 'lucide-react';
import {
  computeBottleStatus,
  doesAlmanacEventOccurOnDate,
  getLedgerScheduleInfo,
  isAlmanacEventVisibleToProfile
} from './householdHelpers.js';
import { MODULE_ACCENT_BY_ID, MODULE_THEMES } from './moduleThemes.js';

function createRegistryEntry(id, name, subtitle, icon, extra = {}) {
  const accentKey = MODULE_ACCENT_BY_ID[id] || 'teal';
  const theme = MODULE_THEMES[accentKey] || MODULE_THEMES.teal;
  return {
    id,
    name,
    subtitle,
    icon,
    accentKey,
    accent: theme.activeTab.replace(/\s*shadow-xs$/, ''),
    ...(theme.activeBadgeClass ? { activeBadgeClass: theme.activeBadgeClass } : {}),
    activeCardClass: theme.activeCardClass,
    ...extra
  };
}

export const APP_REGISTRY = [
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
}) {
  const todayCadence = cadenceSnapshot?.logsByDate?.[todayKey] || {};
  const amDone = Boolean(todayCadence.morning?.given);
  const pmDone = Boolean(todayCadence.evening?.given);
  const amTarget = cadenceSnapshot?.settings?.morningTargetTime || '08:00';
  const pmTarget = cadenceSnapshot?.settings?.eveningTargetTime || '20:00';
  const bottle = computeBottleStatus(cadenceSnapshot?.settings, todayKey);

  let cadenceStatus = { label: '2/2 done', urgent: false };
  if (bottle.daysRemaining <= 0) {
    cadenceStatus = { label: 'Bottle exp.', urgent: true };
  } else if (!amDone) {
    cadenceStatus = { label: `AM ${amTarget}`, urgent: true };
  } else if (!pmDone) {
    cadenceStatus = { label: `PM ${pmTarget}`, urgent: hour >= 17 };
  } else if (bottle.daysRemaining <= 14) {
    cadenceStatus = { label: `${bottle.daysRemaining}d bottle`, urgent: true };
  }

  let bloomStatus = {
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
  const almanacStatus =
    todayEvents.length > 0
      ? { label: `${todayEvents.length} today`, urgent: true }
      : { label: 'Clear', urgent: false };

  const fgToday = floodgateSnapshot?.logsByDate?.[todayKey];
  const floodgateStatus = fgToday
    ? { label: 'Logged', urgent: false }
    : { label: 'Private', urgent: false };

  const activeRecurring = (ledgerData?.recurring || []).filter((r) => r.active !== false);
  const refDate = new Date(`${todayKey}T12:00:00`);
  const dueSoonCount = activeRecurring.filter((r) => {
    const { daysUntil } = getLedgerScheduleInfo(r, false, refDate);
    return daysUntil >= 0 && daysUntil <= 3;
  }).length;
  const ledgerStatus =
    dueSoonCount > 0
      ? { label: `${dueSoonCount} due soon`, urgent: true }
      : { label: 'Synced', urgent: false };

  const activeNotes = (quillSnapshot?.notes || []).filter((n) => n.status === 'active');
  const caregiverNotes = activeNotes.filter(
    (n) => n.visibility === 'shared' && Boolean(n.caregiverVisible)
  );
  const pinnedNotesCount = activeNotes.filter((n) => n.pinned).length;
  const quillStatus =
    activeProfile?.id === 'caregiver'
      ? { label: caregiverNotes.length > 0 ? `${caregiverNotes.length} house` : 'None', urgent: false }
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
  const beaconStatus = { label: hasBeaconDetails ? 'Ready' : 'Guide', urgent: false };

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
