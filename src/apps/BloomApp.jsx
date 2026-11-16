import React, { useState, useEffect, useMemo } from 'react';
import {
  Flower2,
  Droplets,
  Bug,
  Thermometer,
  Ruler,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Plus,
  Settings,
  Trash2,
  X,
  Check,
  Info,
  Activity,
  History
} from 'lucide-react';

const getLocalDateKey = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDateKey = (dateKey) => {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return new Date();
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const shiftDateKey = (dateKey, deltaDays) => {
  const dt = parseLocalDateKey(dateKey);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateKey(dt);
};

const formatTimeShort = (isoString) => {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const formatFriendlyDate = (dateKey, todayKey) => {
  if (!dateKey) return '';
  if (dateKey === todayKey) return 'Today';
  if (dateKey === shiftDateKey(todayKey, -1)) return 'Yesterday';
  return parseLocalDateKey(dateKey).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
};

const formatDurationAgo = (isoString, nowMs) => {
  if (!isoString) return null;
  const diffMs = Math.max(0, nowMs - new Date(isoString).getTime());
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 48) return remMins > 0 ? `${hrs}h ${remMins}m ago` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const formatCountdown = (targetIso, nowMs) => {
  if (!targetIso) return '';
  const diffMs = Math.max(0, new Date(targetIso).getTime() - nowMs);
  const totalMins = Math.ceil(diffMs / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs <= 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
};

export const INSTAR_STAGES = [
  'L1',
  'L2',
  'L3',
  'L4',
  'L5',
  'L6',
  'L7',
  'Sub-adult',
  'Adult'
];

export const getSuggestedNextInstar = (currentInstar, sex = 'Male') => {
  if (currentInstar === 'Adult') return 'Adult';
  if (currentInstar === 'Sub-adult') return 'Adult';
  // Male Spiny Flower mantises often enter Sub-adult around L5/L6 and Adult at L6/L7
  if (sex === 'Male' && currentInstar === 'L5') return 'Sub-adult';
  if (sex === 'Female' && currentInstar === 'L6') return 'Sub-adult';
  const idx = INSTAR_STAGES.indexOf(currentInstar);
  if (idx !== -1 && idx < INSTAR_STAGES.length - 1) {
    return INSTAR_STAGES[idx + 1];
  }
  return 'L3';
};

export const SPECIES_PRESETS = [
  {
    id: 'spiny_flower',
    commonName: 'Spiny Flower Mantis',
    scientificName: 'Pseudocreobotra wahlbergii',
    dayTempMinC: 25,
    dayTempMaxC: 28,
    nightTempMinC: 20,
    humidityMinPct: 50,
    humidityMaxPct: 65,
    mistTargetHours: 24,
    note: 'Loves warmth (~25–28°C) and strong cross-ventilation. Mist one enclosure wall lightly once daily and allow it to dry out between sprays.'
  },
  {
    id: 'orchid_flower',
    commonName: 'Orchid Mantis',
    scientificName: 'Hymenopus coronatus',
    dayTempMinC: 25,
    dayTempMaxC: 28,
    nightTempMinC: 20,
    humidityMinPct: 60,
    humidityMaxPct: 75,
    mistTargetHours: 16,
    note: 'Tropical petal mimic needing slightly higher humidity (60–75% RH) paired with gentle cross-ventilation and flying pollinators/flies.'
  },
  {
    id: 'jeweled_flower',
    commonName: 'Jeweled Flower Mantis',
    scientificName: 'Creobroter gemmatus',
    dayTempMinC: 24,
    dayTempMaxC: 28,
    nightTempMinC: 19,
    humidityMinPct: 55,
    humidityMaxPct: 65,
    mistTargetHours: 24,
    note: 'Hardy, active flower mantis thriving around 24–28°C with light daily misting and flying prey.'
  },
  {
    id: 'custom',
    commonName: 'Custom Flower Mantis',
    scientificName: 'Mantodea sp.',
    dayTempMinC: 24,
    dayTempMaxC: 28,
    nightTempMinC: 20,
    humidityMinPct: 50,
    humidityMaxPct: 65,
    mistTargetHours: 24,
    note: 'Custom habitat parameters.'
  }
];

export const ABDOMEN_LEVELS = [
  {
    id: 'flat',
    label: 'Flat / Thin',
    hint: 'Hungry — feed soon',
    pillClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    activeClass: 'bg-amber-500 text-slate-950 border-amber-600'
  },
  {
    id: 'ready',
    label: 'Ready',
    hint: 'Good hunting appetite',
    pillClass: 'bg-lime-500/15 text-lime-700 dark:text-lime-300 border-lime-500/30',
    activeClass: 'bg-lime-600 text-white border-lime-700'
  },
  {
    id: 'plump',
    label: 'Plump',
    hint: 'Ideal fullness',
    pillClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    activeClass: 'bg-emerald-600 text-white border-emerald-700'
  },
  {
    id: 'stuffed',
    label: 'Stuffed',
    hint: 'Rest & digest',
    pillClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    activeClass: 'bg-indigo-600 text-white border-indigo-700'
  }
];

export const PREY_OPTIONS = [
  { id: 'melanogaster', label: 'D. melanogaster (Tiny Fruit Fly)', stages: 'L1–L2' },
  { id: 'hydei', label: 'D. hydei (Larger Fruit Fly)', stages: 'L2–L4' },
  { id: 'curly_wing', label: 'Curly-Wing Fly', stages: 'L4–Sub-adult' },
  { id: 'greenbottle', label: 'Greenbottle / Bluebottle Fly', stages: 'L5–Adult' },
  { id: 'micro_locust', label: 'Hatchling / Pinhead Locust', stages: 'L3–L5' },
  { id: 'waxmoth', label: 'Waxmoth / Small Moth', stages: 'Sub-adult–Adult' },
  { id: 'honey', label: 'Tiny Raw Honey Droplet (Boost)', stages: 'All stages' }
];

const FEEDER_CULTURE_TYPES = [
  { id: 'melanogaster', label: 'D. melanogaster Culture', defaultDays: 25 },
  { id: 'hydei', label: 'D. hydei Culture', defaultDays: 28 },
  { id: 'curly_wing', label: 'Curly-Wing Fly Tub / Casters', defaultDays: 18 },
  { id: 'greenbottle', label: 'Greenbottle / Bluebottle Casters (Fridge)', defaultDays: 21 },
  { id: 'micro_locust', label: 'Hatchling / Micro Locust Tub', defaultDays: 14 },
  { id: 'waxmoth', label: 'Waxworms / Waxmoth Tub', defaultDays: 21 }
];

const BEHAVIOR_TAGS = [
  'Petal Sway',
  'Drank Droplets',
  'Active Ambush',
  'Threat Display!',
  'Hanging on Mesh Lid',
  'Abdomen Pulsing',
  'Swollen Wing Buds'
];

export const DEFAULT_BLOOM_SETTINGS = {
  mantisName: 'Mantis',
  speciesPreset: 'spiny_flower',
  commonName: 'Spiny Flower Mantis',
  scientificName: 'Pseudocreobotra wahlbergii',
  sex: 'Male',
  pronouns: 'he/him',
  currentInstar: 'L2',
  arrivalDate: getLocalDateKey(new Date()),
  hatchDate: '',
  currentColorMorph: 'Spiky creamy-white & dark banded nymph',
  lifecycleStatus: 'normal',
  premoltStartedAt: null,
  hardeningUntil: null,
  hardeningHours: 36,
  livePreyInside: false,
  livePreyNote: '',
  dayTempMinC: 25,
  dayTempMaxC: 28,
  nightTempMinC: 20,
  humidityMinPct: 50,
  humidityMaxPct: 65,
  mistTargetHours: 24,
  typicalInterMoltDays: 14,
  enclosureInfo: {
    currentSizeLabel: 'Ventilated Nymph Cup / Mini Tall Enclosure',
    meshType: 'Soft nylon / fabric mesh (tarsal-safe)',
    substrate: 'Paper towel / coco fibre + climbing twigs & blossoms',
    lastDeepCleanDate: getLocalDateKey(new Date()),
    currentBodyLengthMm: 10,
    enclosureHeightMm: 110,
    enclosureWidthMm: 75
  },
  caregivers: ['Partner 1', 'Partner 2', 'Caregiver'],
  careNote:
    'Mist one enclosure wall lightly once daily for drinking droplets—never spray the mantis directly, and let the enclosure dry between mists (Spiny Flower Mantises need cross-ventilation!). Do NOT offer live prey during Premolt Watch or Post-Molt Hardening.'
};

// Shared summary calculator used by BloomApp, FoyerApp, AlmanacApp, and BeaconApp
export function computeBloomSummary(bloomSnapshot, now = new Date()) {
  const nowMs = now.getTime();
  const todayKey = getLocalDateKey(now);
  const rawSettings = bloomSnapshot?.settings || {};
  const settings = {
    ...DEFAULT_BLOOM_SETTINGS,
    ...rawSettings,
    enclosureInfo: {
      ...DEFAULT_BLOOM_SETTINGS.enclosureInfo,
      ...rawSettings.enclosureInfo
    }
  };

  const logsByDate = bloomSnapshot?.logsByDate || {};
  const molts = [...(bloomSnapshot?.molts || [])].sort((a, b) =>
    ((b.dateKey || '') + (b.timestamp || '')).localeCompare((a.dateKey || '') + (a.timestamp || ''))
  );
  const feeders = bloomSnapshot?.feeders || [];

  // 1. Effective lifecycle status & post-molt hardening countdown
  let effectiveStatus = 'normal';
  let hardeningRemainingLabel = '';
  if (settings.lifecycleStatus === 'premolt') {
    effectiveStatus = 'premolt';
  } else if (settings.lifecycleStatus === 'hardening') {
    const untilMs = settings.hardeningUntil ? new Date(settings.hardeningUntil).getTime() : 0;
    if (untilMs > nowMs) {
      effectiveStatus = 'hardening';
      hardeningRemainingLabel = formatCountdown(settings.hardeningUntil, nowMs);
    } else {
      effectiveStatus = 'hardened_ready';
    }
  }
  const isNoFeedLockout = effectiveStatus === 'premolt' || effectiveStatus === 'hardening';

  // 2. Scan daily care logs (newest date first) for latest mist, meal, refusal, abdomen, climate
  const sortedDateKeys = Object.keys(logsByDate).sort().reverse();
  let lastMist = null;
  let lastMeal = null;
  let lastRefusal = null;
  let latestAbdomen = null;
  let latestClimate = null;

  for (const dKey of sortedDateKeys) {
    const dayLog = logsByDate[dKey] || {};
    if (!lastMist && Array.isArray(dayLog.mists) && dayLog.mists.length > 0) {
      const m = [...dayLog.mists].sort((a, b) =>
        (b.timestamp || '').localeCompare(a.timestamp || '')
      )[0];
      const mMs = m.timestamp ? new Date(m.timestamp).getTime() : parseLocalDateKey(dKey).getTime();
      const hoursAgo = Math.max(0, (nowMs - mMs) / 3600000);
      lastMist = {
        ...m,
        dateKey: dKey,
        hoursAgo,
        timeAgoLabel: m.timestamp ? formatDurationAgo(m.timestamp, nowMs) : formatFriendlyDate(dKey, todayKey),
        isToday: dKey === todayKey
      };
    }

    if (Array.isArray(dayLog.feedings) && dayLog.feedings.length > 0) {
      const sortedFeeds = [...dayLog.feedings].sort((a, b) =>
        (b.timestamp || '').localeCompare(a.timestamp || '')
      );
      for (const f of sortedFeeds) {
        if (!latestAbdomen && f.abdomenAfter) {
          latestAbdomen = f.abdomenAfter;
        }
        if (!lastMeal && (f.outcome === 'eaten' || f.outcome === 'partial' || !f.outcome)) {
          const daysAgo = Math.max(
            0,
            Math.round(
              (parseLocalDateKey(todayKey).getTime() - parseLocalDateKey(dKey).getTime()) /
                86400000
            )
          );
          lastMeal = {
            ...f,
            dateKey: dKey,
            daysAgo,
            friendlyWhen: formatFriendlyDate(dKey, todayKey)
          };
        }
        if (!lastRefusal && f.outcome === 'refused') {
          lastRefusal = { ...f, dateKey: dKey };
        }
      }
    }

    if (!latestAbdomen && dayLog.abdomenStatus) {
      latestAbdomen = dayLog.abdomenStatus;
    }

    if (!latestClimate && Array.isArray(dayLog.climateChecks) && dayLog.climateChecks.length > 0) {
      const c = [...dayLog.climateChecks].sort((a, b) =>
        (b.timestamp || '').localeCompare(a.timestamp || '')
      )[0];
      latestClimate = { ...c, dateKey: dKey };
    }
  }

  const todayLog = logsByDate[todayKey] || {
    dateKey: todayKey,
    mists: [],
    feedings: [],
    climateChecks: [],
    behaviors: []
  };
  const todayMistCount = (todayLog.mists || []).length;
  const mistTargetHours = Number(settings.mistTargetHours) || 24;
  const isMistDue = !lastMist || lastMist.hoursAgo >= mistTargetHours;

  // 3. Instar duration & projected next molt window
  const latestMolt = molts[0] || null;
  const stageAnchorDateStr = latestMolt?.dateKey || settings.arrivalDate || todayKey;
  const daysInCurrentInstar = Math.max(
    0,
    Math.round(
      (parseLocalDateKey(todayKey).getTime() - parseLocalDateKey(stageAnchorDateStr).getTime()) /
        86400000
    )
  );

  let avgInterMoltDays = Number(settings.typicalInterMoltDays) || 14;
  if (molts.length >= 2) {
    const ascMolts = [...molts].sort((a, b) => (a.dateKey || '').localeCompare(b.dateKey || ''));
    let totalSpan = 0;
    let intervals = 0;
    for (let i = 1; i < ascMolts.length; i++) {
      const diff = Math.round(
        (parseLocalDateKey(ascMolts[i].dateKey).getTime() -
          parseLocalDateKey(ascMolts[i - 1].dateKey).getTime()) /
          86400000
      );
      if (diff > 2 && diff < 90) {
        totalSpan += diff;
        intervals += 1;
      }
    }
    if (intervals > 0) {
      avgInterMoltDays = Math.round(totalSpan / intervals);
    }
  }

  const isAdult = settings.currentInstar === 'Adult';
  const projectedNextMoltDateStr = isAdult
    ? null
    : shiftDateKey(stageAnchorDateStr, avgInterMoltDays);

  // 4. Feeder culture shelf-life alerts
  const enrichedFeeders = feeders
    .filter((f) => f.active !== false)
    .map((f) => {
      const ageDays = Math.max(
        0,
        Math.round(
          (parseLocalDateKey(todayKey).getTime() -
            parseLocalDateKey(f.startedDate || todayKey).getTime()) /
            86400000
        )
      );
      const shelfLifeDays = Number(f.shelfLifeDays) || 28;
      const daysRemaining = shelfLifeDays - ageDays;
      const isAlert = f.status === 'low' || f.status === 'crashed' || daysRemaining <= 5;
      return {
        ...f,
        ageDays,
        shelfLifeDays,
        daysRemaining,
        isAlert
      };
    });

  const feederAlerts = enrichedFeeders.filter((f) => f.isAlert);

  // 5. Enclosure molting clearance rule (Height >= 3x length, Width >= 2x length)
  const bodyLen = Number(settings.enclosureInfo?.currentBodyLengthMm) || 10;
  const encH = Number(settings.enclosureInfo?.enclosureHeightMm) || 110;
  const encW = Number(settings.enclosureInfo?.enclosureWidthMm) || 75;
  const minSafeHeightMm = bodyLen * 3;
  const minSafeWidthMm = bodyLen * 2;
  const isEnclosureTight = encH < minSafeHeightMm || encW < minSafeWidthMm;

  return {
    settings,
    molts,
    feeders: enrichedFeeders,
    feederAlerts,
    effectiveStatus,
    hardeningRemainingLabel,
    isNoFeedLockout,
    lastMist,
    todayMistCount,
    isMistDue,
    lastMeal,
    lastRefusal,
    latestAbdomen,
    latestClimate,
    todayLog,
    latestMolt,
    daysInCurrentInstar,
    avgInterMoltDays,
    projectedNextMoltDateStr,
    isAdult,
    clearance: {
      bodyLen,
      encH,
      encW,
      minSafeHeightMm,
      minSafeWidthMm,
      isEnclosureTight
    }
  };
}

export default function BloomApp({
  activeProfile,
  darkMode,
  bloomSnapshot,
  onGlobalSync,
  showToast
}) {
  const canConfigure = activeProfile?.id !== 'caregiver';
  const activeCaregiver = activeProfile?.caregiverName || activeProfile?.name || 'Partner 1';

  const [now, setNow] = useState(() => new Date());
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'growth' | 'habitat'
  const [localSnapshot, setLocalSnapshot] = useState(bloomSnapshot);

  useEffect(() => {
    setLocalSnapshot(bloomSnapshot);
  }, [bloomSnapshot]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = getLocalDateKey(now);
  const summary = useMemo(
    () => computeBloomSummary(localSnapshot, now),
    [localSnapshot, now]
  );
  const { settings } = summary;

  // --------------------------------------------------------------------------
  // FORM STATES — TODAY TAB
  // --------------------------------------------------------------------------
  const [mistDrinkObserved, setMistDrinkObserved] = useState(false);
  const [mistNoteInput, setMistNoteInput] = useState('');

  const [selectedPrey, setSelectedPrey] = useState('hydei');
  const [preyCount, setPreyCount] = useState(3);
  const [selectedAbdomen, setSelectedAbdomen] = useState('plump');
  const [leavePreyWarning, setLeavePreyWarning] = useState(false);
  const [feedNoteInput, setFeedNoteInput] = useState('');
  const [overrideFeedLockout, setOverrideFeedLockout] = useState(false);
  const [refusalPremoltPrompt, setRefusalPremoltPrompt] = useState(false);

  const [tempInput, setTempInput] = useState('');
  const [humidityInput, setHumidityInput] = useState('');
  const [journalDraft, setJournalDraft] = useState('');

  useEffect(() => {
    setJournalDraft(summary.todayLog?.journalNote || '');
  }, [summary.todayLog?.journalNote, todayKey]);

  // --------------------------------------------------------------------------
  // FORM STATES — MOLT MODAL & GROWTH TAB
  // --------------------------------------------------------------------------
  const [moltModalOpen, setMoltModalOpen] = useState(false);
  const [moltDateInput, setMoltDateInput] = useState(todayKey);
  const [moltFromInput, setMoltFromInput] = useState(settings.currentInstar || 'L2');
  const [moltToInput, setMoltToInput] = useState(() =>
    getSuggestedNextInstar(settings.currentInstar || 'L2', settings.sex)
  );
  const [moltLengthInput, setMoltLengthInput] = useState('');
  const [moltColorInput, setMoltColorInput] = useState('');
  const [moltQualityInput, setMoltQualityInput] = useState('clean');
  const [moltNoteInput, setMoltNoteInput] = useState('');
  const [moltStartHardening, setMoltStartHardening] = useState(true);

  const openLogMoltModal = () => {
    const cur = settings.currentInstar || 'L2';
    setMoltDateInput(todayKey);
    setMoltFromInput(cur);
    setMoltToInput(getSuggestedNextInstar(cur, settings.sex));
    setMoltLengthInput(
      settings.enclosureInfo?.currentBodyLengthMm
        ? String(Math.round(Number(settings.enclosureInfo.currentBodyLengthMm) * 1.35))
        : ''
    );
    setMoltColorInput('');
    setMoltQualityInput('clean');
    setMoltNoteInput('');
    setMoltStartHardening(true);
    setMoltModalOpen(true);
  };

  // --------------------------------------------------------------------------
  // FORM STATES — FEEDERS & ENCLOSURE TAB
  // --------------------------------------------------------------------------
  const [newFeederOpen, setNewFeederOpen] = useState(false);
  const [feederNameInput, setFeederNameInput] = useState('D. hydei Culture #1');
  const [feederTypeInput, setFeederTypeInput] = useState('hydei');
  const [feederStartedInput, setFeederStartedInput] = useState(todayKey);
  const [feederShelfDaysInput, setFeederShelfDaysInput] = useState(28);
  const [feederStatusInput, setFeederStatusInput] = useState('booming');
  const [feederNoteInput, setFeederNoteInput] = useState('');

  const [editingEnclosure, setEditingEnclosure] = useState(false);
  const [enclosureDraft, setEnclosureDraft] = useState(settings.enclosureInfo);

  // --------------------------------------------------------------------------
  // FORM STATES — SETTINGS MODAL
  // --------------------------------------------------------------------------
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState(settings);

  // --------------------------------------------------------------------------
  // API MUTATION HELPERS
  // --------------------------------------------------------------------------
  const notify = (msg, type = 'success') => {
    if (showToast) showToast(msg, type);
  };

  const patchSettings = async (patch, toastMsg = '') => {
    const optimisticSettings = {
      ...settings,
      ...patch,
      enclosureInfo: {
        ...settings.enclosureInfo,
        ...patch.enclosureInfo
      }
    };
    setLocalSnapshot((prev) => ({
      ...prev,
      settings: optimisticSettings
    }));

    try {
      const res = await fetch('/api/bloom/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      if (!res.ok) throw new Error('Failed to save Bloom settings');
      if (toastMsg) notify(toastMsg);
      if (onGlobalSync) onGlobalSync();
    } catch {
      notify('Could not save Bloom settings', 'error');
    }
  };

  const saveDayLog = async (dateKey, nextDayRecord, settingsPatch = null, toastMsg = '') => {
    setLocalSnapshot((prev) => ({
      ...prev,
      ...(settingsPatch
        ? {
            settings: {
              ...prev.settings,
              ...settingsPatch,
              enclosureInfo: {
                ...prev.settings?.enclosureInfo,
                ...settingsPatch.enclosureInfo
              }
            }
          }
        : {}),
      logsByDate: {
        ...prev?.logsByDate,
        [dateKey]: nextDayRecord
      }
    }));

    try {
      const res = await fetch(`/api/bloom/logs/${encodeURIComponent(dateKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          settingsPatch ? { ...nextDayRecord, settingsPatch } : nextDayRecord
        )
      });
      if (!res.ok) throw new Error('Failed to save Bloom log');
      if (toastMsg) notify(toastMsg);
      if (onGlobalSync) onGlobalSync();
    } catch {
      notify('Could not save care log to server', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // HANDLERS — DAILY CARE (MIST, FEED, ABDOMEN, CLIMATE, NOTES)
  // --------------------------------------------------------------------------
  const handleLogMist = async (e) => {
    if (e) e.preventDefault();
    const nowIso = new Date().toISOString();
    const currentDay = summary.todayLog;
    const newMist = {
      id: `mist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      by: activeCaregiver,
      dropletDrinkObserved: mistDrinkObserved,
      note: mistNoteInput.trim()
    };
    const nextBehaviors = mistDrinkObserved
      ? Array.from(new Set([...(currentDay.behaviors || []), 'Drank Droplets']))
      : currentDay.behaviors || [];

    const nextDay = {
      ...currentDay,
      dateKey: todayKey,
      mists: [...(currentDay.mists || []), newMist],
      behaviors: nextBehaviors,
      updatedAt: nowIso
    };

    setMistDrinkObserved(false);
    setMistNoteInput('');
    await saveDayLog(
      todayKey,
      nextDay,
      null,
      `Logged ${settings.mantisName}'s enclosure mist (${activeCaregiver})`
    );
  };

  const handleDeleteMist = async (mistId) => {
    const currentDay = summary.todayLog;
    const nextDay = {
      ...currentDay,
      mists: (currentDay.mists || []).filter((m) => m.id !== mistId),
      updatedAt: new Date().toISOString()
    };
    await saveDayLog(todayKey, nextDay, null, 'Removed mist entry');
  };

  const handleLogFeeding = async (outcome = 'eaten') => {
    const nowIso = new Date().toISOString();
    const currentDay = summary.todayLog;
    const preyMeta = PREY_OPTIONS.find((p) => p.id === selectedPrey) || PREY_OPTIONS[1];
    const entry = {
      id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      by: activeCaregiver,
      outcome, // 'eaten' | 'refused'
      preyId: selectedPrey,
      preyLabel: preyMeta.label,
      count: outcome === 'refused' ? 0 : Math.max(1, Number(preyCount) || 1),
      abdomenAfter: selectedAbdomen,
      note: feedNoteInput.trim()
    };

    const nextDay = {
      ...currentDay,
      dateKey: todayKey,
      feedings: [...(currentDay.feedings || []), entry],
      abdomenStatus: selectedAbdomen,
      updatedAt: nowIso
    };

    const settingsPatch = leavePreyWarning
      ? {
          livePreyInside: true,
          livePreyNote: `${preyMeta.label} offered at ${formatTimeShort(nowIso)} by ${activeCaregiver}`
        }
      : null;

    setFeedNoteInput('');
    setLeavePreyWarning(false);
    setOverrideFeedLockout(false);

    if (outcome === 'refused' && summary.effectiveStatus === 'normal') {
      setRefusalPremoltPrompt(true);
    }

    await saveDayLog(
      todayKey,
      nextDay,
      settingsPatch,
      outcome === 'refused'
        ? `Logged refused meal for ${settings.mantisName}`
        : `Logged ${entry.count}× ${preyMeta.label.split(' (')[0]} for ${settings.mantisName}`
    );
  };

  const handleUpdateAbdomenOnly = async (levelId) => {
    setSelectedAbdomen(levelId);
    const currentDay = summary.todayLog;
    const nextDay = {
      ...currentDay,
      dateKey: todayKey,
      abdomenStatus: levelId,
      updatedAt: new Date().toISOString()
    };
    const meta = ABDOMEN_LEVELS.find((a) => a.id === levelId);
    await saveDayLog(
      todayKey,
      nextDay,
      null,
      `Updated ${settings.mantisName}'s abdomen check: ${meta?.label || levelId}`
    );
  };

  const handleDeleteFeeding = async (feedId) => {
    const currentDay = summary.todayLog;
    const nextDay = {
      ...currentDay,
      feedings: (currentDay.feedings || []).filter((f) => f.id !== feedId),
      updatedAt: new Date().toISOString()
    };
    await saveDayLog(todayKey, nextDay, null, 'Removed feeding entry');
  };

  const handleLogClimate = async (e) => {
    e.preventDefault();
    if (tempInput === '' && humidityInput === '') return;
    const nowIso = new Date().toISOString();
    const currentDay = summary.todayLog;
    const check = {
      id: `clim-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      timestamp: nowIso,
      by: activeCaregiver,
      tempC: tempInput !== '' ? Number(tempInput) : null,
      humidityPct: humidityInput !== '' ? Number(humidityInput) : null
    };
    const nextDay = {
      ...currentDay,
      dateKey: todayKey,
      climateChecks: [...(currentDay.climateChecks || []), check],
      updatedAt: nowIso
    };
    setTempInput('');
    setHumidityInput('');
    await saveDayLog(todayKey, nextDay, null, 'Logged enclosure temperature & humidity');
  };

  const handleToggleBehavior = async (tag) => {
    const currentDay = summary.todayLog;
    const existing = currentDay.behaviors || [];
    const nextBehaviors = existing.includes(tag)
      ? existing.filter((b) => b !== tag)
      : [...existing, tag];
    const nextDay = {
      ...currentDay,
      dateKey: todayKey,
      behaviors: nextBehaviors,
      updatedAt: new Date().toISOString()
    };
    await saveDayLog(todayKey, nextDay);
  };

  const handleSaveJournalNote = async (e) => {
    e.preventDefault();
    const currentDay = summary.todayLog;
    const nextDay = {
      ...currentDay,
      dateKey: todayKey,
      journalNote: journalDraft.trim(),
      updatedAt: new Date().toISOString()
    };
    await saveDayLog(todayKey, nextDay, null, `Saved ${settings.mantisName}'s daily note`);
  };

  // --------------------------------------------------------------------------
  // HANDLERS — LIFECYCLE & MOLTS
  // --------------------------------------------------------------------------
  const handleTogglePremolt = async (enable) => {
    setRefusalPremoltPrompt(false);
    if (enable) {
      await patchSettings(
        {
          lifecycleStatus: 'premolt',
          premoltStartedAt: new Date().toISOString(),
          hardeningUntil: null
        },
        `Premolt Watch enabled — live prey locked out for ${settings.mantisName}`
      );
    } else {
      await patchSettings(
        {
          lifecycleStatus: 'normal',
          premoltStartedAt: null,
          hardeningUntil: null
        },
        `${settings.mantisName} returned to normal hunting mode`
      );
    }
  };

  const handleSubmitMolt = async (e) => {
    e.preventDefault();
    const isTodayMolt = moltDateInput === todayKey;
    const shouldStartHardening = moltStartHardening && isTodayMolt;

    try {
      const res = await fetch('/api/bloom/molts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateKey: moltDateInput || todayKey,
          fromInstar: moltFromInput,
          toInstar: moltToInput,
          lengthMm: moltLengthInput ? Number(moltLengthInput) : null,
          colorShift: moltColorInput.trim(),
          quality: moltQualityInput,
          loggedBy: activeCaregiver,
          note: moltNoteInput.trim(),
          advanceInstar: true,
          startHardening: shouldStartHardening
        })
      });
      if (!res.ok) throw new Error('Failed to log molt');
      const data = await res.json();
      setLocalSnapshot((prev) => ({
        ...prev,
        molts: data.molts || prev.molts,
        settings: data.settings || prev.settings
      }));
      setMoltModalOpen(false);
      setRefusalPremoltPrompt(false);
      notify(
        `🎉 ${settings.mantisName} molted from ${moltFromInput} to ${moltToInput}!${
          shouldStartHardening ? ` (${settings.hardeningHours}h hardening timer started)` : ''
        }`
      );
      if (onGlobalSync) onGlobalSync();
    } catch {
      notify('Could not save molt milestone', 'error');
    }
  };

  const handleDeleteMolt = async (moltId) => {
    try {
      const res = await fetch(`/api/bloom/molts/${encodeURIComponent(moltId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete molt');
      const data = await res.json();
      setLocalSnapshot((prev) => ({
        ...prev,
        molts: data.molts || []
      }));
      notify('Removed molt record');
      if (onGlobalSync) onGlobalSync();
    } catch {
      notify('Could not delete molt record', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // HANDLERS — FEEDER CULTURES & ENCLOSURE
  // --------------------------------------------------------------------------
  const handleAddFeederCulture = async (e) => {
    e.preventDefault();
    if (!feederNameInput.trim()) return;
    const id = `feeder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      const res = await fetch(`/api/bloom/feeders/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: feederNameInput.trim(),
          feederType: feederTypeInput,
          startedDate: feederStartedInput || todayKey,
          shelfLifeDays: Number(feederShelfDaysInput) || 28,
          status: feederStatusInput,
          storageNote: feederNoteInput.trim(),
          active: true
        })
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setLocalSnapshot((prev) => ({ ...prev, feeders: data.feeders || [] }));
      setNewFeederOpen(false);
      setFeederNoteInput('');
      notify(`Added feeder culture "${feederNameInput.trim()}"`);
      if (onGlobalSync) onGlobalSync();
    } catch {
      notify('Could not save feeder culture', 'error');
    }
  };

  const handleUpdateFeederStatus = async (feeder, nextStatus) => {
    try {
      const res = await fetch(`/api/bloom/feeders/${encodeURIComponent(feeder.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...feeder, status: nextStatus })
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setLocalSnapshot((prev) => ({ ...prev, feeders: data.feeders || [] }));
      notify(`Updated "${feeder.name}" to ${nextStatus}`);
      if (onGlobalSync) onGlobalSync();
    } catch {
      notify('Could not update feeder culture', 'error');
    }
  };

  const handleDeleteFeeder = async (feederId) => {
    try {
      const res = await fetch(`/api/bloom/feeders/${encodeURIComponent(feederId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setLocalSnapshot((prev) => ({ ...prev, feeders: data.feeders || [] }));
      notify('Removed feeder culture');
      if (onGlobalSync) onGlobalSync();
    } catch {
      notify('Could not remove feeder culture', 'error');
    }
  };

  const handleSaveEnclosure = async (e) => {
    e.preventDefault();
    await patchSettings(
      {
        enclosureInfo: {
          ...enclosureDraft,
          currentBodyLengthMm: Number(enclosureDraft.currentBodyLengthMm) || 10,
          enclosureHeightMm: Number(enclosureDraft.enclosureHeightMm) || 110,
          enclosureWidthMm: Number(enclosureDraft.enclosureWidthMm) || 75
        }
      },
      `Updated ${settings.mantisName}'s enclosure specs`
    );
    setEditingEnclosure(false);
  };

  const handleSaveFullSettings = async (e) => {
    e.preventDefault();
    await patchSettings(
      {
        ...settingsForm,
        dayTempMinC: Number(settingsForm.dayTempMinC) || 25,
        dayTempMaxC: Number(settingsForm.dayTempMaxC) || 28,
        nightTempMinC: Number(settingsForm.nightTempMinC) || 20,
        humidityMinPct: Number(settingsForm.humidityMinPct) || 50,
        humidityMaxPct: Number(settingsForm.humidityMaxPct) || 65,
        mistTargetHours: Number(settingsForm.mistTargetHours) || 24,
        hardeningHours: Number(settingsForm.hardeningHours) || 36,
        typicalInterMoltDays: Number(settingsForm.typicalInterMoltDays) || 14
      },
      `Saved ${settingsForm.mantisName || 'Mantis'}'s Bloom settings`
    );
    setSettingsModalOpen(false);
  };

  // Recent 7 days with any activity
  const recentLogDates = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const dKey = shiftDateKey(todayKey, -i);
      const rec = localSnapshot?.logsByDate?.[dKey];
      if (
        rec &&
        ((rec.mists && rec.mists.length > 0) ||
          (rec.feedings && rec.feedings.length > 0) ||
          (rec.climateChecks && rec.climateChecks.length > 0) ||
          (rec.behaviors && rec.behaviors.length > 0) ||
          rec.journalNote)
      ) {
        days.push({ dateKey: dKey, rec });
      }
    }
    return days;
  }, [localSnapshot?.logsByDate, todayKey]);

  // Recommended feeder stage guide based on currentInstar
  const instarFeederTip = useMemo(() => {
    const st = settings.currentInstar;
    if (st === 'L1' || st === 'L2') {
      return 'Nymph L1–L2: Flightless D. melanogaster or small D. hydei fruit flies (2–4 flies every 1–2 days until abdomen is plump).';
    }
    if (st === 'L3' || st === 'L4') {
      return 'Nymph L3–L4: D. hydei fruit flies, pinhead/hatchling locusts, or first small curly-wing flies.';
    }
    return 'Older Nymph / Adult (L5+): Curly-wing flies, greenbottle/bluebottle flies, and small waxmoths—Spiny Flower Mantises thrive on flying prey!';
  }, [settings.currentInstar]);

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      {/* ====================================================================
          1. BLOOM HERO HEADER & SUB-VIEW NAVIGATION
      ==================================================================== */}
      <section
        className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-lime-500 via-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-xs shrink-0">
              <Flower2 className="w-6 h-6" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
                  Bloom • {settings.mantisName}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-lime-500/15 text-lime-700 dark:text-lime-300 border border-lime-500/30">
                  {settings.currentInstar} {summary.isAdult ? 'Winged Adult' : 'Nymph'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {settings.sex === 'Male' ? '♂ Male' : settings.sex === 'Female' ? '♀ Female' : 'Unsexed'}
                </span>
                {summary.effectiveStatus === 'premolt' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-amber-500 text-slate-950">
                    ⚠️ Premolt Watch
                  </span>
                )}
                {summary.effectiveStatus === 'hardening' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-fuchsia-600 text-white">
                    🛡️ Hardening ({summary.hardeningRemainingLabel})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {settings.commonName} (<em className="italic">{settings.scientificName}</em>)
                {settings.currentColorMorph ? ` • ${settings.currentColorMorph}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Internal Sub-Tabs */}
            <div
              className={`inline-flex items-center p-1 rounded-2xl border ${
                darkMode
                  ? 'bg-slate-950/70 border-slate-800'
                  : 'bg-slate-100/90 border-slate-200/80'
              }`}
            >
              {[
                { id: 'today', label: 'Habitat & Today', icon: Droplets },
                {
                  id: 'growth',
                  label: 'Growth & Molts',
                  icon: Sparkles,
                  badge: summary.molts.length || null
                },
                {
                  id: 'habitat',
                  label: 'Feeders & Enclosure',
                  icon: Bug,
                  alert: summary.feederAlerts.length > 0 || summary.clearance.isEnclosureTight
                }
              ].map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      active
                        ? 'bg-lime-600 text-white shadow-xs'
                        : darkMode
                          ? 'text-slate-300 hover:bg-slate-800'
                          : 'text-slate-600 hover:bg-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                    {t.badge && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                          active ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                    {t.alert && (
                      <span className="w-2 h-2 rounded-full bg-amber-400" title="Needs attention" />
                    )}
                  </button>
                );
              })}
            </div>

            {canConfigure && (
              <button
                type="button"
                onClick={() => {
                  setSettingsForm(settings);
                  setSettingsModalOpen(true);
                }}
                className={`p-2 sm:px-3 sm:py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
                title={`Configure ${settings.mantisName}'s Species & Care Settings`}
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}
          </div>
        </div>

        {/* Caregiver Quick Instruction Strip */}
        {settings.careNote && (
          <div
            className={`p-3 rounded-2xl border text-xs flex items-start gap-2.5 ${
              darkMode
                ? 'bg-slate-800/40 border-slate-800 text-slate-300'
                : 'bg-lime-50/60 border-lime-200/80 text-slate-700'
            }`}
          >
            <Info className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{settings.careNote}</p>
          </div>
        )}
      </section>

      {/* ====================================================================
          2. CRITICAL SAFETY BANNERS (UNEATEN PREY, PREMOLT, POST-MOLT HARDENING)
      ==================================================================== */}
      {settings.livePreyInside && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-rose-500/10 border-rose-500/40 text-rose-950 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold">
                Uneaten Live Prey Still Inside {settings.mantisName}&apos;s Enclosure
              </h2>
              <p className="text-xs opacity-90">
                {settings.livePreyNote || 'Live feeder left inside.'} Remove roaming locusts/flies before lights-out or if {settings.mantisName} hangs to molt.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              patchSettings(
                { livePreyInside: false, livePreyNote: '' },
                `Marked ${settings.mantisName}'s enclosure clear of live prey`
              )
            }
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shrink-0 cursor-pointer"
          >
            ✓ Prey Eaten / Removed
          </button>
        </section>
      )}

      {summary.effectiveStatus === 'premolt' && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-amber-500/15 border-amber-500/50 text-amber-950 dark:text-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm sm:text-base font-extrabold">
                Premolt Watch Active — Do NOT Offer Live Prey
              </h2>
              <p className="text-xs opacity-90 leading-relaxed">
                {settings.mantisName} is preparing to shed {settings.currentInstar}. Remove any remaining feeders, mist the side wall lightly to maintain ~60–68% RH, and avoid bumping or opening the mesh lid while hanging.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openLogMoltModal}
              className="px-4 py-2.5 rounded-xl bg-lime-600 hover:bg-lime-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>🎉 {settings.mantisName} Molted!</span>
            </button>
            <button
              type="button"
              onClick={() => handleTogglePremolt(false)}
              className="px-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-800 text-xs font-bold border border-amber-500/40 cursor-pointer"
            >
              Exit Premolt
            </button>
          </div>
        </section>
      )}

      {summary.effectiveStatus === 'hardening' && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-fuchsia-500/10 border-fuchsia-500/40 text-fuchsia-950 dark:text-fuchsia-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-fuchsia-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm sm:text-base font-extrabold">
                Post-Molt Exoskeleton Hardening ({summary.hardeningRemainingLabel} remaining)
              </h2>
              <p className="text-xs opacity-90 leading-relaxed">
                {settings.mantisName}&apos;s fresh {settings.currentInstar} cuticle and raptorial forelegs are still soft. Hold off on live feeders until the cooldown finishes—gentle wall misting for drinking water is safe.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              patchSettings(
                { lifecycleStatus: 'normal', hardeningUntil: null },
                `Ended post-molt cooldown for ${settings.mantisName}`
              )
            }
            className="px-3.5 py-2 rounded-xl bg-fuchsia-600/20 hover:bg-fuchsia-600/30 border border-fuchsia-500/40 text-xs font-bold shrink-0 cursor-pointer"
          >
            Mark Ready Early
          </button>
        </section>
      )}

      {summary.effectiveStatus === 'hardened_ready' && (
        <section className="rounded-2xl sm:rounded-3xl p-4 border bg-emerald-500/10 border-emerald-500/40 text-emerald-950 dark:text-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="text-xs">
              <div className="font-extrabold text-sm">
                ✨ {settings.mantisName}&apos;s {settings.currentInstar} Exoskeleton Has Hardened!
              </div>
              <p className="opacity-85">
                Post-molt cooldown is complete—safe to offer {settings.mantisName} his first {settings.currentInstar} meal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              patchSettings(
                { lifecycleStatus: 'normal', hardeningUntil: null },
                `${settings.mantisName} is back in active hunting mode`
              )
            }
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 cursor-pointer"
          >
            Resume Hunting Mode
          </button>
        </section>
      )}

      {refusalPremoltPrompt && summary.effectiveStatus === 'normal' && (
        <section className="rounded-2xl p-3.5 border bg-amber-500/10 border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div>
            <strong>{settings.mantisName} refused prey!</strong> Refusing food is the #1 early sign of Premolt in Spiny Flower nymphs. Switch on Premolt Watch?
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleTogglePremolt(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-extrabold cursor-pointer"
            >
              Enable Premolt Watch
            </button>
            <button
              type="button"
              onClick={() => setRefusalPremoltPrompt(false)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 font-semibold cursor-pointer"
            >
              Not Yet
            </button>
          </div>
        </section>
      )}

      {/* ====================================================================
          TAB 1: HABITAT & TODAY (DAILY CARE, MISTING, FEEDING, CLIMATE)
      ==================================================================== */}
      {activeTab === 'today' && (
        <div className="space-y-4 sm:space-y-5">
          {/* Quick Status Metrics Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div
              className={`p-3.5 rounded-2xl border ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-60">
                Stage &amp; Molt Clock
              </div>
              <div className="text-base font-extrabold mt-0.5 text-lime-600 dark:text-lime-400">
                {settings.currentInstar} • Day {summary.daysInCurrentInstar}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {summary.isAdult
                  ? 'Winged Adult (final molt complete)'
                  : `Est. molt ~${formatFriendlyDate(summary.projectedNextMoltDateStr, todayKey)}`}
              </div>
            </div>

            <div
              className={`p-3.5 rounded-2xl border ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-60">
                Hydration / Mist
              </div>
              <div className="text-base font-extrabold mt-0.5 text-sky-600 dark:text-sky-400">
                {summary.lastMist ? summary.lastMist.timeAgoLabel : 'No mists yet'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {summary.lastMist
                  ? `By ${summary.lastMist.by} (${summary.todayMistCount} today)`
                  : `Target: every ~${settings.mistTargetHours}h`}
              </div>
            </div>

            <div
              className={`p-3.5 rounded-2xl border ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-60">
                Feeding &amp; Abdomen
              </div>
              <div className="text-base font-extrabold mt-0.5 text-emerald-600 dark:text-emerald-400">
                {summary.lastMeal ? summary.lastMeal.friendlyWhen : 'Not logged yet'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 capitalize">
                Abdomen: {summary.latestAbdomen || 'Unchecked'}
              </div>
            </div>

            <div
              className={`p-3.5 rounded-2xl border flex flex-col justify-between ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-wider opacity-60">
                Lifecycle Actions
              </div>
              <div className="flex items-center gap-1.5 pt-1.5">
                {summary.effectiveStatus !== 'premolt' && !summary.isAdult && (
                  <button
                    type="button"
                    onClick={() => handleTogglePremolt(true)}
                    className="flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 cursor-pointer"
                  >
                    Premolt
                  </button>
                )}
                <button
                  type="button"
                  onClick={openLogMoltModal}
                  className="flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold bg-lime-600 hover:bg-lime-700 text-white cursor-pointer"
                >
                  + Log Molt
                </button>
              </div>
            </div>
          </div>

          {/* Primary 2-Column Care Cards: Misting & Feeding */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {/* CARD A: MISTING & HYDRATION */}
            <section
              className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between space-y-4 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                      <Droplets className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-extrabold">Misting &amp; Drinking Droplets</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Mist wall lightly (~{settings.humidityMinPct}–{settings.humidityMaxPct}% RH) &amp; let dry between sprays
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                      summary.isMistDue
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {summary.isMistDue ? 'Mist Due' : 'Misted Recently'}
                  </span>
                </div>

                {/* Anti-double-mist banner */}
                <div
                  className={`p-3.5 rounded-2xl border text-xs ${
                    summary.todayMistCount > 0
                      ? darkMode
                        ? 'bg-emerald-950/30 border-emerald-800/70 text-emerald-200'
                        : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                      : darkMode
                        ? 'bg-slate-800/60 border-slate-700'
                        : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  {summary.lastMist ? (
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        Last misted <strong>{summary.lastMist.timeAgoLabel}</strong> by{' '}
                        <strong>{summary.lastMist.by}</strong>
                        {summary.lastMist.dropletDrinkObserved ? ' • 💧 Drank droplets!' : ''}
                      </span>
                      <span className="font-mono text-[11px] opacity-75">
                        {formatTimeShort(summary.lastMist.timestamp)}
                      </span>
                    </div>
                  ) : (
                    <span>No enclosure mists recorded yet today.</span>
                  )}
                </div>

                <form onSubmit={handleLogMist} className="space-y-3">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={mistDrinkObserved}
                      onChange={(e) => setMistDrinkObserved(e.target.checked)}
                      className="rounded accent-sky-600 w-4 h-4"
                    />
                    <span>💧 Spotted {settings.mantisName} drinking wall droplets</span>
                  </label>

                  <input
                    type="text"
                    value={mistNoteInput}
                    onChange={(e) => setMistNoteInput(e.target.value)}
                    placeholder="Optional mist note (e.g., extra wall spray for premolt)..."
                    className="w-full px-3.5 py-2 rounded-xl text-xs border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />

                  <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-teal-600 hover:from-sky-700 hover:to-teal-700 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition"
                  >
                    <Droplets className="w-4 h-4" />
                    <span>Log Enclosure Mist ({activeCaregiver})</span>
                  </button>
                </form>
              </div>

              {/* Today's mists list */}
              {(summary.todayLog.mists || []).length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-bold uppercase opacity-60">
                    Today&apos;s Mists ({summary.todayLog.mists.length})
                  </div>
                  {summary.todayLog.mists.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between text-xs py-1 px-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50"
                    >
                      <span>
                        <strong>{formatTimeShort(m.timestamp)}</strong> • {m.by}
                        {m.dropletDrinkObserved ? ' • 💧 Drank' : ''}
                        {m.note ? ` — "${m.note}"` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteMist(m.id)}
                        className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer"
                        title="Undo mist log"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* CARD B: FEEDING & ABDOMEN ("BOOTY") GAUGE */}
            <section
              className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between space-y-4 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-lime-500/15 text-lime-600 dark:text-lime-400 flex items-center justify-center">
                      <Bug className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-extrabold">Feeding &amp; Abdomen Plumpness</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Feed by abdomen roundness rather than a rigid clock
                      </p>
                    </div>
                  </div>
                </div>

                {/* 4-Step Abdomen Gauge */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold opacity-75">
                      {settings.mantisName}&apos;s Abdomen (&ldquo;Booty&rdquo;) Check:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateAbdomenOnly(selectedAbdomen)}
                      className="text-[11px] font-bold text-lime-600 dark:text-lime-400 hover:underline cursor-pointer"
                    >
                      Save Check Only
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {ABDOMEN_LEVELS.map((lvl) => {
                      const isSel = selectedAbdomen === lvl.id;
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => setSelectedAbdomen(lvl.id)}
                          className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                            isSel ? lvl.activeClass : lvl.pillClass
                          }`}
                        >
                          <div className="text-xs font-extrabold">{lvl.label}</div>
                          <div className="text-[10px] opacity-85 truncate">{lvl.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Safety lockout guard during Premolt / Post-Molt Hardening */}
                {summary.isNoFeedLockout && !overrideFeedLockout ? (
                  <div className="p-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 space-y-2.5 text-xs">
                    <div className="font-extrabold flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>
                        Feeding Locked ({summary.effectiveStatus === 'premolt' ? 'Premolt Watch' : 'Post-Molt Hardening'})
                      </span>
                    </div>
                    <p className="opacity-85 leading-relaxed">
                      Live feeders can disturb a molting nymph or injure soft new raptorial legs. Wait until hardening completes before offering prey.
                    </p>
                    <button
                      type="button"
                      onClick={() => setOverrideFeedLockout(true)}
                      className="text-[11px] font-bold underline opacity-75 hover:opacity-100 cursor-pointer"
                    >
                      Override &amp; log a feeding anyway
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold uppercase opacity-60 mb-1">
                          Feeder Prey
                        </label>
                        <select
                          value={selectedPrey}
                          onChange={(e) => setSelectedPrey(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl text-xs font-semibold border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                        >
                          {PREY_OPTIONS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label} ({p.stages})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase opacity-60 mb-1">
                          Count
                        </label>
                        <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setPreyCount((c) => Math.max(1, c - 1))}
                            className="px-2.5 py-2 text-xs font-extrabold bg-slate-100 dark:bg-slate-800 cursor-pointer"
                          >
                            -
                          </button>
                          <span className="flex-1 text-center text-xs font-extrabold">
                            {preyCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPreyCount((c) => Math.min(25, c + 1))}
                            className="px-2.5 py-2 text-xs font-extrabold bg-slate-100 dark:bg-slate-800 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={leavePreyWarning}
                        onChange={(e) => setLeavePreyWarning(e.target.checked)}
                        className="rounded accent-rose-600 w-4 h-4"
                      />
                      <span>Uneaten live prey still inside enclosure (set removal reminder)</span>
                    </label>

                    <input
                      type="text"
                      value={feedNoteInput}
                      onChange={(e) => setFeedNoteInput(e.target.value)}
                      placeholder="Optional feeding note (e.g., tong-fed, struck mid-air!)..."
                      className="w-full px-3.5 py-2 rounded-xl text-xs border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                    />

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleLogFeeding('eaten')}
                        className="col-span-2 py-3 px-3 rounded-xl bg-gradient-to-r from-lime-600 to-emerald-600 hover:from-lime-700 hover:to-emerald-700 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Log Meal Eaten</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLogFeeding('refused')}
                        className={`py-3 px-2.5 rounded-xl border font-bold text-xs cursor-pointer ${
                          darkMode
                            ? 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700'
                            : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                        }`}
                        title="Log prey refusal (common before molting)"
                      >
                        Refused Prey
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Today's feedings list */}
              {(summary.todayLog.feedings || []).length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-bold uppercase opacity-60">
                    Today&apos;s Feedings ({summary.todayLog.feedings.length})
                  </div>
                  {summary.todayLog.feedings.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between text-xs py-1 px-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50"
                    >
                      <span>
                        <strong>{formatTimeShort(f.timestamp)}</strong> •{' '}
                        {f.outcome === 'refused' ? (
                          <span className="text-amber-600 dark:text-amber-400 font-bold">
                            Refused {f.preyLabel?.split(' (')[0]}
                          </span>
                        ) : (
                          <span>
                            Ate <strong>{f.count}×</strong> {f.preyLabel?.split(' (')[0]}
                          </span>
                        )}{' '}
                        ({f.by})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteFeeding(f.id)}
                        className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer"
                        title="Remove feeding log"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Secondary Row: Micro-Climate Check + Daily Observations & 7-Day History */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
            {/* Micro-Climate Check (5 cols) */}
            <section
              className={`lg:col-span-5 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3.5 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Thermometer className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold">Enclosure Temp &amp; Humidity</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Target: {settings.dayTempMinC}–{settings.dayTempMaxC}°C day •{' '}
                      {settings.humidityMinPct}–{settings.humidityMaxPct}% RH
                    </p>
                  </div>
                </div>
              </div>

              {summary.latestClimate && (
                <div
                  className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${
                    darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <span>
                    Latest:{' '}
                    {summary.latestClimate.tempC != null && (
                      <strong>{summary.latestClimate.tempC}°C </strong>
                    )}
                    {summary.latestClimate.humidityPct != null && (
                      <strong>• {summary.latestClimate.humidityPct}% RH</strong>
                    )}
                  </span>
                  <span className="text-[11px] opacity-70">
                    {formatFriendlyDate(summary.latestClimate.dateKey, todayKey)}{' '}
                    {formatTimeShort(summary.latestClimate.timestamp)}
                  </span>
                </div>
              )}

              <form onSubmit={handleLogClimate} className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  step="0.5"
                  value={tempInput}
                  onChange={(e) => setTempInput(e.target.value)}
                  placeholder="Temp °C"
                  className="px-3 py-2 rounded-xl text-xs border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
                <input
                  type="number"
                  step="1"
                  value={humidityInput}
                  onChange={(e) => setHumidityInput(e.target.value)}
                  placeholder="RH %"
                  className="px-3 py-2 rounded-xl text-xs border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-lime-600 text-white text-xs font-bold cursor-pointer"
                >
                  Log Check
                </button>
              </form>
            </section>

            {/* Behaviour Tags & Journal Note (7 cols) */}
            <section
              className={`lg:col-span-7 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3.5 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                <h3 className="text-sm font-extrabold">
                  {settings.mantisName}&apos;s Behaviours &amp; Daily Observation
                </h3>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {BEHAVIOR_TAGS.map((tag) => {
                  const active = (summary.todayLog.behaviors || []).includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleBehavior(tag)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        active
                          ? 'bg-lime-600 text-white border-lime-700'
                          : darkMode
                            ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              <form onSubmit={handleSaveJournalNote} className="flex gap-2">
                <input
                  type="text"
                  value={journalDraft}
                  onChange={(e) => setJournalDraft(e.target.value)}
                  placeholder={`Quick observation about ${settings.mantisName} today...`}
                  className="flex-1 px-3.5 py-2 rounded-xl text-xs border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-lime-600 hover:bg-lime-700 text-white text-xs font-bold cursor-pointer shrink-0"
                >
                  Save Note
                </button>
              </form>
            </section>
          </div>

          {/* Recent 7-Day Care Activity Strip */}
          {recentLogDates.length > 0 && (
            <section
              className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-extrabold">
                <History className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                <span>Recent 7-Day Care History</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                {recentLogDates.map(({ dateKey, rec }) => (
                  <div
                    key={dateKey}
                    className={`p-3 rounded-2xl border space-y-1 ${
                      darkMode
                        ? 'bg-slate-800/40 border-slate-800'
                        : 'bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>{formatFriendlyDate(dateKey, todayKey)}</span>
                      <span className="text-[10px] font-mono opacity-60">{dateKey}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {(rec.mists || []).length > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold">
                          💧 {rec.mists.length} mist{rec.mists.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {(rec.feedings || []).map((f) => (
                        <span
                          key={f.id}
                          className={`px-2 py-0.5 rounded-md font-semibold ${
                            f.outcome === 'refused'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'bg-lime-500/15 text-lime-700 dark:text-lime-300'
                          }`}
                        >
                          {f.outcome === 'refused'
                            ? '✗ Refused prey'
                            : `🪰 ${f.count}× ${f.preyLabel?.split(' (')[0]}`}
                        </span>
                      ))}
                      {rec.abdomenStatus && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 capitalize">
                          Abdomen: {rec.abdomenStatus}
                        </span>
                      )}
                    </div>
                    {rec.journalNote && (
                      <p className="text-[11px] opacity-80 italic pt-0.5">&ldquo;{rec.journalNote}&rdquo;</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 2: GROWTH & MOLTS (INSTAR LADDER, MOLT TIMELINE, SPECIES GUIDE)
      ==================================================================== */}
      {activeTab === 'growth' && (
        <div className="space-y-4 sm:space-y-5">
          {/* Visual Instar Progression Ladder */}
          <section
            className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-extrabold">
                  {settings.mantisName}&apos;s Instar Progression
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Day {summary.daysInCurrentInstar} in {settings.currentInstar} • Avg inter-molt cadence: ~{summary.avgInterMoltDays} days
                  {summary.projectedNextMoltDateStr
                    ? ` • Next molt window around ${summary.projectedNextMoltDateStr}`
                    : ' • Final winged adult stage reached!'}
                </p>
              </div>
              <button
                type="button"
                onClick={openLogMoltModal}
                className="px-4 py-2.5 rounded-xl bg-lime-600 hover:bg-lime-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                <span>Log New Molt</span>
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
              {INSTAR_STAGES.map((stage, idx) => {
                const currentIdx = INSTAR_STAGES.indexOf(settings.currentInstar);
                const isCurrent = stage === settings.currentInstar;
                const isPassed = currentIdx !== -1 && idx < currentIdx;
                return (
                  <div
                    key={stage}
                    className={`p-2.5 rounded-2xl border text-center transition ${
                      isCurrent
                        ? 'bg-lime-600 text-white border-lime-700 ring-2 ring-lime-500/40 font-extrabold'
                        : isPassed
                          ? darkMode
                            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300 font-bold'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold'
                          : darkMode
                            ? 'bg-slate-800/40 border-slate-800 text-slate-500'
                            : 'bg-slate-50 border-slate-200/70 text-slate-400'
                    }`}
                  >
                    <div className="text-xs">{stage}</div>
                    <div className="text-[10px] opacity-80 mt-0.5">
                      {isCurrent ? 'Current' : isPassed ? '✓ Shed' : stage === 'Adult' ? 'Winged' : 'Upcoming'}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
            {/* Molt Milestones History (8 cols) */}
            <section
              className={`lg:col-span-8 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3.5 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <h3 className="text-base font-extrabold">
                Recorded Molts &amp; Growth Milestones ({summary.molts.length})
              </h3>

              {summary.molts.length === 0 ? (
                <div className="py-8 text-center space-y-2 text-xs text-slate-500">
                  <p>No molts logged yet for {settings.mantisName}.</p>
                  <p>
                    When {settings.mantisName} sheds his exuvia, click <strong>Log New Molt</strong> to advance his instar and start the post-molt hardening timer!
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {summary.molts.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 ${
                        darkMode
                          ? 'bg-slate-800/50 border-slate-700'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-lime-600 text-white">
                            {m.fromInstar} &rarr; {m.toInstar}
                          </span>
                          <span className="text-xs font-bold">
                            {formatFriendlyDate(m.dateKey, todayKey)} ({m.dateKey})
                          </span>
                          {m.lengthMm && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-teal-500/15 text-teal-700 dark:text-teal-300">
                              📏 {m.lengthMm} mm
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              m.quality === 'clean'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {m.quality === 'clean'
                              ? 'Clean Exuvia'
                              : m.quality === 'minor_issue'
                                ? 'Minor Snag'
                                : 'Mismolt Note'}
                          </span>
                        </div>
                        {m.colorShift && (
                          <div className="text-xs text-fuchsia-700 dark:text-fuchsia-300 font-semibold">
                            🎨 Colour/Pattern: {m.colorShift}
                          </div>
                        )}
                        {m.note && <p className="text-xs opacity-80">{m.note}</p>}
                        <div className="text-[11px] opacity-60">Logged by {m.loggedBy}</div>
                      </div>

                      {canConfigure && (
                        <button
                          type="button"
                          onClick={() => handleDeleteMolt(m.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                          title="Delete molt record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Spiny Flower Reference Card (4 cols) */}
            <section
              className={`lg:col-span-4 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3 text-xs ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="font-extrabold text-sm flex items-center gap-1.5 text-lime-600 dark:text-lime-400">
                <Flower2 className="w-4 h-4" />
                <span>Spiny Flower Keeper Notes</span>
              </div>
              <div className="space-y-2.5 leading-relaxed opacity-90">
                <p>
                  <strong>Male Growth Path:</strong> Male <em>P. wahlbergii</em> typically mature in <strong>6–7 molts</strong> (one molt quicker than females), developing long antennae, agile flight wings, and the signature orange/black/white spiral &ldquo;9&rdquo; eye-spot!
                </p>
                <p>
                  <strong>Counting Segments (L4+):</strong> Males show <strong>8</strong> underside abdominal segments (ending in a slimmer terminal segment), whereas females show <strong>6</strong> broader segments and a larger spiny sub-adult pronotum.
                </p>
                <p>
                  <strong>Molt Clearance:</strong> Always ensure at least <strong>3× body length</strong> of unobstructed vertical drop beneath the soft mesh lid so {settings.mantisName} can slide cleanly out of his old skin.
                </p>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 3: FEEDERS & ENCLOSURE (CULTURE SHELF-LIFE & CLEARANCE CALCULATOR)
      ==================================================================== */}
      {activeTab === 'habitat' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Live Feeder Colony Tracker (7 cols) */}
          <section
            className={`lg:col-span-7 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold">Live Feeder Stash &amp; Cultures</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Track fruit fly pots &amp; casters so you never get caught by a culture crash
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewFeederOpen(!newFeederOpen)}
                className="px-3 py-2 rounded-xl bg-lime-600 hover:bg-lime-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Culture</span>
              </button>
            </div>

            <div
              className={`p-3 rounded-2xl border text-xs ${
                darkMode
                  ? 'bg-slate-800/50 border-slate-700 text-lime-200'
                  : 'bg-lime-50/70 border-lime-200 text-lime-950'
              }`}
            >
              <strong>{settings.currentInstar} Sizing Tip:</strong> {instarFeederTip}
            </div>

            {newFeederOpen && (
              <form
                onSubmit={handleAddFeederCulture}
                className={`p-4 rounded-2xl border space-y-3 ${
                  darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="text-xs font-extrabold">Add Active Feeder Culture / Tub</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <select
                    value={feederTypeInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFeederTypeInput(val);
                      const preset = FEEDER_CULTURE_TYPES.find((t) => t.id === val);
                      if (preset) {
                        setFeederNameInput(preset.label);
                        setFeederShelfDaysInput(preset.defaultDays);
                      }
                    }}
                    className="px-3 py-2 rounded-xl text-xs border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  >
                    {FEEDER_CULTURE_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={feederNameInput}
                    onChange={(e) => setFeederNameInput(e.target.value)}
                    placeholder="Label (e.g., Hydei Pot #2)"
                    className="px-3 py-2 rounded-xl text-xs border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                  <div>
                    <label className="block text-[10px] font-bold uppercase opacity-60 mb-0.5">
                      Started / Arrived Date
                    </label>
                    <input
                      type="date"
                      value={feederStartedInput}
                      onChange={(e) => setFeederStartedInput(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl text-xs border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase opacity-60 mb-0.5">
                      Est. Lifespan (Days)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="90"
                      value={feederShelfDaysInput}
                      onChange={(e) => setFeederShelfDaysInput(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl text-xs border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <select
                    value={feederStatusInput}
                    onChange={(e) => setFeederStatusInput(e.target.value)}
                    className="px-3 py-2 rounded-xl text-xs border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  >
                    <option value="warming_up">Status: Warming Up (Fresh)</option>
                    <option value="booming">Status: Booming</option>
                    <option value="low">Status: Running Low</option>
                  </select>
                  <input
                    type="text"
                    value={feederNoteInput}
                    onChange={(e) => setFeederNoteInput(e.target.value)}
                    placeholder="Storage note (e.g., Top shelf)..."
                    className="px-3 py-2 rounded-xl text-xs border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNewFeederOpen(false)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-200/70 dark:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl text-xs font-bold bg-lime-600 text-white cursor-pointer"
                  >
                    Save Culture
                  </button>
                </div>
              </form>
            )}

            {summary.feeders.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                No active feeder cultures tracked yet. Add your fruit fly pots or fly casters above!
              </p>
            ) : (
              <div className="space-y-3">
                {summary.feeders.map((f) => {
                  const pct = Math.min(100, Math.max(5, Math.round((f.ageDays / f.shelfLifeDays) * 100)));
                  return (
                    <div
                      key={f.id}
                      className={`p-3.5 rounded-2xl border space-y-2.5 text-xs ${
                        f.isAlert
                          ? 'bg-amber-500/10 border-amber-500/40'
                          : darkMode
                            ? 'bg-slate-800/50 border-slate-700'
                            : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-extrabold text-sm">{f.name}</div>
                          <div className="text-[11px] opacity-75">
                            Day {f.ageDays} of ~{f.shelfLifeDays}d ({f.daysRemaining <= 0 ? 'Past cycle window' : `${f.daysRemaining}d left`})
                            {f.storageNote ? ` • ${f.storageNote}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteFeeder(f.id)}
                          className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                          title="Remove culture"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            f.isAlert ? 'bg-amber-500' : 'bg-lime-600'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          { id: 'warming_up', label: 'Warming Up' },
                          { id: 'booming', label: 'Booming' },
                          { id: 'low', label: 'Running Low' },
                          { id: 'crashed', label: 'Crashed' }
                        ].map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => handleUpdateFeederStatus(f, st.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                              f.status === st.id
                                ? st.id === 'low' || st.id === 'crashed'
                                  ? 'bg-amber-500 text-slate-950 border-amber-600'
                                  : 'bg-lime-600 text-white border-lime-700'
                                : darkMode
                                  ? 'bg-slate-900 border-slate-700 opacity-70'
                                  : 'bg-white border-slate-200 opacity-75'
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Enclosure Sizing & Hygiene Card (5 cols) */}
          <section
            className={`lg:col-span-5 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <Ruler className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold">Enclosure &amp; Clearance</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    3× height &amp; 2× width molting rule
                  </p>
                </div>
              </div>
              {canConfigure && (
                <button
                  type="button"
                  onClick={() => {
                    setEnclosureDraft(settings.enclosureInfo);
                    setEditingEnclosure(!editingEnclosure);
                  }}
                  className="text-xs font-bold text-lime-600 dark:text-lime-400 hover:underline cursor-pointer"
                >
                  {editingEnclosure ? 'Cancel' : 'Edit Specs'}
                </button>
              )}
            </div>

            {/* Clearance Status */}
            <div
              className={`p-3.5 rounded-2xl border text-xs space-y-1 ${
                summary.clearance.isEnclosureTight
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-950 dark:text-amber-200'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
              }`}
            >
              <div className="font-extrabold">
                {summary.clearance.isEnclosureTight
                  ? `⚠️ Upsize Soon — Enclosure Getting Snug for ${summary.clearance.bodyLen}mm`
                  : `✓ Safe Molting Clearance (${summary.clearance.encH}mm H × ${summary.clearance.encW}mm W)`}
              </div>
              <p className="opacity-85">
                At {summary.clearance.bodyLen}mm body length, {settings.mantisName} needs at least{' '}
                <strong>{summary.clearance.minSafeHeightMm}mm</strong> vertical height and{' '}
                <strong>{summary.clearance.minSafeWidthMm}mm</strong> width.
              </p>
            </div>

            {editingEnclosure ? (
              <form onSubmit={handleSaveEnclosure} className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-[10px] font-bold uppercase opacity-60 mb-0.5">
                    Enclosure Label
                  </label>
                  <input
                    type="text"
                    value={enclosureDraft.currentSizeLabel || ''}
                    onChange={(e) =>
                      setEnclosureDraft({ ...enclosureDraft, currentSizeLabel: e.target.value })
                    }
                    className="w-full px-3 py-1.5 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase opacity-60 mb-0.5">
                      Mantis (mm)
                    </label>
                    <input
                      type="number"
                      value={enclosureDraft.currentBodyLengthMm || ''}
                      onChange={(e) =>
                        setEnclosureDraft({
                          ...enclosureDraft,
                          currentBodyLengthMm: e.target.value
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase opacity-60 mb-0.5">
                      Height (mm)
                    </label>
                    <input
                      type="number"
                      value={enclosureDraft.enclosureHeightMm || ''}
                      onChange={(e) =>
                        setEnclosureDraft({ ...enclosureDraft, enclosureHeightMm: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase opacity-60 mb-0.5">
                      Width (mm)
                    </label>
                    <input
                      type="number"
                      value={enclosureDraft.enclosureWidthMm || ''}
                      onChange={(e) =>
                        setEnclosureDraft({ ...enclosureDraft, enclosureWidthMm: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase opacity-60 mb-0.5">
                    Ceiling Mesh Type (Avoid bare metal mesh!)
                  </label>
                  <input
                    type="text"
                    value={enclosureDraft.meshType || ''}
                    onChange={(e) =>
                      setEnclosureDraft({ ...enclosureDraft, meshType: e.target.value })
                    }
                    className="w-full px-3 py-1.5 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase opacity-60 mb-0.5">
                    Substrate &amp; Perches
                  </label>
                  <input
                    type="text"
                    value={enclosureDraft.substrate || ''}
                    onChange={(e) =>
                      setEnclosureDraft({ ...enclosureDraft, substrate: e.target.value })
                    }
                    className="w-full px-3 py-1.5 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded-xl bg-lime-600 text-white font-bold cursor-pointer"
                >
                  Save Habitat Specs
                </button>
              </form>
            ) : (
              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                  <div>
                    <span className="opacity-65">Housing:</span>{' '}
                    <strong>{settings.enclosureInfo.currentSizeLabel}</strong>
                  </div>
                  <div>
                    <span className="opacity-65">Ceiling Grip:</span>{' '}
                    <strong>{settings.enclosureInfo.meshType}</strong>
                  </div>
                  <div>
                    <span className="opacity-65">Substrate:</span>{' '}
                    <strong>{settings.enclosureInfo.substrate}</strong>
                  </div>
                  <div>
                    <span className="opacity-65">Last Substrate Tidy / Clean:</span>{' '}
                    <strong>{settings.enclosureInfo.lastDeepCleanDate || 'Not recorded'}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    patchSettings(
                      {
                        enclosureInfo: {
                          ...settings.enclosureInfo,
                          lastDeepCleanDate: todayKey
                        }
                      },
                      `Logged enclosure substrate clean for ${settings.mantisName}`
                    )
                  }
                  className={`w-full py-2.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    darkMode
                      ? 'border-slate-700 hover:bg-slate-800'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  ✓ Mark Substrate / Enclosure Cleaned Today
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ====================================================================
          MODAL A: LOG A NEW MOLT MILESTONE
      ==================================================================== */}
      {moltModalOpen && (
        <div
          onClick={() => setMoltModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl border space-y-4 ${
              darkMode
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-lime-500/15 text-lime-600 dark:text-lime-400 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold">
                    Log {settings.mantisName}&apos;s Molt!
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Record exuvia shed &amp; advance instar stage
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMoltModalOpen(false)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitMolt} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">From Stage</label>
                  <select
                    value={moltFromInput}
                    onChange={(e) => setMoltFromInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 font-bold"
                  >
                    {INSTAR_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">New Stage</label>
                  <select
                    value={moltToInput}
                    onChange={(e) => setMoltToInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 font-bold"
                  >
                    {INSTAR_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">Molt Date</label>
                  <input
                    type="date"
                    value={moltDateInput}
                    onChange={(e) => setMoltDateInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">
                    Est. Body Length (mm)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 15"
                    value={moltLengthInput}
                    onChange={(e) => setMoltLengthInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase opacity-70 mb-1">
                  New Colour / Pattern Shift
                </label>
                <input
                  type="text"
                  value={moltColorInput}
                  onChange={(e) => setMoltColorInput(e.target.value)}
                  placeholder="e.g., Brighter lime bands & pink tibial lobes..."
                  className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block font-bold uppercase opacity-70 mb-1">Molt Quality</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'clean', label: 'Clean Shed' },
                    { id: 'minor_issue', label: 'Minor Snag' },
                    { id: 'mismolt', label: 'Mismolt' }
                  ].map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setMoltQualityInput(q.id)}
                      className={`py-2 rounded-xl border font-bold cursor-pointer ${
                        moltQualityInput === q.id
                          ? 'bg-lime-600 text-white border-lime-700'
                          : darkMode
                            ? 'bg-slate-800 border-slate-700'
                            : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase opacity-70 mb-1">Notes</label>
                <input
                  type="text"
                  value={moltNoteInput}
                  onChange={(e) => setMoltNoteInput(e.target.value)}
                  placeholder="Hung from ceiling mesh overnight, all 6 tarsi gripping well..."
                  className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              {moltDateInput === todayKey && (
                <label className="flex items-center gap-2 p-3 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/30 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={moltStartHardening}
                    onChange={(e) => setMoltStartHardening(e.target.checked)}
                    className="rounded accent-fuchsia-600 w-4 h-4"
                  />
                  <span>
                    Start {settings.hardeningHours}h Post-Molt No-Feed Hardening Timer
                  </span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMoltModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-extrabold bg-lime-600 hover:bg-lime-700 text-white cursor-pointer"
                >
                  Save Molt Milestone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL B: BLOOM SPECIMEN & HABITAT SETTINGS
      ==================================================================== */}
      {settingsModalOpen && canConfigure && (
        <div
          onClick={() => setSettingsModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl border space-y-4 ${
              darkMode
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">Bloom • Mantis &amp; Care Settings</h3>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFullSettings} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">Mantis Name</label>
                  <input
                    type="text"
                    value={settingsForm.mantisName || ''}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, mantisName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">
                    Species Preset
                  </label>
                  <select
                    value={settingsForm.speciesPreset || 'spiny_flower'}
                    onChange={(e) => {
                      const preset = SPECIES_PRESETS.find((p) => p.id === e.target.value);
                      if (preset) {
                        setSettingsForm({
                          ...settingsForm,
                          speciesPreset: preset.id,
                          commonName: preset.commonName,
                          scientificName: preset.scientificName,
                          dayTempMinC: preset.dayTempMinC,
                          dayTempMaxC: preset.dayTempMaxC,
                          nightTempMinC: preset.nightTempMinC,
                          humidityMinPct: preset.humidityMinPct,
                          humidityMaxPct: preset.humidityMaxPct,
                          mistTargetHours: preset.mistTargetHours
                        });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  >
                    {SPECIES_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.commonName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">Sex</label>
                  <select
                    value={settingsForm.sex || 'Male'}
                    onChange={(e) => setSettingsForm({ ...settingsForm, sex: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  >
                    <option value="Male">♂ Male</option>
                    <option value="Female">♀ Female</option>
                    <option value="Unsexed">Unsexed Nymph</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">
                    Current Instar
                  </label>
                  <select
                    value={settingsForm.currentInstar || 'L2'}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, currentInstar: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 font-bold"
                  >
                    {INSTAR_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">Arrival Date</label>
                  <input
                    type="date"
                    value={settingsForm.arrivalDate || ''}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, arrivalDate: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase opacity-70 mb-1">
                  Current Colour / Morph Description
                </label>
                <input
                  type="text"
                  value={settingsForm.currentColorMorph || ''}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, currentColorMorph: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">
                    Mist Every (h)
                  </label>
                  <input
                    type="number"
                    value={settingsForm.mistTargetHours || 24}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, mistTargetHours: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">
                    Post-Molt Lock (h)
                  </label>
                  <input
                    type="number"
                    value={settingsForm.hardeningHours || 36}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, hardeningHours: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">
                    Est. Molt Cycle (d)
                  </label>
                  <input
                    type="number"
                    value={settingsForm.typicalInterMoltDays || 14}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, typicalInterMoltDays: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">Min °C</label>
                  <input
                    type="number"
                    value={settingsForm.dayTempMinC || 25}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, dayTempMinC: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">Max °C</label>
                  <input
                    type="number"
                    value={settingsForm.dayTempMaxC || 28}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, dayTempMaxC: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">Min RH%</label>
                  <input
                    type="number"
                    value={settingsForm.humidityMinPct || 50}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, humidityMinPct: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block font-bold uppercase opacity-70 mb-1">Max RH%</label>
                  <input
                    type="number"
                    value={settingsForm.humidityMaxPct || 65}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, humidityMaxPct: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase opacity-70 mb-1">
                  Household &amp; Pet Sitter Care Note
                </label>
                <textarea
                  rows={3}
                  value={settingsForm.careNote || ''}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, careNote: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-extrabold bg-lime-600 hover:bg-lime-700 text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
