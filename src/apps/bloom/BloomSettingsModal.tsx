import React, { useId, useState } from 'react';
import { Check, Settings } from 'lucide-react';
import type { BloomSettings } from '../../../shared/schemas/bloom.ts';
import { ModalShell, getFieldClass } from '../../components/HowardUI.tsx';
import { INSTAR_STAGES, SPECIES_PRESETS } from './bloomConstants.ts';

export interface BloomSettingsForm {
  mantisName: string;
  speciesPreset: string;
  commonName: string;
  scientificName: string;
  sex: string;
  currentInstar: string;
  arrivalDate: string;
  currentColorMorph: string;
  dayTempMinC: number | string;
  dayTempMaxC: number | string;
  nightTempMinC: number | string;
  humidityMinPct: number | string;
  humidityMaxPct: number | string;
  mistTargetHours: number | string;
  hardeningHours: number | string;
  typicalInterMoltDays: number | string;
  careNote: string;
}

function toSettingsForm(settings: BloomSettings): BloomSettingsForm {
  return {
    mantisName: settings.mantisName,
    speciesPreset: settings.speciesPreset,
    commonName: settings.commonName,
    scientificName: settings.scientificName,
    sex: settings.sex,
    currentInstar: settings.currentInstar,
    arrivalDate: settings.arrivalDate,
    currentColorMorph: settings.currentColorMorph,
    dayTempMinC: settings.dayTempMinC,
    dayTempMaxC: settings.dayTempMaxC,
    nightTempMinC: settings.nightTempMinC,
    humidityMinPct: settings.humidityMinPct,
    humidityMaxPct: settings.humidityMaxPct,
    mistTargetHours: settings.mistTargetHours,
    hardeningHours: settings.hardeningHours,
    typicalInterMoltDays: settings.typicalInterMoltDays,
    careNote: settings.careNote
  };
}

