import React, { useMemo } from 'react';
import { Printer, Stethoscope } from 'lucide-react';
import { SectionCard, SubSurface, EmptyStateCard } from '../../components/HowardUI.jsx';
import {
  shiftDateKey,
  formatShortDateEnGB
} from '../../utils/householdHelpers.js';
import {
  CLOT_SIZE_LABELS,
  FACTOR_LABEL_MAP,
  formatMedicationSummary,
  getPainBadgeStyle
} from './floodgateConstants.js';

export default function InsightsReportTab({
  sortedLogs,
  insightsDays,
  setInsightsDays,
  ownerName,
  todayKey
}) {
  const insightsData = useMemo(() => {
    const cutoffDate = shiftDateKey(todayKey, -(insightsDays - 1));
    const periodLogs = sortedLogs.filter((l) => l.date >= cutoffDate && l.date <= todayKey);

    const totalLoggedDays = periodLogs.length;
    const bleedingDays = periodLogs.filter(
      (l) => l.bleedingSeverity && l.bleedingSeverity !== 'none'
    );
    const heavyDays = periodLogs.filter(
      (l) => l.bleedingSeverity === 'heavy' || l.bleedingSeverity === 'flooding'
    );
    const clotDays = periodLogs.filter((l) => l.hasClots || l.clotCount > 0);
    const largeClotDays = periodLogs.filter(
      (l) =>
        Array.isArray(l.clotSizes) &&
        (l.clotSizes.includes('large') || l.clotSizes.includes('tissue'))
    );
    const totalClotsCount = periodLogs.reduce((acc, l) => acc + (Number(l.clotCount) || 0), 0);

    const avgPainAll =
      totalLoggedDays > 0
        ? (
            periodLogs.reduce((acc, l) => acc + (Number(l.painScore) || 0), 0) / totalLoggedDays
          ).toFixed(1)
        : '0.0';
    const highPainDays = periodLogs.filter((l) => Number(l.painScore) >= 6);
    const bowelFlareDays = periodLogs.filter(
      (l) => l.bowelSeverity === 'moderate' || l.bowelSeverity === 'severe'
    );

    const painLocationCounts = {};
    const bowelSymptomCounts = {};
    const medCounts = {};
    const factorCounts = {};

    periodLogs.forEach((l) => {
      (l.painLocations || []).forEach((loc) => {
        painLocationCounts[loc] = (painLocationCounts[loc] || 0) + 1;
      });
      (l.bowelSymptoms || []).forEach((sym) => {
        bowelSymptomCounts[sym] = (bowelSymptomCounts[sym] || 0) + 1;
      });
      (l.medications || []).forEach((m) => {
        medCounts[m.name] = (medCounts[m.name] || 0) + 1;
      });
      (l.externalFactors || []).forEach((fId) => {
        const label = FACTOR_LABEL_MAP[fId] || fId;
        factorCounts[label] = (factorCounts[label] || 0) + 1;
      });
    });

    const sortCounts = (obj) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

    return {
      periodLogs,
      totalLoggedDays,
      bleedingDaysCount: bleedingDays.length,
      heavyDaysCount: heavyDays.length,
      clotDaysCount: clotDays.length,
      largeClotDaysCount: largeClotDays.length,
      totalClotsCount,
      avgPainAll,
      highPainDaysCount: highPainDays.length,
      bowelFlareDaysCount: bowelFlareDays.length,
      topPainLocations: sortCounts(painLocationCounts),
      topBowelSymptoms: sortCounts(bowelSymptomCounts),
      topMedications: sortCounts(medCounts),
      topFactors: sortCounts(factorCounts)
    };
  }, [sortedLogs, insightsDays, todayKey]);

  const consultationRows = useMemo(() => {
    return [...insightsData.periodLogs].reverse().map((l) => {
      const padN = Number(l.padCount) || 0;
      const tamponN = Number(l.tamponCount) || 0;
      const cupN = Number(l.cupCount) || 0;
      const protectionParts = [
        padN > 0 && `${padN} ${padN === 1 ? 'pad' : 'pads'}`,
        tamponN > 0 && `${tamponN} ${tamponN === 1 ? 'tampon' : 'tampons'}`,
        cupN > 0 && `${cupN} ${cupN === 1 ? 'cup' : 'cups'}`
      ].filter(Boolean);
      return { l, protectionParts };
    });
  }, [insightsData.periodLogs]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <SectionCard className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            <span>{ownerName}&apos;s Endometriosis Insights &amp; GP Report</span>
          </h2>
          <p className="text-xs text-text-muted">
            Symptom correlations, clot tracking &amp; printable clinical summary
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { days: 30, label: '30 Days' },
            { days: 60, label: '60 Days' },
            { days: 90, label: '90 Days' },
            { days: 365, label: '1 Year' }
          ].map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setInsightsDays(opt.days)}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold border active:scale-[0.98] transition cursor-pointer ${
                insightsDays === opt.days
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {opt.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[40px] flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white active:scale-[0.98] transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print GP Summary</span>
          </button>
        </div>
      </SectionCard>

      <div className="hidden print-only border-b pb-4 mb-6">
        <h1 className="text-2xl font-bold">
          Floodgate Clinical Symptom Summary — {ownerName}
        </h1>
        <p className="text-sm text-text-secondary">
          Report Window: Last {insightsDays} Days (Generated{' '}
          {formatShortDateEnGB(todayKey, { includeYear: true })})
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <SectionCard className="print-avoid-break">
          <div className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1">
            Bleeding Days
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold">
            {insightsData.bleedingDaysCount}
          </div>
          <div className="text-xs text-text-secondary mt-1">
            {insightsData.heavyDaysCount} heavy or flooding day(s)
          </div>
        </SectionCard>

        <SectionCard className="print-avoid-break">
          <div className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">
            Blood Clot Episodes
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold">
            {insightsData.totalClotsCount}
          </div>
          <div className="text-xs text-text-secondary mt-1">
            Across {insightsData.clotDaysCount} day(s) • {insightsData.largeClotDaysCount} with
            &gt;2cm clots
          </div>
        </SectionCard>

        <SectionCard className="print-avoid-break">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
            Average Pain Score
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold">
            {insightsData.avgPainAll} <span className="text-base font-normal">/ 10</span>
          </div>
          <div className="text-xs text-text-secondary mt-1">
            {insightsData.highPainDaysCount} severe pain day(s) (≥6/10)
          </div>
        </SectionCard>

        <SectionCard className="print-avoid-break">
          <div className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-1">
            Bowel / GI Flare Days
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold">
            {insightsData.bowelFlareDaysCount}
          </div>
          <div className="text-xs text-text-secondary mt-1">
            Moderate or severe GI distress days
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
        {[
          {
            title: 'Top Pain Locations',
            items: insightsData.topPainLocations,
            badgeClass: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
            emptyText: 'No pain locations logged in this window.'
          },
          {
            title: 'Top Bowel / GI Symptoms',
            items: insightsData.topBowelSymptoms,
            badgeClass: 'bg-orange-500/15 text-orange-800 dark:text-orange-300',
            emptyText: 'No bowel/GI symptoms logged in this window.'
          },
          {
            title: 'Most Used Medications',
            items: insightsData.topMedications,
            badgeClass: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
            emptyText: 'No medications recorded in this window.'
          },
          {
            title: 'Common Factors & Triggers',
            items: insightsData.topFactors,
            badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
            emptyText: 'No external factors or triggers logged in this window.'
          }
        ].map((panel) => (
          <SectionCard key={panel.title} className="print-avoid-break p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2.5">
              {panel.title}
            </h3>
            {panel.items.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {panel.items.map(([label, count]) => (
                  <span
                    key={label}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold ${panel.badgeClass}`}
                  >
                    <span>{label}</span>
                    <span className="font-bold">×{count}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">{panel.emptyText}</p>
            )}
          </SectionCard>
        ))}
      </div>

      <SectionCard>
        <h3 className="text-base sm:text-lg font-bold mb-4">
          Chronological Consultation Table ({insightsData.periodLogs.length} Logged Days)
        </h3>
        {consultationRows.length > 0 ? (
          <>
            {/* Mobile stacked consultation card list (never prints, avoids horizontal scroll on mobile) */}
            <div className="space-y-3 md:hidden print:hidden">
              {consultationRows.map(({ l, protectionParts }) => (
                <SubSurface key={l.date} className="p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border-subtle">
                    <span className="font-bold text-sm">
                      {formatShortDateEnGB(l.date, { includeYear: true })}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold ${getPainBadgeStyle(l.painScore)}`}
                    >
                      Pain {l.painScore}/10
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5">
                    <div>
                      <span className="font-semibold text-text-secondary">Flow: </span>
                      <span className="capitalize font-semibold">{l.bleedingSeverity}</span>
                      {l.leakedThrough && (
                        <span className="text-red-600 dark:text-red-400 font-bold ml-1">
                          (Flooded)
                        </span>
                      )}
                      {protectionParts.length > 0 && (
                        <span className="text-text-secondary">
                          {' '}
                          • {protectionParts.join(', ')}
                        </span>
                      )}
                    </div>

                    {l.hasClots && (
                      <div>
                        <span className="font-semibold text-text-secondary">Clots: </span>
                        <span className="text-purple-700 dark:text-purple-300 font-semibold">
                          {l.clotCount}
                          {(l.clotSizes || []).length > 0
                            ? ` (${l.clotSizes.map((id) => CLOT_SIZE_LABELS[id] || id).join(', ')})`
                            : ''}
                        </span>
                      </div>
                    )}

                    {(l.painLocations || []).length > 0 && (
                      <div>
                        <span className="font-semibold text-text-secondary">Pain sites: </span>
                        <span>{l.painLocations.join(', ')}</span>
                      </div>
                    )}

                    <div>
                      <span className="font-semibold text-text-secondary">Bowel / GI: </span>
                      <span className="capitalize font-semibold">{l.bowelSeverity}</span>
                      {(l.bowelSymptoms || []).length > 0 && (
                        <span className="text-text-secondary">
                          {' '}
                          • {l.bowelSymptoms.join(', ')}
                        </span>
                      )}
                    </div>

                    {(l.medications || []).length > 0 && (
                      <div className="font-medium text-emerald-700 dark:text-emerald-300">
                        <span className="font-semibold text-text-secondary">Meds: </span>
                        {l.medications.map(formatMedicationSummary).join(', ')}
                      </div>
                    )}

                    {l.notes && (
                      <div className="italic text-text-secondary">&ldquo;{l.notes}&rdquo;</div>
                    )}
                  </div>
                </SubSurface>
              ))}
            </div>

            {/* Tablet / Desktop & Print 6-column table */}
            <div className="hidden md:block print:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border-subtle text-text-secondary">
                    <th className="py-2.5 pr-3">Date</th>
                    <th className="py-2.5 px-3">Bleeding &amp; Protection</th>
                    <th className="py-2.5 px-3">Clots</th>
                    <th className="py-2.5 px-3">Pain (0–10) &amp; Sites</th>
                    <th className="py-2.5 px-3">Bowel / GI</th>
                    <th className="py-2.5 pl-3">Medications &amp; Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {consultationRows.map(({ l, protectionParts }) => (
                    <tr key={l.date} className="align-top">
                      <td className="py-3 pr-3 font-bold whitespace-nowrap">
                        {formatShortDateEnGB(l.date, { includeYear: true })}
                      </td>
                      <td className="py-3 px-3 capitalize">
                        <span className="font-semibold">{l.bleedingSeverity}</span>
                        {l.leakedThrough && (
                          <span className="text-red-600 dark:text-red-400 font-bold ml-1">
                            (Flooded)
                          </span>
                        )}
                        {protectionParts.length > 0 && (
                          <div className="normal-case text-text-secondary mt-0.5">
                            {protectionParts.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {l.hasClots ? (
                          <span className="text-purple-700 dark:text-purple-300 font-semibold">
                            {l.clotCount}
                            {(l.clotSizes || []).length > 0
                              ? ` (${l.clotSizes.map((id) => CLOT_SIZE_LABELS[id] || id).join(', ')})`
                              : ''}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded-md font-bold mr-1.5 ${getPainBadgeStyle(l.painScore)}`}
                        >
                          {l.painScore}/10
                        </span>
                        <span>{(l.painLocations || []).join(', ')}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="capitalize font-semibold">{l.bowelSeverity}</span>
                        {(l.bowelSymptoms || []).length > 0 && (
                          <div className="text-text-secondary">{l.bowelSymptoms.join(', ')}</div>
                        )}
                      </td>
                      <td className="py-3 pl-3">
                        {(l.medications || []).length > 0 && (
                          <div className="font-medium text-emerald-700 dark:text-emerald-300">
                            {l.medications.map(formatMedicationSummary).join(', ')}
                          </div>
                        )}
                        {l.notes && (
                          <div className="italic text-text-secondary mt-0.5">
                            &ldquo;{l.notes}&rdquo;
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyStateCard
            accent="rose"
            icon={Stethoscope}
            title={`No logs recorded within the last ${insightsDays} days`}
            description="Add daily entries in the Daily Log tab to generate your printable GP clinical summary."
          />
        )}
      </SectionCard>
    </div>
  );
}
