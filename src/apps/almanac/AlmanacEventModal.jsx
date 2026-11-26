import React, { useState } from 'react';
import { Calendar as CalendarIcon, Repeat } from 'lucide-react';
import { ModalShell, getFieldClass } from '../../components/HowardUI.jsx';
import {
  VALID_DATE_KEY_RE,
  parseLocalDateKey,
  shiftDateKey,
  inferProfileIdFromName
} from '../../utils/householdHelpers.js';
import { useActionLock } from '../../hooks/useActionLock.js';

export const RECURRENCE_OPTIONS = [
  { id: 'none', label: 'One-off', shortLabel: '' },
  { id: 'weekly', label: 'Weekly (Every 7d)', shortLabel: 'Weekly' },
  { id: 'fortnightly', label: 'Fortnightly (Every 14d)', shortLabel: 'Fortnightly' },
  { id: 'monthly', label: 'Monthly', shortLabel: 'Monthly' },
  { id: 'annual', label: 'Annually', shortLabel: 'Annual' }
];

export const EVENT_CATEGORIES = [
  {
    id: 'household',
    label: 'Household',
    color: 'bg-indigo-600 text-white',
    badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
  },
  {
    id: 'pet',
    label: 'Pet / Vet',
    color: 'bg-purple-600 text-white',
    badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
  },
  {
    id: 'medical',
    label: 'GP / Health',
    color: 'bg-rose-600 text-white',
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
  },
  {
    id: 'bins',
    label: 'Bins / Utilities',
    color: 'bg-cyan-700 text-white',
    badge: 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-300'
  },
  {
    id: 'social',
    label: 'Holiday / Social',
    color: 'bg-teal-600 text-white',
    badge: 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
  }
];

