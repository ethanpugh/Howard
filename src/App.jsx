import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Home,
  Cat,
  Calendar,
  Heart,
  Wallet,
  ShieldAlert,
  Sun,
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
  X,
  KeyRound,
  Sparkles,
  ChevronRight
} from 'lucide-react';

import FoyerApp from './apps/FoyerApp.jsx';
import CadenceApp from './apps/CadenceApp.jsx';
import AlmanacApp from './apps/AlmanacApp.jsx';
import FloodgateApp from './apps/FloodgateApp.jsx';
import LedgerApp from './apps/LedgerApp.jsx';
import BeaconApp from './apps/BeaconApp.jsx';

const POLL_INTERVAL_MS = 2500;
const ACTIVE_PROFILE_STORAGE_KEY = 'howard-active-profile';
const ACTIVE_APP_STORAGE_KEY = 'howard-active-app';

const getLocalDateKey = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const APP_REGISTRY = [
  {
    id: 'foyer',
    name: 'Foyer',
    subtitle: 'Daily Briefing',
    icon: Home,
    accent: 'bg-teal-600 text-white',
    badgeClass: 'text-teal-600 dark:text-teal-400'
  },
  {
    id: 'cadence',
    name: 'Cadence',
    subtitle: 'Pet Meds',
    icon: Cat,
    accent: 'bg-emerald-600 text-white',
    badgeClass: 'text-emerald-600 dark:text-emerald-400'
  },
  {
    id: 'almanac',
    name: 'Almanac',
    subtitle: 'Calendar',
    icon: Calendar,
    accent: 'bg-indigo-600 text-white',
    badgeClass: 'text-indigo-600 dark:text-indigo-400'
  },
  {
    id: 'floodgate',
    name: 'Floodgate',
    subtitle: 'Cycle & GP Log',
    icon: Heart,
    accent: 'bg-rose-600 text-white',
    badgeClass: 'text-rose-600 dark:text-rose-400',
    privateTo: 'partner2'
  },
  {
    id: 'ledger',
    name: 'Ledger',
    subtitle: 'Finances & Bills',
    icon: Wallet,
    accent: 'bg-amber-600 text-white',
    badgeClass: 'text-amber-600 dark:text-amber-400'
  },
  {
    id: 'beacon',
    name: 'Beacon',
    subtitle: 'House & Vet Guide',
    icon: ShieldAlert,
    accent: 'bg-sky-600 text-white',
    badgeClass: 'text-sky-600 dark:text-sky-400'
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
    allowedApps: ['foyer', 'cadence', 'almanac', 'ledger', 'beacon'],
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
    allowedApps: ['foyer', 'cadence', 'almanac', 'floodgate', 'ledger', 'beacon'],
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
    allowedApps: ['foyer', 'cadence', 'beacon'],
    caregiverName: 'Caregiver'
  }
];

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

  // Cross-app navigation intent (e.g. jump to Floodgate GP report or specific date)
  const [floodgateIntent, setFloodgateIntent] = useState(null); // { tab: 'log'|'calendar'|'insights', date: 'YYYY-MM-DD' }
  const [almanacIntentDate, setAlmanacIntentDate] = useState(null);

  // --------------------------------------------------------------------------
  // LIVE HOUSEHOLD SYNC STATE (2.5s POLLING)
  // --------------------------------------------------------------------------
  const [isConnected, setIsConnected] = useState(true);
  const [syncError, setSyncError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

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

  // Track which PIN-protected profiles have been unlocked during this session
  const [unlockedProfiles, setUnlockedProfiles] = useState(() => ({
    caregiver: true
  }));
  const [hasCheckedBootPin, setHasCheckedBootPin] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState(null);
  const showToast = useCallback((text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
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

  const [backupModalOpen, setBackupModalOpen] = useState(false);

  // Active profile object
  const activeProfile = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId) || profiles[0] || FALLBACK_PROFILES[0];
  }, [profiles, activeProfileId]);

  // Visible apps for the active profile
  const allowedApps = useMemo(() => {
    const allowedIds = activeProfile?.allowedApps || ['foyer', 'cadence', 'beacon'];
    return APP_REGISTRY.filter((app) => allowedIds.includes(app.id));
  }, [activeProfile]);

  // Ensure activeAppId is always permitted for the active profile
  useEffect(() => {
    const allowedIds = activeProfile?.allowedApps || ['foyer', 'cadence', 'beacon'];
    if (!allowedIds.includes(activeAppId)) {
      setActiveAppId('foyer');
    }
  }, [activeProfile, activeAppId]);

  useEffect(() => {
    if (!hasSavedProfile) return;
    try {
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, activeProfileId);
    } catch {
      // ignore
    }
  }, [activeProfileId, hasSavedProfile]);

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
  // UNIFIED 2.5-SECOND LIVE POLLING EFFECT
  // --------------------------------------------------------------------------
  const fetchUnifiedSync = useCallback(async () => {
    try {
      const res = await fetch(`/api/howard/sync?profile=${encodeURIComponent(activeProfileId)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.howard) {
        if (Array.isArray(data.howard.profiles)) {
          setProfiles(data.howard.profiles);
          // Enforce PIN lock if booting into a PIN-enabled profile that hasn't been unlocked yet
          if (!hasCheckedBootPin) {
            setHasCheckedBootPin(true);
            const currentProf = data.howard.profiles.find((p) => p.id === activeProfileId);
            if (currentProf && currentProf.pinEnabled && !unlockedProfiles[currentProf.id]) {
              setActiveProfileId('caregiver');
              setPinPromptTarget(currentProf);
              setProfileModalOpen(true);
            }
          }
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

      if (data.floodgate) {
        setFloodgateSnapshot({
          settings: data.floodgate.settings || {},
          logsByDate: data.floodgate.logsByDate || {}
        });
      } else {
        // Clear private Floodgate state in memory when not on Partner 2's profile
        setFloodgateSnapshot({
          settings: { ownerName: 'Partner 2', appName: 'Floodgate' },
          logsByDate: {}
        });
      }

      setIsConnected(true);
      setSyncError(null);
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error('Howard live sync error:', err);
      setIsConnected(false);
      setSyncError('Reconnecting to local Howard server...');
    }
  }, [activeProfileId]);

  useEffect(() => {
    fetchUnifiedSync();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchUnifiedSync();
      }
    }, POLL_INTERVAL_MS);

    const handleWake = () => {
      if (document.visibilityState === 'visible') {
        fetchUnifiedSync();
      }
    };

    window.addEventListener('focus', handleWake);
    document.addEventListener('visibilitychange', handleWake);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleWake);
      document.removeEventListener('visibilitychange', handleWake);
    };
  }, [fetchUnifiedSync]);

  // --------------------------------------------------------------------------
  // PROFILE SWITCHING & PIN LOCK HANDLERS
  // --------------------------------------------------------------------------
  const handleSelectProfile = (targetProfile) => {
    if (targetProfile.id === activeProfileId && hasSavedProfile) {
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
      setActiveProfileId(targetProfile.id);
      setProfileModalOpen(false);
      showToast(`Switched to ${targetProfile.name} (${targetProfile.role})`);
      return;
    }

    // Otherwise open the PIN verification modal
    setPinPromptTarget(targetProfile);
    setPinInput('');
    setPinPromptError('');
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
      setUnlockedProfiles((prev) => ({ ...prev, [pinPromptTarget.id]: true }));
      setHasSavedProfile(true);
      try {
        localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, pinPromptTarget.id);
      } catch {
        // ignore
      }
      setUnlockedProfiles((prev) => ({ ...prev, [pinPromptTarget.id]: true }));
      setActiveProfileId(pinPromptTarget.id);
      setPinPromptTarget(null);
      setProfileModalOpen(false);
      setPinInput('');
      showToast(`Unlocked ${pinPromptTarget.name}'s profile`);
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
    const todayKey = getLocalDateKey(new Date());
    const nowIso = new Date().toISOString();
    const caregiverName = activeProfile.caregiverName || activeProfile.name;
    const currentDay = cadenceSnapshot.logsByDate[todayKey] || { dateKey: todayKey };

    const updatedDay = {
      ...currentDay,
      dateKey: todayKey,
      [slot]: {
        given: true,
        timestamp: nowIso,
        givenBy: caregiverName,
        dosage: cadenceSnapshot.settings?.dosageLabel || '2.5 mg / 0.5 ml',
        note: note.trim(),
        recordedByUid: `howard-${activeProfile.id}`
      },
      updatedAt: nowIso
    };

    // Optimistic update
    setCadenceSnapshot((prev) => ({
      ...prev,
      logsByDate: {
        ...prev.logsByDate,
        [todayKey]: updatedDay
      }
    }));

    try {
      const res = await fetch(`/api/cadence/logs/${encodeURIComponent(todayKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDay)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(
        `Logged ${cadenceSnapshot.settings?.catName || 'Pet'}'s ${slot === 'morning' ? 'Morning' : 'Evening'} dose (${caregiverName})`
      );
      fetchUnifiedSync();
    } catch {
      showToast('Failed to save dose to server', 'error');
    }
  };

  const handleSaveAlmanacEvents = async (nextEvents, toastText = 'Updated Almanac calendar') => {
    setAlmanacEvents(nextEvents);
    try {
      const res = await fetch('/api/howard/almanac', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: nextEvents })
      });
      if (!res.ok) throw new Error('Failed to save Almanac events');
      if (toastText) showToast(toastText);
    } catch {
      showToast('Could not save calendar event', 'error');
    }
  };

  const handleSaveLedgerData = async (nextLedgerData, toastText = 'Updated Ledger bookkeeping') => {
    setLedgerData(nextLedgerData);
    try {
      const res = await fetch('/api/howard/ledger', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledgerData: nextLedgerData })
      });
      if (!res.ok) throw new Error('Failed to save Ledger data');
      if (toastText) showToast(toastText);
    } catch {
      showToast('Could not save Ledger bookkeeping', 'error');
    }
  };

  const handleSaveBeaconInfo = async (nextBeacon, toastText = 'Updated Beacon house guide') => {
    setBeaconInfo(nextBeacon);
    try {
      const res = await fetch('/api/howard/beacon', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beaconInfo: nextBeacon })
      });
      if (!res.ok) throw new Error('Failed to save Beacon guide');
      if (toastText) showToast(toastText);
    } catch {
      showToast('Could not save Beacon guide', 'error');
    }
  };

  // Cross-app navigation helpers
  const openFloodgateWithIntent = (intent = { tab: 'log', date: null }) => {
    if (!activeProfile.allowedApps.includes('floodgate')) {
      const partner2Name = profiles.find((p) => p.id === 'partner2')?.name || 'Partner 2';
      showToast(`Switch to ${partner2Name}'s profile to open Floodgate`, 'error');
      return;
    }
    setFloodgateIntent({ ...intent, timestamp: Date.now() });
    setActiveAppId('floodgate');
  };

  const openAlmanacOnDate = (dateStr) => {
    setAlmanacIntentDate(dateStr);
    setActiveAppId('almanac');
  };

  // --------------------------------------------------------------------------
  // UNIFIED HOUSEHOLD BACKUP & RESTORE
  // --------------------------------------------------------------------------
  const handleDownloadFullBackup = async () => {
    try {
      const includeFg = activeProfile.id === 'partner2' ? '1' : '0';
      const res = await fetch(`/api/howard/backup?includeFloodgate=${includeFg}`);
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
      showToast('Downloaded full Howard household backup');
    } catch {
      showToast('Could not export household backup', 'error');
    }
  };

  const handleRestoreFullBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        // Support restoring either a full Howard bundle OR a standalone Floodgate/Cadence JSON file
        let bodyToSend = parsed;
        if (parsed.app === 'Floodgate' && parsed.logs) {
          bodyToSend = { floodgate: { logsByDate: parsed.logs, settings: { ownerName: parsed.owner || 'Partner 2' } } };
        }
        const res = await fetch('/api/howard/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyToSend)
        });
        if (!res.ok) throw new Error('Restore failed');
        await fetchUnifiedSync();
        setBackupModalOpen(false);
        showToast('Restored household backup successfully!');
      } catch {
        showToast('Invalid backup JSON file', 'error');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-200 pb-20 md:pb-8 ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
      }`}
    >
      {/* FLOATING TOAST */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 no-print animate-fade-in">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs sm:text-sm font-semibold ${
              toast.type === 'error'
                ? 'bg-rose-900 text-white border-rose-700'
                : 'bg-slate-900 text-white border-slate-700 dark:bg-slate-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{toast.text}</span>
          </div>
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
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 h-16 flex items-center justify-between gap-2">
          {/* Brand Logo + Live Sync Status */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveAppId('foyer')}
              className="flex items-center gap-2 lg:gap-2.5 text-left group cursor-pointer"
              title="Return to Foyer (Daily Briefing)"
            >
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-2xl bg-gradient-to-br from-slate-900 to-teal-700 dark:from-teal-600 dark:to-emerald-700 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition shrink-0">
                <Home className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base lg:text-lg tracking-tight leading-none">
                    Howard
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      isConnected
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    }`}
                    title={
                      lastSyncedAt
                        ? `Live 2.5s Household Sync • Last synced ${lastSyncedAt.toLocaleTimeString()}`
                        : 'Connecting to local SQLite server'
                    }
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                      }`}
                    />
                    <span className="hidden xl:inline">{isConnected ? 'Live' : 'Sync'}</span>
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden lg:block">
                  Household Suite
                </p>
              </div>
            </button>
          </div>

          {/* Center Tablet & Desktop App Switcher Pills */}
          <nav
            aria-label="Howard Apps"
            className={`hidden md:flex items-center gap-0.5 lg:gap-1 p-1 rounded-2xl border min-w-0 max-w-full overflow-x-auto ${
              darkMode
                ? 'bg-slate-950/70 border-slate-800'
                : 'bg-slate-100/90 border-slate-200/70'
            }`}
          >
            {allowedApps.map((appItem) => {
              const Icon = appItem.icon;
              const isActive = activeAppId === appItem.id;
              return (
                <button
                  key={appItem.id}
                  type="button"
                  onClick={() => setActiveAppId(appItem.id)}
                  className={`flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3.5 py-1.5 rounded-xl text-xs lg:text-sm font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    isActive
                      ? `${appItem.accent} shadow-xs`
                      : darkMode
                        ? 'text-slate-300 hover:bg-slate-800/80'
                        : 'text-slate-600 hover:bg-white/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
                  <span>{appItem.name}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Controls: Profile Switcher, Backups & Theme Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Active Profile Pill (Opens Switcher / PIN Modal) */}
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
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
              <span>{activeProfile.name}</span>
              {activeProfile.pinEnabled && <Lock className="w-3 h-3 opacity-75" />}
            </button>

            {/* Household Backup Button (Hidden in Caregiver mode) */}
            {activeProfile.id !== 'caregiver' && (
              <button
                type="button"
                onClick={() => setBackupModalOpen(true)}
                className={`p-2 rounded-xl border transition cursor-pointer ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
                title="Household Backups & SQLite Status"
              >
                <Database className="w-4 h-4" />
              </button>
            )}

            {/* Theme Toggle: Warm Beige <-> Dark */}
            <button
              type="button"
              onClick={cycleThemeMode}
              className={`px-2.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                themeMode === 'dark'
                  ? 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700'
                  : 'bg-[#E9DFC8] border-[#D5C7A9] text-[#4A3B2C] hover:bg-[#DFD3B8]'
              }`}
              title={
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
          ACTIVE MODULE VIEWPORT
      ==================================================================== */}
      <div className="w-full">
        {activeAppId === 'foyer' && (
          <FoyerApp
            activeProfile={activeProfile}
            profiles={profiles}
            darkMode={darkMode}
            cadenceSnapshot={cadenceSnapshot}
            floodgateSnapshot={floodgateSnapshot}
            almanacEvents={almanacEvents}
            ledgerData={ledgerData}
            beaconInfo={beaconInfo}
            onNavigateApp={(appId) => setActiveAppId(appId)}
            onQuickRecordDose={handleQuickRecordPetDose}
            onOpenFloodgate={openFloodgateWithIntent}
            onOpenAlmanacDate={openAlmanacOnDate}
            onOpenProfileModal={() => setProfileModalOpen(true)}
          />
        )}

        {activeAppId === 'cadence' && (
          <CadenceApp
            activeProfile={activeProfile}
            darkMode={darkMode}
            onGlobalSync={fetchUnifiedSync}
          />
        )}

        {activeAppId === 'almanac' && (
          <AlmanacApp
            activeProfile={activeProfile}
            profiles={profiles}
            darkMode={darkMode}
            almanacEvents={almanacEvents}
            cadenceSnapshot={cadenceSnapshot}
            floodgateSnapshot={floodgateSnapshot}
            ledgerData={ledgerData}
            initialDate={almanacIntentDate}
            onSaveEvents={handleSaveAlmanacEvents}
            onOpenFloodgate={openFloodgateWithIntent}
            onNavigateApp={(appId) => setActiveAppId(appId)}
          />
        )}

        {activeAppId === 'floodgate' && activeProfile.allowedApps.includes('floodgate') && (
          <FloodgateApp
            activeProfile={activeProfile}
            darkMode={darkMode}
            navigationIntent={floodgateIntent}
            onOpenBackupModal={() => setBackupModalOpen(true)}
            onGlobalSync={fetchUnifiedSync}
          />
        )}

        {activeAppId === 'ledger' && (
          <LedgerApp
            activeProfile={activeProfile}
            profiles={profiles}
            darkMode={darkMode}
            ledgerData={ledgerData}
            onSaveLedgerData={handleSaveLedgerData}
          />
        )}

        {activeAppId === 'beacon' && (
          <BeaconApp
            activeProfile={activeProfile}
            darkMode={darkMode}
            beaconInfo={beaconInfo}
            cadenceSettings={cadenceSnapshot.settings}
            onSaveBeacon={handleSaveBeaconInfo}
            onNavigateApp={(appId) => setActiveAppId(appId)}
            showToast={showToast}
          />
        )}
      </div>

      {/* ====================================================================
          MOBILE STICKY BOTTOM APP DOCK
      ==================================================================== */}
      <nav
        aria-label="Mobile App Switcher"
        className={`md:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur-lg no-print ${
          darkMode
            ? 'bg-slate-900/95 border-slate-800'
            : 'bg-white/95 border-slate-200'
        }`}
      >
        <div
          className="grid h-16"
          style={{ gridTemplateColumns: `repeat(${allowedApps.length}, minmax(0, 1fr))` }}
        >
          {allowedApps.map((appItem) => {
            const Icon = appItem.icon;
            const isActive = activeAppId === appItem.id;
            return (
              <button
                key={appItem.id}
                type="button"
                onClick={() => setActiveAppId(appItem.id)}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors ${
                  isActive
                    ? appItem.badgeClass
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="truncate max-w-[64px]">{appItem.name}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ====================================================================
          MODAL 1: PROFILE SWITCHER & PIN SECURITY SETTINGS
      ==================================================================== */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div
            className={`max-w-md w-full rounded-3xl p-6 shadow-2xl border space-y-5 ${
              darkMode
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold">Who&apos;s Using Howard?</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Switch household profile or enter Caregiver mode
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileModalOpen(false);
                  setPinPromptTarget(null);
                  setPinManageOpen(false);
                }}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* If entering a PIN to unlock target profile */}
            {pinPromptTarget ? (
              <form onSubmit={handleVerifyPinSubmit} className="space-y-4 pt-2">
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
                    className={`w-full px-4 py-3 rounded-2xl text-center text-lg font-mono tracking-widest border ${
                      darkMode
                        ? 'bg-slate-950 border-slate-700 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                  {pinPromptError && (
                    <p className="text-xs text-rose-500 font-semibold mt-1.5 text-center">
                      {pinPromptError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPinPromptTarget(null)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    Unlock Profile
                  </button>
                </div>
              </form>
            ) : (
              <>
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
                        className={`w-full p-3.5 rounded-2xl border text-left transition flex items-center justify-between gap-3 cursor-pointer ${
                          isCurrent
                            ? 'ring-2 ring-teal-500 border-teal-500 bg-teal-500/10'
                            : darkMode
                              ? 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800'
                              : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-lg shrink-0">
                            {prof.badgeEmoji}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">{prof.name}</span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                {prof.role}
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-teal-600 text-white">
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              Apps: {appNames}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {prof.id === 'caregiver' ? (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <Unlock className="w-3.5 h-3.5" /> Unlocked
                            </span>
                          ) : prof.pinEnabled ? (
                            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <Lock className="w-3.5 h-3.5" /> PIN
                            </span>
                          ) : (
                            <span className="text-[10px] opacity-60">No PIN</span>
                          )}
                          <ChevronRight className="w-4 h-4 opacity-50" />
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
                      <div className="flex items-center justify-between">
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
                          className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                        >
                          Change Name
                        </button>
                      </div>
                    ) : (
                      <form
                        onSubmit={handleSaveProfileName}
                        className={`p-3 rounded-2xl border flex items-center gap-2 ${
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
                          className="flex-1 px-3 py-1.5 rounded-xl text-xs font-bold border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                        />
                        <button
                          type="button"
                          onClick={() => setRenameOpen(false)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 cursor-pointer"
                        >
                          Save
                        </button>
                      </form>
                    )}

                    {/* 2. PIN Lock Settings */}
                    {!pinManageOpen ? (
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-teal-600" />
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
                          className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
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
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">
                            Configure PIN for {activeProfile.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPinManageOpen(false)}
                            className="text-xs text-slate-400 hover:text-slate-600"
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
                            className="w-full px-3 py-2 rounded-xl text-xs border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                          />
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="password"
                            inputMode="numeric"
                            value={pinManageNew}
                            onChange={(e) => setPinManageNew(e.target.value.replace(/\D/g, ''))}
                            placeholder="New PIN (4-8 digits)"
                            maxLength={8}
                            className="w-full px-3 py-2 rounded-xl text-xs border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                          />
                          <input
                            type="password"
                            inputMode="numeric"
                            value={pinManageConfirm}
                            onChange={(e) => setPinManageConfirm(e.target.value.replace(/\D/g, ''))}
                            placeholder="Confirm New PIN"
                            maxLength={8}
                            className="w-full px-3 py-2 rounded-xl text-xs border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                          />
                        </div>

                        {pinManageError && (
                          <p className="text-xs text-rose-500 font-semibold">{pinManageError}</p>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          {activeProfile.pinEnabled ? (
                            <button
                              type="button"
                              onClick={(e) => handleSavePinSettings(e, false)}
                              className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                            >
                              Disable PIN
                            </button>
                          ) : (
                            <div />
                          )}
                          <button
                            type="submit"
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 text-white hover:bg-teal-700"
                          >
                            Save PIN
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 2: UNIFIED HOUSEHOLD BACKUP & DATABASE STATUS ("BACKSTAGE")
      ==================================================================== */}
      {backupModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <div
            className={`max-w-lg w-full rounded-3xl p-6 shadow-2xl border space-y-5 ${
              darkMode
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold">Howard Household Backstage</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Local SQLite databases &amp; one-click household backup
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBackupModalOpen(false)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className={`p-4 rounded-2xl border text-xs space-y-2 ${
                darkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">Live Household Polling:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <Wifi className="w-3.5 h-3.5" /> Every 2.5s ({isConnected ? 'Connected' : 'Offline'})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Howard Hub DB:</span>
                <code className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 font-mono">
                  data/howard.db ({almanacEvents.length} events, {(ledgerData?.recurring || []).length} bills, {(ledgerData?.expenses || []).length} expenses)
                </code>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Cadence DB ({cadenceSnapshot.settings?.catName || 'Pet'}):</span>
                <code className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 font-mono">
                  data/cadence.db ({Object.keys(cadenceSnapshot.logsByDate || {}).length} days)
                </code>
              </div>
              {activeProfile.id === 'partner2' && (
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Floodgate DB ({activeProfile.name}):</span>
                  <code className="px-2 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 font-mono">
                    data/floodgate.db ({Object.keys(floodgateSnapshot.logsByDate || {}).length} days)
                  </code>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleDownloadFullBackup}
                className="w-full py-3 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>
                  Download Full Household Backup (
                  {activeProfile.id === 'partner2'
                    ? 'Howard + Cadence + Floodgate'
                    : 'Howard + Cadence'}
                  )
                </span>
              </button>

              <label className="w-full py-3 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <Upload className="w-4 h-4 text-teal-600" />
                <span>Restore / Merge from Howard or Standalone Backup JSON</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestoreFullBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
