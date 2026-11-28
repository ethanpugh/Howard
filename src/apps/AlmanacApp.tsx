import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  Plus,
  Edit3,
  Trash2,
  Cat,
  Flower2,
  Heart,
  Sparkles,
  Sprout,
  Stethoscope,
  Wallet,
  Clock,
  Layers,
  Repeat,
  type LucideIcon
} from 'lucide-react';
import type { AppId } from '../../shared/schemas/common.ts';
import type { AlmanacEvent } from '../../shared/schemas/almanac.ts';
import type { BloomCareLog, BloomMoltRecord, BloomSnapshot } from '../../shared/schemas/bloom.ts';
import type { CadenceDayLog, CadenceSnapshot } from '../../shared/schemas/cadence.ts';
import type { FloodgateDayLog, FloodgateSnapshot } from '../../shared/schemas/floodgate.ts';
import type { LedgerData, LedgerOwner } from '../../shared/schemas/ledger.ts';
import type { PublicProfile } from '../../shared/schemas/profile.ts';
import type { ShowToastFn } from '../App.tsx';
import {
  Button,
  ModuleHeader,
  ModulePage,
  MonthCalendarLayout,
  OpenModulePill,
  SubSurface,
  ConfirmModal,
  EmptyStateCard
} from '../components/HowardUI.tsx';
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
  isAlmanacEventVisibleToProfile,
  type BloomSummary
} from '../utils/householdHelpers.ts';
import { useActionLock } from '../hooks/useActionLock.ts';
import AlmanacEventModal, {
  DEFAULT_EVENT_CATEGORY,
  EVENT_CATEGORIES,
  RECURRENCE_OPTIONS,
  formatAlmanacDateFriendly,
  pruneOrphanSkippedDates,
  type AlmanacMutatePayload
} from './almanac/AlmanacEventModal.tsx';

type AlmanacLayerKey = 'cadence' | 'bloom' | 'ledger' | 'floodgate';

interface LedgerDueItem {
  id: string;
  title: string;
  amount: number;
  kind: string;
  owner?: LedgerOwner | undefined;
}

interface AlmanacDayData {
  dayNumber: number | null;
  dateStr: string;
  dayEvents: AlmanacEvent[];
  cadenceLog: CadenceDayLog | null;
  bloomLog: BloomCareLog | null;
  bloomMoltsOnDay: BloomMoltRecord[];
  isProjectedMolt: boolean;
  floodgateLog: FloodgateDayLog | null;
  ledgerDue: LedgerDueItem[];
  isBottleExpiry: boolean;
}

interface AlmanacDayDataContext {
  almanacEvents: AlmanacEvent[];
  activeProfile: PublicProfile;
  partner2Name: string;
  cadenceSnapshot: CadenceSnapshot;
  bloomSnapshot: BloomSnapshot;
  moltsByDate: Map<string, BloomMoltRecord[]>;
  projectedNextMoltDateStr: string | null;
  floodgateSnapshot: FloodgateSnapshot;
  getLedgerItemsForDate: (dateStr: string) => LedgerDueItem[];
  bottleExpiryDateStr: string | null;
}

