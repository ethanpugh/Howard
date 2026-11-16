import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit3,
  Trash2,
  Cat,
  Flower2,
  Heart,
  Stethoscope,
  Wallet,
  Clock,
  Layers,
  Repeat,
  X
} from 'lucide-react';
import { doesLedgerItemOccurOnDate } from './LedgerApp.jsx';
import { computeBloomSummary } from './BloomApp.jsx';

const getTodayStr = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDateFriendly = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const RECURRENCE_OPTIONS = [
  { id: 'none', label: 'One-off', shortLabel: '' },
  { id: 'weekly', label: 'Weekly (Every 7d)', shortLabel: 'Weekly' },
  { id: 'fortnightly', label: 'Fortnightly (Every 14d)', shortLabel: 'Fortnightly' },
  { id: 'monthly', label: 'Monthly', shortLabel: 'Monthly' },
  { id: 'annual', label: 'Annually', shortLabel: 'Annual' }
];

const getPreviousDateStr = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  const py = dt.getFullYear();
  const pm = String(dt.getMonth() + 1).padStart(2, '0');
  const pd = String(dt.getDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
};

// Determine whether an Almanac event (one-off or recurring) occurs on targetDateStr ('YYYY-MM-DD')
export const doesAlmanacEventOccurOnDate = (evt, targetDateStr) => {
  if (!evt || !evt.date || !targetDateStr) return false;
  if (targetDateStr < evt.date) return false;
  if (evt.untilDate && targetDateStr > evt.untilDate) return false;
  if (Array.isArray(evt.skippedDates) && evt.skippedDates.includes(targetDateStr)) {
    return false;
  }

  const rec = evt.recurrence || 'none';
  if (rec === 'none') {
    return evt.date === targetDateStr;
  }

  const [sy, sm, sd] = evt.date.split('-').map(Number);
  const [ty, tm, td] = targetDateStr.split('-').map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const targetUtc = Date.UTC(ty, tm - 1, td);
  const diffDays = Math.round((targetUtc - startUtc) / 86400000);

  if (diffDays < 0) return false;
  if (rec === 'weekly') return diffDays % 7 === 0;
  if (rec === 'fortnightly') return diffDays % 14 === 0;
  if (rec === 'monthly') {
    const maxDayInTargetMonth = new Date(ty, tm, 0).getDate();
    const clampedDay = Math.min(maxDayInTargetMonth, sd);
    return td === clampedDay;
  }
  if (rec === 'annual') {
    const maxDayInTargetMonth = new Date(ty, tm, 0).getDate();
    const clampedDay = Math.min(maxDayInTargetMonth, sd);
    return sm === tm && td === clampedDay;
  }
  return evt.date === targetDateStr;
};

