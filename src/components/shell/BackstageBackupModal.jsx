import { useEffect, useState } from 'react';
import { Database, Download, Upload, Wifi } from 'lucide-react';
import { Button, ConfirmModal, ModalShell } from '../HowardUI.jsx';
import { apiRequest } from '../../utils/apiClient.js';
import { downloadTextFile, getLocalDateKey } from '../../utils/householdHelpers.js';
import { useActionLock } from '../../hooks/useActionLock.js';

function parseBackupImportPayload(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  if (parsed.app === 'Floodgate' && parsed.logs && typeof parsed.logs === 'object') {
    return {
      bodyToSend: {
        mode: 'merge',
        floodgate: {
          logsByDate: parsed.logs,
          settings: { ownerName: parsed.owner || 'Partner 2' }
        }
      },
      confirmPrompt: 'Merge this standalone Floodgate backup into your current Floodgate logs?'
    };
  }

  if (
    !parsed.howard &&
    (Array.isArray(parsed.molts) ||
      Array.isArray(parsed.feeders) ||
      parsed.settings?.mantisName !== undefined) &&
    ((parsed.settings && typeof parsed.settings === 'object') ||
      (parsed.logsByDate && typeof parsed.logsByDate === 'object') ||
      Array.isArray(parsed.molts) ||
      Array.isArray(parsed.feeders))
  ) {
    return {
      bodyToSend: {
        mode: 'merge',
        bloom: {
          ...(parsed.settings ? { settings: parsed.settings } : {}),
          ...(parsed.logsByDate ? { logsByDate: parsed.logsByDate } : {}),
          ...(Array.isArray(parsed.molts) ? { molts: parsed.molts } : {}),
          ...(Array.isArray(parsed.feeders) ? { feeders: parsed.feeders } : {})
        }
      },
      confirmPrompt:
        'Merge this standalone Bloom backup into your current Bloom care logs, molts & feeders?'
    };
  }

  if (
    !parsed.howard &&
    parsed.settings &&
    parsed.logsByDate &&
    typeof parsed.logsByDate === 'object'
  ) {
    return {
      bodyToSend: {
        mode: 'merge',
        cadence: {
          settings: parsed.settings,
          logsByDate: parsed.logsByDate
        }
      },
      confirmPrompt:
        'Merge this standalone Cadence backup into your current Cadence settings & logs?'
    };
  }

  if (
    (parsed.howard && typeof parsed.howard === 'object') ||
    (parsed.cadence && typeof parsed.cadence === 'object') ||
    (parsed.bloom && typeof parsed.bloom === 'object') ||
    (parsed.floodgate && typeof parsed.floodgate === 'object') ||
    (parsed.quill && typeof parsed.quill === 'object')
  ) {
    return {
      bodyToSend: { ...parsed, mode: 'replace' },
      confirmPrompt:
        'Restore this full Howard backup? Existing records in included modules will be replaced atomically (a pre-restore safety snapshot is saved automatically).'
    };
  }

  return null;
}

