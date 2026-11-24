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
  AlertTriangle
} from 'lucide-react';
import {
  getLocalDateKey,
  formatGBP,
  toMonthlyAmount,
  WEEKDAY_OPTIONS,
  escapeCSVCell,
  computeLedgerSettlement,
  getLedgerScheduleInfo
} from '../utils/householdHelpers.js';
import {
  ModuleHeader,
  SegmentedTabs,
  ModalShell,
  EmptyStateCard,
  getFieldClass
} from '../components/HowardUI.jsx';

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
    pillClass: 'bg-emerald-700 text-white border-emerald-700',
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
    pillClass: 'bg-teal-700 text-white border-teal-700',
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
  nowMs = Date.now(),
  onUpsertLedgerItem,
  onDeleteLedgerItem,
  onSaveSplitRule,
  onSaveLedgerData,
  showToast
}) {
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const todayStr = getLocalDateKey(now);
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
  const [selectedMonth, setSelectedMonth] = useState(() => todayStr.slice(0, 7));

  // Filters for Subscriptions/Direct Debits & Expenses
  const [recurringTypeFilter, setRecurringTypeFilter] = useState('all'); // 'all' | 'direct-debit' | 'subscription'
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('All');
  const [expenseSearch, setExpenseSearch] = useState('');

  // Modals: Add/Edit Expense, Add/Edit Recurring, Add/Edit Income, Delete Confirmation
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null); // { kind: 'recurring'|'expense'|'income', id, label }
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

    const totalHouseholdIncome = partner1Income + partner2Income + jointIncome;

    // Determine split ratios for 'joint' items
    const combinedPersonalIncome = partner1Income + partner2Income;
    const proportionalPartner1Share =
      combinedPersonalIncome > 0 ? partner1Income / combinedPersonalIncome : 0.5;
    const partner1JointShare =
      splitRule === 'proportional' ? proportionalPartner1Share : 0.5;
    const partner2JointShare = 1 - partner1JointShare;
    const partner1JointPct = Math.round(partner1JointShare * 100);
    const partner2JointPct = 100 - partner1JointPct;
    const proportionalPartner1Pct = Math.round(proportionalPartner1Share * 100);
    const proportionalPartner2Pct = 100 - proportionalPartner1Pct;

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
    const settlement = computeLedgerSettlement(
      monthExpenses,
      partner1JointShare
    );
    const { netPartner1Balance } = settlement;

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

  // Filtered Recurring items for active perspective & type filter
  // In Partner 1 or Partner 2 perspective, show their personal commitments AND shared joint commitments (with their split share)
  const filteredRecurring = useMemo(() => {
    return recurring
      .map((item) => {
        const { daysUntil, nextDateFormatted, scheduleLabel } =
          getLedgerScheduleInfo(item, false, now);
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
    financialSummary.partner2JointShare,
    now
  ]);

  const filteredIncomes = useMemo(() => {
    return incomes.filter((inc) => {
      if (perspective === 'joint' && inc.owner !== 'joint') return false;
      if (
        (perspective === 'partner1' || perspective === 'partner2') &&
        inc.owner !== perspective &&
        inc.owner !== 'joint'
      ) {
        return false;
      }
      return true;
    });
  }, [incomes, perspective]);

  const perspectiveCounts = useMemo(() => {
    const matchesPerspective = (item) => {
      if (perspective === 'joint') return item.owner === 'joint';
      if (perspective === 'partner1' || perspective === 'partner2') {
        return item.owner === perspective || item.owner === 'joint';
      }
      return true;
    };
    return {
      recurring: recurring.filter(matchesPerspective).length,
      expenses: financialSummary.monthExpenses.filter(matchesPerspective).length,
      incomes: filteredIncomes.length
    };
  }, [recurring, financialSummary.monthExpenses, filteredIncomes.length, perspective]);

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
        ...getLedgerScheduleInfo(r, false, now)
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
  }, [recurring, perspective, now]);

  // --------------------------------------------------------------------------
  // CRUD HANDLERS
  // --------------------------------------------------------------------------
  const openNewExpenseModal = () => {
    const defaultDate =
      selectedMonth === todayStr.slice(0, 7) ? todayStr : `${selectedMonth}-01`;
    setEditingExpenseId(null);
    setExpTitle('');
    setExpAmount('');
    setExpDate(defaultDate);
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
    setExpPaidBy(
      exp.paidBy ||
        (exp.owner === 'partner2'
          ? 'partner2'
          : exp.owner === 'joint'
            ? 'joint'
            : 'partner1')
    );
    setExpNotes(exp.notes || '');
    setExpenseModalOpen(true);
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (isSaving) return;
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
      id: editingExpenseId || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: expTitle.trim(),
      amount: rounded,
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

    setIsSaving(true);
    try {
      const ok = onUpsertLedgerItem
        ? await onUpsertLedgerItem({ kind: 'expense', record, nextLedgerData }, msg)
        : await onSaveLedgerData(nextLedgerData, msg);
      if (ok !== false) {
        setExpenseModalOpen(false);
      }
    } finally {
      setIsSaving(false);
    }
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
      `${todayStr.slice(0, 4)}-01-${String(Math.min(28, Math.max(1, Number(rec.billingDay) || 1))).padStart(2, '0')}`;
    setRecBillingDate(defaultAnchor);
    setRecOwner(rec.owner || 'joint');
    setRecCategory(rec.category || 'Utilities & Bills');
    setRecNotes(rec.notes || '');
    setRecurringModalOpen(true);
  };

  const handleSaveRecurring = async (e) => {
    e.preventDefault();
    if (isSaving) return;
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

    const existing = editingRecurringId
      ? recurring.find((r) => r.id === editingRecurringId)
      : null;

    const record = {
      id: editingRecurringId || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: recTitle.trim(),
      amount: rounded,
      type: recType,
      cycle: recCycle,
      ...scheduleFields,
      owner: recOwner,
      category: recCategory,
      active: editingRecurringId ? existing?.active !== false : true,
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
    const nextRecurring = editingRecurringId
      ? recurring.map((r) => (r.id === editingRecurringId ? mergedRecord : r))
      : [...recurring, mergedRecord];
    const nextLedgerData = { ...ledgerData, recurring: nextRecurring };
    const msg = editingRecurringId
      ? `Updated "${record.title}"`
      : `Added ${record.type === 'direct-debit' ? 'Direct Debit' : 'Subscription'}: "${record.title}"`;

    setIsSaving(true);
    try {
      const ok = onUpsertLedgerItem
        ? await onUpsertLedgerItem({ kind: 'recurring', record: mergedRecord, nextLedgerData }, msg)
        : await onSaveLedgerData(nextLedgerData, msg);
      if (ok !== false) {
        setRecurringModalOpen(false);
      }
    } finally {
      setIsSaving(false);
    }
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
    const defaultDate =
      selectedMonth === todayStr.slice(0, 7) ? todayStr : `${selectedMonth}-01`;
    setEditingIncomeId(null);
    setIncTitle('');
    setIncAmount('');
    setIncFrequency(defaultFreq);
    setIncDate(defaultDate);
    setIncOwner(
      perspective === 'partner1' || perspective === 'partner2' || perspective === 'joint'
        ? perspective
        : activeProfile?.id === 'partner2'
          ? 'partner2'
          : 'partner1'
    );
    setIncPayDay(28);
    setIncPayWeekday(5);
    setIncPayDate(todayStr);
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
      `${todayStr.slice(0, 4)}-01-${String(Math.min(28, Math.max(1, Number(inc.payDay) || 28))).padStart(2, '0')}`;
    setIncPayDate(defaultAnchor);
    setIncNotes(inc.notes || '');
    setIncomeModalOpen(true);
  };

  const handleSaveIncome = async (e) => {
    e.preventDefault();
    if (isSaving) return;
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

    const existing = editingIncomeId
      ? incomes.find((i) => i.id === editingIncomeId)
      : null;

    const record = {
      id: editingIncomeId || `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

    const nextIncomes = editingIncomeId
      ? incomes.map((i) => (i.id === editingIncomeId ? mergedRecord : i))
      : [mergedRecord, ...incomes];
    const nextLedgerData = { ...ledgerData, incomes: nextIncomes };
    const msg = editingIncomeId
      ? `Updated "${mergedRecord.title}"`
      : isOneOff
        ? `Logged one-off income ${formatGBP(mergedRecord.amount)} for "${mergedRecord.title}"`
        : `Added recurring income "${mergedRecord.title}"`;

    setIsSaving(true);
    try {
      const ok = onUpsertLedgerItem
        ? await onUpsertLedgerItem({ kind: 'income', record: mergedRecord, nextLedgerData }, msg)
        : await onSaveLedgerData(nextLedgerData, msg);
      if (ok !== false) {
        setIncomeModalOpen(false);
      }
    } finally {
      setIsSaving(false);
    }
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
    const matchesPerspective = (item) => {
      if (perspective === 'joint') return item.owner === 'joint';
      if (perspective === 'partner1' || perspective === 'partner2') {
        return item.owner === perspective || item.owner === 'joint';
      }
      return true;
    };

    const getShareFactor = (owner) => {
      if (perspective === 'partner1' && owner === 'joint') {
        return financialSummary.partner1JointShare;
      }
      if (perspective === 'partner2' && owner === 'joint') {
        return financialSummary.partner2JointShare;
      }
      return 1;
    };

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
        .filter((r) => r.active !== false && matchesPerspective(r))
        .map((r) => {
          const monthlyEq = toMonthlyAmount(r.amount, r.cycle);
          const shareFactor = getShareFactor(r.owner);
          return [
            escapeCSVCell(r.type === 'direct-debit' ? 'Direct Debit' : 'Subscription'),
            escapeCSVCell(`${getLedgerScheduleInfo(r, false, now).scheduleLabel} (${r.cycle})`),
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
        .filter(matchesPerspective)
        .map((e) => {
          const amt = Number(e.amount || 0);
          const shareFactor = getShareFactor(e.owner);
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
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Howard_Ledger_${selectedMonth}${perspective !== 'unified' ? `_${perspective}` : ''}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast?.(`Exported ${rows.length} Ledger row${rows.length === 1 ? '' : 's'} to CSV`);
  };

  const cardSurface = darkMode
    ? 'bg-slate-900 border-slate-800 text-slate-100'
    : 'bg-white border-slate-200/90 text-slate-800';

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      {/* ====================================================================
          1. TOP HEADER BAR, QUICK ACTIONS & PERSPECTIVE SWITCHER
      ==================================================================== */}
      <ModuleHeader
        accent="amber"
        icon={Wallet}
        title="Ledger • Household Bookkeeping & Subscriptions"
        subtitle={`Track expenses, Direct Debits, subscriptions, and income — separated between ${partner1Name}, ${partner2Name}, and Unified`}
        darkMode={darkMode}
        actions={
          <>
            <button
              type="button"
              onClick={openNewExpenseModal}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-2xs active:scale-[0.98] transition cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Expense</span>
            </button>
            <button
              type="button"
              onClick={() => openNewIncomeModal('one-off')}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-2xs active:scale-[0.98] transition cursor-pointer"
              title="Log a one-off or variable income payment for this month"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Income</span>
            </button>
            <button
              type="button"
              onClick={() => openNewRecurringModal('direct-debit')}
              className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-2xs active:scale-[0.98] transition cursor-pointer ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Bill / Sub</span>
            </button>
            <button
              type="button"
              onClick={handleExportMonthCSV}
              className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-2xs active:scale-[0.98] transition cursor-pointer ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
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
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1 whitespace-nowrap">
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
                            ? meta.pillClass + ' shadow-xs'
                            : darkMode
                              ? 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
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
                    className={`min-w-[40px] min-h-[40px] p-2 rounded-xl border flex items-center justify-center active:scale-[0.98] transition cursor-pointer shrink-0 ${
                      darkMode
                        ? 'border-slate-700 hover:bg-slate-800'
                        : 'border-slate-200 hover:bg-slate-100'
                    }`}
                    title="Previous Month"
                    aria-label="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span>{selectedMonthLabel}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => shiftSelectedMonth(1)}
                    className={`min-w-[40px] min-h-[40px] p-2 rounded-xl border flex items-center justify-center active:scale-[0.98] transition cursor-pointer shrink-0 ${
                      darkMode
                        ? 'border-slate-700 hover:bg-slate-800'
                        : 'border-slate-200 hover:bg-slate-100'
                    }`}
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

            {/* INTERNAL SUB-NAVIGATION TABS */}
            <SegmentedTabs
              accent="amber"
              darkMode={darkMode}
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

      {/* ====================================================================
          2. FOUR FINANCIAL KPI SUMMARY CARDS (DYNAMIC BY PERSPECTIVE)
      ==================================================================== */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Card 1: Monthly Income */}
        <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${cardSurface}`}>
          <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
            <span>
              {perspective === 'joint' ? 'Joint Pool / Split' : 'Monthly Income'}
            </span>
            <TrendingUp className="w-4 h-4 shrink-0" />
          </div>
          <div className="text-2xl xl:text-3xl font-extrabold">
            {perspective === 'joint'
              ? `${financialSummary.partner1JointPct}% / ${financialSummary.partner2JointPct}%`
              : formatGBP(financialSummary.activeKpi.income)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {perspective === 'unified'
              ? `⚡ ${partner1Name} ${formatGBP(financialSummary.partner1Income)} • 🌸 ${partner2Name} ${formatGBP(financialSummary.partner2Income)}${financialSummary.jointIncome > 0 ? ` • 🤝 Joint ${formatGBP(financialSummary.jointIncome)}` : ''}`
              : perspective === 'joint'
                ? `Split rule: ${splitRule === 'proportional' ? 'Proportional to Income' : '50/50 Equal Split'}${financialSummary.jointIncome > 0 ? ` • Joint income: ${formatGBP(financialSummary.jointIncome)}/mo` : ''}`
                : `${ownerMeta[perspective]?.shortLabel}'s monthly net income`}
          </div>
        </div>

        {/* Card 2: Direct Debits & Subscriptions */}
        <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${cardSurface}`}>
          <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">
            <span>Direct Debits &amp; Subs</span>
            <Repeat className="w-4 h-4 shrink-0" />
          </div>
          <div className="text-2xl xl:text-3xl font-extrabold">
            {formatGBP(financialSummary.activeKpi.recurring)}
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">/mo</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            DDs: <strong>{formatGBP(financialSummary.activeKpi.directDebits)}</strong> • Subs:{' '}
            <strong>{formatGBP(financialSummary.activeKpi.subscriptions)}</strong>
          </div>
        </div>

        {/* Card 3: Selected Month Logged Expenses */}
        <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${cardSurface}`}>
          <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
            <span>{selectedMonthLabel} Expenses</span>
            <Receipt className="w-4 h-4 shrink-0" />
          </div>
          <div className="text-2xl xl:text-3xl font-extrabold">
            {formatGBP(financialSummary.activeKpi.expenses)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {financialSummary.activeKpi.subtitle}
          </div>
        </div>

        {/* Card 4: Net Monthly Remainder / Shared Settlement */}
        <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${cardSurface}`}>
          <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
            <span>
              {perspective === 'joint'
                ? 'Total Joint Outgoings'
                : 'Net Monthly Remainder'}
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
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {Math.abs(financialSummary.netPartner1Balance) < 0.01
              ? '✓ Joint expenses settled even this month'
              : financialSummary.netPartner1Balance > 0
                ? `🤝 Shared cards: ${partner2Name} owes ${partner1Name} ${formatGBP(financialSummary.netPartner1Balance)}`
                : `🤝 Shared cards: ${partner1Name} owes ${partner2Name} ${formatGBP(Math.abs(financialSummary.netPartner1Balance))}`}
          </div>
        </div>
      </section>

      {/* ====================================================================
          TAB 1: OVERVIEW, HOUSEHOLD SPLIT & CATEGORY BREAKDOWN
      ==================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-5">
          {/* Side-by-Side Comparison: Partner 1 vs Partner 2 vs Joint */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5 sm:gap-4">
            {/* Joint Household Pool */}
            <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3 ${cardSurface}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                  🤝 Joint / Household Bills
                </span>
                <button
                  type="button"
                  onClick={() => setPerspective('joint')}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 cursor-pointer"
                >
                  Filter Joint &rarr;
                </button>
              </div>
              <div className="space-y-1.5 text-xs pt-1">
                {financialSummary.jointIncome > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Joint Income:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                      {formatGBP(financialSummary.jointIncome)}/mo
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Joint Direct Debits:</span>
                  <span className="font-bold shrink-0">
                    {formatGBP(financialSummary.jointRec.directDebits)}/mo
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Joint Subscriptions:</span>
                  <span className="font-bold shrink-0">
                    {formatGBP(financialSummary.jointRec.subscriptions)}/mo
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Joint Expenses ({selectedMonthLabel}):</span>
                  <span className="font-bold shrink-0">
                    {formatGBP(financialSummary.jointExpTotal)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-extrabold">
                  <span>Total Joint Outgoings:</span>
                  <span className="text-indigo-600 dark:text-indigo-400 shrink-0">
                    {formatGBP(
                      financialSummary.jointRec.total + financialSummary.jointExpTotal
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Partner 1's Breakdown */}
            <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-3 ${cardSurface}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-500/15 text-teal-700 dark:text-teal-300">
                  ⚡ {partner1Name}&apos;s Ledger
                </span>
                <button
                  type="button"
                  onClick={() => setPerspective('partner1')}
                  className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline shrink-0 cursor-pointer"
                >
                  Filter {partner1Name} &rarr;
                </button>
              </div>
              <div className="space-y-1.5 text-xs pt-1">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Personal DDs &amp; Subs:</span>
                  <span className="font-bold shrink-0">
                    {formatGBP(financialSummary.partner1PersonalRec.total)}/mo
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">
                    Share of Joint Bills ({financialSummary.partner1JointPct}%):
                  </span>
                  <span className="font-bold shrink-0">
                    {formatGBP(financialSummary.partner1TotalRec.jointShare)}/mo
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Personal Expenses ({selectedMonthLabel}):</span>
                  <span className="font-bold shrink-0">
                    {formatGBP(financialSummary.partner1PersonalExpTotal)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">
                    Share of Joint Expenses ({financialSummary.partner1JointPct}%):
                  </span>
                  <span className="font-bold shrink-0">
                    {formatGBP(
                      financialSummary.jointExpTotal * financialSummary.partner1JointShare
                    )}
                  </span>
                </div>
                <div className="flex justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-extrabold">
                  <span>Net After All Outgoings:</span>
                  <span className="text-teal-600 dark:text-teal-400 shrink-0">
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300">
                  🌸 {partner2Name}&apos;s Ledger
                </span>
                <button
                  type="button"
                  onClick={() => setPerspective('partner2')}
                  className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline shrink-0 cursor-pointer"
                >
                  Filter {partner2Name} &rarr;
                </button>
              </div>
              <div className="space-y-1.5 text-xs pt-1">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Personal DDs &amp; Subs:</span>
                  <span className="font-bold shrink-0">
                    {formatGBP(financialSummary.partner2PersonalRec.total)}/mo
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">
                    Share of Joint Bills ({financialSummary.partner2JointPct}%):
                  </span>
                  <span className="font-bold shrink-0">
                    {formatGBP(financialSummary.partner2TotalRec.jointShare)}/mo
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Personal Expenses ({selectedMonthLabel}):</span>
                  <span className="font-bold shrink-0">
                    {formatGBP(financialSummary.partner2PersonalExpTotal)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">
                    Share of Joint Expenses ({financialSummary.partner2JointPct}%):
                  </span>
                  <span className="font-bold shrink-0">
                    {formatGBP(
                      financialSummary.jointExpTotal * financialSummary.partner2JointShare
                    )}
                  </span>
                </div>
                <div className="flex justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-sm font-extrabold">
                  <span>Net After All Outgoings:</span>
                  <span className="text-rose-600 dark:text-rose-400 shrink-0">
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

          {/* Dedicated "Who Paid What" Settlement Breakdown Card */}
          {(() => {
            const { settlement } = financialSummary;
            const netBal = settlement.netPartner1Balance;
            const isSettledEven = Math.abs(netBal) < 0.01;
            const payerName = netBal > 0 ? partner2Name : partner1Name;
            const payeeName = netBal > 0 ? partner1Name : partner2Name;
            const jointPaidByJointTotal = financialSummary.monthExpenses
              .filter((e) => e && e.owner === 'joint' && e.paidBy === 'joint')
              .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
            return (
              <section className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${cardSurface}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-extrabold">
                      Who Paid What — {selectedMonthLabel} Settlement
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Card &amp; joint-account expense breakdown between {partner1Name} and {partner2Name}
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                    {splitRule === 'proportional' ? 'Proportional' : '50/50'} Split ({financialSummary.partner1JointPct}% / {financialSummary.partner2JointPct}%)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Partner 1 Paid Breakdown */}
                  <div
                    className={`p-3.5 sm:p-4 rounded-2xl border space-y-2 ${
                      darkMode
                        ? 'bg-slate-800/50 border-slate-700'
                        : 'bg-slate-50/80 border-slate-200/80'
                    }`}
                  >
                    <div className="text-xs font-extrabold flex items-center gap-1.5">
                      <span>⚡</span>
                      <span>{partner1Name}</span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500 dark:text-slate-400">Paid for Joint expenses:</span>
                        <span className="font-bold shrink-0">{formatGBP(settlement.partner1PaidForJoint)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500 dark:text-slate-400">
                          Covered {partner2Name}&apos;s personal items:
                        </span>
                        <span className="font-bold shrink-0">{formatGBP(settlement.partner1PaidForPartner2Personal)}</span>
                      </div>
                      {settlement.partner1PersonalPaidByJoint > 0 && (
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500 dark:text-slate-400">
                            Personal items paid from Joint account:
                          </span>
                          <span className="font-bold shrink-0">{formatGBP(settlement.partner1PersonalPaidByJoint)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Partner 2 Paid Breakdown */}
                  <div
                    className={`p-3.5 sm:p-4 rounded-2xl border space-y-2 ${
                      darkMode
                        ? 'bg-slate-800/50 border-slate-700'
                        : 'bg-slate-50/80 border-slate-200/80'
                    }`}
                  >
                    <div className="text-xs font-extrabold flex items-center gap-1.5">
                      <span>🌸</span>
                      <span>{partner2Name}</span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500 dark:text-slate-400">Paid for Joint expenses:</span>
                        <span className="font-bold shrink-0">{formatGBP(settlement.partner2PaidForJoint)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500 dark:text-slate-400">
                          Covered {partner1Name}&apos;s personal items:
                        </span>
                        <span className="font-bold shrink-0">{formatGBP(settlement.partner2PaidForPartner1Personal)}</span>
                      </div>
                      {settlement.partner2PersonalPaidByJoint > 0 && (
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500 dark:text-slate-400">
                            Personal items paid from Joint account:
                          </span>
                          <span className="font-bold shrink-0">{formatGBP(settlement.partner2PersonalPaidByJoint)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {jointPaidByJointTotal > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 px-1">
                    {formatGBP(jointPaidByJointTotal)} in joint expenses paid directly from the Joint Account
                  </p>
                )}

                {/* Net Settlement Callout Banner */}
                <div
                  className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs sm:text-sm font-bold ${
                    isSettledEven
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                      : 'bg-amber-500/15 border-amber-500/30 text-amber-900 dark:text-amber-200'
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
                        {payerName} transfers {formatGBP(Math.abs(netBal))} to {payeeName} to settle {selectedMonthLabel}
                      </span>
                    </>
                  )}
                </div>
              </section>
            );
          })()}

          {/* Two-Column Lower Grid: Category Breakdown + Upcoming Direct Debits/Subs */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
            {/* Category Breakdown (7 cols) */}
            <div className={`lg:col-span-7 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${cardSurface}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-extrabold">
                    Outgoings by Category ({ownerMeta[perspective]?.shortLabel})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
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
                      <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-700"
                          style={{ width: `${Math.max(3, item.pct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyStateCard
                  accent="amber"
                  darkMode={darkMode}
                  icon={Scale}
                  title="No outgoings recorded yet"
                  description="No outgoings recorded for this view yet."
                />
              )}
            </div>

            {/* Upcoming Billing Days (5 cols) */}
            <div className={`lg:col-span-5 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${cardSurface}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold">
                    Upcoming Direct Debits &amp; Subs
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Due within the next 10 days
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('recurring')}
                  className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline shrink-0 cursor-pointer"
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
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {bill.scheduleLabel} •{' '}
                          <span className="font-semibold text-amber-700 dark:text-amber-400">
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
                        <div className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
                          {bill.type === 'direct-debit' ? 'Direct Debit' : 'Sub'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyStateCard
                  accent="amber"
                  darkMode={darkMode}
                  icon={Repeat}
                  title="No upcoming bills"
                  description="No Direct Debits or Subscriptions due in the next 10 days."
                />
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
              <p className="text-xs text-slate-500 dark:text-slate-400">
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
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold border active:scale-[0.98] transition cursor-pointer ${
                    recurringTypeFilter === flt.id
                      ? 'bg-amber-700 text-white border-amber-700'
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
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold flex items-center gap-1 active:scale-[0.98] transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add New</span>
              </button>
            </div>
          </div>

          {filteredRecurring.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRecurring.map((item) => {
                const ownerInfo = ownerMeta[item.owner] || ownerMeta.joint;
                const isPaused = item.active === false;

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl p-4 border flex flex-col justify-between gap-3 transition ${
                      isPaused
                        ? darkMode
                          ? 'border-dashed border-slate-700 bg-slate-900/60'
                          : 'border-dashed border-slate-300 bg-slate-100/70'
                        : darkMode
                          ? 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
                          : 'bg-slate-50/70 border-slate-200/80 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md ${ownerInfo.badgeClass}`}
                          >
                            {ownerInfo.badgeEmoji} {ownerInfo.shortLabel}
                          </span>
                          <span
                            className={`text-xs font-bold uppercase px-2 py-0.5 rounded-md ${
                              item.type === 'direct-debit'
                                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                            }`}
                          >
                            {item.type === 'direct-debit' ? 'Direct Debit' : 'Subscription'}
                          </span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700">
                            {item.category}
                          </span>
                          {isPaused && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                              Paused
                            </span>
                          )}
                        </div>

                        <h3 className={`font-extrabold text-sm sm:text-base truncate ${isPaused ? 'text-slate-500 dark:text-slate-400' : ''}`}>
                          {item.title}
                        </h3>
                        {item.notes && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.notes}</p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div className={`text-base sm:text-lg font-extrabold ${isPaused ? 'text-slate-500 dark:text-slate-400' : ''}`}>
                          {formatGBP(item.amount)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                          {item.cycle}
                          {item.cycle !== 'monthly' &&
                            ` (${formatGBP(item.monthlyEquiv)}/mo)`}
                          {item.perspectiveShareFactor < 1 &&
                            ` • Your share: ${formatGBP(item.perspectiveMonthlyEquiv)}/mo`}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-200/60 dark:border-slate-800 text-xs">
                      <div className="text-slate-500 dark:text-slate-400">
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
                          className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border active:scale-[0.98] transition cursor-pointer ${
                            isPaused
                              ? 'bg-amber-700 text-white border-amber-700'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {isPaused ? 'Resume' : 'Pause'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditRecurringModal(item)}
                          className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
                          title="Edit"
                          aria-label={`Edit ${item.title}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteItem({
                              kind: 'recurring',
                              id: item.id,
                              label: item.title
                            })
                          }
                          className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer"
                          title="Delete"
                          aria-label={`Delete ${item.title}`}
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
              accent="amber"
              darkMode={darkMode}
              icon={CreditCard}
              title="No subscriptions or Direct Debits match this filter"
              description="Add a household bill or personal subscription to track monthly commitments."
              action={
                <button
                  type="button"
                  onClick={() => openNewRecurringModal('direct-debit')}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold active:scale-[0.98] transition cursor-pointer"
                >
                  + Add First Recurring Bill
                </button>
              }
            />
          )}
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
              <p className="text-xs text-slate-500 dark:text-slate-400">
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
              <div className="relative flex-1 sm:flex-initial sm:w-52 min-w-0">
                <Search className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  placeholder="Search expenses..."
                  aria-label="Search expenses"
                  className={getFieldClass('amber', 'pl-9 min-h-[40px]', { compact: true })}
                />
              </div>

              <div className="min-w-0 w-full sm:w-auto">
                <select
                  value={expenseCategoryFilter}
                  aria-label="Filter expenses by category"
                  onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                  className={getFieldClass('amber', 'min-h-[40px] font-bold', { compact: true })}
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
                onClick={openNewExpenseModal}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold flex items-center gap-1 active:scale-[0.98] transition cursor-pointer"
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
                        <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                          {exp.date}
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md ${ownerInfo.badgeClass}`}
                        >
                          For: {ownerInfo.badgeEmoji} {ownerInfo.shortLabel}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                          Paid by: {paidByInfo.shortLabel}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300">
                          {exp.category}
                        </span>
                      </div>
                      <div className="font-extrabold text-sm sm:text-base">
                        {exp.title}
                      </div>
                      {exp.notes && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">{exp.notes}</div>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-base sm:text-lg font-extrabold">
                          {formatGBP(exp.amount)}
                        </div>
                        {exp.shareFactor < 1 && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Your share: <strong>{formatGBP(exp.effectiveAmount)}</strong>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditExpenseModal(exp)}
                          className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer"
                          title="Edit expense"
                          aria-label={`Edit ${exp.title}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteItem({
                              kind: 'expense',
                              id: exp.id,
                              label: exp.title
                            })
                          }
                          className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer"
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
              accent="amber"
              darkMode={darkMode}
              icon={Receipt}
              title={`No expenses logged for ${selectedMonthLabel} matching this filter`}
              description="Log groceries, vet bills, or shared spending to track monthly outgoings."
              action={
                <button
                  type="button"
                  onClick={openNewExpenseModal}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold cursor-pointer"
                >
                  + Log First Expense for {selectedMonthLabel}
                </button>
              }
            />
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
                <p className="text-xs text-slate-500 dark:text-slate-400">
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
                  onClick={() => openNewIncomeModal('one-off')}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1 active:scale-[0.98] transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>One-Off Income</span>
                </button>
                <button
                  type="button"
                  onClick={() => openNewIncomeModal('monthly')}
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
                          ? darkMode
                            ? 'border-dashed border-slate-700 bg-slate-900/60'
                            : 'border-dashed border-slate-300 bg-slate-100/70'
                          : darkMode
                            ? 'bg-slate-800/50 border-slate-700'
                            : 'bg-slate-50 border-slate-200/80'
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
                            {isOneOff ? `One-Off • ${inc.date || todayStr}` : `Recurring (${inc.frequency})`}
                          </span>
                          {!isOneOff && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Payday: {getLedgerScheduleInfo(inc, true, now).scheduleLabel}
                            </span>
                          )}
                        </div>
                        <div className={`font-extrabold text-sm sm:text-base ${!inSelectedMonth ? 'text-slate-500 dark:text-slate-400' : ''}`}>
                          {inc.title}
                        </div>
                        {inc.notes && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">{inc.notes}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className={`text-base font-extrabold ${
                            inSelectedMonth
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}>
                            {formatGBP(inc.amount)}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
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
                          className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 active:scale-[0.98] transition cursor-pointer"
                          title="Edit income"
                          aria-label={`Edit ${inc.title}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteItem({
                              kind: 'income',
                              id: inc.id,
                              label: inc.title
                            })
                          }
                          className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer"
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
                darkMode={darkMode}
                icon={TrendingUp}
                title={`No income streams match ${ownerMeta[perspective]?.label}`}
                description="Add recurring salaries or one-off payments to calculate monthly remainders."
                action={
                  <button
                    type="button"
                    onClick={() => openNewIncomeModal('monthly')}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold active:scale-[0.98] transition cursor-pointer"
                  >
                    + Add Recurring Salary
                  </button>
                }
              />
            )}
          </section>

          {/* Joint Bill Split Configuration (5 cols) */}
          <section className={`lg:col-span-5 rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs space-y-4 ${cardSurface}`}>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold">
                  Joint Household Split Rule
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
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
                  desc: `Weighted automatically by net monthly income (${financialSummary.proportionalPartner1Pct}% ${partner1Name} / ${financialSummary.proportionalPartner2Pct}% ${partner2Name}).`
                }
              ].map((opt) => {
                const active = splitRule === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleChangeSplitRule(opt.id)}
                    className={`w-full p-4 rounded-2xl border text-left active:scale-[0.98] transition cursor-pointer ${
                      active
                        ? 'ring-2 ring-amber-600 border-amber-600 bg-amber-500/10'
                        : darkMode
                          ? 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-sm">{opt.title}</span>
                      {active && (
                        <CheckCircle2 className="w-4 h-4 text-amber-700 dark:text-amber-400" />
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
                  : 'bg-amber-50/50 border-amber-200/70'
              }`}
            >
              <div className="font-bold text-amber-800 dark:text-amber-300">
                Monthly Joint Contribution Target:
              </div>
              <div className="flex justify-between gap-2">
                <span>⚡ {partner1Name}&apos;s Joint Share:</span>
                <strong className="shrink-0">{formatGBP(financialSummary.partner1TotalRec.jointShare)}/mo</strong>
              </div>
              <div className="flex justify-between gap-2">
                <span>🌸 {partner2Name}&apos;s Joint Share:</span>
                <strong className="shrink-0">{formatGBP(financialSummary.partner2TotalRec.jointShare)}/mo</strong>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ====================================================================
          MODAL 1: LOG / EDIT EXPENSE
      ==================================================================== */}
      <ModalShell
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        title={editingExpenseId ? 'Edit Expense' : 'Log Expense'}
        icon={Receipt}
        accent="amber"
        darkMode={darkMode}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setExpenseModalOpen(false)}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
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
        <form id="ledger-expense-form" onSubmit={handleSaveExpense} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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

      {/* ====================================================================
          MODAL 2: ADD / EDIT SUBSCRIPTION OR DIRECT DEBIT
      ==================================================================== */}
      <ModalShell
        isOpen={recurringModalOpen}
        onClose={() => setRecurringModalOpen(false)}
        title={
          editingRecurringId
            ? 'Edit Recurring Commitment'
            : 'Add Direct Debit or Subscription'
        }
        icon={Repeat}
        accent="amber"
        darkMode={darkMode}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setRecurringModalOpen(false)}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
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
        <form id="ledger-recurring-form" onSubmit={handleSaveRecurring} className="space-y-3.5">
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
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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

            <div className="min-w-0">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Billing Cycle
              </label>
              <select
                value={recCycle}
                onChange={(e) => setRecCycle(e.target.value)}
                className={getFieldClass('amber', '', { compact: true })}
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
                <option value="quarterly">Quarterly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            <div className="min-w-0 sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
                  className={getFieldClass('amber', '', { compact: true })}
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
                  className={getFieldClass('amber', '', { compact: true })}
                />
              ) : (
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={recBillingDay}
                  onChange={(e) => setRecBillingDay(e.target.value)}
                  className={getFieldClass('amber')}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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

      {/* ====================================================================
          MODAL 3: ADD / EDIT INCOME STREAM
      ==================================================================== */}
      <ModalShell
        isOpen={incomeModalOpen}
        onClose={() => setIncomeModalOpen(false)}
        title={editingIncomeId ? 'Edit Income Stream' : 'Add Income Stream'}
        icon={TrendingUp}
        accent="amber"
        darkMode={darkMode}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIncomeModalOpen(false)}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
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
        <form id="ledger-income-form" onSubmit={handleSaveIncome} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                    if (active) return;
                    setIncFrequency(mode.id);
                  }}
                  className={`min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold border active:scale-[0.98] transition cursor-pointer ${
                    active
                      ? 'bg-amber-700 text-white border-amber-700'
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
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                  Frequency
                </label>
                <select
                  value={incFrequency}
                  onChange={(e) => setIncFrequency(e.target.value)}
                  className={getFieldClass('amber', '', { compact: true })}
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>

              <div className="min-w-0 sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
                    className={getFieldClass('amber', '', { compact: true })}
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
                    className={getFieldClass('amber', '', { compact: true })}
                  />
                ) : (
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={incPayDay}
                    onChange={(e) => setIncPayDay(e.target.value)}
                    className={getFieldClass('amber')}
                  />
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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

      {/* ====================================================================
          MODAL 4: DELETE CONFIRMATION
      ==================================================================== */}
      <ModalShell
        isOpen={Boolean(confirmDeleteItem)}
        onClose={() => setConfirmDeleteItem(null)}
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
        ariaLabel={confirmDeleteItem ? `Delete ${confirmDeleteItem.label}` : 'Delete confirmation'}
        icon={AlertTriangle}
        accent="amber"
        darkMode={darkMode}
        maxWidthClass="max-w-sm"
        footer={
          confirmDeleteItem ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteItem(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmDeleteItem;
                  setConfirmDeleteItem(null);
                  if (target.kind === 'recurring') {
                    await handleDeleteRecurring(target.id);
                  } else if (target.kind === 'expense') {
                    await handleDeleteExpense(target.id);
                  } else if (target.kind === 'income') {
                    await handleDeleteIncome(target.id);
                  }
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                Delete
              </button>
            </div>
          ) : null
        }
      >
        {confirmDeleteItem && (
          <p className="text-xs text-slate-500 dark:text-slate-400 break-words leading-relaxed">
            Remove{' '}
            <span className="font-bold text-slate-700 dark:text-slate-200">
              {confirmDeleteItem.label}
            </span>{' '}
            from Ledger? This cannot be undone.
          </p>
        )}
      </ModalShell>
    </main>
  );
}

