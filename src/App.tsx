import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { AppId, ProfileId, ThemeMode } from '../shared/schemas/common.ts';
import type { AlmanacEvent } from '../shared/schemas/almanac.ts';
import type { BeaconInfo } from '../shared/schemas/beacon.ts';
import type { LedgerData, LedgerItem, LedgerKind, LedgerSplitRule } from '../shared/schemas/ledger.ts';
import type { PublicProfile } from '../shared/schemas/profile.ts';

import FoyerApp from './apps/FoyerApp.tsx';
import { AlertBanner, Button, getOpenModalCount } from './components/HowardUI.tsx';
import { ErrorBoundary } from './components/shell/ErrorBoundary.tsx';
import {
  APP_REGISTRY,
  BentoSwitcherModal,
  HeaderBar,
  MobileFloatingPill,
  SidebarRail
} from './components/shell/AppNavigation.tsx';
import { computeModuleStatuses } from './utils/moduleStatuses.ts';
import { useHouseholdSync, FALLBACK_PROFILES, type DomainSyncSeqMap, type SyncFetchOptions } from './hooks/useHouseholdSync.ts';
import { useActionLock } from './hooks/useActionLock.ts';
import { createRpcClient, unwrapRpc } from './utils/apiClient.ts';
import {
  getLocalDateKey,
  computeBloomSummary,
  isAppId,
  isProfileId
} from './utils/householdHelpers.ts';
import { getModuleTheme } from './utils/moduleThemes.ts';

const CadenceApp = lazy(() => import('./apps/CadenceApp.tsx'));
const BloomApp = lazy(() => import('./apps/BloomApp.tsx'));
const AlmanacApp = lazy(() => import('./apps/AlmanacApp.tsx'));
const FloodgateApp = lazy(() => import('./apps/FloodgateApp.tsx'));
const LedgerApp = lazy(() => import('./apps/LedgerApp.tsx'));
const QuillApp = lazy(() => import('./apps/QuillApp.tsx'));
const BeaconApp = lazy(() => import('./apps/BeaconApp.tsx'));

const ProfileSwitcherModal = lazy(() => import('./components/shell/ProfileSwitcherModal.tsx'));
const BackstageBackupModal = lazy(() => import('./components/shell/BackstageBackupModal.tsx'));

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

function readStorage(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
}

export type ShowToastFn = (
  text: string,
  type?: 'success' | 'error' | 'info',
  options?: ToastOptions | null
) => void;

