import type {
  FloodgateDayLog,
  FloodgateMedicationEntry
} from '../../../shared/schemas/floodgate.ts';

export interface BleedingLevel {
  id: string;
  label: string;
  score: number;
  drops: number;
  desc: string;
  dotColor: string;
  pillClass: string;
}

export const BLEEDING_LEVELS: readonly BleedingLevel[] = [
  {
    id: 'none',
    label: 'None',
    score: 0,
    drops: 0,
    desc: 'No bleeding today',
    dotColor: 'bg-slate-400 dark:bg-slate-500',
    pillClass: 'bg-surface-muted text-text-primary border border-border-strong'
  },
  {
    id: 'spotting',
    label: 'Spotting',
    score: 1,
    drops: 1,
    desc: 'Drops / pantyliner only',
    dotColor: 'bg-rose-300',
    pillClass:
      'bg-rose-500/15 text-rose-900 border border-rose-500/30 dark:text-rose-100'
  },
  {
    id: 'light',
    label: 'Light',
    score: 2,
    drops: 2,
    desc: 'Light flow, regular change',
    dotColor: 'bg-rose-400',
    pillClass:
      'bg-rose-500/25 text-rose-950 border border-rose-500/40 dark:text-rose-50'
  },
  {
    id: 'medium',
    label: 'Medium',
    score: 3,
    drops: 3,
    desc: 'Moderate typical flow',
    dotColor: 'bg-rose-500',
    pillClass: 'bg-rose-600 text-white border border-rose-600'
  },
  {
    id: 'heavy',
    label: 'Heavy',
    score: 4,
    drops: 4,
    desc: 'High volume / frequent changes',
    dotColor: 'bg-rose-700',
    pillClass: 'bg-rose-800 text-white border border-rose-800'
  },
  {
    id: 'flooding',
    label: 'Flooding',
    score: 5,
    drops: 5,
    desc: 'Soaking hourly / double protection',
    dotColor: 'bg-red-800',
    pillClass: 'bg-red-900 text-white border border-red-900'
  }
];

export interface ClotSizeOption {
  id: string;
  label: string;
  desc: string;
}

export const CLOT_SIZES: readonly ClotSizeOption[] = [
  { id: 'small', label: 'Small (<1cm)', desc: 'Pea-sized or smaller' },
  { id: 'medium', label: 'Medium (1–2cm)', desc: 'Grape / 5p coin sized' },
  { id: 'large', label: 'Large (>2cm)', desc: '10p/50p coin or larger' },
  { id: 'tissue', label: 'Decidual / Tissue-like', desc: 'Fleshy or cast-like clots' }
];

export const CLOT_SIZE_LABELS: Record<string, string> = Object.fromEntries(
  CLOT_SIZES.map((s) => [s.id, s.label])
);

export const SIGNIFICANT_CLOT_SIZE_IDS = new Set<string>(['large', 'tissue']);

export const hasSignificantClotSizes = (clotSizes?: readonly string[] | null): boolean =>
  Array.isArray(clotSizes) && clotSizes.some((id) => SIGNIFICANT_CLOT_SIZE_IDS.has(id));

export const PAIN_LOCATIONS: readonly string[] = [
  'Pelvic / Uterine',
  'Lower Back',
  'Abdomen',
  'Left Ovary',
  'Right Ovary',
  'Legs / Sciatic',
  'Rectal / Shooting',
  'Shoulder Tip',
  'Painful Urination'
];

export const PAIN_TYPES: readonly string[] = [
  'Deep Cramping',
  'Sharp / Stabbing',
  'Pulling / Tugging',
  'Throbbing Ache',
  'Burning',
  'Pelvic Heaviness'
];

export interface BowelSeverityOption {
  id: string;
  label: string;
  score: number;
  activeColor: string;
}

export const BOWEL_SEVERITIES: readonly BowelSeverityOption[] = [
  { id: 'none', label: 'None', score: 0, activeColor: 'bg-surface-raised text-text-primary border-border-strong' },
  { id: 'mild', label: 'Mild', score: 1, activeColor: 'bg-amber-500 text-slate-950 border-amber-600' },
  {
    id: 'moderate',
    label: 'Moderate',
    score: 2,
    activeColor: 'bg-orange-600 text-white border-orange-700'
  },
  { id: 'severe', label: 'Severe', score: 3, activeColor: 'bg-red-700 text-white border-red-800' }
];

