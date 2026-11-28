export const INSTAR_STAGES: readonly string[] = [
  'L1',
  'L2',
  'L3',
  'L4',
  'L5',
  'L6',
  'L7',
  'Sub-adult',
  'Adult'
];

/**
 * Suggests the next molt instar stage based on current instar and sex.
 */
export function getSuggestedNextInstar(currentInstar: string, sex = 'Male'): string {
  if (currentInstar === 'Adult') return 'Adult';
  if (currentInstar === 'Sub-adult') return 'Adult';
  // Male Spiny Flower mantises often enter Sub-adult around L5/L6 and Adult at L6/L7
  if (sex === 'Male' && currentInstar === 'L5') return 'Sub-adult';
  if (sex === 'Female' && currentInstar === 'L6') return 'Sub-adult';
  const idx = INSTAR_STAGES.indexOf(currentInstar);
  if (idx !== -1 && idx < INSTAR_STAGES.length - 1) {
    return INSTAR_STAGES[idx + 1] ?? 'L3';
  }
  return 'L3';
}

export interface SpeciesPreset {
  id: string;
  commonName: string;
  scientificName: string;
  dayTempMinC: number;
  dayTempMaxC: number;
  nightTempMinC: number;
  humidityMinPct: number;
  humidityMaxPct: number;
  mistTargetHours: number;
  note: string;
}

export const SPECIES_PRESETS: readonly SpeciesPreset[] = [
  {
    id: 'spiny_flower',
    commonName: 'Spiny Flower Mantis',
    scientificName: 'Pseudocreobotra wahlbergii',
    dayTempMinC: 25,
    dayTempMaxC: 28,
    nightTempMinC: 20,
    humidityMinPct: 50,
    humidityMaxPct: 65,
    mistTargetHours: 24,
    note: 'Loves warmth (~25–28°C) and strong cross-ventilation. Mist one enclosure wall lightly once daily and allow it to dry out between sprays.'
  },
  {
    id: 'orchid_flower',
    commonName: 'Orchid Mantis',
    scientificName: 'Hymenopus coronatus',
    dayTempMinC: 25,
    dayTempMaxC: 28,
    nightTempMinC: 20,
    humidityMinPct: 60,
    humidityMaxPct: 75,
    mistTargetHours: 16,
    note: 'Tropical petal mimic needing slightly higher humidity (60–75% RH) paired with gentle cross-ventilation and flying pollinators/flies.'
  },
  {
    id: 'jeweled_flower',
    commonName: 'Jeweled Flower Mantis',
    scientificName: 'Creobroter gemmatus',
    dayTempMinC: 24,
    dayTempMaxC: 28,
    nightTempMinC: 19,
    humidityMinPct: 55,
    humidityMaxPct: 65,
    mistTargetHours: 24,
    note: 'Hardy, active flower mantis thriving around 24–28°C with light daily misting and flying prey.'
  },
  {
    id: 'custom',
    commonName: 'Custom Flower Mantis',
    scientificName: 'Mantodea sp.',
    dayTempMinC: 24,
    dayTempMaxC: 28,
    nightTempMinC: 20,
    humidityMinPct: 50,
    humidityMaxPct: 65,
    mistTargetHours: 24,
    note: 'Custom habitat parameters.'
  }
];

export interface AbdomenLevel {
  id: string;
  label: string;
  hint: string;
  pillClass: string;
  activeClass: string;
}

export const ABDOMEN_LEVELS: readonly AbdomenLevel[] = [
  {
    id: 'flat',
    label: 'Flat / Thin',
    hint: 'Hungry — feed soon',
    pillClass: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
    activeClass: 'bg-amber-500 text-slate-950 border-amber-600'
  },
  {
    id: 'ready',
    label: 'Ready',
    hint: 'Good hunting appetite',
    pillClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
    activeClass: 'bg-emerald-700 text-white border-emerald-800'
  },
  {
    id: 'plump',
    label: 'Plump',
    hint: 'Ideal fullness',
    pillClass: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/40',
    activeClass: 'bg-emerald-700 text-white border-emerald-800'
  },
  {
    id: 'stuffed',
    label: 'Stuffed',
    hint: 'Rest & digest',
    pillClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
    activeClass: 'bg-purple-600 text-white border-purple-700'
  }
];