export interface NavigationIntent {
  tab?: string;
  date?: string | null;
  noteId?: string;
  action?: string;
  timestamp: number;
}

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
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
    isProfileId(readStorage(ACTIVE_PROFILE_STORAGE_KEY, ''))
  );
  const [activeProfileId, setActiveProfileId] = useState<ProfileId>(() => {
    const saved = readStorage(ACTIVE_PROFILE_STORAGE_KEY, 'caregiver');
    return isProfileId(saved) ? saved : 'caregiver';
  });
  const [activeAppId, setActiveAppId] = useState<AppId>(() => {
    const saved = readStorage(ACTIVE_APP_STORAGE_KEY, 'foyer');
    return isAppId(saved) ? saved : 'foyer';
  });

  const [floodgateIntent, setFloodgateIntent] = useState<NavigationIntent | null>(null);
  const [bloomIntent, setBloomIntent] = useState<NavigationIntent | null>(null);
  const [almanacIntentDate, setAlmanacIntentDate] = useState<string | null>(null);
  const [quillIntent, setQuillIntent] = useState<NavigationIntent | null>(null);

  const [profileModalOpen, setProfileModalOpen] = useState(
    () => !readStorage(ACTIVE_PROFILE_STORAGE_KEY, '')
  );
  const [bootPinTarget, setBootPinTarget] = useState<PublicProfile | null>(null);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [appLauncherOpen, setAppLauncherOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => readStorage(SIDEBAR_COLLAPSED_STORAGE_KEY, '0') === '1'
  );

  const handleRequireBootPin = useCallback((savedProf: PublicProfile) => {
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
    syncVersionsRef,
    markProfileUnlocked,
    fetchUnifiedSync
  } = useHouseholdSync({
    activeProfileId,
    setActiveProfileId,
    setHasSavedProfile,
    onRequireBootPin: handleRequireBootPin
  });

  const activeProfileIdRef = useRef(activeProfileId);
  useEffect(() => {
    activeProfileIdRef.current = activeProfileId;
  }, [activeProfileId]);

  const handleMutationSync = useCallback(
    (opts: SyncFetchOptions = {}) => fetchUnifiedSync({ afterMutation: true, ...opts }),
    [fetchUnifiedSync]
  );

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const refreshClock = () => setNowMs(Date.now());
    const clockTimer = setInterval(refreshClock, 60000);

    let midnightTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleMidnightTick = () => {
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        0,
        250
      );
      midnightTimer = setTimeout(() => {
        refreshClock();
        scheduleMidnightTick();
      }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
    };
    scheduleMidnightTick();

    const handleWakeClock = () => {
      if (document.visibilityState === 'visible') {
        refreshClock();
      }
    };
    window.addEventListener('focus', handleWakeClock);
    document.addEventListener('visibilitychange', handleWakeClock);

    return () => {
      clearInterval(clockTimer);
      if (midnightTimer) clearTimeout(midnightTimer);
      window.removeEventListener('focus', handleWakeClock);
      document.removeEventListener('visibilitychange', handleWakeClock);
    };
  }, []);

  const todayKey = useMemo(() => getLocalDateKey(new Date(nowMs)), [nowMs]);

  const [toast, setToast] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
    actionLabel: string | null;
    onAction: (() => void) | null;
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast: ShowToastFn = useCallback((text, type = 'success', options = null) => {
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
    (targetAppId: AppId) => {
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
    const handleKeyDown = (e: KeyboardEvent) => {
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
    () => profiles.find((p) => p.id === activeProfileId) || profiles[0] || FALLBACK_PROFILES[0]!,
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
    () => allowedApps.find((app) => app.id === activeAppId) || allowedApps[0] || APP_REGISTRY[0]!,
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
    async (slot: 'morning' | 'evening', note = '') => {
      await runQuickAction(async () => {
        const liveTodayKey = getLocalDateKey(new Date());
        const nowIso = new Date().toISOString();
        const caregiverName = activeProfile.caregiverName || activeProfile.name;
        const capturedProfileId = activeProfile.id;
        const capturedDomainSeq = syncVersionsRef.current.cadence;
        const prevCadence = cadenceSnapshot;
        const dosePayload = {
          given: true,
          timestamp: nowIso,
          givenBy: caregiverName,
          givenByProfileId: capturedProfileId,
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
          const rpc = createRpcClient({ profileId: capturedProfileId });
          await unwrapRpc(
            rpc.api.cadence.logs[':dateKey'].$put({
              param: { dateKey: liveTodayKey },
              json: { [slot]: dosePayload, updatedAt: nowIso }
            })
          );
          showToast(
            `Logged ${cadenceSnapshot.settings?.catName || 'Pet'}'s ${slot === 'morning' ? 'Morning' : 'Evening'} dose (${caregiverName})`
          );
          void handleMutationSync();
        } catch (err) {
          if (
            activeProfileIdRef.current === capturedProfileId &&
            syncVersionsRef.current.cadence === capturedDomainSeq
          ) {
            setCadenceSnapshot(prevCadence);
          }
          void fetchUnifiedSync({ force: true });
          showToast(
            err instanceof Error ? err.message : 'Failed to save dose to server — reverted',
            'error'
          );
        }
      });
    },
    [
      runQuickAction,
      activeProfile,
      cadenceSnapshot,
      setCadenceSnapshot,
      syncVersionsRef,
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
      const capturedProfileId = activeProfile.id;
      const capturedDomainSeq = syncVersionsRef.current.bloom;
      const prevBloom = bloomSnapshot;

      const newMist = {
        id: `mist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        by: caregiverName,
        byProfileId: capturedProfileId,
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
        const rpc = createRpcClient({ profileId: capturedProfileId });
        await unwrapRpc(
          rpc.api.bloom.logs[':dateKey'].$put({
            param: { dateKey: liveTodayKey },
            json: { appendMist: newMist, updatedAt: nowIso }
          })
        );
        showToast(`Logged ${mantisName}'s enclosure mist (${caregiverName})`);
        void handleMutationSync();
      } catch (err) {
        if (
          activeProfileIdRef.current === capturedProfileId &&
          syncVersionsRef.current.bloom === capturedDomainSeq
        ) {
          setBloomSnapshot(prevBloom);
        }
        void fetchUnifiedSync({ force: true });
        showToast(
          err instanceof Error ? err.message : 'Failed to save mist log to server — reverted',
          'error'
        );
      }
    });
  }, [
    runQuickAction,
    activeProfile,
    bloomSnapshot,
    setBloomSnapshot,
    syncVersionsRef,
    showToast,
    handleMutationSync,
    fetchUnifiedSync
  ]);

  const handleClearMantisLivePrey = useCallback(async () => {
    await runQuickAction(async () => {
      const mantisName = bloomSnapshot.settings?.mantisName || 'Mantis';
      const capturedProfileId = activeProfile.id;
      const capturedDomainSeq = syncVersionsRef.current.bloom;
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
        const rpc = createRpcClient({ profileId: capturedProfileId });
        await unwrapRpc(rpc.api.bloom.settings.$put({ json: clearFields }));
        showToast(`Marked ${mantisName}'s enclosure clear of live prey`);
        void handleMutationSync();
      } catch (err) {
        if (
          activeProfileIdRef.current === capturedProfileId &&
          syncVersionsRef.current.bloom === capturedDomainSeq
        ) {
          setBloomSnapshot(prevBloom);
        }
        void fetchUnifiedSync({ force: true });
        showToast(
          err instanceof Error ? err.message : 'Failed to update Bloom enclosure status — reverted',
          'error'
        );
      }
    });
  }, [
    runQuickAction,
    activeProfile.id,
    bloomSnapshot,
    setBloomSnapshot,
    syncVersionsRef,
    showToast,
    handleMutationSync,
    fetchUnifiedSync
  ]);

  const optimisticMutate = useCallback(
    async ({
      domain,
      applyOptimistic,
      revertOptimistic,
      requestFn,
      toastText,
      errorText
    }: {
      domain: keyof DomainSyncSeqMap;
      applyOptimistic: () => void;
      revertOptimistic: () => void;
      requestFn: (rpc: ReturnType<typeof createRpcClient>) => Promise<unknown>;
      toastText?: string | undefined;
      errorText: string;
    }) => {
      const capturedProfileId = activeProfileIdRef.current;
      const capturedDomainSeq = syncVersionsRef.current[domain];
      applyOptimistic();
      try {
        const rpc = createRpcClient({ profileId: capturedProfileId });
        await requestFn(rpc);
        if (toastText) showToast(toastText);
        void handleMutationSync();
        return true;
      } catch (err) {
        if (
          activeProfileIdRef.current === capturedProfileId &&
          syncVersionsRef.current[domain] === capturedDomainSeq
        ) {
          revertOptimistic();
        }
        void fetchUnifiedSync({ force: true });
        showToast(err instanceof Error && err.message ? err.message : errorText, 'error');
        return false;
      }
    },
    [syncVersionsRef, showToast, handleMutationSync, fetchUnifiedSync]
  );

  const handleMutateAlmanacEvents = useCallback(
    (
      {
        nextEvents,
        upserts = [],
        deleteIds = []
      }: { nextEvents?: AlmanacEvent[]; upserts?: AlmanacEvent[]; deleteIds?: string[] },
      toastText = 'Updated Almanac calendar'
    ) => {
      const prev = almanacEvents;
      return optimisticMutate({
        domain: 'almanac',
        applyOptimistic: () => {
          if (Array.isArray(nextEvents)) setAlmanacEvents(nextEvents);
        },
        revertOptimistic: () => setAlmanacEvents(prev),
        requestFn: (rpc) =>
          unwrapRpc(
            rpc.api.howard.almanac.events.batch.$post({
              json: { upserts, deleteIds }
            })
          ),
        toastText,
        errorText: 'Could not save calendar event — reverted'
      });
    },
    [almanacEvents, setAlmanacEvents, optimisticMutate]
  );

  const handleUpsertLedgerItem = useCallback(
    (
      {
        kind,
        record,
        nextLedgerData
      }: { kind: LedgerKind; record: LedgerItem; nextLedgerData?: LedgerData },
      toastText = 'Updated Ledger bookkeeping'
    ) => {
      const prev = ledgerData;
      return optimisticMutate({
        domain: 'ledger',
        applyOptimistic: () => {
          if (nextLedgerData) setLedgerData(nextLedgerData);
        },
        revertOptimistic: () => setLedgerData(prev),
        requestFn: (rpc) =>
          unwrapRpc(
            rpc.api.howard.ledger.items[':itemId'].$put({
              param: { itemId: record.id },
              json: { kind, item: record }
            })
          ),
        toastText,
        errorText: 'Could not save Ledger item — reverted'
      });
    },
    [ledgerData, setLedgerData, optimisticMutate]
  );

  const handleDeleteLedgerItem = useCallback(
    (
      { id, nextLedgerData }: { id: string; nextLedgerData?: LedgerData },
      toastText = 'Removed Ledger item'
    ) => {
      const prev = ledgerData;
      return optimisticMutate({
        domain: 'ledger',
        applyOptimistic: () => {
          if (nextLedgerData) setLedgerData(nextLedgerData);
        },
        revertOptimistic: () => setLedgerData(prev),
        requestFn: (rpc) =>
          unwrapRpc(
            rpc.api.howard.ledger.items[':itemId'].$delete({
              param: { itemId: id }
            })
          ),
        toastText,
        errorText: 'Could not delete Ledger item — reverted'
      });
    },
    [ledgerData, setLedgerData, optimisticMutate]
  );

  const handleSaveLedgerSplitRule = useCallback(
    (
      { splitRule, nextLedgerData }: { splitRule: LedgerSplitRule; nextLedgerData?: LedgerData },
      toastText = 'Updated split rule'
    ) => {
      const prev = ledgerData;
      return optimisticMutate({
        domain: 'ledger',
        applyOptimistic: () => {
          if (nextLedgerData) setLedgerData(nextLedgerData);
        },
        revertOptimistic: () => setLedgerData(prev),
        requestFn: (rpc) =>
          unwrapRpc(rpc.api.howard.ledger.settings.$put({ json: { splitRule } })),
        toastText,
        errorText: 'Could not save Ledger split rule — reverted'
      });
    },
    [ledgerData, setLedgerData, optimisticMutate]
  );

  const handleSaveLedgerData = useCallback(
    (nextLedgerData: LedgerData, toastText = 'Updated Ledger bookkeeping') => {
      const prev = ledgerData;
      return optimisticMutate({
        domain: 'ledger',
        applyOptimistic: () => setLedgerData(nextLedgerData),
        revertOptimistic: () => setLedgerData(prev),
        requestFn: (rpc) =>
          unwrapRpc(rpc.api.howard.ledger.$put({ json: { ledgerData: nextLedgerData } })),
        toastText,
        errorText: 'Could not save Ledger bookkeeping — reverted'
      });
    },
    [ledgerData, setLedgerData, optimisticMutate]
  );

  const handleSaveBeaconInfo = useCallback(
    (nextBeacon: BeaconInfo, toastText = 'Updated Beacon house guide') => {
      const prev = beaconInfo;
      return optimisticMutate({
        domain: 'beacon',
        applyOptimistic: () => setBeaconInfo(nextBeacon),
        revertOptimistic: () => setBeaconInfo(prev),
        requestFn: (rpc) =>
          unwrapRpc(rpc.api.howard.beacon.$put({ json: { beaconInfo: nextBeacon } })),
        toastText,
        errorText: 'Could not save Beacon guide — reverted'
      });
    },
    [beaconInfo, setBeaconInfo, optimisticMutate]
  );

  const openFloodgateWithIntent = useCallback(
    (intent: { tab?: string; date?: string | null } = { tab: 'log', date: null }) => {
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
    (intent: { tab?: string; action?: string } = { tab: 'today' }) => {
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
    (dateStr: string) => {
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
    (intent: { tab?: string; noteId?: string } = {}) => {
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
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-[calc(4.5rem+env(safe-area-inset-top))] right-4 max-w-[calc(100vw-2rem)] z-[70] no-print pointer-events-none"
      >
        {toast && (
          <div
            className={`pointer-events-auto w-full flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-xl border text-xs sm:text-sm font-semibold animate-fade-in ${
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
              aria-label={`Dismiss notification: ${toast.text}`}
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
                  fn?.();
                }}
                className="px-2.5 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shrink-0 cursor-pointer transition"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>

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
                    onClick={() => void fetchUnifiedSync({ force: true })}
                  >
                    Retry Now
                  </Button>
                }
              />
            </div>
          )}

          <ErrorBoundary appName={activeAppMeta.name} resetKey={activeAppId}>
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
        <ErrorBoundary appName="Profile Switcher" resetKey={String(profileModalOpen)}>
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
        </ErrorBoundary>
      )}

      {backupModalOpen && activeProfile.id !== 'caregiver' && (
        <ErrorBoundary appName="Household Backstage" resetKey={String(backupModalOpen)}>
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
        </ErrorBoundary>
      )}
    </div>
  );
}
