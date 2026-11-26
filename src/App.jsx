import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

import FoyerApp from './apps/FoyerApp.jsx';
import { AlertBanner, Button, getOpenModalCount } from './components/HowardUI.jsx';
import { ErrorBoundary } from './components/shell/ErrorBoundary.jsx';
import {
  APP_REGISTRY,
  BentoSwitcherModal,
  HeaderBar,
  MobileFloatingPill,
  SidebarRail
} from './components/shell/AppNavigation.jsx';
import { computeModuleStatuses } from './utils/moduleStatuses.js';
import { useHouseholdSync, FALLBACK_PROFILES } from './hooks/useHouseholdSync.js';
import { useActionLock } from './hooks/useActionLock.js';
import { apiRequest } from './utils/apiClient.js';
import { getLocalDateKey, computeBloomSummary } from './utils/householdHelpers.js';
import { getModuleTheme } from './utils/moduleThemes.js';

const CadenceApp = lazy(() => import('./apps/CadenceApp.jsx'));
const BloomApp = lazy(() => import('./apps/BloomApp.jsx'));
const AlmanacApp = lazy(() => import('./apps/AlmanacApp.jsx'));
const FloodgateApp = lazy(() => import('./apps/FloodgateApp.jsx'));
const LedgerApp = lazy(() => import('./apps/LedgerApp.jsx'));
const QuillApp = lazy(() => import('./apps/QuillApp.jsx'));
const BeaconApp = lazy(() => import('./apps/BeaconApp.jsx'));

const ProfileSwitcherModal = lazy(() => import('./components/shell/ProfileSwitcherModal.jsx'));
const BackstageBackupModal = lazy(() => import('./components/shell/BackstageBackupModal.jsx'));

const MemoFoyerApp = React.memo(FoyerApp);
const MemoCadenceApp = React.memo(CadenceApp);
const MemoBloomApp = React.memo(BloomApp);
const MemoAlmanacApp = React.memo(AlmanacApp);
const MemoFloodgateApp = React.memo(FloodgateApp);
const MemoLedgerApp = React.memo(LedgerApp);
const MemoQuillApp = React.memo(QuillApp);
const MemoBeaconApp = React.memo(BeaconApp);

const ACTIVE_PROFILE_STORAGE_KEY = 'howard-active-profile';
const ACTIVE_APP_STORAGE_KEY = 'howard-active-app';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'howard-sidebar-collapsed';

