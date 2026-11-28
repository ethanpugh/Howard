import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Droplets,
  Flower2,
  Settings,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import type {
  BloomCareLog,
  BloomClimateCheck,
  BloomFeederCulture,
  BloomFeedingEntry,
  BloomLogPutRequest,
  BloomMistEntry,
  BloomMoltRecord,
  BloomSettings,
  BloomSettingsPatch,
  BloomSnapshot
} from '../../shared/schemas/bloom.ts';
import type { PublicProfile } from '../../shared/schemas/profile.ts';
import {
  AlertBanner,
  Button,
  ConfirmModal,
  ModuleHeader,
  ModulePage,
  SegmentedTabs,
  StatusPill
} from '../components/HowardUI.tsx';
import {
  DEFAULT_BLOOM_SETTINGS,
  buildTimestampForDate,
  clampFiniteNumber,
  computeBloomSummary,
  formatShortPreyLabel,
  formatTimeDisplay,
  getLocalDateKey,
  type BloomSummary,
  type EnrichedBloomFeeder,
  type PartialBloomSnapshot
} from '../utils/householdHelpers.ts';
import { createRpcClient, unwrapRpc } from '../utils/apiClient.ts';
import { useActionLock } from '../hooks/useActionLock.ts';
import type { SyncFetchOptions } from '../hooks/useHouseholdSync.ts';
import {
  ABDOMEN_LEVELS,
  INSTAR_STAGES,
  PREY_OPTIONS,
  SPECIES_PRESETS,
  getSuggestedNextInstar,
  type BloomClimateInput,
  type BloomDeleteTarget,
  type BloomFeedingInput,
  type BloomMistInput,
  type PreyOption
} from './bloom/bloomConstants.ts';
import BloomTodayTab from './bloom/BloomTodayTab.tsx';
import BloomGrowthTab from './bloom/BloomGrowthTab.tsx';
import BloomHabitatTab, {
  type BloomEnclosureDraft,
  type BloomFeederDraft
} from './bloom/BloomHabitatTab.tsx';
import BloomMoltModal, { type BloomMoltPayload } from './bloom/BloomMoltModal.tsx';
import BloomSettingsModal, { type BloomSettingsForm } from './bloom/BloomSettingsModal.tsx';
import BloomBackfillModal from './bloom/BloomBackfillModal.tsx';

export {
  DEFAULT_BLOOM_SETTINGS,
  computeBloomSummary,
  INSTAR_STAGES,
  getSuggestedNextInstar,
  SPECIES_PRESETS,
  ABDOMEN_LEVELS,
  PREY_OPTIONS
};

type BloomTabId = 'today' | 'growth' | 'habitat';

type BloomActiveModal =
  | null
  | { type: 'molt' }
  | { type: 'settings' }
  | { type: 'backfill'; dateKey: string };

interface BloomOverlayPatch {
  settings?: BloomSettings | undefined;
  logsByDate?: Record<string, BloomCareLog> | undefined;
  molts?: BloomMoltRecord[] | undefined;
  feeders?: BloomFeederCulture[] | undefined;
}

interface OptimisticOverlayState {
  forSnapshot: BloomSnapshot | null | undefined;
  patch: BloomOverlayPatch;
}

const DEFAULT_PREY_OPTION: PreyOption = {
  id: 'hydei',
  label: 'D. hydei (Larger Fruit Fly)',
  stages: 'L2–L4'
};

const clampSetting = (val: unknown, min: number, max: number, fallback: number): number =>
  clampFiniteNumber(String(val ?? '').trim() === '' ? undefined : val, min, max, fallback);

function mergeSettingsOptimistically(
  base: BloomSettings,
  patch: BloomSettingsPatch
): BloomSettings {
  const next: BloomSettings = {
    ...base,
    enclosureInfo: { ...base.enclosureInfo }
  };
  if (patch.mantisName !== undefined) next.mantisName = patch.mantisName;
  if (patch.speciesPreset !== undefined) next.speciesPreset = patch.speciesPreset;
  if (patch.commonName !== undefined) next.commonName = patch.commonName;
  if (patch.scientificName !== undefined) next.scientificName = patch.scientificName;
  if (patch.sex !== undefined) next.sex = patch.sex;
  if (patch.pronouns !== undefined) next.pronouns = patch.pronouns;
  if (patch.currentInstar !== undefined) next.currentInstar = patch.currentInstar;
  if (patch.arrivalDate !== undefined) next.arrivalDate = patch.arrivalDate;
  if (patch.hatchDate !== undefined) next.hatchDate = patch.hatchDate;
  if (patch.currentColorMorph !== undefined) next.currentColorMorph = patch.currentColorMorph;
  if (patch.lifecycleStatus !== undefined) next.lifecycleStatus = patch.lifecycleStatus;
  if (patch.premoltStartedAt !== undefined) next.premoltStartedAt = patch.premoltStartedAt;
  if (patch.hardeningUntil !== undefined) next.hardeningUntil = patch.hardeningUntil;
  if (patch.hardeningHours !== undefined) next.hardeningHours = patch.hardeningHours;
  if (patch.livePreyInside !== undefined) next.livePreyInside = patch.livePreyInside;
  if (patch.livePreyNote !== undefined) next.livePreyNote = patch.livePreyNote;
  if (patch.livePreyAt !== undefined) next.livePreyAt = patch.livePreyAt;
  if (patch.livePreyBy !== undefined) next.livePreyBy = patch.livePreyBy;
  if (patch.livePreyByProfileId !== undefined) next.livePreyByProfileId = patch.livePreyByProfileId;
  if (patch.dayTempMinC !== undefined) next.dayTempMinC = patch.dayTempMinC;
  if (patch.dayTempMaxC !== undefined) next.dayTempMaxC = patch.dayTempMaxC;
  if (patch.nightTempMinC !== undefined) next.nightTempMinC = patch.nightTempMinC;
  if (patch.humidityMinPct !== undefined) next.humidityMinPct = patch.humidityMinPct;
  if (patch.humidityMaxPct !== undefined) next.humidityMaxPct = patch.humidityMaxPct;
  if (patch.mistTargetHours !== undefined) next.mistTargetHours = patch.mistTargetHours;
  if (patch.typicalInterMoltDays !== undefined) next.typicalInterMoltDays = patch.typicalInterMoltDays;
  if (patch.caregivers !== undefined) next.caregivers = patch.caregivers;
  if (patch.caregiverItems !== undefined) next.caregiverItems = patch.caregiverItems;
  if (patch.careNote !== undefined) next.careNote = patch.careNote;
  if (patch.enclosureInfo) {
    const enc = patch.enclosureInfo;
    if (enc.currentSizeLabel !== undefined) next.enclosureInfo.currentSizeLabel = enc.currentSizeLabel;
    if (enc.meshType !== undefined) next.enclosureInfo.meshType = enc.meshType;
    if (enc.substrate !== undefined) next.enclosureInfo.substrate = enc.substrate;
    if (enc.lastDeepCleanDate !== undefined) next.enclosureInfo.lastDeepCleanDate = enc.lastDeepCleanDate;
    if (enc.currentBodyLengthMm !== undefined) next.enclosureInfo.currentBodyLengthMm = enc.currentBodyLengthMm;
    if (enc.enclosureHeightMm !== undefined) next.enclosureInfo.enclosureHeightMm = enc.enclosureHeightMm;
    if (enc.enclosureWidthMm !== undefined) next.enclosureInfo.enclosureWidthMm = enc.enclosureWidthMm;
  }
  return next;
}

