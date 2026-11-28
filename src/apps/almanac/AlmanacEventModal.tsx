import React, { useId, useState } from 'react';
import { Calendar as CalendarIcon, Repeat } from 'lucide-react';
import type {
  AlmanacCategory,
  AlmanacEvent,
  AlmanacRecurrence
} from '../../../shared/schemas/almanac.ts';
import type { PublicProfile } from '../../../shared/schemas/profile.ts';
import type { ShowToastFn } from '../../App.tsx';
import { ModalShell, getFieldClass } from '../../components/HowardUI.tsx';
import {
  VALID_DATE_KEY_RE,
  parseLocalDateKey,
  shiftDateKey,
  inferProfileIdFromName,
  doesAlmanacEventOccurOnDate
} from '../../utils/householdHelpers.ts';
import { useActionLock } from '../../hooks/useActionLock.ts';

export interface RecurrenceOption {
  id: AlmanacRecurrence;
  label: string;
  shortLabel: string;
}

export const RECURRENCE_OPTIONS: readonly RecurrenceOption[] = [
  { id: 'none', label: 'One-off', shortLabel: '' },
  { id: 'weekly', label: 'Weekly (Every 7d)', shortLabel: 'Weekly' },
  { id: 'fortnightly', label: 'Fortnightly (Every 14d)', shortLabel: 'Fortnightly' },
  { id: 'monthly', label: 'Monthly', shortLabel: 'Monthly' },
  { id: 'annual', label: 'Annually', shortLabel: 'Annual' }
];

export interface EventCategoryOption {
  id: AlmanacCategory;
  label: string;
  color: string;
  badge: string;
}

export const DEFAULT_EVENT_CATEGORY: EventCategoryOption = {
  id: 'household',
  label: 'Household',
  color: 'bg-indigo-600 text-white',
  badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
};

