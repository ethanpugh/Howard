import React, { useCallback, useEffect, useId, useState } from 'react';
import { Lock, Unlock, UserCheck, KeyRound, ChevronRight } from 'lucide-react';
import type { ProfileId } from '../../../shared/schemas/common.ts';
import type { PublicProfile } from '../../../shared/schemas/profile.ts';
import { ModalShell, getFieldClass } from '../HowardUI.tsx';
import { APP_REGISTRY } from '../../utils/moduleStatuses.ts';
import { createRpcClient, unwrapRpc } from '../../utils/apiClient.ts';
import { useActionLock } from '../../hooks/useActionLock.ts';
import type { SyncFetchOptions } from '../../hooks/useHouseholdSync.ts';

export default function ProfileSwitcherModal({
  isOpen,
  onClose,
  profiles,
  activeProfile,
  activeProfileId,
  hasSavedProfile,
  setHasSavedProfile,
  setActiveProfileId,
  setProfiles,
  markProfileUnlocked,
  initialPinTarget,
  onClearInitialPinTarget,
  fetchUnifiedSync,
  showToast,
  storageKey
}: {
  isOpen: boolean;
  onClose: () => void;
  profiles: PublicProfile[];
  activeProfile: PublicProfile;
  activeProfileId: ProfileId;
  hasSavedProfile: boolean;
  setHasSavedProfile: (saved: boolean) => void;
  setActiveProfileId: (id: ProfileId) => void;
  setProfiles: (profiles: PublicProfile[]) => void;
  markProfileUnlocked: (id: ProfileId) => void;
  initialPinTarget: PublicProfile | null;
  onClearInitialPinTarget?: (() => void) | undefined;
  fetchUnifiedSync: (opts?: SyncFetchOptions) => Promise<void>;
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  storageKey: string;
}) {
  const pinInputId = useId();
  const renameInputId = useId();
  const pinCurrentId = useId();
  const pinNewId = useId();
  const pinConfirmId = useId();

  const [pinPromptTarget, setPinPromptTarget] = useState<PublicProfile | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinPromptError, setPinPromptError] = useState('');

  const [pinManageOpen, setPinManageOpen] = useState(false);
  const [pinManageCurrent, setPinManageCurrent] = useState('');
  const [pinManageNew, setPinManageNew] = useState('');
  const [pinManageConfirm, setPinManageConfirm] = useState('');
  const [pinManageError, setPinManageError] = useState('');

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  const { isPending, runLocked } = useActionLock();

  const resetSubforms = useCallback(() => {
    setPinPromptTarget(null);
    setPinInput('');
    setPinPromptError('');
    setPinManageOpen(false);
    setPinManageCurrent('');
    setPinManageNew('');
    setPinManageConfirm('');
    setPinManageError('');
    setRenameOpen(false);
    setRenameDraft('');
    onClearInitialPinTarget?.();
  }, [onClearInitialPinTarget]);

  useEffect(() => {
    if (isOpen && initialPinTarget) {
      setPinPromptTarget(initialPinTarget);
      setPinInput('');
      setPinPromptError('');
    }
  }, [isOpen, initialPinTarget]);

  const handleClose = () => {
    resetSubforms();
    onClose();
  };

  const handleSelectProfile = (targetProfile: PublicProfile) => {
    let storedProfileId: string | null = null;
    try {
      storedProfileId = localStorage.getItem(storageKey);
    } catch {
      // ignore storage errors
    }

    if (
      targetProfile.id === activeProfileId &&
      hasSavedProfile &&
      storedProfileId === targetProfile.id
    ) {
      resetSubforms();
      onClose();
      return;
    }

    if (!targetProfile.pinEnabled || targetProfile.id === 'caregiver') {
      setHasSavedProfile(true);
      try {
        localStorage.setItem(storageKey, targetProfile.id);
      } catch {
        // ignore storage errors
      }
      markProfileUnlocked(targetProfile.id);
      resetSubforms();
      setActiveProfileId(targetProfile.id);
      onClose();
      showToast(`Switched to ${targetProfile.name} (${targetProfile.role})`);
      return;
    }

    resetSubforms();
    setPinPromptTarget(targetProfile);
  };

  const handleVerifyPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinPromptTarget) return;
    await runLocked(async () => {
      try {
        const rpc = createRpcClient({ profileId: pinPromptTarget.id });
        const data = await unwrapRpc(
          rpc.api.howard.profiles['verify-pin'].$post({
            json: { profileId: pinPromptTarget.id, pin: pinInput }
          })
        );
        if (!data?.verified) {
          setPinPromptError('Incorrect PIN');
          return;
        }
        const unlockedName = pinPromptTarget.name;
        const unlockedId = pinPromptTarget.id;
        setHasSavedProfile(true);
        try {
          localStorage.setItem(storageKey, unlockedId);
        } catch {
          // ignore storage errors
        }
        markProfileUnlocked(unlockedId);
        setActiveProfileId(unlockedId);
        resetSubforms();
        onClose();
        showToast(`Unlocked ${unlockedName}'s profile`);
      } catch (err) {
        setPinPromptError(
          err instanceof Error ? err.message : 'Could not verify PIN with server'
        );
      }
    });
  };

  const handleSavePinSettings = async (
    e: React.FormEvent | React.MouseEvent,
    enablePin: boolean
  ) => {
    e.preventDefault();
    setPinManageError('');

    if (enablePin) {
      if (!/^\d{4,8}$/.test(pinManageNew.trim())) {
        setPinManageError('Please enter a 4 to 8 digit numeric PIN.');
        return;
      }
      if (pinManageNew.trim() !== pinManageConfirm.trim()) {
        setPinManageError('New PIN and confirmation do not match.');
        return;
      }
    }

    await runLocked(async () => {
      try {
        const rpc = createRpcClient({ profileId: activeProfile.id });
        const data = await unwrapRpc(
          rpc.api.howard.profiles.pin.$put({
            json: {
              profileId: activeProfile.id,
              currentPin: pinManageCurrent,
              newPin: enablePin ? pinManageNew.trim() : '',
              pinEnabled: enablePin
            }
          })
        );
        if (Array.isArray(data?.profiles)) {
          setProfiles(data.profiles);
        }
        if (enablePin) {
          markProfileUnlocked(activeProfile.id);
        }
        setPinManageOpen(false);
        setPinManageCurrent('');
        setPinManageNew('');
        setPinManageConfirm('');
        showToast(
          enablePin
            ? `PIN protection enabled for ${activeProfile.name}`
            : `PIN protection disabled for ${activeProfile.name}`
        );
      } catch (err) {
        setPinManageError(
          err instanceof Error ? err.message : 'Server error while saving PIN settings.'
        );
      }
    });
  };

  const handleSaveProfileName = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = renameDraft.trim();
    if (!cleaned) return;
    await runLocked(async () => {
      try {
        const rpc = createRpcClient({ profileId: activeProfile.id });
        const data = await unwrapRpc(
          rpc.api.howard.profiles.name.$put({
            json: { profileId: activeProfile.id, name: cleaned }
          })
        );
        if (Array.isArray(data?.profiles)) {
          setProfiles(data.profiles);
        }
        setRenameOpen(false);
        void fetchUnifiedSync({ afterMutation: true });
        showToast(`Updated profile name to ${cleaned}`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not update name', 'error');
      }
    });
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      title="Who's Using Howard?"
      subtitle="Switch household profile or enter Caregiver mode"
      icon={UserCheck}
      accent="teal"
      maxWidthClass="max-w-md"
      ariaLabel="Switch Household Profile"
    >
      {pinPromptTarget ? (
        <form onSubmit={handleVerifyPinSubmit} className="space-y-4">
          <div className="p-4 rounded-2xl border border-border-subtle bg-surface-subtle">
            <div className="flex items-center gap-2 text-sm font-bold mb-1">
              <span>{pinPromptTarget.badgeEmoji}</span>
              <span>Unlock {pinPromptTarget.name}&apos;s Profile</span>
            </div>
            <p className="text-xs text-text-muted">
              Enter {pinPromptTarget.name}&apos;s PIN to access personal apps.
            </p>
          </div>

          <div>
            <label htmlFor={pinInputId} className="sr-only">
              Profile PIN
            </label>
            <input
              id={pinInputId}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoFocus
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/\D/g, ''));
                setPinPromptError('');
              }}
              placeholder="Enter numeric PIN..."
              maxLength={8}
              className={getFieldClass('teal', 'text-center text-lg font-mono tracking-widest py-3')}
            />
            {pinPromptError && (
              <p
                role="alert"
                className="text-xs text-rose-600 dark:text-rose-400 font-semibold mt-1.5 text-center"
              >
                {pinPromptError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setPinPromptTarget(null);
                setPinInput('');
                setPinPromptError('');
                onClearInitialPinTarget?.();
              }}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-surface-subtle text-text-secondary hover:bg-surface-hover transition"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              Unlock Profile
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2.5">
            {profiles.map((prof) => {
              const isCurrent = hasSavedProfile && prof.id === activeProfile.id;
              const appNames = APP_REGISTRY.filter((a) =>
                (prof.allowedApps || []).includes(a.id)
              )
                .map((a) => a.name)
                .join(', ');

              return (
                <button
                  key={prof.id}
                  type="button"
                  onClick={() => handleSelectProfile(prof)}
                  className={`w-full p-3 sm:p-3.5 rounded-2xl border text-left transition flex items-start sm:items-center justify-between gap-2.5 sm:gap-3 cursor-pointer ${
                    isCurrent
                      ? 'ring-2 ring-teal-500 border-teal-500 bg-teal-500/10'
                      : 'bg-surface-subtle border-border-subtle hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-2xl bg-surface-card border border-border-subtle flex items-center justify-center text-lg shrink-0">
                      {prof.badgeEmoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="font-bold text-sm leading-snug">{prof.name}</span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-muted text-text-secondary sm:whitespace-nowrap leading-tight max-w-full">
                          {prof.role}
                        </span>
                        {isCurrent && (
                          <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-teal-700 text-white whitespace-nowrap shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted truncate mt-0.5">Apps: {appNames}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5 sm:pt-0">
                    {prof.id === 'caregiver' ? (
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <Unlock className="w-3.5 h-3.5" /> Unlocked
                      </span>
                    ) : prof.pinEnabled ? (
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5" /> PIN
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">No PIN</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-text-muted" />
                  </div>
                </button>
              );
            })}
          </div>

          {activeProfile.id !== 'caregiver' && (
            <div className="pt-3 border-t border-border-subtle space-y-3">
              {!renameOpen ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-text-muted flex items-center gap-1.5">
                    <span>{activeProfile.badgeEmoji}</span>
                    <span>
                      Display Name: <strong>{activeProfile.name}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRenameDraft(activeProfile.name);
                      setRenameOpen(true);
                    }}
                    className="min-h-[36px] px-2 text-xs font-bold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    Change Name
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSaveProfileName}
                  className="p-3 rounded-2xl border border-border-subtle bg-surface-subtle flex flex-wrap sm:flex-nowrap items-center gap-2"
                >
                  <label htmlFor={renameInputId} className="sr-only">
                    Profile display name
                  </label>
                  <input
                    id={renameInputId}
                    type="text"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    placeholder="Enter display name..."
                    maxLength={24}
                    autoFocus
                    className={getFieldClass('teal', 'flex-1 min-w-0 font-bold py-2')}
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setRenameOpen(false)}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold text-text-secondary hover:bg-surface-hover transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer transition active:scale-[0.98] disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </form>
              )}

              {!pinManageOpen ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-text-muted flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    <span>
                      {activeProfile.name}&apos;s PIN Lock:{' '}
                      <strong>{activeProfile.pinEnabled ? 'Enabled' : 'Disabled'}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPinManageOpen(true);
                      setPinManageError('');
                    }}
                    className="min-h-[40px] px-2 text-xs font-bold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    {activeProfile.pinEnabled ? 'Change / Disable PIN' : 'Set a PIN'}
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => handleSavePinSettings(e, true)}
                  className="p-3.5 rounded-2xl border border-border-subtle bg-surface-subtle space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold">
                      Configure PIN for {activeProfile.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPinManageOpen(false);
                        setPinManageCurrent('');
                        setPinManageNew('');
                        setPinManageConfirm('');
                        setPinManageError('');
                      }}
                      className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-text-muted hover:text-text-primary hover:bg-surface-hover transition"
                    >
                      Cancel
                    </button>
                  </div>

                  {activeProfile.pinEnabled && (
                    <div>
                      <label htmlFor={pinCurrentId} className="sr-only">
                        Current PIN
                      </label>
                      <input
                        id={pinCurrentId}
                        type="password"
                        inputMode="numeric"
                        value={pinManageCurrent}
                        onChange={(e) => setPinManageCurrent(e.target.value.replace(/\D/g, ''))}
                        placeholder="Current PIN"
                        maxLength={8}
                        className={getFieldClass('teal')}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={pinNewId} className="sr-only">
                        New PIN
                      </label>
                      <input
                        id={pinNewId}
                        type="password"
                        inputMode="numeric"
                        value={pinManageNew}
                        onChange={(e) => setPinManageNew(e.target.value.replace(/\D/g, ''))}
                        placeholder="New PIN (4-8 digits)"
                        maxLength={8}
                        className={getFieldClass('teal')}
                      />
                    </div>
                    <div>
                      <label htmlFor={pinConfirmId} className="sr-only">
                        Confirm New PIN
                      </label>
                      <input
                        id={pinConfirmId}
                        type="password"
                        inputMode="numeric"
                        value={pinManageConfirm}
                        onChange={(e) => setPinManageConfirm(e.target.value.replace(/\D/g, ''))}
                        placeholder="Confirm New PIN"
                        maxLength={8}
                        className={getFieldClass('teal')}
                      />
                    </div>
                  </div>

                  {pinManageError && (
                    <p
                      role="alert"
                      className="text-xs text-rose-600 dark:text-rose-400 font-semibold"
                    >
                      {pinManageError}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {activeProfile.pinEnabled ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={(e) => handleSavePinSettings(e, false)}
                        className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold bg-rose-500/12 border border-rose-500/25 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 transition disabled:opacity-60"
                      >
                        Disable PIN
                      </button>
                    ) : (
                      <div />
                    )}
                    <button
                      type="submit"
                      disabled={isPending}
                      className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-teal-700 text-white hover:bg-teal-800 transition active:scale-[0.98] disabled:opacity-60"
                    >
                      Save PIN
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}
