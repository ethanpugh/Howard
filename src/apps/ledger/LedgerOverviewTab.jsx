import React, { useMemo } from 'react';
import { CheckCircle2, Repeat, Scale, Users } from 'lucide-react';
import { SectionCard, SubSurface, EmptyStateCard } from '../../components/HowardUI.jsx';
import { formatGBP, toMonthlyAmount } from '../../utils/householdHelpers.js';
import { getPerspectiveShareFactor } from './ledgerConstants.js';

function PartnerSummaryCard({
  name,
  emoji,
  badgeClass,
  filterTextClass,
  netTextClass,
  personalRecTotal,
  jointShareMonthly,
  jointPct,
  personalExpTotal,
  jointExpShare,
  netAfterOutgoings,
  selectedMonthLabel,
  onFilter
}) {
  return (
    <SectionCard className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${badgeClass}`}
        >
          {emoji} {name}&apos;s Ledger
        </span>
        <button
          type="button"
          onClick={onFilter}
          className={`text-xs font-bold hover:underline shrink-0 cursor-pointer ${filterTextClass}`}
        >
          Filter {name} &rarr;
        </button>
      </div>
      <div className="space-y-1.5 text-xs pt-1">
        <div className="flex justify-between gap-2">
          <span className="text-text-muted">Personal DDs &amp; Subs:</span>
          <span className="font-bold shrink-0">{formatGBP(personalRecTotal)}/mo</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-text-muted">Share of Joint Bills ({jointPct}%):</span>
          <span className="font-bold shrink-0">{formatGBP(jointShareMonthly)}/mo</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-text-muted">Personal Expenses ({selectedMonthLabel}):</span>
          <span className="font-bold shrink-0">{formatGBP(personalExpTotal)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-text-muted">Share of Joint Expenses ({jointPct}%):</span>
          <span className="font-bold shrink-0">{formatGBP(jointExpShare)}</span>
        </div>
        <div className="flex justify-between gap-2 pt-2 border-t border-border-subtle text-sm font-extrabold">
          <span>Net After All Outgoings:</span>
          <span className={`shrink-0 ${netTextClass}`}>{formatGBP(netAfterOutgoings)}</span>
        </div>
      </div>
    </SectionCard>
  );
}

function SettlementCard({
  settlement,
  jointPaidByJointTotal,
  splitRule,
  partner1JointPct,
  partner2JointPct,
  partner1Name,
  partner2Name,
  selectedMonthLabel
}) {
  const netBal = settlement.netPartner1Balance;
  const isSettledEven = Math.abs(netBal) < 0.01;
  const payerName = netBal > 0 ? partner2Name : partner1Name;
  const payeeName = netBal > 0 ? partner1Name : partner2Name;

  const partnerCards = [
    {
      key: 'partner1',
      emoji: '⚡',
      name: partner1Name,
      paidForJoint: settlement.partner1PaidForJoint,
      coveredOtherLabel: `Covered ${partner2Name}'s personal items:`,
      coveredOtherAmount: settlement.partner1PaidForPartner2Personal,
      personalByJoint: settlement.partner1PersonalPaidByJoint
    },
    {
      key: 'partner2',
      emoji: '🌸',
      name: partner2Name,
      paidForJoint: settlement.partner2PaidForJoint,
      coveredOtherLabel: `Covered ${partner1Name}'s personal items:`,
      coveredOtherAmount: settlement.partner2PaidForPartner1Personal,
      personalByJoint: settlement.partner2PersonalPaidByJoint
    }
  ];

  return (
    <SectionCard className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-extrabold">
            Who Paid What — {selectedMonthLabel} Settlement
          </h3>
          <p className="text-xs text-text-muted">
            Card &amp; joint-account expense breakdown between {partner1Name} and {partner2Name}
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-500/15 text-orange-800 dark:text-orange-300 border border-orange-500/30">
          {splitRule === 'proportional' ? 'Proportional' : '50/50'} Split ({partner1JointPct}% /{' '}
          {partner2JointPct}%)
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {partnerCards.map((p) => (
          <SubSurface key={p.key} className="p-3.5 sm:p-4 space-y-2">
            <div className="text-xs font-extrabold flex items-center gap-1.5">
              <span>{p.emoji}</span>
              <span>{p.name}</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-text-muted">Paid for Joint expenses:</span>
                <span className="font-bold shrink-0">{formatGBP(p.paidForJoint)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-text-muted">{p.coveredOtherLabel}</span>
                <span className="font-bold shrink-0">{formatGBP(p.coveredOtherAmount)}</span>
              </div>
              {p.personalByJoint > 0 && (
                <div className="flex justify-between gap-2">
                  <span className="text-text-muted">Personal items paid from Joint account:</span>
                  <span className="font-bold shrink-0">{formatGBP(p.personalByJoint)}</span>
                </div>
              )}
            </div>
          </SubSurface>
        ))}
      </div>

      {jointPaidByJointTotal > 0 && (
        <p className="text-xs text-text-muted px-1">
          {formatGBP(jointPaidByJointTotal)} in joint expenses paid directly from the Joint Account
        </p>
      )}

      <div
        className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs sm:text-sm font-bold ${
          isSettledEven
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
            : 'bg-orange-500/15 border-orange-500/30 text-orange-900 dark:text-orange-200'
        }`}
      >
        {isSettledEven ? (
          <>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>All settled even for {selectedMonthLabel}</span>
          </>
        ) : (
          <>
            <Scale className="w-4 h-4 shrink-0" />
            <span>
              {payerName} transfers {formatGBP(Math.abs(netBal))} to {payeeName} to settle{' '}
              {selectedMonthLabel}
            </span>
          </>
        )}
      </div>
    </SectionCard>
  );
}

export default function LedgerOverviewTab({
  financialSummary,
  recurring,
  upcomingBills,
  perspective,
  splitRule,
  selectedMonthLabel,
  partner1Name,
  partner2Name,
  ownerMeta,
  onSetPerspective,
  onOpenRecurringTab
}) {
  const { jointPaidByJointTotal, categoryBreakdown } = useMemo(() => {
    const map = {};
    let grandTotal = 0;

    for (const r of recurring) {
      if (r.active === false) continue;
      const weight = getPerspectiveShareFactor(
        r.owner,
        perspective,
        financialSummary.partner1JointShare,
        financialSummary.partner2JointShare
      );
      if (weight <= 0) continue;
      const val = toMonthlyAmount(r.amount, r.cycle) * weight;
      const cat = r.category || 'Other';
      map[cat] = (map[cat] || 0) + val;
      grandTotal += val;
    }

    let jointByJoint = 0;
    for (const e of financialSummary.monthExpenses) {
      if (!e) continue;
      const amt = Number(e.amount) || 0;
      if (e.owner === 'joint' && e.paidBy === 'joint') {
        jointByJoint += amt;
      }
      const weight = getPerspectiveShareFactor(
        e.owner,
        perspective,
        financialSummary.partner1JointShare,
        financialSummary.partner2JointShare
      );
      if (weight <= 0) continue;
      const val = amt * weight;
      const cat = e.category || 'Other';
      map[cat] = (map[cat] || 0) + val;
      grandTotal += val;
    }

    const breakdown = Object.entries(map)
      .map(([cat, amount]) => ({
        category: cat,
        amount,
        pct: grandTotal > 0 ? Math.round((amount / grandTotal) * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    return { jointPaidByJointTotal: jointByJoint, categoryBreakdown: breakdown };
  }, [
    recurring,
    financialSummary.monthExpenses,
    financialSummary.partner1JointShare,
    financialSummary.partner2JointShare,
    perspective
  ]);

  const partner1NetAfter =
    financialSummary.partner1Income +
    financialSummary.jointIncome * financialSummary.partner1JointShare -
    financialSummary.partner1TotalRec.total -
    (financialSummary.partner1PersonalExpTotal +
      financialSummary.jointExpTotal * financialSummary.partner1JointShare);

  const partner2NetAfter =
    financialSummary.partner2Income +
    financialSummary.jointIncome * financialSummary.partner2JointShare -
    financialSummary.partner2TotalRec.total -
    (financialSummary.partner2PersonalExpTotal +
      financialSummary.jointExpTotal * financialSummary.partner2JointShare);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Side-by-Side Comparison: Joint vs Partner 1 vs Partner 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
        <SectionCard className="md:col-span-2 xl:col-span-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-surface-muted text-text-secondary">
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>Joint / Household Bills</span>
            </span>
            <button
              type="button"
              onClick={() => onSetPerspective('joint')}
              className="text-xs font-bold text-orange-700 dark:text-orange-400 hover:underline shrink-0 cursor-pointer"
            >
              Filter Joint &rarr;
            </button>
          </div>
          <div className="space-y-1.5 text-xs pt-1">
            {financialSummary.jointIncome > 0 && (
              <div className="flex justify-between gap-2">
                <span className="text-text-muted">Joint Income:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                  {formatGBP(financialSummary.jointIncome)}/mo
                </span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-text-muted">Joint Direct Debits:</span>
              <span className="font-bold shrink-0">
                {formatGBP(financialSummary.jointRec.directDebits)}/mo
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-muted">Joint Subscriptions:</span>
              <span className="font-bold shrink-0">
                {formatGBP(financialSummary.jointRec.subscriptions)}/mo
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-text-muted">Joint Expenses ({selectedMonthLabel}):</span>
              <span className="font-bold shrink-0">
                {formatGBP(financialSummary.jointExpTotal)}
              </span>
            </div>
            <div className="flex justify-between gap-2 pt-2 border-t border-border-subtle text-sm font-extrabold">
              <span>Total Joint Outgoings:</span>
              <span className="text-orange-700 dark:text-orange-400 shrink-0">
                {formatGBP(financialSummary.jointRec.total + financialSummary.jointExpTotal)}
              </span>
            </div>
          </div>
        </SectionCard>

        <PartnerSummaryCard
          name={partner1Name}
          emoji="⚡"
          badgeClass="bg-teal-500/15 text-teal-700 dark:text-teal-300"
          filterTextClass="text-teal-600 dark:text-teal-400"
          netTextClass="text-teal-600 dark:text-teal-400"
          personalRecTotal={financialSummary.partner1PersonalRec.total}
          jointShareMonthly={financialSummary.partner1TotalRec.jointShare}
          jointPct={financialSummary.partner1JointPct}
          personalExpTotal={financialSummary.partner1PersonalExpTotal}
          jointExpShare={financialSummary.jointExpTotal * financialSummary.partner1JointShare}
          netAfterOutgoings={partner1NetAfter}
          selectedMonthLabel={selectedMonthLabel}
          onFilter={() => onSetPerspective('partner1')}
        />

        <PartnerSummaryCard
          name={partner2Name}
          emoji="🌸"
          badgeClass="bg-rose-500/15 text-rose-700 dark:text-rose-300"
          filterTextClass="text-rose-600 dark:text-rose-400"
          netTextClass="text-rose-600 dark:text-rose-400"
          personalRecTotal={financialSummary.partner2PersonalRec.total}
          jointShareMonthly={financialSummary.partner2TotalRec.jointShare}
          jointPct={financialSummary.partner2JointPct}
          personalExpTotal={financialSummary.partner2PersonalExpTotal}
          jointExpShare={financialSummary.jointExpTotal * financialSummary.partner2JointShare}
          netAfterOutgoings={partner2NetAfter}
          selectedMonthLabel={selectedMonthLabel}
          onFilter={() => onSetPerspective('partner2')}
        />
      </div>

      <SettlementCard
        settlement={financialSummary.settlement}
        jointPaidByJointTotal={jointPaidByJointTotal}
        splitRule={splitRule}
        partner1JointPct={financialSummary.partner1JointPct}
        partner2JointPct={financialSummary.partner2JointPct}
        partner1Name={partner1Name}
        partner2Name={partner2Name}
        selectedMonthLabel={selectedMonthLabel}
      />

      {/* Two-Column Lower Grid: Category Breakdown + Upcoming Direct Debits/Subs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <SectionCard className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold">
                Outgoings by Category ({ownerMeta[perspective]?.shortLabel})
              </h3>
              <p className="text-xs text-text-muted">
                Combines monthly Direct Debits, Subscriptions, and {selectedMonthLabel} expenses
              </p>
            </div>
          </div>

          {categoryBreakdown.length > 0 ? (
            <div className="space-y-3">
              {categoryBreakdown.map((item) => (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-bold">
                    <span>{item.category}</span>
                    <span className="shrink-0">
                      {formatGBP(item.amount)} ({item.pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-700"
                      style={{ width: `${Math.max(3, item.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyStateCard
              accent="orange"
              icon={Scale}
              title="No outgoings recorded yet"
              description="No outgoings recorded for this view yet."
            />
          )}
        </SectionCard>

        <SectionCard className="lg:col-span-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-extrabold">Upcoming Direct Debits &amp; Subs</h3>
              <p className="text-xs text-text-muted">Due within the next 10 days</p>
            </div>
            <button
              type="button"
              onClick={onOpenRecurringTab}
              className="text-xs font-bold text-orange-700 dark:text-orange-400 hover:underline shrink-0 cursor-pointer"
            >
              View All &rarr;
            </button>
          </div>

          {upcomingBills.length > 0 ? (
            <div className="space-y-2.5">
              {upcomingBills.map((bill) => (
                <SubSurface
                  key={bill.id}
                  className="p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-bold truncate">
                      <span>{ownerMeta[bill.owner]?.badgeEmoji || '🤝'}</span>
                      <span className="truncate">{bill.title}</span>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {bill.scheduleLabel} •{' '}
                      <span className="font-semibold text-orange-700 dark:text-orange-400">
                        {bill.daysUntil === 0
                          ? 'Due Today'
                          : `In ${bill.daysUntil}d (${bill.nextDateFormatted})`}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-extrabold tabular-nums">{formatGBP(bill.amount)}</div>
                    <div className="text-xs uppercase font-bold text-text-muted">
                      {bill.type === 'direct-debit' ? 'Direct Debit' : 'Sub'}
                    </div>
                  </div>
                </SubSurface>
              ))}
            </div>
          ) : (
            <EmptyStateCard
              accent="orange"
              icon={Repeat}
              title="No upcoming bills"
              description="No Direct Debits or Subscriptions due in the next 10 days."
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