function mergeOptimisticOverlay(
  baseSnapshot: BloomSnapshot | null | undefined,
  prevOverlay: OptimisticOverlayState | null,
  nextPatch: BloomOverlayPatch
): OptimisticOverlayState {
  const prevPatch: BloomOverlayPatch =
    prevOverlay && prevOverlay.forSnapshot === baseSnapshot ? prevOverlay.patch : {};
  return {
    forSnapshot: baseSnapshot,
    patch: {
      ...prevPatch,
      ...nextPatch,
      ...(prevPatch.logsByDate || nextPatch.logsByDate
        ? {
            logsByDate: {
              ...prevPatch.logsByDate,
              ...nextPatch.logsByDate
            }
          }
        : {})
    }
  };
}

export interface BloomAppProps {
  activeProfile?: PublicProfile | null | undefined;
  darkMode?: boolean | undefined;
  nowMs?: number | undefined;
  todayKey?: string | undefined;
  bloomSnapshot?: BloomSnapshot | null | undefined;
  bloomSummary?: BloomSummary | null | undefined;
  navigationIntent?: { tab?: string | undefined; action?: string | undefined; timestamp?: number | undefined } | null | undefined;
  onGlobalSync?: ((opts?: SyncFetchOptions) => void | Promise<void>) | undefined;
  showToast?: ((
    text: string,
    type?: 'success' | 'error' | 'info',
    options?: { actionLabel?: string; onAction?: () => void } | null
  ) => void) | undefined;
}

