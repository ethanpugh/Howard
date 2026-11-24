import React, { useState, useMemo } from 'react';
import {
  Wallet,
  Plus,
  CreditCard,
  Receipt,
  TrendingUp,
  Repeat,
  Download,
  Scale,
  Calendar,
  ChevronLeft,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
import {
  getLocalDateKey,
  parseLocalDateKey,
  formatGBP,
  toMonthlyAmount,
  escapeCSVCell,
  downloadTextFile,
  computeLedgerSettlement,
  getLedgerScheduleInfo
} from '../utils/householdHelpers.js';
import {
  ModuleHeader,
  SegmentedTabs,
  SectionCard,
  ConfirmModal
} from '../components/HowardUI.jsx';
import {
  buildOwnerMeta,
  matchesLedgerPerspective,
  getPerspectiveShareFactor
} from './ledger/ledgerConstants.js';
import LedgerOverviewTab from './ledger/LedgerOverviewTab.jsx';
import LedgerRecurringTab from './ledger/LedgerRecurringTab.jsx';
import LedgerExpensesTab from './ledger/LedgerExpensesTab.jsx';
import LedgerIncomeTab from './ledger/LedgerIncomeTab.jsx';
import {
  ExpenseModal,
  RecurringModal,
  IncomeModal
} from './ledger/LedgerModals.jsx';

function LedgerApp({
  activeProfile,
  profiles,
  darkMode: _darkMode,
  nowMs = Date.now(),
  todayKey: todayKeyProp,
  ledgerData,
  onUpsertLedgerItem,
  onDeleteLedgerItem,
  onSaveSplitRule,
  onSaveLedgerData,
  showToast
}) {
  const todayStr = useMemo(
    () => todayKeyProp || getLocalDateKey(new Date(nowMs)),
    [todayKeyProp, nowMs]
  );
  const todayDateObj = useMemo(() => parseLocalDateKey(todayStr), [todayStr]);

  const partner1Name = (profiles || []).find((p) => p.id === 'partner1')?.name || 'Partner 1';
  const partner2Name = (profiles || []).find((p) => p.id === 'partner2')?.name || 'Partner 2';

  const ownerMeta = useMemo(
    () => buildOwnerMeta(partner1Name, partner2Name),
    [partner1Name, partner2Name]
  );

  const [perspective, setPerspective] = useState('unified');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedMonth, setSelectedMonth] = useState(() => todayStr.slice(0, 7));
  const [recurringTypeFilter, setRecurringTypeFilter] = useState('all');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('All');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [modalState, setModalState] = useState(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);

  const incomes = useMemo(() => ledgerData?.incomes || [], [ledgerData]);
  const recurring = useMemo(() => ledgerData?.recurring || [], [ledgerData]);
  const expenses = useMemo(() => ledgerData?.expenses || [], [ledgerData]);
  const splitRule = ledgerData?.splitRule || '50-50';

  const shiftSelectedMonth = (deltaMonths) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + deltaMonths, 1);
    const ny = d.getFullYear();
    const nm = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${ny}-${nm}`);
  };

  const selectedMonthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric'
    });
  }, [selectedMonth]);

  const financialSummary = useMemo(() => {
    const getIncomeForSelectedMonth = (inc) => {
      if (inc.frequency === 'one-off') {
        const incMonth = (inc.date || todayStr).slice(0, 7);
        return incMonth === selectedMonth ? Number(inc.amount) || 0 : 0;
      }
      return toMonthlyAmount(inc.amount, inc.frequency);
    };

    let partner1Income = 0;
    let partner2Income = 0;
    let jointIncome = 0;
    for (const inc of incomes) {
      const val = getIncomeForSelectedMonth(inc);
      if (inc.owner === 'partner1') partner1Income += val;
      else if (inc.owner === 'partner2') partner2Income += val;
      else if (inc.owner === 'joint') jointIncome += val;
    }

    const totalHouseholdIncome = partner1Income + partner2Income + jointIncome;
    const combinedPersonalIncome = partner1Income + partner2Income;
    const proportionalPartner1Share =
      combinedPersonalIncome > 0 ? partner1Income / combinedPersonalIncome : 0.5;
    const partner1JointShare = splitRule === 'proportional' ? proportionalPartner1Share : 0.5;
    const partner2JointShare = 1 - partner1JointShare;
    const partner1JointPct = Math.round(partner1JointShare * 100);
    const partner2JointPct = 100 - partner1JointPct;
    const proportionalPartner1Pct = Math.round(proportionalPartner1Share * 100);
    const proportionalPartner2Pct = 100 - proportionalPartner1Pct;

    const unifiedRec = { total: 0, directDebits: 0, subscriptions: 0 };
    const jointRec = { total: 0, directDebits: 0, subscriptions: 0 };
    const partner1PersonalRec = { total: 0, directDebits: 0, subscriptions: 0 };
    const partner2PersonalRec = { total: 0, directDebits: 0, subscriptions: 0 };

    for (const r of recurring) {
      if (r.active === false) continue;
      const monthlyVal = toMonthlyAmount(r.amount, r.cycle);
      const isDD = r.type === 'direct-debit';
      unifiedRec.total += monthlyVal;
      if (isDD) unifiedRec.directDebits += monthlyVal;
      else unifiedRec.subscriptions += monthlyVal;

      const bucket =
        r.owner === 'joint'
          ? jointRec
          : r.owner === 'partner1'
            ? partner1PersonalRec
            : r.owner === 'partner2'
              ? partner2PersonalRec
              : null;
      if (bucket) {
        bucket.total += monthlyVal;
        if (isDD) bucket.directDebits += monthlyVal;
        else bucket.subscriptions += monthlyVal;
      }
    }

    const partner1TotalRec = {
      total: partner1PersonalRec.total + jointRec.total * partner1JointShare,
      directDebits:
        partner1PersonalRec.directDebits + jointRec.directDebits * partner1JointShare,
      subscriptions:
        partner1PersonalRec.subscriptions + jointRec.subscriptions * partner1JointShare,
      personalOnly: partner1PersonalRec.total,
      jointShare: jointRec.total * partner1JointShare
    };

    const partner2TotalRec = {
      total: partner2PersonalRec.total + jointRec.total * partner2JointShare,
      directDebits:
        partner2PersonalRec.directDebits + jointRec.directDebits * partner2JointShare,
      subscriptions:
        partner2PersonalRec.subscriptions + jointRec.subscriptions * partner2JointShare,
      personalOnly: partner2PersonalRec.total,
      jointShare: jointRec.total * partner2JointShare
    };

    const monthExpenses = [];
    let unifiedExpTotal = 0;
    let jointExpTotal = 0;
    let partner1PersonalExpTotal = 0;
    let partner2PersonalExpTotal = 0;

    for (const e of expenses) {
      if ((e.date || '').slice(0, 7) !== selectedMonth) continue;
      monthExpenses.push(e);
      const amt = Number(e.amount) || 0;
      unifiedExpTotal += amt;
      if (e.owner === 'joint') jointExpTotal += amt;
      else if (e.owner === 'partner1') partner1PersonalExpTotal += amt;
      else if (e.owner === 'partner2') partner2PersonalExpTotal += amt;
    }

    const partner1TotalExp = partner1PersonalExpTotal + jointExpTotal * partner1JointShare;
    const partner2TotalExp = partner2PersonalExpTotal + jointExpTotal * partner2JointShare;

    const settlement = computeLedgerSettlement(monthExpenses, partner1JointShare);
    const { netPartner1Balance } = settlement;

    let activeKpi = {
      income: totalHouseholdIncome,
      recurring: unifiedRec.total,
      directDebits: unifiedRec.directDebits,
      subscriptions: unifiedRec.subscriptions,
      expenses: unifiedExpTotal,
      netRemainder: totalHouseholdIncome - unifiedRec.total - unifiedExpTotal,
      subtitle: `Combined ${partner1Name} + ${partner2Name} + Joint Household`
    };

    if (perspective === 'joint') {
      activeKpi = {
        income: jointIncome,
        recurring: jointRec.total,
        directDebits: jointRec.directDebits,
        subscriptions: jointRec.subscriptions,
        expenses: jointExpTotal,
        netRemainder: jointRec.total + jointExpTotal,
        subtitle: `Shared Household Commitments (${partner1JointPct}/${partner2JointPct} split)`
      };
    } else if (perspective === 'partner1') {
      const inc = partner1Income + jointIncome * partner1JointShare;
      activeKpi = {
        income: inc,
        recurring: partner1TotalRec.total,
        directDebits: partner1TotalRec.directDebits,
        subscriptions: partner1TotalRec.subscriptions,
        expenses: partner1TotalExp,
        netRemainder: inc - partner1TotalRec.total - partner1TotalExp,
        subtitle: `${partner1Name} Personal (${formatGBP(partner1PersonalRec.total)}/mo) + ${partner1JointPct}% Joint Share (${formatGBP(partner1TotalRec.jointShare)}/mo)`
      };
    } else if (perspective === 'partner2') {
      const inc = partner2Income + jointIncome * partner2JointShare;
      activeKpi = {
        income: inc,
        recurring: partner2TotalRec.total,
        directDebits: partner2TotalRec.directDebits,
        subscriptions: partner2TotalRec.subscriptions,
        expenses: partner2TotalExp,
        netRemainder: inc - partner2TotalRec.total - partner2TotalExp,
        subtitle: `${partner2Name} Personal (${formatGBP(partner2PersonalRec.total)}/mo) + ${partner2JointPct}% Joint Share (${formatGBP(partner2TotalRec.jointShare)}/mo)`
      };
    }

    return {
      partner1Income,
      partner2Income,
      jointIncome,
      totalHouseholdIncome,
      proportionalPartner1Share,
      partner1JointShare,
      partner2JointShare,
      partner1JointPct,
      partner2JointPct,
      proportionalPartner1Pct,
      proportionalPartner2Pct,
      unifiedRec,
      jointRec,
      partner1PersonalRec,
      partner2PersonalRec,
      partner1TotalRec,
      partner2TotalRec,
      monthExpenses,
      unifiedExpTotal,
      jointExpTotal,
      partner1PersonalExpTotal,
      partner2PersonalExpTotal,
      settlement,
      netPartner1Balance,
      activeKpi
    };
  }, [incomes, recurring, expenses, selectedMonth, perspective, splitRule, partner1Name, partner2Name, todayStr]);

  const filteredRecurring = useMemo(() => {
    return recurring
      .filter((item) => {
        if (!matchesLedgerPerspective(item.owner, perspective)) return false;
        if (recurringTypeFilter !== 'all' && item.type !== recurringTypeFilter) return false;
        return true;
      })
      .map((item) => {
        const { daysUntil, nextDateFormatted, scheduleLabel } = getLedgerScheduleInfo(
          item,
          false,
          todayDateObj
        );
        const monthlyEquiv = toMonthlyAmount(item.amount, item.cycle);
        const perspectiveShareFactor = getPerspectiveShareFactor(
          item.owner,
          perspective,
          financialSummary.partner1JointShare,
          financialSummary.partner2JointShare
        );
        return {
          ...item,
          daysUntil,
          nextDateFormatted,
          scheduleLabel,
          monthlyEquiv,
          perspectiveShareFactor,
          perspectiveMonthlyEquiv: monthlyEquiv * perspectiveShareFactor
        };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [
    recurring,
    perspective,
    recurringTypeFilter,
    financialSummary.partner1JointShare,
    financialSummary.partner2JointShare,
    todayDateObj
  ]);

  const filteredIncomes = useMemo(() => {
    return incomes.filter((inc) => matchesLedgerPerspective(inc.owner, perspective));
  }, [incomes, perspective]);

  const perspectiveCounts = useMemo(() => {
    return {
      recurring: recurring.filter((r) => matchesLedgerPerspective(r.owner, perspective)).length,
      expenses: financialSummary.monthExpenses.filter((e) =>
        matchesLedgerPerspective(e.owner, perspective)
      ).length,
      incomes: filteredIncomes.length
    };
  }, [recurring, financialSummary.monthExpenses, filteredIncomes.length, perspective]);

  const filteredExpenses = useMemo(() => {
    const q = expenseSearch.trim().toLowerCase();
    return financialSummary.monthExpenses
      .filter((exp) => {
        if (!matchesLedgerPerspective(exp.owner, perspective)) return false;
        if (expenseCategoryFilter !== 'All' && exp.category !== expenseCategoryFilter) return false;
        if (q) {
          const matchTitle = (exp.title || '').toLowerCase().includes(q);
          const matchCat = (exp.category || '').toLowerCase().includes(q);
          const matchNotes = (exp.notes || '').toLowerCase().includes(q);
          if (!matchTitle && !matchCat && !matchNotes) return false;
        }
        return true;
      })
      .map((exp) => {
        const shareFactor = getPerspectiveShareFactor(
          exp.owner,
          perspective,
          financialSummary.partner1JointShare,
          financialSummary.partner2JointShare
        );
        return {
          ...exp,
          shareFactor,
          effectiveAmount: (Number(exp.amount) || 0) * shareFactor
        };
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [
    financialSummary.monthExpenses,
    financialSummary.partner1JointShare,
    financialSummary.partner2JointShare,
    perspective,
    expenseCategoryFilter,
    expenseSearch
  ]);

  const upcomingBills = useMemo(() => {
    return recurring
      .filter((r) => r.active !== false && matchesLedgerPerspective(r.owner, perspective))
      .map((r) => ({
        ...r,
        ...getLedgerScheduleInfo(r, false, todayDateObj)
      }))
      .filter((r) => r.daysUntil <= 10)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [recurring, perspective, todayDateObj]);

  const handleToggleRecurringActive = async (rec) => {
    const toggledRecord = { ...rec, active: rec.active === false };
    const nextRecurring = recurring.map((r) => (r.id === rec.id ? toggledRecord : r));
    const nextLedgerData = { ...ledgerData, recurring: nextRecurring };
    const msg = `${rec.active === false ? 'Resumed' : 'Paused'} "${rec.title}"`;
    if (onUpsertLedgerItem) {
      await onUpsertLedgerItem({ kind: 'recurring', record: toggledRecord, nextLedgerData }, msg);
    } else {
      await onSaveLedgerData(nextLedgerData, msg);
    }
  };

  const handleDeleteTarget = async (target) => {
    const listKey =
      target.kind === 'recurring'
        ? 'recurring'
        : target.kind === 'expense'
          ? 'expenses'
          : 'incomes';
    const msg =
      target.kind === 'recurring'
        ? 'Removed recurring item'
        : target.kind === 'expense'
          ? 'Deleted expense entry'
          : 'Removed income stream';
    const nextList = (ledgerData?.[listKey] || []).filter((item) => item.id !== target.id);
    const nextLedgerData = { ...ledgerData, [listKey]: nextList };
    if (onDeleteLedgerItem) {
      await onDeleteLedgerItem({ id: target.id, nextLedgerData }, msg);
    } else {
      await onSaveLedgerData(nextLedgerData, msg);
    }
  };

  const handleChangeSplitRule = async (nextRule) => {
    const nextLedgerData = { ...ledgerData, splitRule: nextRule };
    const msg = `Updated joint bill split rule to ${nextRule === 'proportional' ? 'Income-Proportional' : '50/50 Equal'}`;
    if (onSaveSplitRule) {
      await onSaveSplitRule({ splitRule: nextRule, nextLedgerData }, msg);
    } else {
      await onSaveLedgerData(nextLedgerData, msg);
    }
  };

  const handleExportMonthCSV = () => {
    const labelOwner = (id) => ownerMeta[id]?.shortLabel || id || '';

    const headers = [
      'Type',
      'Date_or_Schedule',
      'Title',
      'Category',
      'For_Owner',
      'Paid_By',
      'Amount_GBP',
      'Monthly Equivalent (GBP)',
      'Perspective_Share_GBP',
      'Notes'
    ].map(escapeCSVCell);

    const rows = [
      ...recurring
        .filter((r) => r.active !== false && matchesLedgerPerspective(r.owner, perspective))
        .map((r) => {
          const monthlyEq = toMonthlyAmount(r.amount, r.cycle);
          const shareFactor = getPerspectiveShareFactor(
            r.owner,
            perspective,
            financialSummary.partner1JointShare,
            financialSummary.partner2JointShare
          );
          return [
            escapeCSVCell(r.type === 'direct-debit' ? 'Direct Debit' : 'Subscription'),
            escapeCSVCell(
              `${getLedgerScheduleInfo(r, false, todayDateObj).scheduleLabel} (${r.cycle})`
            ),
            escapeCSVCell(r.title),
            escapeCSVCell(r.category),
            escapeCSVCell(labelOwner(r.owner)),
            escapeCSVCell(labelOwner(r.owner)),
            escapeCSVCell(Number(r.amount || 0).toFixed(2)),
            escapeCSVCell(monthlyEq.toFixed(2)),
            escapeCSVCell((monthlyEq * shareFactor).toFixed(2)),
            escapeCSVCell(r.notes || '')
          ];
        }),
      ...financialSummary.monthExpenses
        .filter((e) => matchesLedgerPerspective(e.owner, perspective))
        .map((e) => {
          const amt = Number(e.amount || 0);
          const shareFactor = getPerspectiveShareFactor(
            e.owner,
            perspective,
            financialSummary.partner1JointShare,
            financialSummary.partner2JointShare
          );
          return [
            escapeCSVCell('Expense'),
            escapeCSVCell(e.date),
            escapeCSVCell(e.title),
            escapeCSVCell(e.category),
            escapeCSVCell(labelOwner(e.owner)),
            escapeCSVCell(labelOwner(e.paidBy)),
            escapeCSVCell(amt.toFixed(2)),
            escapeCSVCell(''),
            escapeCSVCell((amt * shareFactor).toFixed(2)),
            escapeCSVCell(e.notes || '')
          ];
        })
    ];

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadTextFile(
      `Howard_Ledger_${selectedMonth}${perspective !== 'unified' ? `_${perspective}` : ''}.csv`,
      csv,
      'text/csv;charset=utf-8;'
    );
    showToast?.(`Exported ${rows.length} Ledger row${rows.length === 1 ? '' : 's'} to CSV`);
  };

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      <ModuleHeader
        accent="amber"
        icon={Wallet}
        title="Ledger • Household Bookkeeping & Subscriptions"
        subtitle={`Track expenses, Direct Debits, subscriptions, and income — separated between ${partner1Name}, ${partner2Name}, and Unified`}
        actions={
          <>
            <button
              type="button"
              onClick={() => setModalState({ kind: 'expense' })}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-2xs active:scale-[0.98] transition cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Expense</span>
            </button>
            <button
              type="button"
              onClick={() => setModalState({ kind: 'income', defaultFreq: 'one-off' })}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-2xs active:scale-[0.98] transition cursor-pointer"
              title="Log a one-off or variable income payment for this month"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Income</span>
            </button>
            <button
              type="button"
              onClick={() => setModalState({ kind: 'recurring', defaultType: 'direct-debit' })}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-border-strong bg-surface-subtle text-text-primary hover:bg-surface-hover text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-2xs active:scale-[0.98] transition cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Bill / Sub</span>
            </button>
            <button
              type="button"
              onClick={handleExportMonthCSV}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-border-strong bg-surface-subtle text-text-primary hover:bg-surface-hover text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-2xs active:scale-[0.98] transition cursor-pointer"
              title="Export selected month to CSV spreadsheet"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>CSV</span>
            </button>
          </>
        }
        footer={
          <div className="space-y-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-text-muted mr-1 whitespace-nowrap">
                    View Ledger For:
                  </span>
                  {Object.values(ownerMeta).map((meta) => {
                    const active = perspective === meta.id;
                    return (
                      <button
                        key={meta.id}
                        type="button"
                        onClick={() => setPerspective(meta.id)}
                        className={`min-h-[40px] px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 whitespace-nowrap active:scale-[0.98] transition cursor-pointer ${
                          active
                            ? `${meta.pillClass} shadow-xs`
                            : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                        }`}
                      >
                        <span>{meta.badgeEmoji}</span>
                        <span className="sm:hidden">{meta.shortLabel}</span>
                        <span className="hidden sm:inline">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Month Picker for Variable Expenses */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => shiftSelectedMonth(-1)}
                    className="min-w-[40px] min-h-[40px] p-2 rounded-xl border border-border-strong hover:bg-surface-hover flex items-center justify-center active:scale-[0.98] transition cursor-pointer shrink-0"
                    title="Previous Month"
                    aria-label="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="min-h-[40px] px-3 py-1.5 rounded-xl bg-surface-muted text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span>{selectedMonthLabel}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => shiftSelectedMonth(1)}
                    className="min-w-[40px] min-h-[40px] p-2 rounded-xl border border-border-strong hover:bg-surface-hover flex items-center justify-center active:scale-[0.98] transition cursor-pointer shrink-0"
                    title="Next Month"
                    aria-label="Next Month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {selectedMonth !== todayStr.slice(0, 7) && (
                    <button
                      type="button"
                      onClick={() => setSelectedMonth(todayStr.slice(0, 7))}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold whitespace-nowrap active:scale-[0.98] transition cursor-pointer shrink-0"
                    >
                      This Month
                    </button>
                  )}
                </div>
              </div>
            </div>

            <SegmentedTabs
              accent="amber"
              activeId={activeTab}
              onChange={setActiveTab}
              tabs={[
                { id: 'overview', label: 'Overview & Split', shortLabel: 'Summary', icon: Scale },
                {
                  id: 'recurring',
                  label: 'Bills & Direct Debits',
                  shortLabel: 'Bills',
                  icon: CreditCard,
                  badge: perspectiveCounts.recurring
                },
                {
                  id: 'expenses',
                  label: 'Expenses Log',
                  shortLabel: 'Spend',
                  icon: Receipt,
                  badge: perspectiveCounts.expenses
                },
                {
                  id: 'income',
                  label: 'Income & Split Rules',
                  shortLabel: 'Income',
                  icon: TrendingUp,
                  badge: perspectiveCounts.incomes
                }
              ]}
            />
          </div>
        }
      />

      {/* FOUR FINANCIAL KPI SUMMARY CARDS (DYNAMIC BY PERSPECTIVE) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4">
        <SectionCard>
          <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
            <span>{perspective === 'joint' ? 'Joint Pool / Split' : 'Monthly Income'}</span>
            <TrendingUp className="w-4 h-4 shrink-0" />
          </div>
          <div className="text-2xl xl:text-3xl font-extrabold">
            {perspective === 'joint'
              ? `${financialSummary.partner1JointPct}% / ${financialSummary.partner2JointPct}%`
              : formatGBP(financialSummary.activeKpi.income)}
          </div>
          <div className="text-xs text-text-muted mt-1">
            {perspective === 'unified'
              ? `⚡ ${partner1Name} ${formatGBP(financialSummary.partner1Income)} • 🌸 ${partner2Name} ${formatGBP(financialSummary.partner2Income)}${financialSummary.jointIncome > 0 ? ` • 🤝 Joint ${formatGBP(financialSummary.jointIncome)}` : ''}`
              : perspective === 'joint'
                ? `Split rule: ${splitRule === 'proportional' ? 'Proportional to Income' : '50/50 Equal Split'}${financialSummary.jointIncome > 0 ? ` • Joint income: ${formatGBP(financialSummary.jointIncome)}/mo` : ''}`
                : `${ownerMeta[perspective]?.shortLabel}'s monthly net income`}
          </div>
        </SectionCard>

        <SectionCard>
          <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">
            <span>Direct Debits &amp; Subs</span>
            <Repeat className="w-4 h-4 shrink-0" />
          </div>
          <div className="text-2xl xl:text-3xl font-extrabold">
            {formatGBP(financialSummary.activeKpi.recurring)}
            <span className="text-xs font-semibold text-text-muted">/mo</span>
          </div>
          <div className="text-xs text-text-muted mt-1">
            DDs: <strong>{formatGBP(financialSummary.activeKpi.directDebits)}</strong> • Subs:{' '}
            <strong>{formatGBP(financialSummary.activeKpi.subscriptions)}</strong>
          </div>
        </SectionCard>

        <SectionCard>
          <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
            <span>{selectedMonthLabel} Expenses</span>
            <Receipt className="w-4 h-4 shrink-0" />
          </div>
          <div className="text-2xl xl:text-3xl font-extrabold">
            {formatGBP(financialSummary.activeKpi.expenses)}
          </div>
          <div className="text-xs text-text-muted mt-1">
            {financialSummary.activeKpi.subtitle}
          </div>
        </SectionCard>

        <SectionCard>
          <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
            <span>
              {perspective === 'joint' ? 'Total Joint Outgoings' : 'Net Monthly Remainder'}
            </span>
            <Scale className="w-4 h-4 shrink-0" />
          </div>
          <div
            className={`text-2xl xl:text-3xl font-extrabold ${
              perspective !== 'joint' && financialSummary.activeKpi.netRemainder < 0
                ? 'text-rose-600 dark:text-rose-400'
                : ''
            }`}
          >
            {formatGBP(financialSummary.activeKpi.netRemainder)}
          </div>
          <div className="text-xs text-text-muted mt-1">
            {Math.abs(financialSummary.netPartner1Balance) < 0.01
              ? '✓ Joint expenses settled even this month'
              : financialSummary.netPartner1Balance > 0
                ? `🤝 Shared cards: ${partner2Name} owes ${partner1Name} ${formatGBP(financialSummary.netPartner1Balance)}`
                : `🤝 Shared cards: ${partner1Name} owes ${partner2Name} ${formatGBP(Math.abs(financialSummary.netPartner1Balance))}`}
          </div>
        </SectionCard>
      </section>

      {activeTab === 'overview' && (
        <LedgerOverviewTab
          financialSummary={financialSummary}
          recurring={recurring}
          upcomingBills={upcomingBills}
          perspective={perspective}
          splitRule={splitRule}
          selectedMonthLabel={selectedMonthLabel}
          partner1Name={partner1Name}
          partner2Name={partner2Name}
          ownerMeta={ownerMeta}
          onSetPerspective={setPerspective}
          onOpenRecurringTab={() => setActiveTab('recurring')}
        />
      )}

      {activeTab === 'recurring' && (
        <LedgerRecurringTab
          filteredRecurring={filteredRecurring}
          recurringTypeFilter={recurringTypeFilter}
          onChangeTypeFilter={setRecurringTypeFilter}
          perspective={perspective}
          ownerMeta={ownerMeta}
          committedMonthlyTotal={financialSummary.activeKpi.recurring}
          onOpenNewRecurring={(defaultType) =>
            setModalState({ kind: 'recurring', defaultType })
          }
          onOpenEditRecurring={(item) => setModalState({ kind: 'recurring', item })}
          onToggleActive={handleToggleRecurringActive}
          onRequestDelete={setConfirmDeleteItem}
        />
      )}

      {activeTab === 'expenses' && (
        <LedgerExpensesTab
          filteredExpenses={filteredExpenses}
          selectedMonthLabel={selectedMonthLabel}
          expenseSearch={expenseSearch}
          onChangeSearch={setExpenseSearch}
          expenseCategoryFilter={expenseCategoryFilter}
          onChangeCategoryFilter={setExpenseCategoryFilter}
          ownerMeta={ownerMeta}
          onOpenNewExpense={() => setModalState({ kind: 'expense' })}
          onOpenEditExpense={(item) => setModalState({ kind: 'expense', item })}
          onRequestDelete={setConfirmDeleteItem}
        />
      )}

      {activeTab === 'income' && (
        <LedgerIncomeTab
          filteredIncomes={filteredIncomes}
          selectedMonth={selectedMonth}
          selectedMonthLabel={selectedMonthLabel}
          todayStr={todayStr}
          todayDateObj={todayDateObj}
          perspective={perspective}
          ownerMeta={ownerMeta}
          financialSummary={financialSummary}
          splitRule={splitRule}
          partner1Name={partner1Name}
          partner2Name={partner2Name}
          onOpenNewIncome={(defaultFreq) => setModalState({ kind: 'income', defaultFreq })}
          onOpenEditIncome={(item) => setModalState({ kind: 'income', item })}
          onRequestDelete={setConfirmDeleteItem}
          onChangeSplitRule={handleChangeSplitRule}
        />
      )}

      {modalState?.kind === 'expense' && (
        <ExpenseModal
          editingExpense={modalState.item || null}
          selectedMonth={selectedMonth}
          todayStr={todayStr}
          perspective={perspective}
          activeProfile={activeProfile}
          partner1Name={partner1Name}
          partner2Name={partner2Name}
          ledgerData={ledgerData}
          expenses={expenses}
          onUpsertLedgerItem={onUpsertLedgerItem}
          onSaveLedgerData={onSaveLedgerData}
          onClose={() => setModalState(null)}
          showToast={showToast}
        />
      )}

      {modalState?.kind === 'recurring' && (
        <RecurringModal
          editingRecurring={modalState.item || null}
          defaultType={modalState.defaultType || 'direct-debit'}
          todayStr={todayStr}
          perspective={perspective}
          partner1Name={partner1Name}
          partner2Name={partner2Name}
          ledgerData={ledgerData}
          recurring={recurring}
          onUpsertLedgerItem={onUpsertLedgerItem}
          onSaveLedgerData={onSaveLedgerData}
          onClose={() => setModalState(null)}
          showToast={showToast}
        />
      )}

      {modalState?.kind === 'income' && (
        <IncomeModal
          editingIncome={modalState.item || null}
          defaultFreq={modalState.defaultFreq || 'monthly'}
          selectedMonth={selectedMonth}
          todayStr={todayStr}
          perspective={perspective}
          activeProfile={activeProfile}
          partner1Name={partner1Name}
          partner2Name={partner2Name}
          ledgerData={ledgerData}
          incomes={incomes}
          onUpsertLedgerItem={onUpsertLedgerItem}
          onSaveLedgerData={onSaveLedgerData}
          onClose={() => setModalState(null)}
          showToast={showToast}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(confirmDeleteItem)}
        onClose={() => setConfirmDeleteItem(null)}
        onConfirm={async () => {
          const target = confirmDeleteItem;
          setConfirmDeleteItem(null);
          if (target) await handleDeleteTarget(target);
        }}
        title={
          confirmDeleteItem
            ? `Delete ${
                confirmDeleteItem.kind === 'recurring'
                  ? 'Recurring Commitment'
                  : confirmDeleteItem.kind === 'expense'
                    ? 'Expense'
                    : 'Income Stream'
              }?`
            : ''
        }
        icon={AlertTriangle}
        accent="amber"
        confirmText="Delete"
        danger
        maxWidthClass="max-w-sm"
      >
        {confirmDeleteItem && (
          <p className="text-xs text-text-muted break-words leading-relaxed">
            Remove <span className="font-bold text-text-primary">{confirmDeleteItem.label}</span>{' '}
            from Ledger? This cannot be undone.
          </p>
        )}
      </ConfirmModal>
    </main>
  );
}

export default React.memo(LedgerApp);
