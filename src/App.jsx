import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import {
  Home,
  Cat,
  Flower2,
  Calendar,
  Heart,
  Wallet,
  ShieldAlert,
  Moon,
  Coffee,
  Lock,
  Unlock,
  UserCheck,
  Database,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  KeyRound,
  ChevronRight,
  ChevronUp,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

import FoyerApp from './apps/FoyerApp.jsx';
import { ModalShell, getFieldClass, getOpenModalCount } from './components/HowardUI.jsx';
import {
  getLocalDateKey,
  parseLocalDateKey,
  DEFAULT_BLOOM_SETTINGS,
  computeBloomSummary,
  doesAlmanacEventOccurOnDate,
  isAlmanacEventVisibleToProfile,
  getLedgerScheduleInfo
} from './utils/householdHelpers.js';

const CadenceApp = lazy(() => import('./apps/CadenceApp.jsx'));
const BloomApp = lazy(() => import('./apps/BloomApp.jsx'));
const AlmanacApp = lazy(() => import('./apps/AlmanacApp.jsx'));
const FloodgateApp = lazy(() => import('./apps/FloodgateApp.jsx'));
const LedgerApp = lazy(() => import('./apps/LedgerApp.jsx'));
const BeaconApp = lazy(() => import('./apps/BeaconApp.jsx'));

const POLL_INTERVAL_SSE_MS = 30000;
const POLL_INTERVAL_FALLBACK_MS = 3000;
const ACTIVE_PROFILE_STORAGE_KEY = 'howard-active-profile';
const ACTIVE_APP_STORAGE_KEY = 'howard-active-app';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'howard-sidebar-collapsed';

const IS_MAC_PLATFORM =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
const QUICK_JUMP_SHORTCUT = IS_MAC_PLATFORM ? '⌘K' : 'Ctrl K';

const APP_REGISTRY = [
  {
    id: 'foyer',
    name: 'Foyer',
    subtitle: 'Daily Briefing',
    icon: Home,
    accent: 'bg-teal-700 text-white',
    activeCardClass: 'border-teal-500 ring-2 ring-teal-500/25'
  },
  {
    id: 'cadence',
    name: 'Cadence',
    subtitle: 'Pet Meds',
    icon: Cat,
    accent: 'bg-purple-600 text-white',
    activeCardClass: 'border-purple-500 ring-2 ring-purple-500/25'
  },
  {
    id: 'bloom',
    name: 'Bloom',
    subtitle: 'Mantis Care',
    icon: Flower2,
    accent: 'bg-emerald-700 text-white',
    activeCardClass: 'border-emerald-500 ring-2 ring-emerald-500/25'
  },
  {
    id: 'almanac',
    name: 'Almanac',
    subtitle: 'Calendar',
    icon: Calendar,
    accent: 'bg-indigo-600 text-white',
    activeCardClass: 'border-indigo-500 ring-2 ring-indigo-500/25'
  },
  {
    id: 'floodgate',
    name: 'Floodgate',
    subtitle: 'Cycle & GP Log',
    icon: Heart,
    accent: 'bg-rose-600 text-white',
    activeCardClass: 'border-rose-500 ring-2 ring-rose-500/25',
    privateTo: 'partner2'
  },
  {
    id: 'ledger',
    name: 'Ledger',
    subtitle: 'Finances & Bills',
    icon: Wallet,
    accent: 'bg-amber-700 text-white',
    activeCardClass: 'border-amber-500 ring-2 ring-amber-500/25'
  },
  {
    id: 'beacon',
    name: 'Beacon',
    subtitle: 'House & Vet Guide',
    icon: ShieldAlert,
    accent: 'bg-sky-700 text-white',
    activeCardClass: 'border-sky-500 ring-2 ring-sky-500/25'
  }
];

const FALLBACK_PROFILES = [
  {
    id: 'partner1',
    name: 'Partner 1',
    role: 'Household Member',
    color: 'teal',
    badgeEmoji: '⚡',
    pinEnabled: false,
    lockedOutOfPin: false,
    allowedApps: ['foyer', 'cadence', 'bloom', 'almanac', 'ledger', 'beacon'],
    caregiverName: 'Partner 1'
  },
  {
    id: 'partner2',
    name: 'Partner 2',
    role: 'Household Member',
    color: 'rose',
    badgeEmoji: '🌸',
    pinEnabled: false,
    lockedOutOfPin: false,
    allowedApps: ['foyer', 'cadence', 'bloom', 'almanac', 'floodgate', 'ledger', 'beacon'],
    caregiverName: 'Partner 2'
  },
  {
    id: 'caregiver',
    name: 'Caregiver',
    role: 'Pet Sitter / Guest',
    color: 'amber',
    badgeEmoji: '🐾',
    pinEnabled: false,
    lockedOutOfPin: true,
    allowedApps: ['foyer', 'cadence', 'bloom', 'beacon'],
    caregiverName: 'Caregiver'
  }
];

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      const { darkMode, appName } = this.props;
      return (
        <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4">
          <div
            className={`rounded-2xl sm:rounded-3xl p-6 border shadow-xs space-y-3 ${
              darkMode
                ? 'bg-slate-900 border-rose-900/60 text-slate-200'
                : 'bg-white border-rose-200 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400 font-extrabold text-base">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Could not load {appName || 'module'}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              If Howard was recently rebuilt or updated, reloading the page fetches the latest module bundle.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer transition active:scale-[0.98]"
              >
                Reload Howard
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false })}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold cursor-pointer transition active:scale-[0.98]"
              >
                Try Again
              </button>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  // --------------------------------------------------------------------------
  // THEME & SHELL STATE ('warm' | 'dark')
  // --------------------------------------------------------------------------
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const saved = localStorage.getItem('howard-theme');
      if (saved === 'dark') return 'dark';
      if (saved === 'warm' || saved === 'light') return 'warm';
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'warm';
    } catch {
      return 'warm';
    }
  });

  const darkMode = themeMode === 'dark';

  const cycleThemeMode = () => {
    setThemeMode((prev) => (prev === 'dark' ? 'warm' : 'dark'));
  };

  useEffect(() => {
    try {
      localStorage.setItem('howard-theme', themeMode);
    } catch {
      // ignore storage errors
    }
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    document.documentElement.classList.toggle('warm', themeMode === 'warm');
  }, [themeMode]);

  // Track whether this device has already chosen a profile in localStorage
  const [hasSavedProfile, setHasSavedProfile] = useState(() => {
    try {
      return Boolean(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY));
    } catch {
      return false;
    }
  });

  const [activeProfileId, setActiveProfileId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || 'caregiver';
    } catch {
      return 'caregiver';
    }
  });

  const [activeAppId, setActiveAppId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_APP_STORAGE_KEY) || 'foyer';
    } catch {
      return 'foyer';
    }
  });

  // Cross-app navigation intent (e.g. jump to Floodgate GP report, Bloom habitat, or specific date)
  const [floodgateIntent, setFloodgateIntent] = useState(null); // { tab: 'log'|'calendar'|'insights', date: 'YYYY-MM-DD' }
  const [bloomIntent, setBloomIntent] = useState(null); // { tab: 'today'|'growth'|'habitat' }
  const [almanacIntentDate, setAlmanacIntentDate] = useState(null);

  // --------------------------------------------------------------------------
  // LIVE HOUSEHOLD SYNC STATE (SSE LIVE PUSH + POLLING FALLBACK)
  // --------------------------------------------------------------------------
  const [isConnected, setIsConnected] = useState(true);
  const [syncError, setSyncError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncTransport, setSyncTransport] = useState('polling'); // 'sse' | 'polling'

  const [profiles, setProfiles] = useState(FALLBACK_PROFILES);
  const [almanacEvents, setAlmanacEvents] = useState([]);
  const [ledgerData, setLedgerData] = useState({
    splitRule: '50-50',
    incomes: [],
    recurring: [],
    expenses: []
  });
  const [beaconInfo, setBeaconInfo] = useState(null);

  const [cadenceSnapshot, setCadenceSnapshot] = useState({
    settings: {
      catName: 'Pet',
      medicationName: 'Oral Solution',
      dosageLabel: '2.5 mg / 0.5 ml',
      morningTargetTime: '08:00',
      eveningTargetTime: '20:00',
      bottleOpenedDate: getLocalDateKey(new Date()),
      bottleShelfLifeDays: 180,
      caregivers: ['Partner 1', 'Partner 2', 'Caregiver'],
      administrationNote: ''
    },
    logsByDate: {}
  });

  const [floodgateSnapshot, setFloodgateSnapshot] = useState({
    settings: { ownerName: 'Partner 2', appName: 'Floodgate' },
    logsByDate: {}
  });

  const [bloomSnapshot, setBloomSnapshot] = useState({
    settings: DEFAULT_BLOOM_SETTINGS,
    logsByDate: {},
    molts: [],
    feeders: []
  });

  // Track which PIN-protected profiles have been unlocked during this session
  const [unlockedProfiles, setUnlockedProfiles] = useState(() => ({
    caregiver: true
  }));
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setNowMs(Date.now());
    }, 60000);
    return () => clearInterval(clockTimer);
  }, []);

  // Toast feedback
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((text, type = 'success') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ text, type });
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  // Modals: Profile Switcher (opens automatically on a new device with no saved profile), PIN Prompt, PIN Configuration, Unified Backup
  const [profileModalOpen, setProfileModalOpen] = useState(() => {
    try {
      return !localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    } catch {
      return true;
    }
  });
  const [pinPromptTarget, setPinPromptTarget] = useState(null); // profile object requiring PIN
  const [pinInput, setPinInput] = useState('');
  const [pinPromptError, setPinPromptError] = useState('');

  const [pinManageOpen, setPinManageOpen] = useState(false);
  const [pinManageCurrent, setPinManageCurrent] = useState('');
  const [pinManageNew, setPinManageNew] = useState('');
  const [pinManageConfirm, setPinManageConfirm] = useState('');
  const [pinManageError, setPinManageError] = useState('');

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  const [quickActionPending, setQuickActionPending] = useState(false);
  const quickActionRef = useRef(false);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(null); // { bodyToSend, confirmPrompt, fileName }
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [dbInfo, setDbInfo] = useState({
    file: 'data/howard.db',
    schemaVersion: 5,
    journalMode: 'WAL'
  });

  // Navigation Shell State: Bento App Launcher (Sheet / Ctrl+K) & Desktop Collapsible Sidebar
  const [appLauncherOpen, setAppLauncherOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

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

  const resetProfileSubforms = useCallback(() => {
    setPinPromptTarget(null);
    setPinInput('');
    setPinPromptError('');
    setPinManageOpen(false);
    setPinManageCurrent('');
    setPinManageNew('');
    setPinManageConfirm('');
    setPinManageError('');
    setRenameOpen(false);
    setRenameDraft('');
  }, []);

  const scrollTopSafe = useCallback(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, []);

  const handleNavigateModule = useCallback((targetAppId) => {
    setAlmanacIntentDate(null);
    setFloodgateIntent(null);
    setBloomIntent(null);
    setActiveAppId(targetAppId);
    setAppLauncherOpen(false);
    scrollTopSafe();
  }, [scrollTopSafe]);

  // Global Ctrl+K / Cmd+K shortcut for Bento Module Switcher
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key || '').toLowerCase() === 'k') {
        if (profileModalOpen || backupModalOpen || pendingRestore || (!appLauncherOpen && getOpenModalCount() > 0)) {
          return;
        }
        e.preventDefault();
        setAppLauncherOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appLauncherOpen, profileModalOpen, backupModalOpen, pendingRestore]);

  // Active profile object
  const activeProfile = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId) || profiles[0] || FALLBACK_PROFILES[0];
  }, [profiles, activeProfileId]);

  useEffect(() => {
    if (activeProfile.id === 'caregiver') {
      setBackupModalOpen(false);
    }
    if (activeProfile.id !== 'partner1') {
      setPendingRestore(null);
    }
  }, [activeProfile.id]);

  // Visible apps for the active profile
  const allowedApps = useMemo(() => {
    const allowedIds = activeProfile?.allowedApps || ['foyer', 'cadence', 'bloom', 'beacon'];
    return APP_REGISTRY.filter((app) => allowedIds.includes(app.id));
  }, [activeProfile]);

  const activeAppMeta = useMemo(() => {
    return allowedApps.find((app) => app.id === activeAppId) || allowedApps[0] || APP_REGISTRY[0];
  }, [allowedApps, activeAppId]);

  const bloomSummary = useMemo(
    () => computeBloomSummary(bloomSnapshot, new Date(nowMs)),
    [bloomSnapshot, nowMs]
  );

  // Live per-module micro-status badges for Bento Sheet & Desktop Sidebar
  const moduleStatuses = useMemo(() => {
    const now = new Date(nowMs);
    const todayKey = getLocalDateKey(now);
    const hour = now.getHours();

    // Cadence status
    const todayCadence = cadenceSnapshot?.logsByDate?.[todayKey] || {};
    const amDone = Boolean(todayCadence.morning?.given);
    const pmDone = Boolean(todayCadence.evening?.given);
    const amTarget = cadenceSnapshot?.settings?.morningTargetTime || '08:00';
    const pmTarget = cadenceSnapshot?.settings?.eveningTargetTime || '20:00';
    const openedStr = cadenceSnapshot?.settings?.bottleOpenedDate || todayKey;
    const shelfLife = Number(cadenceSnapshot?.settings?.bottleShelfLifeDays) || 180;
    const expiryDate = parseLocalDateKey(openedStr);
    expiryDate.setDate(expiryDate.getDate() + shelfLife);
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const bottleDaysLeft = Math.round(
      (expiryDate.getTime() - todayMidnight.getTime()) / 86400000
    );

    let cadenceStatus = { label: '2/2 done', urgent: false };
    if (bottleDaysLeft <= 0) {
      cadenceStatus = { label: 'Bottle exp.', urgent: true };
    } else if (!amDone) {
      cadenceStatus = { label: `AM ${amTarget}`, urgent: true };
    } else if (!pmDone) {
      cadenceStatus = { label: `PM ${pmTarget}`, urgent: hour >= 17 };
    } else if (bottleDaysLeft <= 14) {
      cadenceStatus = { label: `${bottleDaysLeft}d bottle`, urgent: true };
    }

    // Bloom status
    let bloomStatus = {
      label: `${bloomSummary.settings.currentInstar} OK`,
      urgent: false
    };
    if (bloomSummary.settings.livePreyInside) {
      bloomStatus = { label: 'Prey inside', urgent: true };
    } else if (bloomSummary.isNoFeedLockout) {
      bloomStatus = {
        label: bloomSummary.effectiveStatus === 'premolt' ? 'Premolt' : 'Hardening',
        urgent: true
      };
    } else if (bloomSummary.isMistDue) {
      bloomStatus = { label: 'Mist due', urgent: true };
    } else if (bloomSummary.feederAlerts.length > 0 && activeProfile.id !== 'caregiver') {
      bloomStatus = { label: 'Feeder low', urgent: true };
    }

    // Almanac status
    const partner2Name = (profiles || []).find((p) => p.id === 'partner2')?.name || 'Partner 2';
    const todayEvents = (almanacEvents || []).filter(
      (evt) =>
        doesAlmanacEventOccurOnDate(evt, todayKey) &&
        isAlmanacEventVisibleToProfile(evt, activeProfile, partner2Name)
    );
    const almanacStatus =
      todayEvents.length > 0
        ? { label: `${todayEvents.length} today`, urgent: true }
        : { label: 'Clear', urgent: false };

    // Floodgate status
    const fgToday = floodgateSnapshot?.logsByDate?.[todayKey];
    const floodgateStatus = fgToday
      ? { label: 'Logged', urgent: false }
      : { label: 'Private', urgent: false };

    // Ledger status
    const activeRecurring = (ledgerData?.recurring || []).filter((r) => r.active !== false);
    const dueSoonCount = activeRecurring.filter((r) => {
      const { daysUntil } = getLedgerScheduleInfo(r, false, now);
      return daysUntil >= 0 && daysUntil <= 3;
    }).length;
    const ledgerStatus =
      dueSoonCount > 0
        ? { label: `${dueSoonCount} due soon`, urgent: true }
        : { label: 'Synced', urgent: false };

    // Beacon status
    const hasBeaconDetails = Boolean(
      beaconInfo?.vetInfo?.phone ||
        beaconInfo?.vetInfo?.emergencyPhone ||
        beaconInfo?.houseGuide?.wifiName
    );
    const beaconStatus = { label: hasBeaconDetails ? 'Ready' : 'Guide', urgent: false };

    return {
      foyer: { label: 'Home', urgent: false },
      cadence: cadenceStatus,
      bloom: bloomStatus,
      almanac: almanacStatus,
      floodgate: floodgateStatus,
      ledger: ledgerStatus,
      beacon: beaconStatus
    };
  }, [
    nowMs,
    cadenceSnapshot,
    bloomSummary,
    almanacEvents,
    floodgateSnapshot,
    ledgerData,
    beaconInfo,
    activeProfile,
    profiles
  ]);

  const urgentModuleCount = useMemo(() => {
    return allowedApps.filter(
      (app) => app.id !== 'foyer' && moduleStatuses[app.id]?.urgent
    ).length;
  }, [allowedApps, moduleStatuses]);

  // Ensure activeAppId is always permitted for the active profile
  useEffect(() => {
    const allowedIds = activeProfile?.allowedApps || ['foyer', 'cadence', 'bloom', 'beacon'];
    if (!allowedIds.includes(activeAppId)) {
      setActiveAppId('foyer');
    }
  }, [activeProfile, activeAppId]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_APP_STORAGE_KEY, activeAppId);
    } catch {
      // ignore
    }
  }, [activeAppId]);

  // Update browser tab title dynamically
  useEffect(() => {
    const currentApp = APP_REGISTRY.find((a) => a.id === activeAppId);
    document.title = `Howard • ${currentApp ? currentApp.name : 'Household'} (${activeProfile.name})`;
  }, [activeAppId, activeProfile]);

  // --------------------------------------------------------------------------
  // UNIFIED INCREMENTAL LIVE SYNC (SSE PUSH + SELECTIVE DOMAIN DELTA FALLBACK)
  // --------------------------------------------------------------------------
  const syncTokenRef = useRef('');
  const isConnectedRef = useRef(true);
  const sseConnectedRef = useRef(false);
  const hasCheckedBootPinRef = useRef(false);
  const unlockedProfilesRef = useRef(unlockedProfiles);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    unlockedProfilesRef.current = unlockedProfiles;
  }, [unlockedProfiles]);

  const sseProfile =
    activeProfileId === 'caregiver' || unlockedProfiles[activeProfileId]
      ? activeProfileId
      : 'caregiver';

  const fetchUnifiedSync = useCallback(
    async ({ force = false, overrideProfile = null } = {}) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const targetProfile = overrideProfile || activeProfileId;
        const needsBootPinCheck =
          !hasCheckedBootPinRef.current &&
          targetProfile !== 'caregiver' &&
          !unlockedProfilesRef.current[targetProfile];
        const queryProfile = needsBootPinCheck ? 'caregiver' : targetProfile;
        const sinceParam =
          !force && !needsBootPinCheck && syncTokenRef.current ? syncTokenRef.current : '';
        const url = `/api/howard/sync?profile=${encodeURIComponent(queryProfile)}${
          sinceParam ? `&since=${encodeURIComponent(sinceParam)}` : ''
        }`;

        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (controller.signal.aborted) return;

        // Fast path: server state unchanged since last syncToken -> zero React re-renders
        if (data.unchanged) {
          if (data.syncToken) syncTokenRef.current = data.syncToken;
          if (!isConnectedRef.current) {
            isConnectedRef.current = true;
            setIsConnected(true);
            setSyncError(null);
          }
          return;
        }

        if (needsBootPinCheck && Array.isArray(data.howard?.profiles)) {
          hasCheckedBootPinRef.current = true;
          const savedProf = data.howard.profiles.find((p) => p.id === targetProfile);
          if (savedProf && savedProf.pinEnabled && !unlockedProfilesRef.current[savedProf.id]) {
            // Apply safe caregiver-scoped snapshot without overwriting localStorage preference
            setProfiles(data.howard.profiles);
            if (Array.isArray(data.howard.almanacEvents)) setAlmanacEvents(data.howard.almanacEvents);
            if (data.howard.ledgerData) setLedgerData(data.howard.ledgerData);
            if (data.howard.beaconInfo) setBeaconInfo(data.howard.beaconInfo);
            if (data.cadence) {
              setCadenceSnapshot({
                settings: data.cadence.settings || {},
                logsByDate: data.cadence.logsByDate || {}
              });
            }
            if (data.bloom) {
              setBloomSnapshot({
                settings: data.bloom.settings || DEFAULT_BLOOM_SETTINGS,
                logsByDate: data.bloom.logsByDate || {},
                molts: data.bloom.molts || [],
                feeders: data.bloom.feeders || []
              });
            }
            setFloodgateSnapshot({
              settings: { ownerName: 'Partner 2', appName: 'Floodgate' },
              logsByDate: {}
            });
            setHasSavedProfile(false);
            setActiveProfileId('caregiver');
            setPinPromptTarget(savedProf);
            setProfileModalOpen(true);
            isConnectedRef.current = true;
            setIsConnected(true);
            setSyncError(null);
            setLastSyncedAt(new Date());
            return;
          }
          // Saved profile has no PIN: mark unlocked and sync directly as that profile
          unlockedProfilesRef.current = {
            ...unlockedProfilesRef.current,
            [targetProfile]: true
          };
          setUnlockedProfiles((prev) => ({ ...prev, [targetProfile]: true }));
          syncTokenRef.current = '';
          return await fetchUnifiedSync({ force: true, overrideProfile: targetProfile });
        }

        if (!hasCheckedBootPinRef.current) {
          hasCheckedBootPinRef.current = true;
        }

        if (data.syncToken) {
          syncTokenRef.current = data.syncToken;
        }

        if (data.dbInfo) {
          setDbInfo(data.dbInfo);
        }

        if (data.howard) {
          if (Array.isArray(data.howard.profiles)) {
            setProfiles(data.howard.profiles);
          }
          if (Array.isArray(data.howard.almanacEvents)) setAlmanacEvents(data.howard.almanacEvents);
          if (data.howard.ledgerData) setLedgerData(data.howard.ledgerData);
          if (data.howard.beaconInfo) setBeaconInfo(data.howard.beaconInfo);
        }

        if (data.cadence) {
          setCadenceSnapshot({
            settings: data.cadence.settings || {},
            logsByDate: data.cadence.logsByDate || {}
          });
        }

        if (data.bloom) {
          setBloomSnapshot({
            settings: data.bloom.settings || DEFAULT_BLOOM_SETTINGS,
            logsByDate: data.bloom.logsByDate || {},
            molts: data.bloom.molts || [],
            feeders: data.bloom.feeders || []
          });
        }

        if (targetProfile === 'partner2') {
          if (data.floodgate) {
            setFloodgateSnapshot({
              settings: data.floodgate.settings || {},
              logsByDate: data.floodgate.logsByDate || {}
            });
          }
        } else {
          // Clear private Floodgate state in memory when not on Partner 2's profile
          setFloodgateSnapshot((prev) => {
            if (
              Object.keys(prev.logsByDate || {}).length === 0 &&
              prev.settings?.ownerName === 'Partner 2'
            ) {
              return prev;
            }
            return {
              settings: { ownerName: 'Partner 2', appName: 'Floodgate' },
              logsByDate: {}
            };
          });
        }

        isConnectedRef.current = true;
        setIsConnected(true);
        setSyncError(null);
        setLastSyncedAt(new Date());
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.error('Howard live sync error:', err);
        if (isConnectedRef.current) {
          isConnectedRef.current = false;
          setIsConnected(false);
          setSyncError('Reconnecting to local Howard server...');
        }
      }
    },
    [activeProfileId]
  );

  useEffect(() => {
    syncTokenRef.current = '';
    fetchUnifiedSync({ force: true });

    let eventSource = null;
    let pollTimer = null;

    const schedulePollLoop = (intervalMs) => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchUnifiedSync();
        }
      }, intervalMs);
    };

    schedulePollLoop(POLL_INTERVAL_FALLBACK_MS);

    if (typeof EventSource !== 'undefined') {
      try {
        eventSource = new EventSource(
          `/api/howard/events?profile=${encodeURIComponent(sseProfile)}`
        );
        eventSource.addEventListener('ready', (ev) => {
          sseConnectedRef.current = true;
          setSyncTransport('sse');
          schedulePollLoop(POLL_INTERVAL_SSE_MS);
          try {
            const parsed = JSON.parse(ev.data || '{}');
            if (
              parsed.syncToken &&
              syncTokenRef.current &&
              parsed.syncToken !== syncTokenRef.current
            ) {
              fetchUnifiedSync();
            }
          } catch {
            // ignore parse error
          }
        });
        eventSource.addEventListener('sync', (ev) => {
          try {
            const parsed = JSON.parse(ev.data || '{}');
            if (parsed.syncToken && parsed.syncToken === syncTokenRef.current) {
              return;
            }
          } catch {
            // ignore parse error and still sync
          }
          fetchUnifiedSync();
        });
        eventSource.onerror = () => {
          if (sseConnectedRef.current) {
            sseConnectedRef.current = false;
            setSyncTransport('polling');
            schedulePollLoop(POLL_INTERVAL_FALLBACK_MS);
          }
        };
      } catch {
        sseConnectedRef.current = false;
        setSyncTransport('polling');
      }
    }

    const handleWake = () => {
      if (document.visibilityState === 'visible') {
        fetchUnifiedSync();
      }
    };

    window.addEventListener('focus', handleWake);
    document.addEventListener('visibilitychange', handleWake);

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      if (eventSource) eventSource.close();
      sseConnectedRef.current = false;
      window.removeEventListener('focus', handleWake);
      document.removeEventListener('visibilitychange', handleWake);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchUnifiedSync, sseProfile]);

  // --------------------------------------------------------------------------
  // PROFILE SWITCHING & PIN LOCK HANDLERS
  // --------------------------------------------------------------------------
  const handleSelectProfile = (targetProfile) => {
    let storedProfileId = null;
    try {
      storedProfileId = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    } catch {
      // ignore
    }

    if (
      targetProfile.id === activeProfileId &&
      hasSavedProfile &&
      storedProfileId === targetProfile.id
    ) {
      resetProfileSubforms();
      setProfileModalOpen(false);
      return;
    }

    // Caregiver mode or profiles without a PIN switch immediately
    if (!targetProfile.pinEnabled || targetProfile.id === 'caregiver') {
      setHasSavedProfile(true);
      try {
        localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, targetProfile.id);
      } catch {
        // ignore
      }
      unlockedProfilesRef.current = {
        ...unlockedProfilesRef.current,
        [targetProfile.id]: true
      };
      setUnlockedProfiles((prev) => ({ ...prev, [targetProfile.id]: true }));
      resetProfileSubforms();
      setActiveProfileId(targetProfile.id);
      setProfileModalOpen(false);
      showToast(`Switched to ${targetProfile.name} (${targetProfile.role})`);
      return;
    }

    // Otherwise open the PIN verification modal
    resetProfileSubforms();
    setPinPromptTarget(targetProfile);
  };

  const handleVerifyPinSubmit = async (e) => {
    e.preventDefault();
    if (!pinPromptTarget) return;
    try {
      const res = await fetch('/api/howard/profiles/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: pinPromptTarget.id,
          pin: pinInput
        })
      });
      const data = await res.json();
      if (!res.ok || !data.verified) {
        setPinPromptError(data.error || 'Incorrect PIN');
        return;
      }
      const unlockedName = pinPromptTarget.name;
      const unlockedId = pinPromptTarget.id;
      setHasSavedProfile(true);
      try {
        localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, unlockedId);
      } catch {
        // ignore
      }
      unlockedProfilesRef.current = {
        ...unlockedProfilesRef.current,
        [unlockedId]: true
      };
      setUnlockedProfiles((prev) => ({ ...prev, [unlockedId]: true }));
      setActiveProfileId(unlockedId);
      resetProfileSubforms();
      setProfileModalOpen(false);
      showToast(`Unlocked ${unlockedName}'s profile`);
    } catch {
      setPinPromptError('Could not verify PIN with server');
    }
  };

  const handleSavePinSettings = async (e, enablePin) => {
    e.preventDefault();
    setPinManageError('');

    if (enablePin) {
      if (!/^\d{4,8}$/.test(pinManageNew.trim())) {
        setPinManageError('Please enter a 4 to 8 digit numeric PIN.');
        return;
      }
      if (pinManageNew.trim() !== pinManageConfirm.trim()) {
        setPinManageError('New PIN and confirmation do not match.');
        return;
      }
    }

    try {
      const res = await fetch('/api/howard/profiles/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: activeProfile.id,
          currentPin: pinManageCurrent,
          newPin: enablePin ? pinManageNew.trim() : '',
          pinEnabled: enablePin
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setPinManageError(data.error || 'Could not update PIN');
        return;
      }
      if (Array.isArray(data.profiles)) {
        setProfiles(data.profiles);
      }
      if (enablePin) {
        setUnlockedProfiles((prev) => ({ ...prev, [activeProfile.id]: true }));
      }
      setPinManageOpen(false);
      setPinManageCurrent('');
      setPinManageNew('');
      setPinManageConfirm('');
      showToast(
        enablePin
          ? `PIN protection enabled for ${activeProfile.name}`
          : `PIN protection disabled for ${activeProfile.name}`
      );
    } catch {
      setPinManageError('Server error while saving PIN settings.');
    }
  };

  const handleSaveProfileName = async (e) => {
    e.preventDefault();
    const cleaned = renameDraft.trim();
    if (!cleaned) return;
    try {
      const res = await fetch('/api/howard/profiles/name', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: activeProfile.id,
          name: cleaned
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not update name', 'error');
        return;
      }
      if (Array.isArray(data.profiles)) {
        setProfiles(data.profiles);
      }
      setRenameOpen(false);
      fetchUnifiedSync();
      showToast(`Updated profile name to ${cleaned}`);
    } catch {
      showToast('Server error while updating profile name', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // SHARED API ACTIONS FOR FOYER / ALMANAC / LEDGER / BEACON
  // --------------------------------------------------------------------------
  const handleQuickRecordPetDose = async (slot, note = '') => {
    if (quickActionRef.current) return;
    quickActionRef.current = true;
    setQuickActionPending(true);
    const todayKey = getLocalDateKey(new Date());
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

    // Optimistic update (functional merge so sibling slots stay intact)
    setCadenceSnapshot((prev) => {
      const existingDay = prev.logsByDate?.[todayKey] || { dateKey: todayKey };
      return {
        ...prev,
        logsByDate: {
          ...prev.logsByDate,
          [todayKey]: {
            ...existingDay,
            dateKey: todayKey,
            [slot]: dosePayload,
            updatedAt: nowIso
          }
        }
      };
    });

    try {
      const res = await fetch(`/api/cadence/logs/${encodeURIComponent(todayKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [slot]: dosePayload, updatedAt: nowIso })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(
        `Logged ${cadenceSnapshot.settings?.catName || 'Pet'}'s ${slot === 'morning' ? 'Morning' : 'Evening'} dose (${caregiverName})`
      );
      fetchUnifiedSync();
    } catch {
      setCadenceSnapshot(prevCadence);
      fetchUnifiedSync({ force: true });
      showToast('Failed to save dose to server — reverted', 'error');
    } finally {
      quickActionRef.current = false;
      setQuickActionPending(false);
    }
  };

  const handleQuickMistMantis = async () => {
    if (quickActionRef.current) return;
    quickActionRef.current = true;
    setQuickActionPending(true);
    const todayKey = getLocalDateKey(new Date());
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
      const existingDay = prev.logsByDate?.[todayKey] || {
        dateKey: todayKey,
        mists: [],
        feedings: [],
        climateChecks: [],
        behaviors: []
      };
      return {
        ...prev,
        logsByDate: {
          ...prev.logsByDate,
          [todayKey]: {
            ...existingDay,
            dateKey: todayKey,
            mists: [...(existingDay.mists || []), newMist],
            updatedAt: nowIso
          }
        }
      };
    });

    try {
      const res = await fetch(`/api/bloom/logs/${encodeURIComponent(todayKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appendMist: newMist, updatedAt: nowIso })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(`Logged ${mantisName}'s enclosure mist (${caregiverName})`);
      fetchUnifiedSync();
    } catch {
      setBloomSnapshot(prevBloom);
      fetchUnifiedSync({ force: true });
      showToast('Failed to save mist log to server — reverted', 'error');
    } finally {
      quickActionRef.current = false;
      setQuickActionPending(false);
    }
  };

  const handleClearMantisLivePrey = async () => {
    if (quickActionRef.current) return;
    quickActionRef.current = true;
    setQuickActionPending(true);
    const mantisName = bloomSnapshot.settings?.mantisName || 'Mantis';
    const prevBloom = bloomSnapshot;
    setBloomSnapshot((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        livePreyInside: false,
        livePreyNote: '',
        livePreyByProfileId: null,
        livePreyAt: null
      }
    }));
    try {
      const res = await fetch('/api/bloom/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          livePreyInside: false,
          livePreyNote: '',
          livePreyByProfileId: null,
          livePreyAt: null
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(`Marked ${mantisName}'s enclosure clear of live prey`);
      fetchUnifiedSync();
    } catch {
      setBloomSnapshot(prevBloom);
      fetchUnifiedSync({ force: true });
      showToast('Failed to update Bloom enclosure status — reverted', 'error');
    } finally {
      quickActionRef.current = false;
      setQuickActionPending(false);
    }
  };

  const handleMutateAlmanacEvents = async (
    { nextEvents, upserts = [], deleteIds = [] },
    toastText = 'Updated Almanac calendar'
  ) => {
    const prevEvents = almanacEvents;
    if (Array.isArray(nextEvents)) {
      setAlmanacEvents(nextEvents);
    }
    try {
      const res = await fetch('/api/howard/almanac/events/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upserts, deleteIds })
      });
      if (!res.ok) throw new Error('Failed to save Almanac event');
      if (toastText) showToast(toastText);
      fetchUnifiedSync();
      return true;
    } catch {
      setAlmanacEvents(prevEvents);
      fetchUnifiedSync({ force: true });
      showToast('Could not save calendar event — reverted', 'error');
      return false;
    }
  };

  const handleSaveAlmanacEvents = async (nextEvents, toastText = 'Updated Almanac calendar') => {
    const prevEvents = almanacEvents;
    setAlmanacEvents(nextEvents);
    try {
      const res = await fetch('/api/howard/almanac', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: nextEvents })
      });
      if (!res.ok) throw new Error('Failed to save Almanac events');
      if (toastText) showToast(toastText);
      fetchUnifiedSync();
      return true;
    } catch {
      setAlmanacEvents(prevEvents);
      fetchUnifiedSync({ force: true });
      showToast('Could not save calendar event — reverted', 'error');
      return false;
    }
  };

  const handleUpsertLedgerItem = async (
    { kind, record, nextLedgerData },
    toastText = 'Updated Ledger bookkeeping'
  ) => {
    const prevLedger = ledgerData;
    if (nextLedgerData) setLedgerData(nextLedgerData);
    try {
      const res = await fetch(`/api/howard/ledger/items/${encodeURIComponent(record.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, item: record })
      });
      if (!res.ok) throw new Error('Failed to save Ledger item');
      if (toastText) showToast(toastText);
      fetchUnifiedSync();
      return true;
    } catch {
      setLedgerData(prevLedger);
      fetchUnifiedSync({ force: true });
      showToast('Could not save Ledger item — reverted', 'error');
      return false;
    }
  };

  const handleDeleteLedgerItem = async (
    { id, nextLedgerData },
    toastText = 'Removed Ledger item'
  ) => {
    const prevLedger = ledgerData;
    if (nextLedgerData) setLedgerData(nextLedgerData);
    try {
      const res = await fetch(`/api/howard/ledger/items/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete Ledger item');
      if (toastText) showToast(toastText);
      fetchUnifiedSync();
      return true;
    } catch {
      setLedgerData(prevLedger);
      fetchUnifiedSync({ force: true });
      showToast('Could not delete Ledger item — reverted', 'error');
      return false;
    }
  };

  const handleSaveLedgerSplitRule = async (
    { splitRule, nextLedgerData },
    toastText = 'Updated split rule'
  ) => {
    const prevLedger = ledgerData;
    if (nextLedgerData) setLedgerData(nextLedgerData);
    try {
      const res = await fetch('/api/howard/ledger/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splitRule })
      });
      if (!res.ok) throw new Error('Failed to save split rule');
      if (toastText) showToast(toastText);
      fetchUnifiedSync();
      return true;
    } catch {
      setLedgerData(prevLedger);
      fetchUnifiedSync({ force: true });
      showToast('Could not save Ledger split rule — reverted', 'error');
      return false;
    }
  };

  const handleSaveLedgerData = async (nextLedgerData, toastText = 'Updated Ledger bookkeeping') => {
    const prevLedger = ledgerData;
    setLedgerData(nextLedgerData);
    try {
      const res = await fetch('/api/howard/ledger', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledgerData: nextLedgerData })
      });
      if (!res.ok) throw new Error('Failed to save Ledger data');
      if (toastText) showToast(toastText);
      fetchUnifiedSync();
      return true;
    } catch {
      setLedgerData(prevLedger);
      fetchUnifiedSync({ force: true });
      showToast('Could not save Ledger bookkeeping — reverted', 'error');
      return false;
    }
  };

  const handleSaveBeaconInfo = async (nextBeacon, toastText = 'Updated Beacon house guide') => {
    const prevBeacon = beaconInfo;
    setBeaconInfo(nextBeacon);
    try {
      const res = await fetch('/api/howard/beacon', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beaconInfo: nextBeacon })
      });
      if (!res.ok) throw new Error('Failed to save Beacon guide');
      if (toastText) showToast(toastText);
      fetchUnifiedSync();
      return true;
    } catch {
      setBeaconInfo(prevBeacon);
      fetchUnifiedSync({ force: true });
      showToast('Could not save Beacon guide — reverted', 'error');
      return false;
    }
  };

  // Cross-app navigation helpers
  const openFloodgateWithIntent = (intent = { tab: 'log', date: null }) => {
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
  };

  const openBloomWithIntent = (intent = { tab: 'today' }) => {
    setAlmanacIntentDate(null);
    setFloodgateIntent(null);
    setBloomIntent({ ...intent, timestamp: Date.now() });
    setActiveAppId('bloom');
    setAppLauncherOpen(false);
    scrollTopSafe();
  };

  const openAlmanacOnDate = (dateStr) => {
    setBloomIntent(null);
    setFloodgateIntent(null);
    setAlmanacIntentDate(dateStr);
    setActiveAppId('almanac');
    setAppLauncherOpen(false);
    scrollTopSafe();
  };

  // --------------------------------------------------------------------------
  // UNIFIED HOUSEHOLD BACKUP & RESTORE
  // --------------------------------------------------------------------------
  const handleDownloadFullBackup = async () => {
    if (activeProfile.id === 'caregiver') return;
    try {
      const res = await fetch(
        `/api/howard/backup?profile=${encodeURIComponent(activeProfile.id)}`
      );
      if (!res.ok) throw new Error('Backup failed');
      const payload = await res.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const todayKey = getLocalDateKey(new Date());
      a.href = url;
      a.download = `Howard_Household_Backup_${todayKey}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Downloaded full Howard database backup (incl. Floodgate)');
    } catch {
      showToast('Could not export household backup', 'error');
    }
  };

  const handleRestoreFullBackup = (e) => {
    if (activeProfile.id !== 'partner1') {
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        let parsed;
        try {
          parsed = JSON.parse(ev.target.result);
        } catch {
          showToast('Invalid JSON syntax in backup file', 'error');
          return;
        }

        let bodyToSend = null;
        let confirmPrompt = '';

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          if (parsed.app === 'Floodgate' && parsed.logs && typeof parsed.logs === 'object') {
            bodyToSend = {
              mode: 'merge',
              floodgate: {
                logsByDate: parsed.logs,
                settings: { ownerName: parsed.owner || 'Partner 2' }
              }
            };
            confirmPrompt =
              'Merge this standalone Floodgate backup into your current Floodgate logs?';
          } else if (
            !parsed.howard &&
            (Array.isArray(parsed.molts) ||
              Array.isArray(parsed.feeders) ||
              parsed.settings?.mantisName !== undefined) &&
            ((parsed.settings && typeof parsed.settings === 'object') ||
              (parsed.logsByDate && typeof parsed.logsByDate === 'object') ||
              Array.isArray(parsed.molts) ||
              Array.isArray(parsed.feeders))
          ) {
            bodyToSend = {
              mode: 'merge',
              bloom: {
                ...(parsed.settings ? { settings: parsed.settings } : {}),
                ...(parsed.logsByDate ? { logsByDate: parsed.logsByDate } : {}),
                ...(Array.isArray(parsed.molts) ? { molts: parsed.molts } : {}),
                ...(Array.isArray(parsed.feeders) ? { feeders: parsed.feeders } : {})
              }
            };
            confirmPrompt =
              'Merge this standalone Bloom backup into your current Bloom care logs, molts & feeders?';
          } else if (
            !parsed.howard &&
            parsed.settings &&
            parsed.logsByDate &&
            typeof parsed.logsByDate === 'object'
          ) {
            bodyToSend = {
              mode: 'merge',
              cadence: {
                settings: parsed.settings,
                logsByDate: parsed.logsByDate
              }
            };
            confirmPrompt =
              'Merge this standalone Cadence backup into your current Cadence settings & logs?';
          } else if (
            (parsed.howard && typeof parsed.howard === 'object') ||
            (parsed.cadence && typeof parsed.cadence === 'object') ||
            (parsed.bloom && typeof parsed.bloom === 'object') ||
            (parsed.floodgate && typeof parsed.floodgate === 'object')
          ) {
            bodyToSend = { ...parsed, mode: 'replace' };
            confirmPrompt =
              'Restore this full Howard backup? Existing records in included modules will be replaced atomically (a pre-restore safety snapshot is saved automatically).';
          }
        }

        if (!bodyToSend) {
          showToast(
            'Backup file does not contain recognized Howard, Cadence, Bloom, or Floodgate data',
            'error'
          );
          return;
        }

        setPendingRestore({
          bodyToSend,
          confirmPrompt,
          fileName: file.name
        });
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore || isRestoringBackup || activeProfile.id !== 'partner1') return;
    const { bodyToSend } = pendingRestore;
    setIsRestoringBackup(true);
    try {
      const res = await fetch(
        `/api/howard/restore?profile=${encodeURIComponent(activeProfile.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyToSend)
        }
      );
      const resultData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resultData.error || `Server rejected restore (HTTP ${res.status})`);
      }
      await fetchUnifiedSync({ force: true });
      setPendingRestore(null);
      setBackupModalOpen(false);
      showToast(
        bodyToSend.mode === 'merge'
          ? 'Merged standalone backup successfully (pre-restore snapshot saved)!'
          : 'Restored household backup successfully (pre-restore snapshot saved)!'
      );
    } catch (err) {
      showToast(err?.message || 'Restore failed on server', 'error');
    } finally {
      setIsRestoringBackup(false);
    }
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-200 ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
      }`}
    >
      {/* FLOATING TOAST */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-[max(1rem,env(safe-area-inset-top))] right-4 max-w-[calc(100vw-2rem)] z-[70] no-print animate-fade-in"
        >
          <button
            type="button"
            onClick={() => setToast(null)}
            title="Dismiss notification"
            className={`w-full text-left flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs sm:text-sm font-semibold cursor-pointer ${
              toast.type === 'error'
                ? 'bg-rose-900 text-white border-rose-700'
                : toast.type === 'info'
                  ? 'bg-amber-900 text-amber-50 border-amber-700'
                  : 'bg-slate-900 text-white border-slate-700 dark:bg-slate-800'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
            ) : toast.type === 'info' ? (
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            )}
            <span className="min-w-0 break-words">{toast.text}</span>
          </button>
        </div>
      )}

      {/* ====================================================================
          HOWARD MASTER TOP NAVIGATION BAR (HIDDEN WHEN PRINTING GP REPORT)
      ==================================================================== */}
      <header
        className={`sticky top-0 z-40 w-full overflow-x-clip border-b backdrop-blur-md no-print ${
          darkMode
            ? 'bg-slate-900/90 border-slate-800'
            : 'bg-white/90 border-slate-200/90'
        }`}
      >
        <div className="w-full px-2.5 sm:px-4 lg:px-6 h-16 flex items-center justify-between gap-1.5 sm:gap-2">
          {/* Brand Logo + Live Sync Status */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleNavigateModule('foyer')}
              className="flex items-center gap-1.5 sm:gap-2 lg:gap-2.5 text-left group cursor-pointer shrink-0"
              title="Return to Foyer (Daily Briefing)"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-900 to-teal-700 dark:from-teal-600 dark:to-cyan-700 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition shrink-0">
                <Home className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <span className="font-extrabold text-sm min-[360px]:text-base lg:text-lg tracking-tight leading-none whitespace-nowrap">
                    Howard
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-1 sm:px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                      isConnected
                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                        : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                    }`}
                    title={
                      lastSyncedAt
                        ? `Live Household Sync (${syncTransport === 'sse' ? 'Instant SSE Push' : 'Polling Fallback'}) • Last synced ${lastSyncedAt.toLocaleTimeString()}`
                        : 'Connecting to local SQLite server'
                    }
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                      }`}
                    />
                    <span className="hidden sm:inline">{isConnected ? 'Live' : 'Sync'}</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block truncate">
                  Household Suite
                </p>
              </div>
            </button>
          </div>

          {/* Center Tablet & Desktop Bento Quick-Jump Trigger (Ctrl+K) */}
          <div className="hidden md:flex items-center justify-center flex-1 max-w-xs lg:max-w-sm mx-2">
            <button
              type="button"
              onClick={() => setAppLauncherOpen(true)}
              className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-2xl border text-xs font-semibold transition cursor-pointer ${
                darkMode
                  ? 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800'
                  : 'bg-slate-100/90 border-slate-200 text-slate-600 hover:bg-slate-200/70'
              }`}
              title={`Open Bento Module Switcher (${QUICK_JUMP_SHORTCUT})`}
            >
              <span className="flex items-center gap-2 min-w-0 truncate">
                <LayoutGrid className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                <span className="truncate">
                  Jump to module...{' '}
                  <span className="text-slate-500 dark:text-slate-400 font-normal">
                    ({activeAppMeta.name})
                  </span>
                </span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {urgentModuleCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500/20 text-amber-800 dark:text-amber-300">
                    {urgentModuleCount}
                  </span>
                )}
                <kbd
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold border ${
                    darkMode
                      ? 'bg-slate-900 border-slate-700 text-slate-300'
                      : 'bg-white border-slate-300 text-slate-600'
                  }`}
                >
                  {QUICK_JUMP_SHORTCUT}
                </kbd>
              </div>
            </button>
          </div>

          {/* Right Controls: Profile Switcher, Backups & Theme Toggle */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Active Profile Pill (Opens Switcher / PIN Modal) */}
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className={`min-h-[40px] flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                activeProfile.id === 'partner2'
                  ? darkMode
                    ? 'bg-rose-950/60 border-rose-800 text-rose-200 hover:bg-rose-900/60'
                    : 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'
                  : activeProfile.id === 'partner1'
                    ? darkMode
                      ? 'bg-teal-950/60 border-teal-800 text-teal-200 hover:bg-teal-900/60'
                      : 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100'
                    : darkMode
                      ? 'bg-amber-950/60 border-amber-800 text-amber-200 hover:bg-amber-900/60'
                      : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
              }`}
              title="Switch Household Profile or Configure PIN"
            >
              <span>{activeProfile.badgeEmoji}</span>
              <span className="max-w-[52px] min-[375px]:max-w-[88px] sm:max-w-[140px] truncate">{activeProfile.name}</span>
              {activeProfile.pinEnabled && (
                <Lock className="w-3 h-3 text-current shrink-0" />
              )}
            </button>

            {/* Household Backup Button (Hidden in Caregiver mode) */}
            {activeProfile.id !== 'caregiver' && (
              <button
                type="button"
                onClick={() => setBackupModalOpen(true)}
                className={`min-w-[40px] min-h-[40px] flex items-center justify-center p-2 sm:p-2.5 rounded-xl border transition cursor-pointer ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
                title="Household Backups & SQLite Status"
                aria-label="Household Backups & SQLite Status"
              >
                <Database className="w-4 h-4" />
              </button>
            )}

            {/* Theme Toggle: Warm Beige <-> Dark */}
            <button
              type="button"
              onClick={cycleThemeMode}
              className={`min-w-[40px] min-h-[40px] px-2 sm:px-2.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                themeMode === 'dark'
                  ? 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700'
                  : 'bg-[#E9DFC8] border-[#D5C7A9] text-[#4A3B2C] hover:bg-[#DFD3B8]'
              }`}
              title={
                themeMode === 'warm'
                  ? 'Theme: Warm (Click for Dark)'
                  : 'Theme: Dark (Click for Warm)'
              }
              aria-label={
                themeMode === 'warm'
                  ? 'Theme: Warm (Click for Dark)'
                  : 'Theme: Dark (Click for Warm)'
              }
            >
              {themeMode === 'warm' ? (
                <Coffee className="w-4 h-4 text-amber-800" />
              ) : (
                <Moon className="w-4 h-4 text-amber-300" />
              )}
              <span className="hidden xl:inline capitalize">{themeMode}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ====================================================================
          RESPONSIVE SHELL: TABLET/DESKTOP LEFT RAIL + MODULE VIEWPORT
      ==================================================================== */}
      <div className="flex min-h-[calc(100dvh-4rem)] print-block">
        {/* Tablet Slim Icon Rail (md) & Collapsible Desktop Sidebar (lg) */}
        <aside
          aria-label="Howard Module Navigation"
          className={`howard-rail hidden md:flex flex-col shrink-0 sticky top-16 h-[calc(100dvh-4rem)] border-r backdrop-blur-md overflow-y-auto py-3 px-2 gap-1.5 transition-[width] duration-200 no-print w-[88px] ${
            sidebarCollapsed ? 'lg:w-[88px]' : 'lg:w-52 xl:w-60'
          } ${
            darkMode
              ? 'bg-slate-900/90 border-slate-800'
              : 'bg-white/90 border-slate-200/90'
          }`}
        >
          {/* Desktop Expand / Collapse Sidebar Header */}
          <div
            className={`hidden lg:flex items-center px-2 pb-1.5 mb-1 border-b border-slate-200/70 dark:border-slate-800 ${
              sidebarCollapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            {!sidebarCollapsed && (
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Modules ({allowedApps.length})
              </span>
            )}
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className={`min-w-[36px] min-h-[36px] flex items-center justify-center p-1.5 rounded-xl border transition cursor-pointer ${
                darkMode
                  ? 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
              title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar to Icon Rail'}
              aria-label={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar to Icon Rail'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>

          {allowedApps.map((appItem) => {
            const Icon = appItem.icon;
            const isActive = activeAppId === appItem.id;
            const statusInfo = moduleStatuses[appItem.id];

            return (
              <button
                key={appItem.id}
                type="button"
                onClick={() => handleNavigateModule(appItem.id)}
                aria-current={isActive ? 'page' : undefined}
                title={`${appItem.name} • ${appItem.subtitle}${
                  statusInfo?.label ? ` (${statusInfo.label})` : ''
                }`}
                className={`relative w-full rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-1 py-2.5 px-1 text-[11px] font-bold ${
                  !sidebarCollapsed
                    ? 'lg:flex-row lg:justify-start lg:gap-2.5 lg:px-3 lg:py-2.5 lg:text-xs'
                    : ''
                } ${
                  isActive
                    ? `${appItem.accent} shadow-sm`
                    : darkMode
                      ? 'text-slate-300 hover:bg-slate-800/80'
                      : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="truncate max-w-full">{appItem.name}</span>

                {/* Desktop Expanded Status Chip */}
                {!sidebarCollapsed && statusInfo?.label && appItem.id !== 'foyer' && (
                  <span
                    className={`hidden lg:inline-flex ml-auto px-2 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : statusInfo.urgent
                          ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                          : darkMode
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-slate-200/70 text-slate-700'
                    }`}
                  >
                    {statusInfo.label}
                  </span>
                )}

                {/* Slim Rail Urgent Indicator Dot (Tablet & Collapsed Desktop) */}
                {statusInfo?.urgent && !isActive && (
                  <span
                    className={`absolute top-2 right-2.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ${
                      darkMode ? 'ring-slate-900' : 'ring-white'
                    } ${!sidebarCollapsed ? 'lg:hidden' : ''}`}
                  />
                )}
              </button>
            );
          })}
        </aside>

        {/* Active Module Viewport */}
        <div className="flex-1 min-w-0 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-8">
          {!isConnected && syncError && (
            <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-3 no-print">
              <div className="rounded-2xl px-4 py-2.5 border bg-amber-500/15 border-amber-500/40 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{syncError}</span>
                </span>
                <button
                  type="button"
                  onClick={() => fetchUnifiedSync({ force: true })}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 cursor-pointer shrink-0 transition"
                >
                  Retry Now
                </button>
              </div>
            </div>
          )}

          <ErrorBoundary darkMode={darkMode} appName={activeAppMeta.name} resetKey={activeAppId}>
            <Suspense
              fallback={
                <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-4" aria-busy="true">
                  <div
                    className={`rounded-2xl sm:rounded-3xl p-6 border shadow-xs text-xs font-semibold flex items-center gap-3 ${
                      darkMode
                        ? 'bg-slate-900 border-slate-800 text-slate-300'
                        : 'bg-white border-slate-200/90 text-slate-500'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse" />
                    <span>Loading {activeAppMeta.name}...</span>
                  </div>
                </div>
              }
            >
              {activeAppId === 'foyer' && (
                <FoyerApp
                  activeProfile={activeProfile}
                  profiles={profiles}
                  darkMode={darkMode}
                  nowMs={nowMs}
                  cadenceSnapshot={cadenceSnapshot}
                  bloomSnapshot={bloomSnapshot}
                  bloomSummary={bloomSummary}
                  floodgateSnapshot={floodgateSnapshot}
                  almanacEvents={almanacEvents}
                  ledgerData={ledgerData}
                  beaconInfo={beaconInfo}
                  onNavigateApp={handleNavigateModule}
                  onQuickRecordDose={handleQuickRecordPetDose}
                  onQuickMistMantis={handleQuickMistMantis}
                  onClearMantisLivePrey={handleClearMantisLivePrey}
                  onOpenFloodgate={openFloodgateWithIntent}
                  onOpenBloom={openBloomWithIntent}
                  onOpenAlmanacDate={openAlmanacOnDate}
                  onOpenProfileModal={() => setProfileModalOpen(true)}
                  quickActionPending={quickActionPending}
                />
              )}

              {activeAppId === 'cadence' && (
                <CadenceApp
                  activeProfile={activeProfile}
                  darkMode={darkMode}
                  nowMs={nowMs}
                  cadenceSnapshot={cadenceSnapshot}
                  onGlobalSync={fetchUnifiedSync}
                  showToast={showToast}
                />
              )}

              {activeAppId === 'bloom' && (
                <BloomApp
                  activeProfile={activeProfile}
                  darkMode={darkMode}
                  nowMs={nowMs}
                  bloomSnapshot={bloomSnapshot}
                  bloomSummary={bloomSummary}
                  navigationIntent={bloomIntent}
                  onGlobalSync={fetchUnifiedSync}
                  showToast={showToast}
                />
              )}

              {activeAppId === 'almanac' && activeProfile.allowedApps.includes('almanac') && (
                <AlmanacApp
                  activeProfile={activeProfile}
                  profiles={profiles}
                  darkMode={darkMode}
                  nowMs={nowMs}
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
                />
              )}

              {activeAppId === 'floodgate' && activeProfile.allowedApps.includes('floodgate') && (
                <FloodgateApp
                  activeProfile={activeProfile}
                  darkMode={darkMode}
                  nowMs={nowMs}
                  floodgateSnapshot={floodgateSnapshot}
                  navigationIntent={floodgateIntent}
                  onOpenBackupModal={() => setBackupModalOpen(true)}
                  onGlobalSync={fetchUnifiedSync}
                  showToast={showToast}
                />
              )}

              {activeAppId === 'ledger' && activeProfile.allowedApps.includes('ledger') && (
                <LedgerApp
                  activeProfile={activeProfile}
                  profiles={profiles}
                  darkMode={darkMode}
                  nowMs={nowMs}
                  ledgerData={ledgerData}
                  onUpsertLedgerItem={handleUpsertLedgerItem}
                  onDeleteLedgerItem={handleDeleteLedgerItem}
                  onSaveSplitRule={handleSaveLedgerSplitRule}
                  onSaveLedgerData={handleSaveLedgerData}
                  showToast={showToast}
                />
              )}

              {activeAppId === 'beacon' && (
                <BeaconApp
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

      {/* ====================================================================
          OPTION A: MOBILE FLOATING SPLIT CAPSULE [ Foyer | Apps ]
      ==================================================================== */}
      <nav
        aria-label="Mobile Floating App Launcher"
        className="md:hidden fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 pointer-events-none no-print"
      >
        <div
          className={`howard-floating-pill pointer-events-auto inline-flex items-center gap-1.5 p-1.5 rounded-full border backdrop-blur-xl ${
            darkMode
              ? 'bg-slate-900/90 border-slate-700 text-slate-100'
              : 'bg-white/90 border-slate-300 text-slate-800'
          }`}
        >
          {/* Left Half: Always 1-Tap Home to Foyer */}
          <button
            type="button"
            onClick={() => handleNavigateModule('foyer')}
            className={`min-h-[40px] flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-extrabold transition-all cursor-pointer active:scale-95 ${
              activeAppId === 'foyer'
                ? 'bg-teal-700 text-white shadow-sm'
                : darkMode
                  ? 'text-slate-200 hover:bg-slate-800'
                  : 'text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            <Home className="w-4 h-4 shrink-0" />
            <span>Foyer</span>
          </button>

          <div
            className={`w-px h-5 ${
              darkMode ? 'bg-slate-700' : 'bg-slate-300'
            }`}
          />

          {/* Right Half: Opens Bento Sheet (Highlights Current Non-Foyer App When Active) */}
          <button
            type="button"
            onClick={() => setAppLauncherOpen((prev) => !prev)}
            aria-expanded={appLauncherOpen}
            className={`min-h-[40px] flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-extrabold transition-all cursor-pointer active:scale-95 ${
              activeAppId !== 'foyer'
                ? `${activeAppMeta.accent} shadow-sm`
                : darkMode
                  ? 'text-slate-100 hover:bg-slate-800'
                  : 'text-slate-800 hover:bg-slate-200/70'
            }`}
          >
            {activeAppId === 'foyer' ? (
              <LayoutGrid className="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-400" />
            ) : (
              (() => {
                const ActiveIcon = activeAppMeta.icon;
                return <ActiveIcon className="w-4 h-4 shrink-0" />;
              })()
            )}
            <span>{activeAppId === 'foyer' ? 'Apps' : activeAppMeta.name}</span>
            {activeAppId !== 'foyer' && (
              <ChevronUp
                className={`w-3.5 h-3.5 transition-transform ${
                  appLauncherOpen ? 'rotate-180' : ''
                }`}
              />
            )}
            {urgentModuleCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] font-extrabold leading-none ${
                  activeAppId !== 'foyer'
                    ? 'bg-black/20 text-white'
                    : 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                }`}
              >
                {urgentModuleCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* ====================================================================
          BENTO MODULE SWITCHER (BOTTOM SHEET ON MOBILE / DIALOG ON DESKTOP)
      ==================================================================== */}
      <ModalShell
        isOpen={appLauncherOpen}
        onClose={() => setAppLauncherOpen(false)}
        variant="sheet"
        title={`Household Modules (${allowedApps.length})`}
        subtitle={`${activeProfile.badgeEmoji} ${activeProfile.name} • Tap any module to switch`}
        icon={LayoutGrid}
        accent="teal"
        darkMode={darkMode}
        maxWidthClass="max-w-lg"
        ariaLabel="Howard Modules"
      >
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {allowedApps.map((appItem) => {
            const Icon = appItem.icon;
            const isCurrent = activeAppId === appItem.id;
            const statusInfo = moduleStatuses[appItem.id];

            return (
              <button
                key={appItem.id}
                type="button"
                onClick={() => handleNavigateModule(appItem.id)}
                className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2.5 sm:gap-3 cursor-pointer active:scale-[0.99] min-w-0 overflow-hidden ${
                  isCurrent
                    ? `${appItem.activeCardClass} ${
                        darkMode ? 'bg-slate-800/90' : 'bg-slate-50/90'
                      }`
                    : darkMode
                      ? 'bg-slate-800/50 border-slate-700/80 hover:bg-slate-800'
                      : 'bg-slate-50/80 border-slate-200/90 hover:bg-slate-100/80'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5 w-full min-w-0">
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-xs shrink-0 ${appItem.accent}`}
                  >
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold max-w-full truncate ${
                      isCurrent
                        ? `${appItem.accent}`
                        : statusInfo?.urgent
                          ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                          : darkMode
                            ? 'bg-slate-900/70 text-slate-300'
                            : 'bg-white text-slate-700 border border-slate-200/70'
                    }`}
                  >
                    {isCurrent ? '● Active' : statusInfo?.label || 'Open'}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="font-extrabold text-sm leading-tight truncate">
                    {appItem.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {appItem.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ModalShell>

      {/* ====================================================================
          MODAL 1: PROFILE SWITCHER & PIN SECURITY SETTINGS
      ==================================================================== */}
      <ModalShell
        isOpen={profileModalOpen}
        onClose={() => {
          setProfileModalOpen(false);
          resetProfileSubforms();
        }}
        title="Who's Using Howard?"
        subtitle="Switch household profile or enter Caregiver mode"
        icon={UserCheck}
        accent="teal"
        darkMode={darkMode}
        maxWidthClass="max-w-md"
        ariaLabel="Switch Household Profile"
      >
        {/* If entering a PIN to unlock target profile */}
        {pinPromptTarget ? (
          <form onSubmit={handleVerifyPinSubmit} className="space-y-4">
            <div
              className={`p-4 rounded-2xl border ${
                darkMode ? 'bg-slate-800/70 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-bold mb-1">
                <span>{pinPromptTarget.badgeEmoji}</span>
                <span>Unlock {pinPromptTarget.name}&apos;s Profile</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enter {pinPromptTarget.name}&apos;s PIN to access personal apps.
              </p>
            </div>

            <div>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value.replace(/\D/g, ''));
                  setPinPromptError('');
                }}
                placeholder="Enter numeric PIN..."
                maxLength={8}
                className={getFieldClass('teal', 'text-center text-lg font-mono tracking-widest py-3')}
              />
              {pinPromptError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-1.5 text-center">
                  {pinPromptError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPinPromptTarget(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                Back
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white transition active:scale-[0.98]"
              >
                Unlock Profile
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Profile Selector List */}
            <div className="space-y-2.5">
              {profiles.map((prof) => {
                const isCurrent = hasSavedProfile && prof.id === activeProfile.id;
                const appNames = APP_REGISTRY.filter((a) =>
                  (prof.allowedApps || []).includes(a.id)
                )
                  .map((a) => a.name)
                  .join(', ');

                return (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => handleSelectProfile(prof)}
                    className={`w-full p-3 sm:p-3.5 rounded-2xl border text-left transition flex items-start sm:items-center justify-between gap-2.5 sm:gap-3 cursor-pointer ${
                      isCurrent
                        ? 'ring-2 ring-teal-500 border-teal-500 bg-teal-500/10'
                        : darkMode
                          ? 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800'
                          : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-lg shrink-0">
                        {prof.badgeEmoji}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="font-bold text-sm leading-snug">{prof.name}</span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200 sm:whitespace-nowrap leading-tight max-w-full">
                            {prof.role}
                          </span>
                          {isCurrent && (
                            <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-teal-700 text-white whitespace-nowrap shrink-0">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          Apps: {appNames}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5 sm:pt-0">
                      {prof.id === 'caregiver' ? (
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <Unlock className="w-3.5 h-3.5" /> Unlocked
                        </span>
                      ) : prof.pinEnabled ? (
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <Lock className="w-3.5 h-3.5" /> PIN
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">No PIN</span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Display Name & PIN Configuration Section for Active Profile */}
            {activeProfile.id !== 'caregiver' && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                {/* 1. Customize Display Name */}
                {!renameOpen ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <span>{activeProfile.badgeEmoji}</span>
                      <span>
                        Display Name: <strong>{activeProfile.name}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRenameDraft(activeProfile.name);
                        setRenameOpen(true);
                      }}
                      className="min-h-[36px] px-2 text-xs font-bold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                    >
                      Change Name
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSaveProfileName}
                    className={`p-3 rounded-2xl border flex flex-wrap sm:flex-nowrap items-center gap-2 ${
                      darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <input
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      placeholder="Enter display name..."
                      maxLength={24}
                      autoFocus
                      className={getFieldClass('teal', 'flex-1 min-w-0 font-bold py-2')}
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setRenameOpen(false)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer transition active:scale-[0.98]"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                )}

                {/* 2. PIN Lock Settings */}
                {!pinManageOpen ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                      <span>
                        {activeProfile.name}&apos;s PIN Lock:{' '}
                        <strong>{activeProfile.pinEnabled ? 'Enabled' : 'Disabled'}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPinManageOpen(true);
                        setPinManageError('');
                      }}
                      className="min-h-[40px] px-2 text-xs font-bold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                    >
                      {activeProfile.pinEnabled ? 'Change / Disable PIN' : 'Set a PIN'}
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => handleSavePinSettings(e, true)}
                    className={`p-3.5 rounded-2xl border space-y-3 ${
                      darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">
                        Configure PIN for {activeProfile.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPinManageOpen(false)}
                        className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                      >
                        Cancel
                      </button>
                    </div>

                    {activeProfile.pinEnabled && (
                      <input
                        type="password"
                        inputMode="numeric"
                        value={pinManageCurrent}
                        onChange={(e) => setPinManageCurrent(e.target.value.replace(/\D/g, ''))}
                        placeholder="Current PIN"
                        maxLength={8}
                        className={getFieldClass('teal')}
                      />
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="password"
                        inputMode="numeric"
                        value={pinManageNew}
                        onChange={(e) => setPinManageNew(e.target.value.replace(/\D/g, ''))}
                        placeholder="New PIN (4-8 digits)"
                        maxLength={8}
                        className={getFieldClass('teal')}
                      />
                      <input
                        type="password"
                        inputMode="numeric"
                        value={pinManageConfirm}
                        onChange={(e) => setPinManageConfirm(e.target.value.replace(/\D/g, ''))}
                        placeholder="Confirm New PIN"
                        maxLength={8}
                        className={getFieldClass('teal')}
                      />
                    </div>

                    {pinManageError && (
                      <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                        {pinManageError}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      {activeProfile.pinEnabled ? (
                        <button
                          type="button"
                          onClick={(e) => handleSavePinSettings(e, false)}
                          className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition"
                        >
                          Disable PIN
                        </button>
                      ) : (
                        <div />
                      )}
                      <button
                        type="submit"
                        className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-teal-700 text-white hover:bg-teal-800 transition active:scale-[0.98]"
                      >
                        Save PIN
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </ModalShell>

      {/* ====================================================================
          MODAL 2: UNIFIED HOUSEHOLD BACKUP & DATABASE STATUS ("BACKSTAGE")
      ==================================================================== */}
      <ModalShell
        isOpen={backupModalOpen}
        onClose={() => setBackupModalOpen(false)}
        title="Howard Household Backstage"
        subtitle="Unified SQLite database & household backup tools"
        icon={Database}
        accent="emerald"
        darkMode={darkMode}
        maxWidthClass="max-w-lg"
        ariaLabel="Howard Household Backstage"
      >
        <div
          className={`p-4 rounded-2xl border text-xs space-y-2.5 ${
            darkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">Live Household Sync:</span>
            <span
              className={`${
                isConnected
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              } font-bold flex items-center gap-1`}
            >
              <Wifi className="w-3.5 h-3.5" />{' '}
              {syncTransport === 'sse'
                ? `SSE Push (${isConnected ? 'Connected' : 'Reconnecting'})`
                : `Polling Fallback 3s (${isConnected ? 'Connected' : 'Offline'})`}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">Unified SQLite DB:</span>
            <code className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 font-mono break-all sm:break-normal">
              {dbInfo.file} ({dbInfo.journalMode} &bull; Schema v{dbInfo.schemaVersion})
            </code>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">Almanac &amp; Ledger:</span>
            <code className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 font-mono break-all sm:break-normal">
              {almanacEvents.length} events, {(ledgerData?.recurring || []).length} bills,{' '}
              {(ledgerData?.expenses || []).length} expenses
            </code>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">
              Cadence ({cadenceSnapshot.settings?.catName || 'Pet'}):
            </span>
            <code className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 font-mono break-all sm:break-normal">
              {Object.keys(cadenceSnapshot.logsByDate || {}).length} days logged
            </code>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">
              Bloom ({bloomSnapshot.settings?.mantisName || 'Mantis'}):
            </span>
            <code className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 font-mono break-all sm:break-normal">
              {Object.keys(bloomSnapshot.logsByDate || {}).length} days,{' '}
              {(bloomSnapshot.molts || []).length} molts &bull;{' '}
              {bloomSnapshot.settings?.currentInstar || 'L2'}
            </code>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">Floodgate:</span>
            <code className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 font-mono break-all sm:break-normal">
              {activeProfile.id === 'partner2'
                ? `${Object.keys(floodgateSnapshot.logsByDate || {}).length} days logged`
                : 'Included in full database export'}
            </code>
          </div>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleDownloadFullBackup}
            className="w-full min-h-[44px] py-3 px-4 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition active:scale-[0.98]"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Download Full Database Backup (Entire DB incl. Floodgate)</span>
          </button>

          {activeProfile.id === 'partner1' && (
            <>
              <label className="w-full min-h-[44px] py-3 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                <Upload className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                <span>Restore / Merge from Howard or Standalone Backup JSON</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestoreFullBackup}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                Every restore automatically saves a pre-restore SQLite safety snapshot first.
              </p>
            </>
          )}
        </div>
      </ModalShell>

      {/* ====================================================================
          MODAL 3: BACKUP RESTORE CONFIRMATION MODAL
      ==================================================================== */}
      {pendingRestore && activeProfile.id === 'partner1' && (
        <ModalShell
          isOpen={true}
          onClose={() => !isRestoringBackup && setPendingRestore(null)}
          disableBackdropClose={isRestoringBackup}
          title={
            pendingRestore.bodyToSend.mode === 'merge'
              ? 'Merge Standalone Backup?'
              : 'Restore Household Snapshot?'
          }
          subtitle={pendingRestore.fileName || 'Review database restore action'}
          icon={Upload}
          accent="amber"
          darkMode={darkMode}
          maxWidthClass="max-w-md"
          zIndexClass="z-[60]"
          ariaLabel="Confirm Backup Restore"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isRestoringBackup}
                onClick={() => setPendingRestore(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRestoringBackup}
                onClick={handleConfirmRestore}
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-extrabold bg-teal-700 hover:bg-teal-800 text-white transition active:scale-[0.98] disabled:opacity-50"
              >
                {isRestoringBackup
                  ? 'Restoring...'
                  : pendingRestore.bodyToSend.mode === 'merge'
                    ? 'Merge Backup'
                    : 'Restore Snapshot'}
              </button>
            </div>
          }
        >
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {pendingRestore.confirmPrompt}
          </p>
        </ModalShell>
      )}
    </div>
  );
}