export const formatAlmanacDateFriendly = (dateStr) => {
  if (!dateStr) return '';
  return parseLocalDateKey(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

export default function AlmanacEventModal({
  mode,
  editingEvent,
  selectedDate,
  activeProfile,
  profiles,
  partner1Name,
  partner2Name,
  almanacEvents,
  onMutateEvents,
  onSaveEvents,
  onSaved,
  onClose,
  showToast
}) {
  const isEdit = mode === 'edit' && Boolean(editingEvent);
  const editingEventId = isEdit ? editingEvent.id : null;
  const wasRecurring = Boolean(
    isEdit && editingEvent?.recurrence && editingEvent.recurrence !== 'none'
  );
  const canLinkGpReport = Boolean(activeProfile?.allowedApps?.includes('floodgate'));

  const [repeatEditScope, setRepeatEditScope] = useState('single'); // 'single' | 'future'
  const [titleInput, setTitleInput] = useState(() => (isEdit ? editingEvent.title || '' : ''));
  const [dateInput, setDateInput] = useState(() =>
    isEdit ? (wasRecurring ? selectedDate : editingEvent.date || selectedDate) : selectedDate
  );
  const [timeInput, setTimeInput] = useState(() =>
    isEdit ? (editingEvent.time ?? '') : '10:00'
  );
  const [categoryInput, setCategoryInput] = useState(() =>
    isEdit ? editingEvent.category || 'household' : 'household'
  );
  const [recurrenceInput, setRecurrenceInput] = useState(() =>
    isEdit ? (wasRecurring ? 'none' : editingEvent.recurrence || 'none') : 'none'
  );
  const [assignedToInput, setAssignedToInput] = useState(() =>
    isEdit ? editingEvent.assignedTo || 'Both' : 'Both'
  );
  const [notesInput, setNotesInput] = useState(() => (isEdit ? editingEvent.notes || '' : ''));
  const [linkGpReportInput, setLinkGpReportInput] = useState(() =>
    isEdit ? Boolean(editingEvent.linkToGpReport) : false
  );
  const [gpLinkManual, setGpLinkManual] = useState(false);
  const [formError, setFormError] = useState('');
  const { isPending: isSaving, runLocked } = useActionLock();

  const isEditingRecurringSingle = Boolean(
    editingEventId && wasRecurring && repeatEditScope === 'single'
  );

  const persistEvents = async (mutationPayload, legacyEvents, msg) => {
    if (onMutateEvents) {
      return onMutateEvents(mutationPayload, msg);
    }
    return onSaveEvents(legacyEvents, msg);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!titleInput.trim()) {
      setFormError('Please enter an event title');
      showToast?.('Please enter an event title', 'error');
      return;
    }
    const targetDate = dateInput || selectedDate;
    if (!VALID_DATE_KEY_RE.test(targetDate)) {
      setFormError('Please select a valid date (YYYY-MM-DD)');
      showToast?.('Please select a valid date (YYYY-MM-DD)', 'error');
      return;
    }
    setFormError('');

    const resolvedGpLink = canLinkGpReport ? Boolean(linkGpReportInput) : false;
    const assignedToProfileId = inferProfileIdFromName(profiles, assignedToInput);
    const trimmedTitle = titleInput.trim();
    const trimmedNotes = notesInput.trim();

    await runLocked(async () => {
      let ok = true;
      if (!editingEventId) {
        const newEvt = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: trimmedTitle,
          date: targetDate,
          time: timeInput,
          category: categoryInput,
          recurrence: recurrenceInput || 'none',
          skippedDates: [],
          assignedTo: assignedToInput,
          assignedToProfileId,
          notes: trimmedNotes,
          linkToGpReport: resolvedGpLink,
          createdAt: new Date().toISOString()
        };
        const next = [...(almanacEvents || []), newEvt];
        const msg =
          newEvt.recurrence !== 'none'
            ? `Added recurring (${newEvt.recurrence}) event "${newEvt.title}"`
            : `Added "${newEvt.title}" to Almanac`;
        ok = await persistEvents({ nextEvents: next, upserts: [newEvt] }, next, msg);
      } else if (wasRecurring && repeatEditScope === 'single') {
        const detachedEvt = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: trimmedTitle,
          date: targetDate,
          time: timeInput,
          category: categoryInput,
          recurrence: 'none',
          skippedDates: [],
          assignedTo: assignedToInput,
          assignedToProfileId,
          notes: trimmedNotes,
          linkToGpReport: resolvedGpLink,
          createdAt: new Date().toISOString()
        };
        let modifiedParent = null;
        const next = (almanacEvents || []).map((item) => {
          if (item.id !== editingEventId) return item;
          const existingSkipped = Array.isArray(item.skippedDates) ? item.skippedDates : [];
          modifiedParent = {
            ...item,
            skippedDates: Array.from(new Set([...existingSkipped, selectedDate]))
          };
          return modifiedParent;
        });
        const nextWithDetached = [...next, detachedEvt];
        const msg = `Updated "${detachedEvt.title}" for ${targetDate} only`;
        ok = await persistEvents(
          {
            nextEvents: nextWithDetached,
            upserts: modifiedParent ? [modifiedParent, detachedEvt] : [detachedEvt]
          },
          nextWithDetached,
          msg
        );
      } else if (
        wasRecurring &&
        selectedDate > editingEvent.date &&
        targetDate > editingEvent.date
      ) {
        const latestParent =
          (almanacEvents || []).find((item) => item.id === editingEventId) || editingEvent;
        const splitBoundary = targetDate < selectedDate ? targetDate : selectedDate;
        const prevDateStr = shiftDateKey(splitBoundary, -1);
        const nextRecurrence = recurrenceInput || 'none';
        const preservedSkips =
          nextRecurrence === latestParent.recurrence
            ? (latestParent.skippedDates || []).filter((d) => d > targetDate)
            : [];
        const futureSeriesEvt = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: trimmedTitle,
          date: targetDate,
          time: timeInput,
          category: categoryInput,
          recurrence: nextRecurrence,
          skippedDates: preservedSkips,
          ...(nextRecurrence !== 'none' &&
          latestParent.untilDate &&
          latestParent.untilDate >= targetDate
            ? { untilDate: latestParent.untilDate }
            : {}),
          assignedTo: assignedToInput,
          assignedToProfileId,
          notes: trimmedNotes,
          linkToGpReport: resolvedGpLink,
          createdAt: new Date().toISOString()
        };
        let cappedParent = null;
        const next = (almanacEvents || []).map((item) => {
          if (item.id !== editingEventId) return item;
          cappedParent = { ...item, untilDate: prevDateStr };
          return cappedParent;
        });
        const nextWithFuture = [...next, futureSeriesEvt];
        const msg = `Updated "${futureSeriesEvt.title}" from ${targetDate} onwards (past events preserved)`;
        ok = await persistEvents(
          {
            nextEvents: nextWithFuture,
            upserts: cappedParent ? [cappedParent, futureSeriesEvt] : [futureSeriesEvt]
          },
          nextWithFuture,
          msg
        );
      } else {
        const latestOriginal =
          (almanacEvents || []).find((item) => item.id === editingEventId) || editingEvent || {};
        const nextRecurrence = recurrenceInput || 'none';
        const updatedEvt = {
          ...latestOriginal,
          id: editingEventId,
          title: trimmedTitle,
          date: targetDate,
          time: timeInput,
          category: categoryInput,
          recurrence: nextRecurrence,
          assignedTo: assignedToInput,
          assignedToProfileId,
          notes: trimmedNotes,
          linkToGpReport: resolvedGpLink
        };
        if (
          nextRecurrence === 'none' ||
          (updatedEvt.untilDate && updatedEvt.untilDate < targetDate)
        ) {
          delete updatedEvt.untilDate;
        }
        if (nextRecurrence === 'none' || nextRecurrence !== latestOriginal.recurrence) {
          delete updatedEvt.skippedDates;
        } else if (Array.isArray(updatedEvt.skippedDates)) {
          updatedEvt.skippedDates = updatedEvt.skippedDates.filter((d) => d > targetDate);
        }
        const next = (almanacEvents || []).map((item) =>
          item.id === editingEventId ? updatedEvt : item
        );
        const msg = `Updated "${updatedEvt.title}"`;
        ok = await persistEvents({ nextEvents: next, upserts: [updatedEvt] }, next, msg);
      }

      if (ok !== false) {
        onSaved(targetDate);
      }
    });
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={editingEventId ? 'Edit Almanac Event' : 'Add Almanac Event'}
      subtitle={`Date: ${formatAlmanacDateFriendly(dateInput || selectedDate)}`}
      icon={CalendarIcon}
      accent="indigo"
      maxWidthClass="max-w-md"
      disableBackdropClose={isSaving}
      ariaLabel={editingEventId ? 'Edit Almanac Event' : 'Add Almanac Event'}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-surface-subtle text-text-primary hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="almanac-event-form"
            disabled={isSaving}
            className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
          >
            {isSaving ? 'Saving...' : editingEventId ? 'Save Changes' : 'Save Event'}
          </button>
        </div>
      }
    >
      <form id="almanac-event-form" onSubmit={handleSubmit} className="space-y-3.5">
        {editingEventId && wasRecurring && (
          <div className="p-3 rounded-2xl border border-indigo-500/25 bg-indigo-500/10 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Repeating Event — Apply Changes To:
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                {
                  id: 'single',
                  label: `This occurrence only (${selectedDate})`,
                  desc: 'Updates only this date; keeps past & future dates unchanged'
                },
                {
                  id: 'future',
                  label: 'This & future occurrences',
                  desc:
                    selectedDate > editingEvent.date
                      ? 'Preserves past occurrences and updates from this date onwards'
                      : 'Updates the repeating series from this date onwards'
                }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setRepeatEditScope(opt.id);
                    if (opt.id === 'single') {
                      setRecurrenceInput('none');
                    } else if (editingEvent?.recurrence) {
                      setRecurrenceInput(editingEvent.recurrence);
                    }
                  }}
                  className={`min-h-[40px] p-2.5 rounded-xl border text-left active:scale-[0.99] transition cursor-pointer ${
                    repeatEditScope === opt.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-surface-card border-border-strong text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  <div className="text-xs font-bold leading-snug">{opt.label}</div>
                  <div
                    className={`text-xs leading-snug mt-0.5 ${
                      repeatEditScope === opt.id ? 'text-indigo-100' : 'text-text-muted'
                    }`}
                  >
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Event Title
          </label>
          <input
            type="text"
            required
            value={titleInput}
            onChange={(e) => {
              setTitleInput(e.target.value);
              if (formError) setFormError('');
            }}
            placeholder="e.g., Vet Booster, GP Consultation, Bin Collection..."
            className={getFieldClass('indigo', formError ? 'min-w-0 border-rose-500' : 'min-w-0')}
          />
          {formError && (
            <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1">
              {formError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Date
            </label>
            <input
              type="date"
              required
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className={getFieldClass('indigo', 'min-w-0')}
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Time
            </label>
            <input
              type="time"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              className={getFieldClass('indigo', 'min-w-0')}
            />
          </div>
          <div className="sm:col-span-2 min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              For Who?
            </label>
            <select
              value={assignedToInput}
              onChange={(e) => {
                const nextAssignee = e.target.value;
                setAssignedToInput(nextAssignee);
                if (
                  !editingEventId &&
                  !gpLinkManual &&
                  categoryInput === 'medical' &&
                  canLinkGpReport
                ) {
                  setLinkGpReportInput(
                    nextAssignee === partner2Name || nextAssignee === 'Partner 2'
                  );
                }
              }}
              className={getFieldClass('indigo', 'min-w-0')}
            >
              <option value="Both">
                Both ({partner1Name} &amp; {partner2Name})
              </option>
              <option value={partner1Name}>{partner1Name}</option>
              <option value={partner2Name}>{partner2Name}</option>
              <option value="Pets">Pets</option>
              {!['Both', partner1Name, partner2Name, 'Pets'].includes(assignedToInput) &&
                assignedToInput && <option value={assignedToInput}>{assignedToInput}</option>}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Category
          </label>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setCategoryInput(cat.id);
                  if (!editingEventId && cat.id === 'bins' && recurrenceInput === 'none') {
                    setRecurrenceInput('weekly');
                  }
                  if (!editingEventId && !gpLinkManual && canLinkGpReport) {
                    if (cat.id === 'medical') {
                      setLinkGpReportInput(
                        assignedToInput === partner2Name || assignedToInput === 'Partner 2'
                      );
                    } else {
                      setLinkGpReportInput(false);
                    }
                  }
                }}
                className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border active:scale-[0.98] transition cursor-pointer ${
                  categoryInput === cat.id
                    ? cat.color
                    : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Repeat / Recurrence
          </label>
          <div className="flex flex-wrap gap-1.5">
            {RECURRENCE_OPTIONS.map((rec) => (
              <button
                key={rec.id}
                type="button"
                disabled={isEditingRecurringSingle}
                onClick={() => setRecurrenceInput(rec.id)}
                className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1 transition ${
                  isEditingRecurringSingle
                    ? 'opacity-45 cursor-not-allowed'
                    : 'active:scale-[0.98] cursor-pointer'
                } ${
                  recurrenceInput === rec.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                }`}
              >
                {rec.id !== 'none' && <Repeat className="w-3 h-3" />}
                <span>{rec.label}</span>
              </button>
            ))}
          </div>
          {isEditingRecurringSingle && (
            <p className="text-xs text-text-muted mt-1.5">
              Disabled while editing a single occurrence — choose &ldquo;This &amp; future
              occurrences&rdquo; above to change the repeat rule.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            placeholder="Extra details or preparation reminders..."
            className={getFieldClass('indigo', 'min-w-0')}
          />
        </div>

        {canLinkGpReport && (
          <label className="min-h-[40px] flex items-center gap-2 text-xs font-semibold cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={linkGpReportInput}
              onChange={(e) => {
                setLinkGpReportInput(e.target.checked);
                setGpLinkManual(true);
              }}
              className="w-4 h-4 rounded accent-rose-600 shrink-0"
            />
            <span>
              Attach quick-launch button for Floodgate Printable GP Report (keeps event private to{' '}
              {partner2Name})
            </span>
          </label>
        )}
      </form>
    </ModalShell>
  );
}
