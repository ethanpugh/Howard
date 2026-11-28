import { memo, useCallback, useMemo, useState } from 'react';
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
  Sun,
  type LucideIcon
} from 'lucide-react';
import type {
  CadenceDayLog,
  CadenceDose,
  CadenceSettings,
  CadenceSnapshot
} from '../../shared/schemas/cadence.ts';
import type { PublicProfile } from '../../shared/schemas/profile.ts';
import type { ShowToastFn } from '../App.tsx';
import type { SyncFetchOptions } from '../hooks/useHouseholdSync.ts';
import {
  buildTimestampForDate,
  clampFiniteNumber,
  computeBottleStatus,
  createDefaultCadenceSettings,
  formatDurationAgo,
  formatFriendlyDate,
  formatTimeDisplay,
  getLocalDateKey
} from '../utils/householdHelpers.ts';
import { createRpcClient, unwrapRpc } from '../utils/apiClient.ts';
import { useWeekNavigation } from '../hooks/useWeekNavigation.ts';
import { useActionLock } from '../hooks/useActionLock.ts';
import {
  AlertBanner,
  Button,
  CardHeader,
  ModuleHeader,
  ModulePage,
  SectionCard,
  StatusPill,
  SubSurface,
  WeeklyHistoryPanel
} from '../components/HowardUI.tsx';
import DoseCard from './cadence/DoseCard.tsx';
import {
  CadenceSettingsModal,
  ManualDoseModal,
  NewBottleConfirmModal,
  UndoDoseModal,
  type CadenceModalState,
  type CadenceSettingsForm,
  type CadenceSlot,
  type ManualDoseEntryPayload
} from './cadence/CadenceModals.tsx';

const EMPTY_LOGS: Record<string, CadenceDayLog> = {};
const HISTORY_SLOTS: ReadonlyArray<{
  key: CadenceSlot;
  shortLabel: string;
  Icon: LucideIcon;
}> = [
  { key: 'morning', shortLabel: 'AM', Icon: Sun },
  { key: 'evening', shortLabel: 'PM', Icon: Moon }
];

const TIME_HH_MM_RE = /^(\d{1,2}):(\d{2})$/;

