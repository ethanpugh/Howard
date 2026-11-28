import { useId, useState } from 'react';
import { Check, CheckCircle2, Edit3, Moon, Sun, Trash2 } from 'lucide-react';
import type { CadenceDose } from '../../../shared/schemas/cadence.ts';
import { formatTimeDisplay } from '../../utils/householdHelpers.ts';
import { Button, IconBadge, getFieldClass } from '../../components/HowardUI.tsx';
import type { CadenceSlot } from './CadenceModals.tsx';

export interface DoseCardProps {
  slot: CadenceSlot;
  dose?: CadenceDose | null | undefined;
  targetTime: string;
  dosageLabel: string;
  activeCaregiver: string;
  isSaving: boolean;
  onRecordDose: (slot: CadenceSlot, customNote?: string) => void | Promise<unknown>;
  onOpenManual: (slot: CadenceSlot, existingData?: CadenceDose | null | undefined) => void;
  onOpenUndo: (slot: CadenceSlot, existingData?: CadenceDose | null | undefined) => void;
}

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
}: DoseCardProps) {
  const noteInputId = useId();
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
          ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm text-text-primary'
          : 'bg-surface-card border-border-subtle text-text-primary shadow-xs hover:border-purple-400'
      }`}
    >
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <IconBadge
              icon={isGiven ? Check : SlotIcon}
              accent="purple"
              size="lg"
              className={isGiven ? '!bg-emerald-700 !text-white shadow-xs' : 'shadow-xs'}
              iconClassName={isGiven ? 'w-6 h-6 stroke-[2.5]' : 'w-5 h-5'}
            />
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
                {formatTimeDisplay(dose?.timestamp) || 'Recorded'}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-text-secondary font-medium shrink-0">Given By:</span>
              <span className="font-bold inline-flex items-center gap-1.5 min-w-0 max-w-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="min-w-0 truncate">{dose?.givenBy}</span>
              </span>
            </div>
            {dose?.note && (
              <div className="pt-1.5 border-t border-border-subtle text-xs text-text-secondary break-words">
                <span className="font-semibold">Note: </span>
                {dose.note}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-4">
            <label
              htmlFor={noteInputId}
              className="block text-xs font-medium text-text-secondary mb-1"
            >
              {noteLabel}
            </label>
            <input
              id={noteInputId}
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
          <Button
            variant="secondary"
            accent="purple"
            size="lg"
            icon={Edit3}
            disabled={isSaving}
            onClick={() => onOpenManual(slot, dose)}
            className="flex-1 min-w-[160px]"
          >
            <span>Edit Time / Person</span>
          </Button>
          <Button
            variant="dangerTinted"
            size="lg"
            icon={Trash2}
            disabled={isSaving}
            onClick={() => onOpenUndo(slot, dose)}
            title={`Undo ${title}`}
          >
            <span>Undo</span>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            variant="primary"
            accent="purple"
            size="lg"
            icon={CheckCircle2}
            disabled={isSaving}
            onClick={() => {
              const currentNote = noteInput;
              setNoteInput('');
              void onRecordDose(slot, currentNote);
            }}
            className="w-full"
          >
            <span>
              Check {title} ({activeCaregiver})
            </span>
          </Button>
          <Button
            variant="ghost"
            accent="purple"
            size="sm"
            disabled={isSaving}
            onClick={() => onOpenManual(slot, null)}
            className="w-full"
          >
            {customTimeLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
