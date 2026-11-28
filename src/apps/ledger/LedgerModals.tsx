import React, { useId, useState } from 'react';
import { Landmark, Receipt, Repeat, TrendingUp, Zap } from 'lucide-react';
import type {
  LedgerData,
  LedgerItem,
  LedgerOwner,
  LedgerScheduleCycle
} from '../../../shared/schemas/ledger.ts';
import type { PublicProfile } from '../../../shared/schemas/profile.ts';
import type { ShowToastFn } from '../../App.tsx';
import { ModalShell, getFieldClass } from '../../components/HowardUI.tsx';
import { formatGBP, WEEKDAY_OPTIONS } from '../../utils/householdHelpers.ts';
import { useActionLock } from '../../hooks/useActionLock.ts';
import {
  EXPENSE_CATEGORIES,
  fromPence,
  type LedgerPerspective,
  type RecurringType,
  type SaveLedgerDataFn,
  type UpsertLedgerItemFn
} from './ledgerConstants.ts';

function readRawField(item: LedgerItem | null | undefined, key: string): unknown {
  if (!item || typeof item !== 'object') return undefined;
  return new Map<string, unknown>(Object.entries(item)).get(key);
}

function readDayField(
  item: LedgerItem | null | undefined,
  primary: number | string | undefined,
  fallback: number
): number | string {
  if (primary !== undefined && primary !== '') return primary;
  const legacy = readRawField(item, 'dueDayOfMonth');
  if (typeof legacy === 'number' || (typeof legacy === 'string' && legacy !== '')) {
    return legacy;
  }
  return fallback;
}

function readWeekdayField(
  item: LedgerItem | null | undefined,
  primary: number | string | undefined,
  fallback: number
): number | string {
  if (primary !== undefined && primary !== '') return primary;
  const legacy = readRawField(item, 'dueWeekday');
  if (typeof legacy === 'number' || (typeof legacy === 'string' && legacy !== '')) {
    return legacy;
  }
  return fallback;
}

