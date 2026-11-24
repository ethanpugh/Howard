import { Home, Cat, Flower2, Calendar, Heart, Wallet, ShieldAlert } from 'lucide-react';
import {
  computeBottleStatus,
  doesAlmanacEventOccurOnDate,
  getLedgerScheduleInfo,
  isAlmanacEventVisibleToProfile
} from './householdHelpers.js';

export const APP_REGISTRY = [
  {
    id: 'foyer',
    name: 'Foyer',
    subtitle: 'Daily Briefing',
    icon: Home,
    accent: 'bg-teal-700 text-white',
    activeCardClass: 'border-teal-500 ring-2 ring-teal-500/25'
  },
  {
    id: 'cadence',
    name: 'Cadence',
    subtitle: 'Pet Meds',
    icon: Cat,
    accent: 'bg-purple-600 text-white',
    activeCardClass: 'border-purple-500 ring-2 ring-purple-500/25'
  },
  {
    id: 'bloom',
    name: 'Bloom',
    subtitle: 'Mantis Care',
    icon: Flower2,
    accent: 'bg-emerald-700 text-white',
    activeCardClass: 'border-emerald-500 ring-2 ring-emerald-500/25'
  },
  {
    id: 'almanac',
    name: 'Almanac',
    subtitle: 'Calendar',
    icon: Calendar,
    accent: 'bg-indigo-600 text-white',
    activeCardClass: 'border-indigo-500 ring-2 ring-indigo-500/25'
  },
  {
    id: 'floodgate',
    name: 'Floodgate',
    subtitle: 'Cycle & GP Log',
    icon: Heart,
    accent: 'bg-rose-600 text-white',
    activeCardClass: 'border-rose-500 ring-2 ring-rose-500/25',
    privateTo: 'partner2'
  },
  {
    id: 'ledger',
    name: 'Ledger',
    subtitle: 'Finances & Bills',
    icon: Wallet,
    accent: 'bg-amber-700 text-white',
    activeCardClass: 'border-amber-500 ring-2 ring-amber-500/25'
  },
  {
    id: 'beacon',
    name: 'Beacon',
    subtitle: 'House & Vet Guide',
    icon: ShieldAlert,
    accent: 'bg-sky-700 text-white',
    activeCardClass: 'border-sky-500 ring-2 ring-sky-500/25'
  }
];

export function computeModuleStatuses({
  todayKey,
  hour,
  cadenceSnapshot,
  bloomSummary,
  almanacEvents,
  floodgateSnapshot,
  ledgerData,
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
    beacon: beaconStatus
  };
}