function normalizeValidTimeHHMM(raw: string | undefined): string | null {
  const trimmed = String(raw || '').trim();
  const match = TIME_HH_MM_RE.exec(trimmed);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isInteger(hh) || hh < 0 || hh > 23 || !Number.isInteger(mm) || mm < 0 || mm > 59) {
    return null;
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function parseMinutesOfDay(timeStr: string | undefined, fallbackHour: number): number {
  const normalized = normalizeValidTimeHHMM(timeStr);
  if (!normalized) return fallbackHour * 60;
  const [hhStr, mmStr] = normalized.split(':');
  return Number(hhStr) * 60 + Number(mmStr);
}

interface OptimisticSlotPatch {
  dose: CadenceDose | null;
  updatedAt: string;
}

interface OptimisticLogsPatch {
  baseSnapshot: CadenceSnapshot | undefined;
  byDate: Record<string, Partial<Record<CadenceSlot, OptimisticSlotPatch>>>;
}

interface OptimisticSettingsPatch {
  baseSnapshot: CadenceSnapshot | undefined;
  mutationId: string;
  settings: Partial<CadenceSettings>;
}

export interface CadenceAppProps {
  activeProfile: PublicProfile;
  darkMode?: boolean | undefined;
  nowMs?: number | undefined;
  todayKey?: string | undefined;
  cadenceSnapshot: CadenceSnapshot;
  onGlobalSync?: ((opts?: SyncFetchOptions) => Promise<void> | void) | undefined;
  showToast?: ShowToastFn | undefined;
}

function CadenceApp({
  activeProfile,
  nowMs = Date.now(),
  todayKey: propTodayKey,
  cadenceSnapshot,
  onGlobalSync,
  showToast
}: CadenceAppProps) {
  const canConfigure = activeProfile?.id !== 'caregiver';
  const todayKey = propTodayKey || getLocalDateKey(new Date(nowMs));
  const activeCaregiver = activeProfile?.caregiverName || activeProfile?.name || 'Partner 1';

  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<CadenceModalState | null>(null);
  const [optimisticLogsPatch, setOptimisticLogsPatch] = useState<OptimisticLogsPatch | null>(null);
  const [optimisticSettingsPatch, setOptimisticSettingsPatch] =
    useState<OptimisticSettingsPatch | null>(null);

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
    if (!optimisticLogsPatch || optimisticLogsPatch.baseSnapshot !== cadenceSnapshot) {
      return serverLogsByDate;
    }
    const merged: Record<string, CadenceDayLog> = { ...serverLogsByDate };
    for (const [dKey, slotPatches] of Object.entries(optimisticLogsPatch.byDate)) {
      const baseDay: CadenceDayLog = merged[dKey] || { dateKey: dKey };
      const nextDay: CadenceDayLog = { ...baseDay, dateKey: dKey };
      if (slotPatches.morning) {
        nextDay.morning = slotPatches.morning.dose;
        nextDay.updatedAt = slotPatches.morning.updatedAt;
      }
      if (slotPatches.evening) {
        nextDay.evening = slotPatches.evening.dose;
        nextDay.updatedAt = slotPatches.evening.updatedAt;
      }
      merged[dKey] = nextDay;
    }
    return merged;
  }, [serverLogsByDate, optimisticLogsPatch, cadenceSnapshot]);

  const todayLog: CadenceDayLog = logsByDate[todayKey] || {};
  const morningDose = todayLog.morning || null;
  const eveningDose = todayLog.evening || null;

  const lastDoseInfo = useMemo(() => {
    const candidates: Array<CadenceDose & { slotLabel: string; dateKey: string }> = [];
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
    candidates.sort((a, b) => {
      const tsA = Date.parse(a.timestamp || '');
      const tsB = Date.parse(b.timestamp || '');
      return (Number.isFinite(tsB) ? tsB : 0) - (Number.isFinite(tsA) ? tsA : 0);
    });
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
      const record: CadenceDayLog = logsByDate[dKey] || {};
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

  const applyOptimisticSlot = useCallback(
    (
      dateKey: string,
      slot: CadenceSlot,
      dose: CadenceDose | null,
      updatedAt: string,
      baseSnapshot: CadenceSnapshot | undefined
    ) => {
      setOptimisticLogsPatch((prev) => {
        const baseByDate = prev && prev.baseSnapshot === baseSnapshot ? prev.byDate : {};
        const existingDatePatch = baseByDate[dateKey] || {};
        return {
          baseSnapshot,
          byDate: {
            ...baseByDate,
            [dateKey]: {
              ...existingDatePatch,
              [slot]: { dose, updatedAt }
            }
          }
        };
      });
    },
    []
  );

  const revertOptimisticSlot = useCallback(
    (
      dateKey: string,
      slot: CadenceSlot,
      expectedUpdatedAt: string,
      baseSnapshot: CadenceSnapshot | undefined
    ) => {
      setOptimisticLogsPatch((prev) => {
        if (!prev || prev.baseSnapshot !== baseSnapshot) return prev;
        const datePatch = prev.byDate[dateKey];
        if (!datePatch || datePatch[slot]?.updatedAt !== expectedUpdatedAt) return prev;
        const nextDatePatch = { ...datePatch };
        delete nextDatePatch[slot];
        const nextByDate = { ...prev.byDate };
        if (Object.keys(nextDatePatch).length === 0) {
          delete nextByDate[dateKey];
        } else {
          nextByDate[dateKey] = nextDatePatch;
        }
        return Object.keys(nextByDate).length === 0
          ? null
          : { baseSnapshot: prev.baseSnapshot, byDate: nextByDate };
      });
    },
    []
  );

  const saveDayLogToApi = useCallback(
    async (
      dateKey: string,
      slot: CadenceSlot,
      payload: { morning?: CadenceDose | null; evening?: CadenceDose | null; updatedAt?: string },
      capturedSnapshot: CadenceSnapshot | undefined,
      mutationToken: string
    ) => {
      const rpc = createRpcClient({ profileId: activeProfile.id });
      const data = await unwrapRpc(
        rpc.api.cadence.logs[':dateKey'].$put({
          param: { dateKey },
          json: payload
        })
      );
      if (data?.record) {
        const resolvedDose = slot === 'morning' ? data.record.morning ?? null : data.record.evening ?? null;
        applyOptimisticSlot(dateKey, slot, resolvedDose, mutationToken, capturedSnapshot);
      }
      setSyncError(null);
      if (onGlobalSync) void onGlobalSync();
    },
    [activeProfile.id, applyOptimisticSlot, onGlobalSync]
  );

  const saveSettingsToApi = useCallback(
    async (
      updatedSettings: Partial<CadenceSettings>,
      capturedSnapshot: CadenceSnapshot | undefined,
      mutationId: string
    ) => {
      const rpc = createRpcClient({ profileId: activeProfile.id });
      const data = await unwrapRpc(
        rpc.api.cadence.settings.$put({
          json: updatedSettings
        })
      );
      if (data?.settings) {
        setOptimisticSettingsPatch({
          baseSnapshot: capturedSnapshot,
          mutationId,
          settings: data.settings
        });
      }
      setSyncError(null);
      if (onGlobalSync) void onGlobalSync();
    },
    [activeProfile.id, onGlobalSync]
  );

  const handleRecordDose = useCallback(
    (slot: CadenceSlot, customNote = '') =>
      runLocked(async () => {
        const liveNow = new Date();
        const targetDateKey = getLocalDateKey(liveNow);
        const timestampIso = liveNow.toISOString();
        const capturedSnapshot = cadenceSnapshot;
        const dosePayload: CadenceDose = {
          given: true,
          timestamp: timestampIso,
          givenBy: activeCaregiver,
          givenByProfileId: activeProfile.id,
          dosage: settings.dosageLabel,
          note: customNote.trim()
        };

        applyOptimisticSlot(targetDateKey, slot, dosePayload, timestampIso, capturedSnapshot);

        try {
          await saveDayLogToApi(
            targetDateKey,
            slot,
            { [slot]: dosePayload, updatedAt: timestampIso },
            capturedSnapshot,
            timestampIso
          );
          showToast?.(
            `Logged ${settings.catName}'s ${slot === 'morning' ? 'Morning' : 'Evening'} dose (${activeCaregiver})`
          );
        } catch (err) {
          console.error('Error recording dose:', err);
          revertOptimisticSlot(targetDateKey, slot, timestampIso, capturedSnapshot);
          if (onGlobalSync) void onGlobalSync({ force: true });
          setSyncError(
            err instanceof Error && err.message
              ? err.message
              : 'Failed to save dose to local server. Reverted — please check Wi-Fi.'
          );
        }
      }),
    [
      runLocked,
      cadenceSnapshot,
      activeCaregiver,
      activeProfile.id,
      settings.dosageLabel,
      settings.catName,
      applyOptimisticSlot,
      revertOptimisticSlot,
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
      const capturedSnapshot = cadenceSnapshot;
      applyOptimisticSlot(dateKey, slot, null, timestampIso, capturedSnapshot);
      setActiveModal(null);

      try {
        await saveDayLogToApi(
          dateKey,
          slot,
          { [slot]: null, updatedAt: timestampIso },
          capturedSnapshot,
          timestampIso
        );
        showToast?.(
          `Unchecked ${slot === 'morning' ? 'Morning' : 'Evening'} dose for ${formatFriendlyDate(dateKey, todayKey)}`
        );
      } catch (err) {
        console.error('Error undoing dose:', err);
        revertOptimisticSlot(dateKey, slot, timestampIso, capturedSnapshot);
        if (onGlobalSync) void onGlobalSync({ force: true });
        setSyncError(
          err instanceof Error && err.message
            ? err.message
            : 'Failed to undo dose record — reverted.'
        );
      }
    });
  }, [
    activeModal,
    runLocked,
    cadenceSnapshot,
    applyOptimisticSlot,
    revertOptimisticSlot,
    saveDayLogToApi,
    showToast,
    todayKey,
    onGlobalSync
  ]);

  const handleSaveManualEntry = useCallback(
    ({ timeInput, caregiverInput, noteInput }: ManualDoseEntryPayload) => {
      if (activeModal?.type !== 'manual') return undefined;
      const { dateKey, slot, existingData } = activeModal;
      const normalizedTime = normalizeValidTimeHHMM(timeInput);
      if (!normalizedTime) {
        setSyncError('Please enter a valid 24-hour time (HH:MM, 00:00–23:59).');
        return undefined;
      }

      return runLocked(async () => {
        const customTimestampIso = buildTimestampForDate(dateKey, normalizedTime);
        const timestampIso = new Date().toISOString();
        const capturedSnapshot = cadenceSnapshot;
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
                ? activeProfile.id
                : null;

        const dosePayload: CadenceDose = {
          given: true,
          time: normalizedTime,
          timestamp: customTimestampIso,
          givenBy: nextGivenBy,
          givenByProfileId: resolvedProfileId,
          dosage: settings.dosageLabel,
          note: noteInput.trim()
        };

        applyOptimisticSlot(dateKey, slot, dosePayload, timestampIso, capturedSnapshot);
        setActiveModal(null);

        try {
          await saveDayLogToApi(
            dateKey,
            slot,
            { [slot]: dosePayload, updatedAt: timestampIso },
            capturedSnapshot,
            timestampIso
          );
          showToast?.(
            `Saved ${slot === 'morning' ? 'Morning' : 'Evening'} dose for ${formatFriendlyDate(dateKey, todayKey)}`
          );
        } catch (err) {
          console.error('Error saving manual dose entry:', err);
          revertOptimisticSlot(dateKey, slot, timestampIso, capturedSnapshot);
          if (onGlobalSync) void onGlobalSync({ force: true });
          setSyncError(
            err instanceof Error && err.message
              ? err.message
              : 'Failed to save manual entry — reverted.'
          );
        }
      });
    },
    [
      activeModal,
      runLocked,
      cadenceSnapshot,
      activeCaregiver,
      settings.caregiverItems,
      settings.dosageLabel,
      activeProfile.id,
      applyOptimisticSlot,
      revertOptimisticSlot,
      saveDayLogToApi,
      showToast,
      todayKey,
      onGlobalSync
    ]
  );

  const handleSaveSettings = useCallback(
    (form: CadenceSettingsForm) => {
      if (!canConfigure) return undefined;
      return runLocked(async () => {
        const defaults = createDefaultCadenceSettings();
        const rawShelf = form.bottleShelfLifeDays;
        const shelfLifeDays =
          rawShelf === '' || rawShelf === null || rawShelf === undefined
            ? 180
            : Math.round(clampFiniteNumber(rawShelf, 7, 365, 180));
        const normalizedAm = normalizeValidTimeHHMM(form.morningTargetTime) || '08:00';
        const normalizedPm = normalizeValidTimeHHMM(form.eveningTargetTime) || '20:00';
        const capturedSnapshot = cadenceSnapshot;
        const mutationId = `settings-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const editablePayload = {
          catName: (form.catName || '').trim() || defaults.catName,
          medicationName: (form.medicationName || '').trim() || defaults.medicationName,
          dosageLabel: (form.dosageLabel || '').trim() || defaults.dosageLabel,
          morningTargetTime: normalizedAm,
          eveningTargetTime: normalizedPm,
          bottleOpenedDate: form.bottleOpenedDate || settings.bottleOpenedDate || todayKey,
          bottleShelfLifeDays: shelfLifeDays,
          administrationNote: (form.administrationNote || '').trim()
        };

        setOptimisticSettingsPatch({
          baseSnapshot: capturedSnapshot,
          mutationId,
          settings: editablePayload
        });
        setActiveModal(null);

        try {
          await saveSettingsToApi(editablePayload, capturedSnapshot, mutationId);
          showToast?.(`Saved ${editablePayload.catName}'s Cadence settings`);
        } catch (err) {
          console.error('Error saving settings:', err);
          setOptimisticSettingsPatch((prev) =>
            prev && prev.baseSnapshot === capturedSnapshot && prev.mutationId === mutationId
              ? null
              : prev
          );
          if (onGlobalSync) void onGlobalSync({ force: true });
          setSyncError(
            err instanceof Error && err.message
              ? err.message
              : 'Failed to update settings — reverted.'
          );
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
      const liveTodayKey = getLocalDateKey(new Date());
      const capturedSnapshot = cadenceSnapshot;
      const mutationId = `bottle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const updated: CadenceSettings = { ...settings, bottleOpenedDate: liveTodayKey };
      setOptimisticSettingsPatch({
        baseSnapshot: capturedSnapshot,
        mutationId,
        settings: updated
      });
      setActiveModal(null);

      try {
        await saveSettingsToApi(updated, capturedSnapshot, mutationId);
        showToast?.(`Reset ${settings.catName}'s bottle opened date to Today`);
      } catch (err) {
        console.error('Error resetting bottle date:', err);
        setOptimisticSettingsPatch((prev) =>
          prev && prev.baseSnapshot === capturedSnapshot && prev.mutationId === mutationId
            ? null
            : prev
        );
        if (onGlobalSync) void onGlobalSync({ force: true });
        setSyncError(
          err instanceof Error && err.message
            ? err.message
            : 'Failed to update bottle opened date — reverted.'
        );
      }
    });
  }, [
    canConfigure,
    runLocked,
    settings,
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
        theme: 'bg-emerald-500/12 border-emerald-500/35 text-emerald-950 dark:text-emerald-100',
        badgeTheme: 'bg-emerald-700 text-white',
        iconWrapTheme: 'bg-emerald-700 text-white',
        icon: <CheckCircle2 className="w-5 h-5 shrink-0" />,
        title: `All Done Today! Both of ${settings.catName}'s Doses Given`,
        subtitle: `AM ${formatTimeDisplay(morningDose.timestamp)} (${morningDose.givenBy}) • PM ${formatTimeDisplay(eveningDose.timestamp)} (${eveningDose.givenBy})`,
        warningText: 'DO NOT GIVE ANOTHER DOSE TODAY'
      };
    }

    if (onlyMorningDone) {
      return {
        theme: 'bg-purple-500/12 border-purple-500/35 text-text-primary',
        badgeTheme: 'bg-purple-600 text-white',
        iconWrapTheme: 'bg-purple-600 text-white',
        icon: isEveningWindow ? (
          <Moon className="w-5 h-5 shrink-0" />
        ) : (
          <CheckCircle2 className="w-5 h-5 shrink-0" />
        ),
        title: isEveningWindow
          ? `Morning Done • Ready for ${settings.catName}'s Evening Dose`
          : `Morning Dose Given! Waiting until Evening`,
        subtitle: `AM (${settings.dosageLabel}) given at ${formatTimeDisplay(morningDose.timestamp)} by ${morningDose.givenBy}.`,
        warningText: `NEXT DOSE AT ~${settings.eveningTargetTime}`
      };
    }

    if (onlyEveningDone) {
      return {
        theme: 'bg-amber-500/15 border-amber-500/45 text-amber-950 dark:text-amber-100',
        badgeTheme: 'bg-amber-500 text-slate-950',
        iconWrapTheme: 'bg-amber-500 text-slate-950',
        icon: <AlertTriangle className="w-5 h-5 shrink-0" />,
        title: `Evening Dose Logged • Morning Dose Unchecked`,
        subtitle: `Evening dose given at ${formatTimeDisplay(eveningDose.timestamp)} by ${eveningDose.givenBy}.`,
        warningText: 'EVENING DOSE ALREADY GIVEN TODAY'
      };
    }

    return {
      theme: 'bg-purple-500/10 border-purple-500/30 text-text-primary',
      badgeTheme: 'bg-amber-500 text-slate-950',
      iconWrapTheme: 'bg-purple-600 text-white',
      icon: <Sun className="w-5 h-5 shrink-0" />,
      title: `No Doses Logged Yet Today for ${settings.catName}`,
      subtitle: `Target: AM ${settings.morningTargetTime} & PM ${settings.eveningTargetTime} • ${settings.dosageLabel}`,
      warningText: 'AWAITING MORNING DOSE'
    };
  }, [morningDose, eveningDose, settings, isEveningWindow]);

  const openManualModalFor = useCallback(
    (dateKey: string, slot: CadenceSlot, existingData?: CadenceDose | null) =>
      setActiveModal({ type: 'manual', dateKey, slot, existingData }),
    []
  );

  const openTodayManual = useCallback(
    (slot: CadenceSlot, existingData?: CadenceDose | null) =>
      openManualModalFor(todayKey, slot, existingData),
    [openManualModalFor, todayKey]
  );

  const openTodayUndo = useCallback(
    (slot: CadenceSlot, existingData?: CadenceDose | null) =>
      setActiveModal({ type: 'undo', dateKey: todayKey, slot, existingData }),
    [todayKey]
  );

  return (
    <ModulePage module="cadence">
      {/* CADENCE MODULE HEADER BAR + MERGED ANTI-DOUBLE-DOSE STATUS STRIP */}
      <ModuleHeader
        accent="purple"
        icon={Cat}
        shortTitle={`Cadence • ${settings.catName}`}
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
            <Button
              variant="secondary"
              accent="purple"
              size="md"
              icon={Settings}
              onClick={() => setActiveModal({ type: 'settings' })}
              title="Edit Household & Medication Settings"
              aria-label="Edit Household & Medication Settings"
            >
              <span className="hidden sm:inline">Medication Settings</span>
            </Button>
          ) : null
        }
        footer={
          <section
            aria-label="Current Dose Status"
            className={`rounded-2xl p-3 sm:p-3.5 border transition-colors duration-300 space-y-2 ${statusBanner.theme}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase ${statusBanner.badgeTheme}`}
              >
                <ShieldAlert className="w-3 h-3 shrink-0" />
                {statusBanner.warningText}
              </span>

              {lastDoseInfo && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary tabular-nums">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  Last: {formatDurationAgo(lastDoseInfo.timestamp, nowMs)} (
                  {formatFriendlyDate(lastDoseInfo.dateKey, todayKey)} {lastDoseInfo.slotLabel})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${statusBanner.iconWrapTheme}`}
              >
                {statusBanner.icon}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold leading-snug">
                  {statusBanner.title}
                </h2>
                <p className="text-xs text-text-secondary leading-snug tabular-nums">
                  {statusBanner.subtitle}
                </p>
              </div>
            </div>
          </section>
        }
      />

      {/* SYNC ERROR NOTICE */}
      {syncError && (
        <AlertBanner
          severity="danger"
          icon={AlertTriangle}
          title="Cadence Sync Error"
          description={syncError}
          action={
            <Button
              variant="dangerTinted"
              size="sm"
              onClick={() => setSyncError(null)}
            >
              Dismiss
            </Button>
          }
        />
      )}

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
        <CardHeader
          icon={Droplets}
          accent={bottleStatus.isExpired ? 'rose' : bottleStatus.isExpiringSoon ? 'amber' : 'purple'}
          iconSize="lg"
          titleAs="h3"
          title={`${settings.medicationName} Bottle Tracker`}
          badges={
            <StatusPill accent="purple">
              {settings.dosageLabel} • 2x Daily
            </StatusPill>
          }
          subtitle={
            <>
              Opened <strong>{bottleStatus.openedDateFormatted}</strong> ({bottleStatus.diffDaysOpen}{' '}
              days ago) • Discard after <strong>{bottleStatus.expiryDateFormatted}</strong>
            </>
          }
          action={
            canConfigure ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="tinted"
                  accent="purple"
                  size="md"
                  icon={RefreshCw}
                  disabled={isSaving}
                  onClick={() => setActiveModal({ type: 'newBottle' })}
                >
                  Opened New Bottle Today
                </Button>
                <Button
                  variant="secondary"
                  accent="purple"
                  size="md"
                  onClick={() => setActiveModal({ type: 'settings' })}
                >
                  Configure
                </Button>
              </div>
            ) : null
          }
        />

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
              style={{
                width: `${
                  bottleStatus.isExpired
                    ? 100
                    : Math.max(4, 100 - bottleStatus.percentUsed)
                }%`
              }}
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
              const dayRecord: CadenceDayLog = logsByDate[dateKey] || {};
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
                                  • {formatTimeDisplay(slotDose?.timestamp)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs truncate mt-0.5">
                              {isGiven
                                ? `By ${slotDose?.givenBy ?? ''}${slotDose?.note ? ` • ${slotDose.note}` : ''}`
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
    </ModulePage>
  );
}

export default memo(CadenceApp);
