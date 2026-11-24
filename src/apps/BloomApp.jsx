import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Check,
  Info,
  Activity,
  History,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Edit3
} from 'lucide-react';
import {
  ModuleHeader,
  SegmentedTabs,
  ModalShell,
  EmptyStateCard,
  getFieldClass
} from '../components/HowardUI.jsx';
import {
  getLocalDateKey,
  parseLocalDateKey,
  shiftDateKey,
  formatTimeDisplay,
  formatFriendlyDate,
  getMondayOfWeek,
  getCalendarWeekDays,
  formatWeekRangeLabel,
  DEFAULT_BLOOM_SETTINGS,
  computeBloomSummary
} from '../utils/householdHelpers.js';

export { DEFAULT_BLOOM_SETTINGS, computeBloomSummary };

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
    pillClass: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
    activeClass: 'bg-amber-500 text-slate-950 border-amber-600'
  },
  {
    id: 'ready',
    label: 'Ready',
    hint: 'Good hunting appetite',
    pillClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
    activeClass: 'bg-emerald-700 text-white border-emerald-800'
  },
  {
    id: 'plump',
    label: 'Plump',
    hint: 'Ideal fullness',
    pillClass: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/40',
    activeClass: 'bg-emerald-700 text-white border-emerald-800'
  },
  {
    id: 'stuffed',
    label: 'Stuffed',
    hint: 'Rest & digest',
    pillClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
    activeClass: 'bg-purple-600 text-white border-purple-700'
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

export default function BloomApp({
  activeProfile,
  darkMode,
  nowMs = Date.now(),
  bloomSnapshot,
  bloomSummary,
  navigationIntent,
  onGlobalSync,
  showToast
}) {
  const canConfigure = activeProfile?.id !== 'caregiver';
  const activeCaregiver = activeProfile?.caregiverName || activeProfile?.name || 'Partner 1';

  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'growth' | 'habitat'
  const [localSnapshot, setLocalSnapshot] = useState(bloomSnapshot);

  useEffect(() => {
    setLocalSnapshot(bloomSnapshot);
  }, [bloomSnapshot]);

  useEffect(() => {
    if (
      navigationIntent?.tab &&
      ['today', 'growth', 'habitat'].includes(navigationIntent.tab)
    ) {
      setActiveTab(navigationIntent.tab);
    }
  }, [navigationIntent]);

  const todayKey = getLocalDateKey(now);
  const summary = useMemo(
    () =>
      localSnapshot === bloomSnapshot && bloomSummary
        ? bloomSummary
        : computeBloomSummary(localSnapshot, now),
    [localSnapshot, bloomSnapshot, bloomSummary, now]
  );
  const { settings } = summary;
  const parsedHardeningHours = Number(settings.hardeningHours);
  const hardeningHours = Number.isFinite(parsedHardeningHours)
    ? Math.max(0, parsedHardeningHours)
    : 36;
  const pronounPossessive =
    settings.sex === 'Male' ? 'his' : settings.sex === 'Female' ? 'her' : 'their';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!canConfigure) {
      setOverrideFeedLockout(false);
    }
  }, [canConfigure]);

  const [tempInput, setTempInput] = useState('');
  const [humidityInput, setHumidityInput] = useState('');
  const [journalDraft, setJournalDraft] = useState('');

  useEffect(() => {
    setJournalDraft(summary.todayLog?.journalNote || '');
  }, [summary.todayLog?.journalNote, todayKey]);

  useEffect(() => {
    if (summary.latestAbdomen) {
      setSelectedAbdomen(summary.latestAbdomen);
    }
  }, [summary.latestAbdomen]);

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
    setMoltStartHardening(hardeningHours > 0);
    setMoltModalOpen(true);
  };

  const isLatestMoltModal =
    !summary.molts[0]?.dateKey || (moltDateInput || todayKey) >= summary.molts[0].dateKey;

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
  // FORM STATES — SETTINGS MODAL, BACKFILL MODAL & DELETE CONFIRMATION
  // --------------------------------------------------------------------------
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState(settings);
  const [confirmDeleteModal, setConfirmDeleteModal] = useState(null); // { kind: 'mist'|'feeding'|'climate'|'molt'|'feeder', id, label, dateKey? }

  const [backfillDate, setBackfillDate] = useState(null);
  const [bfMistTime, setBfMistTime] = useState('09:00');
  const [bfMistDrink, setBfMistDrink] = useState(false);
  const [bfMistNote, setBfMistNote] = useState('');
  const [bfPrey, setBfPrey] = useState('hydei');
  const [bfPreyCount, setBfPreyCount] = useState(2);
  const [bfAbdomen, setBfAbdomen] = useState('plump');
  const [bfFeedNote, setBfFeedNote] = useState('');
  const [bfTemp, setBfTemp] = useState('');
  const [bfHumidity, setBfHumidity] = useState('');
  const [bfJournal, setBfJournal] = useState('');

  const openBackfillModal = (dateKey) => {
    const rec = localSnapshot?.logsByDate?.[dateKey] || {};
    setBfMistTime('09:00');
    setBfMistDrink(false);
    setBfMistNote('');
    setBfPrey(selectedPrey || 'hydei');
    setBfPreyCount(2);
    setBfAbdomen(rec.abdomenStatus || summary.latestAbdomen || 'plump');
    setBfFeedNote('');
    setBfTemp('');
    setBfHumidity('');
    setBfJournal(rec.journalNote || '');
    setBackfillDate(dateKey);
  };

  // --------------------------------------------------------------------------
  // API MUTATION HELPERS
  // --------------------------------------------------------------------------
  const notify = (msg, type = 'success') => {
    if (showToast) showToast(msg, type);
  };

  const patchSettings = async (patch, toastMsg = '') => {
    const prevSnapshot = localSnapshot;
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
      return true;
    } catch {
      setLocalSnapshot(prevSnapshot);
      if (onGlobalSync) onGlobalSync({ force: true });
      notify('Could not save Bloom settings — reverted', 'error');
      return false;
    }
  };

  const saveDayLog = async (
    dateKey,
    apiPayload,
    applyOptimisticDay,
    settingsPatch = null,
    toastMsg = ''
  ) => {
    const prevSnapshot = localSnapshot;
    setLocalSnapshot((prev) => {
      const existingDay = prev?.logsByDate?.[dateKey] || {
        dateKey,
        mists: [],
        feedings: [],
        climateChecks: [],
        behaviors: []
      };
      const nextDay = applyOptimisticDay ? applyOptimisticDay(existingDay) : existingDay;
      return {
        ...prev,
        ...(settingsPatch
          ? {
              settings: {
                ...prev?.settings,
                ...settingsPatch,
                enclosureInfo: {
                  ...prev?.settings?.enclosureInfo,
                  ...settingsPatch.enclosureInfo
                }
              }
            }
          : {}),
        logsByDate: {
          ...prev?.logsByDate,
          [dateKey]: {
            ...nextDay,
            dateKey
          }
        }
      };
    });

    try {
      const res = await fetch(`/api/bloom/logs/${encodeURIComponent(dateKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          settingsPatch ? { ...apiPayload, settingsPatch } : apiPayload
        )
      });
      if (!res.ok) throw new Error('Failed to save Bloom log');
      const resData = await res.json().catch(() => null);
      if (resData?.record) {
        setLocalSnapshot((prev) => ({
          ...prev,
          ...(resData.settings ? { settings: resData.settings } : {}),
          logsByDate: {
            ...prev?.logsByDate,
            [dateKey]: resData.record
          }
        }));
      }
      if (toastMsg) notify(toastMsg);
      if (onGlobalSync) onGlobalSync();
      return true;
    } catch {
      setLocalSnapshot(prevSnapshot);
      if (onGlobalSync) onGlobalSync({ force: true });
      notify('Could not save care log to server — reverted', 'error');
      return false;
    }
  };

  const buildTimestampForDate = (dateKey, timeStr = '09:00') => {
    if (dateKey === todayKey) return new Date().toISOString();
    const dt = parseLocalDateKey(dateKey);
    const [hh, mm] = String(timeStr || '09:00').split(':').map(Number);
    dt.setHours(Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0, 0, 0);
    return dt.toISOString();
  };

  // --------------------------------------------------------------------------
  // HANDLERS — DAILY CARE (MIST, FEED, ABDOMEN, CLIMATE, NOTES)
  // --------------------------------------------------------------------------
  const handleLogMist = async (e, targetDate = todayKey, overrides = null) => {
    if (e) e.preventDefault();
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const tsIso = overrides?.timestamp || nowIso;
      const drank = overrides ? Boolean(overrides.drank) : mistDrinkObserved;
      const noteText = overrides ? String(overrides.note || '').trim() : mistNoteInput.trim();
      const newMist = {
        id: `mist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: tsIso,
        by: activeCaregiver,
        ...(activeProfile?.id ? { byProfileId: activeProfile.id } : {}),
        dropletDrinkObserved: drank,
        note: noteText
      };

      if (!overrides) {
        setMistDrinkObserved(false);
        setMistNoteInput('');
      }
      return await saveDayLog(
        targetDate,
        { appendMist: newMist, updatedAt: nowIso },
        (day) => ({
          ...day,
          mists: [...(day.mists || []), newMist],
          ...(drank
            ? {
                behaviors: Array.from(new Set([...(day.behaviors || []), 'Drank Droplets']))
              }
            : {}),
          updatedAt: nowIso
        }),
        null,
        `Logged ${settings.mantisName}'s enclosure mist (${activeCaregiver})`
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDeleteMist = async (mistId, targetDate = todayKey) => {
    const nowIso = new Date().toISOString();
    await saveDayLog(
      targetDate,
      { removeMistId: mistId, updatedAt: nowIso },
      (day) => ({
        ...day,
        mists: (day.mists || []).filter((m) => m.id !== mistId),
        updatedAt: nowIso
      }),
      null,
      'Removed mist entry'
    );
  };

  const handleLogFeeding = async (outcome = 'eaten', targetDate = todayKey, overrides = null) => {
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const tsIso = overrides?.timestamp || nowIso;
      const preyId = overrides?.preyId || selectedPrey;
      const countVal = overrides?.count ?? preyCount;
      const abdVal = overrides?.abdomenAfter || selectedAbdomen;
      const noteText = overrides ? String(overrides.note || '').trim() : feedNoteInput.trim();
      const preyMeta = PREY_OPTIONS.find((p) => p.id === preyId) || PREY_OPTIONS[1];
      const entry = {
        id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: tsIso,
        by: activeCaregiver,
        ...(activeProfile?.id ? { byProfileId: activeProfile.id } : {}),
        outcome, // 'eaten' | 'refused'
        preyId,
        preyLabel: preyMeta.label,
        count: outcome === 'refused' ? 0 : Math.max(1, Number(countVal) || 1),
        abdomenAfter: abdVal,
        note: noteText
      };

      const settingsPatch =
        !overrides && targetDate === todayKey && leavePreyWarning
          ? {
              livePreyInside: true,
              livePreyByProfileId: activeProfile?.id || null,
              livePreyAt: formatTimeDisplay(nowIso),
              livePreyNote: `${preyMeta.label} offered at ${formatTimeDisplay(tsIso)} by ${activeCaregiver}`
            }
          : null;

      if (!overrides) {
        setFeedNoteInput('');
        setLeavePreyWarning(false);
        setOverrideFeedLockout(false);
        if (outcome === 'refused' && summary.effectiveStatus === 'normal' && canConfigure) {
          setRefusalPremoltPrompt(true);
        }
      }

      return await saveDayLog(
        targetDate,
        {
          appendFeeding: entry,
          abdomenStatus: abdVal,
          abdomenUpdatedAt: tsIso,
          updatedAt: nowIso
        },
        (day) => ({
          ...day,
          feedings: [...(day.feedings || []), entry],
          abdomenStatus: abdVal,
          abdomenUpdatedAt: tsIso,
          updatedAt: nowIso
        }),
        settingsPatch,
        outcome === 'refused'
          ? `Logged refused meal for ${settings.mantisName}`
          : `Logged ${entry.count}× ${preyMeta.label.split(' (')[0]} for ${settings.mantisName}`
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleUpdateAbdomenOnly = async (levelId, targetDate = todayKey) => {
    if (targetDate === todayKey) {
      setSelectedAbdomen(levelId);
    }
    const nowIso = new Date().toISOString();
    const tsIso = buildTimestampForDate(targetDate, '12:00');
    const meta = ABDOMEN_LEVELS.find((a) => a.id === levelId);
    await saveDayLog(
      targetDate,
      { abdomenStatus: levelId, abdomenUpdatedAt: tsIso, updatedAt: nowIso },
      (day) => ({
        ...day,
        abdomenStatus: levelId,
        abdomenUpdatedAt: tsIso,
        updatedAt: nowIso
      }),
      null,
      `Updated ${settings.mantisName}'s abdomen check: ${meta?.label || levelId}`
    );
  };

  const handleDeleteFeeding = async (feedId, targetDate = todayKey) => {
    const nowIso = new Date().toISOString();
    await saveDayLog(
      targetDate,
      { removeFeedingId: feedId, updatedAt: nowIso },
      (day) => ({
        ...day,
        feedings: (day.feedings || []).filter((f) => f.id !== feedId),
        updatedAt: nowIso
      }),
      null,
      'Removed feeding entry'
    );
  };

  const handleLogClimate = async (e, targetDate = todayKey, overrides = null) => {
    if (e) e.preventDefault();
    if (submittingRef.current) return false;
    const tVal = overrides ? overrides.temp : tempInput;
    const hVal = overrides ? overrides.humidity : humidityInput;
    if (String(tVal ?? '').trim() === '' && String(hVal ?? '').trim() === '') {
      notify('Enter a temperature or humidity reading first', 'error');
      return false;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const tsIso = buildTimestampForDate(targetDate, '12:00');
      const check = {
        id: `clim-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: tsIso,
        by: activeCaregiver,
        ...(activeProfile?.id ? { byProfileId: activeProfile.id } : {}),
        tempC: String(tVal ?? '').trim() !== '' ? Number(tVal) : null,
        humidityPct: String(hVal ?? '').trim() !== '' ? Number(hVal) : null
      };
      if (!overrides) {
        setTempInput('');
        setHumidityInput('');
      }
      return await saveDayLog(
        targetDate,
        { appendClimateCheck: check, updatedAt: nowIso },
        (day) => ({
          ...day,
          climateChecks: [...(day.climateChecks || []), check],
          updatedAt: nowIso
        }),
        null,
        'Logged enclosure temperature & humidity'
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDeleteClimateCheck = async (checkId, targetDate = todayKey) => {
    const nowIso = new Date().toISOString();
    await saveDayLog(
      targetDate,
      { removeClimateCheckId: checkId, updatedAt: nowIso },
      (day) => ({
        ...day,
        climateChecks: (day.climateChecks || []).filter((c) => c.id !== checkId),
        updatedAt: nowIso
      }),
      null,
      'Removed climate check'
    );
  };

  const handleToggleBehavior = async (tag, targetDate = todayKey) => {
    const nowIso = new Date().toISOString();
    await saveDayLog(
      targetDate,
      { toggleBehavior: tag, updatedAt: nowIso },
      (day) => {
        const existing = day.behaviors || [];
        return {
          ...day,
          behaviors: existing.includes(tag)
            ? existing.filter((b) => b !== tag)
            : [...existing, tag],
          updatedAt: nowIso
        };
      }
    );
  };

  const handleSaveJournalNote = async (e, targetDate = todayKey, customNote = null) => {
    if (e) e.preventDefault();
    const nowIso = new Date().toISOString();
    const text = (customNote !== null ? customNote : journalDraft).trim();
    await saveDayLog(
      targetDate,
      { journalNote: text, updatedAt: nowIso },
      (day) => ({
        ...day,
        journalNote: text,
        updatedAt: nowIso
      }),
      null,
      `Saved ${settings.mantisName}'s daily note`
    );
  };

  // --------------------------------------------------------------------------
  // HANDLERS — LIFECYCLE & MOLTS
  // --------------------------------------------------------------------------
  const handleTogglePremolt = async (enable) => {
    if (!canConfigure) return;
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
    if (!canConfigure || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    const targetDate = moltDateInput || todayKey;
    const isTodayMolt = targetDate === todayKey;
    const isLatestMolt = !summary.molts[0]?.dateKey || targetDate >= summary.molts[0].dateKey;
    const shouldStartHardening =
      hardeningHours > 0 && moltStartHardening && isTodayMolt && isLatestMolt;

    try {
      const res = await fetch('/api/bloom/molts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateKey: targetDate,
          fromInstar: moltFromInput,
          toInstar: moltToInput,
          lengthMm: moltLengthInput ? Number(moltLengthInput) : null,
          colorShift: moltColorInput.trim(),
          quality: moltQualityInput,
          loggedBy: activeCaregiver,
          ...(activeProfile?.id ? { loggedByProfileId: activeProfile.id } : {}),
          note: moltNoteInput.trim(),
          advanceInstar: isLatestMolt,
          startHardening: shouldStartHardening
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || 'Could not save molt milestone');
      }
      const data = await res.json();
      setLocalSnapshot((prev) => ({
        ...prev,
        molts: data.molts || prev.molts,
        settings: data.settings || prev.settings
      }));
      setMoltModalOpen(false);
      setRefusalPremoltPrompt(false);
      notify(
        isLatestMolt
          ? `🎉 ${settings.mantisName} molted from ${moltFromInput} to ${moltToInput}!${
              shouldStartHardening ? ` (${hardeningHours}h hardening timer started)` : ''
            }`
          : `Added historical molt (${moltFromInput} → ${moltToInput} on ${targetDate})`
      );
      if (onGlobalSync) onGlobalSync();
    } catch (err) {
      notify(err?.message || 'Could not save molt milestone', 'error');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleDeleteMolt = async (moltId) => {
    if (!canConfigure) return;
    try {
      const res = await fetch(`/api/bloom/molts/${encodeURIComponent(moltId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete molt');
      const data = await res.json();
      setLocalSnapshot((prev) => ({
        ...prev,
        molts: data.molts || [],
        ...(data.settings ? { settings: data.settings } : {})
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
    if (!canConfigure || submittingRef.current) return;
    if (!feederNameInput.trim()) {
      notify('Please enter a feeder culture name', 'error');
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
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
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleUpdateFeederStatus = async (feeder, nextStatus) => {
    if (!canConfigure) return;
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
    if (!canConfigure) return;
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

  const clampFiniteSetting = (val, fallback, min, max) => {
    if (val === '' || val === null || val === undefined) return fallback;
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  const handleSaveEnclosure = async (e) => {
    e.preventDefault();
    if (!canConfigure) return;
    const ok = await patchSettings(
      {
        enclosureInfo: {
          ...enclosureDraft,
          currentBodyLengthMm: clampFiniteSetting(enclosureDraft.currentBodyLengthMm, 10, 1, 500),
          enclosureHeightMm: clampFiniteSetting(enclosureDraft.enclosureHeightMm, 110, 1, 2000),
          enclosureWidthMm: clampFiniteSetting(enclosureDraft.enclosureWidthMm, 75, 1, 2000)
        }
      },
      `Updated ${settings.mantisName}'s enclosure specs`
    );
    if (ok) {
      setEditingEnclosure(false);
    }
  };

  const handleSaveFullSettings = async (e) => {
    e.preventDefault();
    if (!canConfigure) return;
    const mantisName =
      (settingsForm.mantisName || '').trim() || DEFAULT_BLOOM_SETTINGS.mantisName;
    const dayTempMinC = clampFiniteSetting(settingsForm.dayTempMinC, 25, 10, 45);
    const dayTempMaxC = clampFiniteSetting(settingsForm.dayTempMaxC, 28, dayTempMinC, 50);
    const nightTempMinC = clampFiniteSetting(settingsForm.nightTempMinC, 20, 5, dayTempMaxC);
    const humidityMinPct = clampFiniteSetting(settingsForm.humidityMinPct, 50, 10, 100);
    const humidityMaxPct = clampFiniteSetting(settingsForm.humidityMaxPct, 65, humidityMinPct, 100);
    const mistTargetHours = clampFiniteSetting(settingsForm.mistTargetHours, 24, 1, 168);
    const nextHardeningHours = clampFiniteSetting(settingsForm.hardeningHours, 36, 0, 168);
    const typicalInterMoltDays = clampFiniteSetting(settingsForm.typicalInterMoltDays, 14, 1, 180);

    const editableSettings = {
      mantisName,
      speciesPreset: settingsForm.speciesPreset || DEFAULT_BLOOM_SETTINGS.speciesPreset,
      commonName:
        (settingsForm.commonName || '').trim() || DEFAULT_BLOOM_SETTINGS.commonName,
      scientificName:
        (settingsForm.scientificName || '').trim() || DEFAULT_BLOOM_SETTINGS.scientificName,
      sex: settingsForm.sex || DEFAULT_BLOOM_SETTINGS.sex,
      currentInstar: settingsForm.currentInstar || DEFAULT_BLOOM_SETTINGS.currentInstar,
      arrivalDate: settingsForm.arrivalDate || settings.arrivalDate || todayKey,
      currentColorMorph: (settingsForm.currentColorMorph || '').trim(),
      dayTempMinC,
      dayTempMaxC,
      nightTempMinC,
      humidityMinPct,
      humidityMaxPct,
      mistTargetHours,
      hardeningHours: nextHardeningHours,
      typicalInterMoltDays,
      careNote: (settingsForm.careNote || '').trim()
    };

    const ok = await patchSettings(editableSettings, `Saved ${mantisName}'s Bloom settings`);
    if (ok) {
      setSettingsModalOpen(false);
    }
  };

  // Mon-Sun Weekly Care History navigation & gap calculations
  const currentWeekMonday = useMemo(() => getMondayOfWeek(now), [now]);
  const [selectedWeekMonday, setSelectedWeekMonday] = useState(() =>
    getMondayOfWeek(new Date())
  );
  const prevWeekMondayRef = useRef(currentWeekMonday);

  useEffect(() => {
    if (prevWeekMondayRef.current !== currentWeekMonday) {
      setSelectedWeekMonday((prev) =>
        prev === prevWeekMondayRef.current ? currentWeekMonday : prev
      );
      prevWeekMondayRef.current = currentWeekMonday;
    }
  }, [currentWeekMonday]);

  const activeWeekMonday =
    selectedWeekMonday > currentWeekMonday ? currentWeekMonday : selectedWeekMonday;
  const isCurrentWeek = activeWeekMonday === currentWeekMonday;

  const selectedWeekDays = useMemo(
    () => getCalendarWeekDays(activeWeekMonday, todayKey),
    [activeWeekMonday, todayKey]
  );
  const weekRangeLabel = useMemo(
    () => formatWeekRangeLabel(activeWeekMonday),
    [activeWeekMonday]
  );

  const moltsByDate = useMemo(() => {
    const map = new Map();
    for (const m of summary.molts || []) {
      if (!m?.dateKey) continue;
      const list = map.get(m.dateKey) || [];
      list.push(m);
      map.set(m.dateKey, list);
    }
    return map;
  }, [summary.molts]);

  const weekStats = useMemo(() => {
    let mistedDays = 0;
    let mealsCount = 0;
    let gapDays = 0;
    let partialDays = 0;

    selectedWeekDays.forEach((dKey) => {
      const rec = localSnapshot?.logsByDate?.[dKey] || {};
      const dayMolts = moltsByDate.get(dKey) || [];
      const mistCount = (rec.mists || []).length;
      const feedings = rec.feedings || [];
      const hasActivity =
        mistCount > 0 ||
        feedings.length > 0 ||
        (rec.climateChecks || []).length > 0 ||
        (rec.behaviors || []).length > 0 ||
        Boolean(rec.abdomenStatus) ||
        Boolean(rec.journalNote) ||
        dayMolts.length > 0;

      if (mistCount > 0) mistedDays += 1;
      feedings.forEach((f) => {
        if (f.outcome !== 'refused') mealsCount += 1;
      });
      if (!hasActivity && dKey < todayKey) {
        gapDays += 1;
      } else if (hasActivity && mistCount === 0 && dKey < todayKey) {
        partialDays += 1;
      }
    });

    return { mistedDays, mealsCount, gapDays, partialDays };
  }, [selectedWeekDays, localSnapshot?.logsByDate, moltsByDate, todayKey]);

  // Recommended feeder stage guide based on currentInstar
  const instarFeederTip = useMemo(() => {
    const st = settings.currentInstar;
    if (st === 'L1' || st === 'L2') {
      return 'Nymph L1–L2: Flightless D. melanogaster or small D. hydei fruit flies (2–4 flies every 1–2 days until abdomen is plump).';
    }
    if (st === 'L3' || st === 'L4') {
      return 'Nymph L3–L4: D. hydei fruit flies, pinhead/hatchling locusts, or first small curly-wing flies.';
    }
    return `Older Nymph / Adult (L5+): Curly-wing flies, greenbottle/bluebottle flies, and small waxmoths—${
      settings.commonName ? `${settings.commonName} thrives` : 'flower mantises thrive'
    } on flying prey!`;
  }, [settings.currentInstar, settings.commonName]);

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      {/* ====================================================================
          1. BLOOM HERO HEADER & SUB-VIEW NAVIGATION
      ==================================================================== */}
      <ModuleHeader
        accent="emerald"
        icon={Flower2}
        title={`Bloom • ${settings.mantisName}`}
        subtitle={
          <>
            {settings.commonName} (<em className="italic">{settings.scientificName}</em>)
            {settings.currentColorMorph ? ` • ${settings.currentColorMorph}` : ''}
          </>
        }
        darkMode={darkMode}
        compactActions
        badges={
          <>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
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
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-rose-600 text-white">
                🛡️ Hardening ({summary.hardeningRemainingLabel})
              </span>
            )}
          </>
        }
        actions={
          canConfigure ? (
            <button
              type="button"
              onClick={() => {
                setSettingsForm(settings);
                setSettingsModalOpen(true);
              }}
              className={`min-h-[40px] min-w-[40px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition cursor-pointer ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
              title={`Configure ${settings.mantisName}'s Species & Care Settings`}
              aria-label={`Configure ${settings.mantisName}'s Species & Care Settings`}
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          ) : null
        }
        footer={
          <SegmentedTabs
            accent="emerald"
            darkMode={darkMode}
            activeId={activeTab}
            onChange={setActiveTab}
            tabs={[
              {
                id: 'today',
                label: 'Habitat & Today',
                shortLabel: 'Today',
                icon: Droplets
              },
              {
                id: 'growth',
                label: 'Growth & Molts',
                shortLabel: 'Growth',
                icon: Sparkles,
                badge: summary.molts.length || null
              },
              {
                id: 'habitat',
                label: 'Feeders & Enclosure',
                shortLabel: 'Habitat',
                icon: Bug,
                badge:
                  (canConfigure && summary.feederAlerts.length > 0) ||
                  summary.clearance.isEnclosureTight
                    ? canConfigure && summary.feederAlerts.length > 0
                      ? summary.feederAlerts.length
                      : '!'
                    : null
              }
            ]}
          />
        }
      />

      {/* ====================================================================
          2. CRITICAL SAFETY BANNERS (UNEATEN PREY, PREMOLT, POST-MOLT HARDENING)
      ==================================================================== */}
      {settings.livePreyInside && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-rose-500/10 border-rose-500/40 text-rose-950 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold">
                Uneaten Live Prey Still Inside {settings.mantisName}&apos;s Enclosure
              </h2>
              <p className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed break-words">
                {settings.livePreyNote || 'Live feeder left inside.'} Remove roaming locusts/flies before lights-out or if {settings.mantisName} hangs to molt.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              patchSettings(
                {
                  livePreyInside: false,
                  livePreyNote: '',
                  livePreyByProfileId: null,
                  livePreyAt: null
                },
                `Marked ${settings.mantisName}'s enclosure clear of live prey`
              )
            }
            className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shrink-0 active:scale-[0.98] transition cursor-pointer"
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
              <p className="text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
                {settings.mantisName} is preparing to shed {settings.currentInstar}. Remove any remaining feeders, mist the side wall lightly to maintain ~60–68% RH, and avoid bumping or opening the mesh lid while hanging.
              </p>
            </div>
          </div>
          {canConfigure && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={openLogMoltModal}
                className="min-h-[40px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs active:scale-[0.98] transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>🎉 {settings.mantisName} Molted!</span>
              </button>
              <button
                type="button"
                onClick={() => handleTogglePremolt(false)}
                className="min-h-[40px] px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-slate-800 text-xs font-bold border border-amber-500/40 active:scale-[0.98] transition cursor-pointer"
              >
                Exit Premolt
              </button>
            </div>
          )}
        </section>
      )}

      {summary.effectiveStatus === 'hardening' && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-rose-500/10 border-rose-500/40 text-rose-950 dark:text-rose-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm sm:text-base font-extrabold">
                Post-Molt Exoskeleton Hardening ({summary.hardeningRemainingLabel} remaining)
              </h2>
              <p className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed">
                {settings.mantisName}&apos;s fresh {settings.currentInstar} cuticle and raptorial forelegs are still soft. Hold off on live feeders until the cooldown finishes—gentle wall misting for drinking water is safe.
              </p>
            </div>
          </div>
          {canConfigure && (
            <button
              type="button"
              onClick={() =>
                patchSettings(
                  { lifecycleStatus: 'normal', hardeningUntil: null },
                  `Ended post-molt cooldown for ${settings.mantisName}`
                )
              }
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/40 text-rose-900 dark:text-rose-100 text-xs font-bold shrink-0 active:scale-[0.98] transition cursor-pointer"
            >
              Mark Ready Early
            </button>
          )}
        </section>
      )}

      {summary.effectiveStatus === 'hardened_ready' && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-emerald-500/10 border-emerald-500/40 text-emerald-950 dark:text-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="text-xs">
              <div className="font-extrabold text-sm">
                ✨ {settings.mantisName}&apos;s {settings.currentInstar} Exoskeleton Has Hardened!
              </div>
              <p className="text-emerald-900 dark:text-emerald-200">
                Post-molt cooldown is complete—safe to offer {settings.mantisName} {pronounPossessive} first {settings.currentInstar} meal.
              </p>
            </div>
          </div>
          {canConfigure && (
            <button
              type="button"
              onClick={() =>
                patchSettings(
                  { lifecycleStatus: 'normal', hardeningUntil: null },
                  `${settings.mantisName} is back in active hunting mode`
                )
              }
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shrink-0 active:scale-[0.98] transition cursor-pointer"
            >
              Resume Hunting Mode
            </button>
          )}
        </section>
      )}

      {refusalPremoltPrompt && summary.effectiveStatus === 'normal' && canConfigure && (
        <section className="rounded-2xl p-3.5 border bg-amber-500/10 border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div>
            <strong>{settings.mantisName} refused prey!</strong> Refusing food is the #1 early sign of Premolt in{' '}
            {settings.commonName || 'your mantis'}. Switch on Premolt Watch?
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleTogglePremolt(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold active:scale-[0.98] transition cursor-pointer"
            >
              Enable Premolt Watch
            </button>
            <button
              type="button"
              onClick={() => setRefusalPremoltPrompt(false)}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold active:scale-[0.98] transition cursor-pointer"
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
          {settings.careNote && (
            <div
              className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 shadow-xs ${
                darkMode
                  ? 'bg-slate-900 border-slate-800 text-slate-200'
                  : 'bg-emerald-50/80 border-emerald-200/80 text-slate-700'
              }`}
            >
              <Info className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{settings.careNote}</p>
            </div>
          )}

          {/* Quick Status Metrics Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div
              className={`p-3.5 rounded-2xl border ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Stage &amp; Molt Clock
              </div>
              <div className="text-base font-extrabold mt-0.5 text-emerald-700 dark:text-emerald-400">
                {settings.currentInstar} • Day {summary.daysInCurrentInstar}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Hydration / Mist
              </div>
              <div className="text-base font-extrabold mt-0.5 text-emerald-700 dark:text-emerald-400">
                {summary.lastMist ? summary.lastMist.timeAgoLabel : 'No mists yet'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Feeding &amp; Abdomen
              </div>
              <div className="text-base font-extrabold mt-0.5 text-emerald-700 dark:text-emerald-400">
                {summary.lastMeal ? summary.lastMeal.friendlyWhen : 'Not logged yet'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 capitalize">
                Abdomen: {summary.latestAbdomen || 'Unchecked'}
              </div>
            </div>

            <div
              className={`p-3.5 rounded-2xl border flex flex-col justify-between ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Lifecycle Mode
              </div>
              {canConfigure ? (
                <div
                  className={`grid gap-1.5 pt-1.5 ${
                    summary.effectiveStatus !== 'premolt' && !summary.isAdult
                      ? 'grid-cols-1 sm:grid-cols-2'
                      : 'grid-cols-1'
                  }`}
                >
                  {summary.effectiveStatus !== 'premolt' && !summary.isAdult && (
                    <button
                      type="button"
                      onClick={() => handleTogglePremolt(true)}
                      className="h-full min-h-[44px] flex flex-col justify-center items-center text-center py-2 px-2.5 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 active:scale-[0.98] transition cursor-pointer"
                    >
                      Premolt
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openLogMoltModal}
                    className="h-full min-h-[44px] flex flex-col justify-center items-center text-center py-2 px-2.5 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white active:scale-[0.98] transition cursor-pointer"
                  >
                    + Log Molt
                  </button>
                </div>
              ) : (
                <div className="text-xs font-bold capitalize mt-1">
                  {summary.effectiveStatus === 'premolt'
                    ? 'Premolt Watch (No Prey)'
                    : summary.effectiveStatus === 'hardening'
                      ? `Hardening (${summary.hardeningRemainingLabel})`
                      : 'Normal Hunting'}
                </div>
              )}
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <Droplets className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-extrabold">Misting &amp; Drinking Droplets</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Mist wall lightly (~{settings.humidityMinPct}–{settings.humidityMaxPct}% RH) &amp; let dry between sprays
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                      summary.isMistDue
                        ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                        : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 break-words">
                        Last misted <strong>{summary.lastMist.timeAgoLabel}</strong> by{' '}
                        <strong>{summary.lastMist.by}</strong>
                        {summary.lastMist.dropletDrinkObserved ? ' • 💧 Drank droplets!' : ''}
                      </span>
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-300 shrink-0">
                        {formatTimeDisplay(summary.lastMist.timestamp)}
                      </span>
                    </div>
                  ) : (
                    <span>No enclosure mists recorded yet today.</span>
                  )}
                </div>

                <form onSubmit={handleLogMist} className="space-y-3">
                  <label className="min-h-[40px] flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={mistDrinkObserved}
                      onChange={(e) => setMistDrinkObserved(e.target.checked)}
                      className="rounded accent-emerald-600 w-4 h-4 shrink-0"
                    />
                    <span>💧 Spotted {settings.mantisName} drinking wall droplets</span>
                  </label>

                  <input
                    type="text"
                    value={mistNoteInput}
                    onChange={(e) => setMistNoteInput(e.target.value)}
                    placeholder="Optional mist note (e.g., extra wall spray for premolt)..."
                    className={getFieldClass('emerald')}
                  />

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98] transition"
                  >
                    <Droplets className="w-4 h-4" />
                    <span>Log Enclosure Mist ({activeCaregiver})</span>
                  </button>
                </form>
              </div>

              {/* Today's mists list */}
              {(summary.todayLog.mists || []).length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                    Today&apos;s Mists ({summary.todayLog.mists.length})
                  </div>
                  {summary.todayLog.mists.map((m) => (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs py-1.5 px-3 rounded-xl bg-slate-100/70 dark:bg-slate-800/50"
                    >
                      <span className="min-w-0 flex-1 break-words">
                        <strong>{formatTimeDisplay(m.timestamp)}</strong> • {m.by}
                        {m.dropletDrinkObserved ? ' • 💧 Drank' : ''}
                        {m.note ? ` — "${m.note}"` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDeleteModal({
                            kind: 'mist',
                            id: m.id,
                            dateKey: todayKey,
                            label: `mist at ${formatTimeDisplay(m.timestamp)} (${m.by})`
                          })
                        }
                        className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer shrink-0"
                        title="Undo mist log"
                        aria-label="Undo mist log"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* CARD B: FEEDING & ABDOMEN PLUMPNESS GAUGE */}
            <section
              className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between space-y-4 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <Bug className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-extrabold">Feeding &amp; Abdomen Plumpness</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Feed by abdomen roundness rather than a rigid clock
                      </p>
                    </div>
                  </div>
                </div>

                {/* 4-Step Abdomen Gauge */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-200 min-w-0">
                      {settings.mantisName}&apos;s Abdomen Plumpness Check:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateAbdomenOnly(selectedAbdomen)}
                      className="min-h-[40px] px-2.5 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 hover:underline active:scale-[0.98] transition cursor-pointer shrink-0"
                    >
                      Save Check Only
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ABDOMEN_LEVELS.map((lvl) => {
                      const isSel = selectedAbdomen === lvl.id;
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => setSelectedAbdomen(lvl.id)}
                          className={`min-h-[44px] p-2.5 rounded-xl border text-left active:scale-[0.98] transition cursor-pointer overflow-hidden ${
                            isSel ? lvl.activeClass : lvl.pillClass
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="text-xs font-extrabold">{lvl.label}</span>
                            {summary.latestAbdomen === lvl.id && (
                              <span
                                className={`text-[11px] font-extrabold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                                  isSel
                                    ? lvl.id === 'flat'
                                      ? 'bg-slate-950/15'
                                      : 'bg-white/25'
                                    : 'bg-slate-900/10 dark:bg-white/15'
                                }`}
                              >
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-xs mt-0.5 leading-snug">{lvl.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Safety lockout guard during Premolt / Post-Molt Hardening */}
                {summary.isNoFeedLockout && !(canConfigure && overrideFeedLockout) ? (
                  <div className="p-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 space-y-2 text-xs">
                    <div className="font-extrabold flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>
                        Feeding Locked ({summary.effectiveStatus === 'premolt' ? 'Premolt Watch' : 'Post-Molt Hardening'})
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                      Live feeders can disturb a molting nymph or injure soft new raptorial legs. Wait until hardening completes before offering prey.
                    </p>
                    {canConfigure && (
                      <button
                        type="button"
                        onClick={() => setOverrideFeedLockout(true)}
                        className="min-h-[40px] px-2.5 rounded-xl text-xs font-bold underline text-amber-800 dark:text-amber-300 hover:bg-amber-500/15 active:scale-[0.98] transition cursor-pointer"
                      >
                        Override &amp; log a feeding anyway
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2 min-w-0">
                        <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                          Feeder Prey
                        </label>
                        <select
                          value={selectedPrey}
                          onChange={(e) => setSelectedPrey(e.target.value)}
                          className={getFieldClass('emerald', 'font-semibold min-w-0')}
                        >
                          {PREY_OPTIONS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label} ({p.stages})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="min-w-0">
                        <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                          Count
                        </label>
                        <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-950">
                          <button
                            type="button"
                            onClick={() => setPreyCount((c) => Math.max(1, c - 1))}
                            aria-label="Decrease prey count"
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-sm font-extrabold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
                          >
                            -
                          </button>
                          <span className="flex-1 text-center text-xs font-extrabold">
                            {preyCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPreyCount((c) => Math.min(25, c + 1))}
                            aria-label="Increase prey count"
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-sm font-extrabold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <label className="min-h-[40px] flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={leavePreyWarning}
                        onChange={(e) => setLeavePreyWarning(e.target.checked)}
                        className="rounded accent-rose-600 w-4 h-4 shrink-0"
                      />
                      <span>Uneaten live prey still inside enclosure (set removal reminder)</span>
                    </label>

                    <input
                      type="text"
                      value={feedNoteInput}
                      onChange={(e) => setFeedNoteInput(e.target.value)}
                      placeholder="Optional feeding note (e.g., tong-fed, struck mid-air!)..."
                      className={getFieldClass('emerald')}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleLogFeeding('eaten')}
                        className="sm:col-span-2 min-h-[44px] py-3 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Log Meal Eaten</span>
                      </button>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleLogFeeding('refused')}
                        className={`min-h-[44px] py-3 px-3 rounded-xl border font-bold text-xs disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer ${
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
                  <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                    Today&apos;s Feedings ({summary.todayLog.feedings.length})
                  </div>
                  {summary.todayLog.feedings.map((f) => (
                    <div
                      key={f.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs py-1.5 px-3 rounded-xl bg-slate-100/70 dark:bg-slate-800/50"
                    >
                      <span className="min-w-0 flex-1 break-words">
                        <strong>{formatTimeDisplay(f.timestamp)}</strong> •{' '}
                        {f.outcome === 'refused' ? (
                          <span className="text-amber-700 dark:text-amber-300 font-bold">
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
                        onClick={() =>
                          setConfirmDeleteModal({
                            kind: 'feeding',
                            id: f.id,
                            dateKey: todayKey,
                            label:
                              f.outcome === 'refused'
                                ? `refused ${f.preyLabel?.split(' (')[0]} at ${formatTimeDisplay(f.timestamp)}`
                                : `${f.count}× ${f.preyLabel?.split(' (')[0]} at ${formatTimeDisplay(f.timestamp)}`
                          })
                        }
                        className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer shrink-0"
                        title="Remove feeding log"
                        aria-label="Remove feeding log"
                      >
                        <Trash2 className="w-4 h-4" />
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
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <Thermometer className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-extrabold">Enclosure Temp &amp; Humidity</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Target: {settings.dayTempMinC}–{settings.dayTempMaxC}°C day •{' '}
                      {settings.humidityMinPct}–{settings.humidityMaxPct}% RH
                    </p>
                  </div>
                </div>
              </div>

              {summary.latestClimate && (
                <div
                  className={`p-3 rounded-2xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
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
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatFriendlyDate(summary.latestClimate.dateKey, todayKey)}{' '}
                    {formatTimeDisplay(summary.latestClimate.timestamp)}
                  </span>
                </div>
              )}

              <form onSubmit={handleLogClimate} className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="60"
                  value={tempInput}
                  onChange={(e) => setTempInput(e.target.value)}
                  placeholder="Temp °C"
                  className={getFieldClass('emerald', 'min-w-0')}
                />
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={humidityInput}
                  onChange={(e) => setHumidityInput(e.target.value)}
                  placeholder="RH %"
                  className={getFieldClass('emerald', 'min-w-0')}
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="col-span-2 min-h-[40px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
                >
                  Log Check
                </button>
              </form>

              {(summary.todayLog.climateChecks || []).length > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                    Today&apos;s Climate Checks ({summary.todayLog.climateChecks.length})
                  </div>
                  {summary.todayLog.climateChecks.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs py-1.5 px-3 rounded-xl bg-slate-100/70 dark:bg-slate-800/50"
                    >
                      <span className="min-w-0 flex-1 break-words">
                        <strong>{formatTimeDisplay(c.timestamp)}</strong> •{' '}
                        {c.tempC != null ? `${c.tempC}°C` : '—'}
                        {c.humidityPct != null ? ` • ${c.humidityPct}% RH` : ''}
                        {c.by ? ` • ${c.by}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDeleteModal({
                            kind: 'climate',
                            id: c.id,
                            dateKey: todayKey,
                            label: `climate check at ${formatTimeDisplay(c.timestamp)}`
                          })
                        }
                        className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer shrink-0"
                        title="Undo climate check"
                        aria-label="Undo climate check"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Behaviour Tags & Journal Note (7 cols) */}
            <section
              className={`lg:col-span-7 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3.5 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
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
                      className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border active:scale-[0.98] transition cursor-pointer ${
                        active
                          ? 'bg-emerald-700 text-white border-emerald-800'
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

              <form onSubmit={handleSaveJournalNote} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={journalDraft}
                  onChange={(e) => setJournalDraft(e.target.value)}
                  placeholder={`Quick observation about ${settings.mantisName} today...`}
                  className={getFieldClass('emerald', 'flex-1 min-w-0')}
                />
                <button
                  type="submit"
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold active:scale-[0.98] transition cursor-pointer shrink-0"
                >
                  Save Note
                </button>
              </form>
            </section>
          </div>

          {/* Mon-Sun Weekly Care History (Week Pager + Gap Highlighting + Backfill) */}
          <section
            aria-label="Weekly Care History"
            className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3 sm:space-y-4 ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <History className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-sm sm:text-base">Weekly Care History</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Browse by week (Mon–Sun) to spot misting or feeding gaps
                  </p>
                </div>
              </div>

              <div
                className={`inline-flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold w-fit max-w-full ${
                  weekStats.gapDays > 0
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                }`}
              >
                <span>
                  Misted {weekStats.mistedDays}/{selectedWeekDays.length}d • {weekStats.mealsCount}{' '}
                  meal{weekStats.mealsCount === 1 ? '' : 's'}
                </span>
                {weekStats.gapDays > 0 && (
                  <span>
                    • {weekStats.gapDays} gap day{weekStats.gapDays === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>

            <div
              className={`flex flex-col lg:flex-row lg:items-center flex-wrap justify-between gap-3 p-3 rounded-2xl border ${
                darkMode
                  ? 'bg-slate-800/50 border-slate-700'
                  : 'bg-slate-50 border-slate-200/80'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedWeekMonday(shiftDateKey(activeWeekMonday, -7))}
                  className="min-w-[40px] min-h-[40px] p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center active:scale-[0.98] transition cursor-pointer"
                  title="Previous Week"
                  aria-label="Previous Week"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex flex-wrap items-center gap-2 px-2 min-w-0">
                  <Calendar className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs sm:text-sm font-bold">{weekRangeLabel}</span>
                  {isCurrentWeek && (
                    <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                      This Week
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isCurrentWeek}
                  onClick={() => {
                    const nextMonday = shiftDateKey(activeWeekMonday, 7);
                    setSelectedWeekMonday(
                      nextMonday > currentWeekMonday ? currentWeekMonday : nextMonday
                    );
                  }}
                  className={`min-w-[40px] min-h-[40px] p-2 rounded-xl border flex items-center justify-center transition ${
                    isCurrentWeek
                      ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-[0.98] cursor-pointer'
                  }`}
                  title="Next Week"
                  aria-label="Next Week"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                {!isCurrentWeek && (
                  <button
                    type="button"
                    onClick={() => setSelectedWeekMonday(currentWeekMonday)}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold active:scale-[0.98] transition cursor-pointer"
                  >
                    This Week
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-end lg:self-auto">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  Jump to date:
                </label>
                <div className="w-40 sm:w-44 min-w-0">
                  <input
                    type="date"
                    max={todayKey}
                    value={isCurrentWeek ? todayKey : activeWeekMonday}
                    onChange={(e) => {
                      if (e.target.value) {
                        const targetMon = getMondayOfWeek(e.target.value);
                        setSelectedWeekMonday(
                          targetMon > currentWeekMonday ? currentWeekMonday : targetMon
                        );
                      }
                    }}
                    className={getFieldClass('emerald', 'font-semibold')}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              {selectedWeekDays.map((dateKey) => {
                const rec = localSnapshot?.logsByDate?.[dateKey] || {};
                const dayMolts = moltsByDate.get(dateKey) || [];
                const mists = rec.mists || [];
                const feedings = rec.feedings || [];
                const climateChecks = rec.climateChecks || [];
                const behaviors = rec.behaviors || [];
                const hasActivity =
                  mists.length > 0 ||
                  feedings.length > 0 ||
                  climateChecks.length > 0 ||
                  behaviors.length > 0 ||
                  Boolean(rec.abdomenStatus) ||
                  Boolean(rec.journalNote) ||
                  dayMolts.length > 0;
                const isGapDay = !hasActivity && dateKey < todayKey;
                const isNoMistDay = hasActivity && mists.length === 0 && dateKey < todayKey;
                const isToday = dateKey === todayKey;

                return (
                  <div
                    key={dateKey}
                    className={`p-3 rounded-2xl border space-y-1.5 ${
                      isToday
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : isGapDay
                          ? 'border-dashed border-rose-300/80 dark:border-rose-900/60 bg-rose-500/5'
                          : darkMode
                            ? 'bg-slate-800/40 border-slate-800'
                            : 'bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 font-bold">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            mists.length > 0
                              ? 'bg-emerald-500'
                              : isNoMistDay
                                ? 'bg-amber-400'
                                : isGapDay
                                  ? 'bg-rose-400'
                                  : 'bg-slate-400'
                          }`}
                        />
                        <span>{formatFriendlyDate(dateKey, todayKey)}</span>
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          {dateKey}
                        </span>
                        {isToday && (
                          <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                            Active
                          </span>
                        )}
                        {isGapDay && (
                          <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300">
                            No care logged
                          </span>
                        )}
                        {isNoMistDay && (
                          <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300">
                            No mist logged
                          </span>
                        )}
                      </div>

                      {dateKey !== todayKey && (
                        <button
                          type="button"
                          onClick={() => openBackfillModal(dateKey)}
                          className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer ${
                            !hasActivity
                              ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700'
                              : darkMode
                                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{!hasActivity ? '+ Backfill' : 'Edit'}</span>
                        </button>
                      )}
                    </div>

                    {hasActivity && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {mists.length > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-semibold">
                            💧 {mists.length} mist{mists.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {feedings.map((f) => (
                          <span
                            key={f.id}
                            className={`px-2 py-0.5 rounded-md font-semibold ${
                              f.outcome === 'refused'
                                ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
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
                        {climateChecks.map((c) => (
                          <span
                            key={c.id}
                            className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold"
                          >
                            🌡️ {c.tempC != null ? `${c.tempC}°C` : '—'}
                            {c.humidityPct != null ? ` / ${c.humidityPct}%` : ''}
                          </span>
                        ))}
                        {dayMolts.map((m) => (
                          <span
                            key={m.id}
                            className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-semibold"
                          >
                            ✨ {m.fromInstar} → {m.toInstar}
                          </span>
                        ))}
                        {behaviors.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {rec.journalNote && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 italic pt-0.5">
                        &ldquo;{rec.journalNote}&rdquo;
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
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
                    ? ` • Next molt window around ${formatFriendlyDate(summary.projectedNextMoltDateStr, todayKey)}`
                    : ' • Final winged adult stage reached!'}
                </p>
              </div>
              {canConfigure && (
                <button
                  type="button"
                  onClick={openLogMoltModal}
                  className="min-h-[40px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs active:scale-[0.98] transition cursor-pointer shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Log New Molt</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-9 gap-1.5">
              {INSTAR_STAGES.map((stage, idx) => {
                const currentIdx = INSTAR_STAGES.indexOf(settings.currentInstar);
                const isCurrent = stage === settings.currentInstar;
                const isPassed = currentIdx !== -1 && idx < currentIdx;
                return (
                  <div
                    key={stage}
                    className={`p-2 sm:p-2.5 rounded-2xl border text-center transition ${
                      isCurrent
                        ? 'bg-emerald-700 text-white border-emerald-800 ring-2 ring-emerald-500/40 font-extrabold'
                        : isPassed
                          ? darkMode
                            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300 font-bold'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold'
                          : darkMode
                            ? 'bg-slate-800/40 border-slate-800 text-slate-400'
                            : 'bg-slate-50 border-slate-200/70 text-slate-500'
                    }`}
                  >
                    <div className="text-xs">{stage}</div>
                    <div
                      className={`text-xs mt-0.5 ${
                        isCurrent
                          ? 'text-emerald-100'
                          : isPassed
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
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
                <EmptyStateCard
                  accent="emerald"
                  darkMode={darkMode}
                  icon={Sparkles}
                  title={`No molts logged yet for ${settings.mantisName}`}
                  description={`When ${settings.mantisName} sheds ${pronounPossessive} exuvia, log the molt milestone to advance ${pronounPossessive} instar and start the post-molt hardening timer.`}
                  action={
                    canConfigure ? (
                      <button
                        type="button"
                        onClick={openLogMoltModal}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold inline-flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Log First Molt</span>
                      </button>
                    ) : null
                  }
                />
              ) : (
                <div className="space-y-2.5">
                  {summary.molts.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3.5 rounded-2xl border flex flex-wrap items-start justify-between gap-3 ${
                        darkMode
                          ? 'bg-slate-800/50 border-slate-700'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1 break-words">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-700 text-white">
                            {m.fromInstar} &rarr; {m.toInstar}
                          </span>
                          <span className="text-xs font-bold">
                            {formatFriendlyDate(m.dateKey, todayKey)} ({m.dateKey})
                          </span>
                          {m.lengthMm && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
                              📏 {m.lengthMm} mm
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                              m.quality === 'clean'
                                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                                : 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
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
                          <div className="text-xs text-purple-700 dark:text-purple-300 font-semibold">
                            🎨 Colour/Pattern: {m.colorShift}
                          </div>
                        )}
                        {m.note && (
                          <p className="text-xs text-slate-600 dark:text-slate-300">{m.note}</p>
                        )}
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Logged by {m.loggedBy}
                        </div>
                      </div>

                      {canConfigure && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteModal({
                              kind: 'molt',
                              id: m.id,
                              label: `${m.fromInstar} → ${m.toInstar} molt on ${m.dateKey}`
                            })
                          }
                          className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer shrink-0"
                          title="Delete molt record"
                          aria-label="Delete molt record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Species Reference Card (4 cols) */}
            <section
              className={`lg:col-span-4 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3 text-xs ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="font-extrabold text-sm flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <Flower2 className="w-4 h-4 shrink-0" />
                <span>{settings.commonName || 'Mantis'} Keeper Notes</span>
              </div>
              <div className="space-y-2.5 leading-relaxed text-slate-600 dark:text-slate-300">
                <p>
                  <strong>Male Growth Path:</strong> Male{' '}
                  <em>{settings.scientificName || settings.commonName || 'your mantis'}</em>{' '}
                  typically mature in <strong>6–7 molts</strong> (one molt quicker than females),
                  developing long antennae, agile flight wings, and characteristic adult markings!
                </p>
                <p>
                  <strong>Counting Segments (L4+):</strong> Males show <strong>8</strong> underside abdominal segments (ending in a slimmer terminal segment), whereas females show <strong>6</strong> broader segments and a larger spiny sub-adult pronotum.
                </p>
                <p>
                  <strong>Molt Clearance:</strong> Always ensure at least <strong>3× body length</strong> of unobstructed vertical drop beneath the soft mesh lid so {settings.mantisName} can slide cleanly out of {pronounPossessive} old skin.
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold">Live Feeder Stash &amp; Cultures</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Track fruit fly pots &amp; casters so you never get caught by a culture crash
                </p>
              </div>
              {canConfigure && (
                <button
                  type="button"
                  onClick={() => {
                    setFeederStartedInput(todayKey);
                    setNewFeederOpen(!newFeederOpen);
                  }}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Culture</span>
                </button>
              )}
            </div>

            <div
              className={`p-3 rounded-2xl border text-xs ${
                darkMode
                  ? 'bg-slate-800/50 border-slate-700 text-emerald-200'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              }`}
            >
              <strong>{settings.currentInstar} Sizing Tip:</strong> {instarFeederTip}
            </div>

            {newFeederOpen && canConfigure && (
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
                    className={getFieldClass('emerald', 'min-w-0')}
                  >
                    {FEEDER_CULTURE_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    value={feederNameInput}
                    onChange={(e) => setFeederNameInput(e.target.value)}
                    placeholder="Label (e.g., Hydei Pot #2)"
                    className={getFieldClass('emerald', 'min-w-0')}
                  />
                  <div className="min-w-0">
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Started / Arrived Date
                    </label>
                    <input
                      type="date"
                      value={feederStartedInput}
                      onChange={(e) => setFeederStartedInput(e.target.value)}
                      className={getFieldClass('emerald', 'min-w-0')}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Est. Lifespan (Days)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="90"
                      value={feederShelfDaysInput}
                      onChange={(e) => setFeederShelfDaysInput(e.target.value)}
                      className={getFieldClass('emerald', 'min-w-0')}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <select
                    value={feederStatusInput}
                    onChange={(e) => setFeederStatusInput(e.target.value)}
                    className={getFieldClass('emerald', 'min-w-0')}
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
                    className={getFieldClass('emerald', 'min-w-0')}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNewFeederOpen(false)}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
                  >
                    Save Culture
                  </button>
                </div>
              </form>
            )}

            {summary.feeders.length === 0 ? (
              <EmptyStateCard
                accent="emerald"
                darkMode={darkMode}
                icon={Bug}
                title="No active feeder cultures tracked yet"
                description="Add your fruit fly pots, curly-wing tubs, or casters so you never get caught by a culture crash."
                action={
                  canConfigure ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFeederStartedInput(todayKey);
                        setNewFeederOpen(true);
                      }}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add First Culture</span>
                    </button>
                  ) : null
                }
              />
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
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            Day {f.ageDays} of ~{f.shelfLifeDays}d ({f.daysRemaining <= 0 ? 'Past cycle window' : `${f.daysRemaining}d left`})
                            {f.storageNote ? ` • ${f.storageNote}` : ''}
                          </div>
                        </div>
                        {canConfigure && (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDeleteModal({
                                kind: 'feeder',
                                id: f.id,
                                label: f.name
                              })
                            }
                            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer shrink-0"
                            title="Remove culture"
                            aria-label="Remove culture"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            f.isAlert ? 'bg-amber-500' : 'bg-emerald-600'
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
                            disabled={!canConfigure}
                            onClick={() => handleUpdateFeederStatus(f, st.id)}
                            className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border transition ${
                              canConfigure ? 'active:scale-[0.98] cursor-pointer' : 'cursor-default'
                            } ${
                              f.status === st.id
                                ? st.id === 'low' || st.id === 'crashed'
                                  ? 'bg-amber-500 text-slate-950 border-amber-600'
                                  : 'bg-emerald-700 text-white border-emerald-800'
                                : darkMode
                                  ? 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <Ruler className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold">Enclosure &amp; Clearance</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
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
                  className="min-h-[40px] px-2.5 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 hover:underline active:scale-[0.98] transition cursor-pointer shrink-0"
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
              <p
                className={
                  summary.clearance.isEnclosureTight
                    ? 'text-amber-900 dark:text-amber-100'
                    : 'text-emerald-900 dark:text-emerald-100'
                }
              >
                At {summary.clearance.bodyLen}mm body length, {settings.mantisName} needs at least{' '}
                <strong>{summary.clearance.minSafeHeightMm}mm</strong> vertical height and{' '}
                <strong>{summary.clearance.minSafeWidthMm}mm</strong> width.
              </p>
            </div>

            {editingEnclosure && canConfigure ? (
              <form onSubmit={handleSaveEnclosure} className="space-y-3 text-xs">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                    Enclosure Label
                  </label>
                  <input
                    type="text"
                    value={enclosureDraft.currentSizeLabel || ''}
                    onChange={(e) =>
                      setEnclosureDraft({ ...enclosureDraft, currentSizeLabel: e.target.value })
                    }
                    className={getFieldClass('emerald')}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2">
                  <div className="min-w-0">
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Mantis (mm)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={enclosureDraft.currentBodyLengthMm ?? ''}
                      onChange={(e) =>
                        setEnclosureDraft({
                          ...enclosureDraft,
                          currentBodyLengthMm: e.target.value
                        })
                      }
                      className={getFieldClass('emerald', 'min-w-0')}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Height (mm)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={enclosureDraft.enclosureHeightMm ?? ''}
                      onChange={(e) =>
                        setEnclosureDraft({ ...enclosureDraft, enclosureHeightMm: e.target.value })
                      }
                      className={getFieldClass('emerald', 'min-w-0')}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Width (mm)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={enclosureDraft.enclosureWidthMm ?? ''}
                      onChange={(e) =>
                        setEnclosureDraft({ ...enclosureDraft, enclosureWidthMm: e.target.value })
                      }
                      className={getFieldClass('emerald', 'min-w-0')}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                    Ceiling Mesh Type (Avoid bare metal mesh!)
                  </label>
                  <input
                    type="text"
                    value={enclosureDraft.meshType || ''}
                    onChange={(e) =>
                      setEnclosureDraft({ ...enclosureDraft, meshType: e.target.value })
                    }
                    className={getFieldClass('emerald')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                    Substrate &amp; Perches
                  </label>
                  <input
                    type="text"
                    value={enclosureDraft.substrate || ''}
                    onChange={(e) =>
                      setEnclosureDraft({ ...enclosureDraft, substrate: e.target.value })
                    }
                    className={getFieldClass('emerald')}
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[40px] py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold active:scale-[0.98] transition cursor-pointer"
                >
                  Save Habitat Specs
                </button>
              </form>
            ) : (
              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Housing:</span>{' '}
                    <strong>{settings.enclosureInfo.currentSizeLabel}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Ceiling Grip:</span>{' '}
                    <strong>{settings.enclosureInfo.meshType}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Substrate:</span>{' '}
                    <strong>{settings.enclosureInfo.substrate}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Last Substrate Tidy / Clean:</span>{' '}
                    <strong>
                      {settings.enclosureInfo.lastDeepCleanDate
                        ? formatFriendlyDate(settings.enclosureInfo.lastDeepCleanDate, todayKey)
                        : 'Not recorded'}
                    </strong>
                  </div>
                </div>
                {canConfigure && (
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
                    className={`w-full min-h-[40px] py-2.5 px-3 rounded-xl border text-xs font-bold active:scale-[0.98] transition cursor-pointer ${
                      darkMode
                        ? 'border-slate-700 hover:bg-slate-800'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    ✓ Mark Substrate / Enclosure Cleaned Today
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ====================================================================
          MODAL A: LOG A NEW MOLT MILESTONE
      ==================================================================== */}
      <ModalShell
        isOpen={Boolean(moltModalOpen && canConfigure)}
        onClose={() => setMoltModalOpen(false)}
        title={`Log ${settings.mantisName}'s Molt!`}
        subtitle={
          isLatestMoltModal
            ? 'Record exuvia shed & advance instar stage'
            : 'Add a historical exuvia shed to growth history'
        }
        icon={Sparkles}
        accent="emerald"
        darkMode={darkMode}
        maxWidthClass="max-w-md"
        ariaLabel="Log Molt Milestone"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMoltModalOpen(false)}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="bloom-molt-form"
              disabled={isSubmitting}
              className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-extrabold bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
            >
              {isSubmitting ? 'Saving...' : 'Save Molt Milestone'}
            </button>
          </div>
        }
      >
        {!isLatestMoltModal && (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-start gap-2 text-xs font-semibold">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              This date precedes the latest recorded molt ({summary.molts[0]?.dateKey}), so it
              will be added as a historical milestone without changing {settings.mantisName}
              &apos;s current instar ({settings.currentInstar}).
            </span>
          </div>
        )}

        <form id="bloom-molt-form" onSubmit={handleSubmitMolt} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                From Stage
              </label>
              <select
                value={moltFromInput}
                onChange={(e) => setMoltFromInput(e.target.value)}
                className={getFieldClass('emerald', 'font-bold min-w-0')}
              >
                {INSTAR_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                New Stage
              </label>
              <select
                value={moltToInput}
                onChange={(e) => setMoltToInput(e.target.value)}
                className={getFieldClass('emerald', 'font-bold min-w-0')}
              >
                {INSTAR_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Molt Date
              </label>
              <input
                type="date"
                value={moltDateInput}
                onChange={(e) => setMoltDateInput(e.target.value)}
                className={getFieldClass('emerald', 'min-w-0')}
              />
            </div>
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Est. Body Length (mm)
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                placeholder="e.g. 15"
                value={moltLengthInput}
                onChange={(e) => setMoltLengthInput(e.target.value)}
                className={getFieldClass('emerald', 'min-w-0')}
              />
            </div>
          </div>

          <div>
            <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
              New Colour / Pattern Shift
            </label>
            <input
              type="text"
              value={moltColorInput}
              onChange={(e) => setMoltColorInput(e.target.value)}
              placeholder="e.g., Brighter lime bands & pink tibial lobes..."
              className={getFieldClass('emerald')}
            />
          </div>

          <div>
            <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
              Molt Quality
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'clean', label: 'Clean Shed' },
                { id: 'minor_issue', label: 'Minor Snag' },
                { id: 'mismolt', label: 'Mismolt' }
              ].map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setMoltQualityInput(q.id)}
                  className={`min-h-[40px] py-2 px-3 rounded-xl border font-bold active:scale-[0.98] transition cursor-pointer ${
                    moltQualityInput === q.id
                      ? 'bg-emerald-700 text-white border-emerald-800'
                      : darkMode
                        ? 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={moltNoteInput}
              onChange={(e) => setMoltNoteInput(e.target.value)}
              placeholder="Hung from ceiling mesh overnight, all 6 tarsi gripping well..."
              className={getFieldClass('emerald')}
            />
          </div>

          {isLatestMoltModal && moltDateInput === todayKey && hardeningHours > 0 && (
            <label className="flex items-center gap-2 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-900 dark:text-rose-200 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={moltStartHardening}
                onChange={(e) => setMoltStartHardening(e.target.checked)}
                className="rounded accent-rose-600 w-4 h-4"
              />
              <span>
                Start {hardeningHours}h Post-Molt No-Feed Hardening Timer
              </span>
            </label>
          )}
        </form>
      </ModalShell>

      {/* ====================================================================
          MODAL B: BLOOM SPECIMEN & HABITAT SETTINGS
      ==================================================================== */}
      <ModalShell
        isOpen={Boolean(settingsModalOpen && canConfigure)}
        onClose={() => setSettingsModalOpen(false)}
        title="Bloom • Mantis & Care Settings"
        subtitle={`${settings.mantisName} • ${settings.commonName}`}
        icon={Settings}
        accent="emerald"
        darkMode={darkMode}
        maxWidthClass="max-w-lg"
        ariaLabel="Bloom Mantis and Care Settings"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSettingsModalOpen(false)}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="bloom-settings-form"
              className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-extrabold bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Save Settings</span>
            </button>
          </div>
        }
      >
        <form id="bloom-settings-form" onSubmit={handleSaveFullSettings} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Mantis Name
              </label>
              <input
                type="text"
                value={settingsForm.mantisName || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, mantisName: e.target.value })
                }
                className={getFieldClass('emerald', 'font-bold min-w-0')}
              />
            </div>
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
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
                className={getFieldClass('emerald', 'min-w-0')}
              >
                {SPECIES_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.commonName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Sex
              </label>
              <select
                value={settingsForm.sex || 'Unsexed'}
                onChange={(e) => setSettingsForm({ ...settingsForm, sex: e.target.value })}
                className={getFieldClass('emerald', 'min-w-0')}
              >
                <option value="Male">♂ Male</option>
                <option value="Female">♀ Female</option>
                <option value="Unsexed">Unsexed Nymph</option>
              </select>
            </div>
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Current Instar
              </label>
              <select
                value={settingsForm.currentInstar || 'L2'}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, currentInstar: e.target.value })
                }
                className={getFieldClass('emerald', 'font-bold min-w-0')}
              >
                {INSTAR_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Arrival Date
              </label>
              <input
                type="date"
                value={settingsForm.arrivalDate || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, arrivalDate: e.target.value })
                }
                className={getFieldClass('emerald', 'min-w-0')}
              />
            </div>
          </div>

          <div>
            <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
              Current Colour / Morph Description
            </label>
            <input
              type="text"
              value={settingsForm.currentColorMorph || ''}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, currentColorMorph: e.target.value })
              }
              className={getFieldClass('emerald')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Mist Every (h)
              </label>
              <input
                type="number"
                min="1"
                max="168"
                value={settingsForm.mistTargetHours ?? ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, mistTargetHours: e.target.value })
                }
                className={getFieldClass('emerald', 'min-w-0')}
              />
            </div>
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Post-Molt Lock (h)
              </label>
              <input
                type="number"
                min="0"
                max="168"
                value={settingsForm.hardeningHours ?? ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, hardeningHours: e.target.value })
                }
                className={getFieldClass('emerald', 'min-w-0')}
              />
            </div>
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Est. Molt Cycle (d)
              </label>
              <input
                type="number"
                min="1"
                max="180"
                value={settingsForm.typicalInterMoltDays ?? ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, typicalInterMoltDays: e.target.value })
                }
                className={getFieldClass('emerald', 'min-w-0')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Min °C
              </label>
              <input
                type="number"
                min="10"
                max="45"
                value={settingsForm.dayTempMinC ?? ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, dayTempMinC: e.target.value })
                }
                className={getFieldClass('emerald', 'min-w-0')}
              />
            </div>
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Max °C
              </label>
              <input
                type="number"
                min="10"
                max="50"
                value={settingsForm.dayTempMaxC ?? ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, dayTempMaxC: e.target.value })
                }
                className={getFieldClass('emerald', 'min-w-0')}
              />
            </div>
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Min RH%
              </label>
              <input
                type="number"
                min="10"
                max="100"
                value={settingsForm.humidityMinPct ?? ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, humidityMinPct: e.target.value })
                }
                className={getFieldClass('emerald', 'min-w-0')}
              />
            </div>
            <div className="min-w-0">
              <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                Max RH%
              </label>
              <input
                type="number"
                min="10"
                max="100"
                value={settingsForm.humidityMaxPct ?? ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, humidityMaxPct: e.target.value })
                }
                className={getFieldClass('emerald', 'min-w-0')}
              />
            </div>
          </div>

          <div>
            <label className="block font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
              Household &amp; Pet Sitter Care Note
            </label>
            <textarea
              rows={3}
              value={settingsForm.careNote || ''}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, careNote: e.target.value })
              }
              className={getFieldClass('emerald')}
            />
          </div>
        </form>
      </ModalShell>

      {/* ====================================================================
          MODAL C: DELETE CONFIRMATION (MIST / FEEDING / CLIMATE / MOLT / FEEDER)
      ==================================================================== */}
      <ModalShell
        isOpen={Boolean(
          confirmDeleteModal &&
            (confirmDeleteModal.kind === 'molt' || confirmDeleteModal.kind === 'feeder'
              ? canConfigure
              : true)
        )}
        onClose={() => setConfirmDeleteModal(null)}
        title={
          confirmDeleteModal?.kind === 'molt'
            ? 'Delete Molt Record?'
            : confirmDeleteModal?.kind === 'feeder'
              ? 'Delete Feeder Culture?'
              : confirmDeleteModal?.kind === 'mist'
                ? 'Delete Mist Entry?'
                : confirmDeleteModal?.kind === 'feeding'
                  ? 'Delete Feeding Entry?'
                  : 'Delete Climate Check?'
        }
        icon={AlertTriangle}
        accent="rose"
        darkMode={darkMode}
        maxWidthClass="max-w-sm"
        zIndexClass="z-[60]"
        ariaLabel="Confirm Deletion"
        footer={
          confirmDeleteModal ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteModal(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmDeleteModal;
                  setConfirmDeleteModal(null);
                  const targetDate = target.dateKey || todayKey;
                  if (target.kind === 'molt') {
                    await handleDeleteMolt(target.id);
                  } else if (target.kind === 'feeder') {
                    await handleDeleteFeeder(target.id);
                  } else if (target.kind === 'mist') {
                    await handleDeleteMist(target.id, targetDate);
                  } else if (target.kind === 'feeding') {
                    await handleDeleteFeeding(target.id, targetDate);
                  } else if (target.kind === 'climate') {
                    await handleDeleteClimateCheck(target.id, targetDate);
                  }
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-700 text-white active:scale-[0.98] transition cursor-pointer"
              >
                Delete
              </button>
            </div>
          ) : null
        }
      >
        {confirmDeleteModal && (
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
            Are you sure you want to permanently remove{' '}
            <span className="font-bold text-slate-800 dark:text-slate-100">
              {confirmDeleteModal.label}
            </span>
            ? This cannot be undone.
          </p>
        )}
      </ModalShell>

      {/* ====================================================================
          MODAL D: PAST-DAY CARE BACKFILL / EDIT MODAL
      ==================================================================== */}
      <ModalShell
        isOpen={Boolean(backfillDate)}
        onClose={() => setBackfillDate(null)}
        title={
          backfillDate
            ? `Care Log • ${formatFriendlyDate(backfillDate, todayKey)}`
            : 'Care Log'
        }
        subtitle={backfillDate ? `${backfillDate} • Recorded as ${activeCaregiver}` : ''}
        icon={Calendar}
        accent="emerald"
        darkMode={darkMode}
        maxWidthClass="max-w-lg"
        ariaLabel="Edit or Backfill Past Day Care Log"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setBackfillDate(null)}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
            >
              Done
            </button>
          </div>
        }
      >
        {backfillDate && (() => {
          const bfRec = localSnapshot?.logsByDate?.[backfillDate] || {};
          const bfMists = bfRec.mists || [];
          const bfFeeds = bfRec.feedings || [];
          const bfClimates = bfRec.climateChecks || [];
          const bfBehaviors = bfRec.behaviors || [];

          return (
            <div className="space-y-4">
              {/* Existing recorded entries on this day */}
              <div className="space-y-2 text-xs">
                <div className="font-extrabold uppercase tracking-wide text-xs text-slate-600 dark:text-slate-300">
                  Logged Entries for {backfillDate}
                </div>
                {bfMists.length === 0 &&
                bfFeeds.length === 0 &&
                bfClimates.length === 0 ? (
                  <EmptyStateCard
                    accent="emerald"
                    darkMode={darkMode}
                    icon={Calendar}
                    title={`No entries logged for ${backfillDate}`}
                    description="Use the forms below to backfill misting, feeding, or climate checks."
                    className="p-4 sm:p-5"
                  />
                ) : (
                  <div className="space-y-1.5">
                    {bfMists.map((m) => (
                      <div
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-1.5 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                      >
                        <span className="min-w-0 flex-1 break-words">
                          💧 <strong>{formatTimeDisplay(m.timestamp)}</strong> • {m.by}
                          {m.dropletDrinkObserved ? ' • Drank' : ''}
                          {m.note ? ` — "${m.note}"` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteModal({
                              kind: 'mist',
                              id: m.id,
                              dateKey: backfillDate,
                              label: `mist on ${backfillDate} at ${formatTimeDisplay(m.timestamp)}`
                            })
                          }
                          className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer shrink-0"
                          title="Delete mist entry"
                          aria-label="Delete mist entry"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {bfFeeds.map((f) => (
                      <div
                        key={f.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-1.5 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                      >
                        <span className="min-w-0 flex-1 break-words">
                          {f.outcome === 'refused'
                            ? `✗ Refused prey • ${f.by}`
                            : `🪰 ${f.count}× ${f.preyLabel?.split(' (')[0]} • ${f.by}`}
                          {f.abdomenAfter ? ` • Abdomen: ${f.abdomenAfter}` : ''}
                          {f.note ? ` — "${f.note}"` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteModal({
                              kind: 'feeding',
                              id: f.id,
                              dateKey: backfillDate,
                              label:
                                f.outcome === 'refused'
                                  ? `refused ${f.preyLabel?.split(' (')[0]} on ${backfillDate}`
                                  : `${f.count}× ${f.preyLabel?.split(' (')[0]} on ${backfillDate}`
                            })
                          }
                          className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer shrink-0"
                          title="Delete feeding entry"
                          aria-label="Delete feeding entry"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {bfClimates.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-1.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/20"
                      >
                        <span className="min-w-0 flex-1 break-words">
                          🌡️ <strong>{formatTimeDisplay(c.timestamp)}</strong> •{' '}
                          {c.tempC != null ? `${c.tempC}°C` : '—'}
                          {c.humidityPct != null ? ` • ${c.humidityPct}% RH` : ''}
                          {c.by ? ` • ${c.by}` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteModal({
                              kind: 'climate',
                              id: c.id,
                              dateKey: backfillDate,
                              label: `climate check on ${backfillDate} at ${formatTimeDisplay(c.timestamp)}`
                            })
                          }
                          className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer shrink-0"
                          title="Delete climate entry"
                          aria-label="Delete climate entry"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Backfill Mist */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await handleLogMist(null, backfillDate, {
                    timestamp: buildTimestampForDate(backfillDate, bfMistTime),
                    drank: bfMistDrink,
                    note: bfMistNote
                  });
                  if (ok) {
                    setBfMistDrink(false);
                    setBfMistNote('');
                  }
                }}
                className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs"
              >
                <div className="font-extrabold flex items-center gap-1.5">
                  <Droplets className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>Backfill Enclosure Mist</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="time"
                    value={bfMistTime}
                    onChange={(e) => setBfMistTime(e.target.value)}
                    className={getFieldClass('emerald', 'min-w-0')}
                  />
                  <label className="min-h-[40px] flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bfMistDrink}
                      onChange={(e) => setBfMistDrink(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    <span className="font-semibold">Drank droplets</span>
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={bfMistNote}
                    onChange={(e) => setBfMistNote(e.target.value)}
                    placeholder="Optional mist note..."
                    className={getFieldClass('emerald', 'flex-1 min-w-0')}
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold shrink-0 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
                  >
                    Add Mist
                  </button>
                </div>
              </form>

              {/* Backfill Feeding & Abdomen */}
              <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold flex items-center gap-1.5 min-w-0 break-words">
                    <Bug className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span>Backfill Feeding &amp; Abdomen</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateAbdomenOnly(bfAbdomen, backfillDate)}
                    className="min-h-[40px] px-2.5 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 hover:underline active:scale-[0.98] transition cursor-pointer shrink-0"
                  >
                    Save Abdomen Only
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {ABDOMEN_LEVELS.map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setBfAbdomen(lvl.id)}
                      className={`min-h-[40px] p-2 rounded-xl border text-left active:scale-[0.98] transition cursor-pointer ${
                        bfAbdomen === lvl.id ? lvl.activeClass : lvl.pillClass
                      }`}
                    >
                      <div className="text-xs font-extrabold">{lvl.label}</div>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2 min-w-0">
                    <select
                      value={bfPrey}
                      onChange={(e) => setBfPrey(e.target.value)}
                      className={getFieldClass('emerald', 'min-w-0')}
                    >
                      {PREY_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={bfPreyCount}
                    onChange={(e) => setBfPreyCount(Number(e.target.value) || 1)}
                    className={getFieldClass('emerald', 'min-w-0')}
                  />
                </div>
                <input
                  type="text"
                  value={bfFeedNote}
                  onChange={(e) => setBfFeedNote(e.target.value)}
                  placeholder="Optional feeding note..."
                  className={getFieldClass('emerald')}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={async () => {
                      const ok = await handleLogFeeding('eaten', backfillDate, {
                        timestamp: buildTimestampForDate(backfillDate, '12:00'),
                        preyId: bfPrey,
                        count: bfPreyCount,
                        abdomenAfter: bfAbdomen,
                        note: bfFeedNote
                      });
                      if (ok) setBfFeedNote('');
                    }}
                    className="min-h-[40px] py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
                  >
                    Log Eaten Meal
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={async () => {
                      const ok = await handleLogFeeding('refused', backfillDate, {
                        timestamp: buildTimestampForDate(backfillDate, '12:00'),
                        preyId: bfPrey,
                        count: 0,
                        abdomenAfter: bfAbdomen,
                        note: bfFeedNote
                      });
                      if (ok) setBfFeedNote('');
                    }}
                    className="min-h-[40px] py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
                  >
                    Log Refused Prey
                  </button>
                </div>
              </div>

              {/* Backfill Climate Check */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await handleLogClimate(null, backfillDate, {
                    temp: bfTemp,
                    humidity: bfHumidity
                  });
                  if (ok) {
                    setBfTemp('');
                    setBfHumidity('');
                  }
                }}
                className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
              >
                <div className="font-extrabold flex items-center gap-1.5">
                  <Thermometer className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Backfill Climate Check</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="60"
                    value={bfTemp}
                    onChange={(e) => setBfTemp(e.target.value)}
                    placeholder="Temp °C"
                    className={getFieldClass('emerald', 'min-w-0')}
                  />
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={bfHumidity}
                    onChange={(e) => setBfHumidity(e.target.value)}
                    placeholder="RH %"
                    className={getFieldClass('emerald', 'min-w-0')}
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="col-span-2 sm:col-span-1 min-h-[40px] px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
                  >
                    Add Check
                  </button>
                </div>
              </form>

              {/* Backfill Behaviours & Daily Note */}
              <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                <div className="font-extrabold flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>Behaviours &amp; Daily Note</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {BEHAVIOR_TAGS.map((tag) => {
                    const active = bfBehaviors.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleBehavior(tag, backfillDate)}
                        className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border active:scale-[0.98] transition cursor-pointer ${
                          active
                            ? 'bg-emerald-700 text-white border-emerald-800'
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
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveJournalNote(null, backfillDate, bfJournal);
                  }}
                  className="flex flex-col sm:flex-row gap-2"
                >
                  <input
                    type="text"
                    value={bfJournal}
                    onChange={(e) => setBfJournal(e.target.value)}
                    placeholder={`Observation note for ${backfillDate}...`}
                    className={getFieldClass('emerald', 'flex-1 min-w-0')}
                  />
                  <button
                    type="submit"
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold shrink-0 active:scale-[0.98] transition cursor-pointer"
                  >
                    Save Note
                  </button>
                </form>
              </div>
            </div>
          );
        })()}
      </ModalShell>
    </main>
  );
}
