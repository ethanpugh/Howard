import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Edit3,
  Trash2,
  Cat,
  Flower2,
  Heart,
  Stethoscope,
  Wallet,
  Clock,
  Layers,
  Repeat
} from 'lucide-react';
import {
  ModuleHeader,
  MonthCalendarLayout,
  SubSurface,
  ConfirmModal,
  EmptyStateCard
} from '../components/HowardUI.jsx';
import {
  VALID_DATE_KEY_RE,
  getLocalDateKey,
  shiftDateKey,
  buildMonthGrid,
  formatGBP,
  formatShortPreyLabel,
  doesLedgerItemOccurOnDate,
  computeBloomSummary,
  doesAlmanacEventOccurOnDate,
  isAlmanacEventVisibleToProfile
} from '../utils/householdHelpers.js';
import AlmanacEventModal, {
  EVENT_CATEGORIES,
  RECURRENCE_OPTIONS,
  formatAlmanacDateFriendly
} from './almanac/AlmanacEventModal.jsx';

function buildAlmanacDayData(
  dayNumber,
  dateStr,
  {
    almanacEvents,
    activeProfile,
    partner2Name,
    cadenceSnapshot,
    bloomSnapshot,
    moltsByDate,
    projectedNextMoltDateStr,
    floodgateSnapshot,
    getLedgerItemsForDate,
    bottleExpiryDateStr
  }
) {
  const dayEvents = (almanacEvents || []).filter(
    (e) =>
      doesAlmanacEventOccurOnDate(e, dateStr) &&
      isAlmanacEventVisibleToProfile(e, activeProfile, partner2Name)
  );
  const cadenceLog = cadenceSnapshot?.logsByDate?.[dateStr] || null;
  const bloomLog = bloomSnapshot?.logsByDate?.[dateStr] || null;
  const bloomMoltsOnDay = moltsByDate.get(dateStr) || [];
  const isProjectedMolt = projectedNextMoltDateStr === dateStr;
  const floodgateLog = activeProfile.allowedApps.includes('floodgate')
    ? floodgateSnapshot?.logsByDate?.[dateStr] || null
    : null;
  const ledgerDue = getLedgerItemsForDate(dateStr);
  const isBottleExpiry = bottleExpiryDateStr === dateStr;

  return {
    dayNumber,
    dateStr,
    dayEvents,
    cadenceLog,
    bloomLog,
    bloomMoltsOnDay,
    isProjectedMolt,
    floodgateLog,
    ledgerDue,
    isBottleExpiry
  };
}

