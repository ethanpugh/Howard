import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProfileId } from '../../shared/schemas/common.ts';
import type { AlmanacEvent } from '../../shared/schemas/almanac.ts';
import type { BeaconInfo } from '../../shared/schemas/beacon.ts';
import type { BloomSnapshot } from '../../shared/schemas/bloom.ts';
import type { CadenceSnapshot } from '../../shared/schemas/cadence.ts';
import type { FloodgateSnapshot } from '../../shared/schemas/floodgate.ts';
import type { LedgerData } from '../../shared/schemas/ledger.ts';
import type { PublicProfile } from '../../shared/schemas/profile.ts';
import type { QuillSnapshot } from '../../shared/schemas/quill.ts';
import type { DbInfo } from '../../shared/schemas/sync.ts';
import { createRpcClient, unwrapRpc } from '../utils/apiClient.ts';
import {
  DEFAULT_BLOOM_SETTINGS,
  DEFAULT_FLOODGATE_SETTINGS,
  DEFAULT_LEDGER_DATA,
  DEFAULT_PROFILES,
  createDefaultCadenceSettings,
  isAlmanacEventVisibleToProfile
} from '../utils/householdHelpers.ts';

const POLL_INTERVAL_SSE_MS = 30000;
const POLL_INTERVAL_FALLBACK_MS = 3000;
const SSE_RECONNECT_DELAY_MS = 5000;

export type DomainSyncSeqMap = {
  profiles: number;
  almanac: number;
  ledger: number;
  beacon: number;
  cadence: number;
  bloom: number;
  floodgate: number;
  quill: number;
};