export const EVENT_CATEGORIES: readonly EventCategoryOption[] = [
  DEFAULT_EVENT_CATEGORY,
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

export const formatAlmanacDateFriendly = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  return parseLocalDateKey(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

export interface AlmanacMutatePayload {
  nextEvents?: AlmanacEvent[];
  upserts?: AlmanacEvent[];
  deleteIds?: string[];
}

export interface AlmanacEventModalProps {
  mode: 'add' | 'edit';
  editingEvent: AlmanacEvent | null;
  selectedDate: string;
  activeProfile: PublicProfile;
  profiles: PublicProfile[];
  partner1Name: string;
  partner2Name: string;
  almanacEvents: AlmanacEvent[];
  onMutateEvents: (payload: AlmanacMutatePayload, toastText?: string) => Promise<boolean>;
  onSaved: (targetDate: string) => void;
  onClose: () => void;
  showToast?: ShowToastFn | undefined;
}

function getDaysInMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

function formatDateKeyParts(year: number, month1Based: number, day: number): string {
  return `${year}-${String(month1Based).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function pruneOrphanSkippedDates(
  rawSkips: readonly string[] | undefined,
  candidate: {
    date: string;
    recurrence: AlmanacRecurrence;
    untilDate?: string | undefined;
  },
  minExclusiveDate?: string
): string[] {
  if (!Array.isArray(rawSkips) || rawSkips.length === 0 || candidate.recurrence === 'none') {
    return [];
  }
  const unique = new Set<string>();
  for (const d of rawSkips) {
    if (!VALID_DATE_KEY_RE.test(d)) continue;
    if (d < candidate.date) continue;
    if (minExclusiveDate && d <= minExclusiveDate) continue;
    if (candidate.untilDate && d > candidate.untilDate) continue;
    if (
      doesAlmanacEventOccurOnDate(
        {
          date: candidate.date,
          recurrence: candidate.recurrence,
          untilDate: candidate.untilDate,
          skippedDates: []
        },
        d
      )
    ) {
      unique.add(d);
    }
  }
  return Array.from(unique).sort();
}

function makeEventId(suffix = ''): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `evt-${Date.now()}-${rand}${suffix ? `-${suffix}` : ''}`;
}

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
  onSaved,
  onClose,
  showToast
}: AlmanacEventModalProps) {
  const editTarget = mode === 'edit' ? editingEvent : null;
  const editingEventId = editTarget ? editTarget.id : null;
  const wasRecurring = Boolean(editTarget?.recurrence && editTarget.recurrence !== 'none');
  const canLinkGpReport = Boolean(activeProfile?.allowedApps?.includes('floodgate'));
  const isNonPartner2 = activeProfile.id !== 'partner2';

  const titleInputId = useId();
  const dateInputId = useId();
  const timeInputId = useId();
  const assignedToInputId = useId();
  const categoryGroupId = useId();
  const recurrenceGroupId = useId();
  const notesInputId = useId();
  const gpLinkInputId = useId();

  const [repeatEditScope, setRepeatEditScope] = useState<'single' | 'future'>('single');
  const [titleInput, setTitleInput] = useState(() => (editTarget ? editTarget.title || '' : ''));
  const [dateInput, setDateInput] = useState(() =>
    editTarget ? (wasRecurring ? selectedDate : editTarget.date || selectedDate) : selectedDate
  );
  const [timeInput, setTimeInput] = useState(() =>
    editTarget ? (editTarget.time ?? '') : '10:00'
  );
  const [categoryInput, setCategoryInput] = useState<AlmanacCategory>(() =>
    editTarget?.category || 'household'
  );
  const [recurrenceInput, setRecurrenceInput] = useState<AlmanacRecurrence>(() =>
    editTarget ? (wasRecurring ? 'none' : editTarget.recurrence || 'none') : 'none'
  );
  const [assignedToInput, setAssignedToInput] = useState(() =>
    editTarget ? editTarget.assignedTo || 'Both' : 'Both'
  );
  const [notesInput, setNotesInput] = useState(() => (editTarget ? editTarget.notes || '' : ''));
  const [linkGpReportInput, setLinkGpReportInput] = useState(() =>
    editTarget ? Boolean(editTarget.linkToGpReport) : false
  );
  const [gpLinkManual, setGpLinkManual] = useState(false);
  const [formError, setFormError] = useState('');
  const [privacyHint, setPrivacyHint] = useState('');
  const { isPending: isSaving, runLocked } = useActionLock();

  const isEditingRecurringSingle = Boolean(
    editingEventId && wasRecurring && repeatEditScope === 'single'
  );
  const isMedicalCategory = categoryInput === 'medical';

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedTitle = titleInput.trim();
    if (!trimmedTitle) {
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

    const resolvedGpLink = canLinkGpReport ? Boolean(linkGpReportInput) : false;
    const assignedToProfileId = inferProfileIdFromName(profiles, assignedToInput);

    // SEC-13: Prevent Partner 1 (or non-Partner 2) from saving medical/GP events assigned to Partner 2
    if (
      isNonPartner2 &&
      (resolvedGpLink || (categoryInput === 'medical' && assignedToProfileId === 'partner2'))
    ) {
      const msg = `GP / Health events for ${partner2Name} are private to ${partner2Name}'s profile and cannot be saved from ${activeProfile.name}'s profile.`;
      setFormError(msg);
      showToast?.(msg, 'error');
      return;
    }

    setFormError('');
    const trimmedNotes = notesInput.trim();
    const nowIso = new Date().toISOString();

    await runLocked(async () => {
      try {
        let ok = true;
        const currentEvents = almanacEvents || [];

        if (!editingEventId || !editTarget) {
          const newEvt: AlmanacEvent = {
            id: makeEventId(),
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
            createdAt: nowIso
          };
          const next = [...currentEvents, newEvt];
          const msg =
            newEvt.recurrence !== 'none'
              ? `Added recurring (${newEvt.recurrence}) event "${newEvt.title}"`
              : `Added "${newEvt.title}" to Almanac`;
          ok = await onMutateEvents({ nextEvents: next, upserts: [newEvt] }, msg);
        } else {
          const existingParent =
            currentEvents.find((item) => item.id === editingEventId) || null;
          const baseEvent = existingParent || editTarget;

          if (wasRecurring && repeatEditScope === 'single') {
            const detachedEvt: AlmanacEvent = {
              id: makeEventId('s'),
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
              createdAt: nowIso
            };

            let modifiedParent: AlmanacEvent | null = null;
            const next = currentEvents.map((item) => {
              if (item.id !== editingEventId) return item;
              const parentRec = item.recurrence || 'none';
              const nextSkips = pruneOrphanSkippedDates(
                [...(item.skippedDates || []), selectedDate],
                {
                  date: item.date,
                  recurrence: parentRec,
                  untilDate: item.untilDate
                }
              );
              modifiedParent = {
                ...item,
                skippedDates: nextSkips
              };
              return modifiedParent;
            });

            const nextWithDetached = [...next, detachedEvt];
            const msg = `Updated "${detachedEvt.title}" for ${targetDate} only`;
            ok = await onMutateEvents(
              {
                nextEvents: nextWithDetached,
                upserts: modifiedParent ? [modifiedParent, detachedEvt] : [detachedEvt]
              },
              msg
            );
          } else if (
            wasRecurring &&
            repeatEditScope === 'future' &&
            selectedDate > baseEvent.date
          ) {
            // Split strictly at selectedDate so past occurrences before selectedDate are never mutated,
            // even if targetDate was moved backwards before selectedDate or before baseEvent.date.
            const prevDateStr = shiftDateKey(selectedDate, -1);
            const parentUntil =
              baseEvent.untilDate && baseEvent.untilDate >= baseEvent.date
                ? baseEvent.untilDate < prevDateStr
                  ? baseEvent.untilDate
                  : prevDateStr
                : prevDateStr;
            const safeParentUntil = parentUntil >= baseEvent.date ? parentUntil : baseEvent.date;
            const parentRec: AlmanacRecurrence = baseEvent.recurrence || 'none';

            let cappedParent: AlmanacEvent | null = null;
            const next = existingParent
              ? currentEvents.map((item) => {
                  if (item.id !== editingEventId) return item;
                  const prunedParentSkips = pruneOrphanSkippedDates(item.skippedDates, {
                    date: item.date,
                    recurrence: parentRec,
                    untilDate: safeParentUntil
                  });
                  cappedParent = {
                    ...item,
                    untilDate: safeParentUntil,
                    skippedDates: prunedParentSkips
                  };
                  return cappedParent;
                })
              : [...currentEvents];

            const nextRecurrence: AlmanacRecurrence = recurrenceInput || 'none';
            const rawParentUntil =
              baseEvent.untilDate && baseEvent.untilDate >= baseEvent.date
                ? baseEvent.untilDate
                : undefined;

            // Preserve original month-end / leap-day anchor when splitting on a clamped date (e.g. Feb 28 from Jan 31)
            const [, parentMonth = 1, parentDay = 1] =
              baseEvent.date.split('-').map(Number);
            const [selYear = 1970, selMonth = 1, selDay = 1] =
              selectedDate.split('-').map(Number);

            const isUnchangedDate = targetDate === selectedDate;
            const isMonthlyClamped =
              isUnchangedDate &&
              nextRecurrence === 'monthly' &&
              parentRec === 'monthly' &&
              parentDay > selDay &&
              selDay === getDaysInMonth(selYear, selMonth);
            const isAnnualLeapClamped =
              isUnchangedDate &&
              nextRecurrence === 'annual' &&
              parentRec === 'annual' &&
              parentMonth === 2 &&
              parentDay === 29 &&
              selMonth === 2 &&
              selDay === 28;

            const upserts: AlmanacEvent[] = cappedParent ? [cappedParent] : [];
            const addedEvents: AlmanacEvent[] = [];

            if (isMonthlyClamped || isAnnualLeapClamped) {
              const detachedDates: string[] = [selectedDate];
              let futureAnchorDate: string | null = null;

              if (isMonthlyClamped) {
                const nextMonth = selMonth === 12 ? 1 : selMonth + 1;
                const nextYear = selMonth === 12 ? selYear + 1 : selYear;
                const nextDay = Math.min(getDaysInMonth(nextYear, nextMonth), parentDay);
                futureAnchorDate = formatDateKeyParts(nextYear, nextMonth, nextDay);
              } else {
                // Find next leap year Feb 29, emitting non-leap Feb 28 occurrences in between
                for (let yr = selYear + 1; yr <= selYear + 8; yr++) {
                  if (getDaysInMonth(yr, 2) === 29) {
                    futureAnchorDate = formatDateKeyParts(yr, 2, 29);
                    break;
                  }
                  const candidateFeb28 = formatDateKeyParts(yr, 2, 28);
                  if (rawParentUntil && candidateFeb28 > rawParentUntil) break;
                  if (!(baseEvent.skippedDates || []).includes(candidateFeb28)) {
                    detachedDates.push(candidateFeb28);
                  }
                }
              }

              detachedDates.forEach((dKey, idx) => {
                if (rawParentUntil && dKey > rawParentUntil) return;
                const singleEvt: AlmanacEvent = {
                  id: makeEventId(`d${idx}`),
                  title: trimmedTitle,
                  date: dKey,
                  time: timeInput,
                  category: categoryInput,
                  recurrence: 'none',
                  skippedDates: [],
                  assignedTo: assignedToInput,
                  assignedToProfileId,
                  notes: trimmedNotes,
                  linkToGpReport: resolvedGpLink,
                  createdAt: nowIso
                };
                upserts.push(singleEvt);
                addedEvents.push(singleEvt);
              });

              if (futureAnchorDate && (!rawParentUntil || rawParentUntil >= futureAnchorDate)) {
                const validUntil =
                  rawParentUntil && rawParentUntil >= futureAnchorDate ? rawParentUntil : undefined;
                const preservedSkips = pruneOrphanSkippedDates(
                  baseEvent.skippedDates,
                  {
                    date: futureAnchorDate,
                    recurrence: nextRecurrence,
                    untilDate: validUntil
                  },
                  selectedDate
                );
                const futureSeriesEvt: AlmanacEvent = {
                  id: makeEventId('f'),
                  title: trimmedTitle,
                  date: futureAnchorDate,
                  time: timeInput,
                  category: categoryInput,
                  recurrence: nextRecurrence,
                  skippedDates: preservedSkips,
                  ...(validUntil ? { untilDate: validUntil } : {}),
                  assignedTo: assignedToInput,
                  assignedToProfileId,
                  notes: trimmedNotes,
                  linkToGpReport: resolvedGpLink,
                  createdAt: nowIso
                };
                upserts.push(futureSeriesEvt);
                addedEvents.push(futureSeriesEvt);
              }
            } else {
              const validUntil =
                nextRecurrence !== 'none' && rawParentUntil && rawParentUntil >= targetDate
                  ? rawParentUntil
                  : undefined;
              const preservedSkips =
                nextRecurrence !== 'none' && nextRecurrence === parentRec
                  ? pruneOrphanSkippedDates(
                      (baseEvent.skippedDates || []).filter((d) => d !== targetDate),
                      {
                        date: targetDate,
                        recurrence: nextRecurrence,
                        untilDate: validUntil
                      },
                      selectedDate
                    )
                  : [];

              const futureSeriesEvt: AlmanacEvent = {
                id: makeEventId('f'),
                title: trimmedTitle,
                date: targetDate,
                time: timeInput,
                category: categoryInput,
                recurrence: nextRecurrence,
                skippedDates: preservedSkips,
                ...(validUntil ? { untilDate: validUntil } : {}),
                assignedTo: assignedToInput,
                assignedToProfileId,
                notes: trimmedNotes,
                linkToGpReport: resolvedGpLink,
                createdAt: nowIso
              };
              upserts.push(futureSeriesEvt);
              addedEvents.push(futureSeriesEvt);
            }

            const nextWithFuture = [...next, ...addedEvents];
            const msg = `Updated "${trimmedTitle}" from ${targetDate} onwards (past events preserved)`;
            ok = await onMutateEvents(
              {
                nextEvents: nextWithFuture,
                upserts
              },
              msg
            );
          } else {
            const nextRecurrence: AlmanacRecurrence = recurrenceInput || 'none';
            const candidateUntil =
              nextRecurrence !== 'none' &&
              baseEvent.untilDate &&
              baseEvent.untilDate >= targetDate
                ? baseEvent.untilDate
                : undefined;
            const prunedSkips =
              nextRecurrence !== 'none' && nextRecurrence === (baseEvent.recurrence || 'none')
                ? pruneOrphanSkippedDates(
                    (baseEvent.skippedDates || []).filter((d) => d !== targetDate),
                    {
                      date: targetDate,
                      recurrence: nextRecurrence,
                      untilDate: candidateUntil
                    }
                  )
                : [];

            const updatedEvt: AlmanacEvent = {
              ...baseEvent,
              id: editingEventId,
              title: trimmedTitle,
              date: targetDate,
              time: timeInput,
              category: categoryInput,
              recurrence: nextRecurrence,
              skippedDates: prunedSkips,
              assignedTo: assignedToInput,
              assignedToProfileId,
              notes: trimmedNotes,
              linkToGpReport: resolvedGpLink
            };
            if (candidateUntil) {
              updatedEvt.untilDate = candidateUntil;
            } else {
              delete updatedEvt.untilDate;
            }

            const next = existingParent
              ? currentEvents.map((item) => (item.id === editingEventId ? updatedEvt : item))
              : [...currentEvents, updatedEvt];
            const msg = `Updated "${updatedEvt.title}"`;
            ok = await onMutateEvents({ nextEvents: next, upserts: [updatedEvt] }, msg);
          }
        }

        if (ok !== false) {
          onSaved(targetDate);
        }
      } catch (err) {
        const errMsg =
          err instanceof Error && err.message
            ? err.message
            : 'Could not save calendar event';
        setFormError(errMsg);
        showToast?.(errMsg, 'error');
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
        {editingEventId && editTarget && wasRecurring && (
          <div className="p-3 rounded-2xl border border-indigo-500/25 bg-indigo-500/10 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Repeating Event — Apply Changes To:
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {(
                [
                  {
                    id: 'single',
                    label: `This occurrence only (${selectedDate})`,
                    desc: 'Updates only this date; keeps past & future dates unchanged'
                  },
                  {
                    id: 'future',
                    label: 'This & future occurrences',
                    desc:
                      selectedDate > editTarget.date
                        ? 'Preserves past occurrences and updates from this date onwards'
                        : 'Updates the repeating series from this date onwards'
                  }
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={repeatEditScope === opt.id}
                  onClick={() => {
                    setRepeatEditScope(opt.id);
                    if (opt.id === 'single') {
                      setRecurrenceInput('none');
                    } else if (editTarget?.recurrence) {
                      setRecurrenceInput(editTarget.recurrence);
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
          <label
            htmlFor={titleInputId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
          >
            Event Title
          </label>
          <input
            id={titleInputId}
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
            <label
              htmlFor={dateInputId}
              className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
            >
              Date
            </label>
            <input
              id={dateInputId}
              type="date"
              required
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className={getFieldClass('indigo', 'min-w-0')}
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor={timeInputId}
              className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
            >
              Time
            </label>
            <input
              id={timeInputId}
              type="time"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              className={getFieldClass('indigo', 'min-w-0')}
            />
          </div>
          <div className="sm:col-span-2 min-w-0">
            <label
              htmlFor={assignedToInputId}
              className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
            >
              For Who?
            </label>
            <select
              id={assignedToInputId}
              value={assignedToInput}
              onChange={(e) => {
                const nextAssignee = e.target.value;
                setAssignedToInput(nextAssignee);
                setPrivacyHint('');
                if (formError) setFormError('');
                if (
                  !editingEventId &&
                  !gpLinkManual &&
                  categoryInput === 'medical' &&
                  canLinkGpReport
                ) {
                  setLinkGpReportInput(
                    inferProfileIdFromName(profiles, nextAssignee) === 'partner2'
                  );
                }
              }}
              className={getFieldClass('indigo', 'min-w-0')}
            >
              <option value="Both">
                Both ({partner1Name} &amp; {partner2Name})
              </option>
              <option value={partner1Name}>{partner1Name}</option>
              <option value={partner2Name} disabled={isNonPartner2 && isMedicalCategory}>
                {isNonPartner2 && isMedicalCategory
                  ? `${partner2Name} (Private to ${partner2Name})`
                  : partner2Name}
              </option>
              <option value="Pets">Pets</option>
              {!['Both', partner1Name, partner2Name, 'Pets'].includes(assignedToInput) &&
                assignedToInput && <option value={assignedToInput}>{assignedToInput}</option>}
            </select>
            {isNonPartner2 && (isMedicalCategory || privacyHint) && (
              <p className="text-xs text-text-muted mt-1">
                {privacyHint ||
                  `GP / Health events for ${partner2Name} are private to ${partner2Name}'s profile.`}
              </p>
            )}
          </div>
        </div>

        <div>
          <span
            id={categoryGroupId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
          >
            Category
          </span>
          <div role="group" aria-labelledby={categoryGroupId} className="flex flex-wrap gap-1.5">
            {EVENT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                aria-pressed={categoryInput === cat.id}
                onClick={() => {
                  setCategoryInput(cat.id);
                  if (formError) setFormError('');
                  if (
                    isNonPartner2 &&
                    cat.id === 'medical' &&
                    inferProfileIdFromName(profiles, assignedToInput) === 'partner2'
                  ) {
                    const fallbackAssignee =
                      activeProfile.id === 'partner1' ? partner1Name : 'Both';
                    setAssignedToInput(fallbackAssignee);
                    setPrivacyHint(
                      `Reassigned to ${fallbackAssignee} — GP / Health events for ${partner2Name} are private to ${partner2Name}'s profile.`
                    );
                  } else {
                    setPrivacyHint('');
                  }
                  if (!editingEventId && cat.id === 'bins' && recurrenceInput === 'none') {
                    setRecurrenceInput('weekly');
                  }
                  if (!editingEventId && !gpLinkManual && canLinkGpReport) {
                    if (cat.id === 'medical') {
                      setLinkGpReportInput(
                        inferProfileIdFromName(profiles, assignedToInput) === 'partner2'
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
          <span
            id={recurrenceGroupId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
          >
            Repeat / Recurrence
          </span>
          <div role="group" aria-labelledby={recurrenceGroupId} className="flex flex-wrap gap-1.5">
            {RECURRENCE_OPTIONS.map((rec) => (
              <button
                key={rec.id}
                type="button"
                aria-pressed={recurrenceInput === rec.id}
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
          <label
            htmlFor={notesInputId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
          >
            Notes (Optional)
          </label>
          <textarea
            id={notesInputId}
            rows={2}
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            placeholder="Extra details or preparation reminders..."
            className={getFieldClass('indigo', 'min-w-0')}
          />
        </div>

        {canLinkGpReport && (
          <label
            htmlFor={gpLinkInputId}
            className="min-h-[40px] flex items-center gap-2 text-xs font-semibold cursor-pointer pt-1"
          >
            <input
              id={gpLinkInputId}
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
