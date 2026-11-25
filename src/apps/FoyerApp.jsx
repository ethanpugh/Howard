import React, { memo, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  Bug,
  Calendar,
  Cat,
  Droplets,
  Flower2,
  Heart,
  Home,
  Phone,
  Pin,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  StickyNote,
  UserCheck,
  Wallet
} from 'lucide-react';
import {
  computeBloomSummary,
  computeBottleStatus,
  doesAlmanacEventOccurOnDate,
  formatFriendlyDate,
  formatGBP,
  formatShortPreyLabel,
  getLedgerScheduleInfo,
  getLocalDateKey,
  isAlmanacEventVisibleToProfile,
  parseLocalDateKey,
  shiftDateKey,
  toMonthlyAmount
} from '../utils/householdHelpers.js';
import {
  EmptyStateCard,
  IconBadge,
  ModuleHeader,
  OpenModulePill,
  SectionCard,
  StatusPill,
  SubSurface
} from '../components/HowardUI.jsx';
import QuickDoseCard from './foyer/QuickDoseCard.jsx';
import { getQuillColorMeta } from './quill/quillConstants.js';

function FoyerApp({
  activeProfile,
  profiles,
  darkMode: _darkMode,
  nowMs = Date.now(),
  todayKey: propTodayKey,
  cadenceSnapshot,
  bloomSnapshot,
  bloomSummary: bloomSummaryProp,
  floodgateSnapshot,
  almanacEvents,
  ledgerData,
  beaconInfo,
  quillSnapshot,
  onNavigateApp,
  onQuickRecordDose,
  onQuickMistMantis,
  onClearMantisLivePrey,
  onOpenFloodgate,
  onOpenBloom,
  onOpenAlmanacDate,
  onOpenQuill,
  onOpenProfileModal,
  quickActionPending = false
}) {
  const todayKey = propTodayKey || getLocalDateKey(new Date(nowMs));
  const hour = new Date(nowMs).getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const headerDateLabel = useMemo(
    () =>
      parseLocalDateKey(todayKey).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }),
    [todayKey]
  );

  const catName = cadenceSnapshot?.settings?.catName || 'Pet';
  const bloomSummary = useMemo(
    () => bloomSummaryProp || computeBloomSummary(bloomSnapshot, new Date(nowMs)),
    [bloomSummaryProp, bloomSnapshot, nowMs]
  );
  const mantisName = bloomSummary.settings.mantisName || 'Mantis';
  const partner1Name = (profiles || []).find((p) => p.id === 'partner1')?.name || 'Partner 1';
  const partner2Name = (profiles || []).find((p) => p.id === 'partner2')?.name || 'Partner 2';
  const medName = cadenceSnapshot?.settings?.medicationName || 'Oral Solution';
  const dosageLabel = cadenceSnapshot?.settings?.dosageLabel || '2.5 mg / 0.5 ml';
  const amTarget = cadenceSnapshot?.settings?.morningTargetTime || '08:00';
  const pmTarget = cadenceSnapshot?.settings?.eveningTargetTime || '20:00';
  const caregiverLabel = activeProfile.caregiverName || activeProfile.name;

  const todayCadence = cadenceSnapshot?.logsByDate?.[todayKey] || {};
  const amDose = todayCadence.morning;
  const pmDose = todayCadence.evening;

  const bottleAlert = useMemo(
    () => computeBottleStatus(cadenceSnapshot?.settings, todayKey),
    [cadenceSnapshot?.settings, todayKey]
  );

  const upcomingEvents = useMemo(() => {
    const visibleEvents = (almanacEvents || []).filter((e) =>
      isAlmanacEventVisibleToProfile(e, activeProfile, partner2Name)
    );

    const occurrences = [];
    for (let offset = 0; offset <= 21; offset++) {
      const dKey = shiftDateKey(todayKey, offset);
      visibleEvents.forEach((evt) => {
        if (doesAlmanacEventOccurOnDate(evt, dKey)) {
          if (
            evt.recurrence &&
            evt.recurrence !== 'none' &&
            occurrences.some((o) => o.baseId === evt.id)
          ) {
            return;
          }
          occurrences.push({
            ...evt,
            id: `${evt.id}-${dKey}`,
            baseId: evt.id,
            date: dKey
          });
        }
      });
    }

    return occurrences
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
      .slice(0, 4);
  }, [almanacEvents, todayKey, activeProfile, partner2Name]);

  const ledgerBriefing = useMemo(() => {
    const recurring = (ledgerData?.recurring || []).filter((r) => r.active !== false);
    const expenses = ledgerData?.expenses || [];
    const currentMonthPrefix = todayKey.slice(0, 7);
    const todayRef = parseLocalDateKey(todayKey);

    const upcomingBills = recurring
      .map((r) => {
        const { daysUntil, nextDateFormatted } = getLedgerScheduleInfo(r, false, todayRef);
        return {
          ...r,
          daysUntil,
          nextFormatted: nextDateFormatted
        };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);

    const totalMonthlyCommitted = recurring.reduce(
      (acc, r) => acc + toMonthlyAmount(r.amount, r.cycle),
      0
    );
    const currentMonthExpenses = expenses
      .filter((e) => (e.date || '').slice(0, 7) === currentMonthPrefix)
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    return {
      upcomingBills: upcomingBills.slice(0, 3),
      totalMonthlyCommitted,
      currentMonthExpenses
    };
  }, [ledgerData, todayKey]);

  const partner2TodayLog = floodgateSnapshot?.logsByDate?.[todayKey] || null;
  const navigateCadence = useCallback(() => onNavigateApp('cadence'), [onNavigateApp]);

  const foyerQuillSummary = useMemo(() => {
    const all = (quillSnapshot?.notes || []).filter(
      (n) => n && n.status === 'active' && n.visibility === 'shared'
    );
    const scoped =
      activeProfile.id === 'caregiver' ? all.filter((n) => Boolean(n.caregiverVisible)) : all;
    const pinnedFirst = [...scoped].sort(
      (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        Number(a.position ?? 0) - Number(b.position ?? 0)
    );
    return {
      notes: pinnedFirst.slice(0, 3),
      totalPinnedCount: scoped.filter((n) => Boolean(n.pinned)).length,
      totalActiveCount: scoped.length
    };
  }, [quillSnapshot, activeProfile.id]);

  const stripMarkdownPreview = (raw = '') =>
    String(raw || '')
      .replace(/^#{1,3}\s+/gm, '')
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/~~([^~\n]+)~~/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      {/* 1. FOYER WELCOME BANNER & QUICK PROFILE CONTEXT */}
      <ModuleHeader
        accent="teal"
        icon={Home}
        title={`${greeting}, ${activeProfile.name} ${activeProfile.badgeEmoji}`}
        badges={
          <StatusPill accent="teal" className="uppercase tracking-wider">
            <Sparkles className="w-3 h-3 shrink-0" />
            <span>Foyer • {headerDateLabel}</span>
          </StatusPill>
        }
        subtitle={
          activeProfile.id === 'caregiver'
            ? `Caregiver & Pet Sitter View — ${catName}'s medicine, ${mantisName}'s mantis habitat, and emergency house guide.`
            : `Here is your live household briefing across ${catName}'s medicine, ${mantisName}'s growth & habitat, calendar events, and finances.`
        }
        compactActions
        actions={
          <button
            type="button"
            onClick={onOpenProfileModal}
            className="min-w-[44px] min-h-[44px] px-3 py-2 sm:px-3.5 rounded-xl text-xs font-bold border bg-surface-subtle border-border-strong text-text-primary hover:bg-surface-hover inline-flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
            title={`Switch User (${activeProfile.name})`}
            aria-label={`Switch User (${activeProfile.name})`}
          >
            <UserCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="hidden sm:inline">Switch User ({activeProfile.name})</span>
          </button>
        }
      />

      {/* 2. BOTTLE EXPIRY WARNING BANNER (AUTO-SURFACED WHEN <= 14 DAYS) */}
      {bottleAlert.isAlert && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-amber-500/10 border-amber-500/40 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold">
                {bottleAlert.daysRemaining <= 0
                  ? `${catName}'s ${medName} Bottle Has Reached Expiry`
                  : `${catName}'s ${medName} Bottle Expires in ${bottleAlert.daysRemaining} Days`}
              </h3>
              <p className="text-xs text-amber-900 dark:text-amber-200">
                {activeProfile.id === 'caregiver'
                  ? `Discard date: ${bottleAlert.expiryFormatted}. Please let a household member know a fresh bottle is needed.`
                  : `Discard date: ${bottleAlert.expiryFormatted}. Open Cadence when starting a fresh bottle.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={navigateCadence}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shrink-0 cursor-pointer active:scale-[0.98] transition"
          >
            {activeProfile.id === 'caregiver'
              ? 'View in Cadence →'
              : 'Manage Bottle in Cadence →'}
          </button>
        </section>
      )}

      {/* BLOOM SAFETY ALERTS */}
      {bloomSummary.settings.livePreyInside && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-rose-500/10 border-rose-500/40 text-rose-950 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold">
                Uneaten Live Prey Inside {mantisName}&apos;s Enclosure
              </h3>
              <p className="text-xs text-rose-900 dark:text-rose-200">
                {bloomSummary.settings.livePreyNote || 'Live feeder left inside.'} Check that{' '}
                {mantisName} ate or remove before lights-out.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={quickActionPending}
            onClick={onClearMantisLivePrey}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 cursor-pointer active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            ✓ Prey Eaten / Removed
          </button>
        </section>
      )}

      {bloomSummary.isNoFeedLockout && (
        <section
          className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            bloomSummary.effectiveStatus === 'premolt'
              ? 'bg-amber-500/15 border-amber-500/50 text-amber-950 dark:text-amber-100'
              : 'bg-rose-500/10 border-rose-500/40 text-rose-950 dark:text-rose-100'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                bloomSummary.effectiveStatus === 'premolt'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-rose-600 text-white'
              }`}
            >
              <Flower2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold">
                {bloomSummary.effectiveStatus === 'premolt'
                  ? `⚠️ ${mantisName} is in Premolt Watch — Do NOT Offer Live Prey`
                  : `🛡️ ${mantisName} Molted to ${bloomSummary.settings.currentInstar} — Hardening (${bloomSummary.hardeningRemainingLabel} left)`}
              </h3>
              <p
                className={`text-xs ${
                  bloomSummary.effectiveStatus === 'premolt'
                    ? 'text-amber-900 dark:text-amber-100'
                    : 'text-rose-900 dark:text-rose-200'
                }`}
              >
                {bloomSummary.effectiveStatus === 'premolt'
                  ? 'Keep enclosure unobstructed and mist wall gently; do not bump lid or leave feeders inside.'
                  : 'New exoskeleton is hardening—gentle wall misting only, hold all live prey until timer finishes.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateApp('bloom')}
            className={`min-h-[44px] px-4 py-2 rounded-xl font-bold text-xs shrink-0 cursor-pointer active:scale-[0.98] transition ${
              bloomSummary.effectiveStatus === 'premolt'
                ? 'bg-amber-700 hover:bg-amber-800 text-white'
                : 'bg-rose-600 hover:bg-rose-700 text-white'
            }`}
          >
            Open Bloom &rarr;
          </button>
        </section>
      )}

      {bloomSummary.feederAlerts.length > 0 && activeProfile.id !== 'caregiver' && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-emerald-500/10 border-emerald-500/40 text-emerald-950 dark:text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
              <Bug className="w-5 h-5" />
            </div>
            <div className="text-xs min-w-0">
              <div className="font-extrabold text-sm">
                {mantisName}&apos;s Feeder Stash Alert ({bloomSummary.feederAlerts[0].name})
              </div>
              <p className="text-emerald-900 dark:text-emerald-200">
                {bloomSummary.feederAlerts.length} active feeder culture
                {bloomSummary.feederAlerts.length > 1 ? 's are' : ' is'} running low or nearing
                culture crash age.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => (onOpenBloom ? onOpenBloom({ tab: 'habitat' }) : onNavigateApp('bloom'))}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shrink-0 cursor-pointer active:scale-[0.98] transition"
          >
            Check Feeders in Bloom &rarr;
          </button>
        </section>
      )}

      {/* 3. LIVE CADENCE FAST-ACTION WIDGET */}
      <SectionCard className="space-y-3 sm:space-y-4">
        <div className="flex items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <IconBadge icon={Cat} accent="purple" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold">
                  {catName}&apos;s {medName}
                </h2>
                <StatusPill accent="purple">{dosageLabel}</StatusPill>
              </div>
              <p className="text-xs text-text-muted">
                One-tap household dose check-in (logs as{' '}
                <strong className="text-text-primary">{caregiverLabel}</strong>)
              </p>
            </div>
          </div>

          <OpenModulePill
            accent="purple"
            onClick={navigateCadence}
            label="Open"
            ariaLabel="Open Full Cadence Tracker & History"
            title="Open Full Cadence Tracker & History"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <QuickDoseCard
            slot="morning"
            dose={amDose}
            targetTime={amTarget}
            catName={catName}
            caregiverLabel={caregiverLabel}
            quickActionPending={quickActionPending}
            onQuickRecordDose={onQuickRecordDose}
            onNavigateCadence={navigateCadence}
          />
          <QuickDoseCard
            slot="evening"
            dose={pmDose}
            targetTime={pmTarget}
            catName={catName}
            caregiverLabel={caregiverLabel}
            quickActionPending={quickActionPending}
            onQuickRecordDose={onQuickRecordDose}
            onNavigateCadence={navigateCadence}
          />
        </div>
      </SectionCard>

      {/* 3B. LIVE BLOOM FAST-ACTION WIDGET */}
      <SectionCard className="space-y-3 sm:space-y-4">
        <div className="flex items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <IconBadge icon={Flower2} accent="emerald" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold">
                  {mantisName} • {bloomSummary.settings.commonName}
                </h2>
                <StatusPill accent="emerald">
                  {bloomSummary.settings.currentInstar} • Day {bloomSummary.daysInCurrentInstar}
                </StatusPill>
                {bloomSummary.isNoFeedLockout && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                      bloomSummary.effectiveStatus === 'premolt'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    {bloomSummary.effectiveStatus === 'premolt' ? 'Premolt (No Prey)' : 'Hardening'}
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted">
                Habitat misting, prey log &amp; molt tracker (logs as{' '}
                <strong className="text-text-primary">{caregiverLabel}</strong>)
              </p>
            </div>
          </div>

          <OpenModulePill
            accent="emerald"
            onClick={() => onNavigateApp('bloom')}
            label="Open"
            ariaLabel="Open Full Bloom Habitat & Growth"
            title="Open Full Bloom Habitat & Growth"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Quick Enclosure Mist Card */}
          <div
            className={`rounded-2xl p-4 border-2 flex flex-col justify-between gap-3 transition ${
              bloomSummary.todayMistCount > 0
                ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/70'
                : 'bg-surface-subtle border-border-subtle'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    bloomSummary.todayMistCount > 0
                      ? 'bg-emerald-700 text-white'
                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  <Droplets className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm">Enclosure Wall Mist</div>
                  <div className="text-xs text-text-muted break-words">
                    {bloomSummary.lastMist
                      ? `Last misted ${bloomSummary.lastMist.timeAgoLabel} by ${bloomSummary.lastMist.by}`
                      : 'No mists logged yet'}
                  </div>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase shrink-0 ${
                  bloomSummary.isMistDue
                    ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                    : 'bg-emerald-700 text-white'
                }`}
              >
                {bloomSummary.isMistDue ? 'Due' : 'Hydrated'}
              </span>
            </div>

            <button
              type="button"
              disabled={quickActionPending}
              onClick={onQuickMistMantis}
              className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed ${
                bloomSummary.todayMistCount > 0
                  ? 'bg-surface-card hover:bg-surface-hover text-text-primary border border-border-strong'
                  : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs'
              }`}
            >
              <Droplets className="w-4 h-4 shrink-0" />
              <span>
                {bloomSummary.todayMistCount > 0
                  ? `Log Another Mist (${bloomSummary.todayMistCount} today)`
                  : `Mist ${mantisName}'s Enclosure (${caregiverLabel})`}
              </span>
            </button>
          </div>

          {/* Quick Feeding & Instar Status Card */}
          <div
            className={`rounded-2xl p-4 border-2 flex flex-col justify-between gap-3 transition ${
              bloomSummary.isNoFeedLockout
                ? bloomSummary.effectiveStatus === 'premolt'
                  ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-300 dark:border-amber-700/70'
                  : 'bg-rose-50/60 dark:bg-rose-950/25 border-rose-200 dark:border-rose-800/70'
                : 'bg-surface-subtle border-border-subtle'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <Bug className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm">Feeding &amp; Abdomen</div>
                  <div className="text-xs text-text-muted break-words">
                    {bloomSummary.lastMeal
                      ? `Last ate ${bloomSummary.lastMeal.friendlyWhen} (${bloomSummary.lastMeal.count}× ${
                          bloomSummary.lastMeal.preyLabel
                            ? formatShortPreyLabel(bloomSummary.lastMeal.preyLabel)
                            : 'feeder prey'
                        })`
                      : 'No meals logged yet'}
                  </div>
                </div>
              </div>

              <StatusPill accent="emerald" className="capitalize shrink-0">
                {bloomSummary.latestAbdomen
                  ? `Abdomen: ${bloomSummary.latestAbdomen}`
                  : bloomSummary.settings.currentInstar}
              </StatusPill>
            </div>

            {bloomSummary.isNoFeedLockout ? (
              <div
                className={`flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t font-semibold ${
                  bloomSummary.effectiveStatus === 'premolt'
                    ? 'border-amber-500/25 text-amber-800 dark:text-amber-300'
                    : 'border-rose-500/20 text-rose-700 dark:text-rose-300'
                }`}
              >
                <span className="min-w-0">
                  {bloomSummary.effectiveStatus === 'premolt'
                    ? '⚠️ Premolt — Do not offer live prey'
                    : `🛡️ Hardening (${bloomSummary.hardeningRemainingLabel} left)`}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateApp('bloom')}
                  className="min-h-[40px] inline-flex items-center px-2 underline cursor-pointer shrink-0"
                >
                  Manage
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onNavigateApp('bloom')}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
              >
                <Bug className="w-4 h-4 shrink-0" />
                <span>Log {mantisName}&apos;s Meal or Abdomen Check &rarr;</span>
              </button>
            )}
          </div>
        </div>
      </SectionCard>

      {/* 4. PROFILE-ADAPTIVE HOUSEHOLD GRID */}
      {activeProfile.id === 'caregiver' ? (
        <div className="space-y-4 sm:space-y-5">
        <SectionCard className="space-y-3 sm:space-y-4">
          <div className="flex items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <IconBadge icon={ShieldAlert} accent="sky" />
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold">
                  Beacon • Pet Sitter &amp; Emergency Quick Reference
                </h2>
                <p className="text-xs text-text-muted">
                  Essential details while looking after the pets and the house
                </p>
              </div>
            </div>
            <OpenModulePill
              accent="sky"
              onClick={() => onNavigateApp('beacon')}
              label="Open"
              ariaLabel="Open Full Beacon Guide"
              title="Open Full Beacon Guide"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <SubSurface className="p-4 space-y-1.5">
              <div className="font-bold text-sky-700 dark:text-sky-300 uppercase">
                🐾 Pet Care &amp; Feeding
              </div>
              <p className="leading-relaxed">
                {beaconInfo?.petCare?.feedingGuide?.trim() || 'No feeding guide entered yet.'}
              </p>
            </SubSurface>

            <SubSurface className="p-4 space-y-2">
              <div className="font-bold text-rose-600 dark:text-rose-400 uppercase">
                🏥 Emergency Vet
              </div>
              <div className="font-bold text-sm">
                {beaconInfo?.vetInfo?.clinicName?.trim() || 'Veterinary Clinic not set'}
              </div>
              {(beaconInfo?.vetInfo?.phone?.trim() ||
                beaconInfo?.vetInfo?.emergencyPhone?.trim()) && (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {beaconInfo?.vetInfo?.phone?.trim() && (
                    <a
                      href={`tel:${beaconInfo.vetInfo.phone.trim()}`}
                      className="min-h-[40px] px-3 py-1.5 rounded-full bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs inline-flex items-center gap-1.5 max-w-full min-w-0 transition active:scale-[0.98]"
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span className="min-w-0 break-all">
                        Daytime: {beaconInfo.vetInfo.phone.trim()}
                      </span>
                    </a>
                  )}
                  {beaconInfo?.vetInfo?.emergencyPhone?.trim() && (
                    <a
                      href={`tel:${beaconInfo.vetInfo.emergencyPhone.trim()}`}
                      className="min-h-[40px] px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs inline-flex items-center gap-1.5 max-w-full min-w-0 transition active:scale-[0.98]"
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span className="min-w-0 break-all">
                        Emergency: {beaconInfo.vetInfo.emergencyPhone.trim()}
                      </span>
                    </a>
                  )}
                </div>
              )}
            </SubSurface>

            <SubSurface className="md:col-span-2 lg:col-span-1 p-4 space-y-1.5">
              <div className="font-bold text-sky-700 dark:text-sky-300 uppercase">
                📞 Household &amp; Emergency Contacts
              </div>
              {(beaconInfo?.contacts || []).length > 0 ? (
                (beaconInfo?.contacts || []).map((c, idx) => (
                  <div
                    key={c.id || idx}
                    className="flex flex-wrap items-center justify-between py-0.5 gap-2"
                  >
                    <span className="font-semibold min-w-0 truncate">{c.name || 'Contact'}:</span>
                    {c.phone?.trim() ? (
                      <a
                        href={`tel:${c.phone.trim()}`}
                        className="min-h-[40px] inline-flex items-center px-2 font-mono font-semibold underline text-sky-700 dark:text-sky-300 min-w-0 max-w-full break-all"
                      >
                        {c.phone.trim()}
                      </a>
                    ) : (
                      <span className="text-text-muted italic shrink-0">No number</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-xs text-text-muted">No contacts listed.</div>
              )}
            </SubSurface>
          </div>
        </SectionCard>

        {foyerQuillSummary.notes.length > 0 && (
          <SectionCard className="space-y-3 sm:space-y-4">
            <div className="flex items-start sm:items-center justify-between gap-2.5">
              <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                <IconBadge icon={StickyNote} accent="yellow" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-extrabold text-base">Quill • House Notes</h3>
                    <StatusPill accent="yellow">
                      {foyerQuillSummary.totalActiveCount} house
                    </StatusPill>
                  </div>
                  <p className="text-xs text-text-muted">
                    Shared notes &amp; checklists left for pet sitting and guests
                  </p>
                </div>
              </div>
              <OpenModulePill
                accent="yellow"
                onClick={() => (onOpenQuill ? onOpenQuill({ tab: 'shared' }) : onNavigateApp('quill'))}
                label="Open"
                ariaLabel="Open Quill House Notes"
                title="Open Quill House Notes"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {foyerQuillSummary.notes.map((note) => {
                const col = getQuillColorMeta(note.color);
                const items = Array.isArray(note.items) ? note.items : [];
                const doneCount = items.filter((it) => it.checked).length;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() =>
                      onOpenQuill
                        ? onOpenQuill({ tab: 'shared', noteId: note.id })
                        : onNavigateApp('quill')
                    }
                    className={`text-left p-3.5 rounded-2xl border transition hover:shadow-sm active:scale-[0.99] cursor-pointer space-y-1.5 ${col.cardClass}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${col.dotClass}`} />
                        <span className="font-extrabold text-sm truncate">
                          {note.title || 'Untitled note'}
                        </span>
                      </span>
                      {note.pinned && (
                        <Pin className="w-3.5 h-3.5 text-yellow-800 dark:text-yellow-300 shrink-0" />
                      )}
                    </div>
                    {note.type === 'checklist' ? (
                      <div className="text-xs text-text-muted font-semibold">
                        Checklist: {doneCount}/{items.length} ticked
                      </div>
                    ) : (
                      <p className="text-xs text-text-secondary line-clamp-2">
                        {stripMarkdownPreview(note.body) || 'Empty note'}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </SectionCard>
        )}
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
        <div
          className={`grid grid-cols-1 md:grid-cols-2 ${
            activeProfile.allowedApps.includes('floodgate') ? 'xl:grid-cols-3' : ''
          } gap-4 sm:gap-5`}
        >
          {/* ALMANAC UPCOMING AGENDA CARD */}
          <SectionCard className="flex flex-col justify-between space-y-3 sm:space-y-4">
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-start sm:items-center justify-between gap-2.5">
                <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <IconBadge icon={Calendar} accent="indigo" />
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-base">Almanac Agenda</h3>
                    <p className="text-xs text-text-muted">
                      Upcoming household dates &amp; appointments
                    </p>
                  </div>
                </div>
                <OpenModulePill
                  accent="indigo"
                  onClick={() => onNavigateApp('almanac')}
                  label="Open"
                  ariaLabel="Open Almanac Calendar"
                  title="Open Almanac Calendar"
                />
              </div>

              {upcomingEvents.length > 0 ? (
                <div className="space-y-2.5">
                  {upcomingEvents.map((evt) => {
                    const isToday = evt.date === todayKey;
                    return (
                      <button
                        key={evt.id}
                        type="button"
                        onClick={() => onOpenAlmanacDate(evt.date)}
                        className={`w-full text-left p-3 rounded-2xl border transition cursor-pointer ${
                          isToday
                            ? 'bg-indigo-500/10 border-indigo-500/40'
                            : 'bg-surface-subtle border-border-subtle hover:bg-surface-hover'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-bold min-w-0 truncate">{evt.title}</span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[11px] shrink-0 ${
                              isToday
                                ? 'bg-indigo-600 text-white'
                                : 'bg-surface-muted text-text-secondary'
                            }`}
                          >
                            {formatFriendlyDate(evt.date, todayKey)}{' '}
                            {evt.time ? `• ${evt.time}` : ''}
                          </span>
                        </div>
                        {evt.notes && (
                          <p className="text-xs text-text-muted mt-1 truncate">{evt.notes}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <EmptyStateCard
                  accent="indigo"
                  icon={Calendar}
                  title="No upcoming events"
                  description="No upcoming events on the Almanac calendar."
                  className="p-4 sm:p-5"
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigateApp('almanac')}
              className="w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold border border-border-strong text-text-secondary hover:bg-surface-hover transition active:scale-[0.98] cursor-pointer"
            >
              + Add Event or View Monthly Overlays
            </button>
          </SectionCard>

          {/* LEDGER FINANCES & BILLS CARD */}
          <SectionCard className="flex flex-col justify-between space-y-3 sm:space-y-4">
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-start sm:items-center justify-between gap-2.5">
                <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <IconBadge icon={Wallet} accent="amber" />
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-base">Ledger Finances</h3>
                    <p className="text-xs text-text-muted">
                      Direct Debits, subscriptions &amp; monthly spend
                    </p>
                  </div>
                </div>
                <OpenModulePill
                  accent="amber"
                  onClick={() => onNavigateApp('ledger')}
                  label="Open"
                  ariaLabel="Open Ledger Finances"
                  title="Open Ledger Finances"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <SubSurface className="p-2.5">
                  <div className="text-xs font-bold uppercase text-text-muted">
                    Committed DDs &amp; Subs
                  </div>
                  <div className="text-sm font-extrabold text-amber-700 dark:text-amber-400 mt-0.5">
                    {formatGBP(ledgerBriefing.totalMonthlyCommitted)}/mo
                  </div>
                </SubSurface>
                <SubSurface className="p-2.5">
                  <div className="text-xs font-bold uppercase text-text-muted">
                    Month&apos;s Expenses
                  </div>
                  <div className="text-sm font-extrabold text-amber-700 dark:text-amber-400 mt-0.5">
                    {formatGBP(ledgerBriefing.currentMonthExpenses)}
                  </div>
                </SubSurface>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Next Billing Dates
                </div>
                {ledgerBriefing.upcomingBills.length > 0 ? (
                  ledgerBriefing.upcomingBills.map((bill) => (
                    <button
                      key={bill.id}
                      type="button"
                      onClick={() => onNavigateApp('ledger')}
                      className="w-full text-left p-2.5 rounded-2xl border bg-surface-subtle border-border-subtle hover:bg-surface-hover flex items-center justify-between gap-2 cursor-pointer transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate">{bill.title}</div>
                        <div className="text-xs text-text-muted">
                          {bill.owner === 'joint'
                            ? '🤝 Joint'
                            : bill.owner === 'partner1'
                              ? `⚡ ${partner1Name}`
                              : `🌸 ${partner2Name}`}{' '}
                          •{' '}
                          {bill.daysUntil === 0
                            ? 'Due Today'
                            : `In ${bill.daysUntil}d (${bill.nextFormatted})`}
                        </div>
                      </div>
                      <span className="text-xs font-extrabold shrink-0">
                        {formatGBP(bill.amount)}
                      </span>
                    </button>
                  ))
                ) : (
                  <EmptyStateCard
                    accent="amber"
                    icon={Wallet}
                    title="No scheduled bills yet"
                    description="No active recurring bills scheduled yet."
                    className="p-4 sm:p-5"
                  />
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateApp('ledger')}
              className="w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold border border-border-strong text-text-secondary hover:bg-surface-hover transition active:scale-[0.98] cursor-pointer"
            >
              + Log Expense or View {partner1Name} / {partner2Name} / Unified Split
            </button>
          </SectionCard>

          {/* PARTNER 2'S PRIVATE FLOODGATE QUICK CARD */}
          {activeProfile.allowedApps.includes('floodgate') && (
            <section className="md:col-span-2 xl:col-span-1 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between space-y-3 sm:space-y-4 bg-rose-50/40 dark:bg-surface-card border-rose-200/80 dark:border-rose-900/50 text-text-primary">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-start sm:items-center justify-between gap-2.5">
                  <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <IconBadge icon={Heart} accent="rose" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-extrabold text-base">Floodgate Journal</h3>
                        <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 shrink-0">
                          Private
                        </span>
                      </div>
                      <p className="text-xs text-text-muted">
                        {partner2Name}&apos;s private cycle, clot &amp; pain log
                      </p>
                    </div>
                  </div>
                  <OpenModulePill
                    accent="rose"
                    onClick={() => onOpenFloodgate({ tab: 'log', date: todayKey })}
                    label="Open"
                    ariaLabel="Open Floodgate Journal"
                    title="Open Floodgate Journal"
                  />
                </div>

                {partner2TodayLog ? (
                  <SubSurface className="p-3.5 space-y-1.5 text-xs">
                    <div className="font-bold text-rose-600 dark:text-rose-400">
                      ✓ Today&apos;s Symptom Entry Logged
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold capitalize">
                        Flow: {partner2TodayLog.bleedingSeverity || 'none'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold">
                        Pain: {partner2TodayLog.painScore || 0}/10
                      </span>
                      {partner2TodayLog.hasClots && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-700 dark:text-purple-300 font-semibold">
                          Clots: {partner2TodayLog.clotCount}
                        </span>
                      )}
                    </div>
                  </SubSurface>
                ) : (
                  <SubSurface className="p-4 text-xs space-y-1 text-text-secondary">
                    <div className="font-bold text-text-primary">No entry logged yet for today</div>
                    <p>
                      Tap below to record flow, clots, pain score, bowel symptoms, or medications.
                    </p>
                  </SubSurface>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onOpenFloodgate({ tab: 'log', date: todayKey })}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer active:scale-[0.98] transition"
                >
                  {partner2TodayLog ? 'Edit Today' : 'Log Today'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenFloodgate({ tab: 'insights', date: todayKey })}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-[0.98] transition bg-surface-card border-rose-200 dark:border-border-strong hover:bg-rose-50 dark:hover:bg-surface-hover text-rose-700 dark:text-text-primary"
                >
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>GP Report</span>
                </button>
              </div>
            </section>
          )}
        </div>

        {/* QUILL SHARED NOTES CARD */}
        <SectionCard className="space-y-3 sm:space-y-4">
          <div className="flex items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <IconBadge icon={StickyNote} accent="yellow" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-extrabold text-base">Quill Shared Notes</h3>
                  <StatusPill accent="yellow">
                    {foyerQuillSummary.totalPinnedCount > 0
                      ? `${foyerQuillSummary.totalPinnedCount} pinned`
                      : 'Shared Board'}
                  </StatusPill>
                </div>
                <p className="text-xs text-text-muted">
                  Pinned household notes, shopping lists &amp; quick reminders
                </p>
              </div>
            </div>
            <OpenModulePill
              accent="yellow"
              onClick={() => (onOpenQuill ? onOpenQuill({ tab: 'shared' }) : onNavigateApp('quill'))}
              label="Open"
              ariaLabel="Open Quill Shared Board"
              title="Open Quill Shared Board"
            />
          </div>

          {foyerQuillSummary.notes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {foyerQuillSummary.notes.map((note) => {
                const col = getQuillColorMeta(note.color);
                const items = Array.isArray(note.items) ? note.items : [];
                const doneCount = items.filter((it) => it.checked).length;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() =>
                      onOpenQuill
                        ? onOpenQuill({ tab: 'shared', noteId: note.id })
                        : onNavigateApp('quill')
                    }
                    className={`text-left p-3.5 rounded-2xl border transition hover:shadow-sm active:scale-[0.99] cursor-pointer space-y-1.5 ${col.cardClass}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${col.dotClass}`} />
                        <span className="font-extrabold text-sm truncate">
                          {note.title || 'Untitled note'}
                        </span>
                      </span>
                      {note.pinned && (
                        <Pin className="w-3.5 h-3.5 text-yellow-800 dark:text-yellow-300 shrink-0" />
                      )}
                    </div>
                    {note.type === 'checklist' ? (
                      <div className="text-xs text-text-muted font-semibold">
                        Checklist: {doneCount}/{items.length} ticked
                      </div>
                    ) : (
                      <p className="text-xs text-text-secondary line-clamp-2">
                        {stripMarkdownPreview(note.body) || 'Empty note'}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyStateCard
              accent="yellow"
              icon={StickyNote}
              title="No shared notes yet"
              description="Pin a note on Quill's Shared Board to surface it here on Foyer."
              className="p-4 sm:p-5"
            />
          )}

          <button
            type="button"
            onClick={() => (onOpenQuill ? onOpenQuill({ tab: 'shared' }) : onNavigateApp('quill'))}
            className="w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold border border-border-strong text-text-secondary hover:bg-surface-hover transition active:scale-[0.98] cursor-pointer"
          >
            + Take a Note or View Shared Board
          </button>
        </SectionCard>
        </div>
      )}
    </main>
  );
}

export default memo(FoyerApp);
