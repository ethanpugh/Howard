import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Cat,
  CheckCircle2,
  Clock,
  Droplets,
  History,
  Info,
  Moon,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun
} from 'lucide-react';
import {
  buildTimestampForDate,
  clampFiniteNumber,
  computeBottleStatus,
  createDefaultCadenceSettings,
  formatDurationAgo,
  formatFriendlyDate,
  formatTimeDisplay,
  getLocalDateKey
} from '../utils/householdHelpers.js';
import { apiRequest } from '../utils/apiClient.js';
import { useWeekNavigation } from '../hooks/useWeekNavigation.js';
import { useActionLock } from '../hooks/useActionLock.js';
import {
  ModuleHeader,
  SectionCard,
  StatusPill,
  SubSurface,
  WeeklyHistoryPanel
} from '../components/HowardUI.jsx';
import DoseCard from './cadence/DoseCard.jsx';
import {
  CadenceSettingsModal,
  ManualDoseModal,
  NewBottleConfirmModal,
  UndoDoseModal
} from './cadence/CadenceModals.jsx';

const EMPTY_LOGS = {};
const HISTORY_SLOTS = [
  { key: 'morning', shortLabel: 'AM', Icon: Sun },
  { key: 'evening', shortLabel: 'PM', Icon: Moon }
];

function parseMinutesOfDay(timeStr, fallbackHour) {
  const [hh, mm] = String(timeStr || '').split(':').map(Number);
  return (Number.isFinite(hh) ? hh : fallbackHour) * 60 + (Number.isFinite(mm) ? mm : 0);
}

