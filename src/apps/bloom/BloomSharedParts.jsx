import React from 'react';
import { Bug, Calendar, Droplets, Thermometer, Trash2, XCircle } from 'lucide-react';
import { EmptyStateCard, getFieldClass } from '../../components/HowardUI.jsx';
import { formatShortPreyLabel, formatTimeDisplay } from '../../utils/householdHelpers.js';
import { ABDOMEN_LEVELS, BEHAVIOR_TAGS } from './bloomConstants.js';

/**
 * Shared accessible delete icon button for Bloom care, molt, and feeder rows.
 */
export function DeleteIconButton({ onClick, title, ariaLabel, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-text-muted hover:text-rose-500 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
      title={title}
      aria-label={ariaLabel || title}
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

/**
 * Reusable list of logged mists, feedings, and climate checks for Today cards and Backfill modal.
 */
export function CareEntryList({
  dateKey,
  mists = [],
  feedings = [],
  climateChecks = [],
  variant = 'card',
  title = '',
  onRequestDelete,
  disabled = false
}) {
  const isBackfill = variant === 'backfill';
  const totalCount = mists.length + feedings.length + climateChecks.length;

  if (!isBackfill && totalCount === 0) {
    return null;
  }

  if (isBackfill && totalCount === 0) {
    return (
      <EmptyStateCard
        accent="emerald"
        icon={Calendar}
        title={`No entries logged for ${dateKey}`}
        description="Use the forms below to backfill misting, feeding, or climate checks."
        className="p-4 sm:p-5"
      />
    );
  }

  const cardRowClass =
    'flex flex-wrap items-center justify-between gap-2 text-xs py-1.5 px-3 rounded-xl bg-surface-subtle';

  const mistRows = mists.map((m) => (
    <div
      key={m.id}
      className={
        isBackfill
          ? 'flex flex-wrap items-center justify-between gap-2 py-1.5 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20'
          : cardRowClass
      }
    >
      <span className="min-w-0 flex-1 break-words inline-flex items-center gap-1.5 flex-wrap">
        {isBackfill && <Droplets className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />}
        <strong>{formatTimeDisplay(m.timestamp)}</strong> • {m.by}
        {m.dropletDrinkObserved ? ' • Drank droplets' : ''}
        {m.note ? ` — "${m.note}"` : ''}
      </span>
      <DeleteIconButton
        disabled={disabled}
        title={isBackfill ? 'Delete mist entry' : 'Undo mist log'}
        ariaLabel={isBackfill ? 'Delete mist entry' : 'Undo mist log'}
        onClick={() =>
          onRequestDelete({
            kind: 'mist',
            id: m.id,
            dateKey,
            label: isBackfill
              ? `mist on ${dateKey} at ${formatTimeDisplay(m.timestamp)}`
              : `mist at ${formatTimeDisplay(m.timestamp)} (${m.by})`
          })
        }
      />
    </div>
  ));

  const feedingRows = feedings.map((f) => {
    const shortPrey = formatShortPreyLabel(f.preyLabel);
    const timeStr = formatTimeDisplay(f.timestamp);
    return (
      <div
        key={f.id}
        className={
          isBackfill
            ? 'flex flex-wrap items-center justify-between gap-2 py-1.5 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20'
            : cardRowClass
        }
      >
        <span className="min-w-0 flex-1 break-words inline-flex items-center gap-1.5 flex-wrap">
          {isBackfill ? (
            <>
              {f.outcome === 'refused' ? (
                <>
                  <XCircle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300 shrink-0" />
                  <span>Refused prey • {f.by}</span>
                </>
              ) : (
                <>
                  <Bug className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>{f.count}× {shortPrey} • {f.by}</span>
                </>
              )}
              {f.abdomenAfter ? ` • Abdomen: ${f.abdomenAfter}` : ''}
              {f.note ? ` — "${f.note}"` : ''}
            </>
          ) : (
            <>
              <strong>{timeStr}</strong> •{' '}
              {f.outcome === 'refused' ? (
                <span className="text-amber-700 dark:text-amber-300 font-bold">
                  Refused {shortPrey}
                </span>
              ) : (
                <span>
                  Ate <strong>{f.count}×</strong> {shortPrey}
                </span>
              )}{' '}
              ({f.by})
            </>
          )}
        </span>
        <DeleteIconButton
          disabled={disabled}
          title={isBackfill ? 'Delete feeding entry' : 'Remove feeding log'}
          ariaLabel={isBackfill ? 'Delete feeding entry' : 'Remove feeding log'}
          onClick={() =>
            onRequestDelete({
              kind: 'feeding',
              id: f.id,
              dateKey,
              label:
                f.outcome === 'refused'
                  ? `refused ${shortPrey} ${isBackfill ? `on ${dateKey}` : `at ${timeStr}`}`
                  : `${f.count}× ${shortPrey} ${isBackfill ? `on ${dateKey}` : `at ${timeStr}`}`
            })
          }
        />
      </div>
    );
  });

  const climateRows = climateChecks.map((c) => {
    const timeStr = formatTimeDisplay(c.timestamp);
    return (
      <div
        key={c.id}
        className={
          isBackfill
            ? 'flex flex-wrap items-center justify-between gap-2 py-1.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/20'
            : cardRowClass
        }
      >
        <span className="min-w-0 flex-1 break-words inline-flex items-center gap-1.5 flex-wrap">
          {isBackfill && <Thermometer className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />}
          <strong>{timeStr}</strong> • {c.tempC != null ? `${c.tempC}°C` : '—'}
          {c.humidityPct != null ? ` • ${c.humidityPct}% RH` : ''}
          {c.by ? ` • ${c.by}` : ''}
        </span>
        <DeleteIconButton
          disabled={disabled}
          title={isBackfill ? 'Delete climate entry' : 'Undo climate check'}
          ariaLabel={isBackfill ? 'Delete climate entry' : 'Undo climate check'}
          onClick={() =>
            onRequestDelete({
              kind: 'climate',
              id: c.id,
              dateKey,
              label: isBackfill
                ? `climate check on ${dateKey} at ${timeStr}`
                : `climate check at ${timeStr}`
            })
          }
        />
      </div>
    );
  });

  if (isBackfill) {
    return (
      <div className="space-y-1.5">
        {mistRows}
        {feedingRows}
        {climateRows}
      </div>
    );
  }

  return (
    <div className="pt-3 border-t border-border-subtle space-y-1.5">
      {title && <div className="text-xs font-bold uppercase text-text-muted">{title}</div>}
      {mistRows}
      {feedingRows}
      {climateRows}
    </div>
  );
}

/**
 * Shared 4-level abdomen plumpness selector with optional save-only trigger.
 */
export function AbdomenPicker({
  value,
  onChange,
  latestAbdomen = null,
  compact = false,
  showHints = true,
  label = '',
  headerIcon: HeaderIcon = null,
  onSaveOnly = null,
  saveLabel = 'Save Check Only',
  disabled = false
}) {
  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-1.5'}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span
          className={
            HeaderIcon
              ? 'font-extrabold flex items-center gap-1.5 min-w-0 break-words'
              : 'font-bold text-text-secondary min-w-0'
          }
        >
          {HeaderIcon && (
            <HeaderIcon className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
          )}
          <span>{label}</span>
        </span>
        {onSaveOnly && (
          <button
            type="button"
            disabled={disabled || !value}
            onClick={onSaveOnly}
            className="min-h-[40px] px-2.5 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 hover:underline active:scale-[0.98] transition cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveLabel}
          </button>
        )}
      </div>

      <div className={compact ? 'grid grid-cols-2 sm:grid-cols-4 gap-1.5' : 'grid grid-cols-2 gap-2'}>
        {ABDOMEN_LEVELS.map((lvl) => {
          const isSel = value === lvl.id;
          return (
            <button
              key={lvl.id}
              type="button"
              onClick={() => onChange(lvl.id)}
              className={`${
                compact ? 'min-h-[40px] p-2' : 'min-h-[44px] p-2.5'
              } rounded-xl border text-left active:scale-[0.98] transition cursor-pointer overflow-hidden ${
                isSel ? lvl.activeClass : lvl.pillClass
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-xs font-extrabold">{lvl.label}</span>
                {!compact && latestAbdomen === lvl.id && (
                  <span
                    className={`text-[11px] font-extrabold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                      isSel
                        ? lvl.id === 'flat'
                          ? 'bg-slate-950/15'
                          : 'bg-white/25'
                        : 'bg-surface-muted text-text-primary'
                    }`}
                  >
                    Current
                  </span>
                )}
              </div>
              {showHints && <div className="text-xs mt-0.5 leading-snug">{lvl.hint}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Shared enclosure temperature (°C) and humidity (% RH) input form.
 */
export function ClimateFields({
  tempValue,
  onTempChange,
  humidityValue,
  onHumidityChange,
  onSubmit,
  submitLabel = 'Log Check',
  compact = false,
  isPending = false
}) {
  return (
    <form
      onSubmit={onSubmit}
      className={compact ? 'grid grid-cols-2 sm:grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}
    >
      <input
        type="number"
        step="0.1"
        min="0"
        max="60"
        value={tempValue}
        onChange={(e) => onTempChange(e.target.value)}
        placeholder="Temp °C"
        className={getFieldClass('emerald', 'min-w-0')}
      />
      <input
        type="number"
        step="1"
        min="0"
        max="100"
        value={humidityValue}
        onChange={(e) => onHumidityChange(e.target.value)}
        placeholder="RH %"
        className={getFieldClass('emerald', 'min-w-0')}
      />
      <button
        type="submit"
        disabled={isPending}
        className={
          compact
            ? 'col-span-2 sm:col-span-1 min-h-[40px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer'
            : 'col-span-2 min-h-[40px] px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer'
        }
      >
        {submitLabel}
      </button>
    </form>
  );
}

/**
 * Shared behaviour tag toggles and daily observation note editor.
 */
export function BehaviorJournalEditor({
  behaviors = [],
  journalNote,
  onJournalChange,
  onToggleBehavior,
  onSaveNote,
  placeholder,
  isPending = false
}) {
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {BEHAVIOR_TAGS.map((tag) => {
          const active = behaviors.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              disabled={isPending}
              onClick={() => onToggleBehavior(tag)}
              className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border active:scale-[0.98] transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                active
                  ? 'bg-emerald-700 text-white border-emerald-800'
                  : 'bg-surface-subtle border-border-subtle text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>

      <form onSubmit={onSaveNote} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={journalNote}
          onChange={(e) => onJournalChange(e.target.value)}
          placeholder={placeholder}
          className={getFieldClass('emerald', 'flex-1 min-w-0')}
        />
        <button
          type="submit"
          disabled={isPending}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold active:scale-[0.98] transition cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Save Note
        </button>
      </form>
    </>
  );
}