export const BOWEL_SYMPTOMS: readonly string[] = [
  'Bloating / "Endo Belly"',
  'Constipation',
  'Diarrhea / Loose Stools',
  'Painful Bowel Movement',
  'Nausea',
  'Intestinal Cramping',
  'Urgency',
  'Acid Reflux'
];

export interface PresetMedication {
  name: string;
  defaultDose: string;
  category: string;
}

export const PRESET_MEDICATIONS: readonly PresetMedication[] = [
  { name: 'Ibuprofen', defaultDose: '400mg', category: 'NSAID' },
  { name: 'Paracetamol', defaultDose: '1000mg', category: 'Analgesic' },
  { name: 'Mefenamic Acid', defaultDose: '500mg', category: 'NSAID' },
  { name: 'Naproxen', defaultDose: '500mg', category: 'NSAID' },
  { name: 'Codeine / Co-codamol', defaultDose: '30mg', category: 'Opioid' },
  { name: 'Buscopan', defaultDose: '20mg', category: 'Antispasmodic' },
  { name: 'Tranexamic Acid', defaultDose: '1000mg', category: 'Anti-fibrinolytic' },
  { name: 'Dienogest / Hormones', defaultDose: '2mg', category: 'Hormonal' },
  { name: 'Magnesium / Supplements', defaultDose: 'Daily', category: 'Supplement' }
];

export interface MedEffectivenessOption {
  id: string;
  label: string;
  activeClass: string;
}

export const MED_EFFECTIVENESS: readonly MedEffectivenessOption[] = [
  { id: 'helped', label: 'Helped', activeClass: 'bg-emerald-600 text-white border-emerald-700' },
  { id: 'partial', label: 'Partial', activeClass: 'bg-amber-500 text-slate-950 border-amber-600' },
  { id: 'none', label: 'No Relief', activeClass: 'bg-surface-raised text-text-primary border-border-strong' }
];

export const MED_EFFECTIVENESS_LABELS: Record<string, string> = Object.fromEntries(
  MED_EFFECTIVENESS.map((e) => [e.id, e.label])
);

export const formatMedicationSummary = (med?: FloodgateMedicationEntry | null): string => {
  if (!med) return '';
  const nameDose = [med.name, med.dose].filter(Boolean).join(' ').trim();
  const relief = med.effective ? MED_EFFECTIVENESS_LABELS[med.effective] || med.effective : '';
  return relief ? `${nameDose} (${relief})` : nameDose;
};

export interface ExternalFactorOption {
  id: string;
  label: string;
  type: 'relief' | 'trigger' | 'activity' | 'cycle';
}

export const EXTERNAL_FACTORS: readonly ExternalFactorOption[] = [
  { id: 'heat_pad', label: 'Heat Pad / Hot Water Bottle', type: 'relief' },
  { id: 'tens', label: 'TENS Machine', type: 'relief' },
  { id: 'warm_bath', label: 'Warm Bath', type: 'relief' },
  { id: 'rest_day', label: 'Rest / Bed Day', type: 'relief' },
  { id: 'stretches', label: 'Pelvic Stretches', type: 'relief' },
  { id: 'poor_sleep', label: 'Poor Sleep / Insomnia', type: 'trigger' },
  { id: 'high_stress', label: 'High Stress', type: 'trigger' },
  { id: 'fatigue', label: 'Severe Fatigue', type: 'trigger' },
  { id: 'brain_fog', label: 'Brain Fog', type: 'trigger' },
  { id: 'trigger_food', label: 'Trigger Foods (Dairy/Gluten/Caffeine)', type: 'trigger' },
  { id: 'exercise', label: 'Gentle Walk / Exercise', type: 'activity' },
  { id: 'ovulation', label: 'Suspected Ovulation', type: 'cycle' }
];

export const FACTOR_LABEL_MAP: Record<string, string> = Object.fromEntries(
  EXTERNAL_FACTORS.map((f) => [f.id, f.label])
);

export const getPainBadgeStyle = (score: number | string | null | undefined): string => {
  const s = Number(score) || 0;
  if (s === 0) return 'bg-surface-muted text-text-secondary';
  if (s <= 3) return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300';
  if (s <= 6) return 'bg-amber-500/15 text-amber-800 dark:text-amber-300';
  if (s <= 8) return 'bg-orange-500/15 text-orange-800 dark:text-orange-300';
  return 'bg-rose-500/15 text-rose-800 dark:text-rose-300 font-bold';
};

