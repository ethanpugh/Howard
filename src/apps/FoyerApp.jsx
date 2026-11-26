import React, { memo, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bug,
  Calendar,
  Cat,
  Droplets,
  Flower2,
  Heart,
  Home,
  PawPrint,
  Phone,
  Pin,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  StickyNote,
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
  AlertBanner,
  Button,
  EmptyStateCard,
  IconBadge,
  ModuleEmbedCard,
  ModuleHeader,
  ModulePage,
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
  onOpenProfileModal: _onOpenProfileModal,
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

  const almanacBriefing = useMemo(() => {
    const visibleEvents = (almanacEvents || []).filter((e) =>
      isAlmanacEventVisibleToProfile(e, activeProfile, partner2Name)
    );
    let todayCount = 0;
    let next7DaysCount = 0;
    for (let offset = 0; offset < 7; offset++) {
      const dKey = shiftDateKey(todayKey, offset);
      visibleEvents.forEach((evt) => {
        if (doesAlmanacEventOccurOnDate(evt, dKey)) {
          if (offset === 0) todayCount += 1;
          next7DaysCount += 1;
        }
      });
    }
    return { todayCount, next7DaysCount };
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
    <ModulePage module="foyer">
      {/* 1. FOYER WELCOME BANNER */}
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
      />

      {/* 2. BOTTLE EXPIRY WARNING BANNER (AUTO-SURFACED WHEN <= 14 DAYS) */}
      {bottleAlert.isAlert && (
        <AlertBanner
          severity="warn"
          icon={AlertTriangle}
          moduleAccent="purple"
          moduleLabel="Cadence"
          title={
            bottleAlert.daysRemaining <= 0
              ? `${catName}'s ${medName} Bottle Has Reached Expiry`
              : `${catName}'s ${medName} Bottle Expires in ${bottleAlert.daysRemaining} Days`
          }
          description={
            activeProfile.id === 'caregiver'
              ? `Discard date: ${bottleAlert.expiryFormatted}. Please let a household member know a fresh bottle is needed.`
              : `Discard date: ${bottleAlert.expiryFormatted}. Open Cadence when starting a fresh bottle.`
          }
          action={
            <Button variant="primary" accent="amber" size="md" onClick={navigateCadence}>
              {activeProfile.id === 'caregiver'
                ? 'View in Cadence →'
                : 'Manage Bottle in Cadence →'}
            </Button>
          }
        />
      )}

      {/* BLOOM SAFETY ALERTS */}
      {bloomSummary.settings.livePreyInside && (
        <AlertBanner
          severity="danger"
          icon={ShieldAlert}
          moduleAccent="emerald"
          moduleLabel="Bloom"
          title={`Uneaten Live Prey Inside ${mantisName}'s Enclosure`}
          description={`${bloomSummary.settings.livePreyNote || 'Live feeder left inside.'} Check that ${mantisName} ate or remove before lights-out.`}
          action={
            <Button
              variant="danger"
              size="md"
              disabled={quickActionPending}
              onClick={onClearMantisLivePrey}
            >
              ✓ Prey Eaten / Removed
            </Button>
          }
        />
      )}

      {bloomSummary.isNoFeedLockout && (
        <AlertBanner
          severity={bloomSummary.effectiveStatus === 'premolt' ? 'warn' : 'danger'}
          icon={Flower2}
          moduleAccent="emerald"
          moduleLabel="Bloom"
          title={
            bloomSummary.effectiveStatus === 'premolt'
              ? `${mantisName} is in Premolt Watch — Do NOT Offer Live Prey`
              : `${mantisName} Molted to ${bloomSummary.settings.currentInstar} — Hardening (${bloomSummary.hardeningRemainingLabel} left)`
          }
          description={
            bloomSummary.effectiveStatus === 'premolt'
              ? 'Keep enclosure unobstructed and mist wall gently; do not bump lid or leave feeders inside.'
              : 'New exoskeleton is hardening—gentle wall misting only, hold all live prey until timer finishes.'
          }
          action={
            <Button
              variant={bloomSummary.effectiveStatus === 'premolt' ? 'primary' : 'danger'}
              accent="amber"
              size="md"
              onClick={() => onNavigateApp('bloom')}
            >
              Open Bloom &rarr;
            </Button>
          }
        />
      )}

      {bloomSummary.feederAlerts.length > 0 && activeProfile.id !== 'caregiver' && (
        <AlertBanner
          severity="success"
          icon={Bug}
          moduleAccent="emerald"
          moduleLabel="Bloom"
          title={`${mantisName}'s Feeder Stash Alert (${bloomSummary.feederAlerts[0].name})`}
          description={`${bloomSummary.feederAlerts.length} active feeder culture${
            bloomSummary.feederAlerts.length > 1 ? 's are' : ' is'
          } running low or nearing culture crash age.`}
          action={
            <Button
              variant="primary"
              accent="emerald"
              size="md"
              onClick={() => (onOpenBloom ? onOpenBloom({ tab: 'habitat' }) : onNavigateApp('bloom'))}
            >
              Check Feeders in Bloom &rarr;
            </Button>
          }
        />
      )}

      {/* 3. LIVE CADENCE FAST-ACTION WIDGET */}
      <ModuleEmbedCard
        module="cadence"
        accent="purple"
        icon={Cat}
        title={`${catName}'s ${medName}`}
        badges={<StatusPill accent="purple">{dosageLabel}</StatusPill>}
        subtitle={
          <>
            One-tap household dose check-in (logs as{' '}
            <strong className="text-text-primary">{caregiverLabel}</strong>)
          </>
        }
        onOpen={navigateCadence}
        openAriaLabel="Open Full Cadence Tracker & History"
        openTitle="Open Full Cadence Tracker & History"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
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
      </ModuleEmbedCard>

      {/* 3B. LIVE BLOOM FAST-ACTION WIDGET */}
      <ModuleEmbedCard
        module="bloom"
        accent="emerald"
        icon={Flower2}
        title={`${mantisName} • ${bloomSummary.settings.commonName}`}
        badges={
          <>
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
          </>
        }
        subtitle={
          <>
            Habitat misting, prey log &amp; molt tracker (logs as{' '}
            <strong className="text-text-primary">{caregiverLabel}</strong>)
          </>
        }
        onOpen={() => onNavigateApp('bloom')}
        openAriaLabel="Open Full Bloom Habitat & Growth"
        openTitle="Open Full Bloom Habitat & Growth"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {/* Quick Enclosure Mist Card */}
          <div
            className={`rounded-2xl p-4 border-2 flex flex-col justify-between gap-3 transition ${
              bloomSummary.todayMistCount > 0
                ? 'bg-emerald-500/10 border-emerald-500/35'
                : 'bg-surface-subtle border-border-subtle'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <IconBadge
                  icon={Droplets}
                  accent="emerald"
                  size="md"
                  className={bloomSummary.todayMistCount > 0 ? '!bg-emerald-700 !text-white' : ''}
                />
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

            <Button
              variant={bloomSummary.todayMistCount > 0 ? 'secondary' : 'primary'}
              accent="emerald"
              size="lg"
              icon={Droplets}
              disabled={quickActionPending}
              onClick={onQuickMistMantis}
              className="w-full"
            >
              <span>
                {bloomSummary.todayMistCount > 0
                  ? `Log Another Mist (${bloomSummary.todayMistCount} today)`
                  : `Mist ${mantisName}'s Enclosure (${caregiverLabel})`}
              </span>
            </Button>
          </div>

          {/* Quick Feeding & Instar Status Card */}
          <div
            className={`rounded-2xl p-4 border-2 flex flex-col justify-between gap-3 transition ${
              bloomSummary.isNoFeedLockout
                ? bloomSummary.effectiveStatus === 'premolt'
                  ? 'bg-amber-500/10 border-amber-500/35'
                  : 'bg-rose-500/10 border-rose-500/35'
                : 'bg-surface-subtle border-border-subtle'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <IconBadge icon={Bug} accent="emerald" size="md" />
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
                <span className="min-w-0 inline-flex items-center gap-1.5">
                  {bloomSummary.effectiveStatus === 'premolt' ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Premolt — Do not offer live prey</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span>Hardening ({bloomSummary.hardeningRemainingLabel} left)</span>
                    </>
                  )}
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
              <Button
                variant="primary"
                accent="emerald"
                size="lg"
                icon={Bug}
                iconRight={ArrowRight}
                onClick={() => onNavigateApp('bloom')}
                className="w-full"
              >
                <span>Log Meal or Abdomen</span>
              </Button>
            )}
          </div>
        </div>
      </ModuleEmbedCard>

      {/* 4. PROFILE-ADAPTIVE HOUSEHOLD GRID */}
      {activeProfile.id === 'caregiver' ? (
        <div className="space-y-3 sm:space-y-4">
        <ModuleEmbedCard
          module="beacon"
          accent="sky"
          icon={ShieldAlert}
          title="Beacon • Pet Sitter & Emergency Quick Reference"
          subtitle="Essential details while looking after the pets and the house"
          onOpen={() => onNavigateApp('beacon')}
          openAriaLabel="Open Full Beacon Guide"
          openTitle="Open Full Beacon Guide"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 text-xs">
            <SubSurface className="p-3.5 sm:p-4 space-y-1.5">
              <div className="font-bold text-sky-700 dark:text-sky-300 uppercase flex items-center gap-1.5">
                <PawPrint className="w-3.5 h-3.5 shrink-0" />
                <span>Pet Care &amp; Feeding</span>
              </div>
              <p className="leading-relaxed">
                {beaconInfo?.petCare?.feedingGuide?.trim() || 'No feeding guide entered yet.'}
              </p>
            </SubSurface>

            <SubSurface className="p-3.5 sm:p-4 space-y-2">
              <div className="font-bold text-rose-600 dark:text-rose-400 uppercase flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 shrink-0" />
                <span>Emergency Vet</span>
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
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs inline-flex items-center gap-1.5 max-w-full min-w-0 transition active:scale-[0.98]"
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
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs inline-flex items-center gap-1.5 max-w-full min-w-0 transition active:scale-[0.98]"
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

            <SubSurface className="md:col-span-2 lg:col-span-1 p-3.5 sm:p-4 space-y-1.5">
              <div className="font-bold text-sky-700 dark:text-sky-300 uppercase flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 shrink-0" />
                <span>Household &amp; Emergency Contacts</span>
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
        </ModuleEmbedCard>

        {foyerQuillSummary.notes.length > 0 && (
          <ModuleEmbedCard
            module="quill"
            accent="yellow"
            icon={StickyNote}
            title="Quill • House Notes"
            badges={
              <StatusPill accent="yellow">
                {foyerQuillSummary.totalActiveCount} house
              </StatusPill>
            }
            subtitle="Shared notes & checklists left for pet sitting and guests"
            onOpen={() => (onOpenQuill ? onOpenQuill({ tab: 'shared' }) : onNavigateApp('quill'))}
            openAriaLabel="Open Quill House Notes"
            openTitle="Open Quill House Notes"
          >
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
                      <div className="text-xs text-text-muted font-semibold tabular-nums">
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
          </ModuleEmbedCard>
        )}
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
        <div
          className={`grid grid-cols-1 md:grid-cols-2 ${
            activeProfile.allowedApps.includes('floodgate') ? 'xl:grid-cols-3' : ''
          } gap-3 sm:gap-4`}
        >
          {/* ALMANAC UPCOMING AGENDA CARD */}
          <ModuleEmbedCard
            module="almanac"
            accent="indigo"
            icon={Calendar}
            title="Almanac Agenda"
            subtitle="Upcoming household dates & appointments"
            onOpen={() => onNavigateApp('almanac')}
            openAriaLabel="Open Almanac Calendar"
            openTitle="Open Almanac Calendar"
            footer={
              upcomingEvents.length > 0 ? (
                <Button
                  variant="secondary"
                  accent="indigo"
                  size="md"
                  onClick={() => onNavigateApp('almanac')}
                  className="w-full"
                >
                  + Add Event or View Monthly Overlays
                </Button>
              ) : null
            }
          >
            <div className="grid grid-cols-2 gap-2 text-xs">
              <SubSurface className="p-2.5">
                <div className="text-[11px] font-bold uppercase text-text-muted">Today</div>
                <div className="text-sm font-extrabold text-indigo-700 dark:text-indigo-400 mt-0.5 tabular-nums">
                  {almanacBriefing.todayCount}{' '}
                  {almanacBriefing.todayCount === 1 ? 'event' : 'events'}
                </div>
              </SubSurface>
              <SubSurface className="p-2.5">
                <div className="text-[11px] font-bold uppercase text-text-muted">Next 7 Days</div>
                <div className="text-sm font-extrabold text-indigo-700 dark:text-indigo-400 mt-0.5 tabular-nums">
                  {almanacBriefing.next7DaysCount} scheduled
                </div>
              </SubSurface>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Upcoming Dates
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
                            className={`px-2 py-0.5 rounded-md font-bold text-[11px] shrink-0 tabular-nums ${
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
                  compact
                  accent="indigo"
                  icon={Calendar}
                  title="No upcoming events"
                  description="Your Almanac schedule is clear."
                  action={
                    <Button
                      variant="tinted"
                      accent="indigo"
                      size="sm"
                      onClick={() => onNavigateApp('almanac')}
                    >
                      + Add Event
                    </Button>
                  }
                />
              )}
            </div>
          </ModuleEmbedCard>

          {/* LEDGER FINANCES & BILLS CARD */}
          <ModuleEmbedCard
            module="ledger"
            accent="orange"
            icon={Wallet}
            title="Ledger Finances"
            subtitle="Direct Debits, subscriptions & monthly spend"
            onOpen={() => onNavigateApp('ledger')}
            openAriaLabel="Open Ledger Finances"
            openTitle="Open Ledger Finances"
            footer={
              ledgerBriefing.upcomingBills.length > 0 ? (
                <Button
                  variant="secondary"
                  accent="orange"
                  size="md"
                  onClick={() => onNavigateApp('ledger')}
                  className="w-full"
                >
                  + Log Expense or View Split
                </Button>
              ) : null
            }
          >
            <div className="grid grid-cols-2 gap-2 text-xs">
              <SubSurface className="p-2.5">
                <div className="text-[11px] font-bold uppercase text-text-muted">
                  Committed DDs &amp; Subs
                </div>
                <div className="text-sm font-extrabold text-orange-700 dark:text-orange-400 mt-0.5 tabular-nums">
                  {formatGBP(ledgerBriefing.totalMonthlyCommitted)}/mo
                </div>
              </SubSurface>
              <SubSurface className="p-2.5">
                <div className="text-[11px] font-bold uppercase text-text-muted">
                  Month&apos;s Expenses
                </div>
                <div className="text-sm font-extrabold text-orange-700 dark:text-orange-400 mt-0.5 tabular-nums">
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
                    <span className="text-xs font-extrabold shrink-0 tabular-nums">
                      {formatGBP(bill.amount)}
                    </span>
                  </button>
                ))
              ) : (
                <EmptyStateCard
                  compact
                  accent="orange"
                  icon={Wallet}
                  title="No scheduled bills yet"
                  description="Log expenses or add recurring bills."
                  action={
                    <Button
                      variant="tinted"
                      accent="orange"
                      size="sm"
                      onClick={() => onNavigateApp('ledger')}
                    >
                      + Log Item
                    </Button>
                  }
                />
              )}
            </div>
          </ModuleEmbedCard>

          {/* PARTNER 2'S PRIVATE FLOODGATE QUICK CARD */}
          {activeProfile.allowedApps.includes('floodgate') && (
            <ModuleEmbedCard
              module="floodgate"
              accent="rose"
              icon={Heart}
              title="Floodgate Journal"
              badges={<StatusPill accent="rose">Private</StatusPill>}
              subtitle={`${partner2Name}'s private cycle, clot & pain log`}
              onOpen={() => onOpenFloodgate({ tab: 'log', date: todayKey })}
              openAriaLabel="Open Floodgate Journal"
              openTitle="Open Floodgate Journal"
              className="md:col-span-2 xl:col-span-1"
              footer={
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="primary"
                    accent="rose"
                    size="lg"
                    onClick={() => onOpenFloodgate({ tab: 'log', date: todayKey })}
                  >
                    {partner2TodayLog ? 'Edit Today' : 'Log Today'}
                  </Button>
                  <Button
                    variant="secondary"
                    accent="rose"
                    size="lg"
                    icon={Stethoscope}
                    onClick={() => onOpenFloodgate({ tab: 'insights', date: todayKey })}
                  >
                    GP Report
                  </Button>
                </div>
              }
            >
              {partner2TodayLog ? (
                <SubSurface className="p-3.5 space-y-1.5 text-xs">
                  <div className="font-bold text-rose-600 dark:text-rose-400">
                    ✓ Today&apos;s Symptom Entry Logged
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold capitalize">
                      Flow: {partner2TodayLog.bleedingSeverity || 'none'}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold tabular-nums">
                      Pain: {partner2TodayLog.painScore || 0}/10
                    </span>
                    {partner2TodayLog.hasClots && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold tabular-nums">
                        Clots: {partner2TodayLog.clotCount}
                      </span>
                    )}
                  </div>
                </SubSurface>
              ) : (
                <SubSurface className="p-3.5 text-xs space-y-1 text-text-secondary">
                  <div className="font-bold text-text-primary">No entry logged yet for today</div>
                  <p>
                    Tap below to record flow, clots, pain score, bowel symptoms, or medications.
                  </p>
                </SubSurface>
              )}
            </ModuleEmbedCard>
          )}
        </div>

        {/* QUILL SHARED NOTES CARD */}
        <ModuleEmbedCard
          module="quill"
          accent="yellow"
          icon={StickyNote}
          title="Quill Shared Notes"
          badges={
            <StatusPill accent="yellow">
              {foyerQuillSummary.totalPinnedCount > 0
                ? `${foyerQuillSummary.totalPinnedCount} pinned`
                : 'Shared Board'}
            </StatusPill>
          }
          subtitle="Pinned household notes, shopping lists & quick reminders"
          onOpen={() => (onOpenQuill ? onOpenQuill({ tab: 'shared' }) : onNavigateApp('quill'))}
          openAriaLabel="Open Quill Shared Board"
          openTitle="Open Quill Shared Board"
          footer={
            foyerQuillSummary.notes.length > 0 ? (
              <Button
                variant="secondary"
                accent="yellow"
                size="md"
                onClick={() => (onOpenQuill ? onOpenQuill({ tab: 'shared' }) : onNavigateApp('quill'))}
                className="w-full"
              >
                + Take a Note or View Shared Board
              </Button>
            ) : null
          }
        >
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
                      <div className="text-xs text-text-muted font-semibold tabular-nums">
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
              compact
              accent="yellow"
              icon={StickyNote}
              title="No shared notes yet"
              description="Pin a note on Quill's Shared Board to surface it here."
              action={
                <Button
                  variant="tinted"
                  accent="yellow"
                  size="sm"
                  onClick={() => (onOpenQuill ? onOpenQuill({ tab: 'shared' }) : onNavigateApp('quill'))}
                >
                  + Take a Note
                </Button>
              }
            />
          )}
        </ModuleEmbedCard>
        </div>
      )}
    </ModulePage>
  );
}

export default memo(FoyerApp);
