import React, { useId, useState } from 'react';
import { Activity, Bug, Calendar, Droplets, Thermometer } from 'lucide-react';
import type { BloomCareLog } from '../../../shared/schemas/bloom.ts';
import { ModalShell, getFieldClass } from '../../components/HowardUI.tsx';
import {
  buildTimestampForDate,
  formatFriendlyDate
} from '../../utils/householdHelpers.ts';
import {
  PREY_OPTIONS,
  type BloomClimateInput,
  type BloomDeleteTarget,
  type BloomFeedingInput,
  type BloomMistInput
} from './bloomConstants.ts';
import {
  AbdomenPicker,
  BehaviorJournalEditor,
  CareEntryList,
  ClimateFields
} from './BloomSharedParts.tsx';

export default function BloomBackfillModal({
  dateKey,
  todayKey,
  dayRecord,
  latestAbdomen,
  activeCaregiver,
  isPending,
  onClose,
  onLogMist,
  onLogFeeding,
  onUpdateAbdomenOnly,
  onLogClimate,
  onToggleBehavior,
  onSaveJournalNote,
  onRequestDelete
}: {
  dateKey: string;
  todayKey: string;
  dayRecord?: BloomCareLog | undefined;
  latestAbdomen: string | null;
  activeCaregiver: string;
  isPending: boolean;
  onClose: () => void;
  onLogMist: (targetDate?: string, opts?: BloomMistInput) => Promise<boolean | undefined>;
  onLogFeeding: (
    outcome?: string,
    targetDate?: string,
    opts?: BloomFeedingInput
  ) => Promise<boolean | undefined>;
  onUpdateAbdomenOnly: (levelId: string, targetDate?: string) => Promise<boolean | undefined>;
  onLogClimate: (targetDate?: string, opts?: BloomClimateInput) => Promise<boolean | undefined>;
  onToggleBehavior: (tag: string, targetDate?: string) => Promise<boolean | undefined>;
  onSaveJournalNote: (targetDate?: string, noteText?: string) => Promise<boolean | undefined>;
  onRequestDelete: (target: BloomDeleteTarget) => void;
}) {
  const uid = useId();
  const [bfMistTime, setBfMistTime] = useState('09:00');
  const [bfMistDrink, setBfMistDrink] = useState(false);
  const [bfMistNote, setBfMistNote] = useState('');
  const [bfPrey, setBfPrey] = useState('hydei');
  const [bfPreyCount, setBfPreyCount] = useState('2');
  const [bfAbdomen, setBfAbdomen] = useState(
    dayRecord?.abdomenStatus || latestAbdomen || 'plump'
  );
  const [bfFeedNote, setBfFeedNote] = useState('');
  const [bfTemp, setBfTemp] = useState('');
  const [bfHumidity, setBfHumidity] = useState('');
  const [bfJournal, setBfJournal] = useState(dayRecord?.journalNote || '');

  const bfMists = dayRecord?.mists || [];
  const bfFeeds = dayRecord?.feedings || [];
  const bfClimates = dayRecord?.climateChecks || [];
  const bfBehaviors = dayRecord?.behaviors || [];

  const handleSubmitMist = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const ok = await onLogMist(dateKey, {
      timestamp: buildTimestampForDate(dateKey, bfMistTime),
      drank: bfMistDrink,
      note: bfMistNote
    });
    if (ok) {
      setBfMistDrink(false);
      setBfMistNote('');
    }
  };

  const handleSubmitFeeding = async (outcome: string) => {
    const parsedCount = Math.max(1, Math.min(20, Math.round(Number(bfPreyCount) || 1)));
    const ok = await onLogFeeding(outcome, dateKey, {
      timestamp: buildTimestampForDate(dateKey, '12:00'),
      preyType: bfPrey,
      count: outcome === 'refused' ? 0 : parsedCount,
      abdomenAfter: bfAbdomen || null,
      note: bfFeedNote
    });
    if (ok) {
      setBfFeedNote('');
    }
  };

  const handleSubmitClimate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const ok = await onLogClimate(dateKey, {
      temp: bfTemp,
      humidity: bfHumidity
    });
    if (ok) {
      setBfTemp('');
      setBfHumidity('');
    }
  };

  const handleSubmitJournal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await onSaveJournalNote(dateKey, bfJournal);
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={`Care Log • ${formatFriendlyDate(dateKey, todayKey)}`}
      subtitle={`${dateKey} • Recorded as ${activeCaregiver}`}
      icon={Calendar}
      accent="emerald"
      maxWidthClass="max-w-lg"
      ariaLabel="Edit or Backfill Past Day Care Log"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-surface-subtle text-text-primary hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Existing recorded entries on this day */}
        <div className="space-y-2 text-xs">
          <div className="font-extrabold uppercase tracking-wide text-xs text-text-secondary">
            Logged Entries for {dateKey}
          </div>
          <CareEntryList
            dateKey={dateKey}
            mists={bfMists}
            feedings={bfFeeds}
            climateChecks={bfClimates}
            variant="backfill"
            onRequestDelete={onRequestDelete}
            disabled={isPending}
          />
        </div>

        {/* Backfill Mist */}
        <form
          onSubmit={handleSubmitMist}
          className="p-3 rounded-2xl border border-border-subtle space-y-2.5 text-xs"
        >
          <div className="font-extrabold flex items-center gap-1.5">
            <Droplets className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>Backfill Enclosure Mist</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="min-w-0">
              <label htmlFor={`${uid}-mist-time`} className="sr-only">
                Mist time
              </label>
              <input
                id={`${uid}-mist-time`}
                type="time"
                value={bfMistTime}
                onChange={(e) => setBfMistTime(e.target.value)}
                className={getFieldClass('emerald', 'min-w-0')}
              />
            </div>
            <label
              htmlFor={`${uid}-mist-drink`}
              className="min-h-[40px] flex items-center gap-2 px-3 py-2 rounded-xl border border-border-strong cursor-pointer"
            >
              <input
                id={`${uid}-mist-drink`}
                type="checkbox"
                checked={bfMistDrink}
                onChange={(e) => setBfMistDrink(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span className="font-semibold">Drank droplets</span>
            </label>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor={`${uid}-mist-note`} className="sr-only">
              Optional mist note
            </label>
            <input
              id={`${uid}-mist-note`}
              type="text"
              value={bfMistNote}
              onChange={(e) => setBfMistNote(e.target.value)}
              placeholder="Optional mist note..."
              className={getFieldClass('emerald', 'flex-1 min-w-0')}
            />
            <button
              type="submit"
              disabled={isPending}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold shrink-0 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
            >
              Add Mist
            </button>
          </div>
        </form>

        {/* Backfill Feeding & Abdomen */}
        <div className="p-3 rounded-2xl border border-border-subtle space-y-2.5 text-xs">
          <AbdomenPicker
            value={bfAbdomen}
            onChange={setBfAbdomen}
            compact
            showHints={false}
            label="Backfill Feeding & Abdomen"
            headerIcon={Bug}
            onSaveOnly={() => void onUpdateAbdomenOnly(bfAbdomen, dateKey)}
            saveLabel="Save Abdomen Only"
            disabled={isPending}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2 min-w-0">
              <label htmlFor={`${uid}-prey`} className="sr-only">
                Feeder Prey
              </label>
              <select
                id={`${uid}-prey`}
                value={bfPrey}
                onChange={(e) => setBfPrey(e.target.value)}
                className={getFieldClass('emerald', 'min-w-0')}
              >
                {PREY_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor={`${uid}-prey-count`} className="sr-only">
                Prey Count
              </label>
              <input
                id={`${uid}-prey-count`}
                type="number"
                min="1"
                max="20"
                value={bfPreyCount}
                onChange={(e) => setBfPreyCount(e.target.value)}
                className={getFieldClass('emerald', 'min-w-0')}
              />
            </div>
          </div>
          <div>
            <label htmlFor={`${uid}-feed-note`} className="sr-only">
              Optional feeding note
            </label>
            <input
              id={`${uid}-feed-note`}
              type="text"
              value={bfFeedNote}
              onChange={(e) => setBfFeedNote(e.target.value)}
              placeholder="Optional feeding note..."
              className={getFieldClass('emerald')}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleSubmitFeeding('eaten')}
              className="min-h-[40px] py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
            >
              Log Eaten Meal
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleSubmitFeeding('refused')}
              className="min-h-[40px] py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition cursor-pointer"
            >
              Log Refused Prey
            </button>
          </div>
        </div>

        {/* Backfill Climate Check */}
        <div className="p-3 rounded-2xl border border-border-subtle space-y-2 text-xs">
          <div className="font-extrabold flex items-center gap-1.5">
            <Thermometer className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>Backfill Climate Check</span>
          </div>
          <ClimateFields
            tempValue={bfTemp}
            onTempChange={setBfTemp}
            humidityValue={bfHumidity}
            onHumidityChange={setBfHumidity}
            onSubmit={handleSubmitClimate}
            submitLabel="Add Check"
            compact
            isPending={isPending}
          />
        </div>

        {/* Backfill Behaviours & Daily Note */}
        <div className="p-3 rounded-2xl border border-border-subtle space-y-2.5 text-xs">
          <div className="font-extrabold flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>Behaviours &amp; Daily Note</span>
          </div>
          <BehaviorJournalEditor
            behaviors={bfBehaviors}
            journalNote={bfJournal}
            onJournalChange={setBfJournal}
            onToggleBehavior={(tag) => onToggleBehavior(tag, dateKey)}
            onSaveNote={handleSubmitJournal}
            placeholder={`Observation note for ${dateKey}...`}
            isPending={isPending}
          />
        </div>
      </div>
    </ModalShell>
  );
}
