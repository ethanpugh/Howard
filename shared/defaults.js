import { getLocalDateKey } from './dateUtils.js';

export function createDefaultCadenceSettings(dateObj = new Date()) {
  return {
    catName: 'Pet',
    medicationName: 'Oral Solution',
    dosageLabel: '2.5 mg / 0.5 ml',
    morningTargetTime: '08:00',
    eveningTargetTime: '20:00',
    bottleOpenedDate: getLocalDateKey(dateObj),
    bottleShelfLifeDays: 180,
    caregivers: ['Partner 1', 'Partner 2', 'Caregiver'],
    caregiverItems: [
      { profileId: 'partner1', name: 'Partner 1' },
      { profileId: 'partner2', name: 'Partner 2' },
      { profileId: 'caregiver', name: 'Caregiver' }
    ],
    administrationNote:
      'Give directly by mouth or with a small portion of wet food. Wipe syringe tip clean after each use.'
  };
}

export const DEFAULT_FLOODGATE_SETTINGS = {
  ownerProfileId: 'partner2',
  ownerName: 'Partner 2',
  appName: 'Floodgate'
};

export function createDefaultBloomSettings(dateObj = new Date()) {
  const todayKey = getLocalDateKey(dateObj);
  return {
    mantisName: 'Mantis',
    speciesPreset: 'spiny_flower',
    commonName: 'Spiny Flower Mantis',
    scientificName: 'Pseudocreobotra wahlbergii',
    sex: 'Unsexed',
    pronouns: 'they/them',
    currentInstar: 'L2',
    arrivalDate: todayKey,
    hatchDate: '',
    currentColorMorph: 'Spiky creamy-white & dark banded nymph',
    lifecycleStatus: 'normal',
    premoltStartedAt: null,
    hardeningUntil: null,
    hardeningHours: 36,
    livePreyInside: false,
    livePreyNote: '',
    dayTempMinC: 25,
    dayTempMaxC: 28,
    nightTempMinC: 20,
    humidityMinPct: 50,
    humidityMaxPct: 65,
    mistTargetHours: 24,
    typicalInterMoltDays: 14,
    enclosureInfo: {
      currentSizeLabel: 'Ventilated Nymph Cup / Mini Tall Enclosure',
      meshType: 'Soft nylon / fabric mesh (tarsal-safe)',
      substrate: 'Paper towel / coco fibre + climbing twigs & blossoms',
      lastDeepCleanDate: todayKey,
      currentBodyLengthMm: 10,
      enclosureHeightMm: 110,
      enclosureWidthMm: 75
    },
    caregivers: ['Partner 1', 'Partner 2', 'Caregiver'],
    caregiverItems: [
      { profileId: 'partner1', name: 'Partner 1' },
      { profileId: 'partner2', name: 'Partner 2' },
      { profileId: 'caregiver', name: 'Caregiver' }
    ],
    careNote:
      'Mist one enclosure wall lightly once daily for drinking droplets—never spray the mantis directly, and let the enclosure dry between mists (Spiny Flower Mantises need cross-ventilation!). Do NOT offer live prey during Premolt Watch or Post-Molt Hardening.'
  };
}

export const DEFAULT_LEDGER_DATA = {
  splitRule: '50-50',
  incomes: [],
  recurring: [],
  expenses: []
};

export const DEFAULT_BEACON_INFO = {
  petCare: {
    summary: '',
    feedingGuide: '',
    carrierAndSupplies: '',
    quirksAndNotes: ''
  },
  vetInfo: {
    clinicName: '',
    phone: '',
    emergencyPhone: '',
    address: '',
    policyNumber: '',
    notes: ''
  },
  contacts: [
    {
      id: 'c-partner1',
      profileId: 'partner1',
      name: 'Partner 1',
      role: 'Household Member',
      phone: '',
      note: ''
    },
    {
      id: 'c-partner2',
      profileId: 'partner2',
      name: 'Partner 2',
      role: 'Household Member',
      phone: '',
      note: ''
    }
  ],
  houseGuide: {
    wifiName: '',
    wifiPassword: '',
    binDayInfo: '',
    utilitiesInfo: '',
    emergencyNotes: ''
  }
};
