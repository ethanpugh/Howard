import React, { useId, useMemo, useState } from 'react';
import { AlertTriangle, Bug, Check, Plus, Ruler } from 'lucide-react';
import type { BloomEnclosureInfo, BloomSettings } from '../../../shared/schemas/bloom.ts';
import {
  EmptyStateCard,
  IconBadge,
  SectionCard,
  SubSurface,
  getFieldClass
} from '../../components/HowardUI.tsx';
import {
  formatFriendlyDate,
  type BloomSummary,
  type EnrichedBloomFeeder
} from '../../utils/householdHelpers.ts';
import {
  FEEDER_CULTURE_TYPES,
  FEEDER_STATUS_OPTIONS,
  type BloomDeleteTarget
} from './bloomConstants.ts';
import { DeleteIconButton } from './BloomSharedParts.tsx';

export interface BloomFeederDraft {
  name: string;
  feederType: string;
  startedDate: string;
  shelfLifeDays: number | string;
  status: string;
  storageNote: string;
}

export interface BloomEnclosureDraft {
  currentSizeLabel: string;
  meshType: string;
  substrate: string;
  lastDeepCleanDate: string;
  currentBodyLengthMm: number | string;
  enclosureHeightMm: number | string;
  enclosureWidthMm: number | string;
}

function toEnclosureDraft(info: BloomEnclosureInfo): BloomEnclosureDraft {
  return {
    currentSizeLabel: info.currentSizeLabel,
    meshType: info.meshType,
    substrate: info.substrate,
    lastDeepCleanDate: info.lastDeepCleanDate,
    currentBodyLengthMm: info.currentBodyLengthMm,
    enclosureHeightMm: info.enclosureHeightMm,
    enclosureWidthMm: info.enclosureWidthMm
  };
}

