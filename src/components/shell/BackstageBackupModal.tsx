import React, { useEffect, useId, useState } from 'react';
import { Database, Download, Upload, Wifi } from 'lucide-react';
import type { AlmanacEvent } from '../../../shared/schemas/almanac.ts';
import type { BloomSnapshot } from '../../../shared/schemas/bloom.ts';
import type { CadenceSnapshot } from '../../../shared/schemas/cadence.ts';
import type { FloodgateSnapshot } from '../../../shared/schemas/floodgate.ts';
import type { LedgerData } from '../../../shared/schemas/ledger.ts';
import type { PublicProfile } from '../../../shared/schemas/profile.ts';
import type { QuillSnapshot } from '../../../shared/schemas/quill.ts';
import {
  BackupRestorePayloadSchema,
  type BackupRestorePayload,
  type DbInfo
} from '../../../shared/schemas/sync.ts';
import { Button, ConfirmModal, ModalShell } from '../HowardUI.tsx';
import { createRpcClient, unwrapRpc } from '../../utils/apiClient.ts';
import { downloadTextFile, getLocalDateKey } from '../../utils/householdHelpers.ts';
import { useActionLock } from '../../hooks/useActionLock.ts';

interface PendingRestorePlan {
  bodyToSend: BackupRestorePayload;
  confirmPrompt: string;
  fileName?: string | undefined;
}

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val && typeof val === 'object' && !Array.isArray(val));
}

function validateRestoreCandidate(
  candidate: Record<string, unknown>,
  confirmPrompt: string
): PendingRestorePlan | { error: string } {
  const parsed = BackupRestorePayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message || 'Backup payload failed schema validation' };
  }
  return {
    bodyToSend: parsed.data,
    confirmPrompt
  };
}

