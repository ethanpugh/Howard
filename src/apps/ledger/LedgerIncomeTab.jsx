import React from 'react';
import { CheckCircle2, Edit3, Plus, Trash2, TrendingUp, Users } from 'lucide-react';
import { SectionCard, SubSurface, EmptyStateCard } from '../../components/HowardUI.jsx';
import {
  formatGBP,
  getLedgerScheduleInfo,
  toMonthlyAmount
} from '../../utils/householdHelpers.js';

export default function LedgerIncomeTab({
  filteredIncomes,
  selectedMonth,
  selectedMonthLabel,
  todayStr,
  todayDateObj,
  perspective,
  ownerMeta,
  financialSummary,
  splitRule,
  partner1Name,
  partner2Name,
  onOpenNewIncome,
  onOpenEditIncome,
  onRequestDelete,
  onChangeSplitRule
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
      {/* Income Streams List (7 cols) */}
      <SectionCard className="lg:col-span-7 space-y-3 sm:space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold">
              Household Income ({selectedMonthLabel})
            </h2>
            <p className="text-xs text-text-muted">
              Showing {ownerMeta[perspective]?.label} •{' '}
              {perspective === 'unified' ? 'Household total' : 'Share'} (Recurring salaries +{' '}
              {selectedMonthLabel} one-offs):{' '}
              <strong>
                {formatGBP(
                  perspective === 'unified'
                    ? financialSummary.totalHouseholdIncome
                    : financialSummary.activeKpi.income
                )}
              </strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenNewIncome('one-off')}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1 active:scale-[0.98] transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>One-Off Income</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenNewIncome('monthly')}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold flex items-center gap-1 active:scale-[0.98] transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Recurring Salary</span>
            </button>
          </div>
        </div>

        {filteredIncomes.length > 0 ? (
          <div className="space-y-3">
            {filteredIncomes.map((inc) => {
              const ownerInfo = ownerMeta[inc.owner] || ownerMeta.partner1;
              const isOneOff = inc.frequency === 'one-off';
              const inSelectedMonth =
                !isOneOff || (inc.date || todayStr).slice(0, 7) === selectedMonth;
              const monthlyEq = toMonthlyAmount(inc.amount, inc.frequency);

              return (
                <div
                  key={inc.id}
                  className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-2 sm:gap-3 ${
                    !inSelectedMonth
                      ? 'border-dashed border-border-strong bg-surface-muted/40'
                      : 'bg-surface-subtle border-border-subtle'
                  }`}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-md ${ownerInfo.badgeClass}`}
                      >
                        {ownerInfo.badgeEmoji} {ownerInfo.shortLabel}
                      </span>
                      <span
                        className={`text-xs font-bold uppercase px-2 py-0.5 rounded-md ${
                          isOneOff
                            ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                        }`}
                      >
                        {isOneOff
                          ? `One-Off • ${inc.date || todayStr}`
                          : `Recurring (${inc.frequency})`}
                      </span>
                      {!isOneOff && (
                        <span className="text-xs text-text-muted">
                          Payday: {getLedgerScheduleInfo(inc, true, todayDateObj).scheduleLabel}
                        </span>
                      )}
                    </div>
                    <div
                      className={`font-extrabold text-sm sm:text-base ${
                        !inSelectedMonth ? 'text-text-muted' : ''
                      }`}
                    >
                      {inc.title}
                    </div>
                    {inc.notes && <div className="text-xs text-text-muted">{inc.notes}</div>}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div
                        className={`text-base font-extrabold ${
                          inSelectedMonth
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-text-muted'
                        }`}
                      >
                        {formatGBP(inc.amount)}
                      </div>
                      <div className="text-xs text-text-muted capitalize">
                        {isOneOff
                          ? inSelectedMonth
                            ? `Included in ${selectedMonthLabel}`
                            : `Logged in ${(inc.date || '').slice(0, 7)}`
                          : `${inc.frequency} (${formatGBP(monthlyEq)}/mo)`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenEditIncome(inc)}
                      className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-text-muted hover:text-amber-700 dark:hover:text-amber-400 hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer"
                      title="Edit income"
                      aria-label={`Edit ${inc.title}`}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onRequestDelete({
                          kind: 'income',
                          id: inc.id,
                          label: inc.title
                        })
                      }
                      className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-text-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer"
                      title="Delete income"
                      aria-label={`Delete ${inc.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyStateCard
            accent="amber"
            icon={TrendingUp}
            title={`No income streams match ${ownerMeta[perspective]?.label}`}
            description="Add recurring salaries or one-off payments to calculate monthly remainders."
            action={
              <button
                type="button"
                onClick={() => onOpenNewIncome('monthly')}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold active:scale-[0.98] transition cursor-pointer"
              >
                + Add Recurring Salary
              </button>
            }
          />
        )}
      </SectionCard>

      {/* Joint Bill Split Configuration (5 cols) */}
      <SectionCard className="lg:col-span-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold">Joint Household Split Rule</h3>
            <p className="text-xs text-text-muted">
              How shared bills &amp; joint expenses are divided between {partner1Name} and{' '}
              {partner2Name}
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {[
            {
              id: '50-50',
              title: '50% / 50% Equal Split',
              desc: 'Joint Direct Debits, Subscriptions, and shared expenses are split equally down the middle.'
            },
            {
              id: 'proportional',
              title: 'Income-Proportional Split',
              desc: `Weighted automatically by net monthly income (${financialSummary.proportionalPartner1Pct}% ${partner1Name} / ${financialSummary.proportionalPartner2Pct}% ${partner2Name}).`
            }
          ].map((opt) => {
            const active = splitRule === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeSplitRule(opt.id)}
                className={`w-full p-4 rounded-2xl border text-left active:scale-[0.98] transition cursor-pointer ${
                  active
                    ? 'ring-2 ring-amber-600 border-amber-600 bg-amber-500/10'
                    : 'bg-surface-subtle border-border-strong hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-extrabold text-sm">{opt.title}</span>
                  {active && (
                    <CheckCircle2 className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                  )}
                </div>
                <p className="text-xs text-text-muted leading-relaxed">{opt.desc}</p>
              </button>
            );
          })}
        </div>

        <SubSurface className="p-4 text-xs space-y-1.5 bg-amber-500/5 border-amber-500/20">
          <div className="font-bold text-amber-800 dark:text-amber-300">
            Monthly Joint Contribution Target:
          </div>
          <div className="flex justify-between gap-2">
            <span>⚡ {partner1Name}&apos;s Joint Share:</span>
            <strong className="shrink-0">
              {formatGBP(financialSummary.partner1TotalRec.jointShare)}/mo
            </strong>
          </div>
          <div className="flex justify-between gap-2">
            <span>🌸 {partner2Name}&apos;s Joint Share:</span>
            <strong className="shrink-0">
              {formatGBP(financialSummary.partner2TotalRec.jointShare)}/mo
            </strong>
          </div>
        </SubSurface>
      </SectionCard>
    </div>
  );
}
