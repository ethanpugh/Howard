import React, { useState } from 'react';
import { Receipt, Repeat, TrendingUp } from 'lucide-react';
import { ModalShell, getFieldClass } from '../../components/HowardUI.jsx';
import { formatGBP, WEEKDAY_OPTIONS } from '../../utils/householdHelpers.js';
import { useActionLock } from '../../hooks/useActionLock.js';
import { EXPENSE_CATEGORIES } from './ledgerConstants.js';

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
}) {
  return (
    <>
      <div className="min-w-0">
        <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
          {cycleLabel}
        </label>
        <select
          value={cycle}
          onChange={(e) => onCycleChange(e.target.value)}
          className={getFieldClass('amber', '', { compact: true })}
        >
          <option value="monthly">Monthly</option>
          <option value="annual">Annual</option>
          <option value="quarterly">Quarterly</option>
          <option value="weekly">Weekly</option>
        </select>
      </div>

      <div className="min-w-0 sm:col-span-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
          {cycle === 'weekly'
            ? weeklyDayLabel
            : cycle === 'annual' || cycle === 'quarterly'
              ? 'Next / Anchor Date'
              : monthlyDayLabel}
        </label>
        {cycle === 'weekly' ? (
          <select
            value={weekday}
            onChange={(e) => onWeekdayChange(Number(e.target.value))}
            className={getFieldClass('amber', '', { compact: true })}
          >
            {WEEKDAY_OPTIONS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        ) : cycle === 'annual' || cycle === 'quarterly' ? (
          <input
            type="date"
            required
            value={anchorDate}
            onChange={(e) => onAnchorDateChange(e.target.value)}
            className={getFieldClass('amber', '', { compact: true })}
          />
        ) : (
          <input
            type="number"
            min="1"
            max="31"
            required={requireMonthlyDay}
            value={day}
            onChange={(e) => onDayChange(e.target.value)}
            className={getFieldClass('amber')}
          />
        )}
      </div>
    </>
  );
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
}) {
  const isEdit = Boolean(editingExpense);
  const defaultNewDate =
    selectedMonth === todayStr.slice(0, 7) ? todayStr : `${selectedMonth}-01`;

  const [expTitle, setExpTitle] = useState(() => (isEdit ? editingExpense.title || '' : ''));
  const [expAmount, setExpAmount] = useState(() =>
    isEdit ? String(editingExpense.amount ?? '') : ''
  );
  const [expDate, setExpDate] = useState(() =>
    isEdit ? editingExpense.date || todayStr : defaultNewDate
  );
  const [expCategory, setExpCategory] = useState(() =>
    isEdit ? editingExpense.category || 'Groceries & Household' : 'Groceries & Household'
  );
  const [expOwner, setExpOwner] = useState(() =>
    isEdit
      ? editingExpense.owner || 'joint'
      : perspective === 'partner1' || perspective === 'partner2' || perspective === 'joint'
        ? perspective
        : 'joint'
  );
  const [expPaidBy, setExpPaidBy] = useState(() =>
    isEdit
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
  const [expNotes, setExpNotes] = useState(() => (isEdit ? editingExpense.notes || '' : ''));
  const { isPending: isSaving, runLocked } = useActionLock();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!expTitle.trim()) {
      showToast?.('Please enter a title or description for this expense', 'error');
      return;
    }
    const amt = parseFloat(expAmount);
    const rounded = Math.round(amt * 100) / 100;
    if (!Number.isFinite(amt) || rounded <= 0) {
      showToast?.('Please enter a valid expense amount greater than £0.00', 'error');
      return;
    }

    const record = {
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
    const nextLedgerData = { ...ledgerData, expenses: nextExpenses };
    const msg = editingExpense
      ? `Updated expense "${record.title}"`
      : `Logged ${formatGBP(record.amount)} for "${record.title}"`;

    await runLocked(async () => {
      const ok = onUpsertLedgerItem
        ? await onUpsertLedgerItem({ kind: 'expense', record, nextLedgerData }, msg)
        : await onSaveLedgerData(nextLedgerData, msg);
      if (ok !== false) {
        onClose();
      }
    });
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={editingExpense ? 'Edit Expense' : 'Log Expense'}
      icon={Receipt}
      accent="amber"
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
            className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSaving ? 'Saving...' : 'Save Expense'}
          </button>
        </div>
      }
    >
      <form id="ledger-expense-form" onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Description / Merchant
          </label>
          <input
            type="text"
            required
            value={expTitle}
            onChange={(e) => setExpTitle(e.target.value)}
            placeholder="e.g., Weekly groceries, Vet visit, Coffee..."
            className={getFieldClass('amber')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Amount (£)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="0.00"
              className={getFieldClass('amber', 'font-bold')}
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Date
            </label>
            <input
              type="date"
              required
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              className={getFieldClass('amber')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Who Is This Expense For?
            </label>
            <select
              value={expOwner}
              onChange={(e) => setExpOwner(e.target.value)}
              className={getFieldClass('amber')}
            >
              <option value="joint">🤝 Joint / Shared</option>
              <option value="partner1">⚡ {partner1Name} (Personal)</option>
              <option value="partner2">🌸 {partner2Name} (Personal)</option>
            </select>
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Paid By
            </label>
            <select
              value={expPaidBy}
              onChange={(e) => setExpPaidBy(e.target.value)}
              className={getFieldClass('amber')}
            >
              <option value="partner1">⚡ {partner1Name}</option>
              <option value="partner2">🌸 {partner2Name}</option>
              <option value="joint">🏦 Joint Account</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Category
          </label>
          <select
            value={expCategory}
            onChange={(e) => setExpCategory(e.target.value)}
            className={getFieldClass('amber')}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Notes (Optional)
          </label>
          <input
            type="text"
            value={expNotes}
            onChange={(e) => setExpNotes(e.target.value)}
            placeholder="Optional receipt note..."
            className={getFieldClass('amber')}
          />
        </div>
      </form>
    </ModalShell>
  );
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
}) {
  const isEdit = Boolean(editingRecurring);
  const [recTitle, setRecTitle] = useState(() => (isEdit ? editingRecurring.title || '' : ''));
  const [recAmount, setRecAmount] = useState(() =>
    isEdit ? String(editingRecurring.amount ?? '') : ''
  );
  const [recType, setRecType] = useState(() =>
    isEdit ? editingRecurring.type || 'direct-debit' : defaultType
  );
  const [recCycle, setRecCycle] = useState(() =>
    isEdit ? editingRecurring.cycle || 'monthly' : 'monthly'
  );
  const [recBillingDay, setRecBillingDay] = useState(() =>
    isEdit ? editingRecurring.billingDay || 1 : 1
  );
  const [recBillingWeekday, setRecBillingWeekday] = useState(() =>
    isEdit ? editingRecurring.billingWeekday || 1 : 1
  );
  const [recBillingDate, setRecBillingDate] = useState(() => {
    if (!isEdit) return todayStr;
    return (
      editingRecurring.billingDate ||
      `${todayStr.slice(0, 4)}-01-${String(Math.min(28, Math.max(1, Number(editingRecurring.billingDay) || 1))).padStart(2, '0')}`
    );
  });
  const [recOwner, setRecOwner] = useState(() =>
    isEdit
      ? editingRecurring.owner || 'joint'
      : perspective === 'partner1' || perspective === 'partner2' || perspective === 'joint'
        ? perspective
        : 'joint'
  );
  const [recCategory, setRecCategory] = useState(() =>
    isEdit
      ? editingRecurring.category || 'Utilities & Bills'
      : defaultType === 'subscription'
        ? 'Subscriptions & Media'
        : 'Utilities & Bills'
  );
  const [recNotes, setRecNotes] = useState(() => (isEdit ? editingRecurring.notes || '' : ''));
  const { isPending: isSaving, runLocked } = useActionLock();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!recTitle.trim()) {
      showToast?.('Please enter a title or provider name', 'error');
      return;
    }
    const amt = parseFloat(recAmount);
    const rounded = Math.round(amt * 100) / 100;
    if (!Number.isFinite(amt) || rounded <= 0) {
      showToast?.('Please enter a valid recurring amount greater than £0.00', 'error');
      return;
    }

    const scheduleFields =
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

    const existing = isEdit ? recurring.find((r) => r.id === editingRecurring.id) : null;
    const record = {
      id: editingRecurring?.id || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: recTitle.trim(),
      amount: rounded,
      type: recType,
      cycle: recCycle,
      ...scheduleFields,
      owner: recOwner,
      category: recCategory,
      active: isEdit ? existing?.active !== false : true,
      notes: recNotes.trim()
    };

    let mergedRecord = record;
    if (existing) {
      const cleanedExisting = { ...existing };
      delete cleanedExisting.billingDay;
      delete cleanedExisting.billingWeekday;
      delete cleanedExisting.billingDate;
      delete cleanedExisting.dueDayOfMonth;
      delete cleanedExisting.dueWeekday;
      delete cleanedExisting.dueMonth;
      mergedRecord = { ...cleanedExisting, ...record };
    }

    const nextRecurring = isEdit
      ? recurring.map((r) => (r.id === editingRecurring.id ? mergedRecord : r))
      : [...recurring, mergedRecord];
    const nextLedgerData = { ...ledgerData, recurring: nextRecurring };
    const msg = isEdit
      ? `Updated "${record.title}"`
      : `Added ${record.type === 'direct-debit' ? 'Direct Debit' : 'Subscription'}: "${record.title}"`;

    await runLocked(async () => {
      const ok = onUpsertLedgerItem
        ? await onUpsertLedgerItem({ kind: 'recurring', record: mergedRecord, nextLedgerData }, msg)
        : await onSaveLedgerData(nextLedgerData, msg);
      if (ok !== false) {
        onClose();
      }
    });
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={isEdit ? 'Edit Recurring Commitment' : 'Add Direct Debit or Subscription'}
      icon={Repeat}
      accent="amber"
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
            className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSaving ? 'Saving...' : 'Save Commitment'}
          </button>
        </div>
      }
    >
      <form id="ledger-recurring-form" onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'direct-debit', label: '🏦 Direct Debit / Bill' },
            { id: 'subscription', label: '🔄 Subscription' }
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setRecType(t.id)}
              className={`min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer ${
                recType === t.id
                  ? 'bg-amber-700 text-white border-amber-700'
                  : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Provider / Title
          </label>
          <input
            type="text"
            required
            value={recTitle}
            onChange={(e) => setRecTitle(e.target.value)}
            placeholder="e.g., Electricity & Gas, Streaming, Council Tax..."
            className={getFieldClass('amber')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Amount (£)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={recAmount}
              onChange={(e) => setRecAmount(e.target.value)}
              placeholder="0.00"
              className={getFieldClass('amber', 'font-bold')}
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
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Owner / Split
            </label>
            <select
              value={recOwner}
              onChange={(e) => setRecOwner(e.target.value)}
              className={getFieldClass('amber')}
            >
              <option value="joint">🤝 Joint / Shared</option>
              <option value="partner1">⚡ {partner1Name} (Personal)</option>
              <option value="partner2">🌸 {partner2Name} (Personal)</option>
            </select>
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Category
            </label>
            <select
              value={recCategory}
              onChange={(e) => setRecCategory(e.target.value)}
              className={getFieldClass('amber')}
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
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Notes (Optional)
          </label>
          <input
            type="text"
            value={recNotes}
            onChange={(e) => setRecNotes(e.target.value)}
            placeholder="Account / contract notes..."
            className={getFieldClass('amber')}
          />
        </div>
      </form>
    </ModalShell>
  );
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
}) {
  const isEdit = Boolean(editingIncome);
  const defaultNewDate =
    selectedMonth === todayStr.slice(0, 7) ? todayStr : `${selectedMonth}-01`;

  const [incTitle, setIncTitle] = useState(() => (isEdit ? editingIncome.title || '' : ''));
  const [incAmount, setIncAmount] = useState(() =>
    isEdit ? String(editingIncome.amount ?? '') : ''
  );
  const [incFrequency, setIncFrequency] = useState(() =>
    isEdit ? editingIncome.frequency || 'monthly' : defaultFreq
  );
  const [incDate, setIncDate] = useState(() =>
    isEdit ? editingIncome.date || todayStr : defaultNewDate
  );
  const [incOwner, setIncOwner] = useState(() =>
    isEdit
      ? editingIncome.owner || 'partner1'
      : perspective === 'partner1' || perspective === 'partner2' || perspective === 'joint'
        ? perspective
        : activeProfile?.id === 'partner2'
          ? 'partner2'
          : 'partner1'
  );
  const [incPayDay, setIncPayDay] = useState(() => (isEdit ? editingIncome.payDay || 28 : 28));
  const [incPayWeekday, setIncPayWeekday] = useState(() =>
    isEdit ? editingIncome.payWeekday || 5 : 5
  );
  const [incPayDate, setIncPayDate] = useState(() => {
    if (!isEdit) return todayStr;
    return (
      editingIncome.payDate ||
      `${todayStr.slice(0, 4)}-01-${String(Math.min(28, Math.max(1, Number(editingIncome.payDay) || 28))).padStart(2, '0')}`
    );
  });
  const [incNotes, setIncNotes] = useState(() => (isEdit ? editingIncome.notes || '' : ''));
  const { isPending: isSaving, runLocked } = useActionLock();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!incTitle.trim()) {
      showToast?.('Please enter a title or source for this income', 'error');
      return;
    }
    const amt = parseFloat(incAmount);
    const rounded = Math.round(amt * 100) / 100;
    if (!Number.isFinite(amt) || rounded <= 0) {
      showToast?.('Please enter a valid income amount greater than £0.00', 'error');
      return;
    }

    const isOneOff = incFrequency === 'one-off';
    const scheduleFields = isOneOff
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

    const existing = isEdit ? incomes.find((i) => i.id === editingIncome.id) : null;
    const record = {
      id: editingIncome?.id || `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: incTitle.trim(),
      amount: rounded,
      frequency: incFrequency,
      ...scheduleFields,
      owner: incOwner,
      category: existing?.category || (isOneOff ? 'One-Off / Variable' : 'Salary'),
      notes: incNotes.trim()
    };

    let mergedRecord = record;
    if (existing) {
      const cleanedExisting = { ...existing };
      delete cleanedExisting.date;
      delete cleanedExisting.payDay;
      delete cleanedExisting.payWeekday;
      delete cleanedExisting.payDate;
      delete cleanedExisting.dueDayOfMonth;
      delete cleanedExisting.dueWeekday;
      delete cleanedExisting.dueMonth;
      mergedRecord = { ...cleanedExisting, ...record };
    }

    const nextIncomes = isEdit
      ? incomes.map((i) => (i.id === editingIncome.id ? mergedRecord : i))
      : [mergedRecord, ...incomes];
    const nextLedgerData = { ...ledgerData, incomes: nextIncomes };
    const msg = isEdit
      ? `Updated "${mergedRecord.title}"`
      : isOneOff
        ? `Logged one-off income ${formatGBP(mergedRecord.amount)} for "${mergedRecord.title}"`
        : `Added recurring income "${mergedRecord.title}"`;

    await runLocked(async () => {
      const ok = onUpsertLedgerItem
        ? await onUpsertLedgerItem({ kind: 'income', record: mergedRecord, nextLedgerData }, msg)
        : await onSaveLedgerData(nextLedgerData, msg);
      if (ok !== false) {
        onClose();
      }
    });
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={isEdit ? 'Edit Income Stream' : 'Add Income Stream'}
      icon={TrendingUp}
      accent="amber"
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
            className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSaving ? 'Saving...' : 'Save Income'}
          </button>
        </div>
      }
    >
      <form id="ledger-income-form" onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { id: 'one-off', label: '⚡ One-Off / Variable Income' },
            { id: 'monthly', label: '🔄 Recurring Salary / Stream' }
          ].map((mode) => {
            const isOneOffSelected = incFrequency === 'one-off';
            const active = mode.id === 'one-off' ? isOneOffSelected : !isOneOffSelected;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  if (active) return;
                  setIncFrequency(mode.id);
                }}
                className={`min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold border active:scale-[0.98] transition cursor-pointer ${
                  active
                    ? 'bg-amber-700 text-white border-amber-700'
                    : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Income Source / Description
          </label>
          <input
            type="text"
            required
            value={incTitle}
            onChange={(e) => setIncTitle(e.target.value)}
            placeholder={
              incFrequency === 'one-off'
                ? 'e.g., Additional work, bonus, refund, sale...'
                : 'e.g., Monthly Salary (Net)...'
            }
            className={getFieldClass('amber')}
          />
        </div>

        {incFrequency === 'one-off' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
                Net Amount (£)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={incAmount}
                onChange={(e) => setIncAmount(e.target.value)}
                placeholder="0.00"
                className={getFieldClass('amber', 'font-bold')}
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
                Date Received / Assigned
              </label>
              <input
                type="date"
                required
                value={incDate}
                onChange={(e) => setIncDate(e.target.value)}
                className={getFieldClass('amber')}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
                Net Amount (£)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={incAmount}
                onChange={(e) => setIncAmount(e.target.value)}
                placeholder="0.00"
                className={getFieldClass('amber', 'font-bold')}
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
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Person
          </label>
          <select
            value={incOwner}
            onChange={(e) => setIncOwner(e.target.value)}
            className={getFieldClass('amber')}
          >
            <option value="partner1">⚡ {partner1Name}</option>
            <option value="partner2">🌸 {partner2Name}</option>
            <option value="joint">🤝 Joint Household Income</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Notes (Optional)
          </label>
          <input
            type="text"
            value={incNotes}
            onChange={(e) => setIncNotes(e.target.value)}
            placeholder="Optional payday note..."
            className={getFieldClass('amber')}
          />
        </div>
      </form>
    </ModalShell>
  );
}