const EVENT_CATEGORIES = [
  { id: 'household', label: 'Household', color: 'bg-indigo-600 text-white', badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' },
  { id: 'pet', label: 'Pet / Vet', color: 'bg-teal-600 text-white', badge: 'bg-teal-500/15 text-teal-700 dark:text-teal-300' },
  { id: 'medical', label: 'GP / Health', color: 'bg-rose-600 text-white', badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  { id: 'bins', label: 'Bins / Utilities', color: 'bg-amber-600 text-white', badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  { id: 'social', label: 'Holiday / Social', color: 'bg-purple-600 text-white', badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300' }
];

export default function AlmanacApp({
  activeProfile,
  profiles,
  darkMode,
  almanacEvents,
  cadenceSnapshot,
  bloomSnapshot,
  floodgateSnapshot,
  ledgerData,
  initialDate,
  onSaveEvents,
  onOpenFloodgate,
  onNavigateApp
}) {
  const todayStr = getTodayStr();
  const partner1Name = (profiles || []).find((p) => p.id === 'partner1')?.name || 'Partner 1';
  const partner2Name = (profiles || []).find((p) => p.id === 'partner2')?.name || 'Partner 2';
  const [selectedDate, setSelectedDate] = useState(initialDate || todayStr);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      const [iy, im] = initialDate.split('-').map(Number);
      return { year: iy, month: im - 1 };
    }
    const base = new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  useEffect(() => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      setSelectedDate(initialDate);
      const [y, m] = initialDate.split('-').map(Number);
      setCalendarMonth({ year: y, month: m - 1 });
    }
  }, [initialDate]);

  // Overlay Toggles
  const [showCadenceLayer, setShowCadenceLayer] = useState(true);
  const [showBloomLayer, setShowBloomLayer] = useState(true);
  const [showLedgerLayer, setShowLedgerLayer] = useState(true);
  const [showFloodgateLayer, setShowFloodgateLayer] = useState(
    activeProfile.id === 'partner2'
  );

  // Add / Edit Event Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editingEventOriginal, setEditingEventOriginal] = useState(null);
  const [repeatEditScope, setRepeatEditScope] = useState('single'); // 'single' | 'future'
  const [titleInput, setTitleInput] = useState('');
  const [dateInput, setDateInput] = useState(selectedDate);
  const [timeInput, setTimeInput] = useState('10:00');
  const [categoryInput, setCategoryInput] = useState('household');
  const [recurrenceInput, setRecurrenceInput] = useState('none');
  const [assignedToInput, setAssignedToInput] = useState('Both');
  const [notesInput, setNotesInput] = useState('');
  const [linkGpReportInput, setLinkGpReportInput] = useState(false);

  const catName = cadenceSnapshot?.settings?.catName || 'Pet';
  const bloomSummary = useMemo(
    () => computeBloomSummary(bloomSnapshot),
    [bloomSnapshot]
  );
  const mantisName = bloomSummary.settings.mantisName || 'Mantis';

  // Calculate projected bottle expiry date for calendar overlay
  const bottleExpiryDateStr = useMemo(() => {
    const opened = cadenceSnapshot?.settings?.bottleOpenedDate;
    const shelf = Number(cadenceSnapshot?.settings?.bottleShelfLifeDays) || 180;
    if (!opened || !/^\d{4}-\d{2}-\d{2}$/.test(opened)) return null;
    const [y, m, d] = opened.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + shelf);
    const ey = dt.getFullYear();
    const em = String(dt.getMonth() + 1).padStart(2, '0');
    const ed = String(dt.getDate()).padStart(2, '0');
    return `${ey}-${em}-${ed}`;
  }, [cadenceSnapshot?.settings]);

  // Map Ledger recurring Direct Debits, Subscriptions & Paydays for a specific date ('YYYY-MM-DD')
  const getLedgerItemsForDate = useMemo(() => {
    const activeRec = (ledgerData?.recurring || []).filter((r) => r.active !== false);
    const allIncomes = ledgerData?.incomes || [];
    return (dateStr) => {
      const items = [];
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

  // Build Monthly Calendar Cells (Monday-first)
  const calendarCells = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const dateStr = `${year}-${mStr}-${dStr}`;

      const dayEvents = (almanacEvents || []).filter(
        (e) =>
          doesAlmanacEventOccurOnDate(e, dateStr) &&
          !(
            activeProfile.id !== 'partner2' &&
            (e.linkToGpReport || (e.category === 'medical' && e.assignedTo === 'Partner 2'))
          )
      );
      const cadenceLog = cadenceSnapshot?.logsByDate?.[dateStr] || null;
      const bloomLog = bloomSnapshot?.logsByDate?.[dateStr] || null;
      const bloomMoltsOnDay = (bloomSnapshot?.molts || []).filter((m) => m.dateKey === dateStr);
      const isProjectedMolt = bloomSummary.projectedNextMoltDateStr === dateStr;
      const floodgateLog =
        activeProfile.allowedApps.includes('floodgate')
          ? floodgateSnapshot?.logsByDate?.[dateStr] || null
          : null;
      const ledgerDue = getLedgerItemsForDate(dateStr);
      const isBottleExpiry = bottleExpiryDateStr === dateStr;

      cells.push({
        dayNumber: d,
        dateStr,
        dayEvents,
        cadenceLog,
        bloomLog,
        bloomMoltsOnDay,
        isProjectedMolt,
        floodgateLog,
        ledgerDue,
        isBottleExpiry
      });
    }
    return cells;
  }, [
    calendarMonth,
    almanacEvents,
    cadenceSnapshot,
    bloomSnapshot,
    bloomSummary.projectedNextMoltDateStr,
    floodgateSnapshot,
    getLedgerItemsForDate,
    bottleExpiryDateStr,
    activeProfile
  ]);

  const selectedCellData = useMemo(() => {
    const dayEvents = (almanacEvents || []).filter(
      (e) =>
        doesAlmanacEventOccurOnDate(e, selectedDate) &&
        !(
          activeProfile.id !== 'partner2' &&
          (e.linkToGpReport || (e.category === 'medical' && e.assignedTo === 'Partner 2'))
        )
    );
    const cadenceLog = cadenceSnapshot?.logsByDate?.[selectedDate] || null;
    const bloomLog = bloomSnapshot?.logsByDate?.[selectedDate] || null;
    const bloomMoltsOnDay = (bloomSnapshot?.molts || []).filter(
      (m) => m.dateKey === selectedDate
    );
    const isProjectedMolt = bloomSummary.projectedNextMoltDateStr === selectedDate;
    const floodgateLog =
      activeProfile.allowedApps.includes('floodgate')
        ? floodgateSnapshot?.logsByDate?.[selectedDate] || null
        : null;
    const ledgerDue = getLedgerItemsForDate(selectedDate);
    const isBottleExpiry = bottleExpiryDateStr === selectedDate;
    return {
      dayEvents,
      cadenceLog,
      bloomLog,
      bloomMoltsOnDay,
      isProjectedMolt,
      floodgateLog,
      ledgerDue,
      isBottleExpiry
    };
  }, [
    selectedDate,
    almanacEvents,
    cadenceSnapshot,
    bloomSnapshot,
    bloomSummary.projectedNextMoltDateStr,
    floodgateSnapshot,
    getLedgerItemsForDate,
    bottleExpiryDateStr,
    activeProfile
  ]);

  const openAddEventModal = () => {
    setEditingEventId(null);
    setEditingEventOriginal(null);
    setRepeatEditScope('single');
    setTitleInput('');
    setDateInput(selectedDate);
    setTimeInput('10:00');
    setCategoryInput('household');
    setRecurrenceInput('none');
    setAssignedToInput('Both');
    setNotesInput('');
    setLinkGpReportInput(false);
    setAddModalOpen(true);
  };

  const openEditEventModal = (evt) => {
    const isRec = Boolean(evt.recurrence && evt.recurrence !== 'none');
    setEditingEventId(evt.id);
    setEditingEventOriginal(evt);
    setRepeatEditScope('single');
    setTitleInput(evt.title || '');
    setDateInput(isRec ? selectedDate : evt.date || selectedDate);
    setTimeInput(evt.time || '10:00');
    setCategoryInput(evt.category || 'household');
    setRecurrenceInput(evt.recurrence || 'none');
    setAssignedToInput(evt.assignedTo || 'Both');
    setNotesInput(evt.notes || '');
    setLinkGpReportInput(Boolean(evt.linkToGpReport));
    setAddModalOpen(true);
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!titleInput.trim()) return;
    const targetDate = dateInput || selectedDate;

    if (!editingEventId) {
      const newEvt = {
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: titleInput.trim(),
        date: targetDate,
        time: timeInput,
        category: categoryInput,
        recurrence: recurrenceInput || 'none',
        skippedDates: [],
        assignedTo: assignedToInput,
        notes: notesInput.trim(),
        linkToGpReport: Boolean(linkGpReportInput || categoryInput === 'medical'),
        createdAt: new Date().toISOString()
      };
      const next = [...(almanacEvents || []), newEvt];
      await onSaveEvents(
        next,
        newEvt.recurrence !== 'none'
          ? `Added recurring (${newEvt.recurrence}) event "${newEvt.title}"`
          : `Added "${newEvt.title}" to Almanac`
      );
    } else {
      const wasRecurring = Boolean(
        editingEventOriginal?.recurrence && editingEventOriginal.recurrence !== 'none'
      );

      if (wasRecurring && repeatEditScope === 'single') {
        // Detach only this occurrence via skippedDates, preserving all past and future occurrences
        const detachedEvt = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: titleInput.trim(),
          date: targetDate,
          time: timeInput,
          category: categoryInput,
          recurrence: 'none',
          skippedDates: [],
          assignedTo: assignedToInput,
          notes: notesInput.trim(),
          linkToGpReport: Boolean(linkGpReportInput || categoryInput === 'medical'),
          createdAt: new Date().toISOString()
        };
        const next = (almanacEvents || []).map((item) => {
          if (item.id !== editingEventId) return item;
          const existingSkipped = Array.isArray(item.skippedDates) ? item.skippedDates : [];
          return {
            ...item,
            skippedDates: Array.from(new Set([...existingSkipped, selectedDate]))
          };
        });
        await onSaveEvents(
          [...next, detachedEvt],
          `Updated "${detachedEvt.title}" for ${targetDate} only`
        );
      } else if (wasRecurring && selectedDate > editingEventOriginal.date) {
        // Edit this & future occurrences while preserving past occurrences prior to selectedDate
        const prevDateStr = getPreviousDateStr(selectedDate);
        const futureSeriesEvt = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: titleInput.trim(),
          date: targetDate,
          time: timeInput,
          category: categoryInput,
          recurrence: recurrenceInput || 'none',
          skippedDates: (editingEventOriginal.skippedDates || []).filter(
            (d) => d > selectedDate
          ),
          ...(editingEventOriginal.untilDate && editingEventOriginal.untilDate >= targetDate
            ? { untilDate: editingEventOriginal.untilDate }
            : {}),
          assignedTo: assignedToInput,
          notes: notesInput.trim(),
          linkToGpReport: Boolean(linkGpReportInput || categoryInput === 'medical'),
          createdAt: new Date().toISOString()
        };
        const next = (almanacEvents || []).map((item) =>
          item.id === editingEventId ? { ...item, untilDate: prevDateStr } : item
        );
        await onSaveEvents(
          [...next, futureSeriesEvt],
          `Updated "${futureSeriesEvt.title}" from ${targetDate} onwards (past events preserved)`
        );
      } else {
        // One-off event OR editing on the first date of a recurring series
        const updatedEvt = {
          ...editingEventOriginal,
          id: editingEventId,
          title: titleInput.trim(),
          date: targetDate,
          time: timeInput,
          category: categoryInput,
          recurrence: recurrenceInput || 'none',
          assignedTo: assignedToInput,
          notes: notesInput.trim(),
          linkToGpReport: Boolean(linkGpReportInput || categoryInput === 'medical')
        };
        const next = (almanacEvents || []).map((item) =>
          item.id === editingEventId ? updatedEvt : item
        );
        await onSaveEvents(next, `Updated "${updatedEvt.title}"`);
      }
    }

    setSelectedDate(targetDate);
    setAddModalOpen(false);
    setEditingEventId(null);
    setEditingEventOriginal(null);
  };

  const handleSkipSingleOccurrence = async (evtId, dateToSkip) => {
    const next = (almanacEvents || []).map((e) => {
      if (e.id !== evtId) return e;
      const existingSkipped = Array.isArray(e.skippedDates) ? e.skippedDates : [];
      return {
        ...e,
        skippedDates: Array.from(new Set([...existingSkipped, dateToSkip]))
      };
    });
    await onSaveEvents(next, `Skipped occurrence on ${dateToSkip}`);
  };

  const handleDeleteEvent = async (id) => {
    const next = (almanacEvents || []).filter((e) => e.id !== id);
    await onSaveEvents(next, 'Removed event from Almanac');
  };

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      {/* ====================================================================
          TOP ALMANAC HEADER & OVERLAY LAYER TOGGLES
      ==================================================================== */}
      <section
        className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
              Almanac • Unified Household Calendar
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Household events cross-pollinated with {catName}&apos;s Cadence logs, {mantisName}&apos;s Bloom molts &amp; care, Ledger due dates
              {activeProfile.allowedApps.includes('floodgate') ? ', and Floodgate cycle logs' : ''}
            </p>
          </div>
        </div>

        {/* Layer Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mr-1">
            <Layers className="w-3.5 h-3.5" /> Layers:
          </span>

          <button
            type="button"
            onClick={() => setShowCadenceLayer(!showCadenceLayer)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer ${
              showCadenceLayer
                ? 'bg-emerald-600 text-white border-emerald-600'
                : darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-400'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}
          >
            <Cat className="w-3.5 h-3.5" />
            <span>Cadence</span>
          </button>

          <button
            type="button"
            onClick={() => setShowBloomLayer(!showBloomLayer)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer ${
              showBloomLayer
                ? 'bg-lime-600 text-white border-lime-600'
                : darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-400'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}
          >
            <Flower2 className="w-3.5 h-3.5" />
            <span>Bloom</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLedgerLayer(!showLedgerLayer)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer ${
              showLedgerLayer
                ? 'bg-amber-600 text-white border-amber-600'
                : darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-400'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Ledger</span>
          </button>

          {activeProfile.allowedApps.includes('floodgate') && (
            <button
              type="button"
              onClick={() => setShowFloodgateLayer(!showFloodgateLayer)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer ${
                showFloodgateLayer
                  ? 'bg-rose-600 text-white border-rose-600'
                  : darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-400'
                    : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}
            >
              <Heart className="w-3.5 h-3.5" />
              <span>Floodgate</span>
            </button>
          )}
        </div>
      </section>

      {/* ====================================================================
          CALENDAR GRID + DAY INSPECTOR SIDEBAR
      ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* 8-Column Monthly Grid */}
        <div
          className={`lg:col-span-8 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
          }`}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-extrabold">
                {new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString(
                  'en-GB',
                  { month: 'long', year: 'numeric' }
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select any date to inspect events, adherence, or add a reminder
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth((prev) => {
                    const d = new Date(prev.year, prev.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
                className={`p-2 rounded-xl border cursor-pointer ${
                  darkMode
                    ? 'border-slate-700 hover:bg-slate-800'
                    : 'border-slate-200 hover:bg-slate-100'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() });
                  setSelectedDate(todayStr);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth((prev) => {
                    const d = new Date(prev.year, prev.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
                className={`p-2 rounded-xl border cursor-pointer ${
                  darkMode
                    ? 'border-slate-700 hover:bg-slate-800'
                    : 'border-slate-200 hover:bg-slate-100'
                }`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold opacity-60 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {calendarCells.map((cell, idx) => {
              if (!cell) {
                return <div key={`empty-${idx}`} className="h-20 sm:h-24 rounded-2xl" />;
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
                floodgateLog?.bleedingSeverity &&
                floodgateLog.bleedingSeverity !== 'none';

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  className={`h-20 sm:h-24 p-1.5 sm:p-2 rounded-2xl border flex flex-col justify-between text-left transition relative cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-indigo-600 border-indigo-600 bg-indigo-500/10'
                      : darkMode
                        ? 'bg-slate-800/40 border-slate-800 hover:bg-slate-800'
                        : 'bg-slate-50/70 border-slate-200/70 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs font-extrabold w-6 h-6 rounded-full flex items-center justify-center ${
                        isToday ? 'bg-indigo-600 text-white' : ''
                      }`}
                    >
                      {dayNumber}
                    </span>

                    {/* Overlay Mini Dots */}
                    <div className="flex items-center gap-1">
                      {showCadenceLayer && (amDone || pmDone) && (
                        <span
                          className={`w-2 h-2 rounded-full ${
                            amDone && pmDone ? 'bg-emerald-500' : 'bg-amber-400'
                          }`}
                          title={`${catName}: ${amDone && pmDone ? 'AM & PM given' : '1 dose given'}`}
                        />
                      )}
                      {showBloomLayer && hasBloomActivity && (
                        <span
                          className="w-2 h-2 rounded-full bg-lime-500"
                          title={`${mantisName}: Care logged`}
                        />
                      )}
                      {showFloodgateLayer && hasFloodgateBleed && (
                        <span
                          className="w-2 h-2 rounded-full bg-rose-500"
                          title={`Floodgate: ${floodgateLog.bleedingSeverity}`}
                        />
                      )}
                      {showFloodgateLayer && floodgateLog?.hasClots && (
                        <span
                          className="w-2 h-2 rounded-full bg-purple-600"
                          title="Floodgate: Clots logged"
                        />
                      )}
                      {showLedgerLayer && ledgerDue.length > 0 && (
                        <span
                          className="w-2 h-2 rounded-full bg-amber-500"
                          title={`${ledgerDue.length} upkeep task(s) due`}
                        />
                      )}
                    </div>
                  </div>

                  {/* Event Pills inside cell */}
                  <div className="space-y-0.5 w-full overflow-hidden">
                    {dayEvents.slice(0, 2).map((evt) => {
                      const cat =
                        EVENT_CATEGORIES.find((c) => c.id === evt.category) ||
                        EVENT_CATEGORIES[0];
                      const isRec = evt.recurrence && evt.recurrence !== 'none';
                      return (
                        <div
                          key={evt.id}
                          className={`w-full text-[10px] font-bold px-1.5 py-0.5 rounded truncate ${cat.color}`}
                        >
                          {isRec ? '🔄 ' : ''}
                          {evt.title}
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <div className="text-[9px] font-bold opacity-70 pl-1">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                    {showCadenceLayer && isBottleExpiry && (
                      <div className="w-full text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500 text-slate-950 truncate">
                        🐾 Bottle Expiry
                      </div>
                    )}
                    {showBloomLayer &&
                      bloomMoltsOnDay.map((m) => (
                        <div
                          key={m.id}
                          className="w-full text-[9px] font-bold px-1 py-0.5 rounded bg-lime-600 text-white truncate"
                        >
                          🦋 {m.fromInstar}&rarr;{m.toInstar}
                        </div>
                      ))}
                    {showBloomLayer && isProjectedMolt && bloomMoltsOnDay.length === 0 && (
                      <div className="w-full text-[9px] font-bold px-1 py-0.5 rounded bg-lime-500/20 text-lime-800 dark:text-lime-200 truncate">
                        🌿 Est. Molt
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4-Column Selected Day Inspector */}
        <div
          className={`lg:col-span-4 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between space-y-4 ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/90'
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Selected Date
                </span>
                <h3 className="text-base font-extrabold">
                  {formatDateFriendly(selectedDate)}
                </h3>
              </div>
              <button
                type="button"
                onClick={openAddEventModal}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Event</span>
              </button>
            </div>

            {/* 1. Native Almanac Events for Selected Date */}
            <div className="space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider opacity-60">
                Scheduled Events ({selectedCellData.dayEvents.length})
              </div>
              {selectedCellData.dayEvents.length > 0 ? (
                selectedCellData.dayEvents.map((evt) => {
                  const cat =
                    EVENT_CATEGORIES.find((c) => c.id === evt.category) ||
                    EVENT_CATEGORIES[0];
                  const isRec = evt.recurrence && evt.recurrence !== 'none';
                  const recMeta = RECURRENCE_OPTIONS.find((r) => r.id === evt.recurrence);
                  return (
                    <div
                      key={evt.id}
                      className={`p-3.5 rounded-2xl border space-y-2 ${
                        darkMode
                          ? 'bg-slate-800/60 border-slate-700'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1 mb-1">
                            <span
                              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md ${cat.badge}`}
                            >
                              {cat.label} • {evt.assignedTo || 'Household'}
                            </span>
                            {isRec && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                <Repeat className="w-2.5 h-2.5" />
                                {recMeta?.shortLabel || evt.recurrence}
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-sm">{evt.title}</h4>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditEventModal(evt)}
                            className="p-1 text-slate-400 hover:text-indigo-500 cursor-pointer"
                            title="Edit event"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEvent(evt.id)}
                            className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                            title={isRec ? 'Delete entire recurring series' : 'Delete event'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {evt.time && (
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {evt.time}
                        </div>
                      )}
                      {evt.notes && <p className="text-xs opacity-80">{evt.notes}</p>}

                      {isRec && (
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 dark:border-slate-700 text-[11px]">
                          <button
                            type="button"
                            onClick={() =>
                              handleSkipSingleOccurrence(evt.id, selectedDate)
                            }
                            className="font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                          >
                            Skip this date only
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEvent(evt.id)}
                            className="font-semibold text-rose-500 hover:underline cursor-pointer"
                          >
                            Delete series
                          </button>
                        </div>
                      )}

                      {/* Deep link to Printable GP Report if medical event & Partner 2 is active */}
                      {evt.linkToGpReport &&
                        activeProfile.allowedApps.includes('floodgate') && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenFloodgate({ tab: 'insights', date: selectedDate })
                            }
                            className="w-full mt-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Stethoscope className="w-3.5 h-3.5" />
                            <span>Open Printable GP Symptom Report</span>
                          </button>
                        )}
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No household events scheduled on this date.
                </p>
              )}
            </div>

            {/* 2. Cadence Overlay Summary */}
            {showCadenceLayer && (
              <div
                className={`p-3.5 rounded-2xl border space-y-1.5 text-xs ${
                  darkMode
                    ? 'bg-slate-800/40 border-slate-800'
                    : 'bg-teal-50/50 border-teal-200/70'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-teal-700 dark:text-teal-300">
                  <span className="flex items-center gap-1.5">
                    <Cat className="w-3.5 h-3.5" /> {catName}&apos;s Medication
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateApp('cadence')}
                    className="underline text-[11px] cursor-pointer"
                  >
                    Open Cadence
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700">
                    <div className="font-bold">Morning</div>
                    <div className="text-[11px] opacity-80">
                      {selectedCellData.cadenceLog?.morning?.given
                        ? `✓ ${selectedCellData.cadenceLog.morning.givenBy}`
                        : 'Not logged'}
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700">
                    <div className="font-bold">Evening</div>
                    <div className="text-[11px] opacity-80">
                      {selectedCellData.cadenceLog?.evening?.given
                        ? `✓ ${selectedCellData.cadenceLog.evening.givenBy}`
                        : 'Not logged'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2B. Bloom Overlay Summary */}
            {showBloomLayer && (
              <div
                className={`p-3.5 rounded-2xl border space-y-1.5 text-xs ${
                  darkMode
                    ? 'bg-slate-800/40 border-slate-800'
                    : 'bg-lime-50/60 border-lime-200/70'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-lime-700 dark:text-lime-300">
                  <span className="flex items-center gap-1.5">
                    <Flower2 className="w-3.5 h-3.5" /> {mantisName}&apos;s Habitat (Bloom)
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateApp('bloom')}
                    className="underline text-[11px] cursor-pointer"
                  >
                    Open Bloom
                  </button>
                </div>

                {selectedCellData.bloomMoltsOnDay.length > 0 && (
                  <div className="p-2 rounded-xl bg-lime-600 text-white font-bold">
                    🎉 Molted:{' '}
                    {selectedCellData.bloomMoltsOnDay
                      .map((m) => `${m.fromInstar} → ${m.toInstar}`)
                      .join(', ')}
                  </div>
                )}

                {selectedCellData.isProjectedMolt &&
                  selectedCellData.bloomMoltsOnDay.length === 0 && (
                    <div className="p-2 rounded-xl bg-lime-500/15 border border-lime-500/30 font-semibold">
                      🌿 Projected next molt window (~{bloomSummary.avgInterMoltDays}d cycle)
                    </div>
                  )}

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700">
                    <div className="font-bold">Misting</div>
                    <div className="text-[11px] opacity-80">
                      {(selectedCellData.bloomLog?.mists || []).length > 0
                        ? `✓ ${selectedCellData.bloomLog.mists.length} mist(s)`
                        : 'None logged'}
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700">
                    <div className="font-bold">Feeding</div>
                    <div className="text-[11px] opacity-80">
                      {(selectedCellData.bloomLog?.feedings || []).length > 0
                        ? selectedCellData.bloomLog.feedings
                            .map((f) =>
                              f.outcome === 'refused'
                                ? 'Refused'
                                : `${f.count}× ${f.preyLabel?.split(' (')[0]}`
                            )
                            .join(', ')
                        : 'None logged'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Floodgate Overlay Summary (Partner 2 only) */}
            {showFloodgateLayer && activeProfile.allowedApps.includes('floodgate') && (
              <div
                className={`p-3.5 rounded-2xl border space-y-1.5 text-xs ${
                  darkMode
                    ? 'bg-stone-900/80 border-rose-950'
                    : 'bg-rose-50/50 border-rose-200/70'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-rose-700 dark:text-rose-300">
                  <span className="flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5" /> Floodgate Cycle Log
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenFloodgate({ tab: 'log', date: selectedDate })
                    }
                    className="underline text-[11px] cursor-pointer"
                  >
                    {selectedCellData.floodgateLog ? 'Edit Day' : 'Log Day'}
                  </button>
                </div>
                {selectedCellData.floodgateLog ? (
                  <div className="space-y-1 pt-1">
                    <div className="capitalize font-semibold">
                      Bleeding: {selectedCellData.floodgateLog.bleedingSeverity} • Pain:{' '}
                      {selectedCellData.floodgateLog.painScore}/10
                    </div>
                    {selectedCellData.floodgateLog.hasClots && (
                      <div className="text-purple-600 dark:text-purple-300 font-semibold">
                        Clots: {selectedCellData.floodgateLog.clotCount} passed
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="opacity-70">No symptom entry logged for this date.</div>
                )}
              </div>
            )}

            {/* 4. Ledger Bills & Paydays Overlay */}
            {showLedgerLayer && selectedCellData.ledgerDue.length > 0 && (
              <div
                className={`p-3.5 rounded-2xl border space-y-1.5 text-xs ${
                  darkMode
                    ? 'bg-amber-950/30 border-amber-800/60'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-amber-700 dark:text-amber-300">
                  <span>💷 Ledger Bills &amp; Paydays:</span>
                  <button
                    type="button"
                    onClick={() => onNavigateApp('ledger')}
                    className="underline text-[11px] cursor-pointer"
                  >
                    Open Ledger
                  </button>
                </div>
                {selectedCellData.ledgerDue.map((it) => (
                  <div key={it.id} className="flex items-center justify-between font-medium">
                    <span>
                      • {it.title} ({it.kind})
                    </span>
                    <span className="font-bold">£{Number(it.amount || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ADD / EDIT EVENT MODAL */}
      {addModalOpen && (
        <div
          onClick={() => {
            setAddModalOpen(false);
            setEditingEventId(null);
            setEditingEventOriginal(null);
          }}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl border space-y-3 sm:space-y-4 ${
              darkMode
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold">
                  {editingEventId ? 'Edit Almanac Event' : 'Add Almanac Event'}
                </h3>
                <p className="text-xs text-slate-500">
                  Date: {formatDateFriendly(dateInput || selectedDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAddModalOpen(false);
                  setEditingEventId(null);
                  setEditingEventOriginal(null);
                }}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-3">
              {editingEventId &&
                editingEventOriginal?.recurrence &&
                editingEventOriginal.recurrence !== 'none' && (
                  <div
                    className={`p-2.5 sm:p-3 rounded-2xl border space-y-1.5 ${
                      darkMode
                        ? 'bg-slate-800/60 border-slate-700'
                        : 'bg-indigo-50/60 border-indigo-200'
                    }`}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
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
                            selectedDate > editingEventOriginal.date
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
                            } else if (editingEventOriginal?.recurrence) {
                              setRecurrenceInput(editingEventOriginal.recurrence);
                            }
                          }}
                          className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                            repeatEditScope === opt.id
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : darkMode
                                ? 'bg-slate-900 border-slate-700 text-slate-300'
                                : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold leading-snug">{opt.label}</div>
                          <div
                            className={`text-[11px] leading-snug ${
                              repeatEditScope === opt.id ? 'text-indigo-100' : 'opacity-70'
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
                <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                  Event Title
                </label>
                <input
                  type="text"
                  required
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="e.g., Vet Booster, GP Consultation, Bin Collection..."
                  className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                    For Who?
                  </label>
                  <select
                    value={assignedToInput}
                    onChange={(e) => setAssignedToInput(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  >
                    <option value="Both">Both ({partner1Name} &amp; {partner2Name})</option>
                    <option value={partner1Name}>{partner1Name}</option>
                    <option value={partner2Name}>{partner2Name}</option>
                    <option value="Pets">Pets</option>
                    {!['Both', partner1Name, partner2Name, 'Pets'].includes(assignedToInput) &&
                      assignedToInput && (
                        <option value={assignedToInput}>{assignedToInput}</option>
                      )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                  Category
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {EVENT_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setCategoryInput(cat.id);
                        if (cat.id === 'bins' && recurrenceInput === 'none') {
                          setRecurrenceInput('weekly');
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                        categoryInput === cat.id
                          ? cat.color
                          : darkMode
                            ? 'bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                  Repeat / Recurrence
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {RECURRENCE_OPTIONS.map((rec) => (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={() => setRecurrenceInput(rec.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1 cursor-pointer ${
                        recurrenceInput === rec.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : darkMode
                            ? 'bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      {rec.id !== 'none' && <Repeat className="w-3 h-3" />}
                      <span>{rec.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Extra details or preparation reminders..."
                  className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              {activeProfile.allowedApps.includes('floodgate') && (
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={linkGpReportInput || categoryInput === 'medical'}
                    onChange={(e) => setLinkGpReportInput(e.target.checked)}
                    className="rounded accent-rose-600"
                  />
                  <span>Attach quick-launch button for Floodgate Printable GP Report</span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddModalOpen(false);
                    setEditingEventId(null);
                    setEditingEventOriginal(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {editingEventId ? 'Save Changes' : 'Save Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