function readAnchorDateField(
  item: LedgerItem | null | undefined,
  primary: string | undefined,
  dayFallback: number | string | undefined,
  todayStr: string,
  defaultDay: number
): string {
  if (primary) return primary;
  const legacyMonth = readRawField(item, 'dueMonth');
  const dayNum = Math.min(28, Math.max(1, Number(dayFallback) || defaultDay));
  if (typeof legacyMonth === 'number' && Number.isFinite(legacyMonth) && legacyMonth >= 1 && legacyMonth <= 12) {
    return `${todayStr.slice(0, 4)}-${String(Math.trunc(legacyMonth)).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  }
  if (typeof legacyMonth === 'string' && /^\d{1,2}$/.test(legacyMonth.trim())) {
    const mo = Math.min(12, Math.max(1, Number(legacyMonth.trim())));
    return `${todayStr.slice(0, 4)}-${String(mo).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  }
  return `${todayStr.slice(0, 4)}-01-${String(dayNum).padStart(2, '0')}`;
}

function stripLegacyScheduleKeys(target: object): void {
  Reflect.deleteProperty(target, 'dueDayOfMonth');
  Reflect.deleteProperty(target, 'dueWeekday');
  Reflect.deleteProperty(target, 'dueMonth');
}

interface ScheduleFieldsProps {
  cycle: LedgerScheduleCycle;
  onCycleChange: (cycle: LedgerScheduleCycle) => void;
  day: number | string;
  onDayChange: (day: string) => void;
  weekday: number | string;
  onWeekdayChange: (weekday: number) => void;
  anchorDate: string;
  onAnchorDateChange: (anchorDate: string) => void;
  cycleLabel: string;
  weeklyDayLabel: string;
  monthlyDayLabel: string;
  requireMonthlyDay?: boolean | undefined;
}

function ScheduleFields({
  cycle,
  onCycleChange,
  day,
  onDayChange,
  weekday,
  onWeekdayChange,
  anchorDate,
  onAnchorDateChange,
  cycleLabel,
  weeklyDayLabel,
  monthlyDayLabel,
  requireMonthlyDay = false
}: ScheduleFieldsProps) {
  const cycleFieldId = useId();
  const scheduleValueId = useId();

  return (
    <>
      <div className="min-w-0">
        <label
          htmlFor={cycleFieldId}
          className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
        >
          {cycleLabel}
        </label>
        <select
          id={cycleFieldId}
          value={cycle}
          onChange={(e) => onCycleChange(e.target.value as LedgerScheduleCycle)}
          className={getFieldClass('orange', '', { compact: true })}
        >
          <option value="monthly">Monthly</option>
          <option value="annual">Annual</option>
          <option value="quarterly">Quarterly</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>

      <div className="min-w-0 sm:col-span-2">
        <label
          htmlFor={scheduleValueId}
          className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
        >
          {cycle === 'weekly'
            ? weeklyDayLabel
            : cycle === 'annual' || cycle === 'quarterly'
              ? 'Next / Anchor Date'
              : monthlyDayLabel}
        </label>
        {cycle === 'weekly' ? (
          <select
            id={scheduleValueId}
            value={weekday}
            onChange={(e) => onWeekdayChange(Number(e.target.value))}
            className={getFieldClass('orange', '', { compact: true })}
          >
            {WEEKDAY_OPTIONS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        ) : cycle === 'annual' || cycle === 'quarterly' ? (
          <input
            id={scheduleValueId}
            type="date"
            required
            value={anchorDate}
            onChange={(e) => onAnchorDateChange(e.target.value)}
            className={getFieldClass('orange', '', { compact: true })}
          />
        ) : (
          <input
            id={scheduleValueId}
            type="number"
            min="1"
            max="31"
            required={requireMonthlyDay}
            value={day}
            onChange={(e) => onDayChange(e.target.value)}
            className={getFieldClass('orange')}
          />
        )}
      </div>
    </>
  );
}

export interface ExpenseModalProps {
  editingExpense: LedgerItem | null;
  selectedMonth: string;
  todayStr: string;
  perspective: LedgerPerspective;
  activeProfile: PublicProfile;
  partner1Name: string;
  partner2Name: string;
  ledgerData: LedgerData;
  expenses: LedgerItem[];
  onUpsertLedgerItem?: UpsertLedgerItemFn | undefined;
  onSaveLedgerData: SaveLedgerDataFn;
  onClose: () => void;
  showToast?: ShowToastFn | undefined;
}

export function ExpenseModal({
  editingExpense,
  selectedMonth,
  todayStr,
  perspective,
  activeProfile,
  partner1Name,
  partner2Name,
  ledgerData,
  expenses,
  onUpsertLedgerItem,
  onSaveLedgerData,
  onClose,
  showToast
}: ExpenseModalProps) {
  const defaultNewDate =
    selectedMonth === todayStr.slice(0, 7) ? todayStr : `${selectedMonth}-01`;

  const titleId = useId();
  const amountId = useId();
  const dateId = useId();
  const ownerId = useId();
  const paidById = useId();
  const categoryId = useId();
  const notesId = useId();

  const [expTitle, setExpTitle] = useState(() => (editingExpense ? editingExpense.title || '' : ''));
  const [expAmount, setExpAmount] = useState(() =>
    editingExpense ? String(editingExpense.amount ?? '') : ''
  );
  const [expDate, setExpDate] = useState(() =>
    editingExpense ? editingExpense.date || todayStr : defaultNewDate
  );
  const [expCategory, setExpCategory] = useState(() =>
    editingExpense ? editingExpense.category || 'Groceries & Household' : 'Groceries & Household'
  );
  const [expOwner, setExpOwner] = useState<LedgerOwner>(() =>
    editingExpense
      ? editingExpense.owner || 'joint'
      : perspective === 'partner1' || perspective === 'partner2' || perspective === 'joint'
        ? perspective
        : 'joint'
  );
  const [expPaidBy, setExpPaidBy] = useState<LedgerOwner>(() =>
    editingExpense
      ? editingExpense.paidBy ||
        (editingExpense.owner === 'partner2'
          ? 'partner2'
          : editingExpense.owner === 'joint'
            ? 'joint'
            : 'partner1')
      : activeProfile?.id === 'partner2'
        ? 'partner2'
        : 'partner1'
  );
  const [expNotes, setExpNotes] = useState(() => (editingExpense ? editingExpense.notes || '' : ''));
  const [formError, setFormError] = useState('');
  const { isPending: isSaving, runLocked } = useActionLock();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!expTitle.trim()) {
      const msg = 'Please enter a title or description for this expense';
      setFormError(msg);
      showToast?.(msg, 'error');
      return;
    }
    const amt = parseFloat(expAmount);
    const rounded = fromPence(Math.round(amt * 100));
    if (!Number.isFinite(amt) || rounded <= 0) {
      const msg = 'Please enter a valid expense amount greater than £0.00';
      setFormError(msg);
      showToast?.(msg, 'error');
      return;
    }
    setFormError('');

    const record: LedgerItem = {
      id: editingExpense?.id || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: expTitle.trim(),
      amount: rounded,
      date: expDate || todayStr,
      category: expCategory,
      owner: expOwner,
      paidBy: expPaidBy,
      notes: expNotes.trim()
    };

    const nextExpenses = editingExpense
      ? expenses.map((x) => (x.id === editingExpense.id ? record : x))
      : [record, ...expenses];
    const nextLedgerData: LedgerData = { ...ledgerData, expenses: nextExpenses };
    const msg = editingExpense
      ? `Updated expense "${record.title}"`
      : `Logged ${formatGBP(record.amount)} for "${record.title}"`;

    await runLocked(async () => {
      try {
        const ok = onUpsertLedgerItem
          ? await onUpsertLedgerItem({ kind: 'expense', record, nextLedgerData }, msg)
          : await onSaveLedgerData(nextLedgerData, msg);
        if (ok !== false) {
          onClose();
        }
      } catch (err) {
        const errMsg =
          err instanceof Error && err.message ? err.message : 'Could not save expense';
        setFormError(errMsg);
        showToast?.(errMsg, 'error');
      }
    });
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={editingExpense ? 'Edit Expense' : 'Log Expense'}
      icon={Receipt}
      accent="orange"
      maxWidthClass="max-w-md"
      disableBackdropClose={isSaving}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-surface-subtle text-text-primary hover:bg-surface-hover cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="ledger-expense-form"
            disabled={isSaving}
            className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold bg-orange-700 hover:bg-orange-800 text-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSaving ? 'Saving...' : 'Save Expense'}
          </button>
        </div>
      }
    >
      <form id="ledger-expense-form" onSubmit={handleSubmit} className="space-y-3.5">
        {formError && (
          <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
            {formError}
          </p>
        )}

        <div>
          <label
            htmlFor={titleId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
          >
            Description / Merchant
          </label>
          <input
            id={titleId}
            type="text"
            required
            value={expTitle}
            onChange={(e) => {
              setExpTitle(e.target.value);
              if (formError) setFormError('');
            }}
            placeholder="e.g., Weekly groceries, Vet visit, Coffee..."
            className={getFieldClass('orange')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label
              htmlFor={amountId}
              className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
            >
              Amount (£)
            </label>
            <input
              id={amountId}
              type="number"
              step="0.01"
              min="0.01"
              required
              value={expAmount}
              onChange={(e) => {
                setExpAmount(e.target.value);
                if (formError) setFormError('');
              }}
              placeholder="0.00"
              className={getFieldClass('orange', 'font-bold')}
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor={dateId}
              className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
            >
              Date
            </label>
            <input
              id={dateId}
              type="date"
              required
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              className={getFieldClass('orange')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label
              htmlFor={ownerId}
              className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
            >
              Who Is This Expense For?
            </label>
            <select
              id={ownerId}
              value={expOwner}
              onChange={(e) => setExpOwner(e.target.value as LedgerOwner)}
              className={getFieldClass('orange')}
            >
              <option value="joint">🤝 Joint / Shared</option>
              <option value="partner1">⚡ {partner1Name} (Personal)</option>
              <option value="partner2">🌸 {partner2Name} (Personal)</option>
            </select>
          </div>

          <div className="min-w-0">
            <label
              htmlFor={paidById}
              className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
            >
              Paid By
            </label>
            <select
              id={paidById}
              value={expPaidBy}
              onChange={(e) => setExpPaidBy(e.target.value as LedgerOwner)}
              className={getFieldClass('orange')}
            >
              <option value="partner1">⚡ {partner1Name}</option>
              <option value="partner2">🌸 {partner2Name}</option>
              <option value="joint">🏦 Joint Account</option>
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor={categoryId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
          >
            Category
          </label>
          <select
            id={categoryId}
            value={expCategory}
            onChange={(e) => setExpCategory(e.target.value)}
            className={getFieldClass('orange')}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={notesId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
          >
            Notes (Optional)
          </label>
          <input
            id={notesId}
            type="text"
            value={expNotes}
            onChange={(e) => setExpNotes(e.target.value)}
            placeholder="Optional receipt note..."
            className={getFieldClass('orange')}
          />
        </div>
      </form>
    </ModalShell>
  );
}

export interface RecurringModalProps {
  editingRecurring: LedgerItem | null;
  defaultType?: RecurringType | undefined;
  todayStr: string;
  perspective: LedgerPerspective;
  partner1Name: string;
  partner2Name: string;
  ledgerData: LedgerData;
  recurring: LedgerItem[];
  onUpsertLedgerItem?: UpsertLedgerItemFn | undefined;
  onSaveLedgerData: SaveLedgerDataFn;
  onClose: () => void;
  showToast?: ShowToastFn | undefined;
}

export function RecurringModal({
  editingRecurring,
  defaultType = 'direct-debit',
  todayStr,
  perspective,
  partner1Name,
  partner2Name,
  ledgerData,
  recurring,
  onUpsertLedgerItem,
  onSaveLedgerData,
  onClose,
  showToast
}: RecurringModalProps) {
  const titleId = useId();
  const amountId = useId();
  const ownerId = useId();
  const categoryId = useId();
  const notesId = useId();

  const [recTitle, setRecTitle] = useState(() => (editingRecurring ? editingRecurring.title || '' : ''));
  const [recAmount, setRecAmount] = useState(() =>
    editingRecurring ? String(editingRecurring.amount ?? '') : ''
  );
  const [recType, setRecType] = useState<RecurringType>(() =>
    editingRecurring?.type === 'subscription' || editingRecurring?.type === 'direct-debit'
      ? editingRecurring.type
      : defaultType
  );
  const [recCycle, setRecCycle] = useState<LedgerScheduleCycle>(() =>
    editingRecurring ? editingRecurring.cycle || 'monthly' : 'monthly'
  );
  const [recBillingDay, setRecBillingDay] = useState<number | string>(() =>
    readDayField(editingRecurring, editingRecurring?.billingDay, 1)
  );
  const [recBillingWeekday, setRecBillingWeekday] = useState<number | string>(() =>
    readWeekdayField(editingRecurring, editingRecurring?.billingWeekday, 1)
  );
  const [recBillingDate, setRecBillingDate] = useState(() => {
    if (!editingRecurring) return todayStr;
    return readAnchorDateField(
      editingRecurring,
      editingRecurring.billingDate,
      editingRecurring.billingDay,
      todayStr,
      1
    );
  });
  const [recOwner, setRecOwner] = useState<LedgerOwner>(() =>
    editingRecurring
      ? editingRecurring.owner || 'joint'
      : perspective === 'partner1' || perspective === 'partner2' || perspective === 'joint'
        ? perspective
        : 'joint'
  );
  const [recCategory, setRecCategory] = useState(() =>
    editingRecurring
      ? editingRecurring.category || 'Utilities & Bills'
      : defaultType === 'subscription'
        ? 'Subscriptions & Media'
        : 'Utilities & Bills'
  );
  const [recNotes, setRecNotes] = useState(() => (editingRecurring ? editingRecurring.notes || '' : ''));
  const [formError, setFormError] = useState('');
  const { isPending: isSaving, runLocked } = useActionLock();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!recTitle.trim()) {
      const msg = 'Please enter a title or provider name';
      setFormError(msg);
      showToast?.(msg, 'error');
      return;
    }
    const amt = parseFloat(recAmount);
    const rounded = fromPence(Math.round(amt * 100));
    if (!Number.isFinite(amt) || rounded <= 0) {
      const msg = 'Please enter a valid recurring amount greater than £0.00';
      setFormError(msg);
      showToast?.(msg, 'error');
      return;
    }
    setFormError('');

    const scheduleFields: Partial<LedgerItem> =
      recCycle === 'weekly'
        ? {
            billingWeekday: Math.min(7, Math.max(1, Number(recBillingWeekday) || 1)),
            billingDay: Math.min(7, Math.max(1, Number(recBillingWeekday) || 1))
          }
        : recCycle === 'annual' || recCycle === 'quarterly'
          ? {
              billingDate: recBillingDate || todayStr,
              billingDay: Number((recBillingDate || todayStr).split('-')[2]) || 1
            }
          : {
              billingDay: Math.min(31, Math.max(1, Number(recBillingDay) || 1))
            };

    const existing = editingRecurring ? recurring.find((r) => r.id === editingRecurring.id) : null;
    const record: LedgerItem = {
      id: editingRecurring?.id || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: recTitle.trim(),
      amount: rounded,
      type: recType,
      cycle: recCycle,
      ...scheduleFields,
      owner: recOwner,
      category: recCategory,
      active: editingRecurring ? existing?.active !== false : true,
      notes: recNotes.trim()
    };

    let mergedRecord: LedgerItem = record;
    if (existing) {
      const cleanedExisting: LedgerItem = { ...existing };
      delete cleanedExisting.billingDay;
      delete cleanedExisting.billingWeekday;
      delete cleanedExisting.billingDate;
      stripLegacyScheduleKeys(cleanedExisting);
      mergedRecord = { ...cleanedExisting, ...record };
    }

    const nextRecurring = editingRecurring
      ? recurring.map((r) => (r.id === editingRecurring.id ? mergedRecord : r))
      : [...recurring, mergedRecord];
    const nextLedgerData: LedgerData = { ...ledgerData, recurring: nextRecurring };
    const msg = editingRecurring
      ? `Updated "${record.title}"`
      : `Added ${record.type === 'direct-debit' ? 'Direct Debit' : 'Subscription'}: "${record.title}"`;

    await runLocked(async () => {
      try {
        const ok = onUpsertLedgerItem
          ? await onUpsertLedgerItem({ kind: 'recurring', record: mergedRecord, nextLedgerData }, msg)
          : await onSaveLedgerData(nextLedgerData, msg);
        if (ok !== false) {
          onClose();
        }
      } catch (err) {
        const errMsg =
          err instanceof Error && err.message
            ? err.message
            : 'Could not save recurring commitment';
        setFormError(errMsg);
        showToast?.(errMsg, 'error');
      }
    });
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={editingRecurring ? 'Edit Recurring Commitment' : 'Add Direct Debit or Subscription'}
      icon={Repeat}
      accent="orange"
      maxWidthClass="max-w-md"
      disableBackdropClose={isSaving}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-surface-subtle text-text-primary hover:bg-surface-hover cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="ledger-recurring-form"
            disabled={isSaving}
            className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold bg-orange-700 hover:bg-orange-800 text-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSaving ? 'Saving...' : 'Save Commitment'}
          </button>
        </div>
      }
    >
      <form id="ledger-recurring-form" onSubmit={handleSubmit} className="space-y-3.5">
        {formError && (
          <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
            {formError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: 'direct-debit', label: 'Direct Debit / Bill', icon: Landmark },
              { id: 'subscription', label: 'Subscription', icon: Repeat }
            ] as const
          ).map((t) => {
            const TypeIcon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={recType === t.id}
                onClick={() => setRecType(t.id)}
                className={`min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                  recType === t.id
                    ? 'bg-orange-700 text-white border-orange-700'
                    : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                }`}
              >
                <TypeIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div>
          <label
            htmlFor={titleId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
          >
            Provider / Title
          </label>
          <input
            id={titleId}
            type="text"
            required
            value={recTitle}
            onChange={(e) => {
              setRecTitle(e.target.value);
              if (formError) setFormError('');
            }}
            placeholder="e.g., Electricity & Gas, Streaming, Council Tax..."
            className={getFieldClass('orange')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label
              htmlFor={amountId}
              className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
            >
              Amount (£)
            </label>
            <input
              id={amountId}
              type="number"
              step="0.01"
              min="0.01"
              required
              value={recAmount}
              onChange={(e) => {
                setRecAmount(e.target.value);
                if (formError) setFormError('');
              }}
              placeholder="0.00"
              className={getFieldClass('orange', 'font-bold')}
            />
          </div>

          <ScheduleFields
            cycle={recCycle}
            onCycleChange={setRecCycle}
            day={recBillingDay}
            onDayChange={setRecBillingDay}
            weekday={recBillingWeekday}
            onWeekdayChange={setRecBillingWeekday}
            anchorDate={recBillingDate}
            onAnchorDateChange={setRecBillingDate}
            cycleLabel="Billing Cycle"
            weeklyDayLabel="Billing Day"
            monthlyDayLabel="Day (1–31)"
            requireMonthlyDay
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label
              htmlFor={ownerId}
              className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
            >
              Owner / Split
            </label>
            <select
              id={ownerId}
              value={recOwner}
              onChange={(e) => setRecOwner(e.target.value as LedgerOwner)}
              className={getFieldClass('orange')}
            >
              <option value="joint">🤝 Joint / Shared</option>
              <option value="partner1">⚡ {partner1Name} (Personal)</option>
              <option value="partner2">🌸 {partner2Name} (Personal)</option>
            </select>
          </div>

          <div className="min-w-0">
            <label
              htmlFor={categoryId}
              className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
            >
              Category
            </label>
            <select
              id={categoryId}
              value={recCategory}
              onChange={(e) => setRecCategory(e.target.value)}
              className={getFieldClass('orange')}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor={notesId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
          >
            Notes (Optional)
          </label>
          <input
            id={notesId}
            type="text"
            value={recNotes}
            onChange={(e) => setRecNotes(e.target.value)}
            placeholder="Account / contract notes..."
            className={getFieldClass('orange')}
          />
        </div>
      </form>
    </ModalShell>
  );
}

export interface IncomeModalProps {
  editingIncome: LedgerItem | null;
  defaultFreq?: LedgerScheduleCycle | undefined;
  selectedMonth: string;
  todayStr: string;
  perspective: LedgerPerspective;
  activeProfile: PublicProfile;
  partner1Name: string;
  partner2Name: string;
  ledgerData: LedgerData;
  incomes: LedgerItem[];
  onUpsertLedgerItem?: UpsertLedgerItemFn | undefined;
  onSaveLedgerData: SaveLedgerDataFn;
  onClose: () => void;
  showToast?: ShowToastFn | undefined;
}

export function IncomeModal({
  editingIncome,
  defaultFreq = 'monthly',
  selectedMonth,
  todayStr,
  perspective,
  activeProfile,
  partner1Name,
  partner2Name,
  ledgerData,
  incomes,
  onUpsertLedgerItem,
  onSaveLedgerData,
  onClose,
  showToast
}: IncomeModalProps) {
  const defaultNewDate =
    selectedMonth === todayStr.slice(0, 7) ? todayStr : `${selectedMonth}-01`;

  const titleId = useId();
  const amountId = useId();
  const dateId = useId();
  const ownerId = useId();
  const notesId = useId();

  const [incTitle, setIncTitle] = useState(() => (editingIncome ? editingIncome.title || '' : ''));
  const [incAmount, setIncAmount] = useState(() =>
    editingIncome ? String(editingIncome.amount ?? '') : ''
  );
  const [incFrequency, setIncFrequency] = useState<LedgerScheduleCycle>(() =>
    editingIncome ? editingIncome.frequency || 'monthly' : defaultFreq
  );
  const [incDate, setIncDate] = useState(() =>
    editingIncome ? editingIncome.date || todayStr : defaultNewDate
  );
  const [incOwner, setIncOwner] = useState<LedgerOwner>(() =>
    editingIncome
      ? editingIncome.owner || 'partner1'
      : perspective === 'partner1' || perspective === 'partner2' || perspective === 'joint'
        ? perspective
        : activeProfile?.id === 'partner2'
          ? 'partner2'
          : 'partner1'
  );
  const [incPayDay, setIncPayDay] = useState<number | string>(() =>
    readDayField(editingIncome, editingIncome?.payDay, 28)
  );
  const [incPayWeekday, setIncPayWeekday] = useState<number | string>(() =>
    readWeekdayField(editingIncome, editingIncome?.payWeekday, 5)
  );
  const [incPayDate, setIncPayDate] = useState(() => {
    if (!editingIncome) return todayStr;
    return readAnchorDateField(
      editingIncome,
      editingIncome.payDate,
      editingIncome.payDay,
      todayStr,
      28
    );
  });
  const [incNotes, setIncNotes] = useState(() => (editingIncome ? editingIncome.notes || '' : ''));
  const [formError, setFormError] = useState('');
  const { isPending: isSaving, runLocked } = useActionLock();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!incTitle.trim()) {
      const msg = 'Please enter a title or source for this income';
      setFormError(msg);
      showToast?.(msg, 'error');
      return;
    }
    const amt = parseFloat(incAmount);
    const rounded = fromPence(Math.round(amt * 100));
    if (!Number.isFinite(amt) || rounded <= 0) {
      const msg = 'Please enter a valid income amount greater than £0.00';
      setFormError(msg);
      showToast?.(msg, 'error');
      return;
    }
    setFormError('');

    const isOneOff = incFrequency === 'one-off';
    const scheduleFields: Partial<LedgerItem> = isOneOff
      ? { date: incDate || todayStr }
      : incFrequency === 'weekly'
        ? {
            payWeekday: Math.min(7, Math.max(1, Number(incPayWeekday) || 5)),
            payDay: Math.min(7, Math.max(1, Number(incPayWeekday) || 5))
          }
        : incFrequency === 'annual' || incFrequency === 'quarterly'
          ? {
              payDate: incPayDate || todayStr,
              payDay: Number((incPayDate || todayStr).split('-')[2]) || 28
            }
          : {
              payDay: Math.min(31, Math.max(1, Number(incPayDay) || 28))
            };

    const existing = editingIncome ? incomes.find((i) => i.id === editingIncome.id) : null;
    const record: LedgerItem = {
      id: editingIncome?.id || `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: incTitle.trim(),
      amount: rounded,
      frequency: incFrequency,
      ...scheduleFields,
      owner: incOwner,
      category: existing?.category || (isOneOff ? 'One-Off / Variable' : 'Salary'),
      notes: incNotes.trim()
    };

    let mergedRecord: LedgerItem = record;
    if (existing) {
      const cleanedExisting: LedgerItem = { ...existing };
      delete cleanedExisting.date;
      delete cleanedExisting.payDay;
      delete cleanedExisting.payWeekday;
      delete cleanedExisting.payDate;
      stripLegacyScheduleKeys(cleanedExisting);
      mergedRecord = { ...cleanedExisting, ...record };
    }

    const nextIncomes = editingIncome
      ? incomes.map((i) => (i.id === editingIncome.id ? mergedRecord : i))
      : [mergedRecord, ...incomes];
    const nextLedgerData: LedgerData = { ...ledgerData, incomes: nextIncomes };
    const msg = editingIncome
      ? `Updated "${mergedRecord.title}"`
      : isOneOff
        ? `Logged one-off income ${formatGBP(mergedRecord.amount)} for "${mergedRecord.title}"`
        : `Added recurring income "${mergedRecord.title}"`;

    await runLocked(async () => {
      try {
        const ok = onUpsertLedgerItem
          ? await onUpsertLedgerItem({ kind: 'income', record: mergedRecord, nextLedgerData }, msg)
          : await onSaveLedgerData(nextLedgerData, msg);
        if (ok !== false) {
          onClose();
        }
      } catch (err) {
        const errMsg =
          err instanceof Error && err.message ? err.message : 'Could not save income stream';
        setFormError(errMsg);
        showToast?.(errMsg, 'error');
      }
    });
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={editingIncome ? 'Edit Income Stream' : 'Add Income Stream'}
      icon={TrendingUp}
      accent="orange"
      maxWidthClass="max-w-md"
      disableBackdropClose={isSaving}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-surface-subtle text-text-primary hover:bg-surface-hover cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="ledger-income-form"
            disabled={isSaving}
            className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold bg-orange-700 hover:bg-orange-800 text-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSaving ? 'Saving...' : 'Save Income'}
          </button>
        </div>
      }
    >
      <form id="ledger-income-form" onSubmit={handleSubmit} className="space-y-3.5">
        {formError && (
          <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
            {formError}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(
            [
              { id: 'one-off', label: 'One-Off / Variable Income', icon: Zap },
              { id: 'monthly', label: 'Recurring Salary / Stream', icon: Repeat }
            ] as const
          ).map((mode) => {
            const isOneOffSelected = incFrequency === 'one-off';
            const active = mode.id === 'one-off' ? isOneOffSelected : !isOneOffSelected;
            const ModeIcon = mode.icon;
            return (
              <button
                key={mode.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (active) return;
                  setIncFrequency(mode.id);
                }}
                className={`min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition cursor-pointer ${
                  active
                    ? 'bg-orange-700 text-white border-orange-700'
                    : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                }`}
              >
                <ModeIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>

        <div>
          <label
            htmlFor={titleId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
          >
            Income Source / Description
          </label>
          <input
            id={titleId}
            type="text"
            required
            value={incTitle}
            onChange={(e) => {
              setIncTitle(e.target.value);
              if (formError) setFormError('');
            }}
            placeholder={
              incFrequency === 'one-off'
                ? 'e.g., Additional work, bonus, refund, sale...'
                : 'e.g., Monthly Salary (Net)...'
            }
            className={getFieldClass('orange')}
          />
        </div>

        {incFrequency === 'one-off' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="min-w-0">
              <label
                htmlFor={amountId}
                className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
              >
                Net Amount (£)
              </label>
              <input
                id={amountId}
                type="number"
                step="0.01"
                min="0.01"
                required
                value={incAmount}
                onChange={(e) => {
                  setIncAmount(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder="0.00"
                className={getFieldClass('orange', 'font-bold')}
              />
            </div>
            <div className="min-w-0">
              <label
                htmlFor={dateId}
                className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
              >
                Date Received / Assigned
              </label>
              <input
                id={dateId}
                type="date"
                required
                value={incDate}
                onChange={(e) => setIncDate(e.target.value)}
                className={getFieldClass('orange')}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="min-w-0">
              <label
                htmlFor={amountId}
                className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
              >
                Net Amount (£)
              </label>
              <input
                id={amountId}
                type="number"
                step="0.01"
                min="0.01"
                required
                value={incAmount}
                onChange={(e) => {
                  setIncAmount(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder="0.00"
                className={getFieldClass('orange', 'font-bold')}
              />
            </div>

            <ScheduleFields
              cycle={incFrequency}
              onCycleChange={setIncFrequency}
              day={incPayDay}
              onDayChange={setIncPayDay}
              weekday={incPayWeekday}
              onWeekdayChange={setIncPayWeekday}
              anchorDate={incPayDate}
              onAnchorDateChange={setIncPayDate}
              cycleLabel="Frequency"
              weeklyDayLabel="Payday"
              monthlyDayLabel="Payday (1–31)"
            />
          </div>
        )}

        <div>
          <label
            htmlFor={ownerId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
          >
            Person
          </label>
          <select
            id={ownerId}
            value={incOwner}
            onChange={(e) => setIncOwner(e.target.value as LedgerOwner)}
            className={getFieldClass('orange')}
          >
            <option value="partner1">⚡ {partner1Name}</option>
            <option value="partner2">🌸 {partner2Name}</option>
            <option value="joint">🤝 Joint Household Income</option>
          </select>
        </div>

        <div>
          <label
            htmlFor={notesId}
            className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1"
          >
            Notes (Optional)
          </label>
          <input
            id={notesId}
            type="text"
            value={incNotes}
            onChange={(e) => setIncNotes(e.target.value)}
            placeholder="Optional payday note..."
            className={getFieldClass('orange')}
          />
        </div>
      </form>
    </ModalShell>
  );
}
