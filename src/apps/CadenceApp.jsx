import React, { useState, useEffect, useMemo } from 'react';
import {
  Cat,
  Sun,
  Moon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  Droplets,
  Plus,
  Settings,
  History,
  ShieldAlert,
  Sparkles,
  Edit3,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
  Check
} from 'lucide-react';

import {
  getLocalDateKey,
  parseLocalDateKey,
  shiftDateKey,
  formatFriendlyDate,
  formatTimeDisplay,
  formatDurationAgo,
  getMondayOfWeek,
  getCalendarWeekDays,
  formatWeekRangeLabel
} from '../utils/householdHelpers.js';

const DEFAULT_SETTINGS = {
  catName: 'Pet',
  medicationName: 'Oral Solution',
  dosageLabel: '2.5 mg / 0.5 ml',
  morningTargetTime: '08:00',
  eveningTargetTime: '20:00',
  bottleOpenedDate: getLocalDateKey(new Date()),
  bottleShelfLifeDays: 180,
  caregivers: ['Partner 1', 'Partner 2', 'Caregiver'],
  administrationNote:
    'Give directly by mouth or with a small portion of wet food. Wipe syringe tip clean after each use.'
};

export default function CadenceApp({
  activeProfile,
  darkMode,
  nowMs = Date.now(),
  cadenceSnapshot,
  onGlobalSync,
  showToast
}) {
  const canConfigure = activeProfile?.id !== 'caregiver';

  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const recordedByUid = `howard-${activeProfile?.id || 'caregiver'}`;
  const [syncError, setSyncError] = useState(null);
  const now = useMemo(() => new Date(nowMs), [nowMs]);

  // Local SQLite synced states (fed directly by Howard's unified incremental sync)
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...cadenceSnapshot?.settings
  }));
  const [logsByDate, setLogsByDate] = useState(() => cadenceSnapshot?.logsByDate || {});
  const [isLoadingData, setIsLoadingData] = useState(() => !cadenceSnapshot);

  // Active caregiver automatically derives from active Howard profile
  const activeCaregiver =
    activeProfile?.caregiverName || activeProfile?.name || 'Partner 1';

  // Quick note input for today's dose
  const [morningNoteInput, setMorningNoteInput] = useState('');
  const [eveningNoteInput, setEveningNoteInput] = useState('');

  // Modals
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState(DEFAULT_SETTINGS);
  const [confirmUndoModal, setConfirmUndoModal] = useState(null);
  const [confirmNewBottleModal, setConfirmNewBottleModal] = useState(false);
  const [manualLogModal, setManualLogModal] = useState(null);
  const [manualTimeInput, setManualTimeInput] = useState('08:00');
  const [manualCaregiverInput, setManualCaregiverInput] = useState('');
  const [manualNoteInput, setManualNoteInput] = useState('');

  useEffect(() => {
    if (!settingsModalOpen && !confirmUndoModal && !confirmNewBottleModal && !manualLogModal) {
      return;
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (confirmUndoModal) setConfirmUndoModal(null);
        else if (confirmNewBottleModal) setConfirmNewBottleModal(false);
        else if (manualLogModal) setManualLogModal(null);
        else if (settingsModalOpen) setSettingsModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsModalOpen, confirmUndoModal, confirmNewBottleModal, manualLogModal]);

  // ==========================================
  // RECEIVE UNIFIED HOWARD SNAPSHOT UPDATES
  // ==========================================
  useEffect(() => {
    if (!cadenceSnapshot) return;
    setSettings({ ...DEFAULT_SETTINGS, ...cadenceSnapshot.settings });
    setLogsByDate(cadenceSnapshot.logsByDate || {});
    setIsLoadingData(false);
  }, [cadenceSnapshot]);

  // ==========================================
  // COMPUTED DATA & STATUS CALCULATIONS
  // ==========================================
  const todayKey = useMemo(() => getLocalDateKey(now), [now]);
  const currentWeekMonday = useMemo(() => getMondayOfWeek(now), [now]);
  const [selectedWeekMonday, setSelectedWeekMonday] = useState(() =>
    getMondayOfWeek(new Date())
  );
  const prevWeekMondayRef = React.useRef(currentWeekMonday);

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

  const todayLog = logsByDate[todayKey] || {};
  const morningDose = todayLog.morning || null;
  const eveningDose = todayLog.evening || null;

  const lastDoseInfo = useMemo(() => {
    const candidates = [];
    Object.keys(logsByDate).forEach((dKey) => {
      const dayRecord = logsByDate[dKey];
      if (!dayRecord) return;
      if (dayRecord.morning?.given && dayRecord.morning?.timestamp) {
        candidates.push({
          ...dayRecord.morning,
          slotLabel: 'Morning',
          dateKey: dKey
        });
      }
      if (dayRecord.evening?.given && dayRecord.evening?.timestamp) {
        candidates.push({
          ...dayRecord.evening,
          slotLabel: 'Evening',
          dateKey: dKey
        });
      }
    });

    candidates.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return candidates[0] || null;
  }, [logsByDate]);

  // Bottle expiration calculations
  const bottleStatus = useMemo(() => {
    const openedStr = settings.bottleOpenedDate || todayKey;
    const shelfLife = Number(settings.bottleShelfLifeDays) || 180;
    const openedDate = parseLocalDateKey(openedStr);
    const expiryDate = new Date(openedDate.getTime());
    expiryDate.setDate(expiryDate.getDate() + shelfLife);

    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDaysOpen = Math.max(
      0,
      Math.round((todayMidnight.getTime() - openedDate.getTime()) / (1000 * 60 * 60 * 24))
    );
    const daysRemaining = Math.round(
      (expiryDate.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)
    );
    const percentUsed = Math.min(100, Math.max(0, Math.round((diffDaysOpen / shelfLife) * 100)));

    return {
      openedDateFormatted: openedDate.toLocaleDateString('en-GB', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      expiryDateFormatted: expiryDate.toLocaleDateString('en-GB', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      diffDaysOpen,
      daysRemaining,
      percentUsed,
      isExpired: daysRemaining <= 0,
      isExpiringSoon: daysRemaining > 0 && daysRemaining <= 14
    };
  }, [settings.bottleOpenedDate, settings.bottleShelfLifeDays, now, todayKey]);

  // Selected week adherence metrics
  const adherenceStats = useMemo(() => {
    let completed = 0;
    let totalExpected = 0;

    selectedWeekDays.forEach((dKey) => {
      const record = logsByDate[dKey] || {};
      if (dKey === todayKey) {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [amH, amM] = (settings.morningTargetTime || '08:00').split(':').map(Number);
        const [pmH, pmM] = (settings.eveningTargetTime || '20:00').split(':').map(Number);
        const amTargetMins =
          (Number.isFinite(amH) ? amH : 8) * 60 + (Number.isFinite(amM) ? amM : 0);
        const pmTargetMins =
          (Number.isFinite(pmH) ? pmH : 20) * 60 + (Number.isFinite(pmM) ? pmM : 0);

        const amExpected = currentMinutes >= amTargetMins || record.morning?.given;
        const pmExpected = currentMinutes >= pmTargetMins || record.evening?.given;

        if (amExpected) totalExpected += 1;
        if (pmExpected) totalExpected += 1;
        if (record.morning?.given) completed += 1;
        if (record.evening?.given) completed += 1;
      } else {
        totalExpected += 2;
        if (record.morning?.given) completed += 1;
        if (record.evening?.given) completed += 1;
      }
    });

    const pct = totalExpected > 0 ? Math.round((completed / totalExpected) * 100) : 100;
    return { completed, totalExpected, pct };
  }, [
    selectedWeekDays,
    logsByDate,
    now,
    todayKey,
    settings.morningTargetTime,
    settings.eveningTargetTime
  ]);

  // ==========================================
  // LOCAL API WRITE ACTIONS
  // ==========================================
  const saveDayLogToApi = async (dateKey, payload) => {
    const res = await fetch(`/api/cadence/logs/${encodeURIComponent(dateKey)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data?.record) {
      setLogsByDate((prev) => ({ ...prev, [dateKey]: data.record }));
    }
    setSyncError(null);
    if (onGlobalSync) onGlobalSync();
  };

  const saveSettingsToApi = async (updatedSettings) => {
    const res = await fetch('/api/cadence/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSettings)
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data?.settings) {
      setSettings(data.settings);
    }
    setSyncError(null);
    if (onGlobalSync) onGlobalSync();
  };

  const handleRecordDose = async (slot, customNote = '') => {
    const caregiverName = activeCaregiver;
    const timestampIso = new Date().toISOString();
    const prevLogs = logsByDate;

    const dosePayload = {
      given: true,
      timestamp: timestampIso,
      givenBy: caregiverName,
      dosage: settings.dosageLabel,
      note: customNote.trim(),
      recordedByUid
    };

    const currentDayData = logsByDate[todayKey] || { dateKey: todayKey };
    const updatedDayRecord = {
      ...currentDayData,
      dateKey: todayKey,
      [slot]: dosePayload,
      updatedAt: timestampIso
    };

    setLogsByDate((prev) => ({ ...prev, [todayKey]: updatedDayRecord }));
    if (slot === 'morning') setMorningNoteInput('');
    if (slot === 'evening') setEveningNoteInput('');

    try {
      await saveDayLogToApi(todayKey, { [slot]: dosePayload, updatedAt: timestampIso });
      showToast?.(
        `Logged ${settings.catName}'s ${slot === 'morning' ? 'Morning' : 'Evening'} dose (${caregiverName})`
      );
    } catch (err) {
      console.error('Error recording dose:', err);
      setLogsByDate(prevLogs);
      if (onGlobalSync) onGlobalSync({ force: true });
      setSyncError('Failed to save dose to local server. Reverted — please check Wi-Fi.');
    }
  };

  const handleConfirmUndoDose = async () => {
    if (!confirmUndoModal) return;
    const { dateKey, slot } = confirmUndoModal;
    const timestampIso = new Date().toISOString();
    const prevLogs = logsByDate;

    const currentDayData = logsByDate[dateKey] || { dateKey };
    const updatedDayRecord = {
      ...currentDayData,
      dateKey,
      [slot]: null,
      updatedAt: timestampIso
    };

    setLogsByDate((prev) => ({ ...prev, [dateKey]: updatedDayRecord }));
    setConfirmUndoModal(null);

    try {
      await saveDayLogToApi(dateKey, { [slot]: null, updatedAt: timestampIso });
      showToast?.(
        `Unchecked ${slot === 'morning' ? 'Morning' : 'Evening'} dose for ${formatFriendlyDate(dateKey, todayKey)}`
      );
    } catch (err) {
      console.error('Error undoing dose:', err);
      setLogsByDate(prevLogs);
      if (onGlobalSync) onGlobalSync({ force: true });
      setSyncError('Failed to undo dose record — reverted.');
    }
  };

  const openManualEntryModal = (dateKey, slot, existingData = null) => {
    let defaultTime = slot === 'morning' ? settings.morningTargetTime : settings.eveningTargetTime;
    if (existingData?.timestamp) {
      const d = new Date(existingData.timestamp);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      defaultTime = `${hh}:${mm}`;
    }
    setManualTimeInput(defaultTime || (slot === 'morning' ? '08:00' : '20:00'));
    setManualCaregiverInput(existingData?.givenBy || activeCaregiver);
    setManualNoteInput(existingData?.note || '');
    setManualLogModal({ dateKey, slot, existingData });
  };

  const handleSaveManualEntry = async (e) => {
    e.preventDefault();
    if (!manualLogModal) return;

    const { dateKey, slot } = manualLogModal;
    const [year, month, day] = dateKey.split('-').map(Number);
    const [hours, minutes] = (manualTimeInput || '08:00').split(':').map(Number);
    const customDateObj = new Date(year, month - 1, day, hours || 0, minutes || 0, 0);
    const timestampIso = new Date().toISOString();
    const prevLogs = logsByDate;

    const dosePayload = {
      given: true,
      timestamp: customDateObj.toISOString(),
      givenBy: manualCaregiverInput.trim() || activeCaregiver,
      dosage: settings.dosageLabel,
      note: manualNoteInput.trim(),
      recordedByUid
    };

    const currentDayData = logsByDate[dateKey] || { dateKey };
    const updatedDayRecord = {
      ...currentDayData,
      dateKey,
      [slot]: dosePayload,
      updatedAt: timestampIso
    };

    setLogsByDate((prev) => ({ ...prev, [dateKey]: updatedDayRecord }));
    setManualLogModal(null);

    try {
      await saveDayLogToApi(dateKey, { [slot]: dosePayload, updatedAt: timestampIso });
      showToast?.(
        `Saved ${slot === 'morning' ? 'Morning' : 'Evening'} dose for ${formatFriendlyDate(dateKey, todayKey)}`
      );
    } catch (err) {
      console.error('Error saving manual dose entry:', err);
      setLogsByDate(prevLogs);
      if (onGlobalSync) onGlobalSync({ force: true });
      setSyncError('Failed to save manual entry — reverted.');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!canConfigure) return;
    const prevSettings = settings;
    const parsedShelf = Number(settingsForm.bottleShelfLifeDays);
    const editablePayload = {
      catName: (settingsForm.catName || '').trim() || DEFAULT_SETTINGS.catName,
      medicationName:
        (settingsForm.medicationName || '').trim() || DEFAULT_SETTINGS.medicationName,
      dosageLabel: (settingsForm.dosageLabel || '').trim() || DEFAULT_SETTINGS.dosageLabel,
      morningTargetTime: (settingsForm.morningTargetTime || '').trim() || '08:00',
      eveningTargetTime: (settingsForm.eveningTargetTime || '').trim() || '20:00',
      bottleOpenedDate: settingsForm.bottleOpenedDate || settings.bottleOpenedDate || todayKey,
      bottleShelfLifeDays:
        Number.isFinite(parsedShelf) && parsedShelf >= 7
          ? Math.min(365, Math.round(parsedShelf))
          : 180,
      administrationNote: (settingsForm.administrationNote || '').trim()
    };
    setSettings((prev) => ({ ...prev, ...editablePayload }));
    setSettingsModalOpen(false);

    try {
      await saveSettingsToApi(editablePayload);
      showToast?.(`Saved ${editablePayload.catName}'s Cadence settings`);
    } catch (err) {
      console.error('Error saving settings:', err);
      setSettings(prevSettings);
      if (onGlobalSync) onGlobalSync({ force: true });
      setSyncError('Failed to update settings — reverted.');
    }
  };

  const handleOpenNewBottleToday = async () => {
    if (!canConfigure) return;
    const prevSettings = settings;
    const updated = {
      ...settings,
      bottleOpenedDate: todayKey
    };
    setSettings(updated);
    setSettingsForm(updated);
    setConfirmNewBottleModal(false);
    try {
      await saveSettingsToApi(updated);
      showToast?.(`Reset ${settings.catName}'s bottle opened date to Today`);
    } catch (err) {
      console.error('Error resetting bottle date:', err);
      setSettings(prevSettings);
      if (onGlobalSync) onGlobalSync({ force: true });
      setSyncError('Failed to update bottle opened date — reverted.');
    }
  };

  // ==========================================
  // HERO BANNER STATUS LOGIC
  // ==========================================
  const statusBanner = useMemo(() => {
    const bothDone = morningDose?.given && eveningDose?.given;
    const onlyMorningDone = morningDose?.given && !eveningDose?.given;
    const onlyEveningDone = !morningDose?.given && eveningDose?.given;
    const currentHour = now.getHours();

    if (bothDone) {
      return {
        theme: 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/10',
        badgeTheme: 'bg-emerald-800/80 text-emerald-50 border border-emerald-400/30',
        iconWrapTheme: 'bg-white/15',
        icon: <CheckCircle2 className="w-8 h-8 text-white shrink-0" />,
        title: `All Done Today! Both of ${settings.catName}'s Doses Given`,
        subtitle: `Morning given at ${formatTimeDisplay(morningDose.timestamp)} (${morningDose.givenBy}) • Evening given at ${formatTimeDisplay(eveningDose.timestamp)} (${eveningDose.givenBy})`,
        warningText: 'DO NOT GIVE ANOTHER DOSE TODAY'
      };
    }

    if (onlyMorningDone) {
      const isEveningWindow = currentHour >= 17;
      return {
        theme: isEveningWindow
          ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-900/10'
          : 'bg-purple-600 text-white border-purple-500 shadow-purple-900/10',
        badgeTheme: isEveningWindow
          ? 'bg-indigo-800/80 text-indigo-50 border border-indigo-400/30'
          : 'bg-purple-800/80 text-purple-50 border border-purple-400/30',
        iconWrapTheme: 'bg-white/15',
        icon: isEveningWindow ? (
          <Moon className="w-8 h-8 text-amber-200 shrink-0" />
        ) : (
          <CheckCircle2 className="w-8 h-8 text-white shrink-0" />
        ),
        title: isEveningWindow
          ? `Morning Done • Ready for ${settings.catName}'s Evening Dose`
          : `Morning Dose Given! Waiting until Evening`,
        subtitle: `Morning dose (${settings.dosageLabel}) was given at ${formatTimeDisplay(morningDose.timestamp)} by ${morningDose.givenBy}.`,
        warningText: `MORNING DOSE ALREADY GIVEN — NEXT DOSE AT ~${settings.eveningTargetTime}`
      };
    }

    if (onlyEveningDone) {
      return {
        theme: 'bg-amber-600 text-white border-amber-500 shadow-amber-900/10',
        badgeTheme: 'bg-amber-800/85 text-amber-50 border border-amber-300/30',
        iconWrapTheme: 'bg-white/15',
        icon: <AlertTriangle className="w-8 h-8 text-white shrink-0" />,
        title: `Evening Dose Logged • Morning Dose Unchecked`,
        subtitle: `Evening dose was given at ${formatTimeDisplay(eveningDose.timestamp)} by ${eveningDose.givenBy}.`,
        warningText: 'EVENING DOSE ALREADY GIVEN TODAY'
      };
    }

    return {
      theme: 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-900/10',
      badgeTheme: 'bg-amber-950/15 text-slate-950 border border-amber-950/20',
      iconWrapTheme: 'bg-amber-950/15',
      icon: <Sun className="w-8 h-8 text-slate-950 shrink-0" />,
      title: `No Doses Logged Yet Today for ${settings.catName}`,
      subtitle: `Target schedule: Morning (${settings.morningTargetTime}) & Evening (${settings.eveningTargetTime}) • Dosage: ${settings.dosageLabel}`,
      warningText: 'AWAITING MORNING DOSE'
    };
  }, [morningDose, eveningDose, settings, now]);

  const cardSurface = darkMode
    ? 'bg-slate-900 border-slate-800 text-slate-100'
    : 'bg-white border-slate-200/90 text-slate-800';

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
        {/* ========================================== */}
        {/* CADENCE MODULE HEADER BAR                  */}
        {/* ========================================== */}
        <section
          className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex items-center justify-between gap-3 ${cardSurface}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Cat className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
                  Cadence • {settings.catName}&apos;s {settings.medicationName}
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                  <Droplets className="w-3 h-3" />
                  {settings.dosageLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Twice-daily dose check-in, bottle shelf-life tracker &amp; household adherence history
              </p>
            </div>
          </div>

          {canConfigure && (
            <button
              type="button"
              onClick={() => {
                setSettingsForm(settings);
                setSettingsModalOpen(true);
              }}
              className={`flex items-center gap-1.5 p-2.5 sm:px-3.5 sm:py-2 rounded-xl font-bold text-xs border transition cursor-pointer shrink-0 ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
              title="Edit Household & Medication Settings"
              aria-label="Edit Household & Medication Settings"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Medication Settings</span>
            </button>
          )}
        </section>

        {/* SYNC ERROR NOTICE IF ANY */}
        {syncError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{syncError}</span>
            </div>
            <button
              type="button"
              onClick={() => setSyncError(null)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-rose-500/20"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ========================================== */}
        {/* 1) CURRENT STATUS ANTI-DOUBLE-DOSE BANNER  */}
        {/* ========================================== */}
        <section
          aria-label="Current Dose Status"
          className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-lg transition-colors duration-300 ${statusBanner.theme}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase w-fit ${statusBanner.badgeTheme}`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              {statusBanner.warningText}
            </span>

            {lastDoseInfo && (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium w-fit ${statusBanner.badgeTheme}`}
              >
                <Clock className="w-3.5 h-3.5" />
                Last dose: {formatDurationAgo(lastDoseInfo.timestamp, now.getTime())} (
                {formatFriendlyDate(lastDoseInfo.dateKey, todayKey)} {lastDoseInfo.slotLabel})
              </span>
            )}
          </div>

          <div className="flex items-start gap-3.5">
            <div className={`p-2.5 rounded-2xl backdrop-blur-xs shrink-0 mt-0.5 ${statusBanner.iconWrapTheme}`}>
              {statusBanner.icon}
            </div>
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight leading-snug">
                {statusBanner.title}
              </h2>
              <p className="text-sm sm:text-base opacity-90 leading-relaxed">
                {statusBanner.subtitle}
              </p>
            </div>
          </div>
        </section>

        {/* ========================================== */}
        {/* 2) LARGE TAP-FRIENDLY MORNING & EVENING    */}
        {/*    DOSE CHECKBOX CARDS                     */}
        {/* ========================================== */}
        <section
          aria-label="Today's Doses"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {/* ---------------- MORNING DOSE CARD ---------------- */}
          <div
            className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border-2 transition-all flex flex-col justify-between ${
              morningDose?.given
                ? darkMode
                  ? 'bg-emerald-950/30 border-emerald-600 shadow-sm'
                  : 'bg-emerald-50/70 border-emerald-400 shadow-sm'
                : `${cardSurface} hover:border-amber-400`
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xs ${
                      morningDose?.given
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                    }`}
                  >
                    {morningDose?.given ? (
                      <Check className="w-7 h-7 stroke-[2.5]" />
                    ) : (
                      <Sun className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-extrabold">Morning Dose</h3>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800">
                        ~{settings.morningTargetTime}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Dosage: <strong>{settings.dosageLabel}</strong>
                    </p>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                    morningDose?.given
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {morningDose?.given ? 'Completed' : 'Pending'}
                </span>
              </div>

              {morningDose?.given ? (
                <div
                  className={`rounded-2xl p-4 border space-y-2 mb-4 ${
                    darkMode
                      ? 'bg-slate-900/90 border-emerald-800'
                      : 'bg-white/90 border-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-medium">Time Given:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-base">
                      {formatTimeDisplay(morningDose.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-medium">Given By:</span>
                    <span className="font-bold inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {morningDose.givenBy}
                    </span>
                  </div>
                  {morningDose.note && (
                    <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800 text-xs opacity-85">
                      <span className="font-semibold">Note: </span>
                      {morningDose.note}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Optional note (e.g., given with lick treat, syringe direct):
                  </label>
                  <input
                    type="text"
                    value={morningNoteInput}
                    onChange={(e) => setMorningNoteInput(e.target.value)}
                    placeholder="Add quick note (optional)..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    maxLength={80}
                  />
                </div>
              )}
            </div>

            {morningDose?.given ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openManualEntryModal(todayKey, 'morning', morningDose)}
                  className="flex-1 py-3 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit Time / Person
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmUndoModal({
                      dateKey: todayKey,
                      slot: 'morning',
                      existingData: morningDose
                    })
                  }
                  className="py-3 px-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 border border-rose-500/30 font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-1 cursor-pointer"
                  title="Undo Morning Dose"
                >
                  <Trash2 className="w-4 h-4" />
                  Undo
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleRecordDose('morning', morningNoteInput)}
                  className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-base sm:text-lg shadow-md shadow-amber-500/20 active:scale-[0.98] transition flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-6 h-6 shrink-0" />
                  <span>Check Morning Dose ({activeCaregiver})</span>
                </button>
                <button
                  type="button"
                  onClick={() => openManualEntryModal(todayKey, 'morning', null)}
                  className="w-full py-1.5 text-xs font-semibold text-slate-500 hover:underline text-center cursor-pointer"
                >
                  Gave it earlier? Log custom morning time
                </button>
              </div>
            )}
          </div>

          {/* ---------------- EVENING DOSE CARD ---------------- */}
          <div
            className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border-2 transition-all flex flex-col justify-between ${
              eveningDose?.given
                ? darkMode
                  ? 'bg-emerald-950/30 border-emerald-600 shadow-sm'
                  : 'bg-emerald-50/70 border-emerald-400 shadow-sm'
                : `${cardSurface} hover:border-indigo-400`
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xs ${
                      eveningDose?.given
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                    }`}
                  >
                    {eveningDose?.given ? (
                      <Check className="w-7 h-7 stroke-[2.5]" />
                    ) : (
                      <Moon className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-extrabold">Evening Dose</h3>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800">
                        ~{settings.eveningTargetTime}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Dosage: <strong>{settings.dosageLabel}</strong>
                    </p>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                    eveningDose?.given
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                  }`}
                >
                  {eveningDose?.given ? 'Completed' : 'Pending'}
                </span>
              </div>

              {eveningDose?.given ? (
                <div
                  className={`rounded-2xl p-4 border space-y-2 mb-4 ${
                    darkMode
                      ? 'bg-slate-900/90 border-emerald-800'
                      : 'bg-white/90 border-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-medium">Time Given:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-base">
                      {formatTimeDisplay(eveningDose.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-medium">Given By:</span>
                    <span className="font-bold inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {eveningDose.givenBy}
                    </span>
                  </div>
                  {eveningDose.note && (
                    <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800 text-xs opacity-85">
                      <span className="font-semibold">Note: </span>
                      {eveningDose.note}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Optional note (e.g., given after dinner, appetite good):
                  </label>
                  <input
                    type="text"
                    value={eveningNoteInput}
                    onChange={(e) => setEveningNoteInput(e.target.value)}
                    placeholder="Add quick note (optional)..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    maxLength={80}
                  />
                </div>
              )}
            </div>

            {eveningDose?.given ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openManualEntryModal(todayKey, 'evening', eveningDose)}
                  className="flex-1 py-3 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit Time / Person
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmUndoModal({
                      dateKey: todayKey,
                      slot: 'evening',
                      existingData: eveningDose
                    })
                  }
                  className="py-3 px-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 border border-rose-500/30 font-semibold text-xs sm:text-sm transition flex items-center justify-center gap-1 cursor-pointer"
                  title="Undo Evening Dose"
                >
                  <Trash2 className="w-4 h-4" />
                  Undo
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleRecordDose('evening', eveningNoteInput)}
                  className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-extrabold text-base sm:text-lg shadow-md shadow-indigo-500/20 active:scale-[0.98] transition flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-6 h-6 shrink-0" />
                  <span>Check Evening Dose ({activeCaregiver})</span>
                </button>
                <button
                  type="button"
                  onClick={() => openManualEntryModal(todayKey, 'evening', null)}
                  className="w-full py-1.5 text-xs font-semibold text-slate-500 hover:underline text-center cursor-pointer"
                >
                  Gave it earlier? Log custom evening time
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ========================================== */}
        {/* 3) MEDICATION BOTTLE OPEN DATE & DOSAGE    */}
        {/* ========================================== */}
        <section
          aria-label="Bottle Shelf-Life & Dosage Tracker"
          className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${cardSurface}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  bottleStatus.isExpired
                    ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                    : bottleStatus.isExpiringSoon
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                      : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                }`}
              >
                <Droplets className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-base">
                    {settings.medicationName} Bottle Tracker
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-600 text-white">
                    {settings.dosageLabel} • 2x Daily
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Opened <strong>{bottleStatus.openedDateFormatted}</strong> ({bottleStatus.diffDaysOpen} days ago) • Discard after{' '}
                  <strong>{bottleStatus.expiryDateFormatted}</strong>
                </p>
              </div>
            </div>

            {canConfigure && (
              <div className="flex items-center gap-2 self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => setConfirmNewBottleModal(true)}
                  className="px-3 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Opened New Bottle Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsForm(settings);
                    setSettingsModalOpen(true);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold transition cursor-pointer"
                >
                  Configure
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="opacity-75">
                Bottle Shelf Life ({settings.bottleShelfLifeDays}-day limit once opened)
              </span>
              <span
                className={
                  bottleStatus.isExpired
                    ? 'text-rose-600 dark:text-rose-400 font-bold'
                    : bottleStatus.isExpiringSoon
                      ? 'text-amber-600 dark:text-amber-300 font-bold'
                      : 'text-purple-600 dark:text-purple-400'
                }
              >
                {bottleStatus.isExpired
                  ? `Expired ${Math.abs(bottleStatus.daysRemaining)} days ago — Replace bottle`
                  : `${bottleStatus.daysRemaining} days remaining`}
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  bottleStatus.isExpired
                    ? 'bg-rose-500'
                    : bottleStatus.isExpiringSoon
                      ? 'bg-amber-500'
                      : 'bg-purple-500'
                }`}
                style={{ width: `${bottleStatus.percentUsed}%` }}
              />
            </div>
          </div>

          {settings.administrationNote && (
            <div
              className={`p-3 rounded-2xl border flex items-start gap-2.5 text-xs ${
                darkMode
                  ? 'bg-slate-800/50 border-slate-700 text-slate-300'
                  : 'bg-slate-50 border-slate-200/80 text-slate-600'
              }`}
            >
              <Info className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Household Care Note: </span>
                {settings.administrationNote}
              </div>
            </div>
          )}
        </section>

        {/* ========================================== */}
        {/* 4) WEEKLY MEDICATION HISTORY LOG           */}
        {/* ========================================== */}
        <section
          aria-label="Medication History"
          className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${cardSurface}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base">Medication History</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Browse by week (Mon–Sun) or jump to any date to view or edit entries
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold w-fit">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span>
                Week Adherence: {adherenceStats.pct}% ({adherenceStats.completed}/
                {adherenceStats.totalExpected} doses)
              </span>
            </div>
          </div>

          <div
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 mb-4 rounded-2xl border ${
              darkMode
                ? 'bg-slate-800/50 border-slate-700'
                : 'bg-slate-50 border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedWeekMonday(shiftDateKey(activeWeekMonday, -7))
                }
                className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                title="Previous Week"
                aria-label="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 px-2">
                <Calendar className="w-4 h-4 text-purple-600 shrink-0" />
                <span className="text-xs sm:text-sm font-bold">{weekRangeLabel}</span>
                {isCurrentWeek && (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300">
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
                className={`p-2 rounded-xl border transition ${
                  isCurrentWeek
                    ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 cursor-pointer'
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
                  className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition cursor-pointer"
                >
                  This Week
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                Jump to date:
              </label>
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
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              />
            </div>
          </div>

          {isLoadingData ? (
            <div className="py-10 text-center text-sm text-slate-400">
              Loading {settings.catName}&apos;s medication history...
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {selectedWeekDays.map((dateKey) => {
                const dayRecord = logsByDate[dateKey] || {};
                const am = dayRecord.morning;
                const pm = dayRecord.evening;
                const isToday = dateKey === todayKey;

                return (
                  <div
                    key={dateKey}
                    className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                      isToday ? 'bg-purple-500/10 -mx-3 px-3 rounded-2xl' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-[140px]">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          am?.given && pm?.given
                            ? 'bg-emerald-500'
                            : am?.given || pm?.given
                              ? 'bg-amber-400'
                              : 'bg-slate-400'
                        }`}
                      />
                      <div>
                        <div className="font-bold text-sm flex items-center gap-1.5">
                          <span>{formatFriendlyDate(dateKey, todayKey)}</span>
                          {isToday && (
                            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium">{dateKey}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 flex-1 max-w-md">
                      {/* Morning Pill */}
                      <button
                        type="button"
                        onClick={() => openManualEntryModal(dateKey, 'morning', am)}
                        className={`px-3 py-2 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                          am?.given
                            ? 'bg-emerald-500/15 border-emerald-500/30'
                            : darkMode
                              ? 'bg-slate-800/50 border-slate-700 text-slate-400'
                              : 'bg-slate-50 border-slate-200/80 text-slate-500'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 text-xs font-bold">
                            <Sun
                              className={`w-3.5 h-3.5 shrink-0 ${
                                am?.given ? 'text-amber-500' : 'text-slate-400'
                              }`}
                            />
                            <span>AM</span>
                            {am?.given && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                                • {formatTimeDisplay(am.timestamp)}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] truncate mt-0.5">
                            {am?.given
                              ? `By ${am.givenBy}${am.note ? ` • ${am.note}` : ''}`
                              : 'Not logged (Tap to add)'}
                          </div>
                        </div>
                        {am?.given ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                      </button>

                      {/* Evening Pill */}
                      <button
                        type="button"
                        onClick={() => openManualEntryModal(dateKey, 'evening', pm)}
                        className={`px-3 py-2 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                          pm?.given
                            ? 'bg-emerald-500/15 border-emerald-500/30'
                            : darkMode
                              ? 'bg-slate-800/50 border-slate-700 text-slate-400'
                              : 'bg-slate-50 border-slate-200/80 text-slate-500'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 text-xs font-bold">
                            <Moon
                              className={`w-3.5 h-3.5 shrink-0 ${
                                pm?.given ? 'text-indigo-500' : 'text-slate-400'
                              }`}
                            />
                            <span>PM</span>
                            {pm?.given && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                                • {formatTimeDisplay(pm.timestamp)}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] truncate mt-0.5">
                            {pm?.given
                              ? `By ${pm.givenBy}${pm.note ? ` • ${pm.note}` : ''}`
                              : 'Not logged (Tap to add)'}
                          </div>
                        </div>
                        {pm?.given ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      {/* ========================================== */}
      {/* MODAL 1: UNDO CONFIRMATION MODAL           */}
      {/* ========================================== */}
      {confirmUndoModal && (
        <div
          onClick={() => setConfirmUndoModal(null)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm Uncheck Dose"
            className={`rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-4 sm:p-6 shadow-xl border space-y-4 ${cardSurface}`}
          >
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  Uncheck {confirmUndoModal.slot === 'morning' ? 'Morning' : 'Evening'} Dose?
                </h3>
                <p className="text-xs text-slate-500">Date: {confirmUndoModal.dateKey}</p>
              </div>
            </div>

            <p className="text-sm opacity-85 leading-relaxed">
              This dose was marked as given at{' '}
              <strong>{formatTimeDisplay(confirmUndoModal.existingData?.timestamp)}</strong> by{' '}
              <strong>{confirmUndoModal.existingData?.givenBy}</strong>. Unchecking it will show
              the dose as pending on everyone&apos;s phone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmUndoModal(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold text-sm"
              >
                Keep Checked
              </button>
              <button
                type="button"
                onClick={handleConfirmUndoDose}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm"
              >
                Yes, Uncheck Dose
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 2: MANUAL / PAST DOSE ENTRY MODAL    */}
      {/* ========================================== */}
      {manualLogModal && (
        <div
          onClick={() => setManualLogModal(null)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Log or Edit Dose Entry"
            className={`rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto p-4 sm:p-6 shadow-xl border ${cardSurface}`}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold">
                  {manualLogModal.existingData?.given ? 'Edit' : 'Log'}{' '}
                  {manualLogModal.slot === 'morning' ? 'Morning (AM)' : 'Evening (PM)'} Dose
                </h3>
                <p className="text-xs text-slate-500">
                  Date: {formatFriendlyDate(manualLogModal.dateKey, todayKey)} (
                  {manualLogModal.dateKey})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualLogModal(null)}
                aria-label="Close Dose Entry Modal"
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualEntry} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Time Dose Was Given
                </label>
                <input
                  type="time"
                  value={manualTimeInput}
                  onChange={(e) => setManualTimeInput(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Given By
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(settings.caregivers || DEFAULT_SETTINGS.caregivers).map((person) => (
                    <button
                      key={person}
                      type="button"
                      onClick={() => setManualCaregiverInput(person)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        manualCaregiverInput === person
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      {person}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={manualCaregiverInput}
                  onChange={(e) => setManualCaregiverInput(e.target.value)}
                  placeholder="Name of person..."
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Optional Note
                </label>
                <input
                  type="text"
                  value={manualNoteInput}
                  onChange={(e) => setManualNoteInput(e.target.value)}
                  placeholder="e.g., Took well with wet food"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                {manualLogModal.existingData?.given ? (
                  <button
                    type="button"
                    onClick={() => {
                      const modalRef = manualLogModal;
                      setManualLogModal(null);
                      setConfirmUndoModal(modalRef);
                    }}
                    className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-300 font-semibold text-xs sm:text-sm"
                  >
                    Clear / Uncheck
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setManualLogModal(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm"
                  >
                    Save Entry
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 3: DOSAGE & BOTTLE SETTINGS MODAL    */}
      {/* ========================================== */}
      {settingsModalOpen && canConfigure && (
        <div
          onClick={() => setSettingsModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Pet and Medication Settings"
            className={`rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto p-4 sm:p-6 shadow-xl border ${cardSurface}`}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold">
                  Cadence • Pet &amp; Medication Settings
                </h3>
                <p className="text-xs text-slate-500">
                  Changes sync immediately across all household devices
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                aria-label="Close Medication Settings Modal"
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Pet Name
                  </label>
                  <input
                    type="text"
                    value={settingsForm.catName}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, catName: e.target.value })
                    }
                    placeholder="e.g., Milo, Luna"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Prescribed Dosage Badge
                  </label>
                  <input
                    type="text"
                    value={settingsForm.dosageLabel}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, dosageLabel: e.target.value })
                    }
                    placeholder="e.g., 2.5 mg / 0.5 ml"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Medication Name
                </label>
                <input
                  type="text"
                  value={settingsForm.medicationName}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, medicationName: e.target.value })
                  }
                  placeholder="e.g., Oral Solution, Methimazole"
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Morning Target Time
                  </label>
                  <input
                    type="time"
                    value={settingsForm.morningTargetTime}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, morningTargetTime: e.target.value })
                    }
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Evening Target Time
                  </label>
                  <input
                    type="time"
                    value={settingsForm.eveningTargetTime}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, eveningTargetTime: e.target.value })
                    }
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Current Bottle Opened Date
                  </label>
                  <input
                    type="date"
                    value={settingsForm.bottleOpenedDate}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, bottleOpenedDate: e.target.value })
                    }
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Shelf Life Once Opened (Days)
                  </label>
                  <input
                    type="number"
                    min="7"
                    max="365"
                    value={settingsForm.bottleShelfLifeDays ?? ''}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        bottleShelfLifeDays: e.target.value
                      })
                    }
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Administration &amp; Care Instructions
                </label>
                <textarea
                  rows={2}
                  value={settingsForm.administrationNote}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, administrationNote: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm"
                >
                  Save Household Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 4: RESET BOTTLE DATE CONFIRMATION    */}
      {/* ========================================== */}
      {confirmNewBottleModal && canConfigure && (
        <div
          onClick={() => setConfirmNewBottleModal(false)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm New Bottle"
            className={`rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-4 sm:p-6 shadow-xl border space-y-4 ${cardSurface}`}
          >
            <div className="flex items-center gap-3 text-purple-600 dark:text-purple-400">
              <div className="w-11 h-11 rounded-2xl bg-purple-500/15 flex items-center justify-center shrink-0">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Start Fresh Bottle Today?</h3>
                <p className="text-xs text-slate-500">
                  Sets opened date to {todayKey} ({settings.bottleShelfLifeDays}-day shelf life)
                </p>
              </div>
            </div>
            <p className="text-sm opacity-85 leading-relaxed">
              This will reset {settings.catName}&apos;s {settings.medicationName} bottle shelf-life countdown for everyone in the household.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmNewBottleModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOpenNewBottleToday}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm cursor-pointer"
              >
                Confirm New Bottle
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
