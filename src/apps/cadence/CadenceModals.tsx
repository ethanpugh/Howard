import { useId, useState, type FormEvent } from 'react';
import { AlertTriangle, Edit3, RefreshCw, Settings } from 'lucide-react';
import type { CadenceDose, CadenceSettings } from '../../../shared/schemas/cadence.ts';
import {
  createDefaultCadenceSettings,
  formatFriendlyDate,
  formatShortDateEnGB,
  formatTimeDisplay
} from '../../utils/householdHelpers.ts';
import { ConfirmModal, ModalShell, getFieldClass } from '../../components/HowardUI.tsx';

const LABEL_CLASS =
  'block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1';
const TIME_HH_MM_RE = /^(\d{1,2}):(\d{2})$/;

function normalizeValidTimeHHMM(raw: string | undefined): string | null {
  const trimmed = String(raw || '').trim();
  const match = TIME_HH_MM_RE.exec(trimmed);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isInteger(hh) || hh < 0 || hh > 23 || !Number.isInteger(mm) || mm < 0 || mm > 59) {
    return null;
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export type CadenceSlot = 'morning' | 'evening';

export type CadenceModalState =
  | {
      type: 'undo';
      dateKey: string;
      slot: CadenceSlot;
      existingData?: CadenceDose | null | undefined;
    }
  | {
      type: 'manual';
      dateKey: string;
      slot: CadenceSlot;
      existingData?: CadenceDose | null | undefined;
    }
  | { type: 'settings' }
  | { type: 'newBottle' };

export interface CadenceSettingsForm {
  catName: string;
  medicationName: string;
  dosageLabel: string;
  morningTargetTime: string;
  eveningTargetTime: string;
  bottleOpenedDate: string;
  bottleShelfLifeDays: number | string;
  administrationNote: string;
}

export interface UndoDoseModalProps {
  modal: Extract<CadenceModalState, { type: 'undo' }> | null;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function UndoDoseModal({ modal, isSaving, onClose, onConfirm }: UndoDoseModalProps) {
  return (
    <ConfirmModal
      isOpen={Boolean(modal)}
      onClose={onClose}
      onConfirm={onConfirm}
      title={
        modal
          ? `Uncheck ${modal.slot === 'morning' ? 'Morning' : 'Evening'} Dose?`
          : 'Uncheck Dose'
      }
      subtitle={modal ? `Date: ${modal.dateKey}` : ''}
      icon={AlertTriangle}
      accent="rose"
      danger
      confirmText="Yes, Uncheck Dose"
      cancelText="Keep Checked"
      isPending={isSaving}
    >
      {modal && (
        <p className="text-sm text-text-secondary leading-relaxed">
          This dose was marked as given at{' '}
          <strong className="text-text-primary">
            {formatTimeDisplay(modal.existingData?.timestamp)}
          </strong>{' '}
          by{' '}
          <strong className="text-text-primary">
            {modal.existingData?.givenBy}
          </strong>
          . Unchecking it will show the dose as pending on everyone&apos;s phone.
        </p>
      )}
    </ConfirmModal>
  );
}

export interface NewBottleConfirmModalProps {
  isOpen: boolean;
  todayKey: string;
  settings: CadenceSettings;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function NewBottleConfirmModal({
  isOpen,
  todayKey,
  settings,
  isSaving,
  onClose,
  onConfirm
}: NewBottleConfirmModalProps) {
  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Start Fresh Bottle Today?"
      subtitle={`Sets opened date to ${formatFriendlyDate(todayKey, todayKey)} (${formatShortDateEnGB(todayKey, { includeYear: true })}) • ${settings.bottleShelfLifeDays}-day shelf life`}
      icon={RefreshCw}
      accent="purple"
      danger={false}
      confirmText="Confirm New Bottle"
      cancelText="Cancel"
      isPending={isSaving}
    >
      <p className="text-sm text-text-secondary leading-relaxed">
        This will reset {settings.catName}&apos;s {settings.medicationName} bottle shelf-life
        countdown for everyone in the household.
      </p>
    </ConfirmModal>
  );
}

export interface ManualDoseEntryPayload {
  timeInput: string;
  caregiverInput: string;
  noteInput: string;
}

export interface ManualDoseModalProps {
  modal: Extract<CadenceModalState, { type: 'manual' }>;
  todayKey: string;
  settings: CadenceSettings;
  activeCaregiver: string;
  isSaving: boolean;
  onClose: () => void;
  onSwitchToUndo: () => void;
  onSave: (entry: ManualDoseEntryPayload) => void;
}

export function ManualDoseModal({
  modal,
  todayKey,
  settings,
  activeCaregiver,
  isSaving,
  onClose,
  onSwitchToUndo,
  onSave
}: ManualDoseModalProps) {
  const idPrefix = useId();
  const timeFieldId = `${idPrefix}-time`;
  const caregiverFieldId = `${idPrefix}-caregiver`;
  const noteFieldId = `${idPrefix}-note`;

  const [timeInput, setTimeInput] = useState(() => {
    const slotDefault = modal.slot === 'morning' ? '08:00' : '20:00';
    const targetTime =
      modal.slot === 'morning' ? settings.morningTargetTime : settings.eveningTargetTime;
    const fallback = normalizeValidTimeHHMM(targetTime) ?? slotDefault;
    if (modal.existingData?.timestamp) {
      const d = new Date(modal.existingData.timestamp);
      if (Number.isFinite(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
      }
    }
    const existingTime = normalizeValidTimeHHMM(modal.existingData?.time);
    if (existingTime) return existingTime;
    return fallback;
  });
  const [caregiverInput, setCaregiverInput] = useState(
    () => modal.existingData?.givenBy || activeCaregiver
  );
  const [noteInput, setNoteInput] = useState(() => modal.existingData?.note || '');
  const [formError, setFormError] = useState<string | null>(null);

  const caregiverChoices = settings.caregivers || createDefaultCadenceSettings().caregivers;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const normalizedTime = normalizeValidTimeHHMM(timeInput);
    if (!normalizedTime) {
      setFormError('Please enter a valid 24-hour time (HH:MM, 00:00–23:59).');
      return;
    }
    if (!caregiverInput.trim()) {
      setFormError('Please enter who gave the dose.');
      return;
    }
    setFormError(null);
    onSave({
      timeInput: normalizedTime,
      caregiverInput,
      noteInput
    });
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={`${modal.existingData?.given ? 'Edit' : 'Log'} ${
        modal.slot === 'morning' ? 'Morning (AM)' : 'Evening (PM)'
      } Dose`}
      subtitle={`Date: ${formatFriendlyDate(modal.dateKey, todayKey)} (${modal.dateKey})`}
      icon={Edit3}
      accent="purple"
      maxWidthClass="max-w-md"
      ariaLabel="Log or Edit Dose Entry"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {modal.existingData?.given ? (
            <button
              type="button"
              onClick={onSwitchToUndo}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 font-semibold text-xs sm:text-sm transition active:scale-[0.98] cursor-pointer"
            >
              Clear / Uncheck
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-surface-subtle hover:bg-surface-hover text-text-primary font-semibold text-sm transition active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="cadence-manual-log-form"
              disabled={isSaving}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm transition active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </div>
      }
    >
      <form id="cadence-manual-log-form" onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <p
            role="alert"
            className="text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2"
          >
            {formError}
          </p>
        )}

        <div>
          <label
            htmlFor={timeFieldId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5"
          >
            Time Dose Was Given
          </label>
          <input
            id={timeFieldId}
            type="time"
            value={timeInput}
            onChange={(e) => {
              setTimeInput(e.target.value);
              if (formError) setFormError(null);
            }}
            required
            className={getFieldClass('purple', 'font-semibold')}
          />
        </div>

        <div>
          <label
            htmlFor={caregiverFieldId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5"
          >
            Given By
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {caregiverChoices.map((person) => (
              <button
                key={person}
                type="button"
                aria-pressed={caregiverInput === person}
                onClick={() => {
                  setCaregiverInput(person);
                  if (formError) setFormError(null);
                }}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-[0.98] cursor-pointer ${
                  caregiverInput === person
                    ? 'bg-purple-600 text-white'
                    : 'bg-surface-subtle text-text-primary hover:bg-surface-hover'
                }`}
              >
                {person}
              </button>
            ))}
          </div>
          <input
            id={caregiverFieldId}
            type="text"
            value={caregiverInput}
            onChange={(e) => {
              setCaregiverInput(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder="Name of person..."
            required
            className={getFieldClass('purple')}
          />
        </div>

        <div>
          <label
            htmlFor={noteFieldId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5"
          >
            Optional Note
          </label>
          <input
            id={noteFieldId}
            type="text"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="e.g., Took well with wet food"
            className={getFieldClass('purple')}
          />
        </div>
      </form>
    </ModalShell>
  );
}

export interface CadenceSettingsModalProps {
  settings: CadenceSettings;
  isSaving: boolean;
  onClose: () => void;
  onSave: (form: CadenceSettingsForm) => void;
}

export function CadenceSettingsModal({
  settings,
  isSaving,
  onClose,
  onSave
}: CadenceSettingsModalProps) {
  const idPrefix = useId();
  const catNameId = `${idPrefix}-catName`;
  const dosageLabelId = `${idPrefix}-dosageLabel`;
  const medicationNameId = `${idPrefix}-medicationName`;
  const morningTargetTimeId = `${idPrefix}-morningTargetTime`;
  const eveningTargetTimeId = `${idPrefix}-eveningTargetTime`;
  const bottleOpenedDateId = `${idPrefix}-bottleOpenedDate`;
  const bottleShelfLifeDaysId = `${idPrefix}-bottleShelfLifeDays`;
  const administrationNoteId = `${idPrefix}-administrationNote`;

  const [form, setForm] = useState<CadenceSettingsForm>(() => ({ ...settings }));
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const normalizedAm = normalizeValidTimeHHMM(form.morningTargetTime);
    const normalizedPm = normalizeValidTimeHHMM(form.eveningTargetTime);
    if (!normalizedAm || !normalizedPm) {
      setFormError('Please enter valid 24-hour target times (HH:MM, 00:00–23:59).');
      return;
    }
    setFormError(null);
    onSave({
      ...form,
      morningTargetTime: normalizedAm,
      eveningTargetTime: normalizedPm
    });
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Cadence • Pet & Medication Settings"
      subtitle="Changes sync immediately across all household devices"
      icon={Settings}
      accent="purple"
      maxWidthClass="max-w-lg"
      ariaLabel="Pet and Medication Settings"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-surface-subtle hover:bg-surface-hover text-text-primary font-semibold text-sm transition active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="cadence-settings-form"
            disabled={isSaving}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm transition active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Household Settings'}
          </button>
        </div>
      }
    >
      <form id="cadence-settings-form" onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <p
            role="alert"
            className="text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2"
          >
            {formError}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={catNameId} className={LABEL_CLASS}>
              Pet Name
            </label>
            <input
              id={catNameId}
              type="text"
              value={form.catName || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, catName: e.target.value }))}
              placeholder="Pet name"
              required
              className={getFieldClass('purple')}
            />
          </div>

          <div>
            <label htmlFor={dosageLabelId} className={LABEL_CLASS}>
              Prescribed Dosage Badge
            </label>
            <input
              id={dosageLabelId}
              type="text"
              value={form.dosageLabel || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, dosageLabel: e.target.value }))}
              placeholder="e.g., 2.5 mg / 0.5 ml"
              required
              className={getFieldClass('purple')}
            />
          </div>
        </div>

        <div>
          <label htmlFor={medicationNameId} className={LABEL_CLASS}>
            Medication Name
          </label>
          <input
            id={medicationNameId}
            type="text"
            value={form.medicationName || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, medicationName: e.target.value }))}
            placeholder="e.g., Oral Solution, Methimazole"
            required
            className={getFieldClass('purple')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={morningTargetTimeId} className={LABEL_CLASS}>
              Morning Target Time
            </label>
            <input
              id={morningTargetTimeId}
              type="time"
              value={form.morningTargetTime || ''}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, morningTargetTime: e.target.value }));
                if (formError) setFormError(null);
              }}
              required
              className={getFieldClass('purple')}
            />
          </div>
          <div>
            <label htmlFor={eveningTargetTimeId} className={LABEL_CLASS}>
              Evening Target Time
            </label>
            <input
              id={eveningTargetTimeId}
              type="time"
              value={form.eveningTargetTime || ''}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, eveningTargetTime: e.target.value }));
                if (formError) setFormError(null);
              }}
              required
              className={getFieldClass('purple')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label htmlFor={bottleOpenedDateId} className={LABEL_CLASS}>
              Current Bottle Opened Date
            </label>
            <input
              id={bottleOpenedDateId}
              type="date"
              value={form.bottleOpenedDate || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, bottleOpenedDate: e.target.value }))}
              required
              className={getFieldClass('purple')}
            />
          </div>
          <div>
            <label htmlFor={bottleShelfLifeDaysId} className={LABEL_CLASS}>
              Shelf Life Once Opened (Days)
            </label>
            <input
              id={bottleShelfLifeDaysId}
              type="number"
              min="7"
              max="365"
              value={form.bottleShelfLifeDays ?? ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, bottleShelfLifeDays: e.target.value }))
              }
              required
              className={getFieldClass('purple')}
            />
          </div>
        </div>

        <div>
          <label htmlFor={administrationNoteId} className={LABEL_CLASS}>
            Administration &amp; Care Instructions
          </label>
          <textarea
            id={administrationNoteId}
            rows={2}
            value={form.administrationNote || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, administrationNote: e.target.value }))}
            className={getFieldClass('purple')}
          />
        </div>
      </form>
    </ModalShell>
  );
}
