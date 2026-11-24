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
import {
  ConfirmModal,
  ModuleHeader,
  SegmentedTabs,
  StatusPill
} from '../components/HowardUI.jsx';
import {
  DEFAULT_BLOOM_SETTINGS,
  buildTimestampForDate,
  clampFiniteNumber,
  computeBloomSummary,
  formatShortPreyLabel,
  formatTimeDisplay,
  getLocalDateKey
} from '../utils/householdHelpers.js';
import { apiRequest } from '../utils/apiClient.js';
import { useActionLock } from '../hooks/useActionLock.js';
import {
  ABDOMEN_LEVELS,
  INSTAR_STAGES,
  PREY_OPTIONS,
  SPECIES_PRESETS,
  getSuggestedNextInstar
} from './bloom/bloomConstants.js';
import BloomTodayTab from './bloom/BloomTodayTab.jsx';
import BloomGrowthTab from './bloom/BloomGrowthTab.jsx';
import BloomHabitatTab from './bloom/BloomHabitatTab.jsx';
import BloomMoltModal from './bloom/BloomMoltModal.jsx';
import BloomSettingsModal from './bloom/BloomSettingsModal.jsx';
import BloomBackfillModal from './bloom/BloomBackfillModal.jsx';

export {
  DEFAULT_BLOOM_SETTINGS,
  computeBloomSummary,
  INSTAR_STAGES,
  getSuggestedNextInstar,
  SPECIES_PRESETS,
  ABDOMEN_LEVELS,
  PREY_OPTIONS
};

const clampSetting = (val, min, max, fallback) =>
  clampFiniteNumber(String(val ?? '').trim() === '' ? undefined : val, min, max, fallback);

