import React, { useMemo } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import {
  MonthCalendarLayout,
  SubSurface,
  EmptyStateCard
} from '../../components/HowardUI.jsx';
import {
  buildMonthGrid,
  formatDateFriendlyEnGB,
  formatShortDateEnGB
} from '../../utils/householdHelpers.js';
import {
  BLEEDING_LEVELS,
  CLOT_SIZE_LABELS,
  getPainBadgeStyle
} from './floodgateConstants.js';

export default function CycleCalendarTab({
  calendarMonth,
  setCalendarMonth,
  selectedDate,
  todayKey,
  ownerName,
  logsMap,
  onSelectDate,
  onResetToToday,
  onOpenLogTab,
  onOpenInsightsTab
}) {
  const calendarGrid = useMemo(() => {
    return buildMonthGrid(calendarMonth.year, calendarMonth.month).map((cell) => {
      if (!cell) return null;
      return {
        dayNumber: cell.day,
        dateStr: cell.dateStr,
        log: logsMap[cell.dateStr] || null
      };
    });
  }, [calendarMonth.year, calendarMonth.month, logsMap]);

  const monthLabel = useMemo(
    () =>
      new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric'
      }),
    [calendarMonth.year, calendarMonth.month]
  );

  const shiftMonth = (delta) => {
    setCalendarMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const selectedLog = logsMap[selectedDate];

  const renderCell = (cell, idx) => {
    if (!cell) {
      return (
        <div
          key={`empty-${idx}`}
          className="min-h-[4.25rem] sm:h-24 rounded-xl sm:rounded-2xl bg-transparent"
        />
      );
    }
    const { dayNumber, dateStr, log } = cell;
    const isSelected = dateStr === selectedDate;
    const isToday = dateStr === todayKey;
    const hasBleeding = log?.bleedingSeverity && log.bleedingSeverity !== 'none';
    const bleedObj = BLEEDING_LEVELS.find((b) => b.id === log?.bleedingSeverity);

    return (
      <button
        key={dateStr}
        type="button"
        onClick={() => onSelectDate(dateStr)}
        className={`min-h-[4.25rem] sm:h-24 p-1 sm:p-2 rounded-xl sm:rounded-2xl border flex flex-col justify-between text-left transition-all relative active:scale-[0.98] cursor-pointer ${
          isSelected
            ? 'ring-2 ring-rose-600 border-rose-600 bg-rose-500/10'
            : 'bg-surface-subtle/75 border-border-subtle hover:bg-surface-hover'
        }`}
      >
        <div className="flex items-center justify-between w-full gap-0.5">
          <span
            className={`w-5 h-5 sm:w-6 sm:h-6 text-[11px] sm:text-xs font-bold rounded-full flex items-center justify-center shrink-0 ${
              isToday ? 'bg-rose-600 text-white' : ''
            }`}
          >
            {dayNumber}
          </span>
          {log?.painScore > 0 && (
            <span
              className={`hidden sm:inline text-[11px] px-1.5 py-0.5 rounded-md font-bold ${getPainBadgeStyle(log.painScore)}`}
            >
              {log.painScore}
            </span>
          )}
        </div>

        <div className="space-y-1 w-full">
          {hasBleeding && (
            <div
              className={`hidden sm:block w-full text-[11px] font-semibold px-1.5 py-0.5 rounded-md truncate ${
                bleedObj?.pillClass || 'bg-rose-600 text-white border border-rose-600'
              }`}
            >
              {bleedObj?.label}
            </div>
          )}
          <div className="flex items-center gap-0.5 sm:gap-1 flex-wrap">
            {hasBleeding && (
              <span
                className={`sm:hidden w-2 h-2 rounded-full ${bleedObj?.dotColor || 'bg-rose-500'}`}
                title={`Flow: ${bleedObj?.label || log.bleedingSeverity}`}
              />
            )}
            {Number(log?.painScore) >= 6 && (
              <span
                className="sm:hidden w-2 h-2 rounded-full bg-amber-500"
                title={`Pain: ${log.painScore}/10`}
              />
            )}
            {log?.hasClots && (
              <span
                className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-purple-600"
                title={`Clots: ${log.clotCount}`}
              />
            )}
            {(log?.bowelSeverity === 'moderate' || log?.bowelSeverity === 'severe') && (
              <span
                className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-orange-500"
                title={`Bowel: ${log.bowelSeverity}`}
              />
            )}
            {log?.medications?.length > 0 && (
              <span
                className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-600"
                title="Medication taken"
              />
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <MonthCalendarLayout
      monthLabel={monthLabel}
      subtitle={`Tap any date to inspect or edit ${ownerName}'s daily log`}
      onPrevMonth={() => shiftMonth(-1)}
      onNextMonth={() => shiftMonth(1)}
      onResetCurrentMonth={onResetToToday}
      showResetMonth
      resetLabel="Current Month"
      titleAccentClass="text-rose-600 dark:text-rose-400"
      legend={
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" /> Period / Bleeding
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-purple-600 inline-block" /> Blood Clots
          </span>
          <span className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded-md font-bold text-[11px] bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
              6+
            </span>{' '}
            High Pain (≥6)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-orange-600 inline-block" /> Bowel Flare
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block" /> Meds Taken
          </span>
        </div>
      }
      cells={calendarGrid}
      renderCell={renderCell}
      inspectorTitle="Selected Date"
      inspectorDateLabel={formatDateFriendlyEnGB(selectedDate, todayKey)}
      inspectorAction={
        <button
          type="button"
          onClick={onOpenLogTab}
          className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] transition cursor-pointer"
        >
          Edit Day Log
        </button>
      }
      inspectorChildren={
        <>
          {selectedLog ? (
            <div className="space-y-4 text-sm">
              <SubSurface className="p-3.5 bg-rose-500/5 border-rose-500/20">
                <div className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
                  Bleeding &amp; Clots
                </div>
                <div className="font-semibold capitalize">
                  Flow: {selectedLog.bleedingSeverity}
                  {selectedLog.leakedThrough && ' (Flooded/Leaked)'}
                </div>
                {selectedLog.hasClots ? (
                  <div className="mt-2 pt-2 border-t border-border-subtle text-purple-700 dark:text-purple-300 font-semibold text-xs">
                    Clots: {selectedLog.clotCount} passed (
                    {(selectedLog.clotSizes || []).length > 0
                      ? selectedLog.clotSizes
                          .map((id) => CLOT_SIZE_LABELS[id] || id)
                          .join(', ')
                      : 'size not specified'}
                    )
                  </div>
                ) : (
                  <div className="text-xs text-text-muted mt-1">No blood clots logged</div>
                )}
              </SubSurface>

              <SubSurface className="p-3.5 bg-amber-500/5 border-amber-500/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                    Pain Level
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold ${getPainBadgeStyle(selectedLog.painScore)}`}
                  >
                    {selectedLog.painScore} / 10
                  </span>
                </div>
                {(selectedLog.painLocations || []).length > 0 && (
                  <div className="text-xs mt-1">
                    <span className="font-semibold">Locations:</span>{' '}
                    {selectedLog.painLocations.join(', ')}
                  </div>
                )}
              </SubSurface>

              <SubSurface className="p-3.5 bg-orange-500/5 border-orange-500/20">
                <div className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
                  Bowel &amp; GI ({selectedLog.bowelSeverity})
                </div>
                {(selectedLog.bowelSymptoms || []).length > 0 ? (
                  <div className="text-xs">{selectedLog.bowelSymptoms.join(', ')}</div>
                ) : (
                  <div className="text-xs text-text-muted">No specific GI symptoms tagged</div>
                )}
              </SubSurface>
            </div>
          ) : (
            <EmptyStateCard
              accent="rose"
              icon={CalendarIcon}
              title="No symptoms logged for this date yet"
              description={`Record flow, pain, bowel symptoms, or medications for ${formatShortDateEnGB(selectedDate)}.`}
              action={
                <button
                  type="button"
                  onClick={onOpenLogTab}
                  className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 active:scale-[0.98] transition cursor-pointer"
                >
                  + Log Symptoms for {formatShortDateEnGB(selectedDate)}
                </button>
              }
            />
          )}

          <div className="pt-4 mt-4 border-t border-border-subtle text-xs text-text-muted flex items-center justify-between gap-2">
            <span>Total days tracked: {Object.keys(logsMap).length}</span>
            <button
              type="button"
              onClick={onOpenInsightsTab}
              className="min-h-[40px] inline-flex items-center px-2 rounded-xl text-rose-600 dark:text-rose-400 font-semibold hover:underline active:scale-[0.98] transition cursor-pointer"
            >
              View GP Report &rarr;
            </button>
          </div>
        </>
      }
    />
  );
}