export interface PreyOption {
  id: string;
  label: string;
  stages: string;
}

export const PREY_OPTIONS: readonly PreyOption[] = [
  { id: 'melanogaster', label: 'D. melanogaster (Tiny Fruit Fly)', stages: 'L1–L2' },
  { id: 'hydei', label: 'D. hydei (Larger Fruit Fly)', stages: 'L2–L4' },
  { id: 'curly_wing', label: 'Curly-Wing Fly', stages: 'L4–Sub-adult' },
  { id: 'greenbottle', label: 'Greenbottle / Bluebottle Fly', stages: 'L5–Adult' },
  { id: 'micro_locust', label: 'Hatchling / Pinhead Locust', stages: 'L3–L5' },
  { id: 'waxmoth', label: 'Waxmoth / Small Moth', stages: 'Sub-adult–Adult' },
  { id: 'honey', label: 'Tiny Raw Honey Droplet (Boost)', stages: 'All stages' }
];

export interface FeederCultureType {
  id: string;
  label: string;
  defaultDays: number;
}

export const FEEDER_CULTURE_TYPES: readonly FeederCultureType[] = [
  { id: 'melanogaster', label: 'D. melanogaster Culture', defaultDays: 25 },
  { id: 'hydei', label: 'D. hydei Culture', defaultDays: 28 },
  { id: 'curly_wing', label: 'Curly-Wing Fly Tub / Casters', defaultDays: 18 },
  { id: 'greenbottle', label: 'Greenbottle / Bluebottle Casters (Fridge)', defaultDays: 21 },
  { id: 'micro_locust', label: 'Hatchling / Micro Locust Tub', defaultDays: 14 },
  { id: 'waxmoth', label: 'Waxworms / Waxmoth Tub', defaultDays: 21 }
];

export const BEHAVIOR_TAGS: readonly string[] = [
  'Petal Sway',
  'Drank Droplets',
  'Active Ambush',
  'Threat Display!',
  'Hanging on Mesh Lid',
  'Abdomen Pulsing',
  'Swollen Wing Buds'
];

export interface FeederStatusOption {
  id: string;
  label: string;
}

export const FEEDER_STATUS_OPTIONS: readonly FeederStatusOption[] = [
  { id: 'warming_up', label: 'Warming Up' },
  { id: 'booming', label: 'Booming' },
  { id: 'low', label: 'Running Low' },
  { id: 'crashed', label: 'Crashed' }
];

export interface MoltQualityOption {
  id: string;
  label: string;
}

export const MOLT_QUALITY_OPTIONS: readonly MoltQualityOption[] = [
  { id: 'clean', label: 'Clean Shed' },
  { id: 'minor_issue', label: 'Minor Snag' },
  { id: 'mismolt', label: 'Mismolt' }
];

export interface BloomDeleteTarget {
  kind: 'mist' | 'feeding' | 'climate' | 'molt' | 'feeder';
  id: string;
  label: string;
  dateKey?: string | undefined;
}

export interface BloomMistInput {
  timestamp?: string | undefined;
  drank?: boolean | undefined;
  note?: string | undefined;
}

export interface BloomFeedingInput {
  timestamp?: string | undefined;
  preyType?: string | undefined;
  count?: number | undefined;
  abdomenAfter?: string | null | undefined;
  note?: string | undefined;
  leavePreyWarning?: boolean | undefined;
  overrideLockout?: boolean | undefined;
}

export interface BloomClimateInput {
  temp?: string | number | undefined;
  humidity?: string | number | undefined;
}