export default function BloomHabitatTab({
  settings,
  summary,
  todayKey,
  canConfigure,
  isPending,
  onAddFeederCulture,
  onUpdateFeederStatus,
  onSaveEnclosure,
  onMarkEnclosureCleaned,
  onRequestDelete
}: {
  settings: BloomSettings;
  summary: BloomSummary;
  todayKey: string;
  canConfigure: boolean;
  isPending: boolean;
  onAddFeederCulture: (draft: BloomFeederDraft) => Promise<boolean | undefined>;
  onUpdateFeederStatus: (
    feeder: EnrichedBloomFeeder,
    nextStatus: string
  ) => Promise<boolean | undefined>;
  onSaveEnclosure: (draft: BloomEnclosureDraft) => Promise<boolean | undefined>;
  onMarkEnclosureCleaned: () => Promise<boolean | undefined>;
  onRequestDelete: (target: BloomDeleteTarget) => void;
}) {
  const uid = useId();
  const [newFeederOpen, setNewFeederOpen] = useState(false);
  const [feederNameInput, setFeederNameInput] = useState('D. hydei Culture #1');
  const [feederTypeInput, setFeederTypeInput] = useState('hydei');
  const [feederStartedInput, setFeederStartedInput] = useState(todayKey);
  const [feederShelfDaysInput, setFeederShelfDaysInput] = useState<number | string>(28);
  const [feederStatusInput, setFeederStatusInput] = useState('booming');
  const [feederNoteInput, setFeederNoteInput] = useState('');

  const [editingEnclosure, setEditingEnclosure] = useState(false);
  const [enclosureDraft, setEnclosureDraft] = useState<BloomEnclosureDraft>(() =>
    toEnclosureDraft(settings.enclosureInfo)
  );

  const instarFeederTip = useMemo(() => {
    const st = settings.currentInstar;
    if (st === 'L1' || st === 'L2') {
      return 'Nymph L1–L2: Flightless D. melanogaster or small D. hydei fruit flies (2–4 flies every 1–2 days until abdomen is plump).';
    }
    if (st === 'L3' || st === 'L4') {
      return 'Nymph L3–L4: D. hydei fruit flies, pinhead/hatchling locusts, or first small curly-wing flies.';
    }
    return `Older Nymph / Adult (L5+): Curly-wing flies, greenbottle/bluebottle flies, and small waxmoths—${
      settings.commonName ? `${settings.commonName} thrives` : 'flower mantises thrive'
    } on flying prey!`;
  }, [settings.currentInstar, settings.commonName]);

  const handleSubmitFeeder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const ok = await onAddFeederCulture({
      name: feederNameInput,
      feederType: feederTypeInput,
      startedDate: feederStartedInput || todayKey,
      shelfLifeDays: feederShelfDaysInput,
      status: feederStatusInput,
      storageNote: feederNoteInput
    });
    if (ok) {
      setNewFeederOpen(false);
      setFeederNoteInput('');
    }
  };

  const handleSubmitEnclosure = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const ok = await onSaveEnclosure(enclosureDraft);
    if (ok) {
      setEditingEnclosure(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
      {/* Live Feeder Colony Tracker (7 cols) */}
      <SectionCard className="lg:col-span-7 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold">Live Feeder Stash &amp; Cultures</h2>
            <p className="text-xs text-text-muted">
              Track fruit fly pots &amp; casters so you never get caught by a culture crash
            </p>
          </div>
          {canConfigure && (
            <button
              type="button"
              aria-expanded={newFeederOpen}
              onClick={() => {
                setFeederStartedInput(todayKey);
                setNewFeederOpen((prev) => !prev);
              }}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Culture</span>
            </button>
          )}
        </div>

        <div className="p-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 text-xs">
          <strong>{settings.currentInstar} Sizing Tip:</strong> {instarFeederTip}
        </div>

        {newFeederOpen && canConfigure && (
          <form
            onSubmit={handleSubmitFeeder}
            className="p-4 rounded-2xl border border-border-subtle bg-surface-subtle space-y-3"
          >
            <div className="text-xs font-extrabold">Add Active Feeder Culture / Tub</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="min-w-0">
                <label htmlFor={`${uid}-feeder-type`} className="sr-only">
                  Feeder Culture Type
                </label>
                <select
                  id={`${uid}-feeder-type`}
                  value={feederTypeInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFeederTypeInput(val);
                    const preset = FEEDER_CULTURE_TYPES.find((t) => t.id === val);
                    if (preset) {
                      setFeederNameInput(preset.label);
                      setFeederShelfDaysInput(preset.defaultDays);
                    }
                  }}
                  className={getFieldClass('emerald', 'min-w-0')}
                >
                  {FEEDER_CULTURE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor={`${uid}-feeder-name`} className="sr-only">
                  Feeder Culture Label
                </label>
                <input
                  id={`${uid}-feeder-name`}
                  type="text"
                  required
                  value={feederNameInput}
                  onChange={(e) => setFeederNameInput(e.target.value)}
                  placeholder="Label (e.g., Hydei Pot #2)"
                  className={getFieldClass('emerald', 'min-w-0')}
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor={`${uid}-feeder-started`}
                  className="block text-xs font-bold uppercase text-text-muted mb-1"
                >
                  Started / Arrived Date
                </label>
                <input
                  id={`${uid}-feeder-started`}
                  type="date"
                  value={feederStartedInput}
                  onChange={(e) => setFeederStartedInput(e.target.value)}
                  className={getFieldClass('emerald', 'min-w-0')}
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor={`${uid}-feeder-days`}
                  className="block text-xs font-bold uppercase text-text-muted mb-1"
                >
                  Est. Lifespan (Days)
                </label>
                <input
                  id={`${uid}-feeder-days`}
                  type="number"
                  min="5"
                  max="90"
                  value={feederShelfDaysInput}
                  onChange={(e) => setFeederShelfDaysInput(e.target.value)}
                  className={getFieldClass('emerald', 'min-w-0')}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="min-w-0">
                <label htmlFor={`${uid}-feeder-status`} className="sr-only">
                  Initial Feeder Status
                </label>
                <select
                  id={`${uid}-feeder-status`}
                  value={feederStatusInput}
                  onChange={(e) => setFeederStatusInput(e.target.value)}
                  className={getFieldClass('emerald', 'min-w-0')}
                >
                  <option value="warming_up">Status: Warming Up (Fresh)</option>
                  <option value="booming">Status: Booming</option>
                  <option value="low">Status: Running Low</option>
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor={`${uid}-feeder-note`} className="sr-only">
                  Storage Note
                </label>
                <input
                  id={`${uid}-feeder-note`}
                  type="text"
                  value={feederNoteInput}
                  onChange={(e) => setFeederNoteInput(e.target.value)}
                  placeholder="Storage note (e.g., Top shelf)..."
                  className={getFieldClass('emerald', 'min-w-0')}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFeederOpen(false)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold bg-surface-muted text-text-primary hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
              >
                Save Culture
              </button>
            </div>
          </form>
        )}

        {summary.feeders.length === 0 ? (
          <EmptyStateCard
            accent="emerald"
            icon={Bug}
            title="No active feeder cultures tracked yet"
            description="Add your fruit fly pots, curly-wing tubs, or casters so you never get caught by a culture crash."
            action={
              canConfigure ? (
                <button
                  type="button"
                  onClick={() => {
                    setFeederStartedInput(todayKey);
                    setNewFeederOpen(true);
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add First Culture</span>
                </button>
              ) : null
            }
          />
        ) : (
          <div className="space-y-3">
            {summary.feeders.map((f) => {
              const pct = Math.min(100, Math.max(5, Math.round((f.ageDays / f.shelfLifeDays) * 100)));
              return (
                <div
                  key={f.id}
                  className={`p-3.5 rounded-2xl border space-y-2.5 text-xs ${
                    f.isAlert
                      ? 'bg-amber-500/10 border-amber-500/40'
                      : 'bg-surface-subtle border-border-subtle'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-extrabold text-sm">{f.name}</div>
                      <div className="text-xs text-text-secondary">
                        Day {f.ageDays} of ~{f.shelfLifeDays}d (
                        {f.daysRemaining <= 0 ? 'Past cycle window' : `${f.daysRemaining}d left`})
                        {f.storageNote ? ` • ${f.storageNote}` : ''}
                      </div>
                    </div>
                    {canConfigure && (
                      <DeleteIconButton
                        disabled={isPending}
                        title="Remove culture"
                        ariaLabel="Remove culture"
                        onClick={() =>
                          onRequestDelete({
                            kind: 'feeder',
                            id: f.id,
                            label: f.name
                          })
                        }
                      />
                    )}
                  </div>

                  <div className="w-full h-2 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        f.isAlert ? 'bg-amber-500' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div
                    role="group"
                    aria-label={`${f.name} status`}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {FEEDER_STATUS_OPTIONS.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        aria-pressed={f.status === st.id}
                        disabled={!canConfigure || isPending}
                        onClick={() => onUpdateFeederStatus(f, st.id)}
                        className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border transition ${
                          canConfigure ? 'active:scale-[0.98] cursor-pointer' : 'cursor-default'
                        } disabled:opacity-60 ${
                          f.status === st.id
                            ? st.id === 'low' || st.id === 'crashed'
                              ? 'bg-amber-500 text-slate-950 border-amber-600'
                              : 'bg-emerald-700 text-white border-emerald-800'
                            : 'bg-surface-card border-border-strong text-text-secondary hover:bg-surface-hover'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Enclosure Sizing & Hygiene Card (5 cols) */}
      <SectionCard className="lg:col-span-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <IconBadge icon={Ruler} accent="emerald" size="sm" />
            <div>
              <h2 className="text-base font-extrabold">Enclosure &amp; Clearance</h2>
              <p className="text-xs text-text-muted">3× height &amp; 2× width molting rule</p>
            </div>
          </div>
          {canConfigure && (
            <button
              type="button"
              aria-expanded={editingEnclosure}
              onClick={() => {
                setEnclosureDraft(toEnclosureDraft(settings.enclosureInfo));
                setEditingEnclosure((prev) => !prev);
              }}
              className="min-h-[40px] px-2.5 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 hover:underline active:scale-[0.98] transition cursor-pointer shrink-0"
            >
              {editingEnclosure ? 'Cancel' : 'Edit Specs'}
            </button>
          )}
        </div>

        {/* Clearance Status */}
        <div
          className={`p-3.5 rounded-2xl border text-xs space-y-1 ${
            summary.clearance.isEnclosureTight
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-950 dark:text-amber-200'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
          }`}
        >
          <div className="font-extrabold flex items-center gap-1.5">
            {summary.clearance.isEnclosureTight ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Upsize Soon — Enclosure Getting Snug for {summary.clearance.bodyLen}mm</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>Safe Molting Clearance ({summary.clearance.encH}mm H × {summary.clearance.encW}mm W)</span>
              </>
            )}
          </div>
          <p
            className={
              summary.clearance.isEnclosureTight
                ? 'text-amber-900 dark:text-amber-100'
                : 'text-emerald-900 dark:text-emerald-100'
            }
          >
            At {summary.clearance.bodyLen}mm body length, {settings.mantisName} needs at least{' '}
            <strong>{summary.clearance.minSafeHeightMm}mm</strong> vertical height and{' '}
            <strong>{summary.clearance.minSafeWidthMm}mm</strong> width.
          </p>
        </div>

        {editingEnclosure && canConfigure ? (
          <form onSubmit={handleSubmitEnclosure} className="space-y-3 text-xs">
            <div>
              <label
                htmlFor={`${uid}-enc-label`}
                className="block text-xs font-bold uppercase text-text-muted mb-1"
              >
                Enclosure Label
              </label>
              <input
                id={`${uid}-enc-label`}
                type="text"
                value={enclosureDraft.currentSizeLabel || ''}
                onChange={(e) =>
                  setEnclosureDraft({ ...enclosureDraft, currentSizeLabel: e.target.value })
                }
                className={getFieldClass('emerald')}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2">
              <div className="min-w-0">
                <label
                  htmlFor={`${uid}-enc-body`}
                  className="block text-xs font-bold uppercase text-text-muted mb-1"
                >
                  Mantis (mm)
                </label>
                <input
                  id={`${uid}-enc-body`}
                  type="number"
                  min="0.1"
                  max="500"
                  step="0.1"
                  value={enclosureDraft.currentBodyLengthMm ?? ''}
                  onChange={(e) =>
                    setEnclosureDraft({
                      ...enclosureDraft,
                      currentBodyLengthMm: e.target.value
                    })
                  }
                  className={getFieldClass('emerald', 'min-w-0')}
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor={`${uid}-enc-height`}
                  className="block text-xs font-bold uppercase text-text-muted mb-1"
                >
                  Height (mm)
                </label>
                <input
                  id={`${uid}-enc-height`}
                  type="number"
                  min="1"
                  max="2000"
                  step="0.1"
                  value={enclosureDraft.enclosureHeightMm ?? ''}
                  onChange={(e) =>
                    setEnclosureDraft({ ...enclosureDraft, enclosureHeightMm: e.target.value })
                  }
                  className={getFieldClass('emerald', 'min-w-0')}
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor={`${uid}-enc-width`}
                  className="block text-xs font-bold uppercase text-text-muted mb-1"
                >
                  Width (mm)
                </label>
                <input
                  id={`${uid}-enc-width`}
                  type="number"
                  min="1"
                  max="2000"
                  step="0.1"
                  value={enclosureDraft.enclosureWidthMm ?? ''}
                  onChange={(e) =>
                    setEnclosureDraft({ ...enclosureDraft, enclosureWidthMm: e.target.value })
                  }
                  className={getFieldClass('emerald', 'min-w-0')}
                />
              </div>
            </div>
            <div>
              <label
                htmlFor={`${uid}-enc-mesh`}
                className="block text-xs font-bold uppercase text-text-muted mb-1"
              >
                Ceiling Mesh Type (Avoid bare metal mesh!)
              </label>
              <input
                id={`${uid}-enc-mesh`}
                type="text"
                value={enclosureDraft.meshType || ''}
                onChange={(e) =>
                  setEnclosureDraft({ ...enclosureDraft, meshType: e.target.value })
                }
                className={getFieldClass('emerald')}
              />
            </div>
            <div>
              <label
                htmlFor={`${uid}-enc-substrate`}
                className="block text-xs font-bold uppercase text-text-muted mb-1"
              >
                Substrate &amp; Perches
              </label>
              <input
                id={`${uid}-enc-substrate`}
                type="text"
                value={enclosureDraft.substrate || ''}
                onChange={(e) =>
                  setEnclosureDraft({ ...enclosureDraft, substrate: e.target.value })
                }
                className={getFieldClass('emerald')}
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="w-full min-h-[40px] py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
            >
              Save Habitat Specs
            </button>
          </form>
        ) : (
          <div className="space-y-2.5 text-xs">
            <SubSurface className="p-3 space-y-1.5">
              <div>
                <span className="text-text-muted">Housing:</span>{' '}
                <strong>{settings.enclosureInfo.currentSizeLabel}</strong>
              </div>
              <div>
                <span className="text-text-muted">Ceiling Grip:</span>{' '}
                <strong>{settings.enclosureInfo.meshType}</strong>
              </div>
              <div>
                <span className="text-text-muted">Substrate:</span>{' '}
                <strong>{settings.enclosureInfo.substrate}</strong>
              </div>
              <div>
                <span className="text-text-muted">Last Substrate Tidy / Clean:</span>{' '}
                <strong>
                  {settings.enclosureInfo.lastDeepCleanDate
                    ? formatFriendlyDate(settings.enclosureInfo.lastDeepCleanDate, todayKey)
                    : 'Not recorded'}
                </strong>
              </div>
            </SubSurface>
            {canConfigure && (
              <button
                type="button"
                disabled={isPending}
                onClick={onMarkEnclosureCleaned}
                className="w-full min-h-[40px] py-2.5 px-3 rounded-xl border border-border-strong bg-surface-card hover:bg-surface-hover text-xs font-bold active:scale-[0.98] transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                ✓ Mark Substrate / Enclosure Cleaned Today
              </button>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
