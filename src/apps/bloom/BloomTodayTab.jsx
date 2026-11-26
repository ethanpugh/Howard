import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bug,
  CheckCircle2,
  Droplets,
  Edit3,
  History,
  Info,
  ShieldAlert,
  Sparkles,
  Thermometer,
  XCircle
} from 'lucide-react';
import {
  Button,
  IconBadge,
  MetricStrip,
  MetricTile,
  SectionCard,
  SubSurface,
  WeeklyHistoryPanel,
  getFieldClass
} from '../../components/HowardUI.jsx';
import {
  formatFriendlyDate,
  formatShortPreyLabel,
  formatTimeDisplay
} from '../../utils/householdHelpers.js';
import { useWeekNavigation } from '../../hooks/useWeekNavigation.js';
import { PREY_OPTIONS } from './bloomConstants.js';
import {
  AbdomenPicker,
  BehaviorJournalEditor,
  CareEntryList,
  ClimateFields
} from './BloomSharedParts.jsx';

export default function BloomTodayTab({
  settings,
  summary,
  logsByDate,
  todayKey,
  activeCaregiver,
  canConfigure,
  isPending,
  onLogMist,
  onLogFeeding,
  onUpdateAbdomenOnly,
  onLogClimate,
  onToggleBehavior,
  onSaveJournalNote,
  onTogglePremolt,
  onOpenMoltModal,
  onOpenBackfillModal,
  onRequestDelete
}) {
  const [mistDrinkObserved, setMistDrinkObserved] = useState(false);
  const [mistNoteInput, setMistNoteInput] = useState('');

  const [selectedPrey, setSelectedPrey] = useState('hydei');
  const [preyCount, setPreyCount] = useState(3);
  const [selectedAbdomen, setSelectedAbdomen] = useState(summary.latestAbdomen || '');
  const [leavePreyWarning, setLeavePreyWarning] = useState(false);
  const [feedNoteInput, setFeedNoteInput] = useState('');
  const [overrideFeedLockout, setOverrideFeedLockout] = useState(false);

  const [tempInput, setTempInput] = useState('');
  const [humidityInput, setHumidityInput] = useState('');
  const [journalDraft, setJournalDraft] = useState(summary.todayLog?.journalNote || '');

  useEffect(() => {
    if (!canConfigure) {
      setOverrideFeedLockout(false);
    }
  }, [canConfigure]);

  useEffect(() => {
    setJournalDraft(summary.todayLog?.journalNote || '');
  }, [summary.todayLog?.journalNote, todayKey]);

  useEffect(() => {
    if (summary.latestAbdomen) {
      setSelectedAbdomen(summary.latestAbdomen);
    }
  }, [summary.latestAbdomen]);

  const weekNav = useWeekNavigation(todayKey);

  const moltsByDate = useMemo(() => {
    const map = new Map();
    for (const m of summary.molts || []) {
      if (!m?.dateKey) continue;
      const list = map.get(m.dateKey) || [];
      list.push(m);
      map.set(m.dateKey, list);
    }
    return map;
  }, [summary.molts]);

  const weekStats = useMemo(() => {
    let mistedDays = 0;
    let mealsCount = 0;
    let gapDays = 0;

    weekNav.selectedWeekDays.forEach((dKey) => {
      const rec = logsByDate?.[dKey] || {};
      const dayMolts = moltsByDate.get(dKey) || [];
      const mistCount = (rec.mists || []).length;
      const feedings = rec.feedings || [];
      const hasActivity =
        mistCount > 0 ||
        feedings.length > 0 ||
        (rec.climateChecks || []).length > 0 ||
        (rec.behaviors || []).length > 0 ||
        Boolean(rec.abdomenStatus) ||
        Boolean(rec.journalNote) ||
        dayMolts.length > 0;

      if (mistCount > 0) mistedDays += 1;
      feedings.forEach((f) => {
        if (f.outcome !== 'refused') mealsCount += 1;
      });
      if (!hasActivity && dKey < todayKey) {
        gapDays += 1;
      }
    });

    return { mistedDays, mealsCount, gapDays };
  }, [weekNav.selectedWeekDays, logsByDate, moltsByDate, todayKey]);

  const handleSubmitMist = async (e) => {
    e.preventDefault();
    const ok = await onLogMist(todayKey, {
      drank: mistDrinkObserved,
      note: mistNoteInput
    });
    if (ok) {
      setMistDrinkObserved(false);
      setMistNoteInput('');
    }
  };

  const handleSubmitFeeding = async (outcome) => {
    const ok = await onLogFeeding(outcome, todayKey, {
      preyId: selectedPrey,
      count: preyCount,
      abdomenAfter: selectedAbdomen || null,
      note: feedNoteInput,
      leavePreyWarning
    });
    if (ok) {
      setFeedNoteInput('');
      setLeavePreyWarning(false);
      setOverrideFeedLockout(false);
    }
  };

  const handleSubmitClimate = async (e) => {
    e.preventDefault();
    const ok = await onLogClimate(todayKey, {
      temp: tempInput,
      humidity: humidityInput
    });
    if (ok) {
      setTempInput('');
      setHumidityInput('');
    }
  };

  const handleSubmitJournal = async (e) => {
    e.preventDefault();
    await onSaveJournalNote(todayKey, journalDraft);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {settings.careNote && (
        <div className="p-3.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-text-primary text-xs flex items-start gap-2.5 shadow-xs">
          <Info className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{settings.careNote}</p>
        </div>
      )}

      {/* Quick Status Metrics Strip */}
      <MetricStrip>
        <MetricTile
          label="Stage & Molt Clock"
          accent="emerald"
          value={`${settings.currentInstar} • Day ${summary.daysInCurrentInstar}`}
          valueClassName="text-base sm:text-lg text-emerald-700 dark:text-emerald-400"
          sublabel={
            summary.isAdult
              ? 'Winged Adult (final molt complete)'
              : `Est. molt ~${formatFriendlyDate(summary.projectedNextMoltDateStr, todayKey)}`
          }
        />

        <MetricTile
          label="Hydration / Mist"
          accent="emerald"
          value={summary.lastMist ? summary.lastMist.timeAgoLabel : 'No mists yet'}
          valueClassName="text-base sm:text-lg text-emerald-700 dark:text-emerald-400"
          sublabel={
            summary.lastMist
              ? `By ${summary.lastMist.by} (${summary.todayMistCount} today)`
              : `Target: every ~${settings.mistTargetHours}h`
          }
        />

        <MetricTile
          label="Feeding & Abdomen"
          accent="emerald"
          value={summary.lastMeal ? summary.lastMeal.friendlyWhen : 'Not logged yet'}
          valueClassName="text-base sm:text-lg text-emerald-700 dark:text-emerald-400"
          sublabel={<span className="capitalize">Abdomen: {summary.latestAbdomen || 'Unchecked'}</span>}
        />

        <MetricTile label="Lifecycle Mode" accent="emerald">
          {canConfigure ? (
            <div
              className={`grid gap-1.5 pt-1.5 ${
                summary.effectiveStatus !== 'premolt' && !summary.isAdult
                  ? 'grid-cols-1 xl:grid-cols-2'
                  : 'grid-cols-1'
              }`}
            >
              {summary.effectiveStatus !== 'premolt' && !summary.isAdult && (
                <Button
                  variant="tinted"
                  accent="amber"
                  size="sm"
                  disabled={isPending}
                  onClick={() => onTogglePremolt(true)}
                  className="whitespace-nowrap"
                >
                  Premolt
                </Button>
              )}
              <Button
                variant="primary"
                accent="emerald"
                size="sm"
                onClick={onOpenMoltModal}
                className="whitespace-nowrap"
              >
                + Log Molt
              </Button>
            </div>
          ) : (
            <div className="text-xs font-bold capitalize mt-1">
              {summary.effectiveStatus === 'premolt'
                ? 'Premolt Watch (No Prey)'
                : summary.effectiveStatus === 'hardening'
                  ? `Hardening (${summary.hardeningRemainingLabel})`
                  : 'Normal Hunting'}
            </div>
          )}
        </MetricTile>
      </MetricStrip>

      {/* Primary 2-Column Care Grid: Left (Misting + Micro-Climate), Right (Feeding & Abdomen) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-4 sm:gap-5">
        <div className="space-y-4 sm:space-y-5">
        {/* CARD A: MISTING & HYDRATION */}
        <SectionCard className="flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <IconBadge icon={Droplets} accent="emerald" />
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold">Misting &amp; Drinking Droplets</h2>
                  <p className="text-xs text-text-muted">
                    Mist wall lightly (~{settings.humidityMinPct}–{settings.humidityMaxPct}% RH) &amp;
                    let dry between sprays
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                  summary.isMistDue
                    ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                    : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                }`}
              >
                {summary.isMistDue ? 'Mist Due' : 'Misted Recently'}
              </span>
            </div>

            {/* Anti-double-mist banner */}
            <div
              className={`p-3.5 rounded-2xl border text-xs ${
                summary.todayMistCount > 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                  : 'bg-surface-subtle border-border-subtle text-text-primary'
              }`}
            >
              {summary.lastMist ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words">
                    Last misted <strong>{summary.lastMist.timeAgoLabel}</strong> by{' '}
                    <strong>{summary.lastMist.by}</strong>
                    {summary.lastMist.dropletDrinkObserved ? ' • Drank droplets' : ''}
                  </span>
                  <span className="font-mono text-xs text-text-secondary shrink-0">
                    {formatTimeDisplay(summary.lastMist.timestamp)}
                  </span>
                </div>
              ) : (
                <span>No enclosure mists recorded yet today.</span>
              )}
            </div>

            <form onSubmit={handleSubmitMist} className="space-y-3">
              <label className="min-h-[40px] flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={mistDrinkObserved}
                  onChange={(e) => setMistDrinkObserved(e.target.checked)}
                  className="rounded accent-emerald-600 w-4 h-4 shrink-0"
                />
                <span className="inline-flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>Spotted {settings.mantisName} drinking wall droplets</span>
                </span>
              </label>

              <input
                type="text"
                value={mistNoteInput}
                onChange={(e) => setMistNoteInput(e.target.value)}
                placeholder="Optional mist note (e.g., light wall spray)..."
                className={getFieldClass('emerald')}
              />

              <button
                type="submit"
                disabled={isPending}
                className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98] transition"
              >
                <Droplets className="w-4 h-4" />
                <span>Log Enclosure Mist ({activeCaregiver})</span>
              </button>
            </form>
          </div>

          <CareEntryList
            dateKey={todayKey}
            mists={summary.todayLog.mists || []}
            variant="card"
            title={`Today's Mists (${(summary.todayLog.mists || []).length})`}
            onRequestDelete={onRequestDelete}
            disabled={isPending}
          />
        </SectionCard>

        {/* CARD C: ENCLOSURE TEMP & HUMIDITY (paired under Misting to balance Feeding height) */}
        <SectionCard className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <IconBadge icon={Thermometer} accent="amber" size="sm" />
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold">Enclosure Temp &amp; Humidity</h3>
                <p className="text-xs text-text-muted">
                  Target: {settings.dayTempMinC}–{settings.dayTempMaxC}°C day •{' '}
                  {settings.humidityMinPct}–{settings.humidityMaxPct}% RH
                </p>
              </div>
            </div>
          </div>

          {summary.latestClimate && (
            <SubSurface className="p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <span>
                Latest:{' '}
                {summary.latestClimate.tempC != null && (
                  <strong>{summary.latestClimate.tempC}°C </strong>
                )}
                {summary.latestClimate.humidityPct != null && (
                  <strong>• {summary.latestClimate.humidityPct}% RH</strong>
                )}
              </span>
              <span className="text-xs text-text-muted">
                {formatFriendlyDate(summary.latestClimate.dateKey, todayKey)}{' '}
                {formatTimeDisplay(summary.latestClimate.timestamp)}
              </span>
            </SubSurface>
          )}

          <ClimateFields
            tempValue={tempInput}
            onTempChange={setTempInput}
            humidityValue={humidityInput}
            onHumidityChange={setHumidityInput}
            onSubmit={handleSubmitClimate}
            submitLabel="Log Check"
            isPending={isPending}
          />

          <CareEntryList
            dateKey={todayKey}
            climateChecks={summary.todayLog.climateChecks || []}
            variant="card"
            title={`Today's Climate Checks (${(summary.todayLog.climateChecks || []).length})`}
            onRequestDelete={onRequestDelete}
            disabled={isPending}
          />
        </SectionCard>
        </div>

        {/* CARD B: FEEDING & ABDOMEN PLUMPNESS GAUGE */}
        <SectionCard className="flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <IconBadge icon={Bug} accent="emerald" />
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold">Feeding &amp; Abdomen Plumpness</h2>
                  <p className="text-xs text-text-muted">
                    Feed by abdomen roundness rather than a rigid clock
                  </p>
                </div>
              </div>
            </div>

            <AbdomenPicker
              value={selectedAbdomen}
              onChange={setSelectedAbdomen}
              latestAbdomen={summary.latestAbdomen}
              label={`${settings.mantisName}'s Abdomen Plumpness Check:`}
              onSaveOnly={() => {
                if (selectedAbdomen) onUpdateAbdomenOnly(selectedAbdomen, todayKey);
              }}
              saveLabel="Save Check Only"
              disabled={isPending}
            />

            {/* Safety lockout guard during Premolt / Post-Molt Hardening */}
            {summary.isNoFeedLockout && !(canConfigure && overrideFeedLockout) ? (
              <div className="p-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 space-y-2 text-xs">
                <div className="font-extrabold flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    Feeding Locked (
                    {summary.effectiveStatus === 'premolt' ? 'Premolt Watch' : 'Post-Molt Hardening'}
                    )
                  </span>
                </div>
                <p className="text-text-secondary leading-relaxed">
                  Live feeders can disturb a molting nymph or injure soft new raptorial legs. Wait
                  until hardening completes before offering prey.
                </p>
                {canConfigure && (
                  <button
                    type="button"
                    onClick={() => setOverrideFeedLockout(true)}
                    className="min-h-[40px] px-2.5 rounded-xl text-xs font-bold underline text-amber-800 dark:text-amber-300 hover:bg-amber-500/15 active:scale-[0.98] transition cursor-pointer"
                  >
                    Override &amp; log a feeding anyway
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2 min-w-0">
                    <label className="block text-xs font-bold uppercase text-text-muted mb-1">
                      Feeder Prey
                    </label>
                    <select
                      value={selectedPrey}
                      onChange={(e) => setSelectedPrey(e.target.value)}
                      className={getFieldClass('emerald', 'font-semibold min-w-0')}
                    >
                      {PREY_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} ({p.stages})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-bold uppercase text-text-muted mb-1">
                      Count
                    </label>
                    <div className="flex items-center rounded-xl border border-border-strong overflow-hidden bg-surface-input">
                      <button
                        type="button"
                        onClick={() => setPreyCount((c) => Math.max(1, c - 1))}
                        aria-label="Decrease prey count"
                        className="min-w-[40px] min-h-[40px] flex items-center justify-center text-sm font-extrabold bg-surface-subtle hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer"
                      >
                        -
                      </button>
                      <span className="flex-1 text-center text-xs font-extrabold">{preyCount}</span>
                      <button
                        type="button"
                        onClick={() => setPreyCount((c) => Math.min(25, c + 1))}
                        aria-label="Increase prey count"
                        className="min-w-[40px] min-h-[40px] flex items-center justify-center text-sm font-extrabold bg-surface-subtle hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <label className="min-h-[40px] flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={leavePreyWarning}
                    onChange={(e) => setLeavePreyWarning(e.target.checked)}
                    className="rounded accent-rose-600 w-4 h-4 shrink-0"
                  />
                  <span>Uneaten live prey still inside enclosure (set removal reminder)</span>
                </label>

                <input
                  type="text"
                  value={feedNoteInput}
                  onChange={(e) => setFeedNoteInput(e.target.value)}
                  placeholder="Optional feeding note (e.g., tong-fed, struck mid-air!)..."
                  className={getFieldClass('emerald')}
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSubmitFeeding('eaten')}
                    className="sm:col-span-2 min-h-[44px] py-3 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Log Meal Eaten</span>
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSubmitFeeding('refused')}
                    className="min-h-[44px] py-3 px-3 rounded-xl border border-amber-500/35 bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-300 font-bold text-xs disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
                    title="Log prey refusal (common before molting)"
                  >
                    Refused Prey
                  </button>
                </div>
              </div>
            )}
          </div>

          <CareEntryList
            dateKey={todayKey}
            feedings={summary.todayLog.feedings || []}
            variant="card"
            title={`Today's Feedings (${(summary.todayLog.feedings || []).length})`}
            onRequestDelete={onRequestDelete}
            disabled={isPending}
          />
        </SectionCard>
      </div>

      {/* Full-Width Secondary Card: Behaviours & Daily Observations */}
      <SectionCard className="space-y-3.5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          <h3 className="text-sm font-extrabold">
            {settings.mantisName}&apos;s Behaviours &amp; Daily Observation
          </h3>
        </div>

        <BehaviorJournalEditor
          behaviors={summary.todayLog.behaviors || []}
          journalNote={journalDraft}
          onJournalChange={setJournalDraft}
          onToggleBehavior={(tag) => onToggleBehavior(tag, todayKey)}
          onSaveNote={handleSubmitJournal}
          placeholder={`Quick observation about ${settings.mantisName} today...`}
          isPending={isPending}
        />
      </SectionCard>

      {/* Mon-Sun Weekly Care History */}
      <WeeklyHistoryPanel
        ariaLabel="Weekly Care History"
        icon={History}
        iconClassName="text-emerald-700 dark:text-emerald-400"
        title="Weekly Care History"
        subtitle="Browse by week (Mon–Sun) to spot misting or feeding gaps"
        weekNav={weekNav}
        todayKey={todayKey}
        accent="emerald"
        jumpLabel="Jump to date:"
        summaryBadge={
          <div
            className={`inline-flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold w-fit max-w-full ${
              weekStats.gapDays > 0
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            <span>
              Misted {weekStats.mistedDays}/{weekNav.selectedWeekDays.length}d •{' '}
              {weekStats.mealsCount} meal{weekStats.mealsCount === 1 ? '' : 's'}
            </span>
            {weekStats.gapDays > 0 && (
              <span>
                • {weekStats.gapDays} gap day{weekStats.gapDays === 1 ? '' : 's'}
              </span>
            )}
          </div>
        }
      >
        <div className="space-y-2 text-xs">
          {weekNav.selectedWeekDays.map((dateKey) => {
            const rec = logsByDate?.[dateKey] || {};
            const dayMolts = moltsByDate.get(dateKey) || [];
            const mists = rec.mists || [];
            const feedings = rec.feedings || [];
            const climateChecks = rec.climateChecks || [];
            const behaviors = rec.behaviors || [];
            const hasActivity =
              mists.length > 0 ||
              feedings.length > 0 ||
              climateChecks.length > 0 ||
              behaviors.length > 0 ||
              Boolean(rec.abdomenStatus) ||
              Boolean(rec.journalNote) ||
              dayMolts.length > 0;
            const isGapDay = !hasActivity && dateKey < todayKey;
            const isNoMistDay = hasActivity && mists.length === 0 && dateKey < todayKey;
            const isToday = dateKey === todayKey;

            return (
              <div
                key={dateKey}
                className={`p-3 rounded-2xl border space-y-1.5 ${
                  isToday
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : isGapDay
                      ? 'border-dashed border-rose-300/80 dark:border-rose-900/60 bg-rose-500/5'
                      : 'bg-surface-subtle border-border-subtle'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 font-bold">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        mists.length > 0
                          ? 'bg-emerald-500'
                          : isNoMistDay
                            ? 'bg-amber-400'
                            : isGapDay
                              ? 'bg-rose-400'
                              : 'bg-text-muted/50'
                      }`}
                    />
                    <span>{formatFriendlyDate(dateKey, todayKey)}</span>
                    <span className="text-xs font-mono text-text-muted">{dateKey}</span>
                    {isToday && (
                      <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                        Active
                      </span>
                    )}
                    {isGapDay && (
                      <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300">
                        No care logged
                      </span>
                    )}
                    {isNoMistDay && (
                      <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300">
                        No mist logged
                      </span>
                    )}
                  </div>

                  {dateKey !== todayKey && (
                    <button
                      type="button"
                      onClick={() => onOpenBackfillModal(dateKey)}
                      className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer ${
                        !hasActivity
                          ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700'
                          : 'bg-surface-card border-border-strong text-text-primary hover:bg-surface-hover'
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{!hasActivity ? '+ Backfill' : 'Edit'}</span>
                    </button>
                  )}
                </div>

                {hasActivity && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {mists.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-semibold tabular-nums">
                        <Droplets className="w-3 h-3 shrink-0" />
                        <span>{mists.length} mist{mists.length > 1 ? 's' : ''}</span>
                      </span>
                    )}
                    {feedings.map((f) => (
                      <span
                        key={f.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold tabular-nums ${
                          f.outcome === 'refused'
                            ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                        }`}
                      >
                        {f.outcome === 'refused' ? (
                          <>
                            <XCircle className="w-3 h-3 shrink-0" />
                            <span>Refused prey</span>
                          </>
                        ) : (
                          <>
                            <Bug className="w-3 h-3 shrink-0" />
                            <span>{f.count}× {formatShortPreyLabel(f.preyLabel)}</span>
                          </>
                        )}
                      </span>
                    ))}
                    {rec.abdomenStatus && (
                      <span className="px-2 py-0.5 rounded-md bg-surface-muted text-text-secondary capitalize">
                        Abdomen: {rec.abdomenStatus}
                      </span>
                    )}
                    {climateChecks.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold tabular-nums"
                      >
                        <Thermometer className="w-3 h-3 shrink-0" />
                        <span>
                          {c.tempC != null ? `${c.tempC}°C` : '—'}
                          {c.humidityPct != null ? ` / ${c.humidityPct}%` : ''}
                        </span>
                      </span>
                    ))}
                    {dayMolts.map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-semibold"
                      >
                        <Sparkles className="w-3 h-3 shrink-0" />
                        <span>{m.fromInstar} → {m.toInstar}</span>
                      </span>
                    ))}
                    {behaviors.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md bg-surface-muted text-text-secondary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {rec.journalNote && (
                  <p className="text-xs text-text-secondary italic pt-0.5">
                    &ldquo;{rec.journalNote}&rdquo;
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </WeeklyHistoryPanel>
    </div>
  );
}
