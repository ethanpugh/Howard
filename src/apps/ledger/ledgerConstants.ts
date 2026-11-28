import type {
  LedgerData,
  LedgerItem,
  LedgerKind,
  LedgerOwner,
  LedgerScheduleCycle,
  LedgerSplitRule
} from '../../../shared/schemas/ledger.ts';
import type { LedgerSettlementResult } from '../../utils/householdHelpers.ts';

export type LedgerPerspective = 'unified' | LedgerOwner;
export type LedgerTabId = 'overview' | 'recurring' | 'expenses' | 'income';
export type RecurringTypeFilter = 'all' | 'direct-debit' | 'subscription';
export type RecurringType = 'direct-debit' | 'subscription';

export interface OwnerMetaEntry {
  id: LedgerPerspective;
  label: string;
  shortLabel: string;
  badgeEmoji: string;
  pillClass: string;
  badgeClass: string;
}

export interface OwnerMetaMap {
  unified: OwnerMetaEntry;
  joint: OwnerMetaEntry;
  partner1: OwnerMetaEntry;
  partner2: OwnerMetaEntry;
}

export interface LedgerDeleteTarget {
  kind: LedgerKind;
  id: string;
  label: string;
}

export interface LedgerRecurringBucket {
  total: number;
  directDebits: number;
  subscriptions: number;
}

export interface LedgerPartnerRecurringBucket extends LedgerRecurringBucket {
  personalOnly: number;
  jointShare: number;
}

export interface LedgerActiveKpi {
  income: number;
  recurring: number;
  directDebits: number;
  subscriptions: number;
  expenses: number;
  netRemainder: number;
  subtitle: string;
}

export interface LedgerFinancialSummary {
  partner1Income: number;
  partner2Income: number;
  jointIncome: number;
  totalHouseholdIncome: number;
  proportionalPartner1Share: number;
  partner1JointShare: number;
  partner2JointShare: number;
  partner1JointPct: number;
  partner2JointPct: number;
  proportionalPartner1Pct: number;
  proportionalPartner2Pct: number;
  unifiedRec: LedgerRecurringBucket;
  jointRec: LedgerRecurringBucket;
  partner1PersonalRec: LedgerRecurringBucket;
  partner2PersonalRec: LedgerRecurringBucket;
  partner1TotalRec: LedgerPartnerRecurringBucket;
  partner2TotalRec: LedgerPartnerRecurringBucket;
  monthExpenses: LedgerItem[];
  unifiedExpTotal: number;
  jointExpTotal: number;
  partner1PersonalExpTotal: number;
  partner2PersonalExpTotal: number;
  partner1JointExpShare: number;
  partner2JointExpShare: number;
  settlement: LedgerSettlementResult;
  netPartner1Balance: number;
  activeKpi: LedgerActiveKpi;
}

export interface EnrichedRecurringItem extends LedgerItem {
  daysUntil: number;
  nextDateFormatted: string;
  scheduleLabel: string;
  monthlyEquiv: number;
  perspectiveShareFactor: number;
  perspectiveMonthlyEquiv: number;
}

export interface EnrichedExpenseItem extends LedgerItem {
  shareFactor: number;
  effectiveAmount: number;
}

export interface UpcomingBillItem extends LedgerItem {
  daysUntil: number;
  nextDateFormatted: string;
  scheduleLabel: string;
}

export type UpsertLedgerItemFn = (
  payload: { kind: LedgerKind; record: LedgerItem; nextLedgerData?: LedgerData },
  toastText?: string
) => Promise<boolean>;

export type DeleteLedgerItemFn = (
  payload: { id: string; nextLedgerData?: LedgerData },
  toastText?: string
) => Promise<boolean>;

export type SaveLedgerSplitRuleFn = (
  payload: { splitRule: LedgerSplitRule; nextLedgerData?: LedgerData },
  toastText?: string
) => Promise<boolean>;

export type SaveLedgerDataFn = (
  nextLedgerData: LedgerData,
  toastText?: string
) => Promise<boolean>;

export type LedgerScheduleType = LedgerScheduleCycle;

export const EXPENSE_CATEGORIES: readonly string[] = [
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

export const OWNER_META: OwnerMetaMap = {
  unified: {
    id: 'unified',
    label: 'Unified (Whole Household)',
    shortLabel: 'Unified',
    badgeEmoji: '🏠',
    pillClass: 'bg-orange-700 text-white border-orange-700',
    badgeClass: 'bg-orange-500/15 text-orange-800 dark:text-orange-300'
  },
  joint: {
    id: 'joint',
    label: 'Joint / Shared Only',
    shortLabel: 'Joint',
    badgeEmoji: '🤝',
    pillClass: 'bg-surface-raised text-text-primary border-border-strong',
    badgeClass: 'bg-surface-muted text-text-secondary'
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

export function toPence(value: number | string | null | undefined): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

export function fromPence(pence: number): number {
  const rounded = Math.round(pence) / 100;
  return Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
}

export function splitPenceComplementary(totalPence: number, share1: number): [number, number] {
  const clamped = Number.isFinite(share1) ? Math.min(1, Math.max(0, share1)) : 0.5;
  const roundedTotal = Math.round(totalPence);
  const p1 = Math.round(roundedTotal * clamped);
  return [p1, roundedTotal - p1];
}

export function buildOwnerMeta(partner1Name: string, partner2Name: string): OwnerMetaMap {
  return {
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
  };
}

export function matchesLedgerPerspective(
  owner: LedgerOwner | string | undefined,
  perspective: LedgerPerspective
): boolean {
  if (perspective === 'joint') return owner === 'joint';
  if (perspective === 'partner1' || perspective === 'partner2') {
    return owner === perspective || owner === 'joint';
  }
  return true;
}

export function getPerspectiveShareFactor(
  owner: LedgerOwner | string | undefined,
  perspective: LedgerPerspective,
  partner1JointShare = 0.5,
  partner2JointShare = 0.5
): number {
  if (perspective === 'joint') return owner === 'joint' ? 1 : 0;
  if (perspective === 'partner1') {
    if (owner === 'partner1') return 1;
    if (owner === 'joint') return partner1JointShare;
    return 0;
  }
  if (perspective === 'partner2') {
    if (owner === 'partner2') return 1;
    if (owner === 'joint') return partner2JointShare;
    return 0;
  }
  return 1;
}