function mergeOptimisticOverlay(baseSnapshot, prevOverlay, nextPatch) {
  const prevPatch =
    prevOverlay && prevOverlay.forSnapshot === baseSnapshot ? prevOverlay.patch : {};
  return {
    forSnapshot: baseSnapshot,
    patch: {
      ...prevPatch,
      ...nextPatch,
      ...(prevPatch.settings || nextPatch.settings
        ? {
            settings: {
              ...prevPatch.settings,
              ...nextPatch.settings,
              ...(prevPatch.settings?.enclosureInfo || nextPatch.settings?.enclosureInfo
                ? {
                    enclosureInfo: {
                      ...prevPatch.settings?.enclosureInfo,
                      ...nextPatch.settings?.enclosureInfo
                    }
                  }
                : {})
            }
          }
        : {}),
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
}) {
  const canConfigure = activeProfile?.id !== 'caregiver';
  const profileId = activeProfile?.id || '';
  const activeCaregiver = activeProfile?.caregiverName || activeProfile?.name || 'Partner 1';

  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const todayKey = todayKeyProp || getLocalDateKey(now);

  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'growth' | 'habitat'
  const [optimisticOverlay, setOptimisticOverlay] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // null | { type: 'molt' } | { type: 'settings' } | { type: 'backfill', dateKey }
  const [confirmDeleteModal, setConfirmDeleteModal] = useState(null);
  const [refusalPremoltPrompt, setRefusalPremoltPrompt] = useState(false);

  const { isPending, runLocked } = useActionLock();

  useEffect(() => {
    if (
      navigationIntent?.tab &&
      ['today', 'growth', 'habitat'].includes(navigationIntent.tab)
    ) {
      setActiveTab(navigationIntent.tab);
    }
  }, [navigationIntent]);

  const effectiveSnapshot = useMemo(() => {
    if (!optimisticOverlay || optimisticOverlay.forSnapshot !== bloomSnapshot) {
      return bloomSnapshot;
    }
    const patch = optimisticOverlay.patch;
    return {
      ...bloomSnapshot,
      ...(patch.settings
        ? {
            settings: {
              ...bloomSnapshot?.settings,
              ...patch.settings,
              enclosureInfo: {
                ...bloomSnapshot?.settings?.enclosureInfo,
                ...patch.settings.enclosureInfo
              }
            }
          }
        : {}),
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
    (msg, type = 'success') => {
      if (showToast) showToast(msg, type);
    },
    [showToast]
  );

  const applyOverlay = useCallback(
    (patch) => {
      setOptimisticOverlay((prev) => mergeOptimisticOverlay(bloomSnapshot, prev, patch));
    },
    [bloomSnapshot]
  );

  // --------------------------------------------------------------------------
  // CORE API MUTATION HELPERS (caller wraps in runLocked)
  // --------------------------------------------------------------------------
  const performPatchSettings = async (patch, toastMsg = '') => {
    const optimisticSettings = {
      ...settings,
      ...patch,
      enclosureInfo: {
        ...settings.enclosureInfo,
        ...patch.enclosureInfo
      }
    };
    applyOverlay({ settings: optimisticSettings });

    try {
      await apiRequest('/api/bloom/settings', {
        method: 'PUT',
        body: patch,
        profileId
      });
      if (toastMsg) notify(toastMsg);
      if (onGlobalSync) onGlobalSync();
      return true;
    } catch {
      setOptimisticOverlay(null);
      if (onGlobalSync) onGlobalSync({ force: true });
      notify('Could not save Bloom settings — reverted', 'error');
      return false;
    }
  };

  const performSaveDayLog = async (
    dateKey,
    apiPayload,
    applyOptimisticDay,
    settingsPatch = null,
    toastMsg = ''
  ) => {
    const existingDay = effectiveSnapshot?.logsByDate?.[dateKey] || {
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
            settings: {
              ...settings,
              ...settingsPatch,
              enclosureInfo: {
                ...settings.enclosureInfo,
                ...settingsPatch.enclosureInfo
              }
            }
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
      const resData = await apiRequest(`/api/bloom/logs/${encodeURIComponent(dateKey)}`, {
        method: 'PUT',
        body: settingsPatch ? { ...apiPayload, settingsPatch } : apiPayload,
        profileId
      });
      if (resData?.record) {
        applyOverlay({
          ...(resData.settings ? { settings: resData.settings } : {}),
          logsByDate: {
            [dateKey]: resData.record
          }
        });
      }
      if (toastMsg) notify(toastMsg);
      if (onGlobalSync) onGlobalSync();
      return true;
    } catch {
      setOptimisticOverlay(null);
      if (onGlobalSync) onGlobalSync({ force: true });
      notify('Could not save care log to server — reverted', 'error');
      return false;
    }
  };

  const toCareTimestamp = (dateKey, timeStr = '12:00') =>
    dateKey === todayKey ? new Date().toISOString() : buildTimestampForDate(dateKey, timeStr);

  // --------------------------------------------------------------------------
  // LOCKED MUTATION HANDLERS — DAILY CARE
  // --------------------------------------------------------------------------
  const handlePatchSettings = (patch, toastMsg = '') =>
    runLocked(() => performPatchSettings(patch, toastMsg));

  const handleLogMist = (targetDate = todayKey, { timestamp, drank, note } = {}) =>
    runLocked(async () => {
      const nowIso = new Date().toISOString();
      const tsIso = timestamp || nowIso;
      const newMist = {
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
    { timestamp, preyId, count, abdomenAfter, note, leavePreyWarning = false } = {}
  ) =>
    runLocked(async () => {
      const nowIso = new Date().toISOString();
      const tsIso = timestamp || nowIso;
      const preyMeta = PREY_OPTIONS.find((p) => p.id === preyId) || PREY_OPTIONS[1];
      const entry = {
        id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: tsIso,
        by: activeCaregiver,
        ...(profileId ? { byProfileId: profileId } : {}),
        outcome,
        preyId: preyMeta.id,
        preyLabel: preyMeta.label,
        count: outcome === 'refused' ? 0 : Math.max(1, Number(count) || 1),
        abdomenAfter: abdomenAfter || 'plump',
        note: String(note || '').trim()
      };

      const settingsPatch =
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
          abdomenStatus: entry.abdomenAfter,
          abdomenUpdatedAt: tsIso,
          updatedAt: nowIso
        },
        (day) => ({
          ...day,
          feedings: [...(day.feedings || []), entry],
          abdomenStatus: entry.abdomenAfter,
          abdomenUpdatedAt: tsIso,
          updatedAt: nowIso
        }),
        settingsPatch,
        outcome === 'refused'
          ? `Logged refused meal for ${settings.mantisName}`
          : `Logged ${entry.count}× ${formatShortPreyLabel(preyMeta.label)} for ${settings.mantisName}`
      );
    });

  const handleUpdateAbdomenOnly = (levelId, targetDate = todayKey) =>
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

  const handleLogClimate = (targetDate = todayKey, { temp, humidity } = {}) => {
    if (String(temp ?? '').trim() === '' && String(humidity ?? '').trim() === '') {
      notify('Enter a temperature or humidity reading first', 'error');
      return Promise.resolve(false);
    }

    return runLocked(async () => {
      const nowIso = new Date().toISOString();
      const tsIso = toCareTimestamp(targetDate, '12:00');
      const check = {
        id: `clim-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: tsIso,
        by: activeCaregiver,
        ...(profileId ? { byProfileId: profileId } : {}),
        tempC: String(temp ?? '').trim() !== '' ? Number(temp) : null,
        humidityPct: String(humidity ?? '').trim() !== '' ? Number(humidity) : null
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

  const handleToggleBehavior = (tag, targetDate = todayKey) =>
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
  const handleTogglePremolt = (enable) => {
    if (!canConfigure) return Promise.resolve(false);
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

  const handleSubmitMolt = (moltPayload) => {
    if (!canConfigure) return Promise.resolve(false);
    return runLocked(async () => {
      try {
        const data = await apiRequest('/api/bloom/molts', {
          method: 'POST',
          body: {
            ...moltPayload,
            loggedBy: activeCaregiver,
            ...(profileId ? { loggedByProfileId: profileId } : {})
          },
          profileId
        });
        applyOverlay({
          molts: data.molts || effectiveSnapshot?.molts,
          settings: data.settings || settings
        });
        setActiveModal(null);
        setRefusalPremoltPrompt(false);
        notify(
          moltPayload.advanceInstar
            ? `🎉 ${settings.mantisName} molted from ${moltPayload.fromInstar} to ${moltPayload.toInstar}!${
                moltPayload.startHardening
                  ? ` (${hardeningHours}h hardening timer started)`
                  : ''
              }`
            : `Added historical molt (${moltPayload.fromInstar} → ${moltPayload.toInstar} on ${moltPayload.dateKey})`
        );
        if (onGlobalSync) onGlobalSync();
        return true;
      } catch (err) {
        notify(err?.message || 'Could not save molt milestone', 'error');
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
  }) => {
    if (!canConfigure) return Promise.resolve(false);
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      notify('Please enter a feeder culture name', 'error');
      return Promise.resolve(false);
    }

    return runLocked(async () => {
      const id = `feeder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        const data = await apiRequest(`/api/bloom/feeders/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: {
            name: trimmedName,
            feederType,
            startedDate: startedDate || todayKey,
            shelfLifeDays: Number(shelfLifeDays) || 28,
            status,
            storageNote: String(storageNote || '').trim(),
            active: true
          },
          profileId
        });
        applyOverlay({ feeders: data.feeders || [] });
        notify(`Added feeder culture "${trimmedName}"`);
        if (onGlobalSync) onGlobalSync();
        return true;
      } catch {
        notify('Could not save feeder culture', 'error');
        return false;
      }
    });
  };

  const handleUpdateFeederStatus = (feeder, nextStatus) => {
    if (!canConfigure) return Promise.resolve(false);
    return runLocked(async () => {
      try {
        const data = await apiRequest(`/api/bloom/feeders/${encodeURIComponent(feeder.id)}`, {
          method: 'PUT',
          body: { ...feeder, status: nextStatus },
          profileId
        });
        applyOverlay({ feeders: data.feeders || [] });
        notify(`Updated "${feeder.name}" to ${nextStatus}`);
        if (onGlobalSync) onGlobalSync();
        return true;
      } catch {
        notify('Could not update feeder culture', 'error');
        return false;
      }
    });
  };

  const handleSaveEnclosure = (enclosureDraft) => {
    if (!canConfigure) return Promise.resolve(false);
    return handlePatchSettings(
      {
        enclosureInfo: {
          ...enclosureDraft,
          currentBodyLengthMm: clampSetting(enclosureDraft.currentBodyLengthMm, 1, 500, 10),
          enclosureHeightMm: clampSetting(enclosureDraft.enclosureHeightMm, 1, 2000, 110),
          enclosureWidthMm: clampSetting(enclosureDraft.enclosureWidthMm, 1, 2000, 75)
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

  const handleSaveFullSettings = (settingsForm) => {
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

      const ok = await performPatchSettings(
        {
          mantisName,
          speciesPreset: settingsForm.speciesPreset || DEFAULT_BLOOM_SETTINGS.speciesPreset,
          commonName:
            (settingsForm.commonName || '').trim() || DEFAULT_BLOOM_SETTINGS.commonName,
          scientificName:
            (settingsForm.scientificName || '').trim() || DEFAULT_BLOOM_SETTINGS.scientificName,
          sex: settingsForm.sex || DEFAULT_BLOOM_SETTINGS.sex,
          currentInstar: settingsForm.currentInstar || DEFAULT_BLOOM_SETTINGS.currentInstar,
          arrivalDate: settingsForm.arrivalDate || settings.arrivalDate || todayKey,
          currentColorMorph: (settingsForm.currentColorMorph || '').trim(),
          dayTempMinC,
          dayTempMaxC,
          nightTempMinC,
          humidityMinPct,
          humidityMaxPct,
          mistTargetHours: clampSetting(settingsForm.mistTargetHours, 1, 168, 24),
          hardeningHours: clampSetting(settingsForm.hardeningHours, 0, 168, 36),
          typicalInterMoltDays: clampSetting(settingsForm.typicalInterMoltDays, 1, 180, 14),
          careNote: (settingsForm.careNote || '').trim()
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

      if (target.kind === 'molt') {
        try {
          const data = await apiRequest(`/api/bloom/molts/${encodeURIComponent(target.id)}`, {
            method: 'DELETE',
            profileId
          });
          applyOverlay({
            molts: data.molts || [],
            ...(data.settings ? { settings: data.settings } : {})
          });
          notify('Removed molt record');
          if (onGlobalSync) onGlobalSync();
          setConfirmDeleteModal(null);
          return true;
        } catch {
          notify('Could not delete molt record', 'error');
          return false;
        }
      }

      if (target.kind === 'feeder') {
        try {
          const data = await apiRequest(`/api/bloom/feeders/${encodeURIComponent(target.id)}`, {
            method: 'DELETE',
            profileId
          });
          applyOverlay({ feeders: data.feeders || [] });
          notify('Removed feeder culture');
          if (onGlobalSync) onGlobalSync();
          setConfirmDeleteModal(null);
          return true;
        } catch {
          notify('Could not remove feeder culture', 'error');
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
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
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
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-amber-500 text-slate-950">
                ⚠️ Premolt Watch
              </span>
            )}
            {summary.effectiveStatus === 'hardening' && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-rose-600 text-white">
                🛡️ Hardening ({summary.hardeningRemainingLabel})
              </span>
            )}
          </>
        }
        actions={
          canConfigure ? (
            <button
              type="button"
              onClick={() => setActiveModal({ type: 'settings' })}
              className="min-h-[40px] min-w-[40px] px-3 py-2 rounded-xl border border-border-strong bg-surface-subtle text-text-primary hover:bg-surface-hover text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
              title={`Configure ${settings.mantisName}'s Species & Care Settings`}
              aria-label={`Configure ${settings.mantisName}'s Species & Care Settings`}
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
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
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-rose-500/10 border-rose-500/40 text-rose-950 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold">
                Uneaten Live Prey Still Inside {settings.mantisName}&apos;s Enclosure
              </h2>
              <p className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed break-words">
                {settings.livePreyNote || 'Live feeder left inside.'} Remove roaming
                locusts/flies before lights-out or if {settings.mantisName} hangs to molt.
              </p>
            </div>
          </div>
          <button
            type="button"
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
            className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shrink-0 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
          >
            ✓ Prey Eaten / Removed
          </button>
        </section>
      )}

      {summary.effectiveStatus === 'premolt' && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-amber-500/15 border-amber-500/50 text-amber-950 dark:text-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm sm:text-base font-extrabold">
                Premolt Watch Active — Do NOT Offer Live Prey
              </h2>
              <p className="text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
                {settings.mantisName} is preparing to shed {settings.currentInstar}. Remove any
                remaining feeders, mist the side wall lightly to maintain ~60–68% RH, and avoid
                bumping or opening the mesh lid while hanging.
              </p>
            </div>
          </div>
          {canConfigure && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveModal({ type: 'molt' })}
                className="min-h-[40px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs active:scale-[0.98] transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>🎉 {settings.mantisName} Molted!</span>
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleTogglePremolt(false)}
                className="min-h-[40px] px-3.5 py-2.5 rounded-xl bg-surface-card text-text-primary hover:bg-surface-hover text-xs font-bold border border-amber-500/40 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
              >
                Exit Premolt
              </button>
            </div>
          )}
        </section>
      )}

      {summary.effectiveStatus === 'hardening' && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-rose-500/10 border-rose-500/40 text-rose-950 dark:text-rose-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm sm:text-base font-extrabold">
                Post-Molt Exoskeleton Hardening ({summary.hardeningRemainingLabel} remaining)
              </h2>
              <p className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed">
                {settings.mantisName}&apos;s fresh {settings.currentInstar} cuticle and raptorial
                forelegs are still soft. Hold off on live feeders until the cooldown finishes—gentle
                wall misting for drinking water is safe.
              </p>
            </div>
          </div>
          {canConfigure && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                handlePatchSettings(
                  { lifecycleStatus: 'normal', hardeningUntil: null },
                  `Ended post-molt cooldown for ${settings.mantisName}`
                )
              }
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/40 text-rose-900 dark:text-rose-100 text-xs font-bold shrink-0 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
            >
              Mark Ready Early
            </button>
          )}
        </section>
      )}

      {summary.effectiveStatus === 'hardened_ready' && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-emerald-500/10 border-emerald-500/40 text-emerald-950 dark:text-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="text-xs">
              <div className="font-extrabold text-sm">
                ✨ {settings.mantisName}&apos;s {settings.currentInstar} Exoskeleton Has Hardened!
              </div>
              <p className="text-emerald-900 dark:text-emerald-200">
                Post-molt cooldown is complete—safe to offer {settings.mantisName}{' '}
                {pronounPossessive} first {settings.currentInstar} meal.
              </p>
            </div>
          </div>
          {canConfigure && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                handlePatchSettings(
                  { lifecycleStatus: 'normal', hardeningUntil: null },
                  `${settings.mantisName} is back in active hunting mode`
                )
              }
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shrink-0 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
            >
              Resume Hunting Mode
            </button>
          )}
        </section>
      )}

      {refusalPremoltPrompt && summary.effectiveStatus === 'normal' && canConfigure && (
        <section className="rounded-2xl p-3.5 border bg-amber-500/10 border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div>
            <strong>{settings.mantisName} refused prey!</strong> Refusing food is the #1 early
            sign of Premolt in {settings.commonName || 'your mantis'}. Switch on Premolt Watch?
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleTogglePremolt(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
            >
              Enable Premolt Watch
            </button>
            <button
              type="button"
              onClick={() => setRefusalPremoltPrompt(false)}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-surface-muted text-text-primary hover:bg-surface-hover font-semibold active:scale-[0.98] transition cursor-pointer"
            >
              Not Yet
            </button>
          </div>
        </section>
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
    </main>
  );
}

export default React.memo(BloomApp);
