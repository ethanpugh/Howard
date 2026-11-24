import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Droplets,
  Activity,
  Pill,
  FileText,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Check,
  Download,
  Printer,
  Heart,
  AlertCircle,
  ShieldCheck,
  Trash2,
  Sliders,
  Stethoscope,
  X,
  Database
} from 'lucide-react';
import {
  getLocalDateKey,
  shiftDateKey,
  escapeCSVCell
} from '../utils/householdHelpers.js';
import {
  ModuleHeader,
  SegmentedTabs,
  ModalShell,
  EmptyStateCard,
  getFieldClass
} from '../components/HowardUI.jsx';

// Unified incremental Howard sync (no duplicate standalone polling loop)

// ============================================================================
// CLINICAL CONSTANTS & PRESET OPTIONS
// ============================================================================
const BLEEDING_LEVELS = [
  {
    id: 'none',
    label: 'None',
    score: 0,
    drops: 0,
    desc: 'No bleeding today',
    dotColor: 'bg-slate-400 dark:bg-slate-500',
    pillClass: 'bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
  },
  {
    id: 'spotting',
    label: 'Spotting',
    score: 1,
    drops: 1,
    desc: 'Drops / pantyliner only',
    dotColor: 'bg-rose-300',
    pillClass: 'bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-900/60 dark:text-rose-100 dark:border-rose-700'
  },
  {
    id: 'light',
    label: 'Light',
    score: 2,
    drops: 2,
    desc: 'Light flow, regular change',
    dotColor: 'bg-rose-400',
    pillClass: 'bg-rose-200 text-rose-950 border border-rose-300 dark:bg-rose-800/80 dark:text-rose-50 dark:border-rose-600'
  },
  {
    id: 'medium',
    label: 'Medium',
    score: 3,
    drops: 3,
    desc: 'Moderate typical flow',
    dotColor: 'bg-rose-500',
    pillClass: 'bg-rose-600 text-white border border-rose-600'
  },
  {
    id: 'heavy',
    label: 'Heavy',
    score: 4,
    drops: 4,
    desc: 'High volume / frequent changes',
    dotColor: 'bg-rose-700',
    pillClass: 'bg-rose-800 text-white border border-rose-800'
  },
  {
    id: 'flooding',
    label: 'Flooding',
    score: 5,
    drops: 5,
    desc: 'Soaking hourly / double protection',
    dotColor: 'bg-red-800',
    pillClass: 'bg-red-900 text-white border border-red-900'
  }
];

const CLOT_SIZES = [
  { id: 'small', label: 'Small (<1cm)', desc: 'Pea-sized or smaller' },
  { id: 'medium', label: 'Medium (1–2cm)', desc: 'Grape / 5p coin sized' },
  { id: 'large', label: 'Large (>2cm)', desc: '10p/50p coin or larger' },
  { id: 'tissue', label: 'Decidual / Tissue-like', desc: 'Fleshy or cast-like clots' }
];

const CLOT_SIZE_LABELS = Object.fromEntries(CLOT_SIZES.map((s) => [s.id, s.label]));

const PAIN_LOCATIONS = [
  'Pelvic / Uterine',
  'Lower Back',
  'Abdomen',
  'Left Ovary',
  'Right Ovary',
  'Legs / Sciatic',
  'Rectal / Shooting',
  'Shoulder Tip',
  'Painful Urination'
];

const PAIN_TYPES = [
  'Deep Cramping',
  'Sharp / Stabbing',
  'Pulling / Tugging',
  'Throbbing Ache',
  'Burning',
  'Pelvic Heaviness'
];

const BOWEL_SEVERITIES = [
  { id: 'none', label: 'None', score: 0, activeColor: 'bg-slate-700 text-white border-slate-700' },
  { id: 'mild', label: 'Mild', score: 1, activeColor: 'bg-amber-500 text-slate-950 border-amber-600' },
  { id: 'moderate', label: 'Moderate', score: 2, activeColor: 'bg-orange-600 text-white border-orange-700' },
  { id: 'severe', label: 'Severe', score: 3, activeColor: 'bg-red-700 text-white border-red-800' }
];

const BOWEL_SYMPTOMS = [
  'Bloating / "Endo Belly"',
  'Constipation',
  'Diarrhea / Loose Stools',
  'Painful Bowel Movement',
  'Nausea',
  'Intestinal Cramping',
  'Urgency',
  'Acid Reflux'
];

const PRESET_MEDICATIONS = [
  { name: 'Ibuprofen', defaultDose: '400mg', category: 'NSAID' },
  { name: 'Paracetamol', defaultDose: '1000mg', category: 'Analgesic' },
  { name: 'Mefenamic Acid', defaultDose: '500mg', category: 'NSAID' },
  { name: 'Naproxen', defaultDose: '500mg', category: 'NSAID' },
  { name: 'Codeine / Co-codamol', defaultDose: '30mg', category: 'Opioid' },
  { name: 'Buscopan', defaultDose: '20mg', category: 'Antispasmodic' },
  { name: 'Tranexamic Acid', defaultDose: '1000mg', category: 'Anti-fibrinolytic' },
  { name: 'Dienogest / Hormones', defaultDose: '2mg', category: 'Hormonal' },
  { name: 'Magnesium / Supplements', defaultDose: 'Daily', category: 'Supplement' }
];

const MED_EFFECTIVENESS = [
  { id: 'helped', label: 'Helped', activeClass: 'bg-emerald-600 text-white border-emerald-700' },
  { id: 'partial', label: 'Partial', activeClass: 'bg-amber-500 text-slate-950 border-amber-600' },
  { id: 'none', label: 'No Relief', activeClass: 'bg-slate-600 text-white border-slate-700' }
];

const MED_EFFECTIVENESS_LABELS = Object.fromEntries(
  MED_EFFECTIVENESS.map((e) => [e.id, e.label])
);

const formatMedicationSummary = (med) => {
  if (!med) return '';
  const nameDose = [med.name, med.dose].filter(Boolean).join(' ').trim();
  const relief = med.effective ? MED_EFFECTIVENESS_LABELS[med.effective] || med.effective : '';
  return relief ? `${nameDose} (${relief})` : nameDose;
};

const EXTERNAL_FACTORS = [
  { id: 'heat_pad', label: 'Heat Pad / Hot Water Bottle', type: 'relief' },
  { id: 'tens', label: 'TENS Machine', type: 'relief' },
  { id: 'warm_bath', label: 'Warm Bath', type: 'relief' },
  { id: 'rest_day', label: 'Rest / Bed Day', type: 'relief' },
  { id: 'stretches', label: 'Pelvic Stretches', type: 'relief' },
  { id: 'poor_sleep', label: 'Poor Sleep / Insomnia', type: 'trigger' },
  { id: 'high_stress', label: 'High Stress', type: 'trigger' },
  { id: 'fatigue', label: 'Severe Fatigue', type: 'trigger' },
  { id: 'brain_fog', label: 'Brain Fog', type: 'trigger' },
  { id: 'trigger_food', label: 'Trigger Foods (Dairy/Gluten/Caffeine)', type: 'trigger' },
  { id: 'exercise', label: 'Gentle Walk / Exercise', type: 'activity' },
  { id: 'ovulation', label: 'Suspected Ovulation', type: 'cycle' }
];

// ============================================================================
// DATE & FORMATTING HELPERS
// ============================================================================
const formatDateFriendly = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const formatShortDate = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short'
  });
};

const formatShortDateWithYear = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const createEmptyEntry = (dateStr) => ({
  date: dateStr,
  bleedingSeverity: 'none',
  padCount: 0,
  tamponCount: 0,
  cupCount: 0,
  leakedThrough: false,
  hasClots: false,
  clotCount: 0,
  clotSizes: [],
  painScore: 0,
  painLocations: [],
  painTypes: [],
  bowelSeverity: 'none',
  bowelSymptoms: [],
  bowelMovementsCount: 1,
  medications: [],
  externalFactors: [],
  notes: '',
  updatedAt: new Date().toISOString()
});