function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const saved = localStorage.getItem('howard-theme');
      if (saved === 'dark') return 'dark';
      if (saved === 'warm' || saved === 'light') return 'warm';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'warm';
    } catch {
      return 'warm';
    }
  });
  const darkMode = themeMode === 'dark';

  const cycleThemeMode = useCallback(() => {
    setThemeMode((prev) => (prev === 'dark' ? 'warm' : 'dark'));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('howard-theme', themeMode);
    } catch {
      // ignore storage errors
    }
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    document.documentElement.classList.toggle('warm', themeMode === 'warm');
  }, [themeMode]);

  const [hasSavedProfile, setHasSavedProfile] = useState(() =>
    Boolean(readStorage(ACTIVE_PROFILE_STORAGE_KEY, ''))
  );
  const [activeProfileId, setActiveProfileId] = useState(() =>
    readStorage(ACTIVE_PROFILE_STORAGE_KEY, 'caregiver')
  );
  const [activeAppId, setActiveAppId] = useState(() =>
    readStorage(ACTIVE_APP_STORAGE_KEY, 'foyer')
  );

  const [floodgateIntent, setFloodgateIntent] = useState(null);
  const [bloomIntent, setBloomIntent] = useState(null);
  const [almanacIntentDate, setAlmanacIntentDate] = useState(null);
  const [quillIntent, setQuillIntent] = useState(null);

  const [profileModalOpen, setProfileModalOpen] = useState(
    () => !readStorage(ACTIVE_PROFILE_STORAGE_KEY, '')
  );
  const [bootPinTarget, setBootPinTarget] = useState(null);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [appLauncherOpen, setAppLauncherOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => readStorage(SIDEBAR_COLLAPSED_STORAGE_KEY, '0') === '1'
  );

  const handleRequireBootPin = useCallback((savedProf) => {
    setBootPinTarget(savedProf);
    setProfileModalOpen(true);
  }, []);

  const clearBootPinTarget = useCallback(() => {
    setBootPinTarget(null);
  }, []);

  const {
    isConnected,
    syncError,
    lastSyncedAt,
    syncTransport,
    profiles,
    setProfiles,
    almanacEvents,
    setAlmanacEvents,
    ledgerData,
    setLedgerData,
    beaconInfo,
    setBeaconInfo,
    cadenceSnapshot,
    setCadenceSnapshot,
    floodgateSnapshot,
    bloomSnapshot,
    setBloomSnapshot,
    quillSnapshot,
    setQuillSnapshot,
    dbInfo,
    markProfileUnlocked,
    fetchUnifiedSync
  } = useHouseholdSync({
    activeProfileId,
    setActiveProfileId,
    setHasSavedProfile,
    onRequireBootPin: handleRequireBootPin
  });

  const handleMutationSync = useCallback(
    (opts = {}) => fetchUnifiedSync({ afterMutation: true, ...opts }),
    [fetchUnifiedSync]
  );

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const clockTimer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(clockTimer);
  }, []);

  const todayKey = useMemo(() => getLocalDateKey(new Date(nowMs)), [nowMs]);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((text, type = 'success', options = null) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const actionLabel = options?.actionLabel || null;
    const onAction = typeof options?.onAction === 'function' ? options.onAction : null;
    setToast({ text, type, actionLabel, onAction });
    toastTimerRef.current = setTimeout(
      () => {
        setToast((prev) => (prev?.text === text ? null : prev));
        toastTimerRef.current = null;
      },
      actionLabel ? 5500 : 3200
    );
  }, []);

  const { isPending: quickActionPending, runLocked: runQuickAction } = useActionLock();

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const scrollTopSafe = useCallback(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, []);

  const handleNavigateModule = useCallback(
    (targetAppId) => {
      setAlmanacIntentDate(null);
      setFloodgateIntent(null);
      setBloomIntent(null);
      setQuillIntent(null);
      setActiveAppId(targetAppId);
      setAppLauncherOpen(false);
      scrollTopSafe();
    },
    [scrollTopSafe]
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key || '').toLowerCase() === 'k') {
        if (profileModalOpen || backupModalOpen || (!appLauncherOpen && getOpenModalCount() > 0)) {
          return;
        }
        e.preventDefault();
        setAppLauncherOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appLauncherOpen, profileModalOpen, backupModalOpen]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || profiles[0] || FALLBACK_PROFILES[0],
    [profiles, activeProfileId]
  );

  useEffect(() => {
    if (activeProfile.id === 'caregiver') {
      setBackupModalOpen(false);
    }
  }, [activeProfile.id]);

  const allowedApps = useMemo(() => {
    const allowedIds = activeProfile?.allowedApps || ['foyer', 'cadence', 'bloom', 'quill', 'beacon'];
    return APP_REGISTRY.filter((app) => allowedIds.includes(app.id));
  }, [activeProfile]);

  const activeAppMeta = useMemo(
    () => allowedApps.find((app) => app.id === activeAppId) || allowedApps[0] || APP_REGISTRY[0],
    [allowedApps, activeAppId]
  );

  const bloomSummary = useMemo(
    () => computeBloomSummary(bloomSnapshot, new Date(nowMs)),
    [bloomSnapshot, nowMs]
  );

  const moduleStatuses = useMemo(
    () =>
      computeModuleStatuses({
        todayKey,
        hour: new Date(nowMs).getHours(),
        cadenceSnapshot,
        bloomSummary,
        almanacEvents,
        floodgateSnapshot,
        ledgerData,
        quillSnapshot,
        beaconInfo,
        activeProfile,
        profiles
      }),
    [
      todayKey,
      nowMs,
      cadenceSnapshot,
      bloomSummary,
      almanacEvents,
      floodgateSnapshot,
      ledgerData,
      quillSnapshot,
      beaconInfo,
      activeProfile,
      profiles
    ]
  );

  const urgentModuleCount = useMemo(
    () => allowedApps.filter((app) => app.id !== 'foyer' && moduleStatuses[app.id]?.urgent).length,
    [allowedApps, moduleStatuses]
  );

  useEffect(() => {
    const allowedIds = activeProfile?.allowedApps || ['foyer', 'cadence', 'bloom', 'quill', 'beacon'];
    if (!allowedIds.includes(activeAppId)) setActiveAppId('foyer');
  }, [activeProfile, activeAppId]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_APP_STORAGE_KEY, activeAppId);
    } catch {
      // ignore storage errors
    }
  }, [activeAppId]);

  useEffect(() => {
    const currentApp = APP_REGISTRY.find((a) => a.id === activeAppId);
    document.title = `Howard • ${currentApp ? currentApp.name : 'Household'} (${activeProfile.name})`;
  }, [activeAppId, activeProfile]);

  const handleQuickRecordPetDose = useCallback(
    async (slot, note = '') => {
      await runQuickAction(async () => {
        const liveTodayKey = getLocalDateKey(new Date());
        const nowIso = new Date().toISOString();
        const caregiverName = activeProfile.caregiverName || activeProfile.name;
        const prevCadence = cadenceSnapshot;
        const dosePayload = {
          given: true,
          timestamp: nowIso,
          givenBy: caregiverName,
          givenByProfileId: activeProfile.id,
          dosage: cadenceSnapshot.settings?.dosageLabel || '2.5 mg / 0.5 ml',
          note: note.trim()
        };

        setCadenceSnapshot((prev) => {
          const existingDay = prev.logsByDate?.[liveTodayKey] || { dateKey: liveTodayKey };
          return {
            ...prev,
            logsByDate: {
              ...prev.logsByDate,
              [liveTodayKey]: {
                ...existingDay,
                dateKey: liveTodayKey,
                [slot]: dosePayload,
                updatedAt: nowIso
              }
            }
          };
        });

        try {
          await apiRequest(`/api/cadence/logs/${encodeURIComponent(liveTodayKey)}`, {
            method: 'PUT',
            body: { [slot]: dosePayload, updatedAt: nowIso }
          });
          showToast(
            `Logged ${cadenceSnapshot.settings?.catName || 'Pet'}'s ${slot === 'morning' ? 'Morning' : 'Evening'} dose (${caregiverName})`
          );
          handleMutationSync();
        } catch {
          setCadenceSnapshot(prevCadence);
          fetchUnifiedSync({ force: true });
          showToast('Failed to save dose to server — reverted', 'error');
        }
      });
    },
    [
      runQuickAction,
      activeProfile,
      cadenceSnapshot,
      setCadenceSnapshot,
      showToast,
      handleMutationSync,
      fetchUnifiedSync
    ]
  );

  const handleQuickMistMantis = useCallback(async () => {
    await runQuickAction(async () => {
      const liveTodayKey = getLocalDateKey(new Date());
      const nowIso = new Date().toISOString();
      const caregiverName = activeProfile.caregiverName || activeProfile.name;
      const mantisName = bloomSnapshot.settings?.mantisName || 'Mantis';
      const prevBloom = bloomSnapshot;

      const newMist = {
        id: `mist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        by: caregiverName,
        byProfileId: activeProfile.id,
        dropletDrinkObserved: false,
        note: ''
      };

      setBloomSnapshot((prev) => {
        const existingDay = prev.logsByDate?.[liveTodayKey] || {
          dateKey: liveTodayKey,
          mists: [],
          feedings: [],
          climateChecks: [],
          behaviors: []
        };
        return {
          ...prev,
          logsByDate: {
            ...prev.logsByDate,
            [liveTodayKey]: {
              ...existingDay,
              dateKey: liveTodayKey,
              mists: [...(existingDay.mists || []), newMist],
              updatedAt: nowIso
            }
          }
        };
      });

      try {
        await apiRequest(`/api/bloom/logs/${encodeURIComponent(liveTodayKey)}`, {
          method: 'PUT',
          body: { appendMist: newMist, updatedAt: nowIso }
        });
        showToast(`Logged ${mantisName}'s enclosure mist (${caregiverName})`);
        handleMutationSync();
      } catch {
        setBloomSnapshot(prevBloom);
        fetchUnifiedSync({ force: true });
        showToast('Failed to save mist log to server — reverted', 'error');
      }
    });
  }, [
    runQuickAction,
    activeProfile,
    bloomSnapshot,
    setBloomSnapshot,
    showToast,
    handleMutationSync,
    fetchUnifiedSync
  ]);

  const handleClearMantisLivePrey = useCallback(async () => {
    await runQuickAction(async () => {
      const mantisName = bloomSnapshot.settings?.mantisName || 'Mantis';
      const prevBloom = bloomSnapshot;
      const clearFields = {
        livePreyInside: false,
        livePreyNote: '',
        livePreyByProfileId: null,
        livePreyAt: null
      };
      setBloomSnapshot((prev) => ({
        ...prev,
        settings: { ...prev.settings, ...clearFields }
      }));
      try {
        await apiRequest('/api/bloom/settings', { method: 'PUT', body: clearFields });
        showToast(`Marked ${mantisName}'s enclosure clear of live prey`);
        handleMutationSync();
      } catch {
        setBloomSnapshot(prevBloom);
        fetchUnifiedSync({ force: true });
        showToast('Failed to update Bloom enclosure status — reverted', 'error');
      }
    });
  }, [
    runQuickAction,
    bloomSnapshot,
    setBloomSnapshot,
    showToast,
    handleMutationSync,
    fetchUnifiedSync
  ]);

  const optimisticMutate = useCallback(
    async ({ applyOptimistic, revertOptimistic, requestFn, toastText, errorText }) => {
      applyOptimistic();
      try {
        await requestFn();
        if (toastText) showToast(toastText);
        handleMutationSync();
        return true;
      } catch {
        revertOptimistic();
        fetchUnifiedSync({ force: true });
        showToast(errorText, 'error');
        return false;
      }
    },
    [showToast, handleMutationSync, fetchUnifiedSync]
  );

  const handleMutateAlmanacEvents = useCallback(
    ({ nextEvents, upserts = [], deleteIds = [] }, toastText = 'Updated Almanac calendar') => {
      const prev = almanacEvents;
      return optimisticMutate({
        applyOptimistic: () => Array.isArray(nextEvents) && setAlmanacEvents(nextEvents),
        revertOptimistic: () => setAlmanacEvents(prev),
        requestFn: () =>
          apiRequest('/api/howard/almanac/events/batch', {
            method: 'POST',
            body: { upserts, deleteIds }
          }),
        toastText,
        errorText: 'Could not save calendar event — reverted'
      });
    },
    [almanacEvents, setAlmanacEvents, optimisticMutate]
  );

  const handleSaveAlmanacEvents = useCallback(
    (nextEvents, toastText = 'Updated Almanac calendar') => {
      const prev = almanacEvents;
      return optimisticMutate({
        applyOptimistic: () => setAlmanacEvents(nextEvents),
        revertOptimistic: () => setAlmanacEvents(prev),
        requestFn: () =>
          apiRequest('/api/howard/almanac', { method: 'PUT', body: { events: nextEvents } }),
        toastText,
        errorText: 'Could not save calendar event — reverted'
      });
    },
    [almanacEvents, setAlmanacEvents, optimisticMutate]
  );

  const handleUpsertLedgerItem = useCallback(
    ({ kind, record, nextLedgerData }, toastText = 'Updated Ledger bookkeeping') => {
      const prev = ledgerData;
      return optimisticMutate({
        applyOptimistic: () => nextLedgerData && setLedgerData(nextLedgerData),
        revertOptimistic: () => setLedgerData(prev),
        requestFn: () =>
          apiRequest(`/api/howard/ledger/items/${encodeURIComponent(record.id)}`, {
            method: 'PUT',
            body: { kind, item: record }
          }),
        toastText,
        errorText: 'Could not save Ledger item — reverted'
      });
    },
    [ledgerData, setLedgerData, optimisticMutate]
  );

  const handleDeleteLedgerItem = useCallback(
    ({ id, nextLedgerData }, toastText = 'Removed Ledger item') => {
      const prev = ledgerData;
      return optimisticMutate({
        applyOptimistic: () => nextLedgerData && setLedgerData(nextLedgerData),
        revertOptimistic: () => setLedgerData(prev),
        requestFn: () =>
          apiRequest(`/api/howard/ledger/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        toastText,
        errorText: 'Could not delete Ledger item — reverted'
      });
    },
    [ledgerData, setLedgerData, optimisticMutate]
  );

  const handleSaveLedgerSplitRule = useCallback(
    ({ splitRule, nextLedgerData }, toastText = 'Updated split rule') => {
      const prev = ledgerData;
      return optimisticMutate({
        applyOptimistic: () => nextLedgerData && setLedgerData(nextLedgerData),
        revertOptimistic: () => setLedgerData(prev),
        requestFn: () =>
          apiRequest('/api/howard/ledger/settings', { method: 'PUT', body: { splitRule } }),
        toastText,
        errorText: 'Could not save Ledger split rule — reverted'
      });
    },
    [ledgerData, setLedgerData, optimisticMutate]
  );

  const handleSaveLedgerData = useCallback(
    (nextLedgerData, toastText = 'Updated Ledger bookkeeping') => {
      const prev = ledgerData;
      return optimisticMutate({
        applyOptimistic: () => setLedgerData(nextLedgerData),
        revertOptimistic: () => setLedgerData(prev),
        requestFn: () =>
          apiRequest('/api/howard/ledger', { method: 'PUT', body: { ledgerData: nextLedgerData } }),
        toastText,
        errorText: 'Could not save Ledger bookkeeping — reverted'
      });
    },
    [ledgerData, setLedgerData, optimisticMutate]
  );

  const handleSaveBeaconInfo = useCallback(
    (nextBeacon, toastText = 'Updated Beacon house guide') => {
      const prev = beaconInfo;
      return optimisticMutate({
        applyOptimistic: () => setBeaconInfo(nextBeacon),
        revertOptimistic: () => setBeaconInfo(prev),
        requestFn: () =>
          apiRequest('/api/howard/beacon', { method: 'PUT', body: { beaconInfo: nextBeacon } }),
        toastText,
        errorText: 'Could not save Beacon guide — reverted'
      });
    },
    [beaconInfo, setBeaconInfo, optimisticMutate]
  );

  const openFloodgateWithIntent = useCallback(
    (intent = { tab: 'log', date: null }) => {
      if (!activeProfile.allowedApps.includes('floodgate')) {
        const partner2Name = profiles.find((p) => p.id === 'partner2')?.name || 'Partner 2';
        showToast(`Switch to ${partner2Name}'s profile to open Floodgate`, 'error');
        return;
      }
      setBloomIntent(null);
      setAlmanacIntentDate(null);
      setFloodgateIntent({ ...intent, timestamp: Date.now() });
      setActiveAppId('floodgate');
      setAppLauncherOpen(false);
      scrollTopSafe();
    },
    [activeProfile, profiles, showToast, scrollTopSafe]
  );

  const openBloomWithIntent = useCallback(
    (intent = { tab: 'today' }) => {
      setAlmanacIntentDate(null);
      setFloodgateIntent(null);
      setBloomIntent({ ...intent, timestamp: Date.now() });
      setActiveAppId('bloom');
      setAppLauncherOpen(false);
      scrollTopSafe();
    },
    [scrollTopSafe]
  );

  const openAlmanacOnDate = useCallback(
    (dateStr) => {
      setBloomIntent(null);
      setFloodgateIntent(null);
      setQuillIntent(null);
      setAlmanacIntentDate(dateStr);
      setActiveAppId('almanac');
      setAppLauncherOpen(false);
      scrollTopSafe();
    },
    [scrollTopSafe]
  );

  const openQuillWithIntent = useCallback(
    (intent = {}) => {
      setBloomIntent(null);
      setFloodgateIntent(null);
      setAlmanacIntentDate(null);
      setQuillIntent({ ...intent, timestamp: Date.now() });
      setActiveAppId('quill');
      setAppLauncherOpen(false);
      scrollTopSafe();
    },
    [scrollTopSafe]
  );

  const openProfileModal = useCallback(() => setProfileModalOpen(true), []);
  const openBackupModal = useCallback(() => setBackupModalOpen(true), []);

  return (
    <div className="min-h-screen transition-colors duration-200 bg-surface-page text-text-primary">
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-[calc(4.5rem+env(safe-area-inset-top))] right-4 max-w-[calc(100vw-2rem)] z-[70] no-print animate-fade-in"
        >
          <div
            className={`w-full flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-xl border text-xs sm:text-sm font-semibold ${
              toast.type === 'error'
                ? 'bg-rose-900 text-white border-rose-700'
                : toast.type === 'info'
                  ? 'bg-amber-900 text-amber-50 border-amber-700'
                  : 'bg-surface-card text-text-primary border-border-strong'
            }`}
          >
            <button
              type="button"
              onClick={() => setToast(null)}
              title="Dismiss notification"
              className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
            >
              {toast.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
              ) : toast.type === 'info' ? (
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
              <span className="min-w-0 break-words">{toast.text}</span>
            </button>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => {
                  const fn = toast.onAction;
                  setToast(null);
                  fn();
                }}
                className="px-2.5 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shrink-0 cursor-pointer transition"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}

      <HeaderBar
        isConnected={isConnected}
        syncTransport={syncTransport}
        lastSyncedAt={lastSyncedAt}
        activeAppMeta={activeAppMeta}
        urgentModuleCount={urgentModuleCount}
        activeProfile={activeProfile}
        themeMode={themeMode}
        onNavigateModule={handleNavigateModule}
        onOpenLauncher={() => setAppLauncherOpen(true)}
        onOpenProfileModal={openProfileModal}
        onOpenBackupModal={openBackupModal}
        onToggleTheme={cycleThemeMode}
      />

      <div className="flex min-h-[calc(100dvh-4rem)] print-block">
        <SidebarRail
          allowedApps={allowedApps}
          activeAppId={activeAppId}
          moduleStatuses={moduleStatuses}
          sidebarCollapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapsed}
          onNavigateModule={handleNavigateModule}
        />

        <div className="flex-1 min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
          {!isConnected && syncError && (
            <div className="max-w-7xl mx-auto px-2.5 sm:px-5 pt-3 no-print">
              <AlertBanner
                severity="warn"
                icon={AlertTriangle}
                title="Live Sync Disconnected"
                description={syncError}
                action={
                  <Button
                    variant="tinted"
                    accent="amber"
                    size="md"
                    onClick={() => fetchUnifiedSync({ force: true })}
                  >
                    Retry Now
                  </Button>
                }
              />
            </div>
          )}

          <ErrorBoundary darkMode={darkMode} appName={activeAppMeta.name} resetKey={activeAppId}>
            <Suspense
              fallback={
                <div className="max-w-7xl mx-auto px-2.5 sm:px-5 pt-3 sm:pt-4" aria-busy="true">
                  <div className="rounded-2xl sm:rounded-3xl p-6 border border-border-subtle bg-surface-card text-text-muted shadow-xs text-xs font-semibold flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full animate-pulse ${getModuleTheme(activeAppMeta.id).dotClass}`}
                    />
                    <span>Loading {activeAppMeta.name}...</span>
                  </div>
                </div>
              }
            >
              {activeAppId === 'foyer' && (
                <MemoFoyerApp
                  activeProfile={activeProfile}
                  profiles={profiles}
                  darkMode={darkMode}
                  nowMs={nowMs}
                  todayKey={todayKey}
                  cadenceSnapshot={cadenceSnapshot}
                  bloomSnapshot={bloomSnapshot}
                  bloomSummary={bloomSummary}
                  floodgateSnapshot={floodgateSnapshot}
                  almanacEvents={almanacEvents}
                  ledgerData={ledgerData}
                  beaconInfo={beaconInfo}
                  quillSnapshot={quillSnapshot}
                  onNavigateApp={handleNavigateModule}
                  onQuickRecordDose={handleQuickRecordPetDose}
                  onQuickMistMantis={handleQuickMistMantis}
                  onClearMantisLivePrey={handleClearMantisLivePrey}
                  onOpenFloodgate={openFloodgateWithIntent}
                  onOpenBloom={openBloomWithIntent}
                  onOpenAlmanacDate={openAlmanacOnDate}
                  onOpenQuill={openQuillWithIntent}
                  onOpenProfileModal={openProfileModal}
                  quickActionPending={quickActionPending}
                />
              )}

              {activeAppId === 'cadence' && (
                <MemoCadenceApp
                  activeProfile={activeProfile}
                  darkMode={darkMode}
                  nowMs={nowMs}
                  todayKey={todayKey}
                  cadenceSnapshot={cadenceSnapshot}
                  onGlobalSync={handleMutationSync}
                  showToast={showToast}
                />
              )}

              {activeAppId === 'bloom' && (
                <MemoBloomApp
                  activeProfile={activeProfile}
                  darkMode={darkMode}
                  nowMs={nowMs}
                  todayKey={todayKey}
                  bloomSnapshot={bloomSnapshot}
                  bloomSummary={bloomSummary}
                  navigationIntent={bloomIntent}
                  onGlobalSync={handleMutationSync}
                  showToast={showToast}
                />
              )}

              {activeAppId === 'almanac' && activeProfile.allowedApps.includes('almanac') && (
                <MemoAlmanacApp
                  activeProfile={activeProfile}
                  profiles={profiles}
                  darkMode={darkMode}
                  nowMs={nowMs}
                  todayKey={todayKey}
                  almanacEvents={almanacEvents}
                  cadenceSnapshot={cadenceSnapshot}
                  bloomSnapshot={bloomSnapshot}
                  bloomSummary={bloomSummary}
                  floodgateSnapshot={floodgateSnapshot}
                  ledgerData={ledgerData}
                  initialDate={almanacIntentDate}
                  onMutateEvents={handleMutateAlmanacEvents}
                  onSaveEvents={handleSaveAlmanacEvents}
                  onOpenFloodgate={openFloodgateWithIntent}
                  onNavigateApp={handleNavigateModule}
                  showToast={showToast}
                />
              )}

              {activeAppId === 'floodgate' && activeProfile.allowedApps.includes('floodgate') && (
                <MemoFloodgateApp
                  activeProfile={activeProfile}
                  darkMode={darkMode}
                  nowMs={nowMs}
                  todayKey={todayKey}
                  isConnected={isConnected}
                  floodgateSnapshot={floodgateSnapshot}
                  navigationIntent={floodgateIntent}
                  onOpenBackupModal={openBackupModal}
                  onGlobalSync={handleMutationSync}
                  showToast={showToast}
                />
              )}

              {activeAppId === 'ledger' && activeProfile.allowedApps.includes('ledger') && (
                <MemoLedgerApp
                  activeProfile={activeProfile}
                  profiles={profiles}
                  darkMode={darkMode}
                  nowMs={nowMs}
                  todayKey={todayKey}
                  ledgerData={ledgerData}
                  onUpsertLedgerItem={handleUpsertLedgerItem}
                  onDeleteLedgerItem={handleDeleteLedgerItem}
                  onSaveSplitRule={handleSaveLedgerSplitRule}
                  onSaveLedgerData={handleSaveLedgerData}
                  showToast={showToast}
                />
              )}

              {activeAppId === 'quill' && activeProfile.allowedApps.includes('quill') && (
                <MemoQuillApp
                  activeProfile={activeProfile}
                  profiles={profiles}
                  darkMode={darkMode}
                  nowMs={nowMs}
                  todayKey={todayKey}
                  quillSnapshot={quillSnapshot}
                  setQuillSnapshot={setQuillSnapshot}
                  almanacEvents={almanacEvents}
                  onMutateAlmanacEvents={handleMutateAlmanacEvents}
                  onOpenAlmanacDate={openAlmanacOnDate}
                  navigationIntent={quillIntent}
                  onGlobalSync={handleMutationSync}
                  showToast={showToast}
                />
              )}

              {activeAppId === 'beacon' && (
                <MemoBeaconApp
                  activeProfile={activeProfile}
                  darkMode={darkMode}
                  beaconInfo={beaconInfo}
                  cadenceSettings={cadenceSnapshot.settings}
                  bloomSnapshot={bloomSnapshot}
                  onSaveBeacon={handleSaveBeaconInfo}
                  onNavigateApp={handleNavigateModule}
                  showToast={showToast}
                />
              )}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>

      <MobileFloatingPill
        activeAppId={activeAppId}
        activeAppMeta={activeAppMeta}
        appLauncherOpen={appLauncherOpen}
        urgentModuleCount={urgentModuleCount}
        onNavigateModule={handleNavigateModule}
        onToggleLauncher={() => setAppLauncherOpen((prev) => !prev)}
      />

      <BentoSwitcherModal
        isOpen={appLauncherOpen}
        onClose={() => setAppLauncherOpen(false)}
        allowedApps={allowedApps}
        activeAppId={activeAppId}
        activeProfile={activeProfile}
        moduleStatuses={moduleStatuses}
        onNavigateModule={handleNavigateModule}
      />

      {profileModalOpen && (
        <Suspense fallback={null}>
          <ProfileSwitcherModal
            isOpen={profileModalOpen}
            onClose={() => setProfileModalOpen(false)}
            profiles={profiles}
            activeProfile={activeProfile}
            activeProfileId={activeProfileId}
            hasSavedProfile={hasSavedProfile}
            setHasSavedProfile={setHasSavedProfile}
            setActiveProfileId={setActiveProfileId}
            setProfiles={setProfiles}
            markProfileUnlocked={markProfileUnlocked}
            initialPinTarget={bootPinTarget}
            onClearInitialPinTarget={clearBootPinTarget}
            fetchUnifiedSync={fetchUnifiedSync}
            showToast={showToast}
            storageKey={ACTIVE_PROFILE_STORAGE_KEY}
          />
        </Suspense>
      )}

      {backupModalOpen && activeProfile.id !== 'caregiver' && (
        <Suspense fallback={null}>
          <BackstageBackupModal
            isOpen={backupModalOpen}
            onClose={() => setBackupModalOpen(false)}
            activeProfile={activeProfile}
            isConnected={isConnected}
            syncTransport={syncTransport}
            dbInfo={dbInfo}
            almanacEvents={almanacEvents}
            ledgerData={ledgerData}
            cadenceSnapshot={cadenceSnapshot}
            bloomSnapshot={bloomSnapshot}
            floodgateSnapshot={floodgateSnapshot}
            quillSnapshot={quillSnapshot}
            onRestoredSync={() => fetchUnifiedSync({ force: true })}
            showToast={showToast}
          />
        </Suspense>
      )}
    </div>
  );
}
