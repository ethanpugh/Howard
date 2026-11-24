import React, { useState } from 'react';
import { AlertTriangle, Edit3, RefreshCw, Settings } from 'lucide-react';
import {
  createDefaultCadenceSettings,
  formatFriendlyDate,
  formatShortDateEnGB,
  formatTimeDisplay
} from '../../utils/householdHelpers.js';
import { ConfirmModal, ModalShell, getFieldClass } from '../../components/HowardUI.jsx';

const LABEL_CLASS =
  'block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1';

export function UndoDoseModal({ modal, isSaving, onClose, onConfirm }) {
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

export function NewBottleConfirmModal({
  isOpen,
  todayKey,
  settings,
  isSaving,
  onClose,
  onConfirm
}) {
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

export function ManualDoseModal({
  modal,
  todayKey,
  settings,
  activeCaregiver,
  isSaving,
  onClose,
  onSwitchToUndo,
  onSave
}) {
  const [timeInput, setTimeInput] = useState(() => {
    const fallback =
      modal.slot === 'morning'
        ? settings.morningTargetTime || '08:00'
        : settings.eveningTargetTime || '20:00';
    if (modal.existingData?.timestamp) {
      const d = new Date(modal.existingData.timestamp);
      if (Number.isFinite(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
      }
    }
    return fallback;
  });
  const [caregiverInput, setCaregiverInput] = useState(
    () => modal.existingData?.givenBy || activeCaregiver
  );
  const [noteInput, setNoteInput] = useState(() => modal.existingData?.note || '');

  const caregiverChoices = settings.caregivers || createDefaultCadenceSettings().caregivers;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      timeInput,
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
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
            Time Dose Was Given
          </label>
          <input
            type="time"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            required
            className={getFieldClass('purple', 'font-semibold')}
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
            Given By
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {caregiverChoices.map((person) => (
              <button
                key={person}
                type="button"
                onClick={() => setCaregiverInput(person)}
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
            type="text"
            value={caregiverInput}
            onChange={(e) => setCaregiverInput(e.target.value)}
            placeholder="Name of person..."
            required
            className={getFieldClass('purple')}
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
            Optional Note
          </label>
          <input
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

export function CadenceSettingsModal({ settings, isSaving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ ...settings }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>Pet Name</label>
            <input
              type="text"
              value={form.catName || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, catName: e.target.value }))}
              placeholder="Pet name"
              required
              className={getFieldClass('purple')}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Prescribed Dosage Badge</label>
            <input
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
          <label className={LABEL_CLASS}>Medication Name</label>
          <input
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
            <label className={LABEL_CLASS}>Morning Target Time</label>
            <input
              type="time"
              value={form.morningTargetTime || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, morningTargetTime: e.target.value }))}
              required
              className={getFieldClass('purple')}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Evening Target Time</label>
            <input
              type="time"
              value={form.eveningTargetTime || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, eveningTargetTime: e.target.value }))}
              required
              className={getFieldClass('purple')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className={LABEL_CLASS}>Current Bottle Opened Date</label>
            <input
              type="date"
              value={form.bottleOpenedDate || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, bottleOpenedDate: e.target.value }))}
              required
              className={getFieldClass('purple')}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Shelf Life Once Opened (Days)</label>
            <input
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
          <label className={LABEL_CLASS}>Administration &amp; Care Instructions</label>
          <textarea
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