const normalizeEntry = (dateStr, raw) => {
  const base = createEmptyEntry(dateStr);
  if (!raw || typeof raw !== 'object') return base;

  const rawClotCount = Number(raw.clotCount);
  const hasClots = Boolean(raw.hasClots || (Number.isFinite(rawClotCount) && rawClotCount > 0));
  const clotCount = hasClots
    ? Math.max(1, Number.isFinite(rawClotCount) && rawClotCount > 0 ? Math.round(rawClotCount) : 1)
    : 0;
  const padCount = Math.max(0, Number(raw.padCount) || 0);
  const tamponCount = Math.max(0, Number(raw.tamponCount) || 0);
  const cupCount = Math.max(0, Number(raw.cupCount) || 0);
  const painScore = Math.min(10, Math.max(0, Number(raw.painScore) || 0));
  const rawBowelMoves = Number(raw.bowelMovementsCount);
  const bowelMovementsCount =
    raw.bowelMovementsCount === null ||
    raw.bowelMovementsCount === undefined ||
    !Number.isFinite(rawBowelMoves)
      ? base.bowelMovementsCount
      : Math.max(0, Math.round(rawBowelMoves));

  const seenMedIds = new Set();
  const medications = Array.isArray(raw.medications)
    ? raw.medications
        .filter((m) => m && typeof m === 'object')
        .map((m, idx) => {
          let id =
            typeof m.id === 'string' && m.id.trim()
              ? m.id.trim()
              : `med-${dateStr}-${idx}`;
          while (seenMedIds.has(id)) {
            id = `${id}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
          }
          seenMedIds.add(id);
          return {
            ...m,
            id,
            name: m.name ?? '',
            dose: m.dose ?? '',
            timeNotes: m.timeNotes ?? '',
            effective: m.effective || 'helped'
          };
        })
    : [];

  return {
    ...base,
    ...raw,
    date: dateStr,
    bleedingSeverity:
      typeof raw.bleedingSeverity === 'string' && raw.bleedingSeverity
        ? raw.bleedingSeverity
        : base.bleedingSeverity,
    padCount,
    tamponCount,
    cupCount,
    leakedThrough: Boolean(raw.leakedThrough),
    hasClots,
    clotCount,
    clotSizes: hasClots && Array.isArray(raw.clotSizes) ? raw.clotSizes : [],
    painScore,
    painLocations: Array.isArray(raw.painLocations) ? raw.painLocations : [],
    painTypes: Array.isArray(raw.painTypes) ? raw.painTypes : [],
    bowelSeverity:
      typeof raw.bowelSeverity === 'string' && raw.bowelSeverity
        ? raw.bowelSeverity
        : base.bowelSeverity,
    bowelSymptoms: Array.isArray(raw.bowelSymptoms) ? raw.bowelSymptoms : [],
    bowelMovementsCount,
    medications,
    externalFactors: Array.isArray(raw.externalFactors) ? raw.externalFactors : [],
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt
        ? raw.updatedAt
        : base.updatedAt
  };
};

// ============================================================================
// FLOODGATE MODULE COMPONENT (INSIDE HOWARD)
// ============================================================================
export default function FloodgateApp({
  activeProfile,
  darkMode,
  floodgateSnapshot,
  navigationIntent,
  nowMs = Date.now(),
  onOpenBackupModal,
  onGlobalSync,
  showToast: appShowToast
}) {
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const todayKey = getLocalDateKey(now);

  // Local SQLite Sync State (fed by Howard's unified incremental sync)
  const [logsMap, setLogsMap] = useState(() => floodgateSnapshot?.logsByDate || {});

  // Navigation State
  const [activeTab, setActiveTab] = useState('log'); // 'log' | 'calendar' | 'insights' | 'data'
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey(new Date(nowMs)));

  // Active Day Form State
  const [formData, setFormData] = useState(() =>
    createEmptyEntry(getLocalDateKey(new Date(nowMs)))
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);

  const isDirtyRef = useRef(false);
  const selectedDateRef = useRef(selectedDate);
  const formDataRef = useRef(formData);
  const saveDayEntryRef = useRef(null);
  const editVersionRef = useRef(0);
  const inFlightMutationRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const onGlobalSyncRef = useRef(onGlobalSync);
  const profileIdRef = useRef(activeProfile?.id || 'caregiver');

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    onGlobalSyncRef.current = onGlobalSync;
  }, [onGlobalSync]);

  useEffect(() => {
    profileIdRef.current = activeProfile?.id || 'caregiver';
  }, [activeProfile?.id]);

  // Auto-save unsaved edits on tab close/refresh (pagehide) or switching away to another Howard app
  useEffect(() => {
    const flushUnsavedKeepalive = (syncAfter = false) => {
      if (!isDirtyRef.current || !formDataRef.current || !selectedDateRef.current) return;
      const profileId = profileIdRef.current || 'caregiver';
      const dateToFlush = selectedDateRef.current;
      const payload = {
        ...formDataRef.current,
        date: dateToFlush,
        updatedAt: new Date().toISOString()
      };
      fetch(
        `/api/floodgate/logs/${encodeURIComponent(dateToFlush)}?profile=${encodeURIComponent(profileId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Howard-Profile': profileId
          },
          body: JSON.stringify(payload),
          keepalive: true
        }
      )
        .then((res) => {
          let storedProfile = null;
          try {
            storedProfile = window.localStorage?.getItem('howard-active-profile');
          } catch {
            // ignore storage errors
          }
          const isStillPartner2 =
            profileIdRef.current === 'partner2' &&
            (!storedProfile || storedProfile === 'partner2');
          if (res.ok && syncAfter && isStillPartner2) {
            onGlobalSyncRef.current?.();
          }
        })
        .catch(() => {});
    };

    const handlePageHide = () => {
      flushUnsavedKeepalive(false);
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      flushUnsavedKeepalive(profileIdRef.current === 'partner2');
    };
  }, []);

  // Custom Medication Input State
  const [customMedName, setCustomMedName] = useState('');
  const [customMedDose, setCustomMedDose] = useState('');
  const [customMedTime, setCustomMedTime] = useState('');

  // Calendar View State
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date(nowMs);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Insights Range State
  const [insightsDays, setInsightsDays] = useState(90);

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState(null);

  // User Profile / Name State (defaults to Partner 2 inside Howard)
  const [ownerName, setOwnerName] = useState(activeProfile?.name || 'Partner 2');

  const showToast = useCallback(
    (msg, type = 'success') => {
      appShowToast?.(msg, type);
    },
    [appShowToast]
  );

  const applyDateSelection = useCallback((nextDate) => {
    setSelectedDate(nextDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      const [y, m] = nextDate.split('-').map(Number);
      if (Number.isFinite(y) && Number.isFinite(m)) {
        setCalendarMonth({ year: y, month: m - 1 });
      }
    }
  }, []);

  // Apply cross-app navigation intent (e.g. from Foyer or Almanac GP report link)
  useEffect(() => {
    if (!navigationIntent) return;
    let cancelled = false;
    const applyNavigationIntent = async () => {
      if (isDirtyRef.current && formDataRef.current && selectedDateRef.current && saveDayEntryRef.current) {
        const ok = await saveDayEntryRef.current(formDataRef.current, selectedDateRef.current, {
          silentToast: true
        });
        if (!ok) {
          if (!cancelled) {
            setPendingNav({ type: 'intent', target: navigationIntent });
          }
          return;
        }
        if (cancelled) return;
        showToast(`Auto-saved changes for ${formatShortDate(selectedDateRef.current)}`);
      }
      if (cancelled) return;
      if (navigationIntent.tab) setActiveTab(navigationIntent.tab);
      if (navigationIntent.date && /^\d{4}-\d{2}-\d{2}$/.test(navigationIntent.date)) {
        applyDateSelection(navigationIntent.date);
      }
    };
    applyNavigationIntent();
    return () => {
      cancelled = true;
    };
  }, [navigationIntent, showToast, applyDateSelection]);

  // --------------------------------------------------------------------------
  // 1. RECEIVE UNIFIED HOWARD SNAPSHOT UPDATES (PRESERVING UNSAVED FORM EDITS)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!floodgateSnapshot) return;

    if (
      typeof floodgateSnapshot.settings?.ownerName === 'string' &&
      floodgateSnapshot.settings.ownerName.trim()
    ) {
      setOwnerName(floodgateSnapshot.settings.ownerName.trim());
    }

    // Never overwrite optimistic logsMap entries while a save/delete mutation is in flight
    if (inFlightMutationRef.current > 0) return;

    const serverLogs = floodgateSnapshot.logsByDate || {};
    setLogsMap(serverLogs);

    if (!isDirtyRef.current) {
      const currentDate = selectedDateRef.current;
      setFormData(normalizeEntry(currentDate, serverLogs[currentDate]));
    }
  }, [floodgateSnapshot]);

  // --------------------------------------------------------------------------
  // 2. LOAD SELECTED DATE INTO FORM WHEN DATE CHANGES
  // --------------------------------------------------------------------------
  useEffect(() => {
    editVersionRef.current += 1;
    setFormData(normalizeEntry(selectedDate, logsMap[selectedDate]));
    setIsDirty(false);
    isDirtyRef.current = false;
    setSaveFailed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // --------------------------------------------------------------------------
  // 3. SAVE / DELETE / BATCH HELPERS AGAINST LOCAL SQLITE API
  // --------------------------------------------------------------------------
  const saveDayEntry = async (customEntry = null, targetDate = selectedDate, { silentToast = false } = {}) => {
    const prevLog = logsMap[targetDate];
    const saveEditVersion = editVersionRef.current;
    const profileId = activeProfile?.id || 'caregiver';
    const entryToSave = {
      ...(customEntry || formData),
      date: targetDate,
      updatedAt: new Date().toISOString()
    };

    setLogsMap((prev) => ({
      ...prev,
      [targetDate]: entryToSave
    }));

    inFlightMutationRef.current += 1;
    try {
      const res = await fetch(
        `/api/floodgate/logs/${encodeURIComponent(targetDate)}?profile=${encodeURIComponent(profileId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Howard-Profile': profileId
          },
          body: JSON.stringify(entryToSave)
        }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = await res.json();
      if (payload?.record) {
        setLogsMap((prev) => ({
          ...prev,
          [targetDate]: payload.record
        }));
      }
      if (
        targetDate === selectedDateRef.current &&
        editVersionRef.current === saveEditVersion
      ) {
        setIsDirty(false);
        isDirtyRef.current = false;
      }
      setSaveFailed(false);
      setPendingNav(null);
      if (onGlobalSyncRef.current) onGlobalSyncRef.current();
      if (!silentToast) {
        showToast(`Saved ${ownerName ? `${ownerName}'s ` : ''}log for ${formatShortDate(targetDate)}`);
      }
      return true;
    } catch (err) {
      console.error('Failed to save entry:', err);
      setLogsMap((prev) => {
        const next = { ...prev };
        if (prevLog) next[targetDate] = prevLog;
        else delete next[targetDate];
        return next;
      });
      setSaveFailed(true);
      showToast('Could not save log to server — retry or discard unsaved changes', 'error');
      return false;
    } finally {
      inFlightMutationRef.current = Math.max(0, inFlightMutationRef.current - 1);
    }
  };
  saveDayEntryRef.current = saveDayEntry;

  const handleSelectDate = async (nextDate) => {
    if (!nextDate || nextDate === selectedDate) return;
    if (isTransitioningRef.current || inFlightMutationRef.current > 0) return;
    isTransitioningRef.current = true;
    try {
      if (isDirtyRef.current) {
        const ok = await saveDayEntry(formDataRef.current, selectedDate, { silentToast: true });
        if (!ok) {
          setPendingNav({ type: 'date', target: nextDate });
          return;
        }
        showToast(`Auto-saved changes for ${formatShortDate(selectedDate)}`);
      }
      setPendingNav(null);
      applyDateSelection(nextDate);
    } finally {
      isTransitioningRef.current = false;
    }
  };

  const handleSwitchTab = async (nextTab) => {
    if (nextTab === activeTab) return;
    if (isTransitioningRef.current || inFlightMutationRef.current > 0) return;
    isTransitioningRef.current = true;
    try {
      if (isDirtyRef.current) {
        const ok = await saveDayEntry(formDataRef.current, selectedDate, { silentToast: true });
        if (!ok) {
          setPendingNav({ type: 'tab', target: nextTab });
          return;
        }
        showToast(`Auto-saved changes for ${formatShortDate(selectedDate)}`);
      }
      setPendingNav(null);
      setActiveTab(nextTab);
    } finally {
      isTransitioningRef.current = false;
    }
  };

  const discardPendingNavigation = () => {
    const nav = pendingNav;
    editVersionRef.current += 1;
    setFormData(normalizeEntry(selectedDate, logsMap[selectedDate]));
    setIsDirty(false);
    isDirtyRef.current = false;
    setSaveFailed(false);
    setPendingNav(null);

    if (nav?.type === 'date' && nav.target) {
      applyDateSelection(nav.target);
    } else if (nav?.type === 'tab' && nav.target) {
      setActiveTab(nav.target);
    } else if (nav?.type === 'intent' && nav.target) {
      if (nav.target.tab) setActiveTab(nav.target.tab);
      if (nav.target.date && /^\d{4}-\d{2}-\d{2}$/.test(nav.target.date)) {
        applyDateSelection(nav.target.date);
      }
    }
    showToast(`Discarded unsaved edits for ${formatShortDate(selectedDate)}`, 'info');
  };

  const retryPendingNavigation = async () => {
    if (isTransitioningRef.current || inFlightMutationRef.current > 0) return;
    const nav = pendingNav;
    const prevDate = selectedDate;
    const ok = await saveDayEntry(formDataRef.current, selectedDate, { silentToast: Boolean(nav) });
    if (!ok) return;
    if (nav?.type === 'date' && nav.target) {
      showToast(`Auto-saved changes for ${formatShortDate(prevDate)}`);
      applyDateSelection(nav.target);
    } else if (nav?.type === 'tab' && nav.target) {
      showToast(`Auto-saved changes for ${formatShortDate(prevDate)}`);
      setActiveTab(nav.target);
    } else if (nav?.type === 'intent' && nav.target) {
      showToast(`Auto-saved changes for ${formatShortDate(prevDate)}`);
      if (nav.target.tab) setActiveTab(nav.target.tab);
      if (nav.target.date && /^\d{4}-\d{2}-\d{2}$/.test(nav.target.date)) {
        applyDateSelection(nav.target.date);
      }
    }
  };

  const deleteDayEntry = async (dateToDelete) => {
    const prevLog = logsMap[dateToDelete];
    const prevForm = formData;
    const prevDirty = isDirty;
    const profileId = activeProfile?.id || 'caregiver';

    setLogsMap((prev) => {
      const copy = { ...prev };
      delete copy[dateToDelete];
      return copy;
    });
    if (dateToDelete === selectedDate) {
      editVersionRef.current += 1;
      setFormData(createEmptyEntry(selectedDate));
      setIsDirty(false);
      isDirtyRef.current = false;
      setSaveFailed(false);
      setPendingNav(null);
    }

    inFlightMutationRef.current += 1;
    try {
      const res = await fetch(
        `/api/floodgate/logs/${encodeURIComponent(dateToDelete)}?profile=${encodeURIComponent(profileId)}`,
        {
          method: 'DELETE',
          headers: {
            'X-Howard-Profile': profileId
          }
        }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (onGlobalSyncRef.current) onGlobalSyncRef.current();
      showToast(`Deleted log for ${formatShortDate(dateToDelete)}`);
    } catch (err) {
      console.error('Error deleting entry:', err);
      setLogsMap((prev) => {
        const restored = { ...prev };
        if (prevLog) restored[dateToDelete] = prevLog;
        return restored;
      });
      if (dateToDelete === selectedDateRef.current) {
        setFormData(prevForm);
        setIsDirty(prevDirty);
        isDirtyRef.current = prevDirty;
      }
      showToast('Could not delete from server — reverted', 'error');
    } finally {
      inFlightMutationRef.current = Math.max(0, inFlightMutationRef.current - 1);
    }
  };

  const copyYesterdayMedications = () => {
    const prevDate = shiftDateKey(selectedDate, -1);
    const prevLog = logsMap[prevDate];
    if (!prevLog || !Array.isArray(prevLog.medications) || prevLog.medications.length === 0) {
      showToast(`No medications found on ${formatShortDate(prevDate)}`, 'info');
      return;
    }
    const copiedMeds = prevLog.medications.map((m) => ({
      ...m,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    }));
    updateField('medications', [...formData.medications, ...copiedMeds]);
    showToast(`Copied ${copiedMeds.length} medication(s) from ${formatShortDate(prevDate)}`);
  };

  const updateField = (field, value) => {
    editVersionRef.current += 1;
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'clotCount' && value > 0) {
        updated.hasClots = true;
      }
      if (field === 'hasClots' && !value) {
        updated.clotCount = 0;
        updated.clotSizes = [];
      }
      if (field === 'bleedingSeverity' && value === 'none') {
        updated.leakedThrough = false;
        updated.padCount = 0;
        updated.tamponCount = 0;
        updated.cupCount = 0;
      }
      return updated;
    });
    setIsDirty(true);
    isDirtyRef.current = true;
  };

  const toggleArrayItem = (field, item) => {
    const current = Array.isArray(formData[field]) ? formData[field] : [];
    const exists = current.includes(item);
    const next = exists ? current.filter((i) => i !== item) : [...current, item];
    updateField(field, next);
  };

  const handleAddPresetMed = (preset) => {
    const nowTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const newMed = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: preset.name,
      dose: preset.defaultDose,
      timeNotes: nowTime,
      effective: 'helped'
    };
    updateField('medications', [...formData.medications, newMed]);
  };

  const handleAddCustomMed = (e) => {
    e.preventDefault();
    if (!customMedName.trim()) return;
    const nowTime = customMedTime.trim() || new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const newMed = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: customMedName.trim(),
      dose: customMedDose.trim() || 'Standard dose',
      timeNotes: nowTime,
      effective: 'helped'
    };
    updateField('medications', [...formData.medications, newMed]);
    setCustomMedName('');
    setCustomMedDose('');
    setCustomMedTime('');
  };

  const updateMedicationItem = (id, key, val) => {
    const updated = formData.medications.map((m) => (m.id === id ? { ...m, [key]: val } : m));
    updateField('medications', updated);
  };

  const removeMedicationItem = (id) => {
    updateField(
      'medications',
      formData.medications.filter((m) => m.id !== id)
    );
  };

  // --------------------------------------------------------------------------
  // 4. DERIVED DATA FOR CALENDAR, INSIGHTS & GP REPORT
  // --------------------------------------------------------------------------
  const sortedLogs = useMemo(() => {
    return Object.values(logsMap)
      .filter((item) => item && item.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [logsMap]);

  const weekStripDates = useMemo(() => {
    const dates = [];
    for (let i = -5; i <= 1; i++) {
      dates.push(shiftDateKey(selectedDate, i));
    }
    return dates;
  }, [selectedDate]);

  const insightsData = useMemo(() => {
    const today = todayKey;
    const cutoffDate = shiftDateKey(today, -(insightsDays - 1));
    const periodLogs = sortedLogs.filter((l) => l.date >= cutoffDate && l.date <= today);

    const totalLoggedDays = periodLogs.length;
    const bleedingDays = periodLogs.filter((l) => l.bleedingSeverity && l.bleedingSeverity !== 'none');
    const heavyDays = periodLogs.filter((l) => l.bleedingSeverity === 'heavy' || l.bleedingSeverity === 'flooding');
    const clotDays = periodLogs.filter((l) => l.hasClots || l.clotCount > 0);
    const largeClotDays = periodLogs.filter((l) => Array.isArray(l.clotSizes) && (l.clotSizes.includes('large') || l.clotSizes.includes('tissue')));
    const totalClotsCount = periodLogs.reduce((acc, l) => acc + (Number(l.clotCount) || 0), 0);

    const avgPainAll = totalLoggedDays > 0
      ? (periodLogs.reduce((acc, l) => acc + (Number(l.painScore) || 0), 0) / totalLoggedDays).toFixed(1)
      : '0.0';
    const highPainDays = periodLogs.filter((l) => Number(l.painScore) >= 6);

    const bowelFlareDays = periodLogs.filter((l) => l.bowelSeverity === 'moderate' || l.bowelSeverity === 'severe');

    const painLocationCounts = {};
    const bowelSymptomCounts = {};
    const medCounts = {};
    const factorCounts = {};

    periodLogs.forEach((l) => {
      (l.painLocations || []).forEach((loc) => {
        painLocationCounts[loc] = (painLocationCounts[loc] || 0) + 1;
      });
      (l.bowelSymptoms || []).forEach((sym) => {
        bowelSymptomCounts[sym] = (bowelSymptomCounts[sym] || 0) + 1;
      });
      (l.medications || []).forEach((m) => {
        medCounts[m.name] = (medCounts[m.name] || 0) + 1;
      });
      (l.externalFactors || []).forEach((fId) => {
        const found = EXTERNAL_FACTORS.find((ef) => ef.id === fId);
        const label = found ? found.label : fId;
        factorCounts[label] = (factorCounts[label] || 0) + 1;
      });
    });

    const sortCounts = (obj) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

    return {
      periodLogs,
      totalLoggedDays,
      bleedingDaysCount: bleedingDays.length,
      heavyDaysCount: heavyDays.length,
      clotDaysCount: clotDays.length,
      largeClotDaysCount: largeClotDays.length,
      totalClotsCount,
      avgPainAll,
      highPainDaysCount: highPainDays.length,
      bowelFlareDaysCount: bowelFlareDays.length,
      topPainLocations: sortCounts(painLocationCounts),
      topBowelSymptoms: sortCounts(bowelSymptomCounts),
      topMedications: sortCounts(medCounts),
      topFactors: sortCounts(factorCounts)
    };
  }, [sortedLogs, insightsDays, todayKey]);

  // --------------------------------------------------------------------------
  // 5. EXPORT / IMPORT / DEMO DATA UTILITIES
  // --------------------------------------------------------------------------
  const getSafeOwnerSlug = () => {
    if (!ownerName || !ownerName.trim()) return '';
    return `_${ownerName.trim().replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
  };

  const exportJSON = () => {
    const payload = {
      app: 'Floodgate',
      owner: ownerName || 'Partner 2',
      exportedAt: new Date().toISOString(),
      recordCount: Object.keys(logsMap).length,
      logs: logsMap
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Floodgate${getSafeOwnerSlug()}_Backup_${todayKey}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Exported Floodgate JSON backup file');
  };

  const exportCSV = () => {
    const factorLabelMap = Object.fromEntries(EXTERNAL_FACTORS.map((f) => [f.id, f.label]));

    const headers = [
      'Date',
      'Bleeding_Severity',
      'Pads',
      'Tampons',
      'Cups_Underwear',
      'Leaked_Through',
      'Clots_Present',
      'Clot_Count',
      'Clot_Sizes',
      'Pain_Score_0_to_10',
      'Pain_Locations',
      'Pain_Types',
      'Bowel_Severity',
      'Bowel_Symptoms',
      'Bowel_Movements',
      'Medications_Taken',
      'External_Factors',
      'Daily_Notes'
    ].map(escapeCSVCell);

    const rows = sortedLogs.map((l) => [
      escapeCSVCell(l.date),
      escapeCSVCell(l.bleedingSeverity),
      escapeCSVCell(l.padCount || 0),
      escapeCSVCell(l.tamponCount || 0),
      escapeCSVCell(l.cupCount || 0),
      escapeCSVCell(l.leakedThrough ? 'Yes' : 'No'),
      escapeCSVCell(l.hasClots ? 'Yes' : 'No'),
      escapeCSVCell(l.clotCount || 0),
      escapeCSVCell((l.clotSizes || []).map((id) => CLOT_SIZE_LABELS[id] || id).join('; ')),
      escapeCSVCell(l.painScore || 0),
      escapeCSVCell((l.painLocations || []).join('; ')),
      escapeCSVCell((l.painTypes || []).join('; ')),
      escapeCSVCell(l.bowelSeverity || 'none'),
      escapeCSVCell((l.bowelSymptoms || []).join('; ')),
      escapeCSVCell(l.bowelMovementsCount ?? ''),
      escapeCSVCell(
        (l.medications || [])
          .map((m) => {
            const effLabel = m.effective ? MED_EFFECTIVENESS_LABELS[m.effective] || m.effective : '';
            return `${m.name} (${m.dose} @ ${m.timeNotes}${effLabel ? ` - ${effLabel}` : ''})`;
          })
          .join('; ')
      ),
      escapeCSVCell((l.externalFactors || []).map((id) => factorLabelMap[id] || id).join('; ')),
      escapeCSVCell(l.notes || '')
    ]);

    const csvString = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Floodgate${getSafeOwnerSlug()}_Report_${todayKey}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Exported CSV spreadsheet for Excel/GP');
  };

  // --------------------------------------------------------------------------
  // CALENDAR HELPER CALCULATIONS
  // --------------------------------------------------------------------------
  const calendarGrid = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7;

    const cells = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const dateStr = `${year}-${mStr}-${dStr}`;
      cells.push({
        dayNumber: d,
        dateStr,
        log: logsMap[dateStr] || null
      });
    }
    return cells;
  }, [calendarMonth, logsMap]);

  const getPainBadgeStyle = (score) => {
    const s = Number(score) || 0;
    if (s === 0) return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    if (s <= 3) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
    if (s <= 6) return 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300';
    if (s <= 8) return 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300';
    return 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-300 font-bold';
  };

  // ============================================================================
  // RENDER UI
  // ============================================================================
  return (
    <>
      {/* CUSTOM CONFIRMATION MODAL */}
      <ModalShell
        isOpen={Boolean(confirmModal)}
        onClose={() => setConfirmModal(null)}
        title={confirmModal?.title || ''}
        icon={AlertCircle}
        accent="rose"
        darkMode={darkMode}
        maxWidthClass="max-w-md"
        footer={
          confirmModal ? (
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-sm font-medium border active:scale-[0.98] transition cursor-pointer ${
                  darkMode
                    ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-sm font-semibold text-white active:scale-[0.98] transition cursor-pointer ${
                  confirmModal.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {confirmModal.confirmText || 'Confirm'}
              </button>
            </div>
          ) : null
        }
      >
        {confirmModal && (
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {confirmModal.message}
          </p>
        )}
      </ModalShell>

      {/* ====================================================================
          MAIN CONTENT CONTAINER + FLOODGATE HEADER & SUB-TABS
      ==================================================================== */}
      <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
        <ModuleHeader
          accent="rose"
          icon={Heart}
          title={`Floodgate • ${ownerName}'s Journal`}
          subtitle="Period, Blood Clots, Pain & Endometriosis Clinical Tracker"
          badges={
            <span className="text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 whitespace-nowrap">
              Private Module
            </span>
          }
          darkMode={darkMode}
          className="no-print"
          footer={
            <SegmentedTabs
              accent="rose"
              darkMode={darkMode}
              activeId={activeTab}
              onChange={handleSwitchTab}
              tabs={[
                { id: 'log', label: 'Daily Log', shortLabel: 'Log', icon: Droplets },
                { id: 'calendar', label: 'Cycle Calendar', shortLabel: 'Calendar', icon: CalendarIcon },
                {
                  id: 'insights',
                  label: 'Insights & GP Report',
                  shortLabel: 'Insights',
                  icon: Stethoscope
                },
                { id: 'data', label: 'Export & Data', shortLabel: 'Export', icon: ShieldCheck }
              ]}
            />
          }
        />

        {isDirty && (pendingNav || saveFailed) && (
          <div
            role="alert"
            className="no-print rounded-2xl p-3.5 sm:p-4 border border-rose-500/40 bg-rose-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-100">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold">
                  Unable to save changes for {formatShortDate(selectedDate)}
                </div>
                <p className="text-rose-800 dark:text-rose-200">
                  {pendingNav
                    ? 'You can retry saving when reconnected, or discard your unsaved edits to leave this view.'
                    : 'The server could not be reached. Retry saving or discard your unsaved edits.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={retryPendingNavigation}
                className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white active:scale-[0.98] transition cursor-pointer"
              >
                {pendingNav ? 'Retry Save & Continue' : 'Retry Save'}
              </button>
              <button
                type="button"
                onClick={discardPendingNavigation}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold border active:scale-[0.98] transition cursor-pointer ${
                  darkMode
                    ? 'border-rose-400/50 text-rose-200 hover:bg-rose-500/20'
                    : 'border-rose-300 bg-white text-rose-800 hover:bg-rose-50'
                }`}
              >
                Discard Unsaved Changes
              </button>
            </div>
          </div>
        )}

        {/* ==================================================================
            TAB 1: DAILY SYMPTOM & PERIOD LOG
        ================================================================== */}
        {activeTab === 'log' && (
          <div className="space-y-4 sm:space-y-5">
            {/* DATE NAVIGATOR & 7-DAY STRIP */}
            <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleSelectDate(shiftDateKey(selectedDate, -1))}
                    className={`min-w-[40px] min-h-[40px] p-2 rounded-xl border flex items-center justify-center shrink-0 active:scale-[0.98] transition cursor-pointer ${
                      darkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                    aria-label="Previous day"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  <div className="px-2 text-center sm:text-left">
                    <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                      <h2 className="text-base sm:text-xl font-bold">
                        {formatDateFriendly(selectedDate)}
                      </h2>
                      {selectedDate === todayKey && (
                        <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                          Today
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {logsMap[selectedDate] ? 'Logged entry saved for this date' : 'No entry saved yet for this date'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectDate(shiftDateKey(selectedDate, 1))}
                    className={`min-w-[40px] min-h-[40px] p-2 rounded-xl border flex items-center justify-center shrink-0 active:scale-[0.98] transition cursor-pointer ${
                      darkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                    aria-label="Next day"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {/* Quick Save, Date Picker & Quick Today Button */}
                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                  {isDirty && (
                    <button
                      type="button"
                      onClick={() => saveDayEntry()}
                      title={`Save log for ${formatShortDate(selectedDate)}`}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>Save</span>
                    </button>
                  )}
                  {selectedDate !== todayKey && (
                    <button
                      type="button"
                      onClick={() => handleSelectDate(todayKey)}
                      className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 active:scale-[0.98] transition cursor-pointer"
                    >
                      Jump to Today
                    </button>
                  )}
                  <div className="min-w-[145px] flex-1 sm:flex-initial sm:w-44">
                    <input
                      type="date"
                      value={selectedDate}
                      aria-label="Select log date"
                      onChange={(e) => e.target.value && handleSelectDate(e.target.value)}
                      className={getFieldClass('rose', 'min-h-[40px] font-medium', { compact: true })}
                    />
                  </div>
                  {logsMap[selectedDate] && (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmModal({
                          title: 'Clear This Day’s Log?',
                          message: `Are you sure you want to delete the logged symptoms for ${formatDateFriendly(selectedDate)}?`,
                          confirmText: 'Delete Log',
                          danger: true,
                          onConfirm: () => deleteDayEntry(selectedDate)
                        })
                      }
                      title="Clear this day's entry"
                      aria-label="Clear this day's entry"
                      className="min-w-[40px] min-h-[40px] p-2 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* 7-Day Quick Selector Strip */}
              <div className="grid grid-cols-7 gap-1 sm:gap-2 pt-4">
                {weekStripDates.map((dStr) => {
                  const [y, m, d] = dStr.split('-').map(Number);
                  const dateObj = new Date(y, m - 1, d);
                  const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'short' });
                  const isSelected = dStr === selectedDate;
                  const dayLog = logsMap[dStr];
                  const bleedInfo = BLEEDING_LEVELS.find((b) => b.id === (dayLog?.bleedingSeverity || 'none'));

                  return (
                    <button
                      key={dStr}
                      type="button"
                      onClick={() => handleSelectDate(dStr)}
                      className={`flex flex-col items-center py-2 px-0.5 sm:px-1 rounded-2xl border transition-all active:scale-[0.98] cursor-pointer ${
                        isSelected
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : darkMode
                            ? 'bg-slate-800/60 border-slate-800 hover:bg-slate-800 text-slate-300'
                            : 'bg-slate-50/80 border-slate-200/70 hover:bg-rose-50/50 text-slate-700'
                      }`}
                    >
                      <span className={`text-[11px] sm:text-xs font-medium ${isSelected ? 'text-rose-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        {dayName}
                      </span>
                      <span className="text-sm sm:text-base font-bold my-0.5">{d}</span>
                      <div className="flex items-center gap-1 h-2 mt-0.5">
                        {dayLog?.bleedingSeverity && dayLog.bleedingSeverity !== 'none' && (
                          <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : bleedInfo?.dotColor || 'bg-rose-500'}`} />
                        )}
                        {dayLog?.hasClots && (
                          <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-purple-200' : 'bg-purple-600'}`} />
                        )}
                        {Number(dayLog?.painScore) >= 6 && (
                          <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-amber-200' : 'bg-amber-500'}`} />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* MAIN TWO-COLUMN LOGGING GRID FOR TABLET & DESKTOP */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
              {/* 1. BLEEDING & CLOTS CARD */}
              <section className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-5 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                      <Droplets className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-bold">Period &amp; Bleeding</h3>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Flow severity, sanitary products &amp; blood clots
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-slate-600 dark:text-slate-300">
                    Bleeding Severity
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {BLEEDING_LEVELS.map((level) => {
                      const active = formData.bleedingSeverity === level.id;
                      return (
                        <button
                          key={level.id}
                          type="button"
                          onClick={() => updateField('bleedingSeverity', level.id)}
                          className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all active:scale-[0.98] cursor-pointer ${
                            active
                              ? 'border-rose-600 ring-2 ring-rose-600/30 bg-rose-500/10 dark:bg-rose-500/15 text-slate-900 dark:text-slate-100 shadow-xs'
                              : darkMode
                                ? 'bg-slate-800/60 border-slate-700 text-slate-200 hover:bg-slate-800'
                                : 'bg-slate-50/80 border-slate-200 text-slate-800 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5 w-full mb-1 min-w-0">
                            <span className="font-bold text-sm leading-tight">{level.label}</span>
                            <div className="flex gap-0.5 shrink-0">
                              {Array.from({ length: Math.max(1, level.drops) }).map((_, idx) => (
                                <span
                                  key={idx}
                                  className={`w-1 h-2.5 rounded-full ${
                                    level.drops === 0
                                      ? 'bg-slate-300 dark:bg-slate-600'
                                      : level.dotColor
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <span className={`text-xs leading-tight ${active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                            {level.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {formData.bleedingSeverity !== 'none' && (
                  <div className={`p-4 rounded-2xl border space-y-4 ${
                    darkMode ? 'bg-slate-800/40 border-slate-800' : 'bg-rose-50/40 border-rose-100'
                  }`}>
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Protection Used Today (Optional)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { field: 'padCount', label: 'Pads' },
                        { field: 'tamponCount', label: 'Tampons' },
                        { field: 'cupCount', label: 'Cups / Pants' }
                      ].map((item) => (
                        <div
                          key={item.field}
                          className={`p-2.5 rounded-xl border text-center ${
                            darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="text-xs font-medium mb-1.5">{item.label}</div>
                          <div className="flex items-center justify-between gap-1">
                            <button
                              type="button"
                              aria-label={`Decrease ${item.label}`}
                              onClick={() => updateField(item.field, Math.max(0, (formData[item.field] || 0) - 1))}
                              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-bold text-sm">{formData[item.field] || 0}</span>
                            <button
                              type="button"
                              aria-label={`Increase ${item.label}`}
                              onClick={() => updateField(item.field, (formData[item.field] || 0) + 1)}
                              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 hover:bg-rose-200 active:scale-[0.98] transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => updateField('leakedThrough', !formData.leakedThrough)}
                      className={`w-full min-h-[40px] flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer ${
                        formData.leakedThrough
                          ? 'bg-red-700 text-white border-red-800'
                          : darkMode
                            ? 'bg-slate-900 border-slate-700 text-slate-300'
                            : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <span>Leaked through clothes or bedding today</span>
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
                        formData.leakedThrough ? 'bg-white text-red-700' : 'border border-slate-300 dark:border-slate-600'
                      }`}>
                        {formData.leakedThrough && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </button>
                  </div>
                )}

                {/* CLOTS TRACKER SECTION */}
                <div className={`p-4 rounded-2xl border space-y-4 ${
                  formData.hasClots
                    ? darkMode
                      ? 'bg-purple-950/30 border-purple-800/70'
                      : 'bg-purple-50/60 border-purple-200'
                    : darkMode
                      ? 'bg-slate-800/40 border-slate-800'
                      : 'bg-slate-50/70 border-slate-200/80'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-sm flex items-center gap-2">
                        <span>Blood Clots Tracker</span>
                        {formData.hasClots && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-600 text-white font-semibold">
                            {formData.clotCount || 1} logged
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300">Did you pass any blood clots today?</p>
                    </div>

                    <div className="flex gap-1 rounded-2xl p-1 bg-slate-200/70 dark:bg-slate-950/70 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => updateField('hasClots', false)}
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer ${
                          !formData.hasClots
                            ? darkMode
                              ? 'bg-slate-700 text-white shadow-2xs'
                              : 'bg-white text-slate-800 shadow-2xs'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        No Clots
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateField('hasClots', true);
                          if (!formData.clotCount) updateField('clotCount', 1);
                        }}
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer ${
                          formData.hasClots
                            ? 'bg-purple-600 text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Yes, Clots
                      </button>
                    </div>
                  </div>

                  {formData.hasClots && (
                    <div className="space-y-4 pt-2 border-t border-purple-200/60 dark:border-purple-900/50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">Approximate number of clots:</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            aria-label="Decrease clot count"
                            onClick={() => updateField('clotCount', Math.max(1, (formData.clotCount || 1) - 1))}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-purple-200 dark:border-slate-700 hover:bg-purple-100 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="text-base font-bold w-8 text-center">
                            {formData.clotCount || 1}
                          </span>
                          <button
                            type="button"
                            aria-label="Increase clot count"
                            onClick={() => updateField('clotCount', (formData.clotCount || 0) + 1)}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98] transition cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="block text-xs font-semibold mb-2">Clot Size(s) Observed:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {CLOT_SIZES.map((sz) => {
                            const selected = (formData.clotSizes || []).includes(sz.id);
                            return (
                              <button
                                key={sz.id}
                                type="button"
                                onClick={() => toggleArrayItem('clotSizes', sz.id)}
                                className={`min-h-[40px] p-2.5 rounded-xl border text-left transition-all active:scale-[0.98] cursor-pointer ${
                                  selected
                                    ? 'bg-purple-700 text-white border-purple-700'
                                    : darkMode
                                      ? 'bg-slate-900 border-slate-700 text-slate-200'
                                      : 'bg-white border-purple-200 text-slate-800 hover:bg-purple-50'
                                }`}
                              >
                                <div className="text-xs font-bold">{sz.label}</div>
                                <div className={`text-xs ${selected ? 'text-purple-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                  {sz.desc}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* 2. PAIN & PELVIC SYMPTOMS CARD */}
              <section className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-5 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 shrink-0">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-bold">Endo Pain &amp; Cramping</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Severity scale (0–10), body locations &amp; pain sensations
                      </p>
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-2xl text-sm font-bold shrink-0 whitespace-nowrap ${getPainBadgeStyle(formData.painScore)}`}>
                    {formData.painScore} / 10
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                    <span>0 • No Pain</span>
                    <span>5 • Moderate</span>
                    <span>10 • Bedbound</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={formData.painScore}
                    onChange={(e) => updateField('painScore', Number(e.target.value))}
                    className="w-full accent-rose-600 h-2.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                  />
                  <div className="grid grid-cols-6 sm:grid-cols-11 lg:grid-cols-6 xl:grid-cols-11 gap-1.5 xl:gap-1">
                    {Array.from({ length: 11 }).map((_, num) => {
                      const active = Number(formData.painScore) === num;
                      return (
                        <button
                          key={num}
                          type="button"
                          onClick={() => updateField('painScore', num)}
                          className={`min-h-[40px] py-2 rounded-xl text-xs font-bold border transition-all active:scale-[0.98] cursor-pointer ${
                            active
                              ? 'bg-rose-600 text-white border-rose-600 scale-105 shadow-xs'
                              : darkMode
                                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-rose-50'
                          }`}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-slate-600 dark:text-slate-300">
                    Where is the pain located?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PAIN_LOCATIONS.map((loc) => {
                      const active = (formData.painLocations || []).includes(loc);
                      return (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => toggleArrayItem('painLocations', loc)}
                          className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                            active
                              ? 'bg-amber-700 text-white border-amber-800 shadow-2xs'
                              : darkMode
                                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-amber-50'
                          }`}
                        >
                          {loc}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-slate-600 dark:text-slate-300">
                    Type of Pain
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PAIN_TYPES.map((pt) => {
                      const active = (formData.painTypes || []).includes(pt);
                      return (
                        <button
                          key={pt}
                          type="button"
                          onClick={() => toggleArrayItem('painTypes', pt)}
                          className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                            active
                              ? 'bg-rose-600 text-white border-rose-600'
                              : darkMode
                                ? 'bg-slate-800/50 border-slate-700 text-slate-300'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {pt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* 3. BOWEL & GI ISSUES CARD */}
              <section className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-5 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-2xl bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                      <Sliders className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-bold">Bowel &amp; GI Symptoms</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        &ldquo;Endo belly&rdquo; bloating, bowel pain &amp; digestive changes
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-slate-600 dark:text-slate-300">
                    Overall Bowel / GI Distress
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {BOWEL_SEVERITIES.map((sev) => {
                      const active = formData.bowelSeverity === sev.id;
                      return (
                        <button
                          key={sev.id}
                          type="button"
                          onClick={() => updateField('bowelSeverity', sev.id)}
                          className={`min-h-[40px] py-2.5 px-2 rounded-xl text-xs font-bold border transition-all active:scale-[0.98] cursor-pointer ${
                            active
                              ? sev.activeColor + ' shadow-xs'
                              : darkMode
                                ? 'bg-slate-800 border-slate-700 text-slate-300'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {sev.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-slate-600 dark:text-slate-300">
                    Specific Bowel &amp; GI Symptoms
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {BOWEL_SYMPTOMS.map((sym) => {
                      const active = (formData.bowelSymptoms || []).includes(sym);
                      return (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => {
                            toggleArrayItem('bowelSymptoms', sym);
                            if (formData.bowelSeverity === 'none' && !active) {
                              updateField('bowelSeverity', 'mild');
                            }
                          }}
                          className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                            active
                              ? 'bg-orange-600 text-white border-orange-700 shadow-2xs'
                              : darkMode
                                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-orange-50'
                          }`}
                        >
                          {sym}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                  darkMode ? 'bg-slate-800/50 border-slate-800' : 'bg-slate-50 border-slate-200/80'
                }`}>
                  <div>
                    <div className="text-xs font-bold">Bowel Movements Today</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Helpful for tracking constipation vs frequency</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Decrease bowel movements"
                      onClick={() => updateField('bowelMovementsCount', Math.max(0, (formData.bowelMovementsCount || 0) - 1))}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 active:scale-[0.98] transition cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-bold text-sm w-6 text-center">{formData.bowelMovementsCount ?? 0}</span>
                    <button
                      type="button"
                      aria-label="Increase bowel movements"
                      onClick={() => updateField('bowelMovementsCount', (formData.bowelMovementsCount || 0) + 1)}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 active:scale-[0.98] transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </section>

              {/* 4. MEDICATIONS & EXTERNAL FACTORS CARD */}
              <section className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-5 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <Pill className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-bold">Medication &amp; Relief</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Painkillers, hormones, heat therapy &amp; daily triggers
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={copyYesterdayMedications}
                    className="min-h-[40px] text-xs font-semibold px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 active:scale-[0.98] transition cursor-pointer"
                  >
                    Copy Yesterday&apos;s Meds
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-slate-600 dark:text-slate-300">
                    Tap to Log Medication
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_MEDICATIONS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => handleAddPresetMed(preset)}
                        className={`min-h-[40px] flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                          darkMode
                            ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-emerald-950 hover:border-emerald-700'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>{preset.name}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">({preset.defaultDose})</span>
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleAddCustomMed} className="grid grid-cols-2 xl:grid-cols-12 gap-2">
                  <input
                    type="text"
                    placeholder="Custom medication..."
                    value={customMedName}
                    onChange={(e) => setCustomMedName(e.target.value)}
                    className={getFieldClass('rose', 'col-span-2 xl:col-span-4', { compact: true })}
                  />
                  <input
                    type="text"
                    placeholder="Dose (e.g. 500mg)"
                    value={customMedDose}
                    onChange={(e) => setCustomMedDose(e.target.value)}
                    className={getFieldClass('rose', 'col-span-1 xl:col-span-3', { compact: true })}
                  />
                  <input
                    type="text"
                    placeholder="Time (optional)"
                    value={customMedTime}
                    onChange={(e) => setCustomMedTime(e.target.value)}
                    className={getFieldClass('rose', 'col-span-1 xl:col-span-2', { compact: true })}
                  />
                  <button
                    type="submit"
                    className="col-span-2 xl:col-span-3 min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 active:scale-[0.98] transition cursor-pointer"
                  >
                    + Add Med
                  </button>
                </form>

                {formData.medications.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Taken on {formatShortDate(selectedDate)}:</div>
                    {formData.medications.map((med) => (
                      <div
                        key={med.id}
                        className={`flex flex-col gap-2 p-3 rounded-2xl border ${
                          darkMode ? 'bg-slate-800/70 border-slate-700' : 'bg-emerald-50/40 border-emerald-200/80'
                        }`}
                      >
                        <div className="flex flex-wrap xl:flex-nowrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-[130px]">
                            <Pill className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="font-bold text-xs">{med.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-24 sm:w-28 shrink-0">
                              <input
                                type="text"
                                value={med.dose}
                                onChange={(e) => updateMedicationItem(med.id, 'dose', e.target.value)}
                                placeholder="Dose"
                                className={getFieldClass('rose', '', { compact: true })}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={med.timeNotes}
                                onChange={(e) => updateMedicationItem(med.id, 'timeNotes', e.target.value)}
                                placeholder="Time(s)"
                                className={getFieldClass('rose', '', { compact: true })}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeMedicationItem(med.id)}
                              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer shrink-0"
                              title="Remove medication"
                              aria-label={`Remove ${med.name}`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-emerald-200/40 dark:border-slate-700/60">
                          <span className="text-xs text-slate-600 dark:text-slate-300">Relief effectiveness:</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {MED_EFFECTIVENESS.map((eff) => {
                              const active = (med.effective || 'helped') === eff.id;
                              return (
                                <button
                                  key={eff.id}
                                  type="button"
                                  onClick={() => updateMedicationItem(med.id, 'effective', eff.id)}
                                  className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                                    active
                                      ? eff.activeClass
                                      : darkMode
                                        ? 'bg-slate-900 border-slate-700 text-slate-300'
                                        : 'bg-white border-slate-200 text-slate-600'
                                  }`}
                                >
                                  {eff.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-slate-600 dark:text-slate-300">
                    Relief Methods &amp; External Factors
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {EXTERNAL_FACTORS.map((ef) => {
                      const active = (formData.externalFactors || []).includes(ef.id);
                      return (
                        <button
                          key={ef.id}
                          type="button"
                          onClick={() => toggleArrayItem('externalFactors', ef.id)}
                          className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                            active
                              ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs'
                              : darkMode
                                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-emerald-50'
                          }`}
                        >
                          {ef.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

            {/* DAILY NOTES & SAVE BAR */}
            <section className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <h3 className="text-base font-bold">{ownerName ? `${ownerName}'s Daily Notes` : 'Daily Notes'}</h3>
              </div>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Write any extra details about today (e.g. specific foods eaten, how sleep went, questions for the GP or gynecologist)..."
                className={getFieldClass('rose')}
              />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-800">
                <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>
                    {isDirty
                      ? 'You have unsaved changes for this day (will also auto-save if you switch dates).'
                      : 'All changes saved to your local Floodgate database across phone & tablet.'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {isDirty && (saveFailed || pendingNav) && (
                    <button
                      type="button"
                      onClick={discardPendingNavigation}
                      className={`min-h-[44px] px-4 py-3 rounded-2xl font-bold text-xs border active:scale-[0.98] transition cursor-pointer ${
                        darkMode
                          ? 'border-rose-500/40 text-rose-200 hover:bg-rose-500/15'
                          : 'border-rose-300 text-rose-800 hover:bg-rose-50'
                      }`}
                    >
                      Discard Unsaved Changes
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => saveDayEntry()}
                    className="w-full sm:w-auto min-h-[44px] px-8 py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white shadow-md flex items-center justify-center gap-2 active:scale-[0.98] transition cursor-pointer"
                  >
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Save Log for {formatShortDate(selectedDate)}</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ==================================================================
            TAB 2: INTERACTIVE CALENDAR & HISTORY VIEW
        ================================================================== */}
        {activeTab === 'calendar' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5">
            <div className={`xl:col-span-8 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xl font-bold">
                    {new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString('en-GB', {
                      month: 'long',
                      year: 'numeric'
                    })}
                  </h2>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Tap any date to inspect or edit {ownerName}&apos;s daily log
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() =>
                      setCalendarMonth((prev) => {
                        const d = new Date(prev.year, prev.month - 1, 1);
                        return { year: d.getFullYear(), month: d.getMonth() };
                      })
                    }
                    className={`min-w-[40px] min-h-[40px] p-2 rounded-xl border flex items-center justify-center active:scale-[0.98] transition cursor-pointer ${
                      darkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() });
                      handleSelectDate(todayKey);
                    }}
                    className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 active:scale-[0.98] transition cursor-pointer"
                  >
                    Current Month
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() =>
                      setCalendarMonth((prev) => {
                        const d = new Date(prev.year, prev.month + 1, 1);
                        return { year: d.getFullYear(), month: d.getMonth() };
                      })
                    }
                    className={`min-w-[40px] min-h-[40px] p-2 rounded-xl border flex items-center justify-center active:scale-[0.98] transition cursor-pointer ${
                      darkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs mb-4 pb-3 border-b border-slate-200/60 dark:border-slate-800">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" /> Period / Bleeding
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-purple-600 inline-block" /> Blood Clots
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-md font-bold text-[11px] bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                    6+
                  </span>{' '}
                  High Pain (≥6)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-orange-600 inline-block" /> Bowel Flare
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block" /> Meds Taken
                </span>
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[11px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d} className="py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {calendarGrid.map((cell, idx) => {
                  if (!cell) {
                    return <div key={`empty-${idx}`} className="min-h-[4.25rem] sm:h-24 rounded-xl sm:rounded-2xl bg-transparent" />;
                  }
                  const { dayNumber, dateStr, log } = cell;
                  const isSelected = dateStr === selectedDate;
                  const isToday = dateStr === todayKey;
                  const hasBleeding = log?.bleedingSeverity && log.bleedingSeverity !== 'none';
                  const bleedObj = BLEEDING_LEVELS.find((b) => b.id === log?.bleedingSeverity);

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => handleSelectDate(dateStr)}
                      className={`min-h-[4.25rem] sm:h-24 p-1 sm:p-2 rounded-xl sm:rounded-2xl border flex flex-col justify-between text-left transition-all relative active:scale-[0.98] cursor-pointer ${
                        isSelected
                          ? 'ring-2 ring-rose-600 border-rose-600 bg-rose-500/10'
                          : darkMode
                            ? 'bg-slate-800/50 border-slate-800 hover:bg-slate-800'
                            : 'bg-slate-50/60 border-slate-200/70 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full gap-0.5">
                        <span className={`w-5 h-5 sm:w-6 sm:h-6 text-[11px] sm:text-xs font-bold rounded-full flex items-center justify-center shrink-0 ${
                          isToday ? 'bg-rose-600 text-white' : ''
                        }`}>
                          {dayNumber}
                        </span>
                        {log?.painScore > 0 && (
                          <span className={`hidden sm:inline text-[11px] px-1.5 py-0.5 rounded-md font-bold ${getPainBadgeStyle(log.painScore)}`}>
                            {log.painScore}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 w-full">
                        {hasBleeding && (
                          <div className={`hidden sm:block w-full text-[11px] font-semibold px-1.5 py-0.5 rounded-md truncate ${
                            bleedObj?.pillClass || 'bg-rose-600 text-white border border-rose-600'
                          }`}>
                            {bleedObj?.label}
                          </div>
                        )}
                        <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap">
                          {hasBleeding && (
                            <span
                              className={`sm:hidden w-2 h-2 rounded-full ${bleedObj?.dotColor || 'bg-rose-500'}`}
                              title={`Flow: ${bleedObj?.label || log.bleedingSeverity}`}
                            />
                          )}
                          {Number(log?.painScore) >= 6 && (
                            <span
                              className="sm:hidden w-2 h-2 rounded-full bg-amber-500"
                              title={`Pain: ${log.painScore}/10`}
                            />
                          )}
                          {log?.hasClots && (
                            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-purple-600" title={`Clots: ${log.clotCount}`} />
                          )}
                          {(log?.bowelSeverity === 'moderate' || log?.bowelSeverity === 'severe') && (
                            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-orange-500" title={`Bowel: ${log.bowelSeverity}`} />
                          )}
                          {log?.medications?.length > 0 && (
                            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-600" title="Medication taken" />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`xl:col-span-4 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
            }`}>
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4 border-slate-200/60 dark:border-slate-800">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                      Selected Date
                    </span>
                    <h3 className="text-lg font-bold">{formatDateFriendly(selectedDate)}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSwitchTab('log')}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] transition cursor-pointer"
                  >
                    Edit Day Log
                  </button>
                </div>

                {logsMap[selectedDate] ? (
                  <div className="space-y-4 text-sm">
                    <div className={`p-3.5 rounded-2xl border ${
                      darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-rose-50/50 border-rose-100'
                    }`}>
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                        Bleeding &amp; Clots
                      </div>
                      <div className="font-semibold capitalize">
                        Flow: {logsMap[selectedDate].bleedingSeverity}
                        {logsMap[selectedDate].leakedThrough && ' (Flooded/Leaked)'}
                      </div>
                      {logsMap[selectedDate].hasClots ? (
                        <div className="mt-2 pt-2 border-t border-rose-200/50 dark:border-slate-700 text-purple-700 dark:text-purple-300 font-semibold text-xs">
                          Clots: {logsMap[selectedDate].clotCount} passed (
                          {(logsMap[selectedDate].clotSizes || []).length > 0
                            ? logsMap[selectedDate].clotSizes
                                .map((id) => CLOT_SIZE_LABELS[id] || id)
                                .join(', ')
                            : 'size not specified'}
                          )
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">No blood clots logged</div>
                      )}
                    </div>

                    <div className={`p-3.5 rounded-2xl border ${
                      darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-amber-50/40 border-amber-100'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Pain Level</span>
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${getPainBadgeStyle(logsMap[selectedDate].painScore)}`}>
                          {logsMap[selectedDate].painScore} / 10
                        </span>
                      </div>
                      {(logsMap[selectedDate].painLocations || []).length > 0 && (
                        <div className="text-xs mt-1">
                          <span className="font-semibold">Locations:</span> {logsMap[selectedDate].painLocations.join(', ')}
                        </div>
                      )}
                    </div>

                    <div className={`p-3.5 rounded-2xl border ${
                      darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-orange-50/40 border-orange-100'
                    }`}>
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                        Bowel &amp; GI ({logsMap[selectedDate].bowelSeverity})
                      </div>
                      {(logsMap[selectedDate].bowelSymptoms || []).length > 0 ? (
                        <div className="text-xs">{logsMap[selectedDate].bowelSymptoms.join(', ')}</div>
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-slate-400">No specific GI symptoms tagged</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <EmptyStateCard
                    accent="rose"
                    darkMode={darkMode}
                    icon={CalendarIcon}
                    title="No symptoms logged for this date yet"
                    description={`Record flow, pain, bowel symptoms, or medications for ${formatShortDate(selectedDate)}.`}
                    action={
                      <button
                        type="button"
                        onClick={() => handleSwitchTab('log')}
                        className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 active:scale-[0.98] transition cursor-pointer"
                      >
                        + Log Symptoms for {formatShortDate(selectedDate)}
                      </button>
                    }
                  />
                )}
              </div>

              <div className="pt-4 mt-6 border-t border-slate-200/60 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
                <span>Total days tracked: {Object.keys(logsMap).length}</span>
                <button
                  type="button"
                  onClick={() => handleSwitchTab('insights')}
                  className="min-h-[40px] inline-flex items-center px-2 rounded-xl text-rose-600 dark:text-rose-400 font-semibold hover:underline active:scale-[0.98] transition cursor-pointer"
                >
                  View GP Report &rarr;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================
            TAB 3: INSIGHTS & DOCTOR (GP / GYNECOLOGIST) REPORT VIEW
        ================================================================== */}
        {activeTab === 'insights' && (
          <div className="space-y-4 sm:space-y-5">
            <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
            }`}>
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Stethoscope className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  <span>{ownerName}&apos;s Endometriosis Insights &amp; GP Report</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Symptom correlations, clot tracking &amp; printable clinical summary
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  { days: 30, label: '30 Days' },
                  { days: 60, label: '60 Days' },
                  { days: 90, label: '90 Days' },
                  { days: 365, label: '1 Year' }
                ].map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setInsightsDays(opt.days)}
                    className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold border active:scale-[0.98] transition cursor-pointer ${
                      insightsDays === opt.days
                        ? 'bg-rose-600 text-white border-rose-600'
                        : darkMode
                          ? 'bg-slate-800 border-slate-700 text-slate-300'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => window.print()}
                  className={`min-h-[40px] flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold active:scale-[0.98] transition cursor-pointer ${
                    darkMode
                      ? 'bg-slate-100 text-slate-900 hover:bg-white'
                      : 'bg-slate-800 text-white hover:bg-slate-900'
                  }`}
                >
                  <Printer className="w-4 h-4" />
                  <span>Print GP Summary</span>
                </button>
              </div>
            </div>

            <div className="hidden print-only border-b pb-4 mb-6">
              <h1 className="text-2xl font-bold">
                Floodgate Clinical Symptom Summary — {ownerName}
              </h1>
              <p className="text-sm text-slate-600">
                Report Window: Last {insightsDays} Days (Generated {formatDateFriendly(todayKey)})
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
              <div className={`print-avoid-break p-4 sm:p-5 rounded-2xl sm:rounded-3xl border shadow-xs ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}>
                <div className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1">
                  Bleeding Days
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold">{insightsData.bleedingDaysCount}</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {insightsData.heavyDaysCount} heavy or flooding day(s)
                </div>
              </div>

              <div className={`print-avoid-break p-4 sm:p-5 rounded-2xl sm:rounded-3xl border shadow-xs ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}>
                <div className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">
                  Blood Clot Episodes
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold">{insightsData.totalClotsCount}</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Across {insightsData.clotDaysCount} day(s) • {insightsData.largeClotDaysCount} with &gt;2cm clots
                </div>
              </div>

              <div className={`print-avoid-break p-4 sm:p-5 rounded-2xl sm:rounded-3xl border shadow-xs ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}>
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
                  Average Pain Score
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold">{insightsData.avgPainAll} <span className="text-base font-normal">/ 10</span></div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {insightsData.highPainDaysCount} severe pain day(s) (≥6/10)
                </div>
              </div>

              <div className={`print-avoid-break p-4 sm:p-5 rounded-2xl sm:rounded-3xl border shadow-xs ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}>
                <div className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-1">
                  Bowel / GI Flare Days
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold">{insightsData.bowelFlareDaysCount}</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Moderate or severe GI distress days
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
              {[
                {
                  title: 'Top Pain Locations',
                  items: insightsData.topPainLocations,
                  badgeClass: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
                  emptyText: 'No pain locations logged in this window.'
                },
                {
                  title: 'Top Bowel / GI Symptoms',
                  items: insightsData.topBowelSymptoms,
                  badgeClass: 'bg-orange-500/15 text-orange-800 dark:text-orange-300',
                  emptyText: 'No bowel/GI symptoms logged in this window.'
                },
                {
                  title: 'Most Used Medications',
                  items: insightsData.topMedications,
                  badgeClass: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
                  emptyText: 'No medications recorded in this window.'
                },
                {
                  title: 'Common Factors & Triggers',
                  items: insightsData.topFactors,
                  badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
                  emptyText: 'No external factors or triggers logged in this window.'
                }
              ].map((panel) => (
                <div
                  key={panel.title}
                  className={`print-avoid-break p-4 rounded-2xl sm:rounded-3xl border shadow-xs ${
                    darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
                  }`}
                >
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2.5">
                    {panel.title}
                  </h3>
                  {panel.items.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {panel.items.map(([label, count]) => (
                        <span
                          key={label}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold ${panel.badgeClass}`}
                        >
                          <span>{label}</span>
                          <span className="font-bold">×{count}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{panel.emptyText}</p>
                  )}
                </div>
              ))}
            </div>

            <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
            }`}>
              <h3 className="text-base sm:text-lg font-bold mb-4">
                Chronological Consultation Table ({insightsData.periodLogs.length} Logged Days)
              </h3>
              {insightsData.periodLogs.length > 0 ? (() => {
                const consultationRows = [...insightsData.periodLogs].reverse().map((l) => {
                  const padN = Number(l.padCount) || 0;
                  const tamponN = Number(l.tamponCount) || 0;
                  const cupN = Number(l.cupCount) || 0;
                  const protectionParts = [
                    padN > 0 && `${padN} ${padN === 1 ? 'pad' : 'pads'}`,
                    tamponN > 0 && `${tamponN} ${tamponN === 1 ? 'tampon' : 'tampons'}`,
                    cupN > 0 && `${cupN} ${cupN === 1 ? 'cup' : 'cups'}`
                  ].filter(Boolean);
                  return { l, protectionParts };
                });

                return (
                  <>
                    {/* Mobile stacked consultation card list (never prints, avoids horizontal scroll on mobile) */}
                    <div className="space-y-3 md:hidden print:hidden">
                      {consultationRows.map(({ l, protectionParts }) => (
                        <div
                          key={l.date}
                          className={`p-3.5 rounded-2xl border space-y-2 text-xs ${
                            darkMode
                              ? 'bg-slate-800/50 border-slate-700'
                              : 'bg-slate-50/70 border-slate-200/80'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200/70 dark:border-slate-700">
                            <span className="font-bold text-sm">
                              {formatShortDateWithYear(l.date)}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md font-bold ${getPainBadgeStyle(l.painScore)}`}>
                              Pain {l.painScore}/10
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-1.5">
                            <div>
                              <span className="font-semibold text-slate-600 dark:text-slate-300">Flow: </span>
                              <span className="capitalize font-semibold">{l.bleedingSeverity}</span>
                              {l.leakedThrough && (
                                <span className="text-red-600 dark:text-red-400 font-bold ml-1">(Flooded)</span>
                              )}
                              {protectionParts.length > 0 && (
                                <span className="text-slate-600 dark:text-slate-300"> • {protectionParts.join(', ')}</span>
                              )}
                            </div>

                            {l.hasClots && (
                              <div>
                                <span className="font-semibold text-slate-600 dark:text-slate-300">Clots: </span>
                                <span className="text-purple-700 dark:text-purple-300 font-semibold">
                                  {l.clotCount}
                                  {(l.clotSizes || []).length > 0
                                    ? ` (${l.clotSizes.map((id) => CLOT_SIZE_LABELS[id] || id).join(', ')})`
                                    : ''}
                                </span>
                              </div>
                            )}

                            {(l.painLocations || []).length > 0 && (
                              <div>
                                <span className="font-semibold text-slate-600 dark:text-slate-300">Pain sites: </span>
                                <span>{l.painLocations.join(', ')}</span>
                              </div>
                            )}

                            <div>
                              <span className="font-semibold text-slate-600 dark:text-slate-300">Bowel / GI: </span>
                              <span className="capitalize font-semibold">{l.bowelSeverity}</span>
                              {(l.bowelSymptoms || []).length > 0 && (
                                <span className="text-slate-600 dark:text-slate-300"> • {l.bowelSymptoms.join(', ')}</span>
                              )}
                            </div>

                            {(l.medications || []).length > 0 && (
                              <div className="font-medium text-emerald-700 dark:text-emerald-300">
                                <span className="font-semibold text-slate-600 dark:text-slate-300">Meds: </span>
                                {l.medications.map(formatMedicationSummary).join(', ')}
                              </div>
                            )}

                            {l.notes && (
                              <div className="italic text-slate-600 dark:text-slate-300">
                                &ldquo;{l.notes}&rdquo;
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Tablet / Desktop & Print 6-column table */}
                    <div className="hidden md:block print:block overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                            <th className="py-2.5 pr-3">Date</th>
                            <th className="py-2.5 px-3">Bleeding &amp; Protection</th>
                            <th className="py-2.5 px-3">Clots</th>
                            <th className="py-2.5 px-3">Pain (0–10) &amp; Sites</th>
                            <th className="py-2.5 px-3">Bowel / GI</th>
                            <th className="py-2.5 pl-3">Medications &amp; Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800">
                          {consultationRows.map(({ l, protectionParts }) => (
                            <tr key={l.date} className="align-top">
                              <td className="py-3 pr-3 font-bold whitespace-nowrap">
                                {formatShortDateWithYear(l.date)}
                              </td>
                              <td className="py-3 px-3 capitalize">
                                <span className="font-semibold">{l.bleedingSeverity}</span>
                                {l.leakedThrough && <span className="text-red-600 dark:text-red-400 font-bold ml-1">(Flooded)</span>}
                                {protectionParts.length > 0 && (
                                  <div className="normal-case text-slate-600 dark:text-slate-300 mt-0.5">
                                    {protectionParts.join(', ')}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                {l.hasClots ? (
                                  <span className="text-purple-700 dark:text-purple-300 font-semibold">
                                    {l.clotCount}
                                    {(l.clotSizes || []).length > 0
                                      ? ` (${l.clotSizes.map((id) => CLOT_SIZE_LABELS[id] || id).join(', ')})`
                                      : ''}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-500">—</span>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                <span className={`px-1.5 py-0.5 rounded-md font-bold mr-1.5 ${getPainBadgeStyle(l.painScore)}`}>
                                  {l.painScore}/10
                                </span>
                                <span>{(l.painLocations || []).join(', ')}</span>
                              </td>
                              <td className="py-3 px-3">
                                <span className="capitalize font-semibold">{l.bowelSeverity}</span>
                                {(l.bowelSymptoms || []).length > 0 && (
                                  <div className="text-slate-600 dark:text-slate-300">{l.bowelSymptoms.join(', ')}</div>
                                )}
                              </td>
                              <td className="py-3 pl-3">
                                {(l.medications || []).length > 0 && (
                                  <div className="font-medium text-emerald-700 dark:text-emerald-300">
                                    {l.medications.map(formatMedicationSummary).join(', ')}
                                  </div>
                                )}
                                {l.notes && <div className="italic text-slate-600 dark:text-slate-300 mt-0.5">&ldquo;{l.notes}&rdquo;</div>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })() : (
                <EmptyStateCard
                  accent="rose"
                  darkMode={darkMode}
                  icon={Stethoscope}
                  title={`No logs recorded within the last ${insightsDays} days`}
                  description="Add daily entries in the Daily Log tab to generate your printable GP clinical summary."
                />
              )}
            </div>
          </div>
        )}

        {/* ==================================================================
            TAB 4: EXPORT, SAMPLE DATA & HOWARD UNIFIED BACKUP
        ================================================================== */}
        {activeTab === 'data' && (
          <div className="space-y-4 sm:space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between space-y-4 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}>
                <div>
                  <h3 className="text-base font-bold mb-1">Clinical Spreadsheet &amp; JSON Export</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Download your Floodgate symptom history as a standalone JSON backup or as a CSV spreadsheet for your GP or specialist.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={exportJSON}
                    className={`min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold active:scale-[0.98] transition cursor-pointer ${
                      darkMode
                        ? 'bg-slate-100 text-slate-900 hover:bg-white'
                        : 'bg-slate-800 text-white hover:bg-slate-900'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Floodgate JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={exportCSV}
                    className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Export CSV (Excel)</span>
                  </button>
                </div>
              </div>

              {/* Howard Unified Backstage Card (Replaces Legacy Webhook) */}
              <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between space-y-4 ${
                darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
              }`}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    <h3 className="text-base font-bold">Howard Unified Household Storage</h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Floodgate runs inside Howard&rsquo;s unified home server database (<code className="font-mono">data/howard.db</code>). You can also snapshot the entire household in one click.
                  </p>
                </div>

                <div className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">Database File:</span>
                    <code className="font-mono shrink-0">data/howard.db</code>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">Logged Days Stored:</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400 shrink-0">{Object.keys(logsMap).length} days</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onOpenBackupModal}
                  className="w-full min-h-[44px] py-3 rounded-2xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] transition cursor-pointer"
                >
                  Open Howard Status &amp; Backup Menu &rarr;
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
