import { memo, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Droplets,
  Heart,
  AlertCircle,
  ShieldCheck,
  Stethoscope
} from 'lucide-react';
import type { ProfileId } from '../../shared/schemas/common.ts';
import type { FloodgateDayLog, FloodgateSnapshot } from '../../shared/schemas/floodgate.ts';
import type { PublicProfile } from '../../shared/schemas/profile.ts';
import type { NavigationIntent, ShowToastFn } from '../App.tsx';
import type { SyncFetchOptions } from '../hooks/useHouseholdSync.ts';
import {
  VALID_DATE_KEY_RE,
  getLocalDateKey,
  shiftDateKey,
  formatDateFriendlyEnGB,
  formatShortDateEnGB
} from '../utils/householdHelpers.ts';
import { createRpcClient, unwrapRpc } from '../utils/apiClient.ts';
import {
  AlertBanner,
  Button,
  ModuleHeader,
  ModulePage,
  SegmentedTabs,
  StatusPill,
  ConfirmModal
} from '../components/HowardUI.tsx';
import {
  createEmptyEntry,
  normalizeEntry,
  type NormalizedFloodgateEntry,
  type NormalizedFloodgateMedication,
  type PresetMedication
} from './floodgate/floodgateConstants.ts';
import DailyLogTab, { type FloodgateArrayField } from './floodgate/DailyLogTab.tsx';
import CycleCalendarTab, { type CalendarMonthState } from './floodgate/CycleCalendarTab.tsx';
import InsightsReportTab from './floodgate/InsightsReportTab.tsx';
import ExportDataTab from './floodgate/ExportDataTab.tsx';

type FloodgateTabId = 'log' | 'calendar' | 'insights' | 'data';

const isFloodgateTab = (tab: string | undefined): tab is FloodgateTabId =>
  tab === 'log' || tab === 'calendar' || tab === 'insights' || tab === 'data';

type PendingNav =
  | { type: 'date'; target: string }
  | { type: 'tab'; target: FloodgateTabId }
  | { type: 'intent'; target: NavigationIntent };

interface ConfirmModalState {
  title: string;
  message: string;
  confirmText?: string | undefined;
  danger?: boolean | undefined;
  onConfirm?: (() => void) | undefined;
}

interface DraftSnapshot {
  dateKey: string;
  payload: NormalizedFloodgateEntry;
  seq: number;
}

export interface FloodgateAppProps {
  activeProfile: PublicProfile;
  darkMode?: boolean | undefined;
  nowMs?: number | undefined;
  todayKey?: string | undefined;
  isConnected?: boolean | undefined;
  floodgateSnapshot?: FloodgateSnapshot | null | undefined;
  navigationIntent?: NavigationIntent | null | undefined;
  onOpenBackupModal?: (() => void) | undefined;
  onGlobalSync?: ((opts?: SyncFetchOptions) => unknown) | undefined;
  showToast?: ShowToastFn | undefined;
}

