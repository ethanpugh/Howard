import React, { useMemo, useState } from 'react';
import {
  Droplets,
  Activity,
  Pill,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Check,
  Trash2,
  Sliders,
  X
} from 'lucide-react';
import {
  Button,
  CardHeader,
  SectionCard,
  StatusPill,
  SubSurface,
  getFieldClass
} from '../../components/HowardUI.jsx';
import {
  shiftDateKey,
  parseLocalDateKey,
  formatDateFriendlyEnGB,
  formatShortDateEnGB
} from '../../utils/householdHelpers.js';
import {
  BLEEDING_LEVELS,
  CLOT_SIZES,
  PAIN_LOCATIONS,
  PAIN_TYPES,
  BOWEL_SEVERITIES,
  BOWEL_SYMPTOMS,
  PRESET_MEDICATIONS,
  MED_EFFECTIVENESS,
  EXTERNAL_FACTORS,
  getPainBadgeStyle
} from './floodgateConstants.js';

export default function DailyLogTab({
  selectedDate,
  todayKey,
  formData,
  logsMap,
  ownerName,
  isDirty,
  saveFailed,
  pendingNav,
  onSelectDate,
  onSaveDayEntry,
  onDiscardPendingNav,
  onRequestDeleteLog,
  onCopyYesterdayMeds,
  onUpdateField,
  onToggleArrayItem,
  onAddPresetMed,
  onAddCustomMed,
  onUpdateMedItem,
  onRemoveMedItem
}) {
  const [customMedName, setCustomMedName] = useState('');
  const [customMedDose, setCustomMedDose] = useState('');
  const [customMedTime, setCustomMedTime] = useState('');
  const [accordionOverrides, setAccordionOverrides] = useState({});

  const hasBowelData =
    (formData.bowelSeverity && formData.bowelSeverity !== 'none') ||
    (formData.bowelSymptoms || []).length > 0;
  const hasMedsData =
    (formData.medications || []).length > 0 || (formData.externalFactors || []).length > 0;

  const isSectionOpen = (key, defaultOpen) => {
    const overrideKey = `${selectedDate}:${key}`;
    if (Object.prototype.hasOwnProperty.call(accordionOverrides, overrideKey)) {
      return accordionOverrides[overrideKey];
    }
    return defaultOpen;
  };

  const toggleSection = (key, currentOpen) => {
    const overrideKey = `${selectedDate}:${key}`;
    setAccordionOverrides((prev) => ({ ...prev, [overrideKey]: !currentOpen }));
  };

  const bleedingOpen = isSectionOpen('bleeding', true);
  const painOpen = isSectionOpen('pain', true);
  const bowelOpen = isSectionOpen('bowel', hasBowelData);
  const medsOpen = isSectionOpen('meds', hasMedsData);

  const weekStripDays = useMemo(() => {
    const items = [];
    for (let i = -5; i <= 1; i++) {
      const dStr = shiftDateKey(selectedDate, i);
      const dateObj = parseLocalDateKey(dStr);
      const dayNumber = dateObj.getDate();
      const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'short' });
      const dayLog = logsMap[dStr];
      const bleedInfo = BLEEDING_LEVELS.find(
        (b) => b.id === (dayLog?.bleedingSeverity || 'none')
      );
      items.push({ dStr, dayNumber, dayName, dayLog, bleedInfo });
    }
    return items;
  }, [selectedDate, logsMap]);

  const handleSubmitCustomMed = (e) => {
    e.preventDefault();
    if (!customMedName.trim()) return;
    onAddCustomMed({
      name: customMedName,
      dose: customMedDose,
      time: customMedTime
    });
    setCustomMedName('');
    setCustomMedDose('');
    setCustomMedTime('');
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* DATE NAVIGATOR & 7-DAY STRIP */}
      <SectionCard>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => onSelectDate(shiftDateKey(selectedDate, -1))}
              className="min-w-[40px] min-h-[40px] p-2 rounded-xl border border-border-strong hover:bg-surface-hover flex items-center justify-center shrink-0 active:scale-[0.98] transition cursor-pointer"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="px-2 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                <h2 className="text-base sm:text-xl font-bold">
                  {formatDateFriendlyEnGB(selectedDate, todayKey)}
                </h2>
                {selectedDate === todayKey && (
                  <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                    Today
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted">
                {logsMap[selectedDate]
                  ? 'Logged entry saved for this date'
                  : 'No entry saved yet for this date'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onSelectDate(shiftDateKey(selectedDate, 1))}
              className="min-w-[40px] min-h-[40px] p-2 rounded-xl border border-border-strong hover:bg-surface-hover flex items-center justify-center shrink-0 active:scale-[0.98] transition cursor-pointer"
              aria-label="Next day"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Save, Date Picker & Quick Today Button */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
            {isDirty && (
              <button
                type="button"
                onClick={onSaveDayEntry}
                title={`Save log for ${formatShortDateEnGB(selectedDate)}`}
                className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Save</span>
              </button>
            )}
            {selectedDate !== todayKey && (
              <button
                type="button"
                onClick={() => onSelectDate(todayKey)}
                className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 active:scale-[0.98] transition cursor-pointer"
              >
                Jump to Today
              </button>
            )}
            <div className="min-w-[145px] flex-1 sm:flex-initial sm:w-44">
              <input
                type="date"
                value={selectedDate}
                aria-label="Select log date"
                onChange={(e) => e.target.value && onSelectDate(e.target.value)}
                className={getFieldClass('rose', 'min-h-[40px] font-medium', { compact: true })}
              />
            </div>
            {logsMap[selectedDate] && (
              <button
                type="button"
                onClick={onRequestDeleteLog}
                title="Clear this day's entry"
                aria-label="Clear this day's entry"
                className="min-w-[40px] min-h-[40px] p-2 rounded-xl flex items-center justify-center text-text-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 7-Day Quick Selector Strip */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 pt-3">
          {weekStripDays.map(({ dStr, dayNumber, dayName, dayLog, bleedInfo }) => {
            const isSelected = dStr === selectedDate;
            return (
              <button
                key={dStr}
                type="button"
                onClick={() => onSelectDate(dStr)}
                className={`flex flex-col items-center py-2 px-0.5 sm:px-1 rounded-2xl border transition-all active:scale-[0.98] cursor-pointer ${
                  isSelected
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-surface-subtle border-border-subtle hover:bg-surface-hover text-text-secondary'
                }`}
              >
                <span
                  className={`text-[11px] sm:text-xs font-medium ${
                    isSelected ? 'text-rose-100' : 'text-text-muted'
                  }`}
                >
                  {dayName}
                </span>
                <span className="text-sm sm:text-base font-bold my-0.5">{dayNumber}</span>
                <div className="flex items-center gap-1 h-2 mt-0.5">
                  {dayLog?.bleedingSeverity && dayLog.bleedingSeverity !== 'none' && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? 'bg-white' : bleedInfo?.dotColor || 'bg-rose-500'
                      }`}
                    />
                  )}
                  {dayLog?.hasClots && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? 'bg-fuchsia-200' : 'bg-fuchsia-700'
                      }`}
                    />
                  )}
                  {Number(dayLog?.painScore) >= 6 && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? 'bg-amber-200' : 'bg-amber-500'
                      }`}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* MAIN TWO-COLUMN LOGGING GRID FOR TABLET & DESKTOP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-3.5 sm:gap-4">
        <div className="space-y-3.5 sm:space-y-4">
        {/* 1. BLEEDING & CLOTS CARD */}
        <SectionCard className="space-y-4">
          <CardHeader
            icon={Droplets}
            accent="rose"
            titleAs="h3"
            title="Period & Bleeding"
            subtitle="Flow severity, sanitary products & blood clots"
            badges={
              <StatusPill accent="rose" className="capitalize">
                {formData.bleedingSeverity || 'none'}
              </StatusPill>
            }
            action={
              <button
                type="button"
                onClick={() => toggleSection('bleeding', bleedingOpen)}
                aria-expanded={bleedingOpen}
                aria-label={bleedingOpen ? 'Collapse Period & Bleeding' : 'Expand Period & Bleeding'}
                className="lg:hidden min-w-[36px] min-h-[36px] rounded-xl border border-border-strong bg-surface-subtle flex items-center justify-center text-text-secondary cursor-pointer"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${bleedingOpen ? 'rotate-180' : ''}`}
                />
              </button>
            }
          />

          <div className={`${bleedingOpen ? 'block' : 'hidden'} lg:block space-y-4`}>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-text-secondary">
              Bleeding Severity
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {BLEEDING_LEVELS.map((level) => {
                const active = formData.bleedingSeverity === level.id;
                return (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => onUpdateField('bleedingSeverity', level.id)}
                    className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all active:scale-[0.98] cursor-pointer ${
                      active
                        ? 'border-rose-600 ring-2 ring-rose-600/30 bg-rose-500/10 dark:bg-rose-500/15 text-text-primary shadow-xs'
                        : 'bg-surface-subtle border-border-strong text-text-primary hover:bg-surface-hover'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 w-full mb-1 min-w-0">
                      <span className="font-bold text-sm leading-tight">{level.label}</span>
                      <div className="flex gap-0.5 shrink-0">
                        {Array.from({ length: Math.max(1, level.drops) }).map((_, idx) => (
                          <span
                            key={idx}
                            className={`w-1 h-2.5 rounded-full ${
                              level.drops === 0
                                ? 'bg-border-strong'
                                : level.dotColor
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <span
                      className={`text-xs leading-tight ${
                        active ? 'text-text-secondary' : 'text-text-muted'
                      }`}
                    >
                      {level.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {formData.bleedingSeverity !== 'none' && (
            <SubSurface className="p-4 space-y-4 bg-rose-500/5 border-rose-500/20">
              <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Protection Used Today (Optional)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { field: 'padCount', label: 'Pads' },
                  { field: 'tamponCount', label: 'Tampons' },
                  { field: 'cupCount', label: 'Cups / Pants' }
                ].map((item) => (
                  <div
                    key={item.field}
                    className="p-2.5 rounded-xl border border-border-strong bg-surface-card text-center"
                  >
                    <div className="text-xs font-medium mb-1.5">{item.label}</div>
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.label}`}
                        onClick={() =>
                          onUpdateField(item.field, Math.max(0, (formData[item.field] || 0) - 1))
                        }
                        className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-surface-subtle hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-bold text-sm">{formData[item.field] || 0}</span>
                      <button
                        type="button"
                        aria-label={`Increase ${item.label}`}
                        onClick={() =>
                          onUpdateField(item.field, (formData[item.field] || 0) + 1)
                        }
                        className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-rose-500/15 text-rose-800 dark:text-rose-200 hover:bg-rose-500/25 active:scale-[0.98] transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onUpdateField('leakedThrough', !formData.leakedThrough)}
                className={`w-full min-h-[40px] flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer ${
                  formData.leakedThrough
                    ? 'bg-red-700 text-white border-red-800'
                    : 'bg-surface-card border-border-strong text-text-secondary hover:bg-surface-hover'
                }`}
              >
                <span>Leaked through clothes or bedding today</span>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center ${
                    formData.leakedThrough
                      ? 'bg-white text-red-700'
                      : 'border border-border-strong'
                  }`}
                >
                  {formData.leakedThrough && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </button>
            </SubSurface>
          )}

          {/* CLOTS TRACKER SECTION */}
          <SubSurface
            className={`p-4 space-y-4 ${
              formData.hasClots
                ? 'bg-fuchsia-500/10 border-fuchsia-500/30'
                : 'bg-surface-subtle border-border-subtle'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <span>Blood Clots Tracker</span>
                  {formData.hasClots && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-fuchsia-700 text-white font-semibold">
                      {formData.clotCount || 1} logged
                    </span>
                  )}
                </h4>
                <p className="text-xs text-text-secondary">
                  Did you pass any blood clots today?
                </p>
              </div>

              <div className="flex gap-1 rounded-2xl p-1 bg-surface-tray self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => onUpdateField('hasClots', false)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all active:scale-[0.98] cursor-pointer ${
                    !formData.hasClots
                      ? 'bg-surface-card text-text-primary shadow-2xs'
                      : 'text-text-secondary'
                  }`}
                >
                  No Clots
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateField('hasClots', true);
                    if (!formData.clotCount) onUpdateField('clotCount', 1);
                  }}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all active:scale-[0.98] cursor-pointer ${
                    formData.hasClots ? 'bg-fuchsia-700 text-white shadow-2xs' : 'text-text-secondary'
                  }`}
                >
                  Yes, Clots
                </button>
              </div>
            </div>

            {formData.hasClots && (
              <div className="space-y-4 pt-2 border-t border-fuchsia-500/25">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Approximate number of clots:</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Decrease clot count"
                      onClick={() =>
                        onUpdateField('clotCount', Math.max(1, (formData.clotCount || 1) - 1))
                      }
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-surface-card border border-border-strong hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-base font-bold w-8 text-center">
                      {formData.clotCount || 1}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase clot count"
                      onClick={() => onUpdateField('clotCount', (formData.clotCount || 0) + 1)}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-fuchsia-700 text-white hover:bg-fuchsia-800 active:scale-[0.98] transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold mb-2">Clot Size(s) Observed:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CLOT_SIZES.map((sz) => {
                      const selected = (formData.clotSizes || []).includes(sz.id);
                      return (
                        <button
                          key={sz.id}
                          type="button"
                          onClick={() => onToggleArrayItem('clotSizes', sz.id)}
                          className={`min-h-[40px] p-2.5 rounded-xl border text-left transition-all active:scale-[0.98] cursor-pointer ${
                            selected
                              ? 'bg-fuchsia-700 text-white border-fuchsia-700'
                              : 'bg-surface-card border-border-strong text-text-primary hover:bg-surface-hover'
                          }`}
                        >
                          <div className="text-xs font-bold">{sz.label}</div>
                          <div
                            className={`text-xs ${selected ? 'text-fuchsia-100' : 'text-text-muted'}`}
                          >
                            {sz.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </SubSurface>
          </div>
        </SectionCard>

        {/* 3. BOWEL & GI ISSUES CARD */}
        <SectionCard className="space-y-4">
          <CardHeader
            icon={Sliders}
            accent="rose"
            titleAs="h3"
            title="Bowel & GI Symptoms"
            subtitle='"Endo belly" bloating, bowel pain & digestive changes'
            badges={
              <StatusPill accent="rose" className="capitalize">
                {formData.bowelSeverity || 'none'}
              </StatusPill>
            }
            action={
              <button
                type="button"
                onClick={() => toggleSection('bowel', bowelOpen)}
                aria-expanded={bowelOpen}
                aria-label={bowelOpen ? 'Collapse Bowel & GI' : 'Expand Bowel & GI'}
                className="lg:hidden min-w-[36px] min-h-[36px] rounded-xl border border-border-strong bg-surface-subtle flex items-center justify-center text-text-secondary cursor-pointer"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${bowelOpen ? 'rotate-180' : ''}`}
                />
              </button>
            }
          />

          <div className={`${bowelOpen ? 'block' : 'hidden'} lg:block space-y-4`}>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-text-secondary">
              Overall Bowel / GI Distress
            </label>
            <div className="grid grid-cols-4 gap-2">
              {BOWEL_SEVERITIES.map((sev) => {
                const active = formData.bowelSeverity === sev.id;
                return (
                  <button
                    key={sev.id}
                    type="button"
                    onClick={() => onUpdateField('bowelSeverity', sev.id)}
                    className={`min-h-[40px] py-2.5 px-2 rounded-xl text-xs font-bold border transition-all active:scale-[0.98] cursor-pointer ${
                      active
                        ? `${sev.activeColor} shadow-xs`
                        : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {sev.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-text-secondary">
              Specific Bowel &amp; GI Symptoms
            </label>
            <div className="flex flex-wrap gap-2">
              {BOWEL_SYMPTOMS.map((sym) => {
                const active = (formData.bowelSymptoms || []).includes(sym);
                return (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => {
                      onToggleArrayItem('bowelSymptoms', sym);
                      if (formData.bowelSeverity === 'none' && !active) {
                        onUpdateField('bowelSeverity', 'mild');
                      }
                    }}
                    className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                      active
                        ? 'bg-orange-600 text-white border-orange-700 shadow-2xs'
                        : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {sym}
                  </button>
                );
              })}
            </div>
          </div>

          <SubSurface className="flex flex-wrap items-center justify-between gap-2 p-3.5">
            <div>
              <div className="text-xs font-bold">Bowel Movements Today</div>
              <div className="text-xs text-text-muted">
                Helpful for tracking constipation vs frequency
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Decrease bowel movements"
                onClick={() =>
                  onUpdateField(
                    'bowelMovementsCount',
                    Math.max(0, (formData.bowelMovementsCount || 0) - 1)
                  )
                }
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-surface-card border border-border-strong hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="font-bold text-sm w-6 text-center">
                {formData.bowelMovementsCount ?? 0}
              </span>
              <button
                type="button"
                aria-label="Increase bowel movements"
                onClick={() =>
                  onUpdateField('bowelMovementsCount', (formData.bowelMovementsCount || 0) + 1)
                }
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-surface-card border border-border-strong hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </SubSurface>
          </div>
        </SectionCard>
        </div>

        <div className="space-y-3.5 sm:space-y-4">
        {/* 2. PAIN & PELVIC SYMPTOMS CARD */}
        <SectionCard className="space-y-4">
          <CardHeader
            icon={Activity}
            accent="rose"
            titleAs="h3"
            title="Endo Pain & Cramping"
            subtitle="Severity scale (0–10), body locations & pain sensations"
            action={
              <div className="flex items-center gap-1.5">
                <div
                  className={`px-2.5 py-1 rounded-xl text-xs sm:text-sm font-bold shrink-0 whitespace-nowrap tabular-nums ${getPainBadgeStyle(formData.painScore)}`}
                >
                  {formData.painScore} / 10
                </div>
                <button
                  type="button"
                  onClick={() => toggleSection('pain', painOpen)}
                  aria-expanded={painOpen}
                  aria-label={painOpen ? 'Collapse Endo Pain' : 'Expand Endo Pain'}
                  className="lg:hidden min-w-[36px] min-h-[36px] rounded-xl border border-border-strong bg-surface-subtle flex items-center justify-center text-text-secondary cursor-pointer"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${painOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>
            }
          />

          <div className={`${painOpen ? 'block' : 'hidden'} lg:block space-y-4`}>
          <div className="space-y-2.5">
            <div className="flex justify-between text-xs font-medium text-text-secondary">
              <span>0 • No Pain</span>
              <span>5 • Moderate</span>
              <span>10 • Bedbound</span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={formData.painScore}
              onChange={(e) => onUpdateField('painScore', Number(e.target.value))}
              className="w-full accent-rose-600 h-2.5 bg-surface-muted rounded-lg cursor-pointer"
            />
            <div className="sm:hidden space-y-1.5">
              <button
                type="button"
                onClick={() => onUpdateField('painScore', 0)}
                className={`w-full min-h-[36px] py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-[0.98] cursor-pointer ${
                  Number(formData.painScore) === 0
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                }`}
              >
                0 — No Pain
              </button>
              <div className="grid grid-cols-5 gap-1.5">
                {Array.from({ length: 10 }).map((_, idx) => {
                  const num = idx + 1;
                  const active = Number(formData.painScore) === num;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => onUpdateField('painScore', num)}
                      className={`min-h-[36px] py-1.5 rounded-xl text-xs font-bold border tabular-nums transition-all active:scale-[0.98] cursor-pointer ${
                        active
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="hidden sm:grid sm:grid-cols-11 gap-1">
              {Array.from({ length: 11 }).map((_, num) => {
                const active = Number(formData.painScore) === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => onUpdateField('painScore', num)}
                    className={`min-h-[40px] py-2 rounded-xl text-xs font-bold border tabular-nums transition-all active:scale-[0.98] cursor-pointer ${
                      active
                        ? 'bg-rose-600 text-white border-rose-600 scale-105 shadow-xs'
                        : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-text-secondary">
              Where is the pain located?
            </label>
            <div className="flex flex-wrap gap-2">
              {PAIN_LOCATIONS.map((loc) => {
                const active = (formData.painLocations || []).includes(loc);
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => onToggleArrayItem('painLocations', loc)}
                    className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                      active
                        ? 'bg-amber-700 text-white border-amber-800 shadow-2xs'
                        : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {loc}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-text-secondary">
              Type of Pain
            </label>
            <div className="flex flex-wrap gap-2">
              {PAIN_TYPES.map((pt) => {
                const active = (formData.painTypes || []).includes(pt);
                return (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => onToggleArrayItem('painTypes', pt)}
                    className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                      active
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {pt}
                  </button>
                );
              })}
            </div>
          </div>
          </div>
        </SectionCard>

        {/* 4. MEDICATIONS & EXTERNAL FACTORS CARD */}
        <SectionCard className="space-y-4">
          <CardHeader
            icon={Pill}
            accent="rose"
            titleAs="h3"
            title="Medication & Relief"
            subtitle="Painkillers, hormones, heat therapy & daily triggers"
            badges={
              formData.medications.length > 0 ? (
                <StatusPill accent="rose">{formData.medications.length} logged</StatusPill>
              ) : null
            }
            action={
              <div className="flex items-center gap-1.5">
                <Button
                  variant="tinted"
                  accent="rose"
                  size="sm"
                  onClick={onCopyYesterdayMeds}
                >
                  Copy Yesterday
                </Button>
                <button
                  type="button"
                  onClick={() => toggleSection('meds', medsOpen)}
                  aria-expanded={medsOpen}
                  aria-label={medsOpen ? 'Collapse Medication & Relief' : 'Expand Medication & Relief'}
                  className="lg:hidden min-w-[36px] min-h-[36px] rounded-xl border border-border-strong bg-surface-subtle flex items-center justify-center text-text-secondary cursor-pointer"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${medsOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>
            }
          />

          <div className={`${medsOpen ? 'block' : 'hidden'} lg:block space-y-4`}>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-text-secondary">
              Tap to Log Medication
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_MEDICATIONS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => onAddPresetMed(preset)}
                  className="min-h-[40px] flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-border-strong bg-surface-subtle text-text-primary hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{preset.name}</span>
                  <span className="text-xs text-text-muted">({preset.defaultDose})</span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmitCustomMed} className="grid grid-cols-2 xl:grid-cols-12 gap-2">
            <input
              type="text"
              placeholder="Custom medication..."
              value={customMedName}
              onChange={(e) => setCustomMedName(e.target.value)}
              className={getFieldClass('rose', 'col-span-2 xl:col-span-4', { compact: true })}
            />
            <input
              type="text"
              placeholder="Dose (e.g. 500mg)"
              value={customMedDose}
              onChange={(e) => setCustomMedDose(e.target.value)}
              className={getFieldClass('rose', 'col-span-1 xl:col-span-3', { compact: true })}
            />
            <input
              type="text"
              placeholder="Time (optional)"
              value={customMedTime}
              onChange={(e) => setCustomMedTime(e.target.value)}
              className={getFieldClass('rose', 'col-span-1 xl:col-span-2', { compact: true })}
            />
            <button
              type="submit"
              className="col-span-2 xl:col-span-3 min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 active:scale-[0.98] transition cursor-pointer"
            >
              + Add Med
            </button>
          </form>

          {formData.medications.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-secondary">
                Taken on {formatShortDateEnGB(selectedDate)}:
              </div>
              {formData.medications.map((med) => (
                <SubSurface
                  key={med.id}
                  className="flex flex-col gap-2 p-3 bg-emerald-500/5 border-emerald-500/20"
                >
                  <div className="flex flex-wrap xl:flex-nowrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-[130px]">
                      <Pill className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="font-bold text-xs">{med.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-24 sm:w-28 shrink-0">
                        <input
                          type="text"
                          value={med.dose}
                          onChange={(e) => onUpdateMedItem(med.id, 'dose', e.target.value)}
                          placeholder="Dose"
                          className={getFieldClass('rose', '', { compact: true })}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={med.timeNotes}
                          onChange={(e) => onUpdateMedItem(med.id, 'timeNotes', e.target.value)}
                          placeholder="Time(s)"
                          className={getFieldClass('rose', '', { compact: true })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveMedItem(med.id)}
                        className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-text-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer shrink-0"
                        title="Remove medication"
                        aria-label={`Remove ${med.name}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border-subtle">
                    <span className="text-xs text-text-secondary">Relief effectiveness:</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {MED_EFFECTIVENESS.map((eff) => {
                        const active = (med.effective || 'helped') === eff.id;
                        return (
                          <button
                            key={eff.id}
                            type="button"
                            onClick={() => onUpdateMedItem(med.id, 'effective', eff.id)}
                            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                              active
                                ? eff.activeClass
                                : 'bg-surface-card border-border-strong text-text-secondary hover:bg-surface-hover'
                            }`}
                          >
                            {eff.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </SubSurface>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2.5 text-text-secondary">
              Relief Methods &amp; External Factors
            </label>
            <div className="flex flex-wrap gap-2">
              {EXTERNAL_FACTORS.map((ef) => {
                const active = (formData.externalFactors || []).includes(ef.id);
                return (
                  <button
                    key={ef.id}
                    type="button"
                    onClick={() => onToggleArrayItem('externalFactors', ef.id)}
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs'
                        : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {ef.label}
                  </button>
                );
              })}
            </div>
          </div>
          </div>
        </SectionCard>
        </div>
      </div>

      {/* DAILY NOTES & SAVE BAR */}
      <SectionCard>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-rose-600 dark:text-rose-400" />
          <h3 className="text-base font-bold">
            {ownerName ? `${ownerName}'s Daily Notes` : 'Daily Notes'}
          </h3>
        </div>
        <textarea
          rows={3}
          value={formData.notes}
          onChange={(e) => onUpdateField('notes', e.target.value)}
          placeholder="Extra notes for today (food, sleep, GP questions)..."
          className={getFieldClass('rose')}
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t border-border-subtle">
          <div className="text-xs text-text-secondary flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>
              {isDirty
                ? 'You have unsaved changes for this day (will also auto-save if you switch dates).'
                : 'All changes saved to your local Floodgate database across phone & tablet.'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {isDirty && (saveFailed || pendingNav) && (
              <Button
                variant="dangerTinted"
                size="lg"
                onClick={onDiscardPendingNav}
              >
                Discard Unsaved Changes
              </Button>
            )}
            <Button
              variant="primary"
              accent="rose"
              size="lg"
              icon={Check}
              onClick={onSaveDayEntry}
              className="w-full sm:w-auto px-6"
            >
              <span>Save Log for {formatShortDateEnGB(selectedDate)}</span>
            </Button>
          </div>
        </div>
      </SectionCard>

      {isDirty && (
        <div className="fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-5 z-30 flex justify-center px-3 pointer-events-none no-print animate-fade-in">
          <div className="howard-floating-pill pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-xl">
            <span className="text-xs font-bold text-rose-700 dark:text-rose-300 pl-1 whitespace-nowrap">
              Unsaved log
            </span>
            <Button
              variant="primary"
              accent="rose"
              size="sm"
              icon={Check}
              onClick={onSaveDayEntry}
              className="rounded-full whitespace-nowrap"
            >
              Save {formatShortDateEnGB(selectedDate)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
