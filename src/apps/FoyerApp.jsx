import React, { useMemo } from 'react';
import {
  getLocalDateKey,
  parseLocalDateKey,
  formatTimeDisplay,
  formatFriendlyDate,
  formatGBP,
  toMonthlyAmount,
  isAlmanacEventVisibleToProfile,
  doesAlmanacEventOccurOnDate,
  getLedgerScheduleInfo,
  computeBloomSummary
} from '../utils/householdHelpers.js';
import {
  Home,
  Cat,
  Flower2,
  Droplets,
  Bug,
  Sun,
  Moon,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Heart,
  Wallet,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  Stethoscope,
  UserCheck,
  Phone
} from 'lucide-react';
import { MODULE_ACCENTS, ModuleHeader, EmptyStateCard } from '../components/HowardUI.jsx';

export default function FoyerApp({
  activeProfile,
  profiles,
  darkMode,
  cadenceSnapshot,
  bloomSnapshot,
  bloomSummary: bloomSummaryProp,
  floodgateSnapshot,
  almanacEvents,
  ledgerData,
  beaconInfo,
  nowMs = Date.now(),
  quickActionPending = false,
  onNavigateApp,
  onOpenBloom,
  onQuickRecordDose,
  onQuickMistMantis,
  onClearMantisLivePrey,
  onOpenFloodgate,
  onOpenAlmanacDate,
  onOpenProfileModal
}) {
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const todayKey = getLocalDateKey(now);
  const hour = now.getHours();

  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const catName = cadenceSnapshot?.settings?.catName || 'Pet';
  const bloomSummary = useMemo(
    () => bloomSummaryProp || computeBloomSummary(bloomSnapshot, now),
    [bloomSummaryProp, bloomSnapshot, now]
  );
  const mantisName = bloomSummary.settings.mantisName || 'Mantis';
  const partner1Name = (profiles || []).find((p) => p.id === 'partner1')?.name || 'Partner 1';
  const partner2Name = (profiles || []).find((p) => p.id === 'partner2')?.name || 'Partner 2';
  const medName = cadenceSnapshot?.settings?.medicationName || 'Oral Solution';
  const dosageLabel = cadenceSnapshot?.settings?.dosageLabel || '2.5 mg / 0.5 ml';
  const amTarget = cadenceSnapshot?.settings?.morningTargetTime || '08:00';
  const pmTarget = cadenceSnapshot?.settings?.eveningTargetTime || '20:00';

  const todayCadence = cadenceSnapshot?.logsByDate?.[todayKey] || {};
  const amDose = todayCadence.morning;
  const pmDose = todayCadence.evening;

  // Bottle shelf-life alert calculation
  const bottleAlert = useMemo(() => {
    const openedStr = cadenceSnapshot?.settings?.bottleOpenedDate || todayKey;
    const shelfLife = Number(cadenceSnapshot?.settings?.bottleShelfLifeDays) || 180;
    const expiryDate = parseLocalDateKey(openedStr);
    expiryDate.setDate(expiryDate.getDate() + shelfLife);
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysRemaining = Math.round(
      (expiryDate.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      daysRemaining,
      expiryFormatted: expiryDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }),
      isAlert: daysRemaining <= 14
    };
  }, [cadenceSnapshot?.settings, todayKey, now]);

  // Upcoming Almanac events (today + next 21 days, expanding recurring events & filtering Partner 2-private GP events when not Partner 2)
  const upcomingEvents = useMemo(() => {
    const visibleEvents = (almanacEvents || []).filter((e) =>
      isAlmanacEventVisibleToProfile(e, activeProfile, partner2Name)
    );

    const occurrences = [];
    for (let offset = 0; offset <= 21; offset++) {
      const dObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const dKey = getLocalDateKey(dObj);
      visibleEvents.forEach((evt) => {
        if (doesAlmanacEventOccurOnDate(evt, dKey)) {
          // Only show the next upcoming occurrence of each recurring series on Foyer
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
  }, [almanacEvents, todayKey, activeProfile, partner2Name, now]);

  // Ledger Bookkeeping Briefing (Upcoming Direct Debits/Subs + Current Month Spend)
  const ledgerBriefing = useMemo(() => {
    const recurring = (ledgerData?.recurring || []).filter((r) => r.active !== false);
    const expenses = ledgerData?.expenses || [];
    const currentMonthPrefix = todayKey.slice(0, 7);

    const upcomingBills = recurring
      .map((r) => {
        const { daysUntil, nextDateFormatted } = getLedgerScheduleInfo(r, false, now);
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
  }, [ledgerData, todayKey, now]);

  // Partner 2's Floodgate today status
  const partner2TodayLog = floodgateSnapshot?.logsByDate?.[todayKey] || null;

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      {/* ====================================================================
          1. FOYER WELCOME BANNER & QUICK PROFILE CONTEXT
      ==================================================================== */}
      <ModuleHeader
        accent="teal"
        icon={Home}
        title={`${greeting}, ${activeProfile.name} ${activeProfile.badgeEmoji}`}
        badges={
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold uppercase tracking-wider ${MODULE_ACCENTS.teal.badge}`}
          >
            <Sparkles className="w-3 h-3 shrink-0" />
            <span>
              Foyer •{' '}
              {now.toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              })}
            </span>
          </span>
        }
        subtitle={
          activeProfile.id === 'caregiver'
            ? `Caregiver & Pet Sitter View — ${catName}'s medicine, ${mantisName}'s mantis habitat, and emergency house guide.`
            : `Here is your live household briefing across ${catName}'s medicine, ${mantisName}'s growth & habitat, calendar events, and finances.`
        }
        darkMode={darkMode}
        compactActions
        actions={
          <button
            type="button"
            onClick={onOpenProfileModal}
            className={`min-w-[44px] min-h-[44px] px-3 py-2 sm:px-3.5 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
            title={`Switch User (${activeProfile.name})`}
            aria-label={`Switch User (${activeProfile.name})`}
          >
            <UserCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="hidden sm:inline">Switch User ({activeProfile.name})</span>
          </button>
        }
      />

      {/* ====================================================================
          2. BOTTLE EXPIRY WARNING BANNER (AUTO-SURFACED WHEN <= 14 DAYS)
      ==================================================================== */}
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
            onClick={() => onNavigateApp('cadence')}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shrink-0 cursor-pointer active:scale-[0.98] transition"
          >
            {activeProfile.id === 'caregiver'
              ? 'View in Cadence →'
              : 'Manage Bottle in Cadence →'}
          </button>
        </section>
      )}

      {/* BLOOM SAFETY ALERTS: UNEATEN LIVE PREY, PREMOLT/HARDENING LOCKOUT, OR FEEDER CULTURE LOW */}
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
                {bloomSummary.settings.livePreyNote || 'Live feeder left inside.'} Check that {mantisName} ate or remove before lights-out.
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
                {bloomSummary.feederAlerts.length} active feeder culture{bloomSummary.feederAlerts.length > 1 ? 's are' : ' is'} running low or nearing culture crash age.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenBloom ? onOpenBloom({ tab: 'habitat' }) : onNavigateApp('bloom')
            }
            className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shrink-0 cursor-pointer active:scale-[0.98] transition"
          >
            Check Feeders in Bloom &rarr;
          </button>
        </section>
      )}

      {/* ====================================================================
          3. LIVE CADENCE FAST-ACTION WIDGET (PET'S MORNING & EVENING DOSES)
      ==================================================================== */}
      <section
        className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${
          darkMode
            ? 'bg-slate-900 border-slate-800'
            : 'bg-white border-slate-200/90'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/70 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${MODULE_ACCENTS.purple.iconBg}`}
            >
              <Cat className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold">
                  {catName}&apos;s {medName}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-500/30">
                  {dosageLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                One-tap household dose check-in (logs as{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {activeProfile.caregiverName || activeProfile.name}
                </strong>
                )
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateApp('cadence')}
            className="min-h-[44px] px-2 py-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-400 hover:underline cursor-pointer self-start sm:self-auto shrink-0"
          >
            <span>Open Full Cadence Tracker &amp; History</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Morning Dose Quick Card */}
          <div
            className={`rounded-2xl p-4 border-2 flex flex-col justify-between gap-3 transition ${
              amDose?.given
                ? darkMode
                  ? 'bg-emerald-950/30 border-emerald-700/70'
                  : 'bg-emerald-50/70 border-emerald-300'
                : darkMode
                  ? 'bg-slate-800/50 border-slate-700'
                  : 'bg-slate-50/80 border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    amDose?.given
                      ? 'bg-emerald-700 text-white'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  <Sun className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm flex flex-wrap items-center gap-1.5">
                    <span>Morning Dose</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                      AM • ~{amTarget}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 break-words">
                    {amDose?.given
                      ? `Given at ${formatTimeDisplay(amDose.timestamp)} by ${amDose.givenBy}`
                      : 'Awaiting morning dose'}
                  </div>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase shrink-0 ${
                  amDose?.given
                    ? 'bg-emerald-700 text-white'
                    : 'bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-500/25'
                }`}
              >
                {amDose?.given ? 'Done' : 'Pending'}
              </span>
            </div>

            {amDose?.given ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">
                <span className="min-w-0">✓ Safe — Morning dose recorded</span>
                <button
                  type="button"
                  onClick={() => onNavigateApp('cadence')}
                  className="min-h-[40px] inline-flex items-center px-2 underline cursor-pointer shrink-0"
                >
                  Edit in Cadence
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={quickActionPending}
                onClick={() => onQuickRecordDose('morning')}
                className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  Log {catName}&apos;s Morning Dose ({activeProfile.caregiverName || activeProfile.name})
                </span>
              </button>
            )}
          </div>

          {/* Evening Dose Quick Card */}
          <div
            className={`rounded-2xl p-4 border-2 flex flex-col justify-between gap-3 transition ${
              pmDose?.given
                ? darkMode
                  ? 'bg-emerald-950/30 border-emerald-700/70'
                  : 'bg-emerald-50/70 border-emerald-300'
                : darkMode
                  ? 'bg-slate-800/50 border-slate-700'
                  : 'bg-slate-50/80 border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    pmDose?.given
                      ? 'bg-emerald-700 text-white'
                      : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                  }`}
                >
                  <Moon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm flex flex-wrap items-center gap-1.5">
                    <span>Evening Dose</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                      PM • ~{pmTarget}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 break-words">
                    {pmDose?.given
                      ? `Given at ${formatTimeDisplay(pmDose.timestamp)} by ${pmDose.givenBy}`
                      : 'Awaiting evening dose'}
                  </div>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase shrink-0 ${
                  pmDose?.given
                    ? 'bg-emerald-700 text-white'
                    : 'bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-500/25'
                }`}
              >
                {pmDose?.given ? 'Done' : 'Pending'}
              </span>
            </div>

            {pmDose?.given ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">
                <span className="min-w-0">✓ Safe — Evening dose recorded</span>
                <button
                  type="button"
                  onClick={() => onNavigateApp('cadence')}
                  className="min-h-[40px] inline-flex items-center px-2 underline cursor-pointer shrink-0"
                >
                  Edit in Cadence
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={quickActionPending}
                onClick={() => onQuickRecordDose('evening')}
                className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  Log {catName}&apos;s Evening Dose ({activeProfile.caregiverName || activeProfile.name})
                </span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ====================================================================
          3B. LIVE BLOOM FAST-ACTION WIDGET (MANTIS MISTING, FEEDING & STAGE)
      ==================================================================== */}
      <section
        className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${
          darkMode
            ? 'bg-slate-900 border-slate-800'
            : 'bg-white border-slate-200/90'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/70 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${MODULE_ACCENTS.emerald.iconBg}`}
            >
              <Flower2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold">
                  {mantisName} • {bloomSummary.settings.commonName}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                  {bloomSummary.settings.currentInstar} • Day {bloomSummary.daysInCurrentInstar}
                </span>
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
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Habitat misting, prey log &amp; molt tracker (logs as{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {activeProfile.caregiverName || activeProfile.name}
                </strong>
                )
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateApp('bloom')}
            className="min-h-[44px] px-2 py-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer self-start sm:self-auto shrink-0"
          >
            <span>Open Full Bloom Habitat &amp; Growth</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Quick Enclosure Mist Card */}
          <div
            className={`rounded-2xl p-4 border-2 flex flex-col justify-between gap-3 transition ${
              bloomSummary.todayMistCount > 0
                ? darkMode
                  ? 'bg-emerald-950/30 border-emerald-700/70'
                  : 'bg-emerald-50/70 border-emerald-300'
                : darkMode
                  ? 'bg-slate-800/50 border-slate-700'
                  : 'bg-slate-50/80 border-slate-200'
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
                  <div className="text-xs text-slate-500 dark:text-slate-400 break-words">
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
                  ? darkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs'
              }`}
            >
              <Droplets className="w-4 h-4 shrink-0" />
              <span>
                {bloomSummary.todayMistCount > 0
                  ? `Log Another Mist (${bloomSummary.todayMistCount} today)`
                  : `Mist ${mantisName}'s Enclosure (${activeProfile.caregiverName || activeProfile.name})`}
              </span>
            </button>
          </div>

          {/* Quick Feeding & Instar Status Card */}
          <div
            className={`rounded-2xl p-4 border-2 flex flex-col justify-between gap-3 transition ${
              bloomSummary.isNoFeedLockout
                ? bloomSummary.effectiveStatus === 'premolt'
                  ? darkMode
                    ? 'bg-amber-950/25 border-amber-700/70'
                    : 'bg-amber-50/70 border-amber-300'
                  : darkMode
                    ? 'bg-rose-950/25 border-rose-800/70'
                    : 'bg-rose-50/60 border-rose-200'
                : darkMode
                  ? 'bg-slate-800/50 border-slate-700'
                  : 'bg-slate-50/80 border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <Bug className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm">Feeding &amp; Abdomen</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 break-words">
                    {bloomSummary.lastMeal
                      ? `Last ate ${bloomSummary.lastMeal.friendlyWhen} (${bloomSummary.lastMeal.count}× ${bloomSummary.lastMeal.preyLabel ? bloomSummary.lastMeal.preyLabel.split(' (')[0] : 'feeder prey'})`
                      : 'No meals logged yet'}
                  </div>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold capitalize bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25 shrink-0">
                {bloomSummary.latestAbdomen ? `Abdomen: ${bloomSummary.latestAbdomen}` : bloomSummary.settings.currentInstar}
              </span>
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
      </section>

      {/* ====================================================================
          4. PROFILE-ADAPTIVE HOUSEHOLD GRID
             - Partner 1 & Partner 2 see Almanac + Ledger (+ Floodgate for Partner 2)
             - Caregiver sees Beacon Emergency & Pet Guide summary
      ==================================================================== */}
      {activeProfile.id === 'caregiver' ? (
        <section
          className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${
            darkMode
              ? 'bg-slate-900 border-slate-800'
              : 'bg-white border-slate-200/90'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${MODULE_ACCENTS.sky.iconBg}`}
              >
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold">
                  Beacon • Pet Sitter &amp; Emergency Quick Reference
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Essential details while looking after the pets and the house
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateApp('beacon')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold inline-flex items-center cursor-pointer shrink-0 self-start sm:self-auto active:scale-[0.98] transition"
            >
              Open Full Guide &rarr;
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div
              className={`p-4 rounded-2xl border space-y-1.5 ${
                darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="font-bold text-sky-700 dark:text-sky-300 uppercase">
                🐾 Pet Care &amp; Feeding
              </div>
              <p className="leading-relaxed">
                {beaconInfo?.petCare?.feedingGuide?.trim() || 'No feeding guide entered yet.'}
              </p>
            </div>

            <div
              className={`p-4 rounded-2xl border space-y-2 ${
                darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
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
            </div>

            <div
              className={`md:col-span-2 lg:col-span-1 p-4 rounded-2xl border space-y-1.5 ${
                darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="font-bold text-sky-700 dark:text-sky-300 uppercase">
                📞 Household &amp; Emergency Contacts
              </div>
              {(beaconInfo?.contacts || []).length > 0 ? (
                (beaconInfo?.contacts || []).map((c, idx) => (
                  <div key={c.id || idx} className="flex flex-wrap items-center justify-between py-0.5 gap-2">
                    <span className="font-semibold min-w-0 truncate">{c.name || 'Contact'}:</span>
                    {c.phone?.trim() ? (
                      <a
                        href={`tel:${c.phone.trim()}`}
                        className="min-h-[40px] inline-flex items-center px-2 font-mono font-semibold underline text-sky-700 dark:text-sky-300 min-w-0 max-w-full break-all"
                      >
                        {c.phone.trim()}
                      </a>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400 italic shrink-0">
                        No number
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400">No contacts listed.</div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 ${
            activeProfile.allowedApps.includes('floodgate')
              ? 'xl:grid-cols-3'
              : ''
          } gap-4 sm:gap-5`}
        >
          {/* ALMANAC UPCOMING AGENDA CARD */}
          <section
            className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between space-y-4 ${
              darkMode
                ? 'bg-slate-900 border-slate-800'
                : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${MODULE_ACCENTS.indigo.iconBg}`}
                  >
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-base">Almanac Agenda</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Upcoming household dates &amp; appointments
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateApp('almanac')}
                  className="min-h-[40px] inline-flex items-center px-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer shrink-0"
                >
                  Open Calendar &rarr;
                </button>
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
                            : darkMode
                              ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'
                              : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-bold min-w-0 truncate">{evt.title}</span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[11px] shrink-0 ${
                              isToday
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {formatFriendlyDate(evt.date, todayKey)} {evt.time ? `• ${evt.time}` : ''}
                          </span>
                        </div>
                        {evt.notes && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                            {evt.notes}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <EmptyStateCard
                  accent="indigo"
                  darkMode={darkMode}
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
              className={`w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold border transition active:scale-[0.98] cursor-pointer ${
                darkMode
                  ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              + Add Event or View Monthly Overlays
            </button>
          </section>

          {/* LEDGER FINANCES & BILLS CARD */}
          <section
            className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between space-y-4 ${
              darkMode
                ? 'bg-slate-900 border-slate-800'
                : 'bg-white border-slate-200/90'
            }`}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${MODULE_ACCENTS.amber.iconBg}`}
                  >
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-base">Ledger Finances</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Direct Debits, subscriptions &amp; monthly spend
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateApp('ledger')}
                  className="min-h-[40px] inline-flex items-center px-2 text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer shrink-0"
                >
                  Open Ledger &rarr;
                </button>
              </div>

              {/* Mini Monthly Totals Strip */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div
                  className={`p-2.5 rounded-2xl border ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700'
                      : 'bg-slate-50 border-slate-200/80'
                  }`}
                >
                  <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                    Committed DDs &amp; Subs
                  </div>
                  <div className="text-sm font-extrabold text-amber-700 dark:text-amber-400 mt-0.5">
                    {formatGBP(ledgerBriefing.totalMonthlyCommitted)}/mo
                  </div>
                </div>
                <div
                  className={`p-2.5 rounded-2xl border ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700'
                      : 'bg-slate-50 border-slate-200/80'
                  }`}
                >
                  <div className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                    Month&apos;s Expenses
                  </div>
                  <div className="text-sm font-extrabold text-amber-700 dark:text-amber-400 mt-0.5">
                    {formatGBP(ledgerBriefing.currentMonthExpenses)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Next Billing Dates
                </div>
                {ledgerBriefing.upcomingBills.length > 0 ? (
                  ledgerBriefing.upcomingBills.map((bill) => (
                    <button
                      key={bill.id}
                      type="button"
                      onClick={() => onNavigateApp('ledger')}
                      className={`w-full text-left p-2.5 rounded-2xl border flex items-center justify-between gap-2 cursor-pointer transition ${
                        darkMode
                          ? 'bg-slate-800/40 border-slate-700 hover:bg-slate-800'
                          : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate">{bill.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {bill.owner === 'joint'
                            ? '🤝 Joint'
                            : bill.owner === 'partner1'
                              ? `⚡ ${partner1Name}`
                              : `🌸 ${partner2Name}`}{' '}
                          • {bill.daysUntil === 0 ? 'Due Today' : `In ${bill.daysUntil}d (${bill.nextFormatted})`}
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
                    darkMode={darkMode}
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
              className={`w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold border transition active:scale-[0.98] cursor-pointer ${
                darkMode
                  ? 'border-slate-700 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              + Log Expense or View {partner1Name} / {partner2Name} / Unified Split
            </button>
          </section>

          {/* PARTNER 2'S PRIVATE FLOODGATE QUICK CARD (ONLY SHOWN FOR PARTNER 2) */}
          {activeProfile.allowedApps.includes('floodgate') && (
            <section
              className={`md:col-span-2 xl:col-span-1 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between space-y-4 ${
                darkMode
                  ? 'bg-slate-900 border-rose-900/50'
                  : 'bg-rose-50/40 border-rose-200/80'
              }`}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${MODULE_ACCENTS.rose.iconBg}`}
                    >
                      <Heart className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-base">Floodgate Journal</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {partner2Name}&apos;s private cycle, clot &amp; pain log
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 shrink-0">
                    Private
                  </span>
                </div>

                {partner2TodayLog ? (
                  <div
                    className={`p-3.5 rounded-2xl border space-y-1.5 text-xs ${
                      darkMode
                        ? 'bg-slate-800/50 border-slate-700'
                        : 'bg-white border-slate-200/80'
                    }`}
                  >
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
                  </div>
                ) : (
                  <div
                    className={`p-4 rounded-2xl border text-xs space-y-1 ${
                      darkMode
                        ? 'bg-slate-800/50 border-slate-700 text-slate-300'
                        : 'bg-white border-slate-200/80 text-slate-600'
                    }`}
                  >
                    <div className="font-bold">No entry logged yet for today</div>
                    <p className="text-slate-600 dark:text-slate-300">
                      Tap below to record flow, clots, pain score, bowel symptoms, or medications.
                    </p>
                  </div>
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
                  className={`min-h-[44px] py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-[0.98] transition ${
                    darkMode
                      ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                      : 'bg-white border-rose-200 hover:bg-rose-50 text-rose-700'
                  }`}
                >
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>GP Report</span>
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