export const FALLBACK_PROFILES: PublicProfile[] = DEFAULT_PROFILES.map((p) => ({
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

export interface SyncFetchOptions {
  force?: boolean;
  overrideProfile?: ProfileId | null;
  afterMutation?: boolean;
}

export function useHouseholdSync({
  activeProfileId,
  setActiveProfileId,
  setHasSavedProfile,
  onRequireBootPin
}: {
  activeProfileId: ProfileId;
  setActiveProfileId: (id: ProfileId) => void;
  setHasSavedProfile: (saved: boolean) => void;
  onRequireBootPin: (prof: PublicProfile) => void;
}) {
  const [isConnected, setIsConnected] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncTransport, setSyncTransport] = useState<'sse' | 'polling'>('polling');

  const [profiles, setProfiles] = useState<PublicProfile[]>(FALLBACK_PROFILES);
  const [almanacEvents, setAlmanacEvents] = useState<AlmanacEvent[]>([]);
  const [ledgerData, setLedgerData] = useState<LedgerData>(DEFAULT_LEDGER_DATA);
  const [beaconInfo, setBeaconInfo] = useState<BeaconInfo | null>(null);
  const [cadenceSnapshot, setCadenceSnapshot] = useState<CadenceSnapshot>(() => ({
    settings: createDefaultCadenceSettings(),
    logsByDate: {},
    updatedAt: ''
  }));
  const [floodgateSnapshot, setFloodgateSnapshot] = useState<FloodgateSnapshot>(() => ({
    settings: { ...DEFAULT_FLOODGATE_SETTINGS },
    logsByDate: {}
  }));
  const [bloomSnapshot, setBloomSnapshot] = useState<BloomSnapshot>(() => ({
    settings: DEFAULT_BLOOM_SETTINGS,
    logsByDate: {},
    molts: [],
    feeders: [],
    updatedAt: ''
  }));
  const [quillSnapshot, setQuillSnapshot] = useState<QuillSnapshot>(() => ({
    notes: [],
    labels: []
  }));
  const [dbInfo, setDbInfo] = useState<DbInfo>({
    file: 'howard.db',
    schemaVersion: 7,
    journalMode: 'WAL'
  });

  const [unlockedProfiles, setUnlockedProfiles] = useState<Record<string, boolean>>(() => ({
    caregiver: true
  }));
  const [bootCheckSettled, setBootCheckSettled] = useState(
    () => activeProfileId === 'caregiver'
  );
  const unlockedProfilesRef = useRef<Record<string, boolean>>(unlockedProfiles);
  const activeProfileIdRef = useRef<ProfileId>(activeProfileId);
  const syncVersionsRef = useRef<DomainSyncSeqMap>({
    profiles: 0,
    almanac: 0,
    ledger: 0,
    beacon: 0,
    cadence: 0,
    bloom: 0,
    floodgate: 0,
    quill: 0
  });
  const syncTokenRef = useRef('');
  const isConnectedRef = useRef(true);
  const sseConnectedRef = useRef(false);
  const hasCheckedBootPinRef = useRef(false);
  const inFlightForceRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onRequireBootPinRef = useRef(onRequireBootPin);

  useEffect(() => {
    onRequireBootPinRef.current = onRequireBootPin;
  }, [onRequireBootPin]);

  useEffect(() => {
    unlockedProfilesRef.current = unlockedProfiles;
  }, [unlockedProfiles]);

  useEffect(() => {
    activeProfileIdRef.current = activeProfileId;
  }, [activeProfileId]);

  const sseProfile: ProfileId | null = !bootCheckSettled
    ? null
    : activeProfileId === 'caregiver' || unlockedProfiles[activeProfileId]
      ? activeProfileId
      : 'caregiver';

  const fetchUnifiedSync = useCallback(
    async ({
      force = false,
      overrideProfile = null,
      afterMutation = false
    }: SyncFetchOptions = {}): Promise<void> => {
      if (afterMutation && !force && sseConnectedRef.current) {
        return;
      }
      if (!force && inFlightForceRef.current) {
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      if (force) {
        inFlightForceRef.current = true;
      }

      try {
        const targetProfile: ProfileId = overrideProfile || activeProfileIdRef.current;
        const needsBootPinCheck =
          !hasCheckedBootPinRef.current &&
          targetProfile !== 'caregiver' &&
          !unlockedProfilesRef.current[targetProfile];
        const queryProfile: ProfileId = needsBootPinCheck ? 'caregiver' : targetProfile;
        const sinceParam =
          !force && !needsBootPinCheck && syncTokenRef.current ? syncTokenRef.current : '';

        const rpc = createRpcClient({
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });
        const data = await unwrapRpc(
          rpc.api.howard.sync.$get(
            {
              query: {
                profile: queryProfile,
                ...(sinceParam ? { since: sinceParam } : {})
              }
            },
            {
              init: { cache: 'no-store' }
            }
          )
        );

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
            syncVersionsRef.current.profiles += 1;
            syncVersionsRef.current.almanac += 1;
            syncVersionsRef.current.ledger += 1;
            syncVersionsRef.current.beacon += 1;
            syncVersionsRef.current.cadence += 1;
            syncVersionsRef.current.bloom += 1;
            syncVersionsRef.current.floodgate += 1;
            syncVersionsRef.current.quill += 1;

            setProfiles(data.howard.profiles);
            if (Array.isArray(data.howard.almanacEvents)) {
              setAlmanacEvents(data.howard.almanacEvents);
            }
            if (data.howard.ledgerData) setLedgerData(data.howard.ledgerData);
            if (data.howard.beaconInfo) setBeaconInfo(data.howard.beaconInfo);
            if (data.cadence) {
              setCadenceSnapshot({
                settings: data.cadence.settings,
                logsByDate: data.cadence.logsByDate || {},
                updatedAt: data.cadence.updatedAt || ''
              });
            }
            if (data.dbInfo) setDbInfo(data.dbInfo);
            if (data.bloom) {
              setBloomSnapshot({
                settings: data.bloom.settings || DEFAULT_BLOOM_SETTINGS,
                logsByDate: data.bloom.logsByDate || {},
                molts: data.bloom.molts || [],
                feeders: data.bloom.feeders || [],
                updatedAt: data.bloom.updatedAt || ''
              });
            }
            if (data.quill) {
              setQuillSnapshot({
                notes: Array.isArray(data.quill.notes) ? data.quill.notes : [],
                labels: Array.isArray(data.quill.labels) ? data.quill.labels : []
              });
            }
            setFloodgateSnapshot({
              settings: { ...DEFAULT_FLOODGATE_SETTINGS },
              logsByDate: {}
            });
            setHasSavedProfile(false);
            setActiveProfileId('caregiver');
            setBootCheckSettled(true);
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
          setBootCheckSettled(true);
          syncTokenRef.current = '';
          await fetchUnifiedSync({ force: true, overrideProfile: targetProfile });
          return;
        }

        if (!hasCheckedBootPinRef.current) {
          hasCheckedBootPinRef.current = true;
        }
        setBootCheckSettled(true);

        if (data.syncToken) syncTokenRef.current = data.syncToken;
        if (data.dbInfo) setDbInfo(data.dbInfo);

        if (data.howard) {
          if (Array.isArray(data.howard.profiles)) {
            syncVersionsRef.current.profiles += 1;
            setProfiles(data.howard.profiles);
          }
          if (Array.isArray(data.howard.almanacEvents)) {
            syncVersionsRef.current.almanac += 1;
            setAlmanacEvents(data.howard.almanacEvents);
          }
          if (data.howard.ledgerData) {
            syncVersionsRef.current.ledger += 1;
            setLedgerData(data.howard.ledgerData);
          }
          if (data.howard.beaconInfo) {
            syncVersionsRef.current.beacon += 1;
            setBeaconInfo(data.howard.beaconInfo);
          }
        }

        if (data.cadence) {
          syncVersionsRef.current.cadence += 1;
          setCadenceSnapshot({
            settings: data.cadence.settings,
            logsByDate: data.cadence.logsByDate || {},
            updatedAt: data.cadence.updatedAt || ''
          });
        }

        if (data.bloom) {
          syncVersionsRef.current.bloom += 1;
          setBloomSnapshot({
            settings: data.bloom.settings || DEFAULT_BLOOM_SETTINGS,
            logsByDate: data.bloom.logsByDate || {},
            molts: data.bloom.molts || [],
            feeders: data.bloom.feeders || [],
            updatedAt: data.bloom.updatedAt || ''
          });
        }

        if (data.quill) {
          syncVersionsRef.current.quill += 1;
          setQuillSnapshot({
            notes: Array.isArray(data.quill.notes) ? data.quill.notes : [],
            labels: Array.isArray(data.quill.labels) ? data.quill.labels : []
          });
        }

        if (targetProfile === 'partner2') {
          if (data.floodgate) {
            syncVersionsRef.current.floodgate += 1;
            setFloodgateSnapshot({
              settings: data.floodgate.settings,
              logsByDate: data.floodgate.logsByDate || {}
            });
          }
        } else {
          syncVersionsRef.current.floodgate += 1;
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
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Howard live sync error:', err);
        if (isConnectedRef.current) {
          isConnectedRef.current = false;
          setIsConnected(false);
          setSyncError('Reconnecting to local Howard server...');
        }
      } finally {
        if (abortControllerRef.current === controller) {
          inFlightForceRef.current = false;
          abortControllerRef.current = null;
        }
      }
    },
    [setActiveProfileId, setHasSavedProfile]
  );

  // Immediately clear/filter private Partner 2 & partner-only state whenever activeProfileId switches (SYNC-02)
  useEffect(() => {
    if (activeProfileId !== 'partner2') {
      syncVersionsRef.current.floodgate += 1;
      setFloodgateSnapshot({
        settings: { ...DEFAULT_FLOODGATE_SETTINGS },
        logsByDate: {}
      });
    }

    if (activeProfileId === 'caregiver') {
      syncVersionsRef.current.almanac += 1;
      syncVersionsRef.current.ledger += 1;
      setAlmanacEvents([]);
      setLedgerData(DEFAULT_LEDGER_DATA);
    } else if (activeProfileId === 'partner1') {
      syncVersionsRef.current.almanac += 1;
      setAlmanacEvents((prev) =>
        prev.filter((evt) => isAlmanacEventVisibleToProfile(evt, 'partner1', profiles))
      );
    }

    syncVersionsRef.current.quill += 1;
    setQuillSnapshot((prev) => {
      const filteredNotes = (prev.notes || []).filter((n) => {
        if (!n) return false;
        if (activeProfileId === 'caregiver') {
          return n.visibility === 'shared' && n.status === 'active' && Boolean(n.caregiverVisible);
        }
        return n.visibility === 'shared' || n.ownerProfileId === activeProfileId;
      });
      const visibleLabelSet = new Set<string>();
      for (const note of filteredNotes) {
        for (const lbl of note.labels || []) {
          visibleLabelSet.add(lbl);
        }
      }
      return {
        notes: filteredNotes,
        labels:
          activeProfileId === 'caregiver'
            ? [...visibleLabelSet]
            : (prev.labels || []).filter((lbl) => visibleLabelSet.has(lbl))
      };
    });

    syncTokenRef.current = '';
    void fetchUnifiedSync({ force: true, overrideProfile: activeProfileId });
  }, [activeProfileId, fetchUnifiedSync]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const schedulePollLoop = (intervalMs: number) => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          void fetchUnifiedSync();
        }
      }, intervalMs);
    };

    schedulePollLoop(POLL_INTERVAL_FALLBACK_MS);

    const connectSse = () => {
      if (disposed || typeof EventSource === 'undefined' || !sseProfile) return;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      try {
        eventSource = new EventSource(
          `/api/howard/events?profile=${encodeURIComponent(sseProfile)}`
        );
        eventSource.addEventListener('ready', (ev) => {
          sseConnectedRef.current = true;
          setSyncTransport('sse');
          isConnectedRef.current = true;
          setIsConnected(true);
          setSyncError(null);
          schedulePollLoop(POLL_INTERVAL_SSE_MS);
          try {
            const parsed = JSON.parse((ev as MessageEvent<string>).data || '{}') as {
              syncToken?: string;
            };
            if (!parsed.syncToken || parsed.syncToken !== syncTokenRef.current) {
              void fetchUnifiedSync();
            }
          } catch {
            void fetchUnifiedSync();
          }
        });
        eventSource.addEventListener('sync', (ev) => {
          try {
            const parsed = JSON.parse((ev as MessageEvent<string>).data || '{}') as {
              syncToken?: string;
            };
            if (parsed.syncToken && parsed.syncToken === syncTokenRef.current) {
              return;
            }
          } catch {
            // ignore parse error and sync
          }
          void fetchUnifiedSync();
        });
        eventSource.onerror = () => {
          const closedState = eventSource?.readyState === EventSource.CLOSED;
          if (sseConnectedRef.current) {
            sseConnectedRef.current = false;
            setSyncTransport('polling');
            schedulePollLoop(POLL_INTERVAL_FALLBACK_MS);
          }
          if (closedState && !disposed && !reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connectSse();
            }, SSE_RECONNECT_DELAY_MS);
          }
        };
      } catch {
        sseConnectedRef.current = false;
        setSyncTransport('polling');
      }
    };

    connectSse();

    const handleWake = () => {
      if (document.visibilityState === 'visible') {
        void fetchUnifiedSync();
        if (typeof EventSource !== 'undefined' && sseProfile && (!eventSource || eventSource.readyState === EventSource.CLOSED)) {
          connectSse();
        }
      }
    };

    window.addEventListener('focus', handleWake);
    document.addEventListener('visibilitychange', handleWake);

    return () => {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventSource) eventSource.close();
      sseConnectedRef.current = false;
      window.removeEventListener('focus', handleWake);
      document.removeEventListener('visibilitychange', handleWake);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchUnifiedSync, sseProfile]);

  const markProfileUnlocked = useCallback((profileId: ProfileId) => {
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
    quillSnapshot,
    setQuillSnapshot,
    dbInfo,
    syncVersionsRef,
    markProfileUnlocked,
    fetchUnifiedSync
  };
}