function parseBackupImportPayload(parsed: unknown): PendingRestorePlan | { error: string } {
  if (!isPlainRecord(parsed)) {
    return { error: 'Backup file must contain a JSON object' };
  }

  if (parsed.app === 'Floodgate' && isPlainRecord(parsed.logs)) {
    return validateRestoreCandidate(
      {
        mode: 'merge',
        floodgate: {
          logsByDate: parsed.logs,
          settings: {
            ownerName: typeof parsed.owner === 'string' && parsed.owner.trim() ? parsed.owner : 'Partner 2'
          }
        }
      },
      'Merge this standalone Floodgate backup into your current Floodgate logs?'
    );
  }

  const objSettings = isPlainRecord(parsed.settings) ? parsed.settings : null;
  const looksLikeBloomStandalone =
    !parsed.howard &&
    (parsed.app === 'Bloom' ||
      Array.isArray(parsed.molts) ||
      Array.isArray(parsed.feeders) ||
      objSettings?.mantisName !== undefined ||
      objSettings?.currentInstar !== undefined);

  if (
    looksLikeBloomStandalone &&
    (objSettings ||
      isPlainRecord(parsed.logsByDate) ||
      Array.isArray(parsed.molts) ||
      Array.isArray(parsed.feeders))
  ) {
    return validateRestoreCandidate(
      {
        mode: 'merge',
        bloom: {
          ...(objSettings ? { settings: objSettings } : {}),
          ...(isPlainRecord(parsed.logsByDate) ? { logsByDate: parsed.logsByDate } : {}),
          ...(Array.isArray(parsed.molts) ? { molts: parsed.molts } : {}),
          ...(Array.isArray(parsed.feeders) ? { feeders: parsed.feeders } : {})
        }
      },
      'Merge this standalone Bloom backup into your current Bloom care logs, molts & feeders?'
    );
  }

  if (!parsed.howard && objSettings && isPlainRecord(parsed.logsByDate)) {
    return validateRestoreCandidate(
      {
        mode: 'merge',
        cadence: {
          settings: objSettings,
          logsByDate: parsed.logsByDate
        }
      },
      'Merge this standalone Cadence backup into your current Cadence settings & logs?'
    );
  }

  if (
    isPlainRecord(parsed.howard) ||
    isPlainRecord(parsed.cadence) ||
    isPlainRecord(parsed.bloom) ||
    isPlainRecord(parsed.floodgate) ||
    isPlainRecord(parsed.quill)
  ) {
    return validateRestoreCandidate(
      { ...parsed, mode: 'replace' },
      'Restore this full household Howard backup? Existing records in included modules (across all profiles) will be replaced atomically (a pre-restore safety snapshot is saved automatically).'
    );
  }

  return {
    error: 'Backup file does not contain recognized Howard, Cadence, Bloom, Floodgate, or Quill data'
  };
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
}: {
  isOpen: boolean;
  onClose: () => void;
  activeProfile: PublicProfile;
  isConnected: boolean;
  syncTransport: 'sse' | 'polling';
  dbInfo: DbInfo;
  almanacEvents: AlmanacEvent[];
  ledgerData: LedgerData;
  cadenceSnapshot: CadenceSnapshot;
  bloomSnapshot: BloomSnapshot;
  floodgateSnapshot: FloodgateSnapshot;
  quillSnapshot: QuillSnapshot;
  onRestoredSync: () => Promise<void>;
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const restoreInputId = useId();
  const [pendingRestore, setPendingRestore] = useState<PendingRestorePlan | null>(null);
  const { isPending: isBusy, runLocked } = useActionLock();

  useEffect(() => {
    if (activeProfile.id !== 'partner1') {
      setPendingRestore(null);
    }
  }, [activeProfile.id]);

  const handleDownloadFullBackup = async () => {
    if (activeProfile.id === 'caregiver') return;
    await runLocked(async () => {
      try {
        const rpc = createRpcClient({ profileId: activeProfile.id });
        const payload = await unwrapRpc(rpc.api.howard.backup.$get());
        const todayKey = getLocalDateKey(new Date());
        downloadTextFile(
          `Howard_Household_Backup_${todayKey}.json`,
          JSON.stringify(payload, null, 2),
          'application/json'
        );
        showToast('Downloaded full household backup (all profiles incl. Floodgate)');
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Could not export household backup',
          'error'
        );
      }
    });
  };

  const handleRestoreFullBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    if (activeProfile.id !== 'partner1') {
      inputEl.value = '';
      return;
    }
    const file = inputEl.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => {
      inputEl.value = '';
      showToast('Failed to read backup file from device', 'error');
    };
    reader.onload = (ev) => {
      try {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(ev.target?.result ?? ''));
        } catch {
          showToast('Invalid JSON syntax in backup file', 'error');
          return;
        }
        const restorePlan = parseBackupImportPayload(parsed);
        if ('error' in restorePlan) {
          showToast(restorePlan.error, 'error');
          return;
        }
        setPendingRestore({ ...restorePlan, fileName: file.name });
      } finally {
        inputEl.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore || activeProfile.id !== 'partner1') return;
    const { bodyToSend } = pendingRestore;
    await runLocked(async () => {
      try {
        const rpc = createRpcClient({ profileId: activeProfile.id });
        await unwrapRpc(rpc.api.howard.restore.$post({ json: bodyToSend }));
        await onRestoredSync();
        setPendingRestore(null);
        onClose();
        showToast(
          bodyToSend.mode === 'merge'
            ? 'Merged standalone backup successfully (pre-restore snapshot saved)!'
            : 'Restored household backup successfully (pre-restore snapshot saved)!'
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Restore failed on server', 'error');
      }
    });
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        disableBackdropClose={isBusy}
        title="Howard Household Backstage"
        subtitle="Unified SQLite database & full household backup tools"
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
            disabled={isBusy}
            onClick={handleDownloadFullBackup}
            className="w-full"
          >
            <span>Download Full Household Backup (All Profiles Incl. Floodgate)</span>
          </Button>
          <p className="text-[11px] text-center text-text-muted">
            Household admin export includes all shared modules plus Floodgate &amp; private notes (PINs redacted).
          </p>

          {activeProfile.id === 'partner1' && (
            <>
              <label
                htmlFor={restoreInputId}
                className="w-full min-h-[44px] py-3 px-4 rounded-xl border border-dashed border-border-strong text-xs font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-surface-hover focus-within:ring-2 focus-within:ring-teal-500 transition"
              >
                <Upload className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                <span>Restore / Merge Full Household or Standalone Backup JSON</span>
                <input
                  id={restoreInputId}
                  type="file"
                  accept=".json,application/json"
                  disabled={isBusy}
                  onChange={handleRestoreFullBackup}
                  className="sr-only"
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
          onClose={() => !isBusy && setPendingRestore(null)}
          onConfirm={handleConfirmRestore}
          title={
            pendingRestore.bodyToSend.mode === 'merge'
              ? 'Merge Standalone Backup?'
              : 'Restore Full Household Snapshot?'
          }
          subtitle={pendingRestore.fileName || 'Review database restore action'}
          message={pendingRestore.confirmPrompt}
          icon={Upload}
          accent="amber"
          danger={false}
          confirmText={
            isBusy
              ? 'Restoring...'
              : pendingRestore.bodyToSend.mode === 'merge'
                ? 'Merge Backup'
                : 'Restore Snapshot'
          }
          isPending={isBusy}
          zIndexClass="z-[60]"
        />
      )}
    </>
  );
}
