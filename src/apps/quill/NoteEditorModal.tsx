import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CalendarPlus,
  Check,
  Copy,
  Home,
  Lock,
  Palette,
  Pin,
  Plus,
  RotateCcw,
  StickyNote,
  Tag,
  Trash2,
  Users,
  X
} from 'lucide-react';
import type { PublicProfile } from '../../../shared/schemas/profile.ts';
import type { QuillChecklistItem, QuillNote } from '../../../shared/schemas/quill.ts';
import { ModalShell, SubSurface, getFieldClass } from '../../components/HowardUI.tsx';
import { formatDurationAgo } from '../../utils/householdHelpers.ts';
import { QUILL_LIMITS, getQuillColorMeta } from './quillConstants.ts';
import {
  applyMarkdownFormat,
  convertChecklistItemsToText,
  convertTextToChecklistItems,
  type MarkdownFormatType
} from './quillHelpers.ts';
import FormatToolbar from './FormatToolbar.tsx';
import MarkdownLite from './MarkdownLite.tsx';
import ChecklistEditor from './ChecklistEditor.tsx';
import NoteColorPicker from './NoteColorPicker.tsx';

export interface SaveEditorNoteOptions {
  keepalive?: boolean | undefined;
  caregiverToggleItem?: QuillChecklistItem | undefined;
}

export interface SaveEditorNoteResult {
  ok: boolean;
  note?: QuillNote | undefined;
  conflict?: boolean | undefined;
}

export interface NoteEditorModalProps {
  isOpen: boolean;
  note: QuillNote | null;
  householdLabels?: string[] | undefined;
  activeProfile: PublicProfile;
  todayKey: string;
  nowMs: number;
  canEdit: boolean;
  onSaveNote?: ((
    draft: QuillNote,
    baseRevision: number,
    options?: SaveEditorNoteOptions
  ) => Promise<SaveEditorNoteResult>) | undefined;
  onToggleArchive?: ((note: QuillNote) => void) | undefined;
  onMoveToTrash?: ((note: QuillNote) => void) | undefined;
  onRestoreFromTrash?: ((note: QuillNote) => void) | undefined;
  onDeleteForever?: ((note: QuillNote) => void) | undefined;
  onDuplicate?: ((note: QuillNote) => void) | undefined;
  onAddAlmanacReminder?: ((note: QuillNote, dateStr: string) => void) | undefined;
  onClose?: (() => void) | undefined;
}

