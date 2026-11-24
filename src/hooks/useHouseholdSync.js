import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_BLOOM_SETTINGS,
  DEFAULT_FLOODGATE_SETTINGS,
  DEFAULT_LEDGER_DATA,
  DEFAULT_PROFILES,
  createDefaultCadenceSettings
} from '../utils/householdHelpers.js';

const POLL_INTERVAL_SSE_MS = 30000;
const POLL_INTERVAL_FALLBACK_MS = 3000;

export const FALLBACK_PROFILES = DEFAULT_PROFILES.map((p) => ({
  id: p.id,
  name: p.name,
  role: p.role,
  color: p.color,
  badgeEmoji: p.badgeEmoji,
  pinEnabled: false,
  lockedOutOfPin: Boolean(p.lockedOutOfPin || p.id === 'caregiver'),
  allowedApps: p.allowedApps,
  caregiverName: p.caregiverName
}));

export function useHouseholdSync({
  activeProfileId,
  setActiveProfileId,
  setHasSavedProfile,
  onRequireBootPin
}) {
  const [isConnected, setIsConnected] = useState(true);
  const [syncError, setSyncError] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncTransport, setSyncTransport] = useState('polling');

  const [profiles, setProfiles] = useState(FALLBACK_PROFILES);
  const [almanacEvents, setAlmanacEvents] = useState([]);
  const [ledgerData, setLedgerData] = useState(DEFAULT_LEDGER_DATA);
  const [beaconInfo, setBeaconInfo] = useState(null);
  const [cadenceSnapshot, setCadenceSnapshot] = useState(() => ({
    settings: createDefaultCadenceSettings(),
    logsByDate: {}
  }));
  const [floodgateSnapshot, setFloodgateSnapshot] = useState(() => ({
    settings: { ...DEFAULT_FLOODGATE_SETTINGS },
    logsByDate: {}
  }));
  const [bloomSnapshot, setBloomSnapshot] = useState(() => ({
    settings: DEFAULT_BLOOM_SETTINGS,
    logsByDate: {},
    molts: [],
    feeders: []
  }));
  const [dbInfo, setDbInfo] = useState({
    file: 'data/howard.db',
    schemaVersion: 5,
    journalMode: 'WAL'
  });

  const [unlockedProfiles, setUnlockedProfiles] = useState(() => ({ caregiver: true }));
  const unlockedProfilesRef = useRef(unlockedProfiles);
  const syncTokenRef = useRef('');
  const isConnectedRef = useRef(true);
  const sseConnectedRef = useRef(false);
  const hasCheckedBootPinRef = useRef(false);
  const abortControllerRef = useRef(null);
  const onRequireBootPinRef = useRef(onRequireBootPin);

  useEffect(() => {
    onRequireBootPinRef.current = onRequireBootPin;
  }, [onRequireBootPin]);

  useEffect(() => {
    unlockedProfilesRef.current = unlockedProfiles;
  }, [unlockedProfiles]);

  const sseProfile =
    activeProfileId === 'caregiver' || unlockedProfiles[activeProfileId]
      ? activeProfileId
      : 'caregiver';

  const fetchUnifiedSync = useCallback(
    async ({ force = false, overrideProfile = null, afterMutation = false } = {}) => {
      // When SSE push is active, a post-mutation SSE `sync` event arrives immediately;
      // skipping duplicate poll prevents redundant AbortError races cleanly.
      if (afterMutation && !force && sseConnectedRef.current) {
        return;
      }

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
            setProfiles(data.howard.profiles);
            if (Array.isArray(data.howard.almanacEvents)) {
              setAlmanacEvents(data.howard.almanacEvents);
            }
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
              settings: { ...DEFAULT_FLOODGATE_SETTINGS },
              logsByDate: {}
            });
            setHasSavedProfile(false);
            setActiveProfileId('caregiver');
            onRequireBootPinRef.current?.(savedProf);
            isConnectedRef.current = true;
            setIsConnected(true);
            setSyncError(null);
            setLastSyncedAt(new Date());
            return;
          }
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

        if (data.syncToken) syncTokenRef.current = data.syncToken;
        if (data.dbInfo) setDbInfo(data.dbInfo);

        if (data.howard) {
          if (Array.isArray(data.howard.profiles)) setProfiles(data.howard.profiles);
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
          setFloodgateSnapshot((prev) => {
            if (
              Object.keys(prev.logsByDate || {}).length === 0 &&
              prev.settings?.ownerName === 'Partner 2'
            ) {
              return prev;
            }
            return {
              settings: { ...DEFAULT_FLOODGATE_SETTINGS },
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
    [activeProfileId, setActiveProfileId, setHasSavedProfile]
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
            // ignore parse error and sync
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

  const markProfileUnlocked = useCallback((profileId) => {
    unlockedProfilesRef.current = {
      ...unlockedProfilesRef.current,
      [profileId]: true
    };
    setUnlockedProfiles((prev) => ({ ...prev, [profileId]: true }));
  }, []);

  return {
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
    setFloodgateSnapshot,
    bloomSnapshot,
    setBloomSnapshot,
    dbInfo,
    markProfileUnlocked,
    fetchUnifiedSync
  };
}
