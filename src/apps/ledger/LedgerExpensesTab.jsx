import React from 'react';
import { Edit3, Plus, Receipt, Search, Trash2 } from 'lucide-react';
import { SectionCard, EmptyStateCard, getFieldClass } from '../../components/HowardUI.jsx';
import { formatGBP } from '../../utils/householdHelpers.js';
import { EXPENSE_CATEGORIES } from './ledgerConstants.js';

export default function LedgerExpensesTab({
  filteredExpenses,
  selectedMonthLabel,
  expenseSearch,
  onChangeSearch,
  expenseCategoryFilter,
  onChangeCategoryFilter,
  ownerMeta,
  onOpenNewExpense,
  onOpenEditExpense,
  onRequestDelete
}) {
  const filteredTotal = filteredExpenses.reduce(
    (acc, e) => acc + (Number(e.effectiveAmount ?? e.amount) || 0),
    0
  );

  return (
    <SectionCard className="space-y-3 sm:space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">
            {selectedMonthLabel} Expenses Log ({filteredExpenses.length})
          </h2>
          <p className="text-xs text-text-muted">
            Day-to-day household &amp; personal spending • Filtered total:{' '}
            <strong>{formatGBP(filteredTotal)}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative flex-1 sm:flex-initial sm:w-52 min-w-0">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={expenseSearch}
              onChange={(e) => onChangeSearch(e.target.value)}
              placeholder="Search expenses..."
              aria-label="Search expenses"
              className={getFieldClass('orange', 'pl-9 min-h-[40px]', { compact: true })}
            />
          </div>

          <div className="min-w-0 w-full sm:w-auto">
            <select
              value={expenseCategoryFilter}
              aria-label="Filter expenses by category"
              onChange={(e) => onChangeCategoryFilter(e.target.value)}
              className={getFieldClass('orange', 'min-h-[40px] font-bold', { compact: true })}
            >
              <option value="All">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onOpenNewExpense}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-orange-700 hover:bg-orange-800 text-white text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-[0.98] transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Expense</span>
          </button>
        </div>
      </div>

      {filteredExpenses.length > 0 ? (
        <div className="divide-y divide-border-subtle">
          {filteredExpenses.map((exp) => {
            const ownerInfo = ownerMeta[exp.owner] || ownerMeta.joint;
            const paidByInfo = ownerMeta[exp.paidBy] || ownerMeta.partner1;
            return (
              <div
                key={exp.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-mono font-bold text-text-muted">{exp.date}</span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-md ${ownerInfo.badgeClass}`}
                    >
                      For: {ownerInfo.badgeEmoji} {ownerInfo.shortLabel}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-surface-subtle text-text-secondary">
                      Paid by: {paidByInfo.shortLabel}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-800 dark:text-orange-300">
                      {exp.category}
                    </span>
                  </div>
                  <div className="font-extrabold text-sm sm:text-base">{exp.title}</div>
                  {exp.notes && <div className="text-xs text-text-muted">{exp.notes}</div>}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-base sm:text-lg font-extrabold">
                      {formatGBP(exp.amount)}
                    </div>
                    {exp.shareFactor < 1 && (
                      <div className="text-xs text-text-muted">
                        Your share: <strong>{formatGBP(exp.effectiveAmount)}</strong>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenEditExpense(exp)}
                      className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-text-muted hover:text-orange-700 dark:hover:text-orange-400 hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer"
                      title="Edit expense"
                      aria-label={`Edit ${exp.title}`}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onRequestDelete({
                          kind: 'expense',
                          id: exp.id,
                          label: exp.title
                        })
                      }
                      className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-text-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer"
                      title="Delete expense"
                      aria-label={`Delete ${exp.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyStateCard
          accent="orange"
          icon={Receipt}
          title={`No expenses logged for ${selectedMonthLabel} matching this filter`}
          description="Log groceries, vet bills, or shared spending to track monthly outgoings."
          action={
            <button
              type="button"
              onClick={onOpenNewExpense}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-800 text-white text-xs font-bold cursor-pointer"
            >
              + Log First Expense for {selectedMonthLabel}
            </button>
          }
        />
      )}
    </SectionCard>
  );
}
