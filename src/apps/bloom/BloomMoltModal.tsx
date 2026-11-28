import React, { useId, useState } from 'react';
import { Info, Sparkles } from 'lucide-react';
import type { BloomSettings } from '../../../shared/schemas/bloom.ts';
import { ModalShell, getFieldClass } from '../../components/HowardUI.tsx';
import {
  INSTAR_STAGES,
  MOLT_QUALITY_OPTIONS,
  getSuggestedNextInstar
} from './bloomConstants.ts';

export interface BloomMoltPayload {
  dateKey: string;
  fromInstar: string;
  toInstar: string;
  lengthMm: number | null;
  colorShift: string;
  quality: string;
  note: string;
  advanceInstar: boolean;
  startHardening: boolean;
}

export default function BloomMoltModal({
  settings,
  latestMoltDateKey,
  todayKey,
  hardeningHours,
  isPending,
  onClose,
  onSubmit
}: {
  settings: BloomSettings;
  latestMoltDateKey: string | null;
  todayKey: string;
  hardeningHours: number;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: BloomMoltPayload) => Promise<boolean | undefined>;
}) {
  const uid = useId();
  const formId = `${uid}-form`;
  const initialInstar = settings.currentInstar || 'L2';
  const [moltDateInput, setMoltDateInput] = useState(todayKey);
  const [moltFromInput, setMoltFromInput] = useState(initialInstar);
  const [moltToInput, setMoltToInput] = useState(() =>
    getSuggestedNextInstar(initialInstar, settings.sex)
  );
  const [moltLengthInput, setMoltLengthInput] = useState(() => {
    const baseLen = Number(settings.enclosureInfo?.currentBodyLengthMm);
    return Number.isFinite(baseLen) && baseLen > 0
      ? String(Math.round(baseLen * 13.5) / 10)
      : '';
  });
  const [moltColorInput, setMoltColorInput] = useState('');
  const [moltQualityInput, setMoltQualityInput] = useState('clean');
  const [moltNoteInput, setMoltNoteInput] = useState('');
  const [moltStartHardening, setMoltStartHardening] = useState(hardeningHours > 0);
  const [lengthError, setLengthError] = useState('');

  const isLatestMoltModal =
    !latestMoltDateKey || (moltDateInput || todayKey) >= latestMoltDateKey;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedLen = moltLengthInput.trim();
    let parsedLengthMm: number | null = null;
    if (trimmedLen !== '') {
      const num = Number(trimmedLen);
      if (!Number.isFinite(num) || num <= 0) {
        setLengthError('Body length must be a positive number (mm).');
        return;
      }
      parsedLengthMm = num;
    }
    setLengthError('');

    const targetDate = moltDateInput || todayKey;
    await onSubmit({
      dateKey: targetDate,
      fromInstar: moltFromInput,
      toInstar: moltToInput,
      lengthMm: parsedLengthMm,
      colorShift: moltColorInput.trim(),
      quality: moltQualityInput,
      note: moltNoteInput.trim(),
      advanceInstar: isLatestMoltModal,
      startHardening:
        hardeningHours > 0 && moltStartHardening && targetDate === todayKey && isLatestMoltModal
    });
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={`Log ${settings.mantisName}'s Molt!`}
      subtitle={
        isLatestMoltModal
          ? 'Record exuvia shed & advance instar stage'
          : 'Add a historical exuvia shed to growth history'
      }
      icon={Sparkles}
      accent="emerald"
      maxWidthClass="max-w-md"
      disableBackdropClose={isPending}
      ariaLabel="Log Molt Milestone"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-surface-subtle text-text-primary hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            disabled={isPending}
            className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-extrabold bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
          >
            {isPending ? 'Saving...' : 'Save Molt Milestone'}
          </button>
        </div>
      }
    >
      {!isLatestMoltModal && (
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-start gap-2 text-xs font-semibold">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            This date precedes the latest recorded molt ({latestMoltDateKey}), so it will be added
            as a historical milestone without changing {settings.mantisName}&apos;s current instar (
            {settings.currentInstar}).
          </span>
        </div>
      )}

      <form id={formId} onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-from`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              From Stage
            </label>
            <select
              id={`${uid}-from`}
              value={moltFromInput}
              onChange={(e) => setMoltFromInput(e.target.value)}
              className={getFieldClass('emerald', 'font-bold min-w-0')}
            >
              {INSTAR_STAGES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-to`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              New Stage
            </label>
            <select
              id={`${uid}-to`}
              value={moltToInput}
              onChange={(e) => setMoltToInput(e.target.value)}
              className={getFieldClass('emerald', 'font-bold min-w-0')}
            >
              {INSTAR_STAGES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-date`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Molt Date
            </label>
            <input
              id={`${uid}-date`}
              type="date"
              value={moltDateInput}
              onChange={(e) => setMoltDateInput(e.target.value)}
              className={getFieldClass('emerald', 'min-w-0')}
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-length`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Est. Body Length (mm)
            </label>
            <input
              id={`${uid}-length`}
              type="number"
              min="0.1"
              step="0.1"
              placeholder="e.g. 15"
              value={moltLengthInput}
              onChange={(e) => {
                setMoltLengthInput(e.target.value);
                if (lengthError) setLengthError('');
              }}
              aria-invalid={Boolean(lengthError)}
              className={getFieldClass('emerald', 'min-w-0')}
            />
            {lengthError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-1">
                {lengthError}
              </p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor={`${uid}-color`}
            className="block font-bold uppercase text-text-secondary mb-1"
          >
            New Colour / Pattern Shift
          </label>
          <input
            id={`${uid}-color`}
            type="text"
            value={moltColorInput}
            onChange={(e) => setMoltColorInput(e.target.value)}
            placeholder="e.g., Brighter lime bands & pink tibial lobes..."
            className={getFieldClass('emerald')}
          />
        </div>

        <div>
          <span
            id={`${uid}-quality-label`}
            className="block font-bold uppercase text-text-secondary mb-1"
          >
            Molt Quality
          </span>
          <div
            role="group"
            aria-labelledby={`${uid}-quality-label`}
            className="grid grid-cols-1 sm:grid-cols-3 gap-2"
          >
            {MOLT_QUALITY_OPTIONS.map((q) => (
              <button
                key={q.id}
                type="button"
                aria-pressed={moltQualityInput === q.id}
                onClick={() => setMoltQualityInput(q.id)}
                className={`min-h-[40px] py-2 px-3 rounded-xl border font-bold active:scale-[0.98] transition cursor-pointer ${
                  moltQualityInput === q.id
                    ? 'bg-emerald-700 text-white border-emerald-800'
                    : 'bg-surface-subtle border-border-subtle text-text-primary hover:bg-surface-hover'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor={`${uid}-note`}
            className="block font-bold uppercase text-text-secondary mb-1"
          >
            Notes
          </label>
          <input
            id={`${uid}-note`}
            type="text"
            value={moltNoteInput}
            onChange={(e) => setMoltNoteInput(e.target.value)}
            placeholder="Hung from ceiling mesh overnight, all 6 tarsi gripping well..."
            className={getFieldClass('emerald')}
          />
        </div>

        {isLatestMoltModal && moltDateInput === todayKey && hardeningHours > 0 && (
          <label
            htmlFor={`${uid}-hardening`}
            className="flex items-center gap-2 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-900 dark:text-rose-200 font-semibold cursor-pointer"
          >
            <input
              id={`${uid}-hardening`}
              type="checkbox"
              checked={moltStartHardening}
              onChange={(e) => setMoltStartHardening(e.target.checked)}
              className="rounded accent-rose-600 w-4 h-4"
            />
            <span>Start {hardeningHours}h Post-Molt No-Feed Hardening Timer</span>
          </label>
        )}
      </form>
    </ModalShell>
  );
}