function BloomApp({
  activeProfile,
  darkMode: _darkMode,
  nowMs = Date.now(),
  todayKey: todayKeyProp,
  bloomSnapshot,
  bloomSummary,
  navigationIntent,
  onGlobalSync,
  showToast
}: BloomAppProps) {
  const canConfigure = activeProfile?.id !== 'caregiver';
  const profileId = activeProfile?.id || null;
  const scopedProfileId = activeProfile?.id ?? '';
  const activeCaregiver = activeProfile?.caregiverName || activeProfile?.name || 'Partner 1';

  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const todayKey = todayKeyProp || getLocalDateKey(now);

  const [activeTab, setActiveTab] = useState<BloomTabId>('today'); // 'today' | 'growth' | 'habitat'
  const [optimisticOverlay, setOptimisticOverlay] = useState<OptimisticOverlayState | null>(null);
  const [activeModal, setActiveModal] = useState<BloomActiveModal>(null); // null | { type: 'molt' } | { type: 'settings' } | { type: 'backfill', dateKey }
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<BloomDeleteTarget | null>(null);
  const [refusalPremoltPrompt, setRefusalPremoltPrompt] = useState(false);

  const { isPending, runLocked } = useActionLock();

  useEffect(() => {
    const navTab = navigationIntent?.tab;
    if (navTab === 'today' || navTab === 'growth' || navTab === 'habitat') {
      setActiveTab(navTab);
    }
  }, [navigationIntent]);

  const effectiveSnapshot = useMemo<BloomSnapshot | PartialBloomSnapshot | null | undefined>(() => {
    if (!optimisticOverlay || optimisticOverlay.forSnapshot !== bloomSnapshot) {
      return bloomSnapshot;
    }
    const patch = optimisticOverlay.patch;
    const base: PartialBloomSnapshot = bloomSnapshot ? { ...bloomSnapshot } : {};
    return {
      ...base,
      ...(patch.settings ? { settings: patch.settings } : {}),
      ...(patch.molts ? { molts: patch.molts } : {}),
      ...(patch.feeders ? { feeders: patch.feeders } : {}),
      ...(patch.logsByDate
        ? {
            logsByDate: {
              ...bloomSnapshot?.logsByDate,
              ...patch.logsByDate
            }
          }
        : {})
    };
  }, [bloomSnapshot, optimisticOverlay]);

  const isPropSnapshot = effectiveSnapshot === bloomSnapshot;
  const summary = useMemo(
    () =>
      isPropSnapshot && bloomSummary
        ? bloomSummary
        : computeBloomSummary(effectiveSnapshot, now),
    [isPropSnapshot, bloomSummary, effectiveSnapshot, now]
  );

  const { settings } = summary;
  const parsedHardeningHours = Number(settings.hardeningHours);
  const hardeningHours = Number.isFinite(parsedHardeningHours)
    ? Math.max(0, parsedHardeningHours)
    : 36;
  const pronounPossessive =
    settings.sex === 'Male' ? 'his' : settings.sex === 'Female' ? 'her' : 'their';

  const notify = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
      if (showToast) showToast(msg, type);
    },
    [showToast]
  );

  const applyOverlay = useCallback(
    (patch: BloomOverlayPatch) => {
      setOptimisticOverlay((prev) => mergeOptimisticOverlay(bloomSnapshot, prev, patch));
    },
    [bloomSnapshot]
  );

  // --------------------------------------------------------------------------
  // CORE API MUTATION HELPERS (caller wraps in runLocked)
  // --------------------------------------------------------------------------
  const performPatchSettings = async (patch: BloomSettingsPatch, toastMsg = ''): Promise<boolean> => {
    const optimisticSettings = mergeSettingsOptimistically(settings, patch);
    applyOverlay({ settings: optimisticSettings });

    try {
      const rpc = createRpcClient({ profileId: scopedProfileId });
      await unwrapRpc(
        rpc.api.bloom.settings.$put({
          json: patch
        })
      );
      if (toastMsg) notify(toastMsg);
      if (onGlobalSync) void onGlobalSync();
      return true;
    } catch (err) {
      setOptimisticOverlay(null);
      if (onGlobalSync) void onGlobalSync({ force: true });
      const detail =
        err instanceof Error && err.message ? err.message : 'Could not save Bloom settings';
      notify(`${detail} — reverted`, 'error');
      return false;
    }
  };

  const performSaveDayLog = async (
    dateKey: string,
    apiPayload: BloomLogPutRequest,
    applyOptimisticDay: ((day: BloomCareLog) => BloomCareLog) | null,
    settingsPatch: BloomSettingsPatch | null = null,
    toastMsg = ''
  ): Promise<boolean> => {
    const existingDay: BloomCareLog = effectiveSnapshot?.logsByDate?.[dateKey] || {
      dateKey,
      mists: [],
      feedings: [],
      climateChecks: [],
      behaviors: []
    };
    const nextDay = applyOptimisticDay ? applyOptimisticDay(existingDay) : existingDay;

    applyOverlay({
      ...(settingsPatch
        ? {
            settings: mergeSettingsOptimistically(settings, settingsPatch)
          }
        : {}),
      logsByDate: {
        [dateKey]: {
          ...nextDay,
          dateKey
        }
      }
    });

    try {
      const rpc = createRpcClient({ profileId: scopedProfileId });
      const resData = await unwrapRpc(
        rpc.api.bloom.logs[':dateKey'].$put({
          param: { dateKey },
          json: settingsPatch ? { ...apiPayload, settingsPatch } : apiPayload
        })
      );
      if (resData?.record) {
        applyOverlay({
          ...('settings' in resData && resData.settings ? { settings: resData.settings } : {}),
          logsByDate: {
            [dateKey]: resData.record
          }
        });
      }
      if (toastMsg) notify(toastMsg);
      if (onGlobalSync) void onGlobalSync();
      return true;
    } catch (err) {
      setOptimisticOverlay(null);
      if (onGlobalSync) void onGlobalSync({ force: true });
      const detail =
        err instanceof Error && err.message ? err.message : 'Could not save care log to server';
      notify(`${detail} — reverted`, 'error');
      return false;
    }
  };

  const toCareTimestamp = (dateKey: string, timeStr = '12:00'): string =>
    dateKey === todayKey ? new Date().toISOString() : buildTimestampForDate(dateKey, timeStr);

  // --------------------------------------------------------------------------
  // LOCKED MUTATION HANDLERS — DAILY CARE
  // --------------------------------------------------------------------------
  const handlePatchSettings = (patch: BloomSettingsPatch, toastMsg = '') =>
    runLocked(() => performPatchSettings(patch, toastMsg));

  const handleLogMist = (targetDate = todayKey, { timestamp, drank, note }: BloomMistInput = {}) =>
    runLocked(async () => {
      const nowIso = new Date().toISOString();
      const tsIso = timestamp || nowIso;
      const newMist: BloomMistEntry = {
        id: `mist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: tsIso,
        by: activeCaregiver,
        ...(profileId ? { byProfileId: profileId } : {}),
        dropletDrinkObserved: Boolean(drank),
        note: String(note || '').trim()
      };

      return performSaveDayLog(
        targetDate,
        { appendMist: newMist, updatedAt: nowIso },
        (day) => ({
          ...day,
          mists: [...(day.mists || []), newMist],
          ...(drank
            ? {
                behaviors: Array.from(new Set([...(day.behaviors || []), 'Drank Droplets']))
              }
            : {}),
          updatedAt: nowIso
        }),
        null,
        `Logged ${settings.mantisName}'s enclosure mist (${activeCaregiver})`
      );
    });

  const handleLogFeeding = (
    outcome = 'eaten',
    targetDate = todayKey,
    {
      timestamp,
      preyType,
      count,
      abdomenAfter,
      note,
      leavePreyWarning = false,
      overrideLockout = false
    }: BloomFeedingInput = {}
  ) => {
    if (targetDate === todayKey && summary.isNoFeedLockout && !(canConfigure && overrideLockout)) {
      notify(
        `Feeding is locked while ${
          summary.effectiveStatus === 'premolt' ? 'Premolt Watch' : 'Post-Molt Hardening'
        } is active`,
        'error'
      );
      return Promise.resolve(false);
    }

    return runLocked(async () => {
      const nowIso = new Date().toISOString();
      const tsIso = timestamp || nowIso;
      const preyMeta =
        PREY_OPTIONS.find((p) => p.id === preyType) ??
        PREY_OPTIONS.find((p) => p.id === 'hydei') ??
        PREY_OPTIONS[0] ??
        DEFAULT_PREY_OPTION;
      const trimmedAbdomen = typeof abdomenAfter === 'string' ? abdomenAfter.trim() : '';
      const resolvedAbdomen = trimmedAbdomen || (outcome === 'refused' ? '' : 'plump');
      const entry: BloomFeedingEntry = {
        id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: tsIso,
        by: activeCaregiver,
        ...(profileId ? { byProfileId: profileId } : {}),
        outcome,
        preyType: preyMeta.id,
        preyLabel: preyMeta.label,
        count: outcome === 'refused' ? 0 : Math.max(1, Number(count) || 1),
        ...(resolvedAbdomen ? { abdomenAfter: resolvedAbdomen } : {}),
        note: String(note || '').trim()
      };

      const settingsPatch: BloomSettingsPatch | null =
        targetDate === todayKey && leavePreyWarning
          ? {
              livePreyInside: true,
              livePreyByProfileId: profileId || null,
              livePreyAt: formatTimeDisplay(nowIso),
              livePreyNote: `${preyMeta.label} offered at ${formatTimeDisplay(tsIso)} by ${activeCaregiver}`
            }
          : null;

      if (
        targetDate === todayKey &&
        outcome === 'refused' &&
        summary.effectiveStatus === 'normal' &&
        canConfigure
      ) {
        setRefusalPremoltPrompt(true);
      }

      return performSaveDayLog(
        targetDate,
        {
          appendFeeding: entry,
          ...(resolvedAbdomen ? { abdomenStatus: resolvedAbdomen, abdomenUpdatedAt: tsIso } : {}),
          updatedAt: nowIso
        },
        (day) => ({
          ...day,
          feedings: [...(day.feedings || []), entry],
          ...(resolvedAbdomen ? { abdomenStatus: resolvedAbdomen, abdomenUpdatedAt: tsIso } : {}),
          updatedAt: nowIso
        }),
        settingsPatch,
        outcome === 'refused'
          ? `Logged refused ${formatShortPreyLabel(preyMeta.label)} for ${settings.mantisName}`
          : `Logged ${entry.count}× ${formatShortPreyLabel(preyMeta.label)} for ${settings.mantisName}`
      );
    });
  };

  const handleUpdateAbdomenOnly = (levelId: string, targetDate = todayKey) =>
    runLocked(async () => {
      const nowIso = new Date().toISOString();
      const tsIso = toCareTimestamp(targetDate, '12:00');
      const meta = ABDOMEN_LEVELS.find((a) => a.id === levelId);
      return performSaveDayLog(
        targetDate,
        { abdomenStatus: levelId, abdomenUpdatedAt: tsIso, updatedAt: nowIso },
        (day) => ({
          ...day,
          abdomenStatus: levelId,
          abdomenUpdatedAt: tsIso,
          updatedAt: nowIso
        }),
        null,
        `Updated ${settings.mantisName}'s abdomen check: ${meta?.label || levelId}`
      );
    });

  const handleLogClimate = (
    targetDate = todayKey,
    { temp, humidity }: BloomClimateInput = {}
  ) => {
    const tempStr = String(temp ?? '').trim();
    const humidityStr = String(humidity ?? '').trim();
    if (tempStr === '' && humidityStr === '') {
      notify('Enter a temperature or humidity reading first', 'error');
      return Promise.resolve(false);
    }

    const parsedTemp = tempStr !== '' ? Number(tempStr) : undefined;
    const parsedHumidity = humidityStr !== '' ? Number(humidityStr) : undefined;
    if (parsedTemp !== undefined && (!Number.isFinite(parsedTemp) || parsedTemp < 0 || parsedTemp > 60)) {
      notify('Temperature must be between 0°C and 60°C', 'error');
      return Promise.resolve(false);
    }
    if (
      parsedHumidity !== undefined &&
      (!Number.isFinite(parsedHumidity) || parsedHumidity < 0 || parsedHumidity > 100)
    ) {
      notify('Humidity must be between 0% and 100%', 'error');
      return Promise.resolve(false);
    }

    return runLocked(async () => {
      const nowIso = new Date().toISOString();
      const tsIso = toCareTimestamp(targetDate, '12:00');
      const check: BloomClimateCheck = {
        id: `clim-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: tsIso,
        by: activeCaregiver,
        ...(profileId ? { byProfileId: profileId } : {}),
        ...(parsedTemp !== undefined ? { tempC: parsedTemp } : {}),
        ...(parsedHumidity !== undefined ? { humidityPct: parsedHumidity } : {})
      };

      return performSaveDayLog(
        targetDate,
        { appendClimateCheck: check, updatedAt: nowIso },
        (day) => ({
          ...day,
          climateChecks: [...(day.climateChecks || []), check],
          updatedAt: nowIso
        }),
        null,
        'Logged enclosure temperature & humidity'
      );
    });
  };

  const handleToggleBehavior = (tag: string, targetDate = todayKey) =>
    runLocked(async () => {
      const nowIso = new Date().toISOString();
      return performSaveDayLog(
        targetDate,
        { toggleBehavior: tag, updatedAt: nowIso },
        (day) => {
          const existing = day.behaviors || [];
          return {
            ...day,
            behaviors: existing.includes(tag)
              ? existing.filter((b) => b !== tag)
              : [...existing, tag],
            updatedAt: nowIso
          };
        }
      );
    });

  const handleSaveJournalNote = (targetDate = todayKey, noteText = '') =>
    runLocked(async () => {
      const nowIso = new Date().toISOString();
      const text = String(noteText || '').trim();
      return performSaveDayLog(
        targetDate,
        { journalNote: text, updatedAt: nowIso },
        (day) => ({
          ...day,
          journalNote: text,
          updatedAt: nowIso
        }),
        null,
        `Saved ${settings.mantisName}'s daily note`
      );
    });

  // --------------------------------------------------------------------------
  // LOCKED MUTATION HANDLERS — LIFECYCLE, MOLTS, FEEDERS, SETTINGS, DELETES
  // --------------------------------------------------------------------------
  const handleTogglePremolt = (enable: boolean) => {
    if (!canConfigure) return Promise.resolve(false);
    if (enable && summary.effectiveStatus === 'hardening') {
      notify('Cannot enable Premolt Watch while post-molt hardening is active', 'error');
      return Promise.resolve(false);
    }
    if (enable && summary.isAdult) {
      notify('Winged adult mantises do not enter Premolt Watch', 'error');
      return Promise.resolve(false);
    }
    setRefusalPremoltPrompt(false);
    return handlePatchSettings(
      enable
        ? {
            lifecycleStatus: 'premolt',
            premoltStartedAt: new Date().toISOString(),
            hardeningUntil: null
          }
        : {
            lifecycleStatus: 'normal',
            premoltStartedAt: null,
            hardeningUntil: null
          },
      enable
        ? `Premolt Watch enabled — live prey locked out for ${settings.mantisName}`
        : `${settings.mantisName} returned to normal hunting mode`
    );
  };

  const handleSubmitMolt = (moltPayload: BloomMoltPayload) => {
    if (!canConfigure) return Promise.resolve(false);
    return runLocked(async () => {
      try {
        const rpc = createRpcClient({ profileId: scopedProfileId });
        const data = await unwrapRpc(
          rpc.api.bloom.molts.$post({
            json: {
              ...moltPayload,
              loggedBy: activeCaregiver,
              ...(profileId ? { loggedByProfileId: profileId } : {})
            }
          })
        );
        applyOverlay({
          molts: data.molts || (effectiveSnapshot?.molts as BloomMoltRecord[] | undefined),
          settings: data.settings || settings
        });
        setActiveModal(null);
        setRefusalPremoltPrompt(false);
        notify(
          moltPayload.advanceInstar
            ? `${settings.mantisName} molted from ${moltPayload.fromInstar} to ${moltPayload.toInstar}!${
                moltPayload.startHardening
                  ? ` (${hardeningHours}h hardening timer started)`
                  : ''
              }`
            : `Added historical molt (${moltPayload.fromInstar} → ${moltPayload.toInstar} on ${moltPayload.dateKey})`
        );
        if (onGlobalSync) void onGlobalSync();
        return true;
      } catch (err) {
        notify(
          err instanceof Error && err.message ? err.message : 'Could not save molt milestone',
          'error'
        );
        return false;
      }
    });
  };

  const handleAddFeederCulture = ({
    name,
    feederType,
    startedDate,
    shelfLifeDays,
    status,
    storageNote
  }: BloomFeederDraft) => {
    if (!canConfigure) return Promise.resolve(false);
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      notify('Please enter a feeder culture name', 'error');
      return Promise.resolve(false);
    }

    return runLocked(async () => {
      const id = `feeder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        const rpc = createRpcClient({ profileId: scopedProfileId });
        const data = await unwrapRpc(
          rpc.api.bloom.feeders[':feederId'].$put({
            param: { feederId: id },
            json: {
              name: trimmedName,
              feederType,
              startedDate: startedDate || todayKey,
              shelfLifeDays: Number(shelfLifeDays) || 28,
              status,
              storageNote: String(storageNote || '').trim(),
              active: true
            }
          })
        );
        applyOverlay({ feeders: data.feeders || [] });
        notify(`Added feeder culture "${trimmedName}"`);
        if (onGlobalSync) void onGlobalSync();
        return true;
      } catch (err) {
        notify(
          err instanceof Error && err.message ? err.message : 'Could not save feeder culture',
          'error'
        );
        return false;
      }
    });
  };

  const handleUpdateFeederStatus = (feeder: EnrichedBloomFeeder, nextStatus: string) => {
    if (!canConfigure) return Promise.resolve(false);
    return runLocked(async () => {
      try {
        const rpc = createRpcClient({ profileId: scopedProfileId });
        const data = await unwrapRpc(
          rpc.api.bloom.feeders[':feederId'].$put({
            param: { feederId: feeder.id },
            json: {
              name: feeder.name,
              ...(feeder.feederType !== undefined ? { feederType: feeder.feederType } : {}),
              ...(feeder.startedDate !== undefined ? { startedDate: feeder.startedDate } : {}),
              ...(feeder.shelfLifeDays !== undefined
                ? { shelfLifeDays: feeder.shelfLifeDays }
                : {}),
              status: nextStatus,
              ...(feeder.storageNote !== undefined ? { storageNote: feeder.storageNote } : {}),
              ...(feeder.active !== undefined ? { active: feeder.active } : {})
            }
          })
        );
        applyOverlay({ feeders: data.feeders || [] });
        notify(`Updated "${feeder.name}" to ${nextStatus}`);
        if (onGlobalSync) void onGlobalSync();
        return true;
      } catch (err) {
        notify(
          err instanceof Error && err.message ? err.message : 'Could not update feeder culture',
          'error'
        );
        return false;
      }
    });
  };

  const handleSaveEnclosure = (enclosureDraft: BloomEnclosureDraft) => {
    if (!canConfigure) return Promise.resolve(false);
    const parsedBodyLen = Number(enclosureDraft.currentBodyLengthMm);
    const parsedHeight = Number(enclosureDraft.enclosureHeightMm);
    const parsedWidth = Number(enclosureDraft.enclosureWidthMm);
    if (!Number.isFinite(parsedBodyLen) || parsedBodyLen <= 0) {
      notify('Mantis body length must be a positive number (mm)', 'error');
      return Promise.resolve(false);
    }
    if (!Number.isFinite(parsedHeight) || parsedHeight <= 0) {
      notify('Enclosure height must be a positive number (mm)', 'error');
      return Promise.resolve(false);
    }
    if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) {
      notify('Enclosure width must be a positive number (mm)', 'error');
      return Promise.resolve(false);
    }

    return handlePatchSettings(
      {
        enclosureInfo: {
          currentSizeLabel: enclosureDraft.currentSizeLabel,
          meshType: enclosureDraft.meshType,
          substrate: enclosureDraft.substrate,
          lastDeepCleanDate: enclosureDraft.lastDeepCleanDate,
          currentBodyLengthMm: clampFiniteNumber(parsedBodyLen, 0.1, 500, 10),
          enclosureHeightMm: clampFiniteNumber(parsedHeight, 1, 2000, 110),
          enclosureWidthMm: clampFiniteNumber(parsedWidth, 1, 2000, 75)
        }
      },
      `Updated ${settings.mantisName}'s enclosure specs`
    );
  };

  const handleMarkEnclosureCleaned = () => {
    if (!canConfigure) return Promise.resolve(false);
    return handlePatchSettings(
      {
        enclosureInfo: {
          ...settings.enclosureInfo,
          lastDeepCleanDate: todayKey
        }
      },
      `Logged enclosure substrate clean for ${settings.mantisName}`
    );
  };

  const handleSaveFullSettings = (settingsForm: BloomSettingsForm) => {
    if (!canConfigure) return Promise.resolve(false);
    return runLocked(async () => {
      const mantisName =
        (settingsForm.mantisName || '').trim() || DEFAULT_BLOOM_SETTINGS.mantisName;
      const dayTempMinC = clampSetting(settingsForm.dayTempMinC, 10, 45, 25);
      const dayTempMaxC = clampSetting(settingsForm.dayTempMaxC, dayTempMinC, 50, 28);
      const nightTempMinC = clampSetting(settingsForm.nightTempMinC, 5, dayTempMaxC, 20);
      const humidityMinPct = clampSetting(settingsForm.humidityMinPct, 10, 100, 50);
      const humidityMaxPct = clampSetting(
        settingsForm.humidityMaxPct,
        humidityMinPct,
        100,
        65
      );
      const nextInstar = settingsForm.currentInstar || DEFAULT_BLOOM_SETTINGS.currentInstar;
      const nextHardeningHours = clampSetting(settingsForm.hardeningHours, 0, 168, 36);

      const lifecyclePatch: Pick<
        BloomSettingsPatch,
        'lifecycleStatus' | 'premoltStartedAt' | 'hardeningUntil'
      > = {};
      if (nextInstar === 'Adult' && settings.lifecycleStatus === 'premolt') {
        lifecyclePatch.lifecycleStatus = 'normal';
        lifecyclePatch.premoltStartedAt = null;
      }
      if (settings.lifecycleStatus === 'hardening') {
        if (nextHardeningHours === 0) {
          lifecyclePatch.lifecycleStatus = 'normal';
          lifecyclePatch.premoltStartedAt = null;
          lifecyclePatch.hardeningUntil = null;
        } else if (nextHardeningHours !== hardeningHours && settings.hardeningUntil) {
          const prevUntilMs = Date.parse(settings.hardeningUntil) || 0;
          if (prevUntilMs > 0) {
            const startMs = prevUntilMs - hardeningHours * 3600000;
            lifecyclePatch.hardeningUntil = new Date(
              startMs + nextHardeningHours * 3600000
            ).toISOString();
          }
        }
      }

      const ok = await performPatchSettings(
        {
          mantisName,
          speciesPreset: settingsForm.speciesPreset || DEFAULT_BLOOM_SETTINGS.speciesPreset,
          commonName:
            (settingsForm.commonName || '').trim() || DEFAULT_BLOOM_SETTINGS.commonName,
          scientificName:
            (settingsForm.scientificName || '').trim() || DEFAULT_BLOOM_SETTINGS.scientificName,
          sex: settingsForm.sex || DEFAULT_BLOOM_SETTINGS.sex,
          currentInstar: nextInstar,
          arrivalDate: settingsForm.arrivalDate || settings.arrivalDate || todayKey,
          currentColorMorph: (settingsForm.currentColorMorph || '').trim(),
          dayTempMinC,
          dayTempMaxC,
          nightTempMinC,
          humidityMinPct,
          humidityMaxPct,
          mistTargetHours: clampSetting(settingsForm.mistTargetHours, 1, 168, 24),
          hardeningHours: nextHardeningHours,
          typicalInterMoltDays: clampSetting(settingsForm.typicalInterMoltDays, 1, 180, 14),
          careNote: (settingsForm.careNote || '').trim(),
          ...lifecyclePatch
        },
        `Saved ${mantisName}'s Bloom settings`
      );
      if (ok) {
        setActiveModal(null);
      }
      return ok;
    });
  };

  const handleConfirmDelete = () => {
    const target = confirmDeleteModal;
    if (!target) return Promise.resolve(false);
    if ((target.kind === 'molt' || target.kind === 'feeder') && !canConfigure) {
      return Promise.resolve(false);
    }

    return runLocked(async () => {
      const targetDate = target.dateKey || todayKey;
      const nowIso = new Date().toISOString();
      const rpc = createRpcClient({ profileId: scopedProfileId });

      if (target.kind === 'molt') {
        try {
          const data = await unwrapRpc(
            rpc.api.bloom.molts[':moltId'].$delete({
              param: { moltId: target.id }
            })
          );
          applyOverlay({
            molts: data.molts || [],
            ...(data.settings ? { settings: data.settings } : {})
          });
          notify('Removed molt record');
          if (onGlobalSync) void onGlobalSync();
          setConfirmDeleteModal(null);
          return true;
        } catch (err) {
          notify(
            err instanceof Error && err.message ? err.message : 'Could not delete molt record',
            'error'
          );
          return false;
        }
      }

      if (target.kind === 'feeder') {
        try {
          const data = await unwrapRpc(
            rpc.api.bloom.feeders[':feederId'].$delete({
              param: { feederId: target.id }
            })
          );
          applyOverlay({ feeders: data.feeders || [] });
          notify('Removed feeder culture');
          if (onGlobalSync) void onGlobalSync();
          setConfirmDeleteModal(null);
          return true;
        } catch (err) {
          notify(
            err instanceof Error && err.message ? err.message : 'Could not remove feeder culture',
            'error'
          );
          return false;
        }
      }

      if (target.kind === 'mist') {
        const ok = await performSaveDayLog(
          targetDate,
          { removeMistId: target.id, updatedAt: nowIso },
          (day) => ({
            ...day,
            mists: (day.mists || []).filter((m) => m.id !== target.id),
            updatedAt: nowIso
          }),
          null,
          'Removed mist entry'
        );
        if (ok) setConfirmDeleteModal(null);
        return ok;
      }

      if (target.kind === 'feeding') {
        const ok = await performSaveDayLog(
          targetDate,
          { removeFeedingId: target.id, updatedAt: nowIso },
          (day) => ({
            ...day,
            feedings: (day.feedings || []).filter((f) => f.id !== target.id),
            updatedAt: nowIso
          }),
          null,
          'Removed feeding entry'
        );
        if (ok) setConfirmDeleteModal(null);
        return ok;
      }

      const ok = await performSaveDayLog(
        targetDate,
        { removeClimateCheckId: target.id, updatedAt: nowIso },
        (day) => ({
          ...day,
          climateChecks: (day.climateChecks || []).filter((c) => c.id !== target.id),
          updatedAt: nowIso
        }),
        null,
        'Removed climate check'
      );
      if (ok) setConfirmDeleteModal(null);
      return ok;
    });
  };

  const confirmDeleteTitle =
    confirmDeleteModal?.kind === 'molt'
      ? 'Delete Molt Record?'
      : confirmDeleteModal?.kind === 'feeder'
        ? 'Delete Feeder Culture?'
        : confirmDeleteModal?.kind === 'mist'
          ? 'Delete Mist Entry?'
          : confirmDeleteModal?.kind === 'feeding'
            ? 'Delete Feeding Entry?'
            : 'Delete Climate Check?';

  return (
    <ModulePage module="bloom">
      {/* ====================================================================
          1. BLOOM HERO HEADER & SUB-VIEW NAVIGATION
      ==================================================================== */}
      <ModuleHeader
        accent="emerald"
        icon={Flower2}
        title={`Bloom • ${settings.mantisName}`}
        subtitle={
          <>
            {settings.commonName} (<em className="italic">{settings.scientificName}</em>)
            {settings.currentColorMorph ? ` • ${settings.currentColorMorph}` : ''}
          </>
        }
        compactActions
        badges={
          <>
            <StatusPill accent="emerald" className="font-extrabold">
              {settings.currentInstar} {summary.isAdult ? 'Winged Adult' : 'Nymph'}
            </StatusPill>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-surface-muted text-text-secondary">
              {settings.sex === 'Male'
                ? '♂ Male'
                : settings.sex === 'Female'
                  ? '♀ Female'
                  : 'Unsexed'}
            </span>
            {summary.effectiveStatus === 'premolt' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-amber-500 text-slate-950">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>Premolt Watch</span>
              </span>
            )}
            {summary.effectiveStatus === 'hardening' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-rose-600 text-white tabular-nums">
                <ShieldAlert className="w-3 h-3 shrink-0" />
                <span>Hardening ({summary.hardeningRemainingLabel})</span>
              </span>
            )}
          </>
        }
        actions={
          canConfigure ? (
            <Button
              variant="secondary"
              accent="emerald"
              size="md"
              icon={Settings}
              onClick={() => setActiveModal({ type: 'settings' })}
              title={`Configure ${settings.mantisName}'s Species & Care Settings`}
              aria-label={`Configure ${settings.mantisName}'s Species & Care Settings`}
            >
              <span className="hidden sm:inline">Settings</span>
            </Button>
          ) : null
        }
        footer={
          <SegmentedTabs
            accent="emerald"
            activeId={activeTab}
            onChange={setActiveTab}
            tabs={[
              {
                id: 'today',
                label: 'Habitat & Today',
                shortLabel: 'Today',
                icon: Droplets
              },
              {
                id: 'growth',
                label: 'Growth & Molts',
                shortLabel: 'Growth',
                icon: Sparkles,
                badge: summary.molts.length || null
              },
              {
                id: 'habitat',
                label: 'Feeders & Enclosure',
                shortLabel: 'Habitat',
                icon: Bug,
                badge:
                  (canConfigure && summary.feederAlerts.length > 0) ||
                  summary.clearance.isEnclosureTight
                    ? canConfigure && summary.feederAlerts.length > 0
                      ? summary.feederAlerts.length
                      : '!'
                    : null
              }
            ]}
          />
        }
      />

      {/* ====================================================================
          2. CRITICAL SAFETY BANNERS (UNEATEN PREY, PREMOLT, POST-MOLT HARDENING)
      ==================================================================== */}
      {settings.livePreyInside && (
        <AlertBanner
          severity="danger"
          icon={ShieldAlert}
          title={`Uneaten Live Prey Still Inside ${settings.mantisName}'s Enclosure`}
          description={`${settings.livePreyNote || 'Live feeder left inside.'} Remove roaming locusts/flies before lights-out or if ${settings.mantisName} hangs to molt.`}
          action={
            <Button
              variant="danger"
              size="md"
              disabled={isPending}
              onClick={() =>
                handlePatchSettings(
                  {
                    livePreyInside: false,
                    livePreyNote: '',
                    livePreyByProfileId: null,
                    livePreyAt: null
                  },
                  `Marked ${settings.mantisName}'s enclosure clear of live prey`
                )
              }
            >
              ✓ Prey Eaten / Removed
            </Button>
          }
        />
      )}

      {summary.effectiveStatus === 'premolt' && (
        <AlertBanner
          severity="warn"
          icon={AlertTriangle}
          title="Premolt Watch Active — Do NOT Offer Live Prey"
          description={`${settings.mantisName} is preparing to shed ${settings.currentInstar}. Remove any remaining feeders, mist the side wall lightly to maintain ~60–68% RH, and avoid bumping or opening the mesh lid while hanging.`}
          action={
            canConfigure ? (
              <>
                <Button
                  variant="primary"
                  accent="emerald"
                  size="md"
                  icon={Sparkles}
                  onClick={() => setActiveModal({ type: 'molt' })}
                >
                  <span>{settings.mantisName} Molted!</span>
                </Button>
                <Button
                  variant="secondary"
                  accent="amber"
                  size="md"
                  disabled={isPending}
                  onClick={() => handleTogglePremolt(false)}
                >
                  Exit Premolt
                </Button>
              </>
            ) : null
          }
        />
      )}

      {summary.effectiveStatus === 'hardening' && (
        <AlertBanner
          severity="danger"
          icon={Sparkles}
          title={`Post-Molt Exoskeleton Hardening (${summary.hardeningRemainingLabel} remaining)`}
          description={`${settings.mantisName}'s fresh ${settings.currentInstar} cuticle and raptorial forelegs are still soft. Hold off on live feeders until the cooldown finishes—gentle wall misting for drinking water is safe.`}
          action={
            canConfigure ? (
              <Button
                variant="dangerTinted"
                size="md"
                disabled={isPending}
                onClick={() =>
                  handlePatchSettings(
                    { lifecycleStatus: 'normal', premoltStartedAt: null, hardeningUntil: null },
                    `Ended post-molt cooldown for ${settings.mantisName}`
                  )
                }
              >
                Mark Ready Early
              </Button>
            ) : null
          }
        />
      )}

      {summary.effectiveStatus === 'hardened_ready' && (
        <AlertBanner
          severity="success"
          icon={CheckCircle2}
          title={`${settings.mantisName}'s ${settings.currentInstar} Exoskeleton Has Hardened!`}
          description={`Post-molt cooldown is complete—safe to offer ${settings.mantisName} ${pronounPossessive} first ${settings.currentInstar} meal.`}
          action={
            canConfigure ? (
              <Button
                variant="primary"
                accent="emerald"
                size="md"
                disabled={isPending}
                onClick={() =>
                  handlePatchSettings(
                    { lifecycleStatus: 'normal', premoltStartedAt: null, hardeningUntil: null },
                    `${settings.mantisName} is back in active hunting mode`
                  )
                }
              >
                Resume Hunting Mode
              </Button>
            ) : null
          }
        />
      )}

      {refusalPremoltPrompt && summary.effectiveStatus === 'normal' && canConfigure && (
        <AlertBanner
          severity="warn"
          icon={AlertTriangle}
          title={`${settings.mantisName} refused prey!`}
          description={`Refusing food is the #1 early sign of Premolt in ${settings.commonName || 'your mantis'}. Switch on Premolt Watch?`}
          action={
            <>
              <Button
                variant="primary"
                accent="amber"
                size="md"
                disabled={isPending}
                onClick={() => handleTogglePremolt(true)}
              >
                Enable Premolt Watch
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setRefusalPremoltPrompt(false)}
              >
                Not Yet
              </Button>
            </>
          }
        />
      )}

      {/* ====================================================================
          3. TAB VIEWS
      ==================================================================== */}
      {activeTab === 'today' && (
        <BloomTodayTab
          settings={settings}
          summary={summary}
          logsByDate={effectiveSnapshot?.logsByDate}
          todayKey={todayKey}
          activeCaregiver={activeCaregiver}
          canConfigure={canConfigure}
          isPending={isPending}
          onLogMist={handleLogMist}
          onLogFeeding={handleLogFeeding}
          onUpdateAbdomenOnly={handleUpdateAbdomenOnly}
          onLogClimate={handleLogClimate}
          onToggleBehavior={handleToggleBehavior}
          onSaveJournalNote={handleSaveJournalNote}
          onTogglePremolt={handleTogglePremolt}
          onOpenMoltModal={() => setActiveModal({ type: 'molt' })}
          onOpenBackfillModal={(dateKey) => setActiveModal({ type: 'backfill', dateKey })}
          onRequestDelete={setConfirmDeleteModal}
        />
      )}

      {activeTab === 'growth' && (
        <BloomGrowthTab
          settings={settings}
          summary={summary}
          todayKey={todayKey}
          canConfigure={canConfigure}
          isPending={isPending}
          pronounPossessive={pronounPossessive}
          onOpenMoltModal={() => setActiveModal({ type: 'molt' })}
          onRequestDelete={setConfirmDeleteModal}
        />
      )}

      {activeTab === 'habitat' && (
        <BloomHabitatTab
          settings={settings}
          summary={summary}
          todayKey={todayKey}
          canConfigure={canConfigure}
          isPending={isPending}
          onAddFeederCulture={handleAddFeederCulture}
          onUpdateFeederStatus={handleUpdateFeederStatus}
          onSaveEnclosure={handleSaveEnclosure}
          onMarkEnclosureCleaned={handleMarkEnclosureCleaned}
          onRequestDelete={setConfirmDeleteModal}
        />
      )}

      {/* ====================================================================
          4. CONDITIONAL MODALS (ZERO VDOM / DRAFT ISOLATION WHEN CLOSED)
      ==================================================================== */}
      {activeModal?.type === 'molt' && canConfigure && (
        <BloomMoltModal
          settings={settings}
          latestMoltDateKey={summary.molts[0]?.dateKey || null}
          todayKey={todayKey}
          hardeningHours={hardeningHours}
          isPending={isPending}
          onClose={() => setActiveModal(null)}
          onSubmit={handleSubmitMolt}
        />
      )}

      {activeModal?.type === 'settings' && canConfigure && (
        <BloomSettingsModal
          settings={settings}
          isPending={isPending}
          onClose={() => setActiveModal(null)}
          onSave={handleSaveFullSettings}
        />
      )}

      {activeModal?.type === 'backfill' && (
        <BloomBackfillModal
          key={activeModal.dateKey}
          dateKey={activeModal.dateKey}
          todayKey={todayKey}
          dayRecord={effectiveSnapshot?.logsByDate?.[activeModal.dateKey]}
          latestAbdomen={summary.latestAbdomen}
          activeCaregiver={activeCaregiver}
          isPending={isPending}
          onClose={() => setActiveModal(null)}
          onLogMist={handleLogMist}
          onLogFeeding={handleLogFeeding}
          onUpdateAbdomenOnly={handleUpdateAbdomenOnly}
          onLogClimate={handleLogClimate}
          onToggleBehavior={handleToggleBehavior}
          onSaveJournalNote={handleSaveJournalNote}
          onRequestDelete={setConfirmDeleteModal}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(
          confirmDeleteModal &&
            (confirmDeleteModal.kind === 'molt' || confirmDeleteModal.kind === 'feeder'
              ? canConfigure
              : true)
        )}
        onClose={() => setConfirmDeleteModal(null)}
        onConfirm={handleConfirmDelete}
        title={confirmDeleteTitle}
        icon={AlertTriangle}
        accent="rose"
        confirmText="Delete"
        danger
        isPending={isPending}
        zIndexClass="z-[60]"
        maxWidthClass="max-w-sm"
      >
        {confirmDeleteModal && (
          <p className="text-xs text-text-secondary leading-relaxed break-words">
            Are you sure you want to permanently remove{' '}
            <span className="font-bold text-text-primary">{confirmDeleteModal.label}</span>? This
            cannot be undone.
          </p>
        )}
      </ConfirmModal>
    </ModulePage>
  );
}

export default React.memo(BloomApp);
