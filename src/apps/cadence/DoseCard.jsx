import React, { useState } from 'react';
import { Check, CheckCircle2, Edit3, Moon, Sun, Trash2 } from 'lucide-react';
import { formatTimeDisplay } from '../../utils/householdHelpers.js';
import { getFieldClass } from '../../components/HowardUI.jsx';

/**
 * Parameterized Morning/Evening dose check-in card for Cadence.
 * Keeps its quick-note draft local so typing never re-renders the parent dashboard.
 */
export default function DoseCard({
  slot,
  dose,
  targetTime,
  dosageLabel,
  activeCaregiver,
  isSaving,
  onRecordDose,
  onOpenManual,
  onOpenUndo
}) {
  const [noteInput, setNoteInput] = useState('');
  const isMorning = slot === 'morning';
  const SlotIcon = isMorning ? Sun : Moon;
  const title = isMorning ? 'Morning Dose' : 'Evening Dose';
  const noteLabel = isMorning
    ? 'Optional note (e.g., given with lick treat, syringe direct):'
    : 'Optional note (e.g., given after dinner, appetite good):';
  const customTimeLabel = isMorning
    ? 'Gave it earlier? Log custom morning time'
    : 'Gave it earlier? Log custom evening time';
  const isGiven = Boolean(dose?.given);

  return (
    <div
      className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border-2 transition-all flex flex-col justify-between ${
        isGiven
          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600 shadow-sm text-text-primary'
          : 'bg-surface-card border-border-subtle text-text-primary shadow-xs hover:border-purple-400'
      }`}
    >
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xs shrink-0 ${
                isGiven
                  ? 'bg-emerald-700 text-white'
                  : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
              }`}
            >
              {isGiven ? <Check className="w-7 h-7 stroke-[2.5]" /> : <SlotIcon className="w-6 h-6" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-extrabold">{title}</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-surface-muted text-text-secondary">
                  ~{targetTime}
                </span>
              </div>
              <p className="text-xs font-medium text-text-muted">
                Dosage: <strong>{dosageLabel}</strong>
              </p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shrink-0 ${
              isGiven
                ? 'bg-emerald-700 text-white'
                : 'bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-500/25'
            }`}
          >
            {isGiven ? 'Completed' : 'Pending'}
          </span>
        </div>

        {isGiven ? (
          <div className="rounded-2xl p-4 border bg-surface-card/90 border-emerald-200 dark:border-emerald-800 space-y-2 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-text-secondary font-medium">Time Given:</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400 text-base">
                {formatTimeDisplay(dose.timestamp)}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-text-secondary font-medium shrink-0">Given By:</span>
              <span className="font-bold inline-flex items-center gap-1.5 min-w-0 max-w-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="min-w-0 truncate">{dose.givenBy}</span>
              </span>
            </div>
            {dose.note && (
              <div className="pt-1.5 border-t border-border-subtle text-xs text-text-secondary break-words">
                <span className="font-semibold">Note: </span>
                {dose.note}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-secondary mb-1">
              {noteLabel}
            </label>
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Add quick note (optional)..."
              className={getFieldClass('purple')}
              maxLength={80}
            />
          </div>
        )}
      </div>

      {isGiven ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onOpenManual(slot, dose)}
            className="flex-1 min-w-[160px] min-h-[44px] py-2.5 px-3 rounded-xl bg-surface-card hover:bg-surface-hover border border-border-strong font-semibold text-xs sm:text-sm transition active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Edit3 className="w-4 h-4 shrink-0" />
            <span>Edit Time / Person</span>
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onOpenUndo(slot, dose)}
            className="min-h-[44px] py-2.5 px-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 font-semibold text-xs sm:text-sm transition active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
            title={`Undo ${title}`}
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>Undo</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => {
              const currentNote = noteInput;
              setNoteInput('');
              onRecordDose(slot, currentNote);
            }}
            className="w-full min-h-[48px] py-4 px-5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-base sm:text-lg shadow-md shadow-purple-500/20 active:scale-[0.98] transition flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <span>
              Check {title} ({activeCaregiver})
            </span>
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onOpenManual(slot, null)}
            className="w-full min-h-[40px] py-2 px-3 rounded-xl text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:underline text-center transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {customTimeLabel}
          </button>
        </div>
      )}
    </div>
  );
}