export default function BackstageBackupModal({
  isOpen,
  onClose,
  activeProfile,
  isConnected,
  syncTransport,
  dbInfo,
  almanacEvents,
  ledgerData,
  cadenceSnapshot,
  bloomSnapshot,
  floodgateSnapshot,
  quillSnapshot,
  onRestoredSync,
  showToast
}) {
  const [pendingRestore, setPendingRestore] = useState(null);
  const { isPending: isRestoringBackup, runLocked } = useActionLock();

  useEffect(() => {
    if (activeProfile.id !== 'partner1') {
      setPendingRestore(null);
    }
  }, [activeProfile.id]);

  const handleDownloadFullBackup = async () => {
    if (activeProfile.id === 'caregiver') return;
    try {
      const payload = await apiRequest('/api/howard/backup', {
        profileId: activeProfile.id
      });
      const todayKey = getLocalDateKey(new Date());
      downloadTextFile(
        `Howard_Household_Backup_${todayKey}.json`,
        JSON.stringify(payload, null, 2),
        'application/json'
      );
      showToast('Downloaded full Howard database backup (incl. Floodgate)');
    } catch {
      showToast('Could not export household backup', 'error');
    }
  };

  const handleRestoreFullBackup = (e) => {
    if (activeProfile.id !== 'partner1') {
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let parsed;
        try {
          parsed = JSON.parse(ev.target.result);
        } catch {
          showToast('Invalid JSON syntax in backup file', 'error');
          return;
        }
        const restorePlan = parseBackupImportPayload(parsed);
        if (!restorePlan) {
          showToast(
            'Backup file does not contain recognized Howard, Cadence, Bloom, Floodgate, or Quill data',
            'error'
          );
          return;
        }
        setPendingRestore({ ...restorePlan, fileName: file.name });
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore || activeProfile.id !== 'partner1') return;
    const { bodyToSend } = pendingRestore;
    await runLocked(async () => {
      try {
        await apiRequest('/api/howard/restore', {
          method: 'POST',
          profileId: activeProfile.id,
          body: bodyToSend
        });
        await onRestoredSync();
        setPendingRestore(null);
        onClose();
        showToast(
          bodyToSend.mode === 'merge'
            ? 'Merged standalone backup successfully (pre-restore snapshot saved)!'
            : 'Restored household backup successfully (pre-restore snapshot saved)!'
        );
      } catch (err) {
        showToast(err?.message || 'Restore failed on server', 'error');
      }
    });
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="Howard Household Backstage"
        subtitle="Unified SQLite database & household backup tools"
        icon={Database}
        accent="teal"
        maxWidthClass="max-w-lg"
        ariaLabel="Howard Household Backstage"
      >
        <div className="p-4 rounded-2xl border border-border-subtle bg-surface-subtle text-xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">Live Household Sync:</span>
            <span
              className={`${
                isConnected
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              } font-bold flex items-center gap-1`}
            >
              <Wifi className="w-3.5 h-3.5" />{' '}
              {syncTransport === 'sse'
                ? `SSE Push (${isConnected ? 'Connected' : 'Reconnecting'})`
                : `Polling Fallback 3s (${isConnected ? 'Connected' : 'Offline'})`}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">Unified SQLite DB:</span>
            <code className="px-2 py-0.5 rounded bg-surface-muted font-mono break-all sm:break-normal">
              {dbInfo.file} ({dbInfo.journalMode} &bull; Schema v{dbInfo.schemaVersion})
            </code>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">Almanac &amp; Ledger:</span>
            <code className="px-2 py-0.5 rounded bg-surface-muted font-mono break-all sm:break-normal">
              {almanacEvents.length} events, {(ledgerData?.recurring || []).length} bills,{' '}
              {(ledgerData?.expenses || []).length} expenses
            </code>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">
              Cadence ({cadenceSnapshot.settings?.catName || 'Pet'}):
            </span>
            <code className="px-2 py-0.5 rounded bg-surface-muted font-mono break-all sm:break-normal">
              {Object.keys(cadenceSnapshot.logsByDate || {}).length} days logged
            </code>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">
              Bloom ({bloomSnapshot.settings?.mantisName || 'Mantis'}):
            </span>
            <code className="px-2 py-0.5 rounded bg-surface-muted font-mono break-all sm:break-normal">
              {Object.keys(bloomSnapshot.logsByDate || {}).length} days,{' '}
              {(bloomSnapshot.molts || []).length} molts &bull;{' '}
              {bloomSnapshot.settings?.currentInstar || 'L2'}
            </code>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">Floodgate:</span>
            <code className="px-2 py-0.5 rounded bg-surface-muted font-mono break-all sm:break-normal">
              {activeProfile.id === 'partner2'
                ? `${Object.keys(floodgateSnapshot.logsByDate || {}).length} days logged`
                : 'Included in full database export'}
            </code>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="font-semibold">Quill:</span>
            <code className="px-2 py-0.5 rounded bg-surface-muted font-mono break-all sm:break-normal">
              {(quillSnapshot?.notes || []).length} notes, {(quillSnapshot?.labels || []).length} labels
            </code>
          </div>
        </div>

        <div className="space-y-3">
          <Button
            variant="primary"
            accent="teal"
            size="lg"
            icon={Download}
            onClick={handleDownloadFullBackup}
            className="w-full"
          >
            <span>Download Full Database Backup (Entire DB incl. Floodgate)</span>
          </Button>

          {activeProfile.id === 'partner1' && (
            <>
              <label className="w-full min-h-[44px] py-3 px-4 rounded-xl border border-dashed border-border-strong text-xs font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-surface-hover transition">
                <Upload className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                <span>Restore / Merge from Howard or Standalone Backup JSON</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestoreFullBackup}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-center text-text-muted">
                Every restore automatically saves a pre-restore SQLite safety snapshot first.
              </p>
            </>
          )}
        </div>
      </ModalShell>

      {pendingRestore && activeProfile.id === 'partner1' && (
        <ConfirmModal
          isOpen={true}
          onClose={() => !isRestoringBackup && setPendingRestore(null)}
          onConfirm={handleConfirmRestore}
          title={
            pendingRestore.bodyToSend.mode === 'merge'
              ? 'Merge Standalone Backup?'
              : 'Restore Household Snapshot?'
          }
          subtitle={pendingRestore.fileName || 'Review database restore action'}
          message={pendingRestore.confirmPrompt}
          icon={Upload}
          accent="amber"
          danger={false}
          confirmText={
            isRestoringBackup
              ? 'Restoring...'
              : pendingRestore.bodyToSend.mode === 'merge'
                ? 'Merge Backup'
                : 'Restore Snapshot'
          }
          isPending={isRestoringBackup}
          zIndexClass="z-[60]"
        />
      )}
    </>
  );
}
