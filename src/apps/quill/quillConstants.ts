import type { QuillColor } from '../../../shared/schemas/quill.ts';

export const QUILL_LIMITS = {
  maxTitleLen: 200,
  maxBodyLen: 20000,
  maxItems: 200,
  maxItemTextLen: 500,
  maxLabelsPerNote: 20,
  maxLabelLen: 32,
  maxHouseholdLabels: 100
} as const;

export interface QuillColorMeta {
  key: QuillColor;
  label: string;
  cardClass: string;
  swatchClass: string;
  dotClass: string;
}

const DEFAULT_COLOR_META: QuillColorMeta = {
  key: 'default',
  label: 'Default',
  cardClass: 'bg-surface-card border-border-subtle',
  swatchClass: 'bg-[#faf6ee] dark:bg-[#243044]',
  dotClass: 'bg-yellow-400'
};

export const QUILL_COLORS: QuillColorMeta[] = [
  DEFAULT_COLOR_META,
  {
    key: 'coral',
    label: 'Coral',
    cardClass: 'bg-[#f8dcd6] dark:bg-[#4c282b] border-[#e8bfb7] dark:border-[#6e3a3f]',
    swatchClass: 'bg-[#f8dcd6] dark:bg-[#4c282b]',
    dotClass: 'bg-rose-500'
  },
  {
    key: 'peach',
    label: 'Peach',
    cardClass: 'bg-[#fae5cc] dark:bg-[#4e3823] border-[#e9cca8] dark:border-[#705132]',
    swatchClass: 'bg-[#fae5cc] dark:bg-[#4e3823]',
    dotClass: 'bg-orange-500'
  },
  {
    key: 'sand',
    label: 'Sand',
    cardClass: 'bg-[#f5e9bd] dark:bg-[#493e22] border-[#e2d298] dark:border-[#6b5b31]',
    swatchClass: 'bg-[#f5e9bd] dark:bg-[#493e22]',
    dotClass: 'bg-amber-500'
  },
  {
    key: 'mint',
    label: 'Mint',
    cardClass: 'bg-[#d8efe0] dark:bg-[#224134] border-[#b7dcc3] dark:border-[#34614d]',
    swatchClass: 'bg-[#d8efe0] dark:bg-[#224134]',
    dotClass: 'bg-emerald-500'
  },
  {
    key: 'sage',
    label: 'Sage',
    cardClass: 'bg-[#e2ebcf] dark:bg-[#324127] border-[#c5d4a9] dark:border-[#4b6039]',
    swatchClass: 'bg-[#e2ebcf] dark:bg-[#324127]',
    dotClass: 'bg-lime-600'
  },
  {
    key: 'fog',
    label: 'Fog',
    cardClass: 'bg-[#d9ebf0] dark:bg-[#234050] border-[#b8d5de] dark:border-[#345d73]',
    swatchClass: 'bg-[#d9ebf0] dark:bg-[#234050]',
    dotClass: 'bg-cyan-600'
  },
  {
    key: 'storm',
    label: 'Storm',
    cardClass: 'bg-[#d4e1f2] dark:bg-[#273859] border-[#b5c9e4] dark:border-[#3a5280]',
    swatchClass: 'bg-[#d4e1f2] dark:bg-[#273859]',
    dotClass: 'bg-blue-500'
  },
  {
    key: 'dusk',
    label: 'Dusk',
    cardClass: 'bg-[#e3d6f0] dark:bg-[#3c2f5c] border-[#cbb8df] dark:border-[#564482]',
    swatchClass: 'bg-[#e3d6f0] dark:bg-[#3c2f5c]',
    dotClass: 'bg-purple-500'
  },
  {
    key: 'blossom',
    label: 'Blossom',
    cardClass: 'bg-[#f3d8e6] dark:bg-[#502940] border-[#e1b9ce] dark:border-[#733c5d]',
    swatchClass: 'bg-[#f3d8e6] dark:bg-[#502940]',
    dotClass: 'bg-pink-500'
  },
  {
    key: 'clay',
    label: 'Clay',
    cardClass: 'bg-[#eadace] dark:bg-[#44352b] border-[#d6c0b0] dark:border-[#634d3e]',
    swatchClass: 'bg-[#eadace] dark:bg-[#44352b]',
    dotClass: 'bg-amber-700'
  },
  {
    key: 'chalk',
    label: 'Chalk',
    cardClass: 'bg-[#eceae4] dark:bg-[#323a47] border-[#d6d3ca] dark:border-[#4a5568]',
    swatchClass: 'bg-[#eceae4] dark:bg-[#323a47]',
    dotClass: 'bg-slate-500'
  }
];

const COLOR_MAP: Record<string, QuillColorMeta> = Object.fromEntries(
  QUILL_COLORS.map((c) => [c.key, c])
);

export function getQuillColorMeta(colorKey = 'default'): QuillColorMeta {
  return COLOR_MAP[colorKey] ?? DEFAULT_COLOR_META;
}

export function createNoteId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createChecklistItemId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
