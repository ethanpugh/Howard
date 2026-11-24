import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Droplets,
  Heart,
  AlertCircle,
  ShieldCheck,
  Stethoscope
} from 'lucide-react';
import {
  VALID_DATE_KEY_RE,
  getLocalDateKey,
  shiftDateKey,
  formatDateFriendlyEnGB,
  formatShortDateEnGB
} from '../utils/householdHelpers.js';
import { apiRequest } from '../utils/apiClient.js';
import {
  ModuleHeader,
  SegmentedTabs,
  ConfirmModal
} from '../components/HowardUI.jsx';
import {
  createEmptyEntry,
  normalizeEntry
} from './floodgate/floodgateConstants.js';
import DailyLogTab from './floodgate/DailyLogTab.jsx';
import CycleCalendarTab from './floodgate/CycleCalendarTab.jsx';
import InsightsReportTab from './floodgate/InsightsReportTab.jsx';
import ExportDataTab from './floodgate/ExportDataTab.jsx';

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
}) {
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const todayKey = todayKeyProp || getLocalDateKey(now);

  const [logsMap, setLogsMap] = useState(() => floodgateSnapshot?.logsByDate || {});
  const [activeTab, setActiveTab] = useState('log'); // 'log' | 'calendar' | 'insights' | 'data'
  const [selectedDate, setSelectedDate] = useState(() => todayKey);
  const [formData, setFormData] = useState(() => createEmptyEntry(todayKey));
  const [isDirty, setIsDirty] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const [ty, tm] = todayKey.split('-').map(Number);
    return { year: ty, month: tm - 1 };
  });
  const [insightsDays, setInsightsDays] = useState(90);
  const [confirmModal, setConfirmModal] = useState(null);
  const [ownerName, setOwnerName] = useState(activeProfile?.name || 'Partner 2');

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
      apiRequest(`/api/floodgate/logs/${encodeURIComponent(dateToFlush)}`, {
        method: 'PUT',
        profileId,
        body: payload,
        keepalive: true
      })
        .then(() => {
          if (syncAfter && profileIdRef.current === 'partner2') {
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

  const showToast = useCallback(
    (msg, type = 'success') => {
      appShowToast?.(msg, type);
    },
    [appShowToast]
  );

  const applyDateSelection = useCallback((nextDate) => {
    setSelectedDate(nextDate);
    if (VALID_DATE_KEY_RE.test(nextDate)) {
      const [y, m] = nextDate.split('-').map(Number);
      if (Number.isFinite(y) && Number.isFinite(m)) {
        setCalendarMonth({ year: y, month: m - 1 });
      }
    }
  }, []);

  useEffect(() => {
    if (!navigationIntent) return;
    let cancelled = false;
    const applyNavigationIntent = async () => {
      if (
        isDirtyRef.current &&
        formDataRef.current &&
        selectedDateRef.current &&
        saveDayEntryRef.current
      ) {
        const ok = await saveDayEntryRef.current(
          formDataRef.current,
          selectedDateRef.current,
          { silentToast: true }
        );
        if (!ok) {
          if (!cancelled) {
            setPendingNav({ type: 'intent', target: navigationIntent });
          }
          return;
        }
        if (cancelled) return;
        showToast(`Auto-saved changes for ${formatShortDateEnGB(selectedDateRef.current)}`);
      }
      if (cancelled) return;
      if (navigationIntent.tab) setActiveTab(navigationIntent.tab);
      if (navigationIntent.date && VALID_DATE_KEY_RE.test(navigationIntent.date)) {
        applyDateSelection(navigationIntent.date);
      }
    };
    applyNavigationIntent();
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
    setLogsMap(serverLogs);

    if (!isDirtyRef.current) {
      const currentDate = selectedDateRef.current;
      setFormData(normalizeEntry(currentDate, serverLogs[currentDate]));
    }
  }, [floodgateSnapshot]);

  useEffect(() => {
    editVersionRef.current += 1;
    setFormData(normalizeEntry(selectedDate, logsMap[selectedDate]));
    setIsDirty(false);
    isDirtyRef.current = false;
    setSaveFailed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const saveDayEntry = async (
    customEntry = null,
    targetDate = selectedDate,
    { silentToast = false } = {}
  ) => {
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
      const payload = await apiRequest(
        `/api/floodgate/logs/${encodeURIComponent(targetDate)}`,
        {
          method: 'PUT',
          profileId,
          body: entryToSave
        }
      );
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
        showToast(
          `Saved ${ownerName ? `${ownerName}'s ` : ''}log for ${formatShortDateEnGB(targetDate)}`
        );
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
        showToast(`Auto-saved changes for ${formatShortDateEnGB(selectedDate)}`);
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
        showToast(`Auto-saved changes for ${formatShortDateEnGB(selectedDate)}`);
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
      if (nav.target.date && VALID_DATE_KEY_RE.test(nav.target.date)) {
        applyDateSelection(nav.target.date);
      }
    }
    showToast(`Discarded unsaved edits for ${formatShortDateEnGB(selectedDate)}`, 'info');
  };

  const retryPendingNavigation = async () => {
    if (isTransitioningRef.current || inFlightMutationRef.current > 0) return;
    const nav = pendingNav;
    const prevDate = selectedDate;
    const ok = await saveDayEntry(formDataRef.current, selectedDate, {
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
      if (nav.target.tab) setActiveTab(nav.target.tab);
      if (nav.target.date && VALID_DATE_KEY_RE.test(nav.target.date)) {
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
      await apiRequest(`/api/floodgate/logs/${encodeURIComponent(dateToDelete)}`, {
        method: 'DELETE',
        profileId
      });
      if (onGlobalSyncRef.current) onGlobalSyncRef.current();
      showToast(`Deleted log for ${formatShortDateEnGB(dateToDelete)}`);
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

  const copyYesterdayMedications = () => {
    const prevDate = shiftDateKey(selectedDate, -1);
    const prevLog = logsMap[prevDate];
    if (!prevLog || !Array.isArray(prevLog.medications) || prevLog.medications.length === 0) {
      showToast(`No medications found on ${formatShortDateEnGB(prevDate)}`, 'info');
      return;
    }
    const copiedMeds = prevLog.medications.map((m) => ({
      ...m,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    }));
    updateField('medications', [...formData.medications, ...copiedMeds]);
    showToast(
      `Copied ${copiedMeds.length} medication(s) from ${formatShortDateEnGB(prevDate)}`
    );
  };

  const handleAddPresetMed = (preset) => {
    const nowTime = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const newMed = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: preset.name,
      dose: preset.defaultDose,
      timeNotes: nowTime,
      effective: 'helped'
    };
    updateField('medications', [...formData.medications, newMed]);
  };

  const handleAddCustomMed = ({ name, dose, time }) => {
    const nowTime =
      (time || '').trim() ||
      new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const newMed = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      dose: (dose || '').trim() || 'Standard dose',
      timeNotes: nowTime,
      effective: 'helped'
    };
    updateField('medications', [...formData.medications, newMed]);
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

  const sortedLogs = useMemo(() => {
    return Object.values(logsMap)
      .filter((item) => item && item.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [logsMap]);

  const handleResetCalendarToday = () => {
    const [ty, tm] = todayKey.split('-').map(Number);
    setCalendarMonth({ year: ty, month: tm - 1 });
    handleSelectDate(todayKey);
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
          className="no-print"
          footer={
            <SegmentedTabs
              accent="rose"
              activeId={activeTab}
              onChange={handleSwitchTab}
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
                  Unable to save changes for {formatShortDateEnGB(selectedDate)}
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
                className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold border border-rose-500/40 bg-surface-card text-rose-800 dark:text-rose-200 hover:bg-rose-500/15 active:scale-[0.98] transition cursor-pointer"
              >
                Discard Unsaved Changes
              </button>
            </div>
          </div>
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
            onSelectDate={handleSelectDate}
            onSaveDayEntry={() => saveDayEntry()}
            onDiscardPendingNav={discardPendingNavigation}
            onRequestDeleteLog={() =>
              setConfirmModal({
                title: 'Clear This Day’s Log?',
                message: `Are you sure you want to delete the logged symptoms for ${formatDateFriendlyEnGB(selectedDate, todayKey)}?`,
                confirmText: 'Delete Log',
                danger: true,
                onConfirm: () => deleteDayEntry(selectedDate)
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
            onSelectDate={handleSelectDate}
            onResetToToday={handleResetCalendarToday}
            onOpenLogTab={() => handleSwitchTab('log')}
            onOpenInsightsTab={() => handleSwitchTab('insights')}
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
      </main>
    </>
  );
}

export default React.memo(FloodgateApp);
