import { Database, Download, FileText } from 'lucide-react';
import type { FloodgateDayLog } from '../../../shared/schemas/floodgate.ts';
import { Button, SectionCard, SubSurface } from '../../components/HowardUI.tsx';
import { downloadTextFile, escapeCSVCell } from '../../utils/householdHelpers.ts';
import {
  CLOT_SIZE_LABELS,
  FACTOR_LABEL_MAP,
  MED_EFFECTIVENESS_LABELS,
  getSafeOwnerSlug
} from './floodgateConstants.ts';

export interface ExportDataTabProps {
  logsMap: Record<string, FloodgateDayLog>;
  sortedLogs: FloodgateDayLog[];
  ownerName: string;
  todayKey: string;
  onOpenBackupModal?: (() => void) | undefined;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function ExportDataTab({
  logsMap,
  sortedLogs,
  ownerName,
  todayKey,
  onOpenBackupModal,
  showToast
}: ExportDataTabProps) {
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
            return `${m.name ?? ''} (${m.dose ?? ''} @ ${m.timeNotes ?? ''}${effLabel ? ` - ${effLabel}` : ''})`;
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
            <Button
              variant="secondary"
              accent="rose"
              size="lg"
              icon={Download}
              onClick={exportJSON}
            >
              <span>Export JSON</span>
            </Button>
            <Button
              variant="primary"
              accent="rose"
              size="lg"
              icon={FileText}
              onClick={exportCSV}
            >
              <span>Export CSV (Excel)</span>
            </Button>
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

          <Button
            variant="primary"
            accent="rose"
            size="lg"
            onClick={onOpenBackupModal}
            className="w-full"
          >
            Open Howard Status &amp; Backup Menu &rarr;
          </Button>
        </SectionCard>
      </div>
    </div>
  );
}