function FloodgateApp({
  activeProfile,
  darkMode: _darkMode,
  nowMs = Date.now(),
  todayKey: todayKeyProp,
  isConnected: _isConnected,
  floodgateSnapshot,
  navigationIntent,
  onOpenBackupModal,
  onGlobalSync,
  showToast: appShowToast
}: FloodgateAppProps) {
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const todayKey = todayKeyProp || getLocalDateKey(now);

  const [logsMap, setLogsMap] = useState<Record<string, FloodgateDayLog>>(
    () => floodgateSnapshot?.logsByDate || {}
  );
  const [activeTab, setActiveTab] = useState<FloodgateTabId>('log');
  const [selectedDate, setSelectedDate] = useState<string>(() => todayKey);
  const [formData, setFormData] = useState<NormalizedFloodgateEntry>(() =>
    createEmptyEntry(todayKey)
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<CalendarMonthState>(() => {
    const [ty = 1970, tm = 1] = todayKey.split('-').map(Number);
    return { year: ty, month: tm - 1 };
  });
  const [insightsDays, setInsightsDays] = useState(90);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [ownerName, setOwnerName] = useState(activeProfile?.name || 'Partner 2');

  const dirtyRef = useRef(false);
  const selectedDateRef = useRef(selectedDate);
  const editVersionRef = useRef(0);
  const latestDraftRef = useRef<DraftSnapshot>({
    dateKey: todayKey,
    payload: formData,
    seq: 0
  });
  const logsMapRef = useRef(logsMap);
  logsMapRef.current = logsMap;
  const saveDayEntryRef = useRef<
    ((
      customEntry?: NormalizedFloodgateEntry | null,
      targetDate?: string,
      options?: { silentToast?: boolean }
    ) => Promise<boolean>) | null
  >(null);
  const inFlightMutationRef = useRef(0);
  const isTransitioningRef = useRef(false);
  const mountedRef = useRef(true);
  const onGlobalSyncRef = useRef(onGlobalSync);
  const profileIdRef = useRef<ProfileId>(activeProfile.id);

  const showToast = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
      appShowToast?.(msg, type);
    },
    [appShowToast]
  );
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  useEffect(() => {
    onGlobalSyncRef.current = onGlobalSync;
  }, [onGlobalSync]);

  useEffect(() => {
    profileIdRef.current = activeProfile.id;
  }, [activeProfile.id]);

  const applyFormDraft = useCallback(
    (dateKey: string, nextPayload: NormalizedFloodgateEntry, dirty: boolean): number => {
      editVersionRef.current += 1;
      const seq = editVersionRef.current;
      latestDraftRef.current = { dateKey, payload: nextPayload, seq };
      dirtyRef.current = dirty;
      selectedDateRef.current = dateKey;
      setFormData(nextPayload);
      setIsDirty(dirty);
      return seq;
    },
    []
  );

  // Auto-save unsaved edits on tab close/refresh (pagehide) or switching away to another Howard app
  useEffect(() => {
    mountedRef.current = true;
    const flushUnsavedKeepalive = (syncAfter = false) => {
      if (!dirtyRef.current) return;
      const { dateKey: dateToFlush, payload: draftPayload, seq } = latestDraftRef.current;
      if (!dateToFlush || !draftPayload) return;

      // Clear dirtyRef synchronously before dispatching so pagehide + unmount never double-PUT
      dirtyRef.current = false;
      const profileId = profileIdRef.current;
      const payload: NormalizedFloodgateEntry = {
        ...draftPayload,
        date: dateToFlush,
        updatedAt: new Date().toISOString()
      };
      const rpc = createRpcClient({ profileId, keepalive: true });
      unwrapRpc(
        rpc.api.floodgate.logs[':dateKey'].$put({
          param: { dateKey: dateToFlush },
          json: payload
        })
      )
        .then(() => {
          if (syncAfter && profileIdRef.current === 'partner2') {
            onGlobalSyncRef.current?.();
          }
        })
        .catch((err) => {
          console.error('Failed to auto-save entry:', err);
          if (mountedRef.current) {
            if (
              latestDraftRef.current.dateKey === dateToFlush &&
              latestDraftRef.current.seq === seq
            ) {
              dirtyRef.current = true;
              setIsDirty(true);
              setSaveFailed(true);
            }
            showToastRef.current(
              'Could not auto-save log to server — retry or discard unsaved changes',
              'error'
            );
          }
        });
    };

    const handlePageHide = () => {
      flushUnsavedKeepalive(false);
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('pagehide', handlePageHide);
      flushUnsavedKeepalive(profileIdRef.current === 'partner2');
    };
  }, []);

  const applyDateSelection = useCallback((nextDate: string) => {
    selectedDateRef.current = nextDate;
    setSelectedDate(nextDate);
    if (VALID_DATE_KEY_RE.test(nextDate)) {
      const [y, m] = nextDate.split('-').map(Number);
      if (y !== undefined && m !== undefined && Number.isFinite(y) && Number.isFinite(m)) {
        setCalendarMonth({ year: y, month: m - 1 });
      }
    }
  }, []);

  useEffect(() => {
    if (!navigationIntent) return;
    let cancelled = false;
    const applyNavigationIntent = async () => {
      const { dateKey, payload } = latestDraftRef.current;
      if (dirtyRef.current && dateKey && payload && saveDayEntryRef.current) {
        const ok = await saveDayEntryRef.current(payload, dateKey, { silentToast: true });
        if (!ok) {
          if (!cancelled) {
            setPendingNav({ type: 'intent', target: navigationIntent });
          }
          return;
        }
        if (cancelled) return;
        showToast(`Auto-saved changes for ${formatShortDateEnGB(dateKey)}`);
      }
      if (cancelled) return;
      if (isFloodgateTab(navigationIntent.tab)) setActiveTab(navigationIntent.tab);
      if (navigationIntent.date && VALID_DATE_KEY_RE.test(navigationIntent.date)) {
        applyDateSelection(navigationIntent.date);
      }
    };
    void applyNavigationIntent();
    return () => {
      cancelled = true;
    };
  }, [navigationIntent, showToast, applyDateSelection]);

  useEffect(() => {
    if (!floodgateSnapshot) return;

    if (
      typeof floodgateSnapshot.settings?.ownerName === 'string' &&
      floodgateSnapshot.settings.ownerName.trim()
    ) {
      setOwnerName(floodgateSnapshot.settings.ownerName.trim());
    }

    if (inFlightMutationRef.current > 0) return;

    const serverLogs = floodgateSnapshot.logsByDate || {};
    logsMapRef.current = serverLogs;
    setLogsMap(serverLogs);

    if (!dirtyRef.current) {
      const currentDate = selectedDateRef.current;
      const normalized = normalizeEntry(currentDate, serverLogs[currentDate]);
      applyFormDraft(currentDate, normalized, false);
    }
  }, [floodgateSnapshot, applyFormDraft]);

  useEffect(() => {
    applyFormDraft(selectedDate, normalizeEntry(selectedDate, logsMapRef.current[selectedDate]), false);
    setSaveFailed(false);
  }, [selectedDate, applyFormDraft]);

  const saveDayEntry = async (
    customEntry: NormalizedFloodgateEntry | null = null,
    targetDate: string = selectedDateRef.current,
    { silentToast = false }: { silentToast?: boolean } = {}
  ): Promise<boolean> => {
    const prevLog = logsMapRef.current[targetDate];
    const isSavingCurrentDraft = targetDate === latestDraftRef.current.dateKey;
    const saveEditVersion = isSavingCurrentDraft ? latestDraftRef.current.seq : -1;
    const baseEntry =
      customEntry ||
      (isSavingCurrentDraft
        ? latestDraftRef.current.payload
        : normalizeEntry(targetDate, prevLog));
    const entryToSave: NormalizedFloodgateEntry = {
      ...baseEntry,
      date: targetDate,
      updatedAt: new Date().toISOString()
    };

    // Clear dirtyRef as soon as save starts for this snapshot version so unmount/pagehide won't double-PUT
    if (isSavingCurrentDraft) {
      dirtyRef.current = false;
    }

    setLogsMap((prev) => {
      const next = { ...prev, [targetDate]: entryToSave };
      logsMapRef.current = next;
      return next;
    });

    inFlightMutationRef.current += 1;
    try {
      const rpc = createRpcClient({ profileId: activeProfile.id });
      const payload = await unwrapRpc(
        rpc.api.floodgate.logs[':dateKey'].$put({
          param: { dateKey: targetDate },
          json: entryToSave
        })
      );
      if (!mountedRef.current) {
        if (onGlobalSyncRef.current) onGlobalSyncRef.current();
        return true;
      }
      if (payload?.record) {
        setLogsMap((prev) => {
          const next = { ...prev, [targetDate]: payload.record };
          logsMapRef.current = next;
          return next;
        });
      }
      const noNewerEdits =
        targetDate === latestDraftRef.current.dateKey &&
        latestDraftRef.current.seq === saveEditVersion;
      if (noNewerEdits) {
        dirtyRef.current = false;
        setIsDirty(false);
        setSaveFailed(false);
        setPendingNav(null);
      }
      if (onGlobalSyncRef.current) onGlobalSyncRef.current();
      if (!silentToast) {
        showToast(
          `Saved ${ownerName ? `${ownerName}'s ` : ''}log for ${formatShortDateEnGB(targetDate)}`
        );
      }
      return true;
    } catch (err) {
      console.error('Failed to save entry:', err);
      if (mountedRef.current) {
        const noNewerEdits =
          targetDate === latestDraftRef.current.dateKey &&
          latestDraftRef.current.seq === saveEditVersion;
        if (noNewerEdits) {
          setLogsMap((prev) => {
            const next = { ...prev };
            if (prevLog) next[targetDate] = prevLog;
            else delete next[targetDate];
            logsMapRef.current = next;
            return next;
          });
          dirtyRef.current = true;
          setIsDirty(true);
          setSaveFailed(true);
        } else if (isSavingCurrentDraft) {
          // Newer edits exist; keep dirtyRef true so they can still be saved
          dirtyRef.current = true;
        }
        showToast('Could not save log to server — retry or discard unsaved changes', 'error');
      }
      return false;
    } finally {
      inFlightMutationRef.current = Math.max(0, inFlightMutationRef.current - 1);
    }
  };
  saveDayEntryRef.current = saveDayEntry;

  const handleSelectDate = async (nextDate: string) => {
    if (!nextDate || nextDate === selectedDate) return;
    if (isTransitioningRef.current || inFlightMutationRef.current > 0) return;
    isTransitioningRef.current = true;
    try {
      if (dirtyRef.current) {
        const { dateKey, payload } = latestDraftRef.current;
        const ok = await saveDayEntry(payload, dateKey, { silentToast: true });
        if (!ok) {
          setPendingNav({ type: 'date', target: nextDate });
          return;
        }
        showToast(`Auto-saved changes for ${formatShortDateEnGB(dateKey)}`);
      }
      setPendingNav(null);
      applyDateSelection(nextDate);
    } finally {
      isTransitioningRef.current = false;
    }
  };

  const handleSwitchTab = async (nextTab: FloodgateTabId) => {
    if (nextTab === activeTab) return;
    if (isTransitioningRef.current || inFlightMutationRef.current > 0) return;
    isTransitioningRef.current = true;
    try {
      if (dirtyRef.current) {
        const { dateKey, payload } = latestDraftRef.current;
        const ok = await saveDayEntry(payload, dateKey, { silentToast: true });
        if (!ok) {
          setPendingNav({ type: 'tab', target: nextTab });
          return;
        }
        showToast(`Auto-saved changes for ${formatShortDateEnGB(dateKey)}`);
      }
      setPendingNav(null);
      setActiveTab(nextTab);
    } finally {
      isTransitioningRef.current = false;
    }
  };

  const discardPendingNavigation = () => {
    const nav = pendingNav;
    applyFormDraft(selectedDate, normalizeEntry(selectedDate, logsMapRef.current[selectedDate]), false);
    setSaveFailed(false);
    setPendingNav(null);

    if (nav?.type === 'date' && nav.target) {
      applyDateSelection(nav.target);
    } else if (nav?.type === 'tab' && nav.target) {
      setActiveTab(nav.target);
    } else if (nav?.type === 'intent' && nav.target) {
      if (isFloodgateTab(nav.target.tab)) setActiveTab(nav.target.tab);
      if (nav.target.date && VALID_DATE_KEY_RE.test(nav.target.date)) {
        applyDateSelection(nav.target.date);
      }
    }
    showToast(`Discarded unsaved edits for ${formatShortDateEnGB(selectedDate)}`, 'info');
  };

  const retryPendingNavigation = async () => {
    if (isTransitioningRef.current || inFlightMutationRef.current > 0) return;
    const nav = pendingNav;
    const prevDate = latestDraftRef.current.dateKey;
    const ok = await saveDayEntry(latestDraftRef.current.payload, prevDate, {
      silentToast: Boolean(nav)
    });
    if (!ok) return;
    if (nav?.type === 'date' && nav.target) {
      showToast(`Auto-saved changes for ${formatShortDateEnGB(prevDate)}`);
      applyDateSelection(nav.target);
    } else if (nav?.type === 'tab' && nav.target) {
      showToast(`Auto-saved changes for ${formatShortDateEnGB(prevDate)}`);
      setActiveTab(nav.target);
    } else if (nav?.type === 'intent' && nav.target) {
      showToast(`Auto-saved changes for ${formatShortDateEnGB(prevDate)}`);
      if (isFloodgateTab(nav.target.tab)) setActiveTab(nav.target.tab);
      if (nav.target.date && VALID_DATE_KEY_RE.test(nav.target.date)) {
        applyDateSelection(nav.target.date);
      }
    }
  };

  const deleteDayEntry = async (dateToDelete: string) => {
    const prevLog = logsMapRef.current[dateToDelete];
    const wasSelectedAtStart = dateToDelete === selectedDateRef.current;
    const prevDraft = latestDraftRef.current.payload;
    const prevDirty = dirtyRef.current;

    setLogsMap((prev) => {
      const copy = { ...prev };
      delete copy[dateToDelete];
      logsMapRef.current = copy;
      return copy;
    });
    let clearedSeq = -1;
    if (wasSelectedAtStart) {
      clearedSeq = applyFormDraft(dateToDelete, createEmptyEntry(dateToDelete), false);
      setSaveFailed(false);
      setPendingNav(null);
    }

    inFlightMutationRef.current += 1;
    try {
      const rpc = createRpcClient({ profileId: activeProfile.id });
      await unwrapRpc(
        rpc.api.floodgate.logs[':dateKey'].$delete({
          param: { dateKey: dateToDelete }
        })
      );
      if (onGlobalSyncRef.current) onGlobalSyncRef.current();
      if (mountedRef.current) {
        showToast(`Deleted log for ${formatShortDateEnGB(dateToDelete)}`);
      }
    } catch (err) {
      console.error('Error deleting entry:', err);
      if (mountedRef.current) {
        setLogsMap((prev) => {
          const restored = { ...prev };
          if (prevLog) restored[dateToDelete] = prevLog;
          logsMapRef.current = restored;
          return restored;
        });
        // Only restore the previous form draft if the user hasn't typed newer edits while delete was in flight
        if (
          wasSelectedAtStart &&
          dateToDelete === selectedDateRef.current &&
          latestDraftRef.current.dateKey === dateToDelete &&
          latestDraftRef.current.seq === clearedSeq
        ) {
          applyFormDraft(dateToDelete, prevDraft, prevDirty);
        }
        showToast('Could not delete from server — reverted', 'error');
      }
    } finally {
      inFlightMutationRef.current = Math.max(0, inFlightMutationRef.current - 1);
    }
  };

  const updateField = <K extends keyof NormalizedFloodgateEntry>(
    field: K,
    value: NormalizedFloodgateEntry[K]
  ) => {
    const currentDate = selectedDateRef.current;
    const base =
      latestDraftRef.current.dateKey === currentDate
        ? latestDraftRef.current.payload
        : normalizeEntry(currentDate, logsMapRef.current[currentDate]);
    const updated: NormalizedFloodgateEntry = { ...base, [field]: value };
    if (field === 'clotCount' && typeof value === 'number' && value > 0) {
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
    applyFormDraft(currentDate, updated, true);
  };

  const toggleArrayItem = (field: FloodgateArrayField, item: string) => {
    const currentDraft = latestDraftRef.current.payload;
    const current = Array.isArray(currentDraft[field]) ? currentDraft[field] : [];
    const exists = current.includes(item);
    const next = exists ? current.filter((i) => i !== item) : [...current, item];
    updateField(field, next);
  };

  const copyYesterdayMedications = () => {
    const prevDate = shiftDateKey(selectedDateRef.current, -1);
    const prevLog = logsMapRef.current[prevDate];
    if (!prevLog || !Array.isArray(prevLog.medications) || prevLog.medications.length === 0) {
      showToast(`No medications found on ${formatShortDateEnGB(prevDate)}`, 'info');
      return;
    }
    const copiedMeds: NormalizedFloodgateMedication[] = prevLog.medications.map((m) => ({
      ...m,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: m.name ?? '',
      dose: m.dose ?? '',
      timeNotes: m.timeNotes ?? '',
      effective: m.effective || 'helped'
    }));
    updateField('medications', [...latestDraftRef.current.payload.medications, ...copiedMeds]);
    showToast(
      `Copied ${copiedMeds.length} medication(s) from ${formatShortDateEnGB(prevDate)}`
    );
  };

  const handleAddPresetMed = (preset: PresetMedication) => {
    const nowTime = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const newMed: NormalizedFloodgateMedication = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: preset.name,
      dose: preset.defaultDose,
      timeNotes: nowTime,
      effective: 'helped'
    };
    updateField('medications', [...latestDraftRef.current.payload.medications, newMed]);
  };

  const handleAddCustomMed = ({
    name,
    dose,
    time
  }: {
    name: string;
    dose: string;
    time: string;
  }) => {
    const nowTime =
      (time || '').trim() ||
      new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const newMed: NormalizedFloodgateMedication = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      dose: (dose || '').trim() || 'Standard dose',
      timeNotes: nowTime,
      effective: 'helped'
    };
    updateField('medications', [...latestDraftRef.current.payload.medications, newMed]);
  };

  const updateMedicationItem = (
    id: string,
    key: keyof NormalizedFloodgateMedication,
    val: string
  ) => {
    const updated = latestDraftRef.current.payload.medications.map((m) =>
      m.id === id ? { ...m, [key]: val } : m
    );
    updateField('medications', updated);
  };

  const removeMedicationItem = (id: string) => {
    updateField(
      'medications',
      latestDraftRef.current.payload.medications.filter((m) => m.id !== id)
    );
  };

  const sortedLogs = useMemo(() => {
    return Object.values(logsMap)
      .filter((item): item is FloodgateDayLog => Boolean(item && item.date))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [logsMap]);

  const handleResetCalendarToday = () => {
    const [ty = 1970, tm = 1] = todayKey.split('-').map(Number);
    setCalendarMonth({ year: ty, month: tm - 1 });
    void handleSelectDate(todayKey);
  };

  return (
    <>
      <ConfirmModal
        isOpen={Boolean(confirmModal)}
        onClose={() => setConfirmModal(null)}
        onConfirm={() => {
          confirmModal?.onConfirm?.();
          setConfirmModal(null);
        }}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        icon={AlertCircle}
        confirmText={confirmModal?.confirmText || 'Confirm'}
        danger={confirmModal?.danger !== false}
        maxWidthClass="max-w-md"
      />

      <ModulePage module="floodgate">
        <ModuleHeader
          accent="rose"
          icon={Heart}
          shortTitle="Floodgate"
          title={`Floodgate • ${ownerName}'s Journal`}
          subtitle="Period, Blood Clots, Pain & Endometriosis Clinical Tracker"
          badges={<StatusPill accent="rose">Private Module</StatusPill>}
          className="no-print"
          footer={
            <SegmentedTabs<FloodgateTabId>
              accent="rose"
              activeId={activeTab}
              onChange={(tab) => void handleSwitchTab(tab)}
              tabs={[
                { id: 'log', label: 'Daily Log', shortLabel: 'Log', icon: Droplets },
                {
                  id: 'calendar',
                  label: 'Cycle Calendar',
                  shortLabel: 'Calendar',
                  icon: CalendarIcon
                },
                {
                  id: 'insights',
                  label: 'GP Insights',
                  shortLabel: 'Insights',
                  icon: Stethoscope
                },
                { id: 'data', label: 'Export & Data', shortLabel: 'Export', icon: ShieldCheck }
              ]}
            />
          }
        />

        {isDirty && (pendingNav || saveFailed) && (
          <AlertBanner
            role="alert"
            severity="danger"
            icon={AlertCircle}
            className="no-print"
            title={`Unable to save changes for ${formatShortDateEnGB(selectedDate)}`}
            description={
              pendingNav
                ? 'You can retry saving when reconnected, or discard your unsaved edits to leave this view.'
                : 'The server could not be reached. Retry saving or discard your unsaved edits.'
            }
            action={
              <>
                <Button variant="danger" size="md" onClick={() => void retryPendingNavigation()}>
                  {pendingNav ? 'Retry Save & Continue' : 'Retry Save'}
                </Button>
                <Button variant="dangerTinted" size="md" onClick={discardPendingNavigation}>
                  Discard Unsaved Changes
                </Button>
              </>
            }
          />
        )}

        {activeTab === 'log' && (
          <DailyLogTab
            selectedDate={selectedDate}
            todayKey={todayKey}
            formData={formData}
            logsMap={logsMap}
            ownerName={ownerName}
            isDirty={isDirty}
            saveFailed={saveFailed}
            pendingNav={pendingNav}
            onSelectDate={(nextDate) => void handleSelectDate(nextDate)}
            onSaveDayEntry={() => void saveDayEntry()}
            onDiscardPendingNav={discardPendingNavigation}
            onRequestDeleteLog={() =>
              setConfirmModal({
                title: 'Clear This Day’s Log?',
                message: `Are you sure you want to delete the logged symptoms for ${formatDateFriendlyEnGB(selectedDate, todayKey)}?`,
                confirmText: 'Delete Log',
                danger: true,
                onConfirm: () => void deleteDayEntry(selectedDate)
              })
            }
            onCopyYesterdayMeds={copyYesterdayMedications}
            onUpdateField={updateField}
            onToggleArrayItem={toggleArrayItem}
            onAddPresetMed={handleAddPresetMed}
            onAddCustomMed={handleAddCustomMed}
            onUpdateMedItem={updateMedicationItem}
            onRemoveMedItem={removeMedicationItem}
          />
        )}

        {activeTab === 'calendar' && (
          <CycleCalendarTab
            calendarMonth={calendarMonth}
            setCalendarMonth={setCalendarMonth}
            selectedDate={selectedDate}
            todayKey={todayKey}
            ownerName={ownerName}
            logsMap={logsMap}
            onSelectDate={(nextDate) => void handleSelectDate(nextDate)}
            onResetToToday={handleResetCalendarToday}
            onOpenLogTab={() => void handleSwitchTab('log')}
            onOpenInsightsTab={() => void handleSwitchTab('insights')}
          />
        )}

        {activeTab === 'insights' && (
          <InsightsReportTab
            sortedLogs={sortedLogs}
            insightsDays={insightsDays}
            setInsightsDays={setInsightsDays}
            ownerName={ownerName}
            todayKey={todayKey}
          />
        )}

        {activeTab === 'data' && (
          <ExportDataTab
            logsMap={logsMap}
            sortedLogs={sortedLogs}
            ownerName={ownerName}
            todayKey={todayKey}
            onOpenBackupModal={onOpenBackupModal}
            showToast={showToast}
          />
        )}
      </ModulePage>
    </>
  );
}

export default memo(FloodgateApp);