export default function BloomSettingsModal({
  settings,
  isPending,
  onClose,
  onSave
}: {
  settings: BloomSettings;
  isPending: boolean;
  onClose: () => void;
  onSave: (form: BloomSettingsForm) => Promise<boolean | undefined>;
}) {
  const uid = useId();
  const formId = `${uid}-form`;
  const [settingsForm, setSettingsForm] = useState<BloomSettingsForm>(() =>
    toSettingsForm(settings)
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await onSave(settingsForm);
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Bloom • Mantis & Care Settings"
      subtitle={`${settings.mantisName} • ${settings.commonName}`}
      icon={Settings}
      accent="emerald"
      maxWidthClass="max-w-lg"
      disableBackdropClose={isPending}
      ariaLabel="Bloom Mantis and Care Settings"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-surface-subtle text-text-primary hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            disabled={isPending}
            className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-extrabold bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{isPending ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-name`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Mantis Name
            </label>
            <input
              id={`${uid}-name`}
              type="text"
              value={settingsForm.mantisName || ''}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, mantisName: e.target.value })
              }
              className={getFieldClass('emerald', 'font-bold min-w-0')}
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-species`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Species Preset
            </label>
            <select
              id={`${uid}-species`}
              value={settingsForm.speciesPreset || 'spiny_flower'}
              onChange={(e) => {
                const preset = SPECIES_PRESETS.find((p) => p.id === e.target.value);
                if (preset) {
                  setSettingsForm({
                    ...settingsForm,
                    speciesPreset: preset.id,
                    commonName: preset.commonName,
                    scientificName: preset.scientificName,
                    dayTempMinC: preset.dayTempMinC,
                    dayTempMaxC: preset.dayTempMaxC,
                    nightTempMinC: preset.nightTempMinC,
                    humidityMinPct: preset.humidityMinPct,
                    humidityMaxPct: preset.humidityMaxPct,
                    mistTargetHours: preset.mistTargetHours
                  });
                }
              }}
              className={getFieldClass('emerald', 'min-w-0')}
            >
              {SPECIES_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.commonName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-sex`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Sex
            </label>
            <select
              id={`${uid}-sex`}
              value={settingsForm.sex || 'Unsexed'}
              onChange={(e) => setSettingsForm({ ...settingsForm, sex: e.target.value })}
              className={getFieldClass('emerald', 'min-w-0')}
            >
              <option value="Male">♂ Male</option>
              <option value="Female">♀ Female</option>
              <option value="Unsexed">Unsexed Nymph</option>
            </select>
          </div>
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-instar`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Current Instar
            </label>
            <select
              id={`${uid}-instar`}
              value={settingsForm.currentInstar || 'L2'}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, currentInstar: e.target.value })
              }
              className={getFieldClass('emerald', 'font-bold min-w-0')}
            >
              {INSTAR_STAGES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-arrival`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Arrival Date
            </label>
            <input
              id={`${uid}-arrival`}
              type="date"
              value={settingsForm.arrivalDate || ''}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, arrivalDate: e.target.value })
              }
              className={getFieldClass('emerald', 'min-w-0')}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor={`${uid}-morph`}
            className="block font-bold uppercase text-text-secondary mb-1"
          >
            Current Colour / Morph Description
          </label>
          <input
            id={`${uid}-morph`}
            type="text"
            value={settingsForm.currentColorMorph || ''}
            onChange={(e) =>
              setSettingsForm({ ...settingsForm, currentColorMorph: e.target.value })
            }
            className={getFieldClass('emerald')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-mist-hours`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Mist Every (h)
            </label>
            <input
              id={`${uid}-mist-hours`}
              type="number"
              min="1"
              max="168"
              value={settingsForm.mistTargetHours ?? ''}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, mistTargetHours: e.target.value })
              }
              className={getFieldClass('emerald', 'min-w-0')}
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-hardening-hours`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Post-Molt Lock (h)
            </label>
            <input
              id={`${uid}-hardening-hours`}
              type="number"
              min="0"
              max="168"
              value={settingsForm.hardeningHours ?? ''}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, hardeningHours: e.target.value })
              }
              className={getFieldClass('emerald', 'min-w-0')}
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-intermolt-days`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Est. Molt Cycle (d)
            </label>
            <input
              id={`${uid}-intermolt-days`}
              type="number"
              min="1"
              max="180"
              value={settingsForm.typicalInterMoltDays ?? ''}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, typicalInterMoltDays: e.target.value })
              }
              className={getFieldClass('emerald', 'min-w-0')}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-temp-min`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Min °C
            </label>
            <input
              id={`${uid}-temp-min`}
              type="number"
              min="10"
              max="45"
              value={settingsForm.dayTempMinC ?? ''}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, dayTempMinC: e.target.value })
              }
              className={getFieldClass('emerald', 'min-w-0')}
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-temp-max`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Max °C
            </label>
            <input
              id={`${uid}-temp-max`}
              type="number"
              min="10"
              max="50"
              value={settingsForm.dayTempMaxC ?? ''}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, dayTempMaxC: e.target.value })
              }
              className={getFieldClass('emerald', 'min-w-0')}
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-rh-min`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Min RH%
            </label>
            <input
              id={`${uid}-rh-min`}
              type="number"
              min="10"
              max="100"
              value={settingsForm.humidityMinPct ?? ''}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, humidityMinPct: e.target.value })
              }
              className={getFieldClass('emerald', 'min-w-0')}
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor={`${uid}-rh-max`}
              className="block font-bold uppercase text-text-secondary mb-1"
            >
              Max RH%
            </label>
            <input
              id={`${uid}-rh-max`}
              type="number"
              min="10"
              max="100"
              value={settingsForm.humidityMaxPct ?? ''}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, humidityMaxPct: e.target.value })
              }
              className={getFieldClass('emerald', 'min-w-0')}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor={`${uid}-care-note`}
            className="block font-bold uppercase text-text-secondary mb-1"
          >
            Household &amp; Pet Sitter Care Note
          </label>
          <textarea
            id={`${uid}-care-note`}
            rows={3}
            value={settingsForm.careNote || ''}
            onChange={(e) => setSettingsForm({ ...settingsForm, careNote: e.target.value })}
            className={getFieldClass('emerald')}
          />
        </div>
      </form>
    </ModalShell>
  );
}