export const getSafeOwnerSlug = (ownerName?: string | null): string => {
  if (!ownerName || !ownerName.trim()) return '';
  return `_${ownerName.trim().replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
};

export interface NormalizedFloodgateMedication extends FloodgateMedicationEntry {
  id: string;
  name: string;
  dose: string;
  timeNotes: string;
  effective: string;
}

export interface NormalizedFloodgateEntry extends FloodgateDayLog {
  date: string;
  bleedingSeverity: string;
  padCount: number;
  tamponCount: number;
  cupCount: number;
  leakedThrough: boolean;
  hasClots: boolean;
  clotCount: number;
  clotSizes: string[];
  painScore: number;
  painLocations: string[];
  painTypes: string[];
  bowelSeverity: string;
  bowelSymptoms: string[];
  bowelMovementsCount: number;
  medications: NormalizedFloodgateMedication[];
  externalFactors: string[];
  notes: string;
  updatedAt: string;
}

export const createEmptyEntry = (dateStr: string): NormalizedFloodgateEntry => ({
  date: dateStr,
  bleedingSeverity: 'none',
  padCount: 0,
  tamponCount: 0,
  cupCount: 0,
  leakedThrough: false,
  hasClots: false,
  clotCount: 0,
  clotSizes: [],
  painScore: 0,
  painLocations: [],
  painTypes: [],
  bowelSeverity: 'none',
  bowelSymptoms: [],
  bowelMovementsCount: 1,
  medications: [],
  externalFactors: [],
  notes: '',
  updatedAt: new Date().toISOString()
});

export const normalizeEntry = (
  dateStr: string,
  raw?: FloodgateDayLog | null
): NormalizedFloodgateEntry => {
  const base = createEmptyEntry(dateStr);
  if (!raw || typeof raw !== 'object') return base;

  const rawClotCount = Number(raw.clotCount);
  const hasClots = Boolean(raw.hasClots || (Number.isFinite(rawClotCount) && rawClotCount > 0));
  const clotCount = hasClots
    ? Math.max(1, Number.isFinite(rawClotCount) && rawClotCount > 0 ? Math.round(rawClotCount) : 1)
    : 0;
  const padCount = Math.max(0, Number(raw.padCount) || 0);
  const tamponCount = Math.max(0, Number(raw.tamponCount) || 0);
  const cupCount = Math.max(0, Number(raw.cupCount) || 0);
  const painScore = Math.min(10, Math.max(0, Number(raw.painScore) || 0));
  const rawBowelMoves = Number(raw.bowelMovementsCount);
  const bowelMovementsCount =
    raw.bowelMovementsCount === null ||
    raw.bowelMovementsCount === undefined ||
    !Number.isFinite(rawBowelMoves)
      ? base.bowelMovementsCount
      : Math.max(0, Math.round(rawBowelMoves));

  const seenMedIds = new Set<string>();
  const medications: NormalizedFloodgateMedication[] = Array.isArray(raw.medications)
    ? raw.medications
        .filter((m): m is FloodgateMedicationEntry => Boolean(m && typeof m === 'object'))
        .map((m, idx) => {
          let id =
            typeof m.id === 'string' && m.id.trim() ? m.id.trim() : `med-${dateStr}-${idx}`;
          while (seenMedIds.has(id)) {
            id = `${id}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
          }
          seenMedIds.add(id);
          return {
            ...m,
            id,
            name: m.name ?? '',
            dose: m.dose ?? '',
            timeNotes: m.timeNotes ?? '',
            effective: m.effective || 'helped'
          };
        })
    : [];

  return {
    ...base,
    ...raw,
    date: dateStr,
    bleedingSeverity:
      typeof raw.bleedingSeverity === 'string' && raw.bleedingSeverity
        ? raw.bleedingSeverity
        : base.bleedingSeverity,
    padCount,
    tamponCount,
    cupCount,
    leakedThrough: Boolean(raw.leakedThrough),
    hasClots,
    clotCount,
    clotSizes: hasClots && Array.isArray(raw.clotSizes) ? raw.clotSizes : [],
    painScore,
    painLocations: Array.isArray(raw.painLocations) ? raw.painLocations : [],
    painTypes: Array.isArray(raw.painTypes) ? raw.painTypes : [],
    bowelSeverity:
      typeof raw.bowelSeverity === 'string' && raw.bowelSeverity
        ? raw.bowelSeverity
        : base.bowelSeverity,
    bowelSymptoms: Array.isArray(raw.bowelSymptoms) ? raw.bowelSymptoms : [],
    bowelMovementsCount,
    medications,
    externalFactors: Array.isArray(raw.externalFactors) ? raw.externalFactors : [],
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : base.updatedAt
  };
};
