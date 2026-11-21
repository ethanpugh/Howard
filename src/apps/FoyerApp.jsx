import React, { useMemo } from 'react';
import {
  getLocalDateKey,
  parseLocalDateKey,
  formatTimeDisplay,
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
  UserCheck
} from 'lucide-react';

export default function FoyerApp({
  activeProfile,
  profiles,
  darkMode,
  cadenceSnapshot,
  bloomSnapshot,
  floodgateSnapshot,
  almanacEvents,
  ledgerData,
  beaconInfo,
  nowMs = Date.now(),
  onNavigateApp,
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
    () => computeBloomSummary(bloomSnapshot, now),
    [bloomSnapshot, now]
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
      <section
        className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex items-center justify-between gap-3 ${
          darkMode
            ? 'bg-slate-900 border-slate-800'
            : 'bg-white border-slate-200/90'
        }`}
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Home className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                Foyer •{' '}
                {now.toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">
              {greeting}, {activeProfile.name} {activeProfile.badgeEmoji}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {activeProfile.id === 'caregiver'
                ? `Caregiver & Pet Sitter View — ${catName}'s medicine, ${mantisName}'s mantis habitat, and emergency house guide.`
                : `Here is your live household briefing across ${catName}'s medicine, ${mantisName}'s growth & habitat, calendar events, and finances.`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenProfileModal}
          className={`p-2.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
            darkMode
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
          }`}
          title={`Switch User (${activeProfile.name})`}
          aria-label={`Switch User (${activeProfile.name})`}
        >
          <UserCheck className="w-4 h-4 text-teal-500" />
          <span className="hidden sm:inline">Switch User ({activeProfile.name})</span>
        </button>
      </section>

      {/* ====================================================================
          2. BOTTLE EXPIRY WARNING BANNER (AUTO-SURFACED WHEN <= 14 DAYS)
      ==================================================================== */}
      {bottleAlert.isAlert && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-amber-500/10 border-amber-500/40 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold">
                {bottleAlert.daysRemaining <= 0
                  ? `${catName}'s ${medName} Bottle Has Reached Expiry`
                  : `${catName}'s ${medName} Bottle Expires in ${bottleAlert.daysRemaining} Days`}
              </h3>
              <p className="text-xs opacity-85">
                {activeProfile.id === 'caregiver'
                  ? `Discard date: ${bottleAlert.expiryFormatted}. Please let a household member know a fresh bottle is needed.`
                  : `Discard date: ${bottleAlert.expiryFormatted}. Open Cadence when starting a fresh bottle.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateApp('cadence')}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shrink-0 cursor-pointer"
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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold">
                Uneaten Live Prey Inside {mantisName}&apos;s Enclosure
              </h3>
              <p className="text-xs opacity-85">
                {bloomSummary.settings.livePreyNote || 'Live feeder left inside.'} Check that {mantisName} ate or remove before lights-out.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClearMantisLivePrey}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 cursor-pointer"
          >
            ✓ Prey Eaten / Removed
          </button>
        </section>
      )}

      {bloomSummary.isNoFeedLockout && (
        <section className="rounded-2xl sm:rounded-3xl p-4 sm:p-5 border bg-fuchsia-500/10 border-fuchsia-500/40 text-fuchsia-950 dark:text-fuchsia-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-fuchsia-600 text-white flex items-center justify-center shrink-0">
              <Flower2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold">
                {bloomSummary.effectiveStatus === 'premolt'
                  ? `⚠️ ${mantisName} is in Premolt Watch — Do NOT Offer Live Prey`
                  : `🛡️ ${mantisName} Molted to ${bloomSummary.settings.currentInstar} — Hardening (${bloomSummary.hardeningRemainingLabel} left)`}
              </h3>
              <p className="text-xs opacity-85">
                {bloomSummary.effectiveStatus === 'premolt'
                  ? 'Keep enclosure unobstructed and mist wall gently; do not bump lid or leave feeders inside.'
                  : 'New exoskeleton is hardening—gentle wall misting only, hold all live prey until timer finishes.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateApp('bloom')}
            className="px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold text-xs shrink-0 cursor-pointer"
          >
            Open Bloom &rarr;
          </button>
        </section>
      )}

      {bloomSummary.feederAlerts.length > 0 && activeProfile.id !== 'caregiver' && (
        <section className="rounded-2xl sm:rounded-3xl p-4 border bg-lime-500/10 border-lime-500/40 text-lime-950 dark:text-lime-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-lime-600 text-white flex items-center justify-center shrink-0">
              <Bug className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <div className="font-extrabold text-sm">
                {mantisName}&apos;s Feeder Stash Alert ({bloomSummary.feederAlerts[0].name})
              </div>
              <p className="opacity-85">
                {bloomSummary.feederAlerts.length} active feeder culture{bloomSummary.feederAlerts.length > 1 ? 's are' : ' is'} running low or nearing culture crash age.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateApp('bloom')}
            className="px-3.5 py-2 rounded-xl bg-lime-600 hover:bg-lime-700 text-white font-bold text-xs shrink-0 cursor-pointer"
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
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white flex items-center justify-center shadow-xs">
              <Cat className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold">
                  {catName}&apos;s {medName}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
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
            className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
          >
            <span>Open Full Cadence Tracker &amp; History</span>
            <ArrowRight className="w-4 h-4" />
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    amDose?.given
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                  }`}
                >
                  <Sun className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm flex items-center gap-1.5">
                    <span>Morning Dose</span>
                    <span className="text-xs opacity-70">~{amTarget}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {amDose?.given
                      ? `Given at ${formatTimeDisplay(amDose.timestamp)} by ${amDose.givenBy}`
                      : 'Awaiting morning dose'}
                  </div>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${
                  amDose?.given
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                }`}
              >
                {amDose?.given ? 'Done' : 'Pending'}
              </span>
            </div>

            {amDose?.given ? (
              <div className="flex items-center justify-between text-xs pt-2 border-t border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">
                <span>✓ Safe — Morning dose recorded</span>
                <button
                  type="button"
                  onClick={() => onNavigateApp('cadence')}
                  className="underline cursor-pointer"
                >
                  Edit in Cadence
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onQuickRecordDose('morning')}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition"
              >
                <CheckCircle2 className="w-4 h-4" />
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    pmDose?.given
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                  }`}
                >
                  <Moon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm flex items-center gap-1.5">
                    <span>Evening Dose</span>
                    <span className="text-xs opacity-70">~{pmTarget}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {pmDose?.given
                      ? `Given at ${formatTimeDisplay(pmDose.timestamp)} by ${pmDose.givenBy}`
                      : 'Awaiting evening dose'}
                  </div>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${
                  pmDose?.given
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                }`}
              >
                {pmDose?.given ? 'Done' : 'Pending'}
              </span>
            </div>

            {pmDose?.given ? (
              <div className="flex items-center justify-between text-xs pt-2 border-t border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">
                <span>✓ Safe — Evening dose recorded</span>
                <button
                  type="button"
                  onClick={() => onNavigateApp('cadence')}
                  className="underline cursor-pointer"
                >
                  Edit in Cadence
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onQuickRecordDose('evening')}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition"
              >
                <CheckCircle2 className="w-4 h-4" />
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
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-lime-500 to-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Flower2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold">
                  {mantisName} • {bloomSummary.settings.commonName}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-lime-500/15 text-lime-700 dark:text-lime-300 border border-lime-500/30">
                  {bloomSummary.settings.currentInstar} • Day {bloomSummary.daysInCurrentInstar}
                </span>
                {bloomSummary.isNoFeedLockout && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-fuchsia-600 text-white">
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
            className="inline-flex items-center gap-1.5 text-xs font-bold text-lime-600 dark:text-lime-400 hover:underline cursor-pointer"
          >
            <span>Open Full Bloom Habitat &amp; Growth</span>
            <ArrowRight className="w-4 h-4" />
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    bloomSummary.todayMistCount > 0
                      ? 'bg-sky-600 text-white'
                      : 'bg-sky-500/20 text-sky-600 dark:text-sky-300'
                  }`}
                >
                  <Droplets className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm">Enclosure Wall Mist</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {bloomSummary.lastMist
                      ? `Last misted ${bloomSummary.lastMist.timeAgoLabel} by ${bloomSummary.lastMist.by}`
                      : 'No mists logged yet'}
                  </div>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${
                  bloomSummary.isMistDue
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {bloomSummary.isMistDue ? 'Due' : 'Hydrated'}
              </span>
            </div>

            <button
              type="button"
              onClick={onQuickMistMantis}
              className={`w-full py-2.5 px-4 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition ${
                bloomSummary.todayMistCount > 0
                  ? darkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  : 'bg-gradient-to-r from-sky-600 to-teal-600 hover:from-sky-700 hover:to-teal-700 text-white shadow-sm'
              }`}
            >
              <Droplets className="w-4 h-4" />
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
                ? darkMode
                  ? 'bg-fuchsia-950/25 border-fuchsia-800/70'
                  : 'bg-fuchsia-50/60 border-fuchsia-200'
                : darkMode
                  ? 'bg-slate-800/50 border-slate-700'
                  : 'bg-slate-50/80 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-lime-500/20 text-lime-600 dark:text-lime-300 flex items-center justify-center">
                  <Bug className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm">Feeding &amp; Abdomen</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {bloomSummary.lastMeal
                      ? `Last ate ${bloomSummary.lastMeal.friendlyWhen} (${bloomSummary.lastMeal.count}× ${bloomSummary.lastMeal.preyLabel ? bloomSummary.lastMeal.preyLabel.split(' (')[0] : 'feeder prey'})`
                      : 'No meals logged yet'}
                  </div>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold capitalize bg-lime-500/15 text-lime-700 dark:text-lime-300">
                {bloomSummary.latestAbdomen ? `Abdomen: ${bloomSummary.latestAbdomen}` : bloomSummary.settings.currentInstar}
              </span>
            </div>

            {bloomSummary.isNoFeedLockout ? (
              <div className="flex items-center justify-between text-xs pt-2 border-t border-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300 font-semibold">
                <span>
                  {bloomSummary.effectiveStatus === 'premolt'
                    ? '⚠️ Premolt — Do not offer live prey'
                    : `🛡️ Hardening (${bloomSummary.hardeningRemainingLabel} left)`}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateApp('bloom')}
                  className="underline cursor-pointer"
                >
                  Manage
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onNavigateApp('bloom')}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-lime-600 to-emerald-600 hover:from-lime-700 hover:to-emerald-700 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <Bug className="w-4 h-4" />
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
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
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
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer shrink-0 self-start sm:self-auto"
            >
              Open Full Guide &rarr;
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div
              className={`p-4 rounded-2xl border space-y-1.5 ${
                darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="font-bold text-sky-600 dark:text-sky-400 uppercase">
                🐾 Pet Care &amp; Feeding
              </div>
              <p className="leading-relaxed">
                {beaconInfo?.petCare?.feedingGuide?.trim() || 'No feeding guide entered yet.'}
              </p>
            </div>

            <div
              className={`p-4 rounded-2xl border space-y-1.5 ${
                darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="font-bold text-rose-600 dark:text-rose-400 uppercase">
                🏥 Emergency Vet
              </div>
              <div className="font-bold text-sm">
                {beaconInfo?.vetInfo?.clinicName?.trim() || 'Veterinary Clinic not set'}
              </div>
              {beaconInfo?.vetInfo?.phone?.trim() && (
                <div>
                  Daytime:{' '}
                  <a
                    href={`tel:${beaconInfo.vetInfo.phone.trim()}`}
                    className="font-mono underline"
                  >
                    {beaconInfo.vetInfo.phone.trim()}
                  </a>
                </div>
              )}
              {beaconInfo?.vetInfo?.emergencyPhone?.trim() && (
                <div className="text-rose-600 dark:text-rose-400 font-semibold">
                  Emergency:{' '}
                  <a
                    href={`tel:${beaconInfo.vetInfo.emergencyPhone.trim()}`}
                    className="font-mono underline"
                  >
                    {beaconInfo.vetInfo.emergencyPhone.trim()}
                  </a>
                </div>
              )}
            </div>

            <div
              className={`p-4 rounded-2xl border space-y-1.5 ${
                darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="font-bold text-teal-600 dark:text-teal-400 uppercase">
                📞 Contact {partner1Name} &amp; {partner2Name}
              </div>
              {(beaconInfo?.contacts || []).length > 0 ? (
                (beaconInfo?.contacts || []).map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-0.5 gap-2">
                    <span className="font-semibold truncate">{c.name || 'Contact'}:</span>
                    {c.phone?.trim() ? (
                      <a
                        href={`tel:${c.phone.trim()}`}
                        className="font-mono underline text-teal-600 dark:text-teal-400 shrink-0"
                      >
                        {c.phone.trim()}
                      </a>
                    ) : (
                      <span className="text-slate-400 italic shrink-0">No number</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500">No contacts listed.</div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <div
          className={`grid grid-cols-1 ${
            activeProfile.allowedApps.includes('floodgate')
              ? 'lg:grid-cols-3'
              : 'lg:grid-cols-2'
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base">Almanac Agenda</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Upcoming household dates &amp; appointments
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateApp('almanac')}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
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
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold truncate">{evt.title}</span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] shrink-0 ${
                              isToday
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isToday ? 'Today' : evt.date} {evt.time ? `• ${evt.time}` : ''}
                          </span>
                        </div>
                        {evt.notes && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                            {evt.notes}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No upcoming events on the Almanac calendar.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigateApp('almanac')}
              className={`w-full py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base">Ledger Finances</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Direct Debits, subscriptions &amp; monthly spend
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateApp('ledger')}
                  className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
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
                  <div className="text-[10px] font-bold uppercase opacity-60">
                    Committed DDs &amp; Subs
                  </div>
                  <div className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
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
                  <div className="text-[10px] font-bold uppercase opacity-60">
                    Month&apos;s Expenses
                  </div>
                  <div className="text-sm font-extrabold text-amber-600 dark:text-amber-400">
                    {formatGBP(ledgerBriefing.currentMonthExpenses)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider opacity-60">
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
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{bill.title}</div>
                        <div className="text-[11px] text-slate-500">
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
                  <p className="text-xs text-slate-500 py-3 text-center">
                    No active recurring bills scheduled yet.
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateApp('ledger')}
              className={`w-full py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
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
              className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between space-y-4 ${
                darkMode
                  ? 'bg-stone-900 border-rose-950/60'
                  : 'bg-rose-50/40 border-rose-200/80'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                      <Heart className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base">Floodgate Journal</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {partner2Name}&apos;s private cycle, clot &amp; pain log
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-300">
                    Private
                  </span>
                </div>

                {partner2TodayLog ? (
                  <div
                    className={`p-3.5 rounded-2xl border space-y-1.5 text-xs ${
                      darkMode
                        ? 'bg-stone-950/70 border-stone-800'
                        : 'bg-white border-rose-100'
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
                        ? 'bg-stone-950/50 border-stone-800 text-stone-300'
                        : 'bg-white border-rose-100 text-stone-600'
                    }`}
                  >
                    <div className="font-bold">No entry logged yet for today</div>
                    <p className="opacity-80">
                      Tap below to record flow, clots, pain score, bowel symptoms, or medications.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onOpenFloodgate({ tab: 'log', date: todayKey })}
                  className="py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                >
                  {partner2TodayLog ? 'Edit Today' : 'Log Today'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenFloodgate({ tab: 'insights', date: todayKey })}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 cursor-pointer ${
                    darkMode
                      ? 'border-stone-700 hover:bg-stone-800 text-stone-200'
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
