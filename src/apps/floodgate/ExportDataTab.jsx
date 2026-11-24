import React from 'react';
import { Database, Download, FileText } from 'lucide-react';
import { SectionCard, SubSurface } from '../../components/HowardUI.jsx';
import { downloadTextFile, escapeCSVCell } from '../../utils/householdHelpers.js';
import {
  CLOT_SIZE_LABELS,
  FACTOR_LABEL_MAP,
  MED_EFFECTIVENESS_LABELS,
  getSafeOwnerSlug
} from './floodgateConstants.js';

export default function ExportDataTab({
  logsMap,
  sortedLogs,
  ownerName,
  todayKey,
  onOpenBackupModal,
  showToast
}) {
  const exportJSON = () => {
    const payload = {
      app: 'Floodgate',
      owner: ownerName || 'Partner 2',
      exportedAt: new Date().toISOString(),
      recordCount: Object.keys(logsMap).length,
      logs: logsMap
    };
    downloadTextFile(
      `Floodgate${getSafeOwnerSlug(ownerName)}_Backup_${todayKey}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    );
    showToast('Exported Floodgate JSON backup file');
  };

  const exportCSV = () => {
    const headers = [
      'Date',
      'Bleeding_Severity',
      'Pads',
      'Tampons',
      'Cups_Underwear',
      'Leaked_Through',
      'Clots_Present',
      'Clot_Count',
      'Clot_Sizes',
      'Pain_Score_0_to_10',
      'Pain_Locations',
      'Pain_Types',
      'Bowel_Severity',
      'Bowel_Symptoms',
      'Bowel_Movements',
      'Medications_Taken',
      'External_Factors',
      'Daily_Notes'
    ].map(escapeCSVCell);

    const rows = sortedLogs.map((l) => [
      escapeCSVCell(l.date),
      escapeCSVCell(l.bleedingSeverity),
      escapeCSVCell(l.padCount || 0),
      escapeCSVCell(l.tamponCount || 0),
      escapeCSVCell(l.cupCount || 0),
      escapeCSVCell(l.leakedThrough ? 'Yes' : 'No'),
      escapeCSVCell(l.hasClots ? 'Yes' : 'No'),
      escapeCSVCell(l.clotCount || 0),
      escapeCSVCell((l.clotSizes || []).map((id) => CLOT_SIZE_LABELS[id] || id).join('; ')),
      escapeCSVCell(l.painScore || 0),
      escapeCSVCell((l.painLocations || []).join('; ')),
      escapeCSVCell((l.painTypes || []).join('; ')),
      escapeCSVCell(l.bowelSeverity || 'none'),
      escapeCSVCell((l.bowelSymptoms || []).join('; ')),
      escapeCSVCell(l.bowelMovementsCount ?? ''),
      escapeCSVCell(
        (l.medications || [])
          .map((m) => {
            const effLabel = m.effective
              ? MED_EFFECTIVENESS_LABELS[m.effective] || m.effective
              : '';
            return `${m.name} (${m.dose} @ ${m.timeNotes}${effLabel ? ` - ${effLabel}` : ''})`;
          })
          .join('; ')
      ),
      escapeCSVCell((l.externalFactors || []).map((id) => FACTOR_LABEL_MAP[id] || id).join('; ')),
      escapeCSVCell(l.notes || '')
    ]);

    const csvString = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadTextFile(
      `Floodgate${getSafeOwnerSlug(ownerName)}_Report_${todayKey}.csv`,
      csvString,
      'text/csv;charset=utf-8;'
    );
    showToast('Exported CSV spreadsheet for Excel/GP');
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        <SectionCard className="flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-base font-bold mb-1">Clinical Spreadsheet &amp; JSON Export</h3>
            <p className="text-xs text-text-muted">
              Download your Floodgate symptom history as a standalone JSON backup or as a CSV
              spreadsheet for your GP or specialist.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={exportJSON}
              className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white active:scale-[0.98] transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Floodgate JSON</span>
            </button>
            <button
              type="button"
              onClick={exportCSV}
              className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] transition cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>Export CSV (Excel)</span>
            </button>
          </div>
        </SectionCard>

        <SectionCard className="flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <h3 className="text-base font-bold">Howard Unified Household Storage</h3>
            </div>
            <p className="text-xs text-text-muted">
              Floodgate runs inside Howard&rsquo;s unified home server database (
              <code className="font-mono">data/howard.db</code>). You can also snapshot the entire
              household in one click.
            </p>
          </div>

          <SubSurface className="p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between gap-2">
              <span className="font-semibold">Database File:</span>
              <code className="font-mono shrink-0">data/howard.db</code>
            </div>
            <div className="flex justify-between gap-2">
              <span className="font-semibold">Logged Days Stored:</span>
              <span className="font-bold text-rose-600 dark:text-rose-400 shrink-0">
                {Object.keys(logsMap).length} days
              </span>
            </div>
          </SubSurface>

          <button
            type="button"
            onClick={onOpenBackupModal}
            className="w-full min-h-[44px] py-3 rounded-2xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] transition cursor-pointer"
          >
            Open Howard Status &amp; Backup Menu &rarr;
          </button>
        </SectionCard>
      </div>
    </div>
  );
}