function CadenceApp({
  activeProfile,
  darkMode: _darkMode,
  nowMs = Date.now(),
  todayKey: propTodayKey,
  cadenceSnapshot,
  onGlobalSync,
  showToast
}) {
  const canConfigure = activeProfile?.id !== 'caregiver';
  const todayKey = propTodayKey || getLocalDateKey(new Date(nowMs));
  const profileId = activeProfile?.id || '';
  const activeCaregiver = activeProfile?.caregiverName || activeProfile?.name || 'Partner 1';

  const [syncError, setSyncError] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [optimisticLogsPatch, setOptimisticLogsPatch] = useState(null);
  const [optimisticSettingsPatch, setOptimisticSettingsPatch] = useState(null);

  const { isPending: isSaving, runLocked } = useActionLock();
  const weekNav = useWeekNavigation(todayKey);

  // Derive settings and logs directly from cadenceSnapshot with snapshot-scoped optimistic overlay
  const serverSettings = useMemo(
    () => ({ ...createDefaultCadenceSettings(), ...cadenceSnapshot?.settings }),
    [cadenceSnapshot?.settings]
  );
  const serverLogsByDate = cadenceSnapshot?.logsByDate || EMPTY_LOGS;
  const isLoadingData = !cadenceSnapshot;

  const settings = useMemo(() => {
    if (optimisticSettingsPatch && optimisticSettingsPatch.baseSnapshot === cadenceSnapshot) {
      return { ...serverSettings, ...optimisticSettingsPatch.settings };
    }
    return serverSettings;
  }, [serverSettings, optimisticSettingsPatch, cadenceSnapshot]);

  const logsByDate = useMemo(() => {
    if (optimisticLogsPatch && optimisticLogsPatch.baseSnapshot === cadenceSnapshot) {
      return { ...serverLogsByDate, ...optimisticLogsPatch.byDate };
    }
    return serverLogsByDate;
  }, [serverLogsByDate, optimisticLogsPatch, cadenceSnapshot]);

  const todayLog = logsByDate[todayKey] || {};
  const morningDose = todayLog.morning || null;
  const eveningDose = todayLog.evening || null;

  const lastDoseInfo = useMemo(() => {
    const candidates = [];
    Object.keys(logsByDate).forEach((dKey) => {
      const dayRecord = logsByDate[dKey];
      if (!dayRecord) return;
      if (dayRecord.morning?.given && dayRecord.morning?.timestamp) {
        candidates.push({ ...dayRecord.morning, slotLabel: 'Morning', dateKey: dKey });
      }
      if (dayRecord.evening?.given && dayRecord.evening?.timestamp) {
        candidates.push({ ...dayRecord.evening, slotLabel: 'Evening', dateKey: dKey });
      }
    });
    candidates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return candidates[0] || null;
  }, [logsByDate]);

  const bottleStatus = useMemo(
    () => computeBottleStatus(settings, todayKey),
    [settings, todayKey]
  );

  // Primitive time-threshold booleans prevent per-minute memo thrashing
  const nowDate = new Date(nowMs);
  const currentMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
  const isEveningWindow = nowDate.getHours() >= 17;
  const isPastAmTarget = currentMinutes >= parseMinutesOfDay(settings.morningTargetTime, 8);
  const isPastPmTarget = currentMinutes >= parseMinutesOfDay(settings.eveningTargetTime, 20);

  const adherenceStats = useMemo(() => {
    let completed = 0;
    let totalExpected = 0;

    weekNav.selectedWeekDays.forEach((dKey) => {
      const record = logsByDate[dKey] || {};
      if (dKey === todayKey) {
        const amExpected = isPastAmTarget || record.morning?.given;
        const pmExpected = isPastPmTarget || record.evening?.given;
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
  }, [weekNav.selectedWeekDays, logsByDate, todayKey, isPastAmTarget, isPastPmTarget]);

  const applyOptimisticDayRecord = useCallback(
    (dateKey, record) => {
      setOptimisticLogsPatch((prev) => ({
        baseSnapshot: cadenceSnapshot,
        byDate: {
          ...(prev && prev.baseSnapshot === cadenceSnapshot ? prev.byDate : null),
          [dateKey]: record
        }
      }));
    },
    [cadenceSnapshot]
  );

  const saveDayLogToApi = useCallback(
    async (dateKey, payload) => {
      const data = await apiRequest(`/api/cadence/logs/${encodeURIComponent(dateKey)}`, {
        method: 'PUT',
        body: payload,
        profileId
      });
      if (data?.record) {
        applyOptimisticDayRecord(dateKey, data.record);
      }
      setSyncError(null);
      if (onGlobalSync) onGlobalSync();
    },
    [profileId, applyOptimisticDayRecord, onGlobalSync]
  );

  const saveSettingsToApi = useCallback(
    async (updatedSettings) => {
      const data = await apiRequest('/api/cadence/settings', {
        method: 'PUT',
        body: updatedSettings,
        profileId
      });
      if (data?.settings) {
        setOptimisticSettingsPatch({
          baseSnapshot: cadenceSnapshot,
          settings: data.settings
        });
      }
      setSyncError(null);
      if (onGlobalSync) onGlobalSync();
    },
    [profileId, cadenceSnapshot, onGlobalSync]
  );

  const handleRecordDose = useCallback(
    (slot, customNote = '') =>
      runLocked(async () => {
        const timestampIso = new Date().toISOString();
        const dosePayload = {
          given: true,
          timestamp: timestampIso,
          givenBy: activeCaregiver,
          givenByProfileId: activeProfile?.id || null,
          dosage: settings.dosageLabel,
          note: customNote.trim()
        };

        const currentDayData = logsByDate[todayKey] || { dateKey: todayKey };
        applyOptimisticDayRecord(todayKey, {
          ...currentDayData,
          dateKey: todayKey,
          [slot]: dosePayload,
          updatedAt: timestampIso
        });

        try {
          await saveDayLogToApi(todayKey, { [slot]: dosePayload, updatedAt: timestampIso });
          showToast?.(
            `Logged ${settings.catName}'s ${slot === 'morning' ? 'Morning' : 'Evening'} dose (${activeCaregiver})`
          );
        } catch (err) {
          console.error('Error recording dose:', err);
          setOptimisticLogsPatch(null);
          if (onGlobalSync) onGlobalSync({ force: true });
          setSyncError('Failed to save dose to local server. Reverted — please check Wi-Fi.');
        }
      }),
    [
      runLocked,
      activeCaregiver,
      activeProfile?.id,
      settings.dosageLabel,
      settings.catName,
      logsByDate,
      todayKey,
      applyOptimisticDayRecord,
      saveDayLogToApi,
      showToast,
      onGlobalSync
    ]
  );

  const handleConfirmUndoDose = useCallback(() => {
    if (activeModal?.type !== 'undo') return undefined;
    const { dateKey, slot } = activeModal;
    return runLocked(async () => {
      const timestampIso = new Date().toISOString();
      const currentDayData = logsByDate[dateKey] || { dateKey };
      applyOptimisticDayRecord(dateKey, {
        ...currentDayData,
        dateKey,
        [slot]: null,
        updatedAt: timestampIso
      });
      setActiveModal(null);

      try {
        await saveDayLogToApi(dateKey, { [slot]: null, updatedAt: timestampIso });
        showToast?.(
          `Unchecked ${slot === 'morning' ? 'Morning' : 'Evening'} dose for ${formatFriendlyDate(dateKey, todayKey)}`
        );
      } catch (err) {
        console.error('Error undoing dose:', err);
        setOptimisticLogsPatch(null);
        if (onGlobalSync) onGlobalSync({ force: true });
        setSyncError('Failed to undo dose record — reverted.');
      }
    });
  }, [
    activeModal,
    runLocked,
    logsByDate,
    applyOptimisticDayRecord,
    saveDayLogToApi,
    showToast,
    todayKey,
    onGlobalSync
  ]);

  const handleSaveManualEntry = useCallback(
    ({ timeInput, caregiverInput, noteInput }) => {
      if (activeModal?.type !== 'manual') return undefined;
      const { dateKey, slot, existingData } = activeModal;

      return runLocked(async () => {
        const customTimestampIso = buildTimestampForDate(dateKey, timeInput || '08:00');
        const timestampIso = new Date().toISOString();
        const nextGivenBy = caregiverInput.trim() || activeCaregiver;

        const matchedCaregiverItem = Array.isArray(settings.caregiverItems)
          ? settings.caregiverItems.find(
              (item) => (item?.name || '').trim().toLowerCase() === nextGivenBy.toLowerCase()
            )
          : null;
        const resolvedProfileId =
          existingData?.givenBy && nextGivenBy === existingData.givenBy
            ? existingData.givenByProfileId || null
            : matchedCaregiverItem
              ? matchedCaregiverItem.profileId || null
              : nextGivenBy === activeCaregiver
                ? activeProfile?.id || null
                : null;

        const dosePayload = {
          given: true,
          timestamp: customTimestampIso,
          givenBy: nextGivenBy,
          givenByProfileId: resolvedProfileId,
          dosage: settings.dosageLabel,
          note: noteInput.trim()
        };

        const currentDayData = logsByDate[dateKey] || { dateKey };
        applyOptimisticDayRecord(dateKey, {
          ...currentDayData,
          dateKey,
          [slot]: dosePayload,
          updatedAt: timestampIso
        });
        setActiveModal(null);

        try {
          await saveDayLogToApi(dateKey, { [slot]: dosePayload, updatedAt: timestampIso });
          showToast?.(
            `Saved ${slot === 'morning' ? 'Morning' : 'Evening'} dose for ${formatFriendlyDate(dateKey, todayKey)}`
          );
        } catch (err) {
          console.error('Error saving manual dose entry:', err);
          setOptimisticLogsPatch(null);
          if (onGlobalSync) onGlobalSync({ force: true });
          setSyncError('Failed to save manual entry — reverted.');
        }
      });
    },
    [
      activeModal,
      runLocked,
      activeCaregiver,
      settings.caregiverItems,
      settings.dosageLabel,
      activeProfile?.id,
      logsByDate,
      applyOptimisticDayRecord,
      saveDayLogToApi,
      showToast,
      todayKey,
      onGlobalSync
    ]
  );

  const handleSaveSettings = useCallback(
    (form) => {
      if (!canConfigure) return undefined;
      return runLocked(async () => {
        const defaults = createDefaultCadenceSettings();
        const rawShelf = form.bottleShelfLifeDays;
        const shelfLifeDays =
          rawShelf === '' || rawShelf === null || rawShelf === undefined
            ? 180
            : Math.round(clampFiniteNumber(rawShelf, 7, 365, 180));

        const editablePayload = {
          catName: (form.catName || '').trim() || defaults.catName,
          medicationName: (form.medicationName || '').trim() || defaults.medicationName,
          dosageLabel: (form.dosageLabel || '').trim() || defaults.dosageLabel,
          morningTargetTime: (form.morningTargetTime || '').trim() || '08:00',
          eveningTargetTime: (form.eveningTargetTime || '').trim() || '20:00',
          bottleOpenedDate: form.bottleOpenedDate || settings.bottleOpenedDate || todayKey,
          bottleShelfLifeDays: shelfLifeDays,
          administrationNote: (form.administrationNote || '').trim()
        };

        setOptimisticSettingsPatch({
          baseSnapshot: cadenceSnapshot,
          settings: editablePayload
        });
        setActiveModal(null);

        try {
          await saveSettingsToApi(editablePayload);
          showToast?.(`Saved ${editablePayload.catName}'s Cadence settings`);
        } catch (err) {
          console.error('Error saving settings:', err);
          setOptimisticSettingsPatch(null);
          if (onGlobalSync) onGlobalSync({ force: true });
          setSyncError('Failed to update settings — reverted.');
        }
      });
    },
    [
      canConfigure,
      runLocked,
      settings.bottleOpenedDate,
      todayKey,
      cadenceSnapshot,
      saveSettingsToApi,
      showToast,
      onGlobalSync
    ]
  );

  const handleOpenNewBottleToday = useCallback(() => {
    if (!canConfigure) return undefined;
    return runLocked(async () => {
      const updated = { ...settings, bottleOpenedDate: todayKey };
      setOptimisticSettingsPatch({
        baseSnapshot: cadenceSnapshot,
        settings: updated
      });
      setActiveModal(null);

      try {
        await saveSettingsToApi(updated);
        showToast?.(`Reset ${settings.catName}'s bottle opened date to Today`);
      } catch (err) {
        console.error('Error resetting bottle date:', err);
        setOptimisticSettingsPatch(null);
        if (onGlobalSync) onGlobalSync({ force: true });
        setSyncError('Failed to update bottle opened date — reverted.');
      }
    });
  }, [
    canConfigure,
    runLocked,
    settings,
    todayKey,
    cadenceSnapshot,
    saveSettingsToApi,
    showToast,
    onGlobalSync
  ]);

  const statusBanner = useMemo(() => {
    const bothDone = morningDose?.given && eveningDose?.given;
    const onlyMorningDone = morningDose?.given && !eveningDose?.given;
    const onlyEveningDone = !morningDose?.given && eveningDose?.given;

    if (bothDone) {
      return {
        theme: 'bg-emerald-700 text-white border-emerald-600 shadow-emerald-900/10',
        badgeTheme: 'bg-emerald-900/80 text-emerald-50 border border-emerald-400/30',
        iconWrapTheme: 'bg-white/15',
        icon: <CheckCircle2 className="w-8 h-8 text-white shrink-0" />,
        title: `All Done Today! Both of ${settings.catName}'s Doses Given`,
        subtitle: `Morning given at ${formatTimeDisplay(morningDose.timestamp)} (${morningDose.givenBy}) • Evening given at ${formatTimeDisplay(eveningDose.timestamp)} (${eveningDose.givenBy})`,
        warningText: 'DO NOT GIVE ANOTHER DOSE TODAY'
      };
    }

    if (onlyMorningDone) {
      return {
        theme: 'bg-purple-600 text-white border-purple-500 shadow-purple-900/10',
        badgeTheme: 'bg-purple-800/80 text-purple-50 border border-purple-400/30',
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
        theme: 'bg-amber-700 text-white border-amber-600 shadow-amber-900/10',
        badgeTheme: 'bg-amber-900/75 text-amber-50 border border-amber-400/30',
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
  }, [morningDose, eveningDose, settings, isEveningWindow]);

  const openManualModalFor = useCallback(
    (dateKey, slot, existingData) =>
      setActiveModal({ type: 'manual', dateKey, slot, existingData }),
    []
  );

  const openTodayManual = useCallback(
    (slot, existingData) => openManualModalFor(todayKey, slot, existingData),
    [openManualModalFor, todayKey]
  );

  const openTodayUndo = useCallback(
    (slot, existingData) =>
      setActiveModal({ type: 'undo', dateKey: todayKey, slot, existingData }),
    [todayKey]
  );

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      {/* CADENCE MODULE HEADER BAR */}
      <ModuleHeader
        accent="purple"
        icon={Cat}
        title={
          <>
            Cadence • {settings.catName}&apos;s {settings.medicationName}
          </>
        }
        badges={
          <StatusPill accent="purple">
            <Droplets className="w-3 h-3" />
            {settings.dosageLabel}
          </StatusPill>
        }
        subtitle="Twice-daily dose check-in, bottle shelf-life tracker & household adherence history"
        compactActions
        actions={
          canConfigure ? (
            <button
              type="button"
              onClick={() => setActiveModal({ type: 'settings' })}
              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:px-3.5 rounded-xl font-bold text-xs border bg-surface-subtle border-border-strong text-text-primary hover:bg-surface-hover transition active:scale-[0.98] cursor-pointer"
              title="Edit Household & Medication Settings"
              aria-label="Edit Household & Medication Settings"
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Medication Settings</span>
            </button>
          ) : null
        }
      />

      {/* SYNC ERROR NOTICE */}
      {syncError && (
        <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{syncError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncError(null)}
            className="min-h-[40px] text-xs font-semibold px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 transition active:scale-[0.98] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1) CURRENT STATUS ANTI-DOUBLE-DOSE BANNER */}
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
              Last dose: {formatDurationAgo(lastDoseInfo.timestamp, nowMs)} (
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
            <p className="text-sm sm:text-base leading-relaxed">{statusBanner.subtitle}</p>
          </div>
        </div>
      </section>

      {/* 2) LARGE TAP-FRIENDLY MORNING & EVENING DOSE CARDS */}
      <section aria-label="Today's Doses" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DoseCard
          slot="morning"
          dose={morningDose}
          targetTime={settings.morningTargetTime}
          dosageLabel={settings.dosageLabel}
          activeCaregiver={activeCaregiver}
          isSaving={isSaving}
          onRecordDose={handleRecordDose}
          onOpenManual={openTodayManual}
          onOpenUndo={openTodayUndo}
        />
        <DoseCard
          slot="evening"
          dose={eveningDose}
          targetTime={settings.eveningTargetTime}
          dosageLabel={settings.dosageLabel}
          activeCaregiver={activeCaregiver}
          isSaving={isSaving}
          onRecordDose={handleRecordDose}
          onOpenManual={openTodayManual}
          onOpenUndo={openTodayUndo}
        />
      </section>

      {/* 3) MEDICATION BOTTLE OPEN DATE & DOSAGE */}
      <SectionCard aria-label="Bottle Shelf-Life & Dosage Tracker" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                bottleStatus.isExpired
                  ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                  : bottleStatus.isExpiringSoon
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
              }`}
            >
              <Droplets className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-base">{settings.medicationName} Bottle Tracker</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-600 text-white">
                  {settings.dosageLabel} • 2x Daily
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Opened <strong>{bottleStatus.openedDateFormatted}</strong> ({bottleStatus.diffDaysOpen}{' '}
                days ago) • Discard after <strong>{bottleStatus.expiryDateFormatted}</strong>
              </p>
            </div>
          </div>

          {canConfigure && (
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setActiveModal({ type: 'newBottle' })}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-800 dark:text-purple-300 border border-purple-500/30 text-xs font-bold transition active:scale-[0.98] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Opened New Bottle Today
              </button>
              <button
                type="button"
                onClick={() => setActiveModal({ type: 'settings' })}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-surface-subtle hover:bg-surface-hover text-text-primary text-xs font-semibold transition active:scale-[0.98] cursor-pointer"
              >
                Configure
              </button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
            <span className="text-text-secondary">
              Bottle Shelf Life ({settings.bottleShelfLifeDays}-day limit once opened)
            </span>
            <span
              className={
                bottleStatus.isExpired
                  ? 'text-rose-600 dark:text-rose-400 font-bold'
                  : bottleStatus.isExpiringSoon
                    ? 'text-amber-700 dark:text-amber-300 font-bold'
                    : 'text-purple-700 dark:text-purple-300'
              }
            >
              {bottleStatus.isExpired
                ? `Expired ${Math.abs(bottleStatus.daysRemaining)} days ago — Replace bottle`
                : `${bottleStatus.daysRemaining} days remaining`}
            </span>
          </div>
          <div className="w-full h-2.5 bg-surface-muted rounded-full overflow-hidden">
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
          <SubSurface className="p-3 flex items-start gap-2.5 text-xs text-text-secondary">
            <Info className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-text-primary">Household Care Note: </span>
              {settings.administrationNote}
            </div>
          </SubSurface>
        )}
      </SectionCard>

      {/* 4) WEEKLY MEDICATION HISTORY LOG */}
      <WeeklyHistoryPanel
        ariaLabel="Medication History"
        icon={History}
        title="Medication History"
        subtitle="Browse by week (Mon–Sun) or jump to any date to view or edit entries"
        accent="purple"
        weekNav={weekNav}
        todayKey={todayKey}
        summaryBadge={
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold w-fit">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <span>
              Week Adherence: {adherenceStats.pct}% ({adherenceStats.completed}/
              {adherenceStats.totalExpected} doses)
            </span>
          </div>
        }
      >
        {isLoadingData ? (
          <div className="py-10 text-center text-sm text-text-muted">
            Loading {settings.catName}&apos;s medication history...
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {weekNav.selectedWeekDays.map((dateKey) => {
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
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        am?.given && pm?.given
                          ? 'bg-emerald-500'
                          : am?.given || pm?.given
                            ? 'bg-amber-400'
                            : 'bg-text-muted/50'
                      }`}
                    />
                    <div>
                      <div className="font-bold text-sm flex flex-wrap items-center gap-1.5">
                        <span>{formatFriendlyDate(dateKey, todayKey)}</span>
                        {isToday && (
                          <span className="text-[11px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-800 dark:text-purple-300">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted font-medium">{dateKey}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 sm:max-w-md min-w-0">
                    {HISTORY_SLOTS.map(({ key: slotKey, shortLabel, Icon: SlotIcon }) => {
                      const slotDose = dayRecord[slotKey];
                      const isGiven = Boolean(slotDose?.given);
                      return (
                        <button
                          key={slotKey}
                          type="button"
                          onClick={() => openManualModalFor(dateKey, slotKey, slotDose)}
                          className={`min-w-0 w-full min-h-[44px] px-3 py-2 rounded-xl border text-left transition active:scale-[0.98] flex items-center justify-between gap-2 cursor-pointer ${
                            isGiven
                              ? 'bg-emerald-500/15 border-emerald-500/30'
                              : 'bg-surface-subtle border-border-subtle text-text-secondary hover:bg-surface-hover'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 text-xs font-bold">
                              <SlotIcon
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isGiven
                                    ? 'text-purple-600 dark:text-purple-400'
                                    : 'text-text-muted'
                                }`}
                              />
                              <span>{shortLabel}</span>
                              {isGiven && (
                                <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">
                                  • {formatTimeDisplay(slotDose.timestamp)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs truncate mt-0.5">
                              {isGiven
                                ? `By ${slotDose.givenBy}${slotDose.note ? ` • ${slotDose.note}` : ''}`
                                : 'Not logged (Tap to add)'}
                            </div>
                          </div>
                          {isGiven ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <Plus className="w-3.5 h-3.5 text-text-muted shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </WeeklyHistoryPanel>

      {/* MODALS (conditionally mounted when active so typing never re-renders CadenceApp) */}
      <UndoDoseModal
        modal={activeModal?.type === 'undo' ? activeModal : null}
        isSaving={isSaving}
        onClose={() => setActiveModal(null)}
        onConfirm={handleConfirmUndoDose}
      />

      {activeModal?.type === 'manual' && (
        <ManualDoseModal
          modal={activeModal}
          todayKey={todayKey}
          settings={settings}
          activeCaregiver={activeCaregiver}
          isSaving={isSaving}
          onClose={() => setActiveModal(null)}
          onSwitchToUndo={() => setActiveModal({ ...activeModal, type: 'undo' })}
          onSave={handleSaveManualEntry}
        />
      )}

      {activeModal?.type === 'settings' && canConfigure && (
        <CadenceSettingsModal
          settings={settings}
          isSaving={isSaving}
          onClose={() => setActiveModal(null)}
          onSave={handleSaveSettings}
        />
      )}

      {canConfigure && (
        <NewBottleConfirmModal
          isOpen={activeModal?.type === 'newBottle'}
          todayKey={todayKey}
          settings={settings}
          isSaving={isSaving}
          onClose={() => setActiveModal(null)}
          onConfirm={handleOpenNewBottleToday}
        />
      )}
    </main>
  );
}

export default memo(CadenceApp);