export default function NoteEditorModal({
  isOpen,
  note,
  householdLabels = [],
  activeProfile,
  todayKey,
  nowMs,
  canEdit,
  onSaveNote,
  onToggleArchive,
  onMoveToTrash,
  onRestoreFromTrash,
  onDeleteForever,
  onDuplicate,
  onAddAlmanacReminder,
  onClose
}: NoteEditorModalProps) {
  const baseId = useId();
  const [draft, setDraft] = useState<QuillNote | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [conflictNote, setConflictNote] = useState<QuillNote | null>(null);
  const [staleServerNote, setStaleServerNote] = useState<QuillNote | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [showColorDrawer, setShowColorDrawer] = useState(false);
  const [showLabelDrawer, setShowLabelDrawer] = useState(false);
  const [showReminderDrawer, setShowReminderDrawer] = useState(false);
  const [reminderDate, setReminderDate] = useState(todayKey);
  const [newLabelInput, setNewLabelInput] = useState('');

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestNoteSnapshotRef = useRef<QuillNote | null>(null);
  const latestRevisionRef = useRef(1);
  const isDirtyRef = useRef(false);
  const dirtySeqRef = useRef(0);
  const dirtyWhileSavingRef = useRef(false);
  const inFlightSaveRef = useRef(false);
  const saveChainRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const caregiverQueueRef = useRef<Promise<void>>(Promise.resolve());
  const caregiverPendingRef = useRef(0);
  const mountedRef = useRef(true);

  const noteRef = useRef(note);
  noteRef.current = note;
  const todayKeyRef = useRef(todayKey);
  todayKeyRef.current = todayKey;
  const onSaveNoteRef = useRef(onSaveNote);
  onSaveNoteRef.current = onSaveNote;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;

  const effectiveCanEdit = Boolean(canEdit && draft?.status !== 'trashed');
  const canToggleChecklistItems = Boolean(
    effectiveCanEdit ||
      (activeProfile?.id === 'caregiver' &&
        draft?.status === 'active' &&
        draft?.visibility === 'shared' &&
        draft?.caregiverVisible)
  );

  // Initialize draft when modal opens or note.id changes
  const noteId = note?.id ?? null;
  useEffect(() => {
    const curNote = noteRef.current;
    if (!isOpen || !curNote) {
      latestNoteSnapshotRef.current = null;
      latestRevisionRef.current = 1;
      isDirtyRef.current = false;
      dirtySeqRef.current = 0;
      dirtyWhileSavingRef.current = false;
      setDraft(null);
      setConflictNote(null);
      setStaleServerNote(null);
      setSaveStatus('saved');
      return;
    }
    const initialDraft: QuillNote = {
      ...curNote,
      items: [...(curNote.items || [])],
      labels: [...(curNote.labels || [])]
    };
    latestNoteSnapshotRef.current = initialDraft;
    latestRevisionRef.current = curNote.revision || 1;
    isDirtyRef.current = false;
    dirtySeqRef.current = 0;
    dirtyWhileSavingRef.current = false;
    setDraft(initialDraft);
    setSaveStatus('saved');
    setConflictNote(null);
    setStaleServerNote(null);
    setIsPreview(false);
    setShowColorDrawer(false);
    setShowLabelDrawer(false);
    setShowReminderDrawer(false);
    setReminderDate(todayKeyRef.current);
  }, [isOpen, noteId]);

  // Handle incoming SSE updates without clobbering unsaved draft
  useEffect(() => {
    if (!isOpen || !note) return;
    const curSnapshot = latestNoteSnapshotRef.current;
    if (!curSnapshot || curSnapshot.id !== note.id) return;
    if (note.revision <= latestRevisionRef.current) return;
    if (inFlightSaveRef.current) return;

    if (!isDirtyRef.current) {
      const nextDraft: QuillNote = {
        ...note,
        items: [...(note.items || [])],
        labels: [...(note.labels || [])]
      };
      latestNoteSnapshotRef.current = nextDraft;
      latestRevisionRef.current = note.revision;
      setDraft(nextDraft);
      setStaleServerNote(null);
      setSaveStatus('saved');
    } else {
      setStaleServerNote(note);
    }
  }, [isOpen, note]);

  const flushSave = useCallback(
    ({
      keepalive = false,
      overrideRevision = null
    }: { keepalive?: boolean; overrideRevision?: number | null } = {}): Promise<boolean> => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      const queued = saveChainRef.current.then(async (): Promise<boolean> => {
        let currentOverrideRev = overrideRevision;
        while (true) {
          const cur = latestNoteSnapshotRef.current;
          const saveFn = onSaveNoteRef.current;
          if (!cur || !canEditRef.current || cur.status === 'trashed' || !saveFn) {
            return true;
          }
          if (!isDirtyRef.current && currentOverrideRev === null) {
            return true;
          }

          if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
          }

          const seqAtStart = dirtySeqRef.current;
          const revToSend =
            currentOverrideRev !== null ? currentOverrideRev : latestRevisionRef.current;
          currentOverrideRev = null;

          const snapshotToSend: QuillNote = {
            ...cur,
            items: [...(cur.items || [])],
            labels: [...(cur.labels || [])]
          };

          inFlightSaveRef.current = true;
          dirtyWhileSavingRef.current = false;
          isDirtyRef.current = false;
          if (mountedRef.current) {
            setSaveStatus('saving');
          }

          const res = await saveFn(snapshotToSend, revToSend, { keepalive });
          inFlightSaveRef.current = false;

          if (res?.ok && res.note) {
            const savedNote = res.note;
            latestRevisionRef.current = savedNote.revision;
            const editedDuringSave =
              dirtyWhileSavingRef.current || dirtySeqRef.current !== seqAtStart;

            if (editedDuringSave) {
              isDirtyRef.current = true;
              if (latestNoteSnapshotRef.current?.id === savedNote.id) {
                latestNoteSnapshotRef.current = {
                  ...latestNoteSnapshotRef.current,
                  revision: savedNote.revision,
                  updatedAt: savedNote.updatedAt,
                  updatedBy: savedNote.updatedBy
                };
              }
              if (mountedRef.current) {
                setDraft((prev) =>
                  prev && prev.id === savedNote.id
                    ? {
                        ...prev,
                        revision: savedNote.revision,
                        updatedAt: savedNote.updatedAt,
                        updatedBy: savedNote.updatedBy
                      }
                    : prev
                );
                setSaveStatus('dirty');
              }
              // Immediately re-flush newer edits at the updated server revision
              continue;
            }

            const syncedDraft: QuillNote = {
              ...savedNote,
              items: [...(savedNote.items || [])],
              labels: [...(savedNote.labels || [])]
            };
            if (latestNoteSnapshotRef.current?.id === savedNote.id) {
              latestNoteSnapshotRef.current = syncedDraft;
            }
            if (mountedRef.current) {
              setDraft((prev) => (prev && prev.id === savedNote.id ? syncedDraft : prev));
              setConflictNote(null);
              setStaleServerNote(null);
              setSaveStatus('saved');
            }
            return true;
          }

          // Save failed or conflicted
          isDirtyRef.current = true;
          if (mountedRef.current) {
            if (res?.conflict && res.note) {
              setConflictNote(res.note);
            }
            setSaveStatus('error');
          }
          return false;
        }
      });

      saveChainRef.current = queued.catch(() => false);
      return queued;
    },
    []
  );

  const scheduleAutosave = useCallback(() => {
    if (!canEditRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void flushSave();
    }, 600);
  }, [flushSave]);

  useEffect(() => {
    mountedRef.current = true;
    if (!isOpen || !canEdit) {
      return () => {
        mountedRef.current = false;
      };
    }
    const handlePageHide = () => {
      if (isDirtyRef.current && latestNoteSnapshotRef.current?.status !== 'trashed') {
        void flushSave({ keepalive: true });
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (isDirtyRef.current && latestNoteSnapshotRef.current?.status !== 'trashed') {
        void flushSave({ keepalive: true });
      }
      mountedRef.current = false;
    };
  }, [isOpen, canEdit, flushSave]);

  const updateDraft = useCallback(
    (updater: Partial<QuillNote> | ((prev: QuillNote) => QuillNote)) => {
      const prevSnap = latestNoteSnapshotRef.current;
      if (!canEditRef.current || !prevSnap || prevSnap.status === 'trashed') return;
      const nextSnap =
        typeof updater === 'function' ? updater(prevSnap) : { ...prevSnap, ...updater };
      dirtySeqRef.current += 1;
      latestNoteSnapshotRef.current = nextSnap;
      isDirtyRef.current = true;
      if (inFlightSaveRef.current) {
        dirtyWhileSavingRef.current = true;
      }
      setDraft(nextSnap);
      setSaveStatus('dirty');
      scheduleAutosave();
    },
    [scheduleAutosave]
  );

  const handleClose = useCallback(async () => {
    if (effectiveCanEdit && (isDirtyRef.current || inFlightSaveRef.current)) {
      const ok = await flushSave();
      if (!ok) return;
    }
    onClose?.();
  }, [effectiveCanEdit, flushSave, onClose]);

  const handleCaregiverToggleItem = useCallback(
    (nextItems: QuillChecklistItem[]) => {
      const currentDraft = latestNoteSnapshotRef.current;
      if (
        !currentDraft ||
        currentDraft.status !== 'active' ||
        currentDraft.visibility !== 'shared' ||
        !currentDraft.caregiverVisible ||
        activeProfile?.id !== 'caregiver'
      ) {
        return;
      }
      const changed = nextItems.find((ni) => {
        const prevItem = currentDraft.items.find((pi) => pi.id === ni.id);
        return Boolean(prevItem && ni.checked !== prevItem.checked);
      });
      if (!changed) return;

      const updatedSnapshot: QuillNote = {
        ...currentDraft,
        items: currentDraft.items.map((it) =>
          it.id === changed.id ? { ...it, checked: changed.checked } : it
        )
      };
      latestNoteSnapshotRef.current = updatedSnapshot;
      setDraft(updatedSnapshot);

      caregiverPendingRef.current += 1;
      caregiverQueueRef.current = caregiverQueueRef.current
        .then(async () => {
          const saveFn = onSaveNoteRef.current;
          if (!saveFn) return;
          const res = await saveFn(updatedSnapshot, latestRevisionRef.current, {
            caregiverToggleItem: changed
          });
          caregiverPendingRef.current = Math.max(0, caregiverPendingRef.current - 1);
          if (!res?.ok) {
            if (mountedRef.current) {
              setDraft((prev) => {
                if (!prev || prev.id !== updatedSnapshot.id) return prev;
                const reverted = {
                  ...prev,
                  items: prev.items.map((it) =>
                    it.id === changed.id ? { ...it, checked: !changed.checked } : it
                  )
                };
                latestNoteSnapshotRef.current = reverted;
                return reverted;
              });
            }
          } else if (res.note) {
            latestRevisionRef.current = res.note.revision;
            if (caregiverPendingRef.current === 0 && mountedRef.current) {
              const synced: QuillNote = {
                ...res.note,
                items: [...(res.note.items || [])],
                labels: [...(res.note.labels || [])]
              };
              latestNoteSnapshotRef.current = synced;
              setDraft(synced);
            }
          }
        })
        .catch(() => {
          caregiverPendingRef.current = Math.max(0, caregiverPendingRef.current - 1);
        });
    },
    [activeProfile?.id]
  );

  const handleFormat = useCallback(
    (formatType: MarkdownFormatType) => {
      const ta = bodyRef.current;
      if (!ta || !draft) return;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const next = applyMarkdownFormat(draft.body || '', start, end, formatType);
      updateDraft({ body: next.text });
      window.requestAnimationFrame(() => {
        if (!bodyRef.current) return;
        bodyRef.current.focus();
        bodyRef.current.setSelectionRange(next.start, next.end);
      });
    },
    [draft, updateDraft]
  );

  const allLabelChoices = useMemo(() => {
    const combined = new Set([...(householdLabels || []), ...(draft?.labels || [])]);
    return Array.from(combined).sort((a, b) => a.localeCompare(b));
  }, [householdLabels, draft?.labels]);

  if (!isOpen || !draft) return null;

  const colorMeta = getQuillColorMeta(draft.color);
  const editedAgo = formatDurationAgo(draft.updatedAt, nowMs);

  const handleAddInlineLabel = () => {
    const cleaned = newLabelInput.trim().slice(0, QUILL_LIMITS.maxLabelLen);
    if (!cleaned) return;
    const current = draft.labels || [];
    if (!current.some((l) => l.toLowerCase() === cleaned.toLowerCase())) {
      if (current.length < QUILL_LIMITS.maxLabelsPerNote) {
        updateDraft({ labels: [...current, cleaned] });
      }
    }
    setNewLabelInput('');
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      variant="sheet"
      accent="yellow"
      maxWidthClass="max-w-2xl"
      icon={StickyNote}
      title={
        effectiveCanEdit
          ? 'Edit Note'
          : draft.status === 'trashed'
            ? 'Trashed Note'
            : 'House Note'
      }
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{draft.visibility === 'shared' ? 'Shared Board' : 'My Private Notes'}</span>
          {editedAgo && (
            <span>
              • Edited {editedAgo}
              {draft.updatedBy ? ` by ${draft.updatedBy}` : ''}
            </span>
          )}
          {effectiveCanEdit && (
            <span
              className={`font-bold ${
                saveStatus === 'saved'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : saveStatus === 'error'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-yellow-800 dark:text-yellow-300'
              }`}
            >
              •{' '}
              {saveStatus === 'saving'
                ? 'Saving...'
                : saveStatus === 'dirty'
                  ? 'Unsaved'
                  : saveStatus === 'error'
                    ? conflictNote
                      ? 'Conflict'
                      : 'Save failed'
                    : 'Saved'}
            </span>
          )}
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-1">
              {draft.status !== 'trashed' ? (
                <>
                  <button
                    type="button"
                    aria-pressed={showColorDrawer}
                    onClick={() => setShowColorDrawer((p) => !p)}
                    title="Note colour"
                    aria-label="Note colour"
                    className="min-w-[40px] min-h-[40px] p-2 rounded-xl hover:bg-surface-hover text-text-secondary flex items-center justify-center active:scale-[0.98] transition cursor-pointer"
                  >
                    <Palette className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-pressed={showLabelDrawer}
                    onClick={() => setShowLabelDrawer((p) => !p)}
                    title="Labels"
                    aria-label="Labels"
                    className="min-w-[40px] min-h-[40px] p-2 rounded-xl hover:bg-surface-hover text-text-secondary flex items-center justify-center active:scale-[0.98] transition cursor-pointer"
                  >
                    <Tag className="w-4 h-4" />
                  </button>
                  {draft.status === 'active' && (
                    <button
                      type="button"
                      aria-pressed={draft.pinned}
                      onClick={() => updateDraft((p) => ({ ...p, pinned: !p.pinned }))}
                      title={draft.pinned ? 'Unpin note' : 'Pin note'}
                      aria-label={draft.pinned ? 'Unpin note' : 'Pin note'}
                      className={`min-w-[40px] min-h-[40px] p-2 rounded-xl flex items-center justify-center active:scale-[0.98] transition cursor-pointer ${
                        draft.pinned
                          ? 'bg-yellow-400 text-slate-950 shadow-xs'
                          : 'hover:bg-surface-hover text-text-secondary'
                      }`}
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await flushSave();
                      if (!ok) return;
                      onToggleArchive?.(latestNoteSnapshotRef.current || draft);
                      onClose?.();
                    }}
                    title={draft.status === 'archived' ? 'Unarchive' : 'Archive'}
                    aria-label={draft.status === 'archived' ? 'Unarchive' : 'Archive'}
                    className="min-w-[40px] min-h-[40px] p-2 rounded-xl hover:bg-surface-hover text-text-secondary flex items-center justify-center active:scale-[0.98] transition cursor-pointer"
                  >
                    {draft.status === 'archived' ? (
                      <ArchiveRestore className="w-4 h-4" />
                    ) : (
                      <Archive className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await flushSave();
                      if (!ok) return;
                      onDuplicate?.(latestNoteSnapshotRef.current || draft);
                      onClose?.();
                    }}
                    title="Duplicate note"
                    aria-label="Duplicate note"
                    className="min-w-[40px] min-h-[40px] p-2 rounded-xl hover:bg-surface-hover text-text-secondary flex items-center justify-center active:scale-[0.98] transition cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {onAddAlmanacReminder && draft.visibility === 'shared' && (
                    <button
                      type="button"
                      aria-pressed={showReminderDrawer}
                      onClick={() => setShowReminderDrawer((p) => !p)}
                      title="Remind in Almanac"
                      aria-label="Remind in Almanac"
                      className="min-w-[40px] min-h-[40px] p-2 rounded-xl hover:bg-surface-hover text-text-secondary flex items-center justify-center active:scale-[0.98] transition cursor-pointer"
                    >
                      <CalendarPlus className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await flushSave();
                      if (!ok) return;
                      onMoveToTrash?.(latestNoteSnapshotRef.current || draft);
                      onClose?.();
                    }}
                    title="Move to Trash"
                    aria-label="Move to Trash"
                    className="min-w-[40px] min-h-[40px] p-2 rounded-xl hover:bg-rose-500/15 text-rose-700 dark:text-rose-300 flex items-center justify-center active:scale-[0.98] transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onRestoreFromTrash?.(draft);
                      onClose?.();
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-surface-subtle hover:bg-surface-hover text-xs font-bold inline-flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteForever?.(draft);
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Forever</span>
                  </button>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-text-muted">Read-only House Note</span>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-extrabold shadow-xs active:scale-[0.98] cursor-pointer transition ml-auto"
          >
            Done
          </button>
        </div>
      }
    >
      {/* Trashed read-only notice */}
      {canEdit && draft.status === 'trashed' && (
        <div className="p-3 rounded-2xl border border-border-subtle bg-surface-subtle text-xs font-semibold text-text-secondary">
          This note is in Trash and cannot be edited. Restore it to make changes.
        </div>
      )}

      {/* Save error retry banner */}
      {saveStatus === 'error' && !conflictNote && (
        <div className="p-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 text-xs flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-rose-700 dark:text-rose-300">
            Could not save changes to server. Your edits are still in this editor.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void flushSave()}
              className="min-h-[36px] px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold active:scale-[0.98] cursor-pointer"
            >
              Retry Save
            </button>
            <button
              type="button"
              onClick={() => {
                isDirtyRef.current = false;
                dirtyWhileSavingRef.current = false;
                dirtySeqRef.current = 0;
                onClose?.();
              }}
              className="min-h-[36px] px-3 py-1 rounded-xl bg-surface-card border border-border-strong font-bold active:scale-[0.98] cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Conflict / Stale Banners */}
      {conflictNote && (
        <div className="p-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 text-xs space-y-2">
          <div className="flex items-center gap-2 font-extrabold text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Edit conflict: {conflictNote.updatedBy || 'Another household member'} saved a newer
              version.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void flushSave({ overrideRevision: conflictNote.revision })}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold active:scale-[0.98] cursor-pointer"
            >
              Keep mine
            </button>
            <button
              type="button"
              onClick={() => {
                const resolved: QuillNote = {
                  ...conflictNote,
                  items: [...(conflictNote.items || [])],
                  labels: [...(conflictNote.labels || [])]
                };
                latestNoteSnapshotRef.current = resolved;
                latestRevisionRef.current = conflictNote.revision;
                isDirtyRef.current = false;
                dirtyWhileSavingRef.current = false;
                dirtySeqRef.current = 0;
                setDraft(resolved);
                setConflictNote(null);
                setSaveStatus('saved');
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-surface-card border border-border-strong font-bold active:scale-[0.98] cursor-pointer"
            >
              Use theirs
            </button>
          </div>
        </div>
      )}

      {staleServerNote && !conflictNote && (
        <div className="p-3 rounded-2xl border border-yellow-500/45 bg-yellow-400/15 text-xs flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-yellow-900 dark:text-yellow-200">
            Updated by {staleServerNote.updatedBy || 'household member'} while you were editing.
          </span>
          <button
            type="button"
            onClick={() => {
              const reloaded: QuillNote = {
                ...staleServerNote,
                items: [...(staleServerNote.items || [])],
                labels: [...(staleServerNote.labels || [])]
              };
              latestNoteSnapshotRef.current = reloaded;
              latestRevisionRef.current = staleServerNote.revision;
              isDirtyRef.current = false;
              dirtyWhileSavingRef.current = false;
              dirtySeqRef.current = 0;
              setDraft(reloaded);
              setStaleServerNote(null);
              setSaveStatus('saved');
            }}
            className="min-h-[36px] px-3 py-1 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-extrabold active:scale-[0.98] cursor-pointer"
          >
            Reload
          </button>
        </div>
      )}

      {/* Tinted note surface */}
      <div className={`rounded-2xl border p-3.5 sm:p-4 space-y-3 ${colorMeta.cardClass}`}>
        {effectiveCanEdit ? (
          <>
            <label htmlFor={`${baseId}-title`} className="sr-only">
              Note title
            </label>
            <input
              id={`${baseId}-title`}
              type="text"
              value={draft.title}
              maxLength={QUILL_LIMITS.maxTitleLen}
              onChange={(e) => updateDraft({ title: e.target.value })}
              placeholder="Title"
              className="input-bare w-full min-w-0 bg-transparent border-0 text-lg font-extrabold focus:outline-hidden"
            />
          </>
        ) : (
          draft.title && <h4 className="text-lg font-extrabold">{draft.title}</h4>
        )}

        {draft.type === 'checklist' ? (
          <ChecklistEditor
            items={draft.items}
            readOnly={!effectiveCanEdit}
            canToggle={canToggleChecklistItems}
            onChange={(nextItems) => {
              if (draft.status === 'trashed') return;
              if (!effectiveCanEdit && activeProfile?.id === 'caregiver' && draft.status === 'active') {
                handleCaregiverToggleItem(nextItems);
                return;
              }
              if (effectiveCanEdit) {
                updateDraft({ items: nextItems });
              }
            }}
            onConvertToText={
              effectiveCanEdit
                ? () =>
                    updateDraft((p) => ({
                      ...p,
                      type: 'text',
                      body: convertChecklistItemsToText(p.items),
                      items: []
                    }))
                : null
            }
          />
        ) : (
          <div className="space-y-2.5">
            {effectiveCanEdit && (
              <FormatToolbar
                onFormat={handleFormat}
                isPreview={isPreview}
                onTogglePreview={() => setIsPreview((p) => !p)}
                onConvertToChecklist={() =>
                  updateDraft((p) => ({
                    ...p,
                    type: 'checklist',
                    items: convertTextToChecklistItems(p.body),
                    body: ''
                  }))
                }
              />
            )}

            {isPreview || !effectiveCanEdit ? (
              <div className="min-h-[120px] text-sm">
                {draft.body ? (
                  <MarkdownLite text={draft.body} />
                ) : (
                  <p className="text-text-muted italic">Nothing written yet.</p>
                )}
              </div>
            ) : (
              <>
                <label htmlFor={`${baseId}-body`} className="sr-only">
                  Note body
                </label>
                <textarea
                  ref={bodyRef}
                  id={`${baseId}-body`}
                  rows={8}
                value={draft.body}
                maxLength={QUILL_LIMITS.maxBodyLen}
                onChange={(e) => updateDraft({ body: e.target.value })}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
                    e.preventDefault();
                    handleFormat('bold');
                  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
                    e.preventDefault();
                    handleFormat('italic');
                  }
                }}
                placeholder="Write a note... (Markdown-lite: **bold**, *italic*, ~~strike~~, # heading, - list)"
                className="input-bare w-full min-w-0 bg-transparent border-0 text-base sm:text-sm leading-relaxed resize-y focus:outline-hidden"
              />
              </>
            )}
          </div>
        )}

        {/* Active Labels */}
        {(draft.labels || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(draft.labels || []).map((lbl) => (
              <span
                key={lbl}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/8 dark:bg-white/10 text-xs font-bold"
              >
                <span>{lbl}</span>
                {effectiveCanEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft((p) => ({
                        ...p,
                        labels: (p.labels || []).filter((l) => l !== lbl)
                      }))
                    }
                    aria-label={`Remove label ${lbl}`}
                    className="hover:text-rose-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Space & Caregiver controls */}
      {effectiveCanEdit && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            aria-pressed={draft.visibility === 'private'}
            onClick={() => {
              const nextVis = draft.visibility === 'shared' ? 'private' : 'shared';
              if (nextVis === 'private') {
                setShowReminderDrawer(false);
              }
              updateDraft((p) => ({
                ...p,
                visibility: p.visibility === 'shared' ? 'private' : 'shared',
                caregiverVisible: p.visibility === 'shared' ? false : p.caregiverVisible
              }));
            }}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-border-strong bg-surface-subtle hover:bg-surface-hover font-bold inline-flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
          >
            {draft.visibility === 'shared' ? (
              <>
                <Users className="w-3.5 h-3.5 text-yellow-800 dark:text-yellow-300" />
                <span>Shared Board (click to make Private)</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Private to {activeProfile?.name} (click to Share)</span>
              </>
            )}
          </button>

          {draft.visibility === 'shared' && (
            <button
              type="button"
              aria-pressed={draft.caregiverVisible}
              onClick={() =>
                updateDraft((p) => ({ ...p, caregiverVisible: !p.caregiverVisible }))
              }
              className={`min-h-[40px] px-3 py-1.5 rounded-xl border font-bold inline-flex items-center gap-1.5 active:scale-[0.98] cursor-pointer transition ${
                draft.caregiverVisible
                  ? 'bg-yellow-400/25 border-yellow-500/45 text-yellow-900 dark:text-yellow-200'
                  : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>
                {draft.caregiverVisible
                  ? 'Visible to Caregiver (House Note)'
                  : 'Hidden from Caregiver (click to share)'}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Drawers */}
      {showColorDrawer && effectiveCanEdit && (
        <SubSurface className="p-3 space-y-2">
          <div className="text-xs font-extrabold uppercase tracking-wider text-text-muted">
            Note Colour
          </div>
          <NoteColorPicker
            value={draft.color}
            onChange={(col) => updateDraft({ color: col })}
          />
        </SubSurface>
      )}

      {showLabelDrawer && effectiveCanEdit && (
        <SubSurface className="p-3 space-y-2.5">
          <div className="text-xs font-extrabold uppercase tracking-wider text-text-muted">
            Labels
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allLabelChoices.map((lbl) => {
              const active = (draft.labels || []).some(
                (l) => l.toLowerCase() === lbl.toLowerCase()
              );
              return (
                <button
                  key={lbl}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    updateDraft((p) => {
                      const cur = p.labels || [];
                      if (active) {
                        return {
                          ...p,
                          labels: cur.filter((l) => l.toLowerCase() !== lbl.toLowerCase())
                        };
                      }
                      if (cur.length >= QUILL_LIMITS.maxLabelsPerNote) return p;
                      return { ...p, labels: [...cur, lbl] };
                    })
                  }
                  className={`min-h-[36px] px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 border active:scale-[0.98] cursor-pointer transition ${
                    active
                      ? 'bg-yellow-400 text-slate-950 border-yellow-500'
                      : 'bg-surface-card border-border-strong text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  {active && <Check className="w-3 h-3" />}
                  <span>{lbl}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={`${baseId}-new-label`} className="sr-only">
              New label
            </label>
            <input
              id={`${baseId}-new-label`}
              type="text"
              value={newLabelInput}
              maxLength={QUILL_LIMITS.maxLabelLen}
              onChange={(e) => setNewLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddInlineLabel();
                }
              }}
              placeholder="New label..."
              className={getFieldClass('yellow', 'flex-1', { compact: true })}
            />
            <button
              type="button"
              onClick={handleAddInlineLabel}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1 active:scale-[0.98] cursor-pointer transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        </SubSurface>
      )}

      {showReminderDrawer &&
        effectiveCanEdit &&
        onAddAlmanacReminder &&
        draft.visibility === 'shared' && (
        <SubSurface className="p-3 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${baseId}-reminder-date`} className="text-xs font-bold">
            Add reminder to Almanac Calendar:
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`${baseId}-reminder-date`}
              type="date"
              value={reminderDate}
              onChange={(e) => setReminderDate(e.target.value)}
              className={getFieldClass('yellow', 'w-auto', { compact: true })}
            />
            <button
              type="button"
              onClick={() => {
                onAddAlmanacReminder(latestNoteSnapshotRef.current || draft, reminderDate);
                setShowReminderDrawer(false);
              }}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold active:scale-[0.98] cursor-pointer transition"
            >
              Add Event
            </button>
          </div>
        </SubSurface>
      )}
    </ModalShell>
  );
}