function AlmanacApp({
  activeProfile,
  profiles,
  darkMode: _darkMode,
  nowMs,
  todayKey,
  almanacEvents,
  cadenceSnapshot,
  bloomSnapshot,
  bloomSummary: bloomSummaryProp,
  floodgateSnapshot,
  ledgerData,
  initialDate,
  onMutateEvents,
  onSaveEvents,
  onOpenFloodgate,
  onNavigateApp,
  showToast
}) {
  const nowObj = useMemo(() => (nowMs ? new Date(nowMs) : new Date()), [nowMs]);
  const todayStr = todayKey || getLocalDateKey(nowObj);
  const partner1Name = (profiles || []).find((p) => p.id === 'partner1')?.name || 'Partner 1';
  const partner2Name = (profiles || []).find((p) => p.id === 'partner2')?.name || 'Partner 2';
  const canViewFloodgate = Boolean(activeProfile.allowedApps.includes('floodgate'));

  const [selectedDate, setSelectedDate] = useState(initialDate || todayStr);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const seed = initialDate && VALID_DATE_KEY_RE.test(initialDate) ? initialDate : todayStr;
    const [sy, sm] = seed.split('-').map(Number);
    return { year: sy, month: sm - 1 };
  });

  useEffect(() => {
    if (initialDate && VALID_DATE_KEY_RE.test(initialDate)) {
      setSelectedDate(initialDate);
      const [y, m] = initialDate.split('-').map(Number);
      setCalendarMonth({ year: y, month: m - 1 });
    }
  }, [initialDate]);

  const [layers, setLayers] = useState(() => ({
    cadence: true,
    bloom: true,
    ledger: true,
    floodgate: activeProfile.id === 'partner2'
  }));

  useEffect(() => {
    setLayers((prev) => ({
      ...prev,
      floodgate: activeProfile.id === 'partner2'
    }));
  }, [activeProfile.id]);

  const [eventModalState, setEventModalState] = useState(null);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(null);

  const catName = cadenceSnapshot?.settings?.catName || 'Pet';
  const bloomSummary = useMemo(
    () => bloomSummaryProp || computeBloomSummary(bloomSnapshot, nowObj),
    [bloomSummaryProp, bloomSnapshot, nowObj]
  );
  const mantisName = bloomSummary.settings.mantisName || 'Mantis';

  const moltsByDate = useMemo(() => {
    const map = new Map();
    for (const m of bloomSummary.molts || []) {
      if (!m?.dateKey) continue;
      const existing = map.get(m.dateKey) || [];
      existing.push(m);
      map.set(m.dateKey, existing);
    }
    return map;
  }, [bloomSummary.molts]);

  const bottleExpiryDateStr = useMemo(() => {
    const opened = cadenceSnapshot?.settings?.bottleOpenedDate;
    const shelf = Number(cadenceSnapshot?.settings?.bottleShelfLifeDays) || 180;
    if (!opened || !VALID_DATE_KEY_RE.test(opened)) return null;
    return shiftDateKey(opened, shelf);
  }, [cadenceSnapshot?.settings]);

  const getLedgerItemsForDate = useMemo(() => {
    const activeRec = (ledgerData?.recurring || []).filter((r) => r.active !== false);
    const allIncomes = ledgerData?.incomes || [];
    return (dateStr) => {
      const items = [];
      activeRec.forEach((r) => {
        if (doesLedgerItemOccurOnDate(r, dateStr, false)) {
          items.push({
            id: r.id,
            title: r.title,
            amount: r.amount,
            kind: r.type === 'direct-debit' ? 'Direct Debit' : 'Subscription',
            owner: r.owner
          });
        }
      });
      allIncomes.forEach((inc) => {
        if (doesLedgerItemOccurOnDate(inc, dateStr, true)) {
          items.push({
            id: inc.id,
            title: inc.title,
            amount: inc.amount,
            kind: inc.frequency === 'one-off' ? 'One-Off Income' : 'Payday',
            owner: inc.owner
          });
        }
      });
      return items;
    };
  }, [ledgerData]);

  const dayDataContext = useMemo(
    () => ({
      almanacEvents,
      activeProfile,
      partner2Name,
      cadenceSnapshot,
      bloomSnapshot,
      moltsByDate,
      projectedNextMoltDateStr: bloomSummary.projectedNextMoltDateStr,
      floodgateSnapshot,
      getLedgerItemsForDate,
      bottleExpiryDateStr
    }),
    [
      almanacEvents,
      activeProfile,
      partner2Name,
      cadenceSnapshot,
      bloomSnapshot,
      moltsByDate,
      bloomSummary.projectedNextMoltDateStr,
      floodgateSnapshot,
      getLedgerItemsForDate,
      bottleExpiryDateStr
    ]
  );

  const calendarCells = useMemo(() => {
    return buildMonthGrid(calendarMonth.year, calendarMonth.month).map((cell) => {
      if (!cell) return null;
      return buildAlmanacDayData(cell.day, cell.dateStr, dayDataContext);
    });
  }, [calendarMonth.year, calendarMonth.month, dayDataContext]);

  const selectedCellData = useMemo(() => {
    const inViewCell = calendarCells.find((cell) => cell && cell.dateStr === selectedDate);
    if (inViewCell) return inViewCell;
    return buildAlmanacDayData(null, selectedDate, dayDataContext);
  }, [calendarCells, selectedDate, dayDataContext]);

  const handleSkipSingleOccurrence = useCallback(
    async (evtId, dateToSkip) => {
      let skippedTarget = null;
      const next = (almanacEvents || []).map((e) => {
        if (e.id !== evtId) return e;
        const existingSkipped = Array.isArray(e.skippedDates) ? e.skippedDates : [];
        skippedTarget = {
          ...e,
          skippedDates: Array.from(new Set([...existingSkipped, dateToSkip]))
        };
        return skippedTarget;
      });
      if (!skippedTarget) return;
      const msg = `Skipped occurrence on ${dateToSkip}`;
      if (onMutateEvents) {
        await onMutateEvents({ nextEvents: next, upserts: [skippedTarget] }, msg);
      } else {
        await onSaveEvents(next, msg);
      }
    },
    [almanacEvents, onMutateEvents, onSaveEvents]
  );

  const handleDeleteEvent = useCallback(
    async (id) => {
      const next = (almanacEvents || []).filter((e) => e.id !== id);
      const msg = 'Removed event from Almanac';
      if (onMutateEvents) {
        await onMutateEvents({ nextEvents: next, deleteIds: [id] }, msg);
      } else {
        await onSaveEvents(next, msg);
      }
    },
    [almanacEvents, onMutateEvents, onSaveEvents]
  );

  const shiftMonth = useCallback((delta) => {
    setCalendarMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const resetToToday = useCallback(() => {
    const [ty, tm] = todayStr.split('-').map(Number);
    setCalendarMonth({ year: ty, month: tm - 1 });
    setSelectedDate(todayStr);
  }, [todayStr]);

  const monthLabel = useMemo(
    () =>
      new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric'
      }),
    [calendarMonth.year, calendarMonth.month]
  );

  const toggleLayer = (key) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const layerToggles = [
    {
      key: 'cadence',
      label: 'Cadence',
      icon: Cat,
      activeClass: 'bg-purple-600 text-white border-purple-600',
      visible: true
    },
    {
      key: 'bloom',
      label: 'Bloom',
      icon: Flower2,
      activeClass: 'bg-emerald-700 text-white border-emerald-700',
      visible: true
    },
    {
      key: 'ledger',
      label: 'Ledger',
      icon: Wallet,
      activeClass: 'bg-amber-500 text-slate-950 border-amber-600',
      visible: true
    },
    {
      key: 'floodgate',
      label: 'Floodgate',
      icon: Heart,
      activeClass: 'bg-rose-600 text-white border-rose-600',
      visible: canViewFloodgate
    }
  ];

  const renderCalendarCell = (cell, idx) => {
    if (!cell) {
      return <div key={`empty-${idx}`} className="h-16 sm:h-24 rounded-2xl" />;
    }
    const {
      dayNumber,
      dateStr,
      dayEvents,
      cadenceLog,
      bloomLog,
      bloomMoltsOnDay,
      isProjectedMolt,
      floodgateLog,
      ledgerDue,
      isBottleExpiry
    } = cell;
    const isSelected = dateStr === selectedDate;
    const isToday = dateStr === todayStr;

    const amDone = cadenceLog?.morning?.given;
    const pmDone = cadenceLog?.evening?.given;
    const hasBloomActivity =
      (bloomLog?.mists?.length || 0) > 0 || (bloomLog?.feedings?.length || 0) > 0;
    const hasFloodgateBleed =
      floodgateLog?.bleedingSeverity && floodgateLog.bleedingSeverity !== 'none';

    const mobileDots = [];
    dayEvents.forEach((evt) => {
      mobileDots.push({
        key: `evt-${evt.id}`,
        colorClass: 'bg-indigo-600',
        label: evt.title
      });
    });
    if (layers.cadence && (amDone || pmDone || isBottleExpiry)) {
      mobileDots.push({ key: 'cadence', colorClass: 'bg-purple-600', label: catName });
    }
    if (layers.bloom && (hasBloomActivity || bloomMoltsOnDay.length > 0 || isProjectedMolt)) {
      mobileDots.push({ key: 'bloom', colorClass: 'bg-emerald-600', label: mantisName });
    }
    if (layers.ledger && ledgerDue.length > 0) {
      mobileDots.push({ key: 'ledger', colorClass: 'bg-amber-500', label: 'Ledger' });
    }
    if (layers.floodgate && (hasFloodgateBleed || floodgateLog?.hasClots)) {
      mobileDots.push({ key: 'floodgate', colorClass: 'bg-rose-500', label: 'Floodgate' });
    }

    return (
      <button
        key={dateStr}
        type="button"
        onClick={() => setSelectedDate(dateStr)}
        className={`min-h-[4.25rem] sm:h-24 p-1 sm:p-2 rounded-2xl border flex flex-col justify-between text-left transition relative cursor-pointer active:scale-[0.98] ${
          isSelected
            ? 'ring-2 ring-indigo-600 border-indigo-600 bg-indigo-500/10'
            : 'bg-surface-subtle/75 border-border-subtle hover:bg-surface-hover'
        }`}
      >
        <div className="flex items-center justify-between w-full">
          <span
            className={`text-[11px] sm:text-xs font-extrabold w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center ${
              isToday ? 'bg-indigo-600 text-white' : ''
            }`}
          >
            {dayNumber}
          </span>

          <div className="hidden sm:flex items-center gap-1">
            {layers.cadence && (amDone || pmDone) && (
              <span
                className={`w-2 h-2 rounded-full ${
                  amDone && pmDone ? 'bg-purple-600' : 'bg-amber-400'
                }`}
                title={`${catName}: ${amDone && pmDone ? 'AM & PM given' : '1 dose given'}`}
              />
            )}
            {layers.bloom && hasBloomActivity && (
              <span
                className="w-2 h-2 rounded-full bg-emerald-500"
                title={`${mantisName}: Care logged`}
              />
            )}
            {layers.floodgate && hasFloodgateBleed && (
              <span
                className="w-2 h-2 rounded-full bg-rose-500"
                title={`Floodgate: ${floodgateLog.bleedingSeverity}`}
              />
            )}
            {layers.floodgate && floodgateLog?.hasClots && (
              <span
                className="w-2 h-2 rounded-full bg-rose-700"
                title="Floodgate: Clots logged"
              />
            )}
            {layers.ledger && ledgerDue.length > 0 && (
              <span
                className="w-2 h-2 rounded-full bg-amber-500"
                title={`${ledgerDue.length} bill(s) / payday(s)`}
              />
            )}
          </div>
        </div>

        <div className="flex sm:hidden flex-wrap items-center gap-1 w-full pt-1">
          {mobileDots.slice(0, 4).map((dot) => (
            <span
              key={dot.key}
              className={`w-2 h-2 rounded-full shrink-0 ${dot.colorClass}`}
              title={dot.label}
            />
          ))}
          {mobileDots.length > 4 && (
            <span className="text-[11px] font-extrabold leading-none text-text-secondary">
              +{mobileDots.length - 4}
            </span>
          )}
        </div>

        <div className="hidden sm:block space-y-0.5 w-full overflow-hidden">
          {dayEvents.slice(0, 2).map((evt) => {
            const cat =
              EVENT_CATEGORIES.find((c) => c.id === evt.category) || EVENT_CATEGORIES[0];
            const isRec = evt.recurrence && evt.recurrence !== 'none';
            return (
              <div
                key={evt.id}
                className={`w-full text-[11px] font-bold px-1.5 py-0.5 rounded truncate ${cat.color}`}
              >
                {isRec ? '🔄 ' : ''}
                {evt.title}
              </div>
            );
          })}
          {dayEvents.length > 2 && (
            <div className="text-[11px] font-bold text-text-secondary pl-1">
              +{dayEvents.length - 2} more
            </div>
          )}
          {layers.cadence && isBottleExpiry && (
            <div className="w-full text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 truncate">
              🐾 Bottle Expiry
            </div>
          )}
          {layers.bloom &&
            bloomMoltsOnDay.map((m) => (
              <div
                key={m.id}
                className="w-full text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-700 text-white truncate"
              >
                🦋 {m.fromInstar}&rarr;{m.toInstar}
              </div>
            ))}
          {layers.bloom && isProjectedMolt && bloomMoltsOnDay.length === 0 && (
            <div className="w-full text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 truncate">
              🌿 Est. Molt
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      <ModuleHeader
        accent="indigo"
        icon={CalendarIcon}
        title="Almanac • Unified Household Calendar"
        subtitle={
          <>
            Household events cross-pollinated with {catName}&apos;s Cadence logs,{' '}
            {mantisName}&apos;s Bloom molts &amp; care, Ledger due dates
            {canViewFloodgate ? ', and Floodgate cycle logs' : ''}
          </>
        }
        actions={
          <button
            type="button"
            onClick={() => setEventModalState({ mode: 'add' })}
            className="bg-indigo-600 hover:bg-indigo-700 text-white min-h-[40px] px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs active:scale-[0.98] transition cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Add Event</span>
          </button>
        }
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1 mr-1">
              <Layers className="w-3.5 h-3.5" /> Layers:
            </span>
            {layerToggles
              .filter((t) => t.visible)
              .map((toggle) => {
                const LayerIcon = toggle.icon;
                const active = layers[toggle.key];
                return (
                  <button
                    key={toggle.key}
                    type="button"
                    onClick={() => toggleLayer(toggle.key)}
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer ${
                      active
                        ? toggle.activeClass
                        : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    <LayerIcon className="w-3.5 h-3.5" />
                    <span>{toggle.label}</span>
                  </button>
                );
              })}
          </div>
        }
      />

      <MonthCalendarLayout
        monthLabel={monthLabel}
        subtitle="Select any date to inspect events, adherence, or add a reminder"
        onPrevMonth={() => shiftMonth(-1)}
        onNextMonth={() => shiftMonth(1)}
        onResetCurrentMonth={resetToToday}
        showResetMonth
        resetLabel="Today"
        titleAccentClass="text-indigo-600 dark:text-indigo-400"
        legend={
          <SubSurface className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-3 py-2 rounded-xl text-xs text-text-secondary">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
              Almanac
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0" />
              Cadence
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" />
              Bloom
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              Ledger
            </span>
            {canViewFloodgate && (
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                Floodgate
              </span>
            )}
          </SubSurface>
        }
        cells={calendarCells}
        renderCell={renderCalendarCell}
        inspectorTitle="Selected Date"
        inspectorDateLabel={formatAlmanacDateFriendly(selectedDate)}
        inspectorAction={
          <button
            type="button"
            onClick={() => setEventModalState({ mode: 'add' })}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Event</span>
          </button>
        }
        inspectorChildren={
          <>
            <div className="space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Scheduled Events ({selectedCellData.dayEvents.length})
              </div>
              {selectedCellData.dayEvents.length > 0 ? (
                selectedCellData.dayEvents.map((evt) => {
                  const cat =
                    EVENT_CATEGORIES.find((c) => c.id === evt.category) || EVENT_CATEGORIES[0];
                  const isRec = evt.recurrence && evt.recurrence !== 'none';
                  const recMeta = RECURRENCE_OPTIONS.find((r) => r.id === evt.recurrence);
                  return (
                    <SubSurface key={evt.id} className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span
                              className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md ${cat.badge}`}
                            >
                              {cat.label} • {evt.assignedTo || 'Household'}
                            </span>
                            {isRec && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                                <Repeat className="w-3 h-3" />
                                {recMeta?.shortLabel || evt.recurrence}
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-sm break-words">{evt.title}</h4>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-1">
                          <button
                            type="button"
                            onClick={() => setEventModalState({ mode: 'edit', event: evt })}
                            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-text-muted hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer"
                            title="Edit event"
                            aria-label="Edit event"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteEvent(evt)}
                            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-text-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer"
                            title={isRec ? 'Delete entire recurring series' : 'Delete event'}
                            aria-label={isRec ? 'Delete entire recurring series' : 'Delete event'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {evt.time && (
                        <div className="text-xs text-text-secondary flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {evt.time}
                        </div>
                      )}
                      {evt.notes && (
                        <p className="text-xs text-text-secondary leading-relaxed break-words">
                          {evt.notes}
                        </p>
                      )}

                      {isRec && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border-subtle text-xs">
                          <button
                            type="button"
                            onClick={() => handleSkipSingleOccurrence(evt.id, selectedDate)}
                            className="min-h-[40px] -my-2 inline-flex items-center px-2 -mx-2 rounded-xl py-1 font-semibold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
                          >
                            Skip this date only
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteEvent(evt)}
                            className="min-h-[40px] -my-2 inline-flex items-center px-2 -mx-2 rounded-xl py-1 font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                          >
                            Delete series
                          </button>
                        </div>
                      )}

                      {evt.linkToGpReport && canViewFloodgate && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenFloodgate({ tab: 'insights', date: selectedDate })
                          }
                          className="w-full min-h-[40px] mt-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
                        >
                          <Stethoscope className="w-3.5 h-3.5" />
                          <span>Open Printable GP Symptom Report</span>
                        </button>
                      )}
                    </SubSurface>
                  );
                })
              ) : (
                <EmptyStateCard
                  accent="indigo"
                  icon={CalendarIcon}
                  title="No household events scheduled"
                  description="Tap Add Event to log an appointment, bin collection, or reminder for this date."
                  className="p-4 sm:p-5"
                />
              )}
            </div>

            {layers.cadence && (
              <SubSurface className="p-3.5 space-y-2.5 text-xs bg-purple-500/5 border-purple-500/20">
                <div className="flex items-center justify-between gap-2 font-bold text-purple-700 dark:text-purple-300">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Cat className="w-3.5 h-3.5 shrink-0" /> {catName}&apos;s Medication
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateApp('cadence')}
                    className="min-h-[40px] -my-2.5 inline-flex items-center px-2 -mr-2 rounded-xl underline text-xs font-semibold cursor-pointer shrink-0"
                  >
                    Open Cadence
                  </button>
                </div>
                {selectedCellData.isBottleExpiry && (
                  <div className="p-2 rounded-xl bg-amber-500 text-slate-950 font-bold">
                    🐾 Bottle Expiry Date — open a fresh bottle &amp; update the opened date in
                    Cadence
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-xl bg-surface-card border border-border-subtle">
                    <div className="font-bold">Morning</div>
                    <div className="text-xs text-text-secondary">
                      {selectedCellData.cadenceLog?.morning?.given
                        ? `✓ ${selectedCellData.cadenceLog.morning.givenBy}`
                        : 'Not logged'}
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-surface-card border border-border-subtle">
                    <div className="font-bold">Evening</div>
                    <div className="text-xs text-text-secondary">
                      {selectedCellData.cadenceLog?.evening?.given
                        ? `✓ ${selectedCellData.cadenceLog.evening.givenBy}`
                        : 'Not logged'}
                    </div>
                  </div>
                </div>
              </SubSurface>
            )}

            {layers.bloom && (
              <SubSurface className="p-3.5 space-y-2.5 text-xs bg-emerald-500/5 border-emerald-500/20">
                <div className="flex items-center justify-between gap-2 font-bold text-emerald-700 dark:text-emerald-300">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Flower2 className="w-3.5 h-3.5 shrink-0" /> {mantisName}&apos;s Habitat (Bloom)
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateApp('bloom')}
                    className="min-h-[40px] -my-2.5 inline-flex items-center px-2 -mr-2 rounded-xl underline text-xs font-semibold cursor-pointer shrink-0"
                  >
                    Open Bloom
                  </button>
                </div>

                {selectedCellData.bloomMoltsOnDay.length > 0 && (
                  <div className="p-2 rounded-xl bg-emerald-700 text-white font-bold">
                    🎉 Molted:{' '}
                    {selectedCellData.bloomMoltsOnDay
                      .map((m) => `${m.fromInstar} → ${m.toInstar}`)
                      .join(', ')}
                  </div>
                )}

                {selectedCellData.isProjectedMolt &&
                  selectedCellData.bloomMoltsOnDay.length === 0 && (
                    <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-semibold">
                      🌿 Projected next molt window (~{bloomSummary.avgInterMoltDays}d cycle)
                    </div>
                  )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-xl bg-surface-card border border-border-subtle">
                    <div className="font-bold">Misting</div>
                    <div className="text-xs text-text-secondary">
                      {(selectedCellData.bloomLog?.mists || []).length > 0
                        ? `✓ ${selectedCellData.bloomLog.mists.length} mist(s)`
                        : 'None logged'}
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-surface-card border border-border-subtle">
                    <div className="font-bold">Feeding</div>
                    <div className="text-xs text-text-secondary">
                      {(selectedCellData.bloomLog?.feedings || []).length > 0
                        ? selectedCellData.bloomLog.feedings
                            .map((f) =>
                              f.outcome === 'refused'
                                ? 'Refused'
                                : `${f.count}× ${formatShortPreyLabel(f.preyLabel)}`
                            )
                            .join(', ')
                        : 'None logged'}
                    </div>
                  </div>
                </div>
              </SubSurface>
            )}

            {layers.floodgate && canViewFloodgate && (
              <SubSurface className="p-3.5 space-y-2.5 text-xs bg-rose-500/5 border-rose-500/20">
                <div className="flex items-center justify-between gap-2 font-bold text-rose-700 dark:text-rose-300">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Heart className="w-3.5 h-3.5 shrink-0" /> Floodgate Cycle Log
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenFloodgate({ tab: 'log', date: selectedDate })}
                    className="min-h-[40px] -my-2.5 inline-flex items-center px-2 -mr-2 rounded-xl underline text-xs font-semibold cursor-pointer shrink-0"
                  >
                    {selectedCellData.floodgateLog ? 'Edit Day' : 'Log Day'}
                  </button>
                </div>
                {selectedCellData.floodgateLog ? (
                  <div className="space-y-1">
                    <div className="capitalize font-semibold">
                      Bleeding: {selectedCellData.floodgateLog.bleedingSeverity} • Pain:{' '}
                      {selectedCellData.floodgateLog.painScore}/10
                    </div>
                    {selectedCellData.floodgateLog.hasClots && (
                      <div className="text-purple-600 dark:text-purple-300 font-semibold">
                        Clots: {selectedCellData.floodgateLog.clotCount} passed
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-text-secondary">
                    No symptom entry logged for this date.
                  </div>
                )}
              </SubSurface>
            )}

            {layers.ledger && selectedCellData.ledgerDue.length > 0 && (
              <SubSurface className="p-3.5 space-y-2.5 text-xs bg-amber-500/5 border-amber-500/25">
                <div className="flex items-center justify-between gap-2 font-bold text-amber-800 dark:text-amber-300">
                  <span className="min-w-0">💷 Ledger Bills &amp; Paydays</span>
                  <button
                    type="button"
                    onClick={() => onNavigateApp('ledger')}
                    className="min-h-[40px] -my-2.5 inline-flex items-center px-2 -mr-2 rounded-xl underline text-xs font-semibold cursor-pointer shrink-0"
                  >
                    Open Ledger
                  </button>
                </div>
                <div className="space-y-1.5">
                  {selectedCellData.ledgerDue.map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-2 font-medium">
                      <span className="min-w-0 break-words">
                        • {it.title} ({it.kind})
                      </span>
                      <span className="font-bold shrink-0">{formatGBP(it.amount)}</span>
                    </div>
                  ))}
                </div>
              </SubSurface>
            )}
          </>
        }
      />

      {eventModalState && (
        <AlmanacEventModal
          mode={eventModalState.mode}
          editingEvent={eventModalState.event || null}
          selectedDate={selectedDate}
          activeProfile={activeProfile}
          profiles={profiles}
          partner1Name={partner1Name}
          partner2Name={partner2Name}
          almanacEvents={almanacEvents}
          onMutateEvents={onMutateEvents}
          onSaveEvents={onSaveEvents}
          onSaved={(targetDate) => {
            setSelectedDate(targetDate);
            if (VALID_DATE_KEY_RE.test(targetDate)) {
              const [ty, tm] = targetDate.split('-').map(Number);
              setCalendarMonth({ year: ty, month: tm - 1 });
            }
            setEventModalState(null);
          }}
          onClose={() => setEventModalState(null)}
          showToast={showToast}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(confirmDeleteEvent)}
        onClose={() => setConfirmDeleteEvent(null)}
        onConfirm={async () => {
          const targetId = confirmDeleteEvent?.id;
          setConfirmDeleteEvent(null);
          if (targetId) await handleDeleteEvent(targetId);
        }}
        title={
          confirmDeleteEvent?.recurrence && confirmDeleteEvent.recurrence !== 'none'
            ? 'Delete Entire Recurring Series?'
            : 'Delete Almanac Event?'
        }
        message={
          confirmDeleteEvent
            ? confirmDeleteEvent.recurrence && confirmDeleteEvent.recurrence !== 'none'
              ? `This will remove "${confirmDeleteEvent.title}" across all past and future dates. (Use "Skip this date only" to hide just ${selectedDate}.)`
              : `Remove "${confirmDeleteEvent.title}" from ${confirmDeleteEvent.date}?`
            : ''
        }
        icon={Trash2}
        confirmText="Delete"
        danger
        maxWidthClass="max-w-sm"
      />
    </main>
  );
}

export default React.memo(AlmanacApp);
