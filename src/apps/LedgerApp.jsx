import React, { useState, useMemo } from 'react';
import {
  Wallet,
  Plus,
  CheckCircle2,
  CreditCard,
  Receipt,
  TrendingUp,
  Repeat,
  Download,
  Search,
  Trash2,
  Edit3,
  Scale,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Users,
  X
} from 'lucide-react';

const getTodayStr = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getCurrentMonthStr = () => getTodayStr().slice(0, 7); // YYYY-MM

const formatGBP = (num) => {
  const val = Number(num) || 0;
  return val.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const toMonthlyAmount = (amount, cycleOrFreq) => {
  const val = Number(amount) || 0;
  switch (cycleOrFreq) {
    case 'annual':
      return val / 12;
    case 'quarterly':
      return val / 3;
    case 'weekly':
      return (val * 52) / 12;
    case 'one-off':
    case 'monthly':
    default:
      return val;
  }
};

const WEEKDAY_OPTIONS = [
  { id: 1, label: 'Monday', shortLabel: 'Mon' },
  { id: 2, label: 'Tuesday', shortLabel: 'Tue' },
  { id: 3, label: 'Wednesday', shortLabel: 'Wed' },
  { id: 4, label: 'Thursday', shortLabel: 'Thu' },
  { id: 5, label: 'Friday', shortLabel: 'Fri' },
  { id: 6, label: 'Saturday', shortLabel: 'Sat' },
  { id: 7, label: 'Sunday', shortLabel: 'Sun' }
];

import {
  getLedgerScheduleInfo,
  doesLedgerItemOccurOnDate
} from '../utils/householdHelpers.js';

export { getLedgerScheduleInfo, doesLedgerItemOccurOnDate };

const EXPENSE_CATEGORIES = [
  'Housing & Mortgage',
  'Utilities & Bills',
  'Groceries & Household',
  'Pet & Vet Care',
  'Subscriptions & Media',
  'Health & Pharmacy',
  'Dining & Leisure',
  'Transport',
  'Personal',
  'Other'
];

const OWNER_META = {
  unified: {
    id: 'unified',
    label: 'Unified (Whole Household)',
    shortLabel: 'Unified',
    badgeEmoji: '🏠',
    pillClass: 'bg-emerald-600 text-white border-emerald-600',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  },
  joint: {
    id: 'joint',
    label: 'Joint / Shared Only',
    shortLabel: 'Joint / Shared',
    badgeEmoji: '🤝',
    pillClass: 'bg-indigo-600 text-white border-indigo-600',
    badgeClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
  },
  partner1: {
    id: 'partner1',
    label: 'Partner 1',
    shortLabel: 'Partner 1',
    badgeEmoji: '⚡',
    pillClass: 'bg-teal-600 text-white border-teal-600',
    badgeClass: 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
  },
  partner2: {
    id: 'partner2',
    label: 'Partner 2',
    shortLabel: 'Partner 2',
    badgeEmoji: '🌸',
    pillClass: 'bg-rose-600 text-white border-rose-600',
    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
  }
};

export default function LedgerApp({
  activeProfile,
  profiles,
  darkMode,
  ledgerData,
  onUpsertLedgerItem,
  onDeleteLedgerItem,
  onSaveSplitRule,
  onSaveLedgerData
}) {
  const todayStr = getTodayStr();
  const partner1Name = (profiles || []).find((p) => p.id === 'partner1')?.name || 'Partner 1';
  const partner2Name = (profiles || []).find((p) => p.id === 'partner2')?.name || 'Partner 2';

  const ownerMeta = useMemo(
    () => ({
      ...OWNER_META,
      partner1: {
        ...OWNER_META.partner1,
        label: partner1Name,
        shortLabel: partner1Name
      },
      partner2: {
        ...OWNER_META.partner2,
        label: partner2Name,
        shortLabel: partner2Name
      }
    }),
    [partner1Name, partner2Name]
  );

  // Perspective: 'unified' | 'joint' | 'partner1' | 'partner2'
  const [perspective, setPerspective] = useState('unified');
  // Internal Sub-Tab: 'overview' | 'recurring' | 'expenses' | 'income'
  const [activeTab, setActiveTab] = useState('overview');
  // Selected Month (YYYY-MM) for Expenses Log & Monthly Summary
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthStr);

  // Filters for Subscriptions/Direct Debits & Expenses
  const [recurringTypeFilter, setRecurringTypeFilter] = useState('all'); // 'all' | 'direct-debit' | 'subscription'
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('All');
  const [expenseSearch, setExpenseSearch] = useState('');

  // Modals: Add/Edit Expense, Add/Edit Recurring, Add/Edit Income
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(todayStr);
  const [expCategory, setExpCategory] = useState('Groceries & Household');
  const [expOwner, setExpOwner] = useState('joint');
  const [expPaidBy, setExpPaidBy] = useState(
    activeProfile?.id === 'partner2' ? 'partner2' : 'partner1'
  );
  const [expNotes, setExpNotes] = useState('');

  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [editingRecurringId, setEditingRecurringId] = useState(null);
  const [recTitle, setRecTitle] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recType, setRecType] = useState('direct-debit');
  const [recCycle, setRecCycle] = useState('monthly');
  const [recBillingDay, setRecBillingDay] = useState(1);
  const [recBillingWeekday, setRecBillingWeekday] = useState(1);
  const [recBillingDate, setRecBillingDate] = useState(todayStr);
  const [recOwner, setRecOwner] = useState('joint');
  const [recCategory, setRecCategory] = useState('Utilities & Bills');
  const [recNotes, setRecNotes] = useState('');

  const [incomeModalOpen, setIncomeModalOpen] = useState(false);
  const [editingIncomeId, setEditingIncomeId] = useState(null);
  const [incTitle, setIncTitle] = useState('');
  const [incAmount, setIncAmount] = useState('');
  const [incFrequency, setIncFrequency] = useState('monthly'); // 'monthly'|'annual'|'quarterly'|'weekly'|'one-off'
  const [incDate, setIncDate] = useState(todayStr); // Used when incFrequency === 'one-off'
  const [incOwner, setIncOwner] = useState(
    activeProfile?.id === 'partner2' ? 'partner2' : 'partner1'
  );
  const [incPayDay, setIncPayDay] = useState(28);
  const [incPayWeekday, setIncPayWeekday] = useState(5);
  const [incPayDate, setIncPayDate] = useState(todayStr);
  const [incCategory, setIncCategory] = useState('Salary');
  const [incNotes, setIncNotes] = useState('');

  const incomes = useMemo(() => ledgerData?.incomes || [], [ledgerData]);
  const recurring = useMemo(() => ledgerData?.recurring || [], [ledgerData]);
  const expenses = useMemo(() => ledgerData?.expenses || [], [ledgerData]);
  const splitRule = ledgerData?.splitRule || '50-50';

  // Shift selected month helper
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

  // --------------------------------------------------------------------------
  // CORE BOOKKEEPING & SPLIT CALCULATIONS (WITH DATED ONE-OFF INCOMES)
  // --------------------------------------------------------------------------
  const financialSummary = useMemo(() => {
    // Helper: For a given income stream, compute its contribution to `selectedMonth`
    // - Recurring ('monthly', 'annual', 'quarterly', 'weekly') applies every month
    // - One-Off ('one-off') applies ONLY if `inc.date` starts with `selectedMonth` (YYYY-MM)
    const getIncomeForSelectedMonth = (inc) => {
      if (inc.frequency === 'one-off') {
        const incMonth = (inc.date || todayStr).slice(0, 7);
        return incMonth === selectedMonth ? Number(inc.amount) || 0 : 0;
      }
      return toMonthlyAmount(inc.amount, inc.frequency);
    };

    // 1. Monthly Income by Owner (Base Recurring + Selected Month One-Offs)
    const partner1Income = incomes
      .filter((i) => i.owner === 'partner1')
      .reduce((acc, i) => acc + getIncomeForSelectedMonth(i), 0);
    const partner2Income = incomes
      .filter((i) => i.owner === 'partner2')
      .reduce((acc, i) => acc + getIncomeForSelectedMonth(i), 0);
    const jointIncome = incomes
      .filter((i) => i.owner === 'joint')
      .reduce((acc, i) => acc + getIncomeForSelectedMonth(i), 0);

    const partner2OneOffThisMonth = incomes
      .filter(
        (i) =>
          i.owner === 'partner2' &&
          i.frequency === 'one-off' &&
          (i.date || todayStr).slice(0, 7) === selectedMonth
      )
      .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

    const partner1OneOffThisMonth = incomes
      .filter(
        (i) =>
          i.owner === 'partner1' &&
          i.frequency === 'one-off' &&
          (i.date || todayStr).slice(0, 7) === selectedMonth
      )
      .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

    const totalHouseholdIncome = partner1Income + partner2Income + jointIncome;

    // Determine split ratios for 'joint' items
    const combinedPersonalIncome = partner1Income + partner2Income;
    const partner1JointShare =
      splitRule === 'proportional' && combinedPersonalIncome > 0
        ? partner1Income / combinedPersonalIncome
        : 0.5;
    const partner2JointShare = 1 - partner1JointShare;

    // 2. Active Recurring (Direct Debits & Subscriptions)
    const activeRecurring = recurring.filter((r) => r.active !== false);

    const calcRecurringTotals = (filterFn, shareFactor = () => 1) => {
      let total = 0;
      let directDebits = 0;
      let subscriptions = 0;
      activeRecurring.filter(filterFn).forEach((r) => {
        const monthlyVal = toMonthlyAmount(r.amount, r.cycle) * shareFactor(r);
        total += monthlyVal;
        if (r.type === 'direct-debit') directDebits += monthlyVal;
        else subscriptions += monthlyVal;
      });
      return { total, directDebits, subscriptions };
    };

    const unifiedRec = calcRecurringTotals(() => true);
    const jointRec = calcRecurringTotals((r) => r.owner === 'joint');
    const partner1PersonalRec = calcRecurringTotals((r) => r.owner === 'partner1');
    const partner2PersonalRec = calcRecurringTotals((r) => r.owner === 'partner2');

    // Partner 1 & Partner 2 total committed (Personal + their share of Joint)
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

    // 3. Selected Month Ad-Hoc Expenses
    const monthExpenses = expenses.filter(
      (e) => (e.date || '').slice(0, 7) === selectedMonth
    );

    const unifiedExpTotal = monthExpenses.reduce(
      (acc, e) => acc + (Number(e.amount) || 0),
      0
    );
    const jointExpTotal = monthExpenses
      .filter((e) => e.owner === 'joint')
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const partner1PersonalExpTotal = monthExpenses
      .filter((e) => e.owner === 'partner1')
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const partner2PersonalExpTotal = monthExpenses
      .filter((e) => e.owner === 'partner2')
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    const partner1TotalExp =
      partner1PersonalExpTotal + jointExpTotal * partner1JointShare;
    const partner2TotalExp =
      partner2PersonalExpTotal + jointExpTotal * partner2JointShare;

    // 4. Shared & Cross-Partner Expense Settlement Balance for Selected Month
    // - When Partner 1 pays a 'joint' expense from their personal card, Partner 2 owes their joint share; and vice versa.
    // - When Partner 1 pays a 'partner2' personal expense from their card, Partner 2 owes 100% of it; and vice versa.
    let partner1PaidForJoint = 0;
    let partner2PaidForJoint = 0;
    let partner1PaidForPartner2Personal = 0;
    let partner2PaidForPartner1Personal = 0;

    monthExpenses.forEach((e) => {
      const amt = Number(e.amount) || 0;
      if (e.owner === 'joint') {
        if (e.paidBy === 'partner1') partner1PaidForJoint += amt;
        if (e.paidBy === 'partner2') partner2PaidForJoint += amt;
      } else if (e.owner === 'partner2' && e.paidBy === 'partner1') {
        partner1PaidForPartner2Personal += amt;
      } else if (e.owner === 'partner1' && e.paidBy === 'partner2') {
        partner2PaidForPartner1Personal += amt;
      }
    });

    const totalPartnerPaidJoint = partner1PaidForJoint + partner2PaidForJoint;
    const partner1FairShareOfPartnerPaid = totalPartnerPaidJoint * partner1JointShare;
    const netPartner1Balance =
      partner1PaidForJoint -
      partner1FairShareOfPartnerPaid +
      partner1PaidForPartner2Personal -
      partner2PaidForPartner1Personal;
    // If netPartner1Balance > 0, Partner 2 owes Partner 1. If < 0, Partner 1 owes Partner 2.

    // 5. Perspective-specific KPI values
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
        subtitle: `Shared Household Commitments (${Math.round(partner1JointShare * 100)}/${Math.round(partner2JointShare * 100)} split)`
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
        subtitle: `${partner1Name} Personal (${formatGBP(partner1PersonalRec.total)}/mo) + ${Math.round(partner1JointShare * 100)}% Joint Share (${formatGBP(partner1TotalRec.jointShare)}/mo)`
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
        subtitle: `${partner2Name} Personal (${formatGBP(partner2PersonalRec.total)}/mo) + ${Math.round(partner2JointShare * 100)}% Joint Share (${formatGBP(partner2TotalRec.jointShare)}/mo)`
      };
    }

    return {
      partner1Income,
      partner2Income,
      jointIncome,
      partner2OneOffThisMonth,
      partner1OneOffThisMonth,
      totalHouseholdIncome,
      partner1JointShare,
      partner2JointShare,
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
      partner1PaidForJoint,
      partner2PaidForJoint,
      netPartner1Balance,
      activeKpi
    };
  }, [incomes, recurring, expenses, selectedMonth, perspective, splitRule]);

  // Filtered Recurring items for active perspective & type filter
  // In Partner 1 or Partner 2 perspective, show their personal commitments AND shared joint commitments (with their split share)
  const filteredRecurring = useMemo(() => {
    return recurring
      .map((item) => {
        const { daysUntil, nextDateFormatted, scheduleLabel } =
          getLedgerScheduleInfo(item, false);
        const monthlyEquiv = toMonthlyAmount(item.amount, item.cycle);
        let perspectiveShareFactor = 1;
        if (perspective === 'partner1' && item.owner === 'joint') {
          perspectiveShareFactor = financialSummary.partner1JointShare;
        } else if (perspective === 'partner2' && item.owner === 'joint') {
          perspectiveShareFactor = financialSummary.partner2JointShare;
        }
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
      .filter((item) => {
        if (perspective === 'joint' && item.owner !== 'joint') return false;
        if (
          (perspective === 'partner1' || perspective === 'partner2') &&
          item.owner !== perspective &&
          item.owner !== 'joint'
        ) {
          return false;
        }
        if (recurringTypeFilter !== 'all' && item.type !== recurringTypeFilter)
          return false;
        return true;
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [
    recurring,
    perspective,
    recurringTypeFilter,
    financialSummary.partner1JointShare,
    financialSummary.partner2JointShare
  ]);

  // Filtered Month Expenses for active perspective, category & search
  const filteredExpenses = useMemo(() => {
    return financialSummary.monthExpenses
      .map((exp) => {
        let shareFactor = 1;
        if (perspective === 'partner1' && exp.owner === 'joint') {
          shareFactor = financialSummary.partner1JointShare;
        } else if (perspective === 'partner2' && exp.owner === 'joint') {
          shareFactor = financialSummary.partner2JointShare;
        }
        return {
          ...exp,
          shareFactor,
          effectiveAmount: (Number(exp.amount) || 0) * shareFactor
        };
      })
      .filter((exp) => {
        if (perspective === 'joint' && exp.owner !== 'joint') return false;
        if (
          (perspective === 'partner1' || perspective === 'partner2') &&
          exp.owner !== perspective &&
          exp.owner !== 'joint'
        ) {
          return false;
        }
        if (
          expenseCategoryFilter !== 'All' &&
          exp.category !== expenseCategoryFilter
        )
          return false;
        if (expenseSearch.trim()) {
          const q = expenseSearch.toLowerCase();
          const matchTitle = (exp.title || '').toLowerCase().includes(q);
          const matchCat = (exp.category || '').toLowerCase().includes(q);
          const matchNotes = (exp.notes || '').toLowerCase().includes(q);
          if (!matchTitle && !matchCat && !matchNotes) return false;
        }
        return true;
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

  // Category Breakdown (Recurring + Selected Month Expenses for current perspective)
  const categoryBreakdown = useMemo(() => {
    const map = {};
    let grandTotal = 0;

    recurring
      .filter((r) => r.active !== false)
      .forEach((r) => {
        let weight = 1;
        if (perspective === 'joint' && r.owner !== 'joint') weight = 0;
        if (perspective === 'partner1') {
          weight =
            r.owner === 'partner1'
              ? 1
              : r.owner === 'joint'
                ? financialSummary.partner1JointShare
                : 0;
        }
        if (perspective === 'partner2') {
          weight =
            r.owner === 'partner2'
              ? 1
              : r.owner === 'joint'
                ? financialSummary.partner2JointShare
                : 0;
        }
        if (weight <= 0) return;
        const val = toMonthlyAmount(r.amount, r.cycle) * weight;
        const cat = r.category || 'Other';
        map[cat] = (map[cat] || 0) + val;
        grandTotal += val;
      });

    financialSummary.monthExpenses.forEach((e) => {
      let weight = 1;
      if (perspective === 'joint' && e.owner !== 'joint') weight = 0;
      if (perspective === 'partner1') {
        weight =
          e.owner === 'partner1'
            ? 1
            : e.owner === 'joint'
              ? financialSummary.partner1JointShare
              : 0;
      }
      if (perspective === 'partner2') {
        weight =
          e.owner === 'partner2'
            ? 1
            : e.owner === 'joint'
              ? financialSummary.partner2JointShare
              : 0;
      }
      if (weight <= 0) return;
      const val = (Number(e.amount) || 0) * weight;
      const cat = e.category || 'Other';
      map[cat] = (map[cat] || 0) + val;
      grandTotal += val;
    });

    return Object.entries(map)
      .map(([cat, amount]) => ({
        category: cat,
        amount,
        pct: grandTotal > 0 ? Math.round((amount / grandTotal) * 100) : 0
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [recurring, financialSummary, perspective]);

  // Upcoming bills in next 10 days
  const upcomingBills = useMemo(() => {
    return recurring
      .filter((r) => r.active !== false)
      .map((r) => ({
        ...r,
        ...getLedgerScheduleInfo(r, false)
      }))
      .filter((r) => {
        if (perspective === 'joint' && r.owner !== 'joint') return false;
        if (
          (perspective === 'partner1' || perspective === 'partner2') &&
          r.owner !== perspective &&
          r.owner !== 'joint'
        ) {
          return false;
        }
        return r.daysUntil <= 10;
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [recurring, perspective]);

  // --------------------------------------------------------------------------
  // CRUD HANDLERS
  // --------------------------------------------------------------------------
  const openNewExpenseModal = () => {
    setEditingExpenseId(null);
    setExpTitle('');
    setExpAmount('');
    setExpDate(todayStr);
    setExpCategory('Groceries & Household');
    setExpOwner(
      perspective === 'partner1' || perspective === 'partner2' || perspective === 'joint'
        ? perspective
        : 'joint'
    );
    setExpPaidBy(activeProfile?.id === 'partner2' ? 'partner2' : 'partner1');
    setExpNotes('');
    setExpenseModalOpen(true);
  };

  const openEditExpenseModal = (exp) => {
    setEditingExpenseId(exp.id);
    setExpTitle(exp.title || '');
    setExpAmount(String(exp.amount ?? ''));
    setExpDate(exp.date || todayStr);
    setExpCategory(exp.category || 'Groceries & Household');
    setExpOwner(exp.owner || 'joint');
    setExpPaidBy(exp.paidBy || 'partner1');
    setExpNotes(exp.notes || '');
    setExpenseModalOpen(true);
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    const amt = parseFloat(expAmount);
    if (!expTitle.trim() || Number.isNaN(amt) || amt <= 0) return;

    const record = {
      id: editingExpenseId || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: expTitle.trim(),
      amount: Math.round(amt * 100) / 100,
      date: expDate || todayStr,
      category: expCategory,
      owner: expOwner,
      paidBy: expPaidBy,
      notes: expNotes.trim()
    };

    const nextExpenses = editingExpenseId
      ? expenses.map((x) => (x.id === editingExpenseId ? record : x))
      : [record, ...expenses];
    const nextLedgerData = { ...ledgerData, expenses: nextExpenses };
    const msg = editingExpenseId
      ? `Updated expense "${record.title}"`
      : `Logged ${formatGBP(record.amount)} for "${record.title}"`;

    if (onUpsertLedgerItem) {
      await onUpsertLedgerItem({ kind: 'expense', record, nextLedgerData }, msg);
    } else {
      await onSaveLedgerData(nextLedgerData, msg);
    }
    setExpenseModalOpen(false);
  };

  const handleDeleteExpense = async (id) => {
    const nextExpenses = expenses.filter((x) => x.id !== id);
    const nextLedgerData = { ...ledgerData, expenses: nextExpenses };
    const msg = 'Deleted expense entry';
    if (onDeleteLedgerItem) {
      await onDeleteLedgerItem({ id, nextLedgerData }, msg);
    } else {
      await onSaveLedgerData(nextLedgerData, msg);
    }
  };

  const openNewRecurringModal = (defaultType = 'direct-debit') => {
    setEditingRecurringId(null);
    setRecTitle('');
    setRecAmount('');
    setRecType(defaultType);
    setRecCycle('monthly');
    setRecBillingDay(1);
    setRecBillingWeekday(1);
    setRecBillingDate(todayStr);
    setRecOwner(
      perspective === 'partner1' || perspective === 'partner2' || perspective === 'joint'
        ? perspective
        : 'joint'
    );
    setRecCategory(
      defaultType === 'subscription' ? 'Subscriptions & Media' : 'Utilities & Bills'
    );
    setRecNotes('');
    setRecurringModalOpen(true);
  };

  const openEditRecurringModal = (rec) => {
    setEditingRecurringId(rec.id);
    setRecTitle(rec.title || '');
    setRecAmount(String(rec.amount ?? ''));
    setRecType(rec.type || 'direct-debit');
    setRecCycle(rec.cycle || 'monthly');
    setRecBillingDay(rec.billingDay || 1);
    setRecBillingWeekday(rec.billingWeekday || 1);
    const defaultAnchor =
      rec.billingDate ||
      `${todayStr.slice(0, 8)}${String(Math.min(28, Math.max(1, Number(rec.billingDay) || 1))).padStart(2, '0')}`;
    setRecBillingDate(defaultAnchor);
    setRecOwner(rec.owner || 'joint');
    setRecCategory(rec.category || 'Utilities & Bills');
    setRecNotes(rec.notes || '');
    setRecurringModalOpen(true);
  };

  const handleSaveRecurring = async (e) => {
    e.preventDefault();
    const amt = parseFloat(recAmount);
    if (!recTitle.trim() || Number.isNaN(amt) || amt <= 0) return;

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

    const record = {
      id: editingRecurringId || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: recTitle.trim(),
      amount: Math.round(amt * 100) / 100,
      type: recType,
      cycle: recCycle,
      ...scheduleFields,
      owner: recOwner,
      category: recCategory,
      active: true,
      notes: recNotes.trim()
    };

    const mergedRecord = editingRecurringId
      ? { ...recurring.find((r) => r.id === editingRecurringId), ...record }
      : record;
    const nextRecurring = editingRecurringId
      ? recurring.map((r) => (r.id === editingRecurringId ? mergedRecord : r))
      : [...recurring, mergedRecord];
    const nextLedgerData = { ...ledgerData, recurring: nextRecurring };
    const msg = editingRecurringId
      ? `Updated "${record.title}"`
      : `Added ${record.type === 'direct-debit' ? 'Direct Debit' : 'Subscription'}: "${record.title}"`;

    if (onUpsertLedgerItem) {
      await onUpsertLedgerItem({ kind: 'recurring', record: mergedRecord, nextLedgerData }, msg);
    } else {
      await onSaveLedgerData(nextLedgerData, msg);
    }
    setRecurringModalOpen(false);
  };

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

  const handleDeleteRecurring = async (id) => {
    const nextRecurring = recurring.filter((r) => r.id !== id);
    const nextLedgerData = { ...ledgerData, recurring: nextRecurring };
    const msg = 'Removed recurring item';
    if (onDeleteLedgerItem) {
      await onDeleteLedgerItem({ id, nextLedgerData }, msg);
    } else {
      await onSaveLedgerData(nextLedgerData, msg);
    }
  };

  const openNewIncomeModal = (defaultFreq = 'monthly') => {
    setEditingIncomeId(null);
    setIncTitle('');
    setIncAmount('');
    setIncFrequency(defaultFreq);
    setIncDate(todayStr);
    setIncOwner(activeProfile?.id === 'partner2' ? 'partner2' : 'partner1');
    setIncPayDay(28);
    setIncPayWeekday(5);
    setIncPayDate(todayStr);
    setIncCategory(defaultFreq === 'one-off' ? 'One-Off / Variable' : 'Salary');
    setIncNotes('');
    setIncomeModalOpen(true);
  };

  const openEditIncomeModal = (inc) => {
    setEditingIncomeId(inc.id);
    setIncTitle(inc.title || '');
    setIncAmount(String(inc.amount ?? ''));
    setIncFrequency(inc.frequency || 'monthly');
    setIncDate(inc.date || todayStr);
    setIncOwner(inc.owner || 'partner1');
    setIncPayDay(inc.payDay || 28);
    setIncPayWeekday(inc.payWeekday || 5);
    const defaultAnchor =
      inc.payDate ||
      `${todayStr.slice(0, 8)}${String(Math.min(28, Math.max(1, Number(inc.payDay) || 28))).padStart(2, '0')}`;
    setIncPayDate(defaultAnchor);
    setIncCategory(
      inc.category || (inc.frequency === 'one-off' ? 'One-Off / Variable' : 'Salary')
    );
    setIncNotes(inc.notes || '');
    setIncomeModalOpen(true);
  };

  const handleSaveIncome = async (e) => {
    e.preventDefault();
    const amt = parseFloat(incAmount);
    if (!incTitle.trim() || Number.isNaN(amt) || amt <= 0) return;

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

    const record = {
      id: editingIncomeId || `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: incTitle.trim(),
      amount: Math.round(amt * 100) / 100,
      frequency: incFrequency,
      ...scheduleFields,
      owner: incOwner,
      category: incCategory || (isOneOff ? 'One-Off / Variable' : 'Salary'),
      notes: incNotes.trim()
    };

    const nextIncomes = editingIncomeId
      ? incomes.map((i) => (i.id === editingIncomeId ? record : i))
      : [record, ...incomes];
    const nextLedgerData = { ...ledgerData, incomes: nextIncomes };
    const msg = editingIncomeId
      ? `Updated "${record.title}"`
      : isOneOff
        ? `Logged one-off income ${formatGBP(record.amount)} for "${record.title}"`
        : `Added recurring income "${record.title}"`;

    if (onUpsertLedgerItem) {
      await onUpsertLedgerItem({ kind: 'income', record, nextLedgerData }, msg);
    } else {
      await onSaveLedgerData(nextLedgerData, msg);
    }
    setIncomeModalOpen(false);
  };

  const handleDeleteIncome = async (id) => {
    const nextIncomes = incomes.filter((i) => i.id !== id);
    const nextLedgerData = { ...ledgerData, incomes: nextIncomes };
    const msg = 'Removed income stream';
    if (onDeleteLedgerItem) {
      await onDeleteLedgerItem({ id, nextLedgerData }, msg);
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
    const headers = [
      'Type',
      'Date_or_BillingDay',
      'Title',
      'Category',
      'For_Owner',
      'Paid_By',
      'Amount_GBP',
      'Notes'
    ];
    const escapeCSV = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = [
      ...recurring
        .filter((r) => r.active !== false)
        .map((r) => [
          escapeCSV(r.type === 'direct-debit' ? 'Direct Debit' : 'Subscription'),
          escapeCSV(`${getLedgerScheduleInfo(r, false).scheduleLabel} (${r.cycle})`),
          escapeCSV(r.title),
          escapeCSV(r.category),
          escapeCSV(r.owner),
          escapeCSV(r.owner),
          escapeCSV(toMonthlyAmount(r.amount, r.cycle).toFixed(2)),
          escapeCSV(r.notes || '')
        ]),
      ...financialSummary.monthExpenses.map((e) => [
        escapeCSV('Expense'),
        escapeCSV(e.date),
        escapeCSV(e.title),
        escapeCSV(e.category),
        escapeCSV(e.owner),
        escapeCSV(e.paidBy),
        escapeCSV(Number(e.amount || 0).toFixed(2)),
        escapeCSV(e.notes || '')
      ])
    ];

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Howard_Ledger_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cardSurface = darkMode
    ? 'bg-slate-900 border-slate-800 text-slate-100'
    : 'bg-white border-slate-200/90 text-slate-800';

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      {/* ====================================================================
          1. TOP HEADER BAR, QUICK ACTIONS & PERSPECTIVE SWITCHER
      ==================================================================== */}
      <section className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${cardSurface}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Wallet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
                Ledger • Household Bookkeeping &amp; Subscriptions
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track expenses, Direct Debits, subscriptions, and income — separated between {partner1Name}, {partner2Name}, and Unified
              </p>
            </div>
          </div>

          {/* Fast Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openNewExpenseModal}
              className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Log Expense</span>
            </button>
            <button
              type="button"
              onClick={() => openNewIncomeModal('one-off')}
              className="px-3.5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Log a one-off or variable income payment for this month"
            >
              <Plus className="w-4 h-4" />
              <span>One-Off Income</span>
            </button>
            <button
              type="button"
              onClick={() => openNewRecurringModal('direct-debit')}
              className="px-3.5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Repeat className="w-4 h-4" />
              <span>Direct Debit / Sub</span>
            </button>
            <button
              type="button"
              onClick={handleExportMonthCSV}
              className={`px-3 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
              title="Export selected month to CSV spreadsheet"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>

        {/* PERSPECTIVE BAR (UNIFIED / JOINT / PARTNER 1 / PARTNER 2) + MONTH SELECTOR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-4 border-t border-slate-200/70 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">
              View Ledger For:
            </span>
            {Object.values(ownerMeta).map((meta) => {
              const active = perspective === meta.id;
              return (
                <button
                  key={meta.id}
                  type="button"
                  onClick={() => setPerspective(meta.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer ${
                    active
                      ? meta.pillClass + ' shadow-xs'
                      : darkMode
                        ? 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{meta.badgeEmoji}</span>
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>

          {/* Month Picker for Variable Expenses */}
          <div className="flex items-center gap-1.5 self-start md:self-auto">
            <button
              type="button"
              onClick={() => shiftSelectedMonth(-1)}
              className={`p-2 rounded-xl border cursor-pointer ${
                darkMode
                  ? 'border-slate-700 hover:bg-slate-800'
                  : 'border-slate-200 hover:bg-slate-100'
              }`}
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-extrabold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-500" />
              <span>{selectedMonthLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => shiftSelectedMonth(1)}
              className={`p-2 rounded-xl border cursor-pointer ${
                darkMode
                  ? 'border-slate-700 hover:bg-slate-800'
                  : 'border-slate-200 hover:bg-slate-100'
              }`}
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {selectedMonth !== getCurrentMonthStr() && (
              <button
                type="button"
                onClick={() => setSelectedMonth(getCurrentMonthStr())}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
              >
                This Month
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ====================================================================
          2. FOUR FINANCIAL KPI SUMMARY CARDS (DYNAMIC BY PERSPECTIVE)
      ==================================================================== */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Card 1: Monthly Income */}
        <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${cardSurface}`}>
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
            <span>
              {perspective === 'joint' ? 'Joint Pool / Split' : 'Monthly Income'}
            </span>
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold">
            {perspective === 'joint'
              ? `${Math.round(financialSummary.partner1JointShare * 100)}% / ${Math.round(financialSummary.partner2JointShare * 100)}%`
              : formatGBP(financialSummary.activeKpi.income)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {perspective === 'unified'
              ? `⚡ ${partner1Name} ${formatGBP(financialSummary.partner1Income)} • 🌸 ${partner2Name} ${formatGBP(financialSummary.partner2Income)}`
              : perspective === 'joint'
                ? `Split rule: ${splitRule === 'proportional' ? 'Proportional to Income' : '50/50 Equal Split'}`
                : `${ownerMeta[perspective]?.shortLabel}'s monthly net income`}
          </div>
        </div>

        {/* Card 2: Direct Debits & Subscriptions */}
        <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${cardSurface}`}>
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">
            <span>Direct Debits &amp; Subs</span>
            <Repeat className="w-4 h-4" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold">
            {formatGBP(financialSummary.activeKpi.recurring)}
            <span className="text-xs font-semibold opacity-60">/mo</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            DDs: <strong>{formatGBP(financialSummary.activeKpi.directDebits)}</strong> • Subs:{' '}
            <strong>{formatGBP(financialSummary.activeKpi.subscriptions)}</strong>
          </div>
        </div>

        {/* Card 3: Selected Month Logged Expenses */}
        <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${cardSurface}`}>
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
            <span>{selectedMonthLabel} Expenses</span>
            <Receipt className="w-4 h-4" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold">
            {formatGBP(financialSummary.activeKpi.expenses)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {financialSummary.activeKpi.subtitle}
          </div>
        </div>

        {/* Card 4: Net Monthly Remainder / Shared Settlement */}
        <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${cardSurface}`}>
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 mb-1">
            <span>
              {perspective === 'joint'
                ? 'Total Joint Outgoings'
                : 'Net Monthly Remainder'}
            </span>
            <Scale className="w-4 h-4" />
          </div>
          <div
            className={`text-2xl sm:text-3xl font-extrabold ${
              perspective !== 'joint' && financialSummary.activeKpi.netRemainder < 0
                ? 'text-rose-600'
                : ''
            }`}
          >
            {formatGBP(financialSummary.activeKpi.netRemainder)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {Math.abs(financialSummary.netPartner1Balance) < 0.01
              ? '✓ Joint expenses settled even this month'
              : financialSummary.netPartner1Balance > 0
                ? `🤝 Shared cards: ${partner2Name} owes ${partner1Name} ${formatGBP(financialSummary.netPartner1Balance)}`
                : `🤝 Shared cards: ${partner1Name} owes ${partner2Name} ${formatGBP(Math.abs(financialSummary.netPartner1Balance))}`}
          </div>
        </div>
      </section>

      {/* ====================================================================
          3. INTERNAL SUB-NAVIGATION TABS
      ==================================================================== */}
      <div className="w-full grid grid-cols-2 lg:grid-cols-4 gap-1.5 bg-slate-200/70 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
        {[
          { id: 'overview', label: 'Overview & Split', icon: Scale },
          {
            id: 'recurring',
            label: `Subscriptions & Direct Debits (${recurring.length})`,
            icon: CreditCard
          },
          {
            id: 'expenses',
            label: `Expenses Log (${financialSummary.monthExpenses.length})`,
            icon: Receipt
          },
          {
            id: 'income',
            label: `Income & Split Rules (${incomes.length})`,
            icon: TrendingUp
          }
        ].map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                active
                  ? darkMode
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ====================================================================
          TAB 1: OVERVIEW, HOUSEHOLD SPLIT & CATEGORY BREAKDOWN
      ==================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-5">
          {/* Side-by-Side Comparison: Partner 1 vs Partner 2 vs Joint */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
            {/* Joint Household Pool */}
            <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                  🤝 Joint / Household Bills
                </span>
                <button
                  type="button"
                  onClick={() => setPerspective('joint')}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Filter Joint &rarr;
                </button>
              </div>
              <div className="space-y-1.5 text-xs pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Joint Direct Debits:</span>
                  <span className="font-bold">
                    {formatGBP(financialSummary.jointRec.directDebits)}/mo
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Joint Subscriptions:</span>
                  <span className="font-bold">
                    {formatGBP(financialSummary.jointRec.subscriptions)}/mo
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Joint Expenses ({selectedMonthLabel}):</span>
                  <span className="font-bold">
                    {formatGBP(financialSummary.jointExpTotal)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-extrabold">
                  <span>Total Joint Outgoings:</span>
                  <span className="text-indigo-600 dark:text-indigo-400">
                    {formatGBP(
                      financialSummary.jointRec.total + financialSummary.jointExpTotal
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Partner 1's Breakdown */}
            <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-500/15 text-teal-700 dark:text-teal-300">
                  ⚡ {partner1Name}&apos;s Ledger
                </span>
                <button
                  type="button"
                  onClick={() => setPerspective('partner1')}
                  className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  Filter {partner1Name} &rarr;
                </button>
              </div>
              <div className="space-y-1.5 text-xs pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Personal DDs &amp; Subs:</span>
                  <span className="font-bold">
                    {formatGBP(financialSummary.partner1PersonalRec.total)}/mo
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Share of Joint Bills ({Math.round(financialSummary.partner1JointShare * 100)}%):
                  </span>
                  <span className="font-bold">
                    {formatGBP(financialSummary.partner1TotalRec.jointShare)}/mo
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Personal Expenses ({selectedMonthLabel}):</span>
                  <span className="font-bold">
                    {formatGBP(financialSummary.partner1PersonalExpTotal)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-extrabold">
                  <span>Net After All Outgoings:</span>
                  <span className="text-teal-600 dark:text-teal-400">
                    {formatGBP(
                      financialSummary.partner1Income +
                        financialSummary.jointIncome *
                          financialSummary.partner1JointShare -
                        financialSummary.partner1TotalRec.total -
                        (financialSummary.partner1PersonalExpTotal +
                          financialSummary.jointExpTotal *
                            financialSummary.partner1JointShare)
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Partner 2's Breakdown */}
            <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300">
                  🌸 {partner2Name}&apos;s Ledger
                </span>
                <button
                  type="button"
                  onClick={() => setPerspective('partner2')}
                  className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Filter {partner2Name} &rarr;
                </button>
              </div>
              <div className="space-y-1.5 text-xs pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Personal DDs &amp; Subs:</span>
                  <span className="font-bold">
                    {formatGBP(financialSummary.partner2PersonalRec.total)}/mo
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    Share of Joint Bills ({Math.round(financialSummary.partner2JointShare * 100)}%):
                  </span>
                  <span className="font-bold">
                    {formatGBP(financialSummary.partner2TotalRec.jointShare)}/mo
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Personal Expenses ({selectedMonthLabel}):</span>
                  <span className="font-bold">
                    {formatGBP(financialSummary.partner2PersonalExpTotal)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-extrabold">
                  <span>Net After All Outgoings:</span>
                  <span className="text-rose-600 dark:text-rose-400">
                    {formatGBP(
                      financialSummary.partner2Income +
                        financialSummary.jointIncome *
                          financialSummary.partner2JointShare -
                        financialSummary.partner2TotalRec.total -
                        (financialSummary.partner2PersonalExpTotal +
                          financialSummary.jointExpTotal *
                            financialSummary.partner2JointShare)
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Two-Column Lower Grid: Category Breakdown + Upcoming Direct Debits/Subs */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
            {/* Category Breakdown (7 cols) */}
            <div className={`lg:col-span-7 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold">
                    Outgoings by Category ({ownerMeta[perspective]?.shortLabel})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Combines monthly Direct Debits, Subscriptions, and {selectedMonthLabel} expenses
                  </p>
                </div>
              </div>

              {categoryBreakdown.length > 0 ? (
                <div className="space-y-3">
                  {categoryBreakdown.map((item) => (
                    <div key={item.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>{item.category}</span>
                        <span>
                          {formatGBP(item.amount)} ({item.pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600"
                          style={{ width: `${Math.max(3, item.pct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-8 text-center">
                  No outgoings recorded for this view yet.
                </p>
              )}
            </div>

            {/* Upcoming Billing Days (5 cols) */}
            <div className={`lg:col-span-5 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold">
                    Upcoming Direct Debits &amp; Subs
                  </h3>
                  <p className="text-xs text-slate-500">
                    Due within the next 10 days
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('recurring')}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  View All &rarr;
                </button>
              </div>

              {upcomingBills.length > 0 ? (
                <div className="space-y-2.5">
                  {upcomingBills.map((bill) => (
                    <div
                      key={bill.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                        darkMode
                          ? 'bg-slate-800/50 border-slate-700'
                          : 'bg-slate-50 border-slate-200/80'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold truncate">
                          <span>{ownerMeta[bill.owner]?.badgeEmoji || '🤝'}</span>
                          <span className="truncate">{bill.title}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {bill.scheduleLabel} •{' '}
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                            {bill.daysUntil === 0
                              ? 'Due Today'
                              : `In ${bill.daysUntil}d (${bill.nextDateFormatted})`}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-extrabold">
                          {formatGBP(bill.amount)}
                        </div>
                        <div className="text-[10px] uppercase font-bold opacity-60">
                          {bill.type === 'direct-debit' ? 'Direct Debit' : 'Sub'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-8 text-center">
                  No Direct Debits or Subscriptions due in the next 10 days.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 2: SUBSCRIPTIONS & DIRECT DEBITS MANAGER
      ==================================================================== */}
      {activeTab === 'recurring' && (
        <section className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${cardSurface}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-extrabold">
                Subscriptions &amp; Direct Debits ({filteredRecurring.length})
              </h2>
              <p className="text-xs text-slate-500">
                Showing {ownerMeta[perspective]?.label} • Committed monthly equivalent:{' '}
                <strong>{formatGBP(financialSummary.activeKpi.recurring)}/mo</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'all', label: 'All Recurring' },
                { id: 'direct-debit', label: 'Direct Debits' },
                { id: 'subscription', label: 'Subscriptions' }
              ].map((flt) => (
                <button
                  key={flt.id}
                  type="button"
                  onClick={() => setRecurringTypeFilter(flt.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                    recurringTypeFilter === flt.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : darkMode
                        ? 'bg-slate-800 border-slate-700 text-slate-300'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {flt.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => openNewRecurringModal('direct-debit')}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRecurring.map((item) => {
              const ownerInfo = ownerMeta[item.owner] || ownerMeta.joint;
              const isPaused = item.active === false;

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl p-4 border flex flex-col justify-between gap-3 transition ${
                    isPaused
                      ? 'opacity-55 border-dashed border-slate-300 dark:border-slate-700'
                      : darkMode
                        ? 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-50/70 border-slate-200/80 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${ownerInfo.badgeClass}`}
                        >
                          {ownerInfo.badgeEmoji} {ownerInfo.shortLabel}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                            item.type === 'direct-debit'
                              ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                              : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                          }`}
                        >
                          {item.type === 'direct-debit' ? 'Direct Debit' : 'Subscription'}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700">
                          {item.category}
                        </span>
                      </div>

                      <h3 className="font-extrabold text-sm sm:text-base truncate">
                        {item.title}
                      </h3>
                      {item.notes && (
                        <p className="text-xs text-slate-500 truncate">{item.notes}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base sm:text-lg font-extrabold">
                        {formatGBP(item.amount)}
                      </div>
                      <div className="text-[11px] text-slate-500 capitalize">
                        {item.cycle}
                        {item.cycle !== 'monthly' &&
                          ` (${formatGBP(item.monthlyEquiv)}/mo)`}
                        {item.perspectiveShareFactor < 1 &&
                          ` • Your share: ${formatGBP(item.perspectiveMonthlyEquiv)}/mo`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/60 dark:border-slate-800 text-xs">
                    <div className="text-slate-500">
                      <strong>{item.scheduleLabel}</strong> • Next:{' '}
                      <strong className="text-slate-700 dark:text-slate-200">
                        {item.nextDateFormatted}
                      </strong>{' '}
                      ({item.daysUntil === 0 ? 'Today' : `${item.daysUntil}d`})
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleRecurringActive(item)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                          isPaused
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {isPaused ? 'Resume' : 'Pause'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditRecurringModal(item)}
                        className="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700 cursor-pointer"
                        title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRecurring(item.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ====================================================================
          TAB 3: DAY-TO-DAY EXPENSES LOG
      ==================================================================== */}
      {activeTab === 'expenses' && (
        <section className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${cardSurface}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-extrabold">
                {selectedMonthLabel} Expenses Log ({filteredExpenses.length})
              </h2>
              <p className="text-xs text-slate-500">
                Day-to-day household &amp; personal spending • Filtered total:{' '}
                <strong>
                  {formatGBP(
                    filteredExpenses.reduce(
                      (acc, e) => acc + (Number(e.effectiveAmount ?? e.amount) || 0),
                      0
                    )
                  )}
                </strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  placeholder="Search expenses..."
                  className="pl-8 pr-3 py-1.5 rounded-xl text-xs border bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700"
                />
              </div>

              <select
                value={expenseCategoryFilter}
                onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700"
              >
                <option value="All">All Categories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={openNewExpenseModal}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Log Expense</span>
              </button>
            </div>
          </div>

          {filteredExpenses.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
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
                        <span className="text-xs font-mono font-bold text-slate-400">
                          {exp.date}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${ownerInfo.badgeClass}`}
                        >
                          For: {ownerInfo.badgeEmoji} {ownerInfo.shortLabel}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                          Paid by: {paidByInfo.shortLabel}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          {exp.category}
                        </span>
                      </div>
                      <div className="font-extrabold text-sm sm:text-base">
                        {exp.title}
                      </div>
                      {exp.notes && (
                        <div className="text-xs text-slate-500">{exp.notes}</div>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-base sm:text-lg font-extrabold">
                          {formatGBP(exp.amount)}
                        </div>
                        {exp.shareFactor < 1 && (
                          <div className="text-[11px] text-slate-500">
                            Your share: <strong>{formatGBP(exp.effectiveAmount)}</strong>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditExpenseModal(exp)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title="Edit expense"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                          title="Delete expense"
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
            <div className="py-12 text-center space-y-3">
              <Receipt className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-semibold">
                No expenses logged for {selectedMonthLabel} matching this filter.
              </p>
              <button
                type="button"
                onClick={openNewExpenseModal}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
              >
                + Log First Expense for {selectedMonthLabel}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ====================================================================
          TAB 4: INCOME & HOUSEHOLD SPLIT RULES
      ==================================================================== */}
      {activeTab === 'income' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Income Streams List (7 cols) */}
          <section className={`lg:col-span-7 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${cardSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-extrabold">
                  Household Income ({selectedMonthLabel})
                </h2>
                <p className="text-xs text-slate-500">
                  Month total (Recurring salaries + {selectedMonthLabel} one-off income):{' '}
                  <strong>{formatGBP(financialSummary.totalHouseholdIncome)}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openNewIncomeModal('one-off')}
                  className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>One-Off Income</span>
                </button>
                <button
                  type="button"
                  onClick={() => openNewIncomeModal('monthly')}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Recurring Salary</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {incomes.map((inc) => {
                const ownerInfo = ownerMeta[inc.owner] || ownerMeta.partner1;
                const isOneOff = inc.frequency === 'one-off';
                const inSelectedMonth =
                  !isOneOff || (inc.date || todayStr).slice(0, 7) === selectedMonth;
                const monthlyEq = toMonthlyAmount(inc.amount, inc.frequency);

                return (
                  <div
                    key={inc.id}
                    className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                      !inSelectedMonth
                        ? 'opacity-50 border-dashed border-slate-300 dark:border-slate-700'
                        : darkMode
                          ? 'bg-slate-800/50 border-slate-700'
                          : 'bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${ownerInfo.badgeClass}`}
                        >
                          {ownerInfo.badgeEmoji} {ownerInfo.shortLabel}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                            isOneOff
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {isOneOff ? `One-Off • ${inc.date || todayStr}` : `Recurring (${inc.frequency})`}
                        </span>
                        {!isOneOff && (
                          <span className="text-xs text-slate-500">
                            Payday: {getLedgerScheduleInfo(inc, true).scheduleLabel}
                          </span>
                        )}
                      </div>
                      <div className="font-extrabold text-sm sm:text-base">
                        {inc.title}
                      </div>
                      {inc.notes && (
                        <div className="text-xs text-slate-500">{inc.notes}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                          {formatGBP(inc.amount)}
                        </div>
                        <div className="text-[11px] text-slate-500 capitalize">
                          {isOneOff
                            ? inSelectedMonth
                              ? `Included in ${selectedMonthLabel}`
                              : `Logged in ${(inc.date || '').slice(0, 7)}`
                            : `${inc.frequency} (${formatGBP(monthlyEq)}/mo)`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditIncomeModal(inc)}
                        className="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteIncome(inc.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Joint Bill Split Configuration (5 cols) */}
          <section className={`lg:col-span-5 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${cardSurface}`}>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold">
                  Joint Household Split Rule
                </h3>
                <p className="text-xs text-slate-500">
                  How shared bills &amp; joint expenses are divided between {partner1Name} and {partner2Name}
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
                  desc: `Weighted automatically by net monthly income (${Math.round((financialSummary.partner1Income / Math.max(1, financialSummary.partner1Income + financialSummary.partner2Income)) * 100)}% ${partner1Name} / ${Math.round((financialSummary.partner2Income / Math.max(1, financialSummary.partner1Income + financialSummary.partner2Income)) * 100)}% ${partner2Name}).`
                }
              ].map((opt) => {
                const active = splitRule === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleChangeSplitRule(opt.id)}
                    className={`w-full p-4 rounded-2xl border text-left transition cursor-pointer ${
                      active
                        ? 'ring-2 ring-indigo-600 border-indigo-600 bg-indigo-500/10'
                        : darkMode
                          ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-sm">{opt.title}</span>
                      {active && (
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            <div
              className={`p-4 rounded-2xl border text-xs space-y-1.5 ${
                darkMode
                  ? 'bg-slate-950/60 border-slate-800'
                  : 'bg-indigo-50/50 border-indigo-100'
              }`}
            >
              <div className="font-bold text-indigo-600 dark:text-indigo-400">
                Monthly Joint Contribution Target:
              </div>
              <div className="flex justify-between">
                <span>⚡ {partner1Name}&apos;s Joint Share:</span>
                <strong>{formatGBP(financialSummary.partner1TotalRec.jointShare)}/mo</strong>
              </div>
              <div className="flex justify-between">
                <span>🌸 {partner2Name}&apos;s Joint Share:</span>
                <strong>{formatGBP(financialSummary.partner2TotalRec.jointShare)}/mo</strong>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ====================================================================
          MODAL 1: LOG / EDIT EXPENSE
      ==================================================================== */}
      {expenseModalOpen && (
        <div
          onClick={() => setExpenseModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl border space-y-4 ${cardSurface}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {editingExpenseId ? 'Edit Expense' : 'Log Expense'}
              </h3>
              <button
                type="button"
                onClick={() => setExpenseModalOpen(false)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                  Description / Merchant
                </label>
                <input
                  type="text"
                  required
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder="e.g., Sainsbury's shop, Vet prescription, Coffee..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                    className="w-full px-3.5 py-2 rounded-xl text-sm font-bold border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                    Who Is This Expense For?
                  </label>
                  <select
                    value={expOwner}
                    onChange={(e) => setExpOwner(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  >
                    <option value="joint">🤝 Joint / Shared</option>
                    <option value="partner1">⚡ {partner1Name} (Personal)</option>
                    <option value="partner2">🌸 {partner2Name} (Personal)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                    Paid By
                  </label>
                  <select
                    value={expPaidBy}
                    onChange={(e) => setExpPaidBy(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  >
                    <option value="partner1">⚡ {partner1Name}</option>
                    <option value="partner2">🌸 {partner2Name}</option>
                    <option value="joint">🏦 Joint Account</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                  Category
                </label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  placeholder="Optional receipt note..."
                  className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 2: ADD / EDIT SUBSCRIPTION OR DIRECT DEBIT
      ==================================================================== */}
      {recurringModalOpen && (
        <div
          onClick={() => setRecurringModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl border space-y-4 ${cardSurface}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {editingRecurringId
                  ? 'Edit Recurring Commitment'
                  : 'Add Direct Debit or Subscription'}
              </h3>
              <button
                type="button"
                onClick={() => setRecurringModalOpen(false)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRecurring} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'direct-debit', label: '🏦 Direct Debit / Bill' },
                  { id: 'subscription', label: '🔄 Subscription' }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setRecType(t.id)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer ${
                      recType === t.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : darkMode
                          ? 'bg-slate-800 border-slate-700 text-slate-300'
                          : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                  Provider / Title
                </label>
                <input
                  type="text"
                  required
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                  placeholder="e.g., Octopus Energy, Netflix, Council Tax..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                    className="w-full px-3 py-2 rounded-xl text-sm font-bold border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                    Billing Cycle
                  </label>
                  <select
                    value={recCycle}
                    onChange={(e) => setRecCycle(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                    {recCycle === 'weekly'
                      ? 'Billing Day'
                      : recCycle === 'annual' || recCycle === 'quarterly'
                        ? 'Next / Anchor Date'
                        : 'Day (1–31)'}
                  </label>
                  {recCycle === 'weekly' ? (
                    <select
                      value={recBillingWeekday}
                      onChange={(e) => setRecBillingWeekday(Number(e.target.value))}
                      className="w-full px-2.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                    >
                      {WEEKDAY_OPTIONS.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  ) : recCycle === 'annual' || recCycle === 'quarterly' ? (
                    <input
                      type="date"
                      required
                      value={recBillingDate}
                      onChange={(e) => setRecBillingDate(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                    />
                  ) : (
                    <input
                      type="number"
                      min="1"
                      max="31"
                      required
                      value={recBillingDay}
                      onChange={(e) => setRecBillingDay(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                    Owner / Split
                  </label>
                  <select
                    value={recOwner}
                    onChange={(e) => setRecOwner(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                  >
                    <option value="joint">🤝 Joint / Shared</option>
                    <option value="partner1">⚡ {partner1Name} (Personal)</option>
                    <option value="partner2">🌸 {partner2Name} (Personal)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                    Category
                  </label>
                  <select
                    value={recCategory}
                    onChange={(e) => setRecCategory(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
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
                <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  placeholder="Account / contract notes..."
                  className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRecurringModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Save Commitment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 3: ADD / EDIT INCOME STREAM
      ==================================================================== */}
      {incomeModalOpen && (
        <div
          onClick={() => setIncomeModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl border space-y-4 ${cardSurface}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">
                {editingIncomeId ? 'Edit Income Stream' : 'Add Income Stream'}
              </h3>
              <button
                type="button"
                onClick={() => setIncomeModalOpen(false)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveIncome} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'one-off', label: '⚡ One-Off / Variable Income' },
                  { id: 'monthly', label: '🔄 Recurring Salary / Stream' }
                ].map((mode) => {
                  const isOneOffSelected = incFrequency === 'one-off';
                  const active =
                    mode.id === 'one-off' ? isOneOffSelected : !isOneOffSelected;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setIncFrequency(mode.id);
                        if (mode.id === 'one-off' && !editingIncomeId) {
                          setIncCategory('One-Off / Variable');
                        } else if (mode.id !== 'one-off' && !editingIncomeId) {
                          setIncCategory('Salary');
                        }
                      }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : darkMode
                            ? 'bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              {incFrequency === 'one-off' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                      className="w-full px-3 py-2 rounded-xl text-sm font-bold border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                      Date Received / Assigned
                    </label>
                    <input
                      type="date"
                      required
                      value={incDate}
                      onChange={(e) => setIncDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
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
                      className="w-full px-3 py-2 rounded-xl text-sm font-bold border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                      Frequency
                    </label>
                    <select
                      value={incFrequency}
                      onChange={(e) => setIncFrequency(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="annual">Annual</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                      {incFrequency === 'weekly'
                        ? 'Payday'
                        : incFrequency === 'annual' || incFrequency === 'quarterly'
                          ? 'Next / Anchor Date'
                          : 'Payday (1–31)'}
                    </label>
                    {incFrequency === 'weekly' ? (
                      <select
                        value={incPayWeekday}
                        onChange={(e) => setIncPayWeekday(Number(e.target.value))}
                        className="w-full px-2.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                      >
                        {WEEKDAY_OPTIONS.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                    ) : incFrequency === 'annual' || incFrequency === 'quarterly' ? (
                      <input
                        type="date"
                        required
                        value={incPayDate}
                        onChange={(e) => setIncPayDate(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                      />
                    ) : (
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={incPayDay}
                        onChange={(e) => setIncPayDay(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                      />
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                  Person
                </label>
                <select
                  value={incOwner}
                  onChange={(e) => setIncOwner(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                >
                  <option value="partner1">⚡ {partner1Name}</option>
                  <option value="partner2">🌸 {partner2Name}</option>
                  <option value="joint">🤝 Joint Household Income</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={incNotes}
                  onChange={(e) => setIncNotes(e.target.value)}
                  placeholder="Optional payday note..."
                  className="w-full px-3.5 py-2 rounded-xl text-sm border bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIncomeModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Save Income
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