function buildAlmanacDayData(
  dayNumber: number | null,
  dateStr: string,
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
  }: AlmanacDayDataContext
): AlmanacDayData {
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

export interface AlmanacAppProps {
  activeProfile: PublicProfile;
  profiles: PublicProfile[];
  darkMode?: boolean | undefined;
  nowMs?: number | undefined;
  todayKey?: string | undefined;
  almanacEvents: AlmanacEvent[];
  cadenceSnapshot: CadenceSnapshot;
  bloomSnapshot: BloomSnapshot;
  bloomSummary?: BloomSummary | undefined;
  floodgateSnapshot: FloodgateSnapshot;
  ledgerData: LedgerData;
  initialDate?: string | null | undefined;
  onMutateEvents: (payload: AlmanacMutatePayload, toastText?: string) => Promise<boolean>;
  onOpenFloodgate: (intent?: { tab?: string; date?: string | null }) => void;
  onNavigateApp: (targetAppId: AppId) => void;
  showToast?: ShowToastFn | undefined;
}

type EventModalState =
  | { mode: 'add'; event?: undefined }
  | { mode: 'edit'; event: AlmanacEvent };

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
  onOpenFloodgate,
  onNavigateApp,
  showToast
}: AlmanacAppProps) {
  const nowObj = useMemo(() => (nowMs ? new Date(nowMs) : new Date()), [nowMs]);
  const todayStr = todayKey || getLocalDateKey(nowObj);
  const partner1Name = (profiles || []).find((p) => p.id === 'partner1')?.name || 'Partner 1';
  const partner2Name = (profiles || []).find((p) => p.id === 'partner2')?.name || 'Partner 2';
  const canViewFloodgate = Boolean(activeProfile.allowedApps.includes('floodgate'));

  const [selectedDate, setSelectedDate] = useState(initialDate || todayStr);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const seed = initialDate && VALID_DATE_KEY_RE.test(initialDate) ? initialDate : todayStr;
    const [sy = 1970, sm = 1] = seed.split('-').map(Number);
    return { year: sy, month: sm - 1 };
  });

  useEffect(() => {
    if (initialDate && VALID_DATE_KEY_RE.test(initialDate)) {
      setSelectedDate(initialDate);
      const [y = 1970, m = 1] = initialDate.split('-').map(Number);
      setCalendarMonth({ year: y, month: m - 1 });
    }
  }, [initialDate]);

  const [layers, setLayers] = useState<Record<AlmanacLayerKey, boolean>>(() => ({
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

  const [eventModalState, setEventModalState] = useState<EventModalState | null>(null);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<AlmanacEvent | null>(null);
  const { isPending: isMutating, runLocked } = useActionLock();

  const catName = cadenceSnapshot?.settings?.catName || 'Pet';
  const bloomSummary = useMemo(
    () => bloomSummaryProp || computeBloomSummary(bloomSnapshot, nowObj),
    [bloomSummaryProp, bloomSnapshot, nowObj]
  );
  const mantisName = bloomSummary.settings.mantisName || 'Mantis';

  const moltsByDate = useMemo(() => {
    const map = new Map<string, BloomMoltRecord[]>();
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
    return (dateStr: string): LedgerDueItem[] => {
      const items: LedgerDueItem[] = [];
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

  const dayDataContext = useMemo<AlmanacDayDataContext>(
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

  const calendarCells = useMemo<(AlmanacDayData | null)[]>(() => {
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
    async (evtId: string, dateToSkip: string) => {
      let skippedTarget: AlmanacEvent | null = null;
      const next = (almanacEvents || []).map((e) => {
        if (e.id !== evtId) return e;
        const existingSkipped = Array.isArray(e.skippedDates) ? e.skippedDates : [];
        skippedTarget = {
          ...e,
          skippedDates: pruneOrphanSkippedDates([...existingSkipped, dateToSkip], {
            date: e.date,
            recurrence: e.recurrence || 'none',
            untilDate: e.untilDate
          })
        };
        return skippedTarget;
      });
      if (!skippedTarget) {
        showToast?.('Event no longer exists — calendar refreshed', 'error');
        return;
      }
      const targetToSave = skippedTarget;
      const msg = `Skipped occurrence on ${dateToSkip}`;
      await runLocked(async () => {
        try {
          await onMutateEvents({ nextEvents: next, upserts: [targetToSave] }, msg);
        } catch (err) {
          showToast?.(
            err instanceof Error && err.message ? err.message : 'Could not skip occurrence',
            'error'
          );
        }
      });
    },
    [almanacEvents, onMutateEvents, runLocked, showToast]
  );

  const handleDeleteEvent = useCallback(
    async (id: string): Promise<boolean> => {
      const next = (almanacEvents || []).filter((e) => e.id !== id);
      const msg = 'Removed event from Almanac';
      const result = await runLocked(async () => {
        try {
          return await onMutateEvents({ nextEvents: next, deleteIds: [id] }, msg);
        } catch (err) {
          showToast?.(
            err instanceof Error && err.message ? err.message : 'Could not delete event',
            'error'
          );
          return false;
        }
      });
      return result !== false;
    },
    [almanacEvents, onMutateEvents, runLocked, showToast]
  );

  const shiftMonth = useCallback((delta: number) => {
    setCalendarMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const resetToToday = useCallback(() => {
    const [ty = 1970, tm = 1] = todayStr.split('-').map(Number);
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

  const toggleLayer = (key: AlmanacLayerKey) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const layerToggles: Array<{
    key: AlmanacLayerKey;
    label: string;
    icon: LucideIcon;
    activeClass: string;
    visible: boolean;
  }> = [
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
      activeClass: 'bg-orange-700 text-white border-orange-700',
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

  const renderCalendarCell = (cell: AlmanacDayData | null, idx: number) => {
    if (!cell) {
      return <div key={`empty-${idx}`} className="h-[3.1rem] sm:min-h-[4.5rem] xl:min-h-[5.5rem] rounded-xl sm:rounded-2xl" />;
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

    const mobileDots: Array<{ key: string; colorClass: string; label: string }> = [];
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
      mobileDots.push({ key: 'ledger', colorClass: 'bg-orange-600', label: 'Ledger' });
    }
    if (layers.floodgate && (hasFloodgateBleed || floodgateLog?.hasClots)) {
      mobileDots.push({ key: 'floodgate', colorClass: 'bg-rose-500', label: 'Floodgate' });
    }

    return (
      <button
        key={dateStr}
        type="button"
        aria-pressed={isSelected}
        aria-current={isToday ? 'date' : undefined}
        onClick={() => setSelectedDate(dateStr)}
        className={`min-h-[3.1rem] sm:min-h-[4.5rem] xl:min-h-[5.5rem] p-1 sm:p-2 rounded-xl sm:rounded-2xl border flex flex-col justify-between text-left transition relative cursor-pointer active:scale-[0.98] ${
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

          <div className="hidden sm:flex flex-wrap justify-end items-center gap-0.5 max-w-[34px] xl:max-w-[44px]">
            {layers.cadence && (amDone || pmDone) && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  amDone && pmDone ? 'bg-purple-600' : 'bg-amber-400'
                }`}
                title={`${catName}: ${amDone && pmDone ? 'AM & PM given' : '1 dose given'}`}
              />
            )}
            {layers.bloom && hasBloomActivity && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                title={`${mantisName}: Care logged`}
              />
            )}
            {layers.floodgate && floodgateLog && hasFloodgateBleed && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-rose-500"
                title={`Floodgate: ${floodgateLog.bleedingSeverity}`}
              />
            )}
            {layers.floodgate && floodgateLog?.hasClots && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-rose-700"
                title="Floodgate: Clots logged"
              />
            )}
            {layers.ledger && ledgerDue.length > 0 && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-orange-600"
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
              EVENT_CATEGORIES.find((c) => c.id === evt.category) ?? DEFAULT_EVENT_CATEGORY;
            const isRec = evt.recurrence && evt.recurrence !== 'none';
            return (
              <div
                key={evt.id}
                className={`w-full text-[11px] font-bold px-1.5 py-0.5 rounded truncate flex items-center gap-1 ${cat.color}`}
              >
                {isRec && <Repeat className="w-2.5 h-2.5 shrink-0" />}
                <span className="truncate">{evt.title}</span>
              </div>
            );
          })}
          {dayEvents.length > 2 && (
            <div className="text-[11px] font-bold text-text-secondary pl-1">
              +{dayEvents.length - 2} more
            </div>
          )}
          {layers.cadence && isBottleExpiry && (
            <div className="w-full text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 truncate flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">Bottle Expiry</span>
            </div>
          )}
          {layers.bloom &&
            bloomMoltsOnDay.map((m) => (
              <div
                key={m.id}
                className="w-full text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-700 text-white truncate flex items-center gap-1"
              >
                <Sparkles className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{m.fromInstar}&rarr;{m.toInstar}</span>
              </div>
            ))}
          {layers.bloom && isProjectedMolt && bloomMoltsOnDay.length === 0 && (
            <div className="w-full text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 truncate flex items-center gap-1">
              <Sprout className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">Est. Molt</span>
            </div>
          )}
        </div>
      </button>
    );
  };

  const selectedBloomMists = selectedCellData.bloomLog?.mists || [];
  const selectedBloomFeedings = selectedCellData.bloomLog?.feedings || [];

  return (
    <ModulePage module="almanac">
      <ModuleHeader
        accent="indigo"
        icon={CalendarIcon}
        shortTitle="Almanac"
        title="Almanac • Unified Household Calendar"
        subtitle={
          <>
            Household events cross-pollinated with {catName}&apos;s Cadence logs,{' '}
            {mantisName}&apos;s Bloom molts &amp; care, Ledger due dates
            {canViewFloodgate ? ', and Floodgate cycle logs' : ''}
          </>
        }
        compactActions
        actions={
          <Button
            variant="primary"
            accent="indigo"
            size="md"
            icon={Plus}
            onClick={() => setEventModalState({ mode: 'add' })}
          >
            <span>Add Event</span>
          </Button>
        }
        footer={
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1 mr-1 shrink-0">
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
                    aria-pressed={active}
                    onClick={() => toggleLayer(toggle.key)}
                    className={`min-h-[36px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-[0.98] transition cursor-pointer ${
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
              <span className="w-2.5 h-2.5 rounded-full bg-orange-600 shrink-0" />
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
                    EVENT_CATEGORIES.find((c) => c.id === evt.category) ?? DEFAULT_EVENT_CATEGORY;
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
                            disabled={isMutating}
                            onClick={() => setConfirmDeleteEvent(evt)}
                            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-text-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
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
                            disabled={isMutating}
                            onClick={() => handleSkipSingleOccurrence(evt.id, selectedDate)}
                            className="min-h-[40px] -my-2 inline-flex items-center px-2 -mx-2 rounded-xl py-1 font-semibold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer disabled:opacity-50"
                          >
                            Skip this date only
                          </button>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => setConfirmDeleteEvent(evt)}
                            className="min-h-[40px] -my-2 inline-flex items-center px-2 -mx-2 rounded-xl py-1 font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer disabled:opacity-50"
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
                  compact
                  accent="indigo"
                  icon={CalendarIcon}
                  title="No household events scheduled"
                  description="Tap Add Event to log a reminder for this date."
                />
              )}
            </div>

            {layers.cadence && (
              <SubSurface className="p-3.5 space-y-2.5 text-xs bg-purple-500/5 border-purple-500/20">
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-purple-700 dark:text-purple-300">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Cat className="w-3.5 h-3.5 shrink-0" /> {catName}&apos;s Medication
                  </span>
                  <OpenModulePill
                    accent="purple"
                    onClick={() => onNavigateApp('cadence')}
                    label="Open"
                    ariaLabel="Open Cadence"
                    title="Open Cadence"
                  />
                </div>
                {selectedCellData.isBottleExpiry && (
                  <div className="p-2 rounded-xl bg-amber-500 text-slate-950 font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Bottle Expiry Date — open a fresh bottle &amp; update the opened date in
                      Cadence
                    </span>
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
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-emerald-700 dark:text-emerald-300">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Flower2 className="w-3.5 h-3.5 shrink-0" /> {mantisName}&apos;s Habitat (Bloom)
                  </span>
                  <OpenModulePill
                    accent="emerald"
                    onClick={() => onNavigateApp('bloom')}
                    label="Open"
                    ariaLabel="Open Bloom"
                    title="Open Bloom"
                  />
                </div>

                {selectedCellData.bloomMoltsOnDay.length > 0 && (
                  <div className="p-2 rounded-xl bg-emerald-700 text-white font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Molted:{' '}
                      {selectedCellData.bloomMoltsOnDay
                        .map((m) => `${m.fromInstar} → ${m.toInstar}`)
                        .join(', ')}
                    </span>
                  </div>
                )}

                {selectedCellData.isProjectedMolt &&
                  selectedCellData.bloomMoltsOnDay.length === 0 && (
                    <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5">
                      <Sprout className="w-3.5 h-3.5 shrink-0" />
                      <span>Projected next molt window (~{bloomSummary.avgInterMoltDays}d cycle)</span>
                    </div>
                  )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-xl bg-surface-card border border-border-subtle">
                    <div className="font-bold">Misting</div>
                    <div className="text-xs text-text-secondary">
                      {selectedBloomMists.length > 0
                        ? `✓ ${selectedBloomMists.length} mist(s)`
                        : 'None logged'}
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-surface-card border border-border-subtle">
                    <div className="font-bold">Feeding</div>
                    <div className="text-xs text-text-secondary">
                      {selectedBloomFeedings.length > 0
                        ? selectedBloomFeedings
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
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-rose-700 dark:text-rose-300">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Heart className="w-3.5 h-3.5 shrink-0" /> Floodgate Cycle Log
                  </span>
                  <OpenModulePill
                    accent="rose"
                    onClick={() => onOpenFloodgate({ tab: 'log', date: selectedDate })}
                    label={selectedCellData.floodgateLog ? 'Edit' : 'Log'}
                    ariaLabel="Open Floodgate"
                    title="Open Floodgate"
                  />
                </div>
                {selectedCellData.floodgateLog ? (
                  <div className="space-y-1">
                    <div className="capitalize font-semibold">
                      Bleeding: {selectedCellData.floodgateLog.bleedingSeverity} • Pain:{' '}
                      {selectedCellData.floodgateLog.painScore}/10
                    </div>
                    {selectedCellData.floodgateLog.hasClots && (
                      <div className="text-rose-700 dark:text-rose-300 font-semibold">
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
              <SubSurface className="p-3.5 space-y-2.5 text-xs bg-orange-500/5 border-orange-500/25">
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-orange-800 dark:text-orange-300">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Wallet className="w-3.5 h-3.5 shrink-0" /> Ledger Bills &amp; Paydays
                  </span>
                  <OpenModulePill
                    accent="orange"
                    onClick={() => onNavigateApp('ledger')}
                    label="Open"
                    ariaLabel="Open Ledger"
                    title="Open Ledger"
                  />
                </div>
                <div className="space-y-1.5">
                  {selectedCellData.ledgerDue.map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-2 font-medium">
                      <span className="min-w-0 break-words">
                        • {it.title} ({it.kind})
                      </span>
                      <span className="font-bold shrink-0 tabular-nums">{formatGBP(it.amount)}</span>
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
          onSaved={(targetDate) => {
            setSelectedDate(targetDate);
            if (VALID_DATE_KEY_RE.test(targetDate)) {
              const [ty = 1970, tm = 1] = targetDate.split('-').map(Number);
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
        onClose={() => {
          if (!isMutating) setConfirmDeleteEvent(null);
        }}
        onConfirm={async () => {
          const targetId = confirmDeleteEvent?.id;
          if (!targetId) {
            setConfirmDeleteEvent(null);
            return;
          }
          const ok = await handleDeleteEvent(targetId);
          if (ok) setConfirmDeleteEvent(null);
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
        confirmText={isMutating ? 'Deleting...' : 'Delete'}
        isPending={isMutating}
        danger
        maxWidthClass="max-w-sm"
      />
    </ModulePage>
  );
}

export default React.memo(AlmanacApp);
