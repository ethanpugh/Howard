export const EXPENSE_CATEGORIES = [
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

export const OWNER_META = {
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

export function buildOwnerMeta(partner1Name, partner2Name) {
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

export function matchesLedgerPerspective(owner, perspective) {
  if (perspective === 'joint') return owner === 'joint';
  if (perspective === 'partner1' || perspective === 'partner2') {
    return owner === perspective || owner === 'joint';
  }
  return true;
}

export function getPerspectiveShareFactor(
  owner,
  perspective,
  partner1JointShare = 0.5,
  partner2JointShare = 0.5
) {
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
