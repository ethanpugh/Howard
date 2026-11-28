import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import {
  Archive,
  Home,
  Lock,
  Pencil,
  Plus,
  Search,
  StickyNote,
  Tag,
  Trash2,
  Users,
  X
} from 'lucide-react';
import type { AlmanacCategory, AlmanacEvent } from '../../shared/schemas/almanac.ts';
import type { PublicProfile } from '../../shared/schemas/profile.ts';
import type {
  QuillChecklistItem,
  QuillNote,
  QuillSnapshot
} from '../../shared/schemas/quill.ts';
import type { NavigationIntent, ShowToastFn } from '../App.tsx';
import {
  Button,
  ConfirmModal,
  EmptyStateCard,
  ModalShell,
  ModuleHeader,
  ModulePage,
  SectionCard,
  SegmentedTabs,
  StatusPill,
  SubSurface,
  getFieldClass,
  getOpenModalCount,
  type SegmentedTabItem
} from '../components/HowardUI.tsx';
import { ApiError, createRpcClient, unwrapRpc } from '../utils/apiClient.ts';
import { useActionLock } from '../hooks/useActionLock.ts';
import type { SyncFetchOptions } from '../hooks/useHouseholdSync.ts';
import { QUILL_LIMITS, createChecklistItemId, createNoteId } from './quill/quillConstants.ts';
import {
  computeMovedPosition,
  filterQuillNotes,
  sortBoardNotes,
  type QuillTab
} from './quill/quillHelpers.ts';
import {
  useNoteDrag,
  type NoteBoardSection
} from './quill/useNoteDrag.ts';
import QuickAddBar, { type QuickAddNoteDraft } from './quill/QuickAddBar.tsx';
import NoteMasonryGrid from './quill/NoteMasonryGrid.tsx';
import type { NoteKeyboardMoveDirection } from './quill/NoteTile.tsx';
import NoteEditorModal, {
  type SaveEditorNoteOptions,
  type SaveEditorNoteResult
} from './quill/NoteEditorModal.tsx';

type QuillNotePatch = Partial<
  Pick<
    QuillNote,
    | 'title'
    | 'pinned'
    | 'color'
    | 'status'
    | 'labels'
    | 'visibility'
    | 'caregiverVisible'
    | 'position'
    | 'type'
    | 'body'
    | 'items'
  >
>;

interface ToastNoticeInfo {
  text?: string | undefined;
  undoPatch?: QuillNotePatch | undefined;
}

type QuillLabelsPayload = {
  labels?: string[] | undefined;
  rename?: { from?: string | undefined; to?: string | undefined } | undefined;
  deleteLabel?: string | undefined;
};

export interface QuillAppProps {
  activeProfile: PublicProfile;
  profiles?: PublicProfile[] | undefined;
  darkMode?: boolean | undefined;
  nowMs?: number | undefined;
  todayKey: string;
  quillSnapshot: QuillSnapshot;
  setQuillSnapshot: Dispatch<SetStateAction<QuillSnapshot>>;
  almanacEvents?: AlmanacEvent[] | undefined;
  onMutateAlmanacEvents?: ((
    payload: {
      nextEvents?: AlmanacEvent[];
      upserts?: AlmanacEvent[];
      deleteIds?: string[];
    },
    toastText?: string
  ) => Promise<boolean>) | undefined;
  onOpenAlmanacDate?: ((dateStr: string) => void) | undefined;
  navigationIntent?: NavigationIntent | null | undefined;
  onGlobalSync?: ((opts?: SyncFetchOptions) => unknown) | undefined;
  showToast?: ShowToastFn | undefined;
}

function QuillApp({
  activeProfile,
  profiles = [],
  darkMode: _darkMode,
  nowMs = Date.now(),
  todayKey,
  quillSnapshot,
  setQuillSnapshot,
  almanacEvents = [],
  onMutateAlmanacEvents,
  onOpenAlmanacDate,
  navigationIntent,
  onGlobalSync,
  showToast
}: QuillAppProps) {
  const baseId = useId();
  const isCaregiver = activeProfile?.id === 'caregiver';
  const canEdit = !isCaregiver;

  const [activeTab, setActiveTab] = useState<QuillTab>('shared');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [labelsModalOpen, setLabelsModalOpen] = useState(false);
  const [newLabelText, setNewLabelText] = useState('');
  const [renamingLabel, setRenamingLabel] = useState<{ from: string; to: string } | null>(null); // { from, to }
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<QuillNote | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const { isPending: actionPending, runLocked } = useActionLock();

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const quickAddTriggerRef = useRef<HTMLButtonElement | null>(null);
  const checklistQueueRef = useRef<Map<string, Promise<void>>>(new Map());
  const checklistPendingCountRef = useRef<Map<string, number>>(new Map());

  const notes = useMemo(() => quillSnapshot?.notes || [], [quillSnapshot]);
  const labels = useMemo(() => quillSnapshot?.labels || [], [quillSnapshot]);

  useEffect(() => {
    if (!navigationIntent) return;
    if (navigationIntent.tab && !isCaregiver) {
      const tab = navigationIntent.tab;
      if (tab === 'shared' || tab === 'private' || tab === 'archive' || tab === 'trash') {
        setActiveTab(tab);
      }
    }
    if (navigationIntent.noteId) {
      setEditingNoteId(navigationIntent.noteId);
    }
  }, [navigationIntent, isCaregiver]);

  useEffect(() => {
    if (isCaregiver && activeTab !== 'shared') {
      setActiveTab('shared');
    }
  }, [isCaregiver, activeTab]);

  // Global module keyboard shortcuts: c = new note, / = search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (getOpenModalCount() > 0) return;
      const target = e.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isTyping) return;

      if (e.key === '/' && searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current.focus();
      } else if (e.key.toLowerCase() === 'c' && canEdit && quickAddTriggerRef.current) {
        e.preventDefault();
        quickAddTriggerRef.current.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canEdit]);

  const tabCounts = useMemo(() => {
    let shared = 0;
    let priv = 0;
    let archive = 0;
    let trash = 0;
    for (const n of notes) {
      if (!n) continue;
      if (n.visibility === 'private' && n.ownerProfileId !== activeProfile.id) continue;
      if (n.status === 'active') {
        if (n.visibility === 'shared') shared++;
        else priv++;
      } else if (n.status === 'archived') {
        archive++;
      } else if (n.status === 'trashed') {
        trash++;
      }
    }
    return { shared, priv, archive, trash };
  }, [notes, activeProfile.id]);

  const tabs = useMemo<Array<SegmentedTabItem<QuillTab>>>(
    () => [
      { id: 'shared', label: 'Shared Board', shortLabel: 'Shared', icon: Users, badge: tabCounts.shared },
      { id: 'private', label: 'My Notes', shortLabel: 'Mine', icon: Lock, badge: tabCounts.priv },
      { id: 'archive', label: 'Archive', icon: Archive, badge: tabCounts.archive },
      { id: 'trash', label: 'Trash', icon: Trash2, badge: tabCounts.trash }
    ],
    [tabCounts]
  );

  const visibleNotes = useMemo(
    () =>
      filterQuillNotes(notes, {
        tab: activeTab,
        activeProfileId: activeProfile.id,
        searchQuery,
        selectedLabel
      }),
    [notes, activeTab, activeProfile.id, searchQuery, selectedLabel]
  );

  const pinnedNotes = useMemo(
    () => (activeTab === 'shared' || activeTab === 'private' ? visibleNotes.filter((n) => n.pinned) : []),
    [visibleNotes, activeTab]
  );
  const otherNotes = useMemo(
    () => (activeTab === 'shared' || activeTab === 'private' ? visibleNotes.filter((n) => !n.pinned) : visibleNotes),
    [visibleNotes, activeTab]
  );

  const editingNote = useMemo(
    () => (editingNoteId ? notes.find((n) => n.id === editingNoteId) || null : null),
    [notes, editingNoteId]
  );

  const optimisticUpdateNotes = useCallback(
    (updater: (notes: QuillNote[]) => QuillNote[]) => {
      setQuillSnapshot((prev) => ({
        ...prev,
        notes: sortBoardNotes(updater(prev?.notes || []))
      }));
    },
    [setQuillSnapshot]
  );

  const handleCreateNote = useCallback(
    async (draft: QuickAddNoteDraft): Promise<boolean> => {
      if (!canEdit) return false;
      const nowIso = new Date().toISOString();
      const optimistic: QuillNote = {
        ...draft,
        ownerProfileId: activeProfile.id,
        revision: 1,
        position: -Date.now(),
        createdAt: nowIso,
        createdByProfileId: activeProfile.id,
        createdBy: activeProfile.name,
        updatedAt: nowIso,
        updatedByProfileId: activeProfile.id,
        updatedBy: activeProfile.name,
        trashedAt: null
      };
      optimisticUpdateNotes((list) => [optimistic, ...list]);
      try {
        const rpc = createRpcClient({ profileId: activeProfile.id });
        const res = await unwrapRpc(
          rpc.api.quill.notes[':noteId'].$put({
            param: { noteId: draft.id },
            json: { note: draft }
          })
        );
        if (res?.note) {
          const savedNote = res.note;
          optimisticUpdateNotes((list) =>
            list.map((n) => (n.id === savedNote.id ? savedNote : n))
          );
        }
        onGlobalSync?.();
        return true;
      } catch {
        optimisticUpdateNotes((list) => list.filter((n) => n.id !== draft.id));
        onGlobalSync?.({ force: true });
        showToast?.('Could not save note — reverted', 'error');
        return false;
      }
    },
    [canEdit, activeProfile, optimisticUpdateNotes, onGlobalSync, showToast]
  );

  const handleSaveEditorNote = useCallback(
    async (
      draft: QuillNote,
      baseRevision: number,
      options: SaveEditorNoteOptions = {}
    ): Promise<SaveEditorNoteResult> => {
      if (options.caregiverToggleItem) {
        const item = options.caregiverToggleItem;
        try {
          const rpc = createRpcClient({ profileId: activeProfile.id });
          const res = await unwrapRpc(
            rpc.api.quill.notes[':noteId'].items[':itemId'].$patch({
              param: { noteId: draft.id, itemId: item.id },
              json: { checked: item.checked }
            })
          );
          if (res?.note) {
            const savedNote = res.note;
            optimisticUpdateNotes((list) =>
              list.map((n) => (n.id === savedNote.id ? savedNote : n))
            );
          }
          onGlobalSync?.();
          return { ok: true, note: res?.note };
        } catch {
          onGlobalSync?.({ force: true });
          showToast?.('Could not update item', 'error');
          return { ok: false };
        }
      }

      if (!canEdit) return { ok: false };
      try {
        const rpc = createRpcClient({
          profileId: activeProfile.id,
          keepalive: Boolean(options.keepalive)
        });
        const res = await unwrapRpc(
          rpc.api.quill.notes[':noteId'].$put({
            param: { noteId: draft.id },
            json: { note: draft, baseRevision }
          })
        );
        if (res?.note) {
          const savedNote = res.note;
          optimisticUpdateNotes((list) => {
            const exists = list.some((n) => n.id === savedNote.id);
            return exists
              ? list.map((n) => (n.id === savedNote.id ? savedNote : n))
              : [savedNote, ...list];
          });
        }
        onGlobalSync?.();
        return { ok: true, note: res?.note };
      } catch (err) {
        if (
          err instanceof ApiError &&
          err.status === 409 &&
          err.payload &&
          typeof err.payload === 'object' &&
          'note' in err.payload &&
          err.payload.note
        ) {
          return { ok: false, conflict: true, note: err.payload.note as QuillNote };
        }
        onGlobalSync?.({ force: true });
        showToast?.('Could not save note changes', 'error');
        return { ok: false };
      }
    },
    [canEdit, activeProfile.id, optimisticUpdateNotes, onGlobalSync, showToast]
  );

  const patchNote = useCallback(
    async (
      note: QuillNote,
      patch: QuillNotePatch,
      toastInfo: ToastNoticeInfo | null = null
    ) => {
      if (!canEdit) return;
      const effectivePatch: QuillNotePatch =
        patch.visibility === 'private' ? { ...patch, caregiverVisible: false } : patch;
      const optimisticOwner =
        note.visibility === 'shared' && effectivePatch.visibility === 'private'
          ? activeProfile.id
          : note.ownerProfileId;
      const optimisticTrashedAt =
        effectivePatch.status === 'trashed'
          ? new Date().toISOString()
          : effectivePatch.status !== undefined
            ? null
            : note.trashedAt;

      optimisticUpdateNotes((list) =>
        list.map((n) =>
          n.id === note.id
            ? {
                ...n,
                ...effectivePatch,
                ownerProfileId: optimisticOwner,
                trashedAt: optimisticTrashedAt
              }
            : n
        )
      );
      try {
        const rpc = createRpcClient({ profileId: activeProfile.id });
        const res = await unwrapRpc(
          rpc.api.quill.notes[':noteId'].$patch({
            param: { noteId: note.id },
            json: effectivePatch
          })
        );
        const savedNote = res?.note;
        if (savedNote) {
          optimisticUpdateNotes((list) =>
            list.map((n) => (n.id === savedNote.id ? savedNote : n))
          );
        }
        if (toastInfo?.text) {
          const undoPatch = toastInfo.undoPatch;
          const undoTarget: QuillNote = savedNote || {
            ...note,
            ...effectivePatch,
            ownerProfileId: optimisticOwner,
            trashedAt: optimisticTrashedAt
          };
          showToast?.(
            toastInfo.text,
            'success',
            undoPatch
              ? {
                  actionLabel: 'Undo',
                  onAction: () => void patchNote(undoTarget, undoPatch)
                }
              : null
          );
        }
        onGlobalSync?.();
      } catch {
        optimisticUpdateNotes((list) =>
          list.map((n) => {
            if (n.id !== note.id) return n;
            const reverted: QuillNote = { ...n };
            if (effectivePatch.title !== undefined) reverted.title = note.title;
            if (effectivePatch.pinned !== undefined) reverted.pinned = note.pinned;
            if (effectivePatch.color !== undefined) reverted.color = note.color;
            if (effectivePatch.status !== undefined) {
              reverted.status = note.status;
              reverted.trashedAt = note.trashedAt;
            }
            if (effectivePatch.labels !== undefined) reverted.labels = note.labels;
            if (effectivePatch.visibility !== undefined) {
              reverted.visibility = note.visibility;
              reverted.ownerProfileId = note.ownerProfileId;
            }
            if (effectivePatch.caregiverVisible !== undefined) {
              reverted.caregiverVisible = note.caregiverVisible;
            }
            if (effectivePatch.position !== undefined) reverted.position = note.position;
            if (effectivePatch.type !== undefined) reverted.type = note.type;
            if (effectivePatch.body !== undefined) reverted.body = note.body;
            if (effectivePatch.items !== undefined) reverted.items = note.items;
            return reverted;
          })
        );
        onGlobalSync?.({ force: true });
        showToast?.('Could not update note — reverted', 'error');
      }
    },
    [canEdit, activeProfile.id, optimisticUpdateNotes, onGlobalSync, showToast]
  );

  const handleToggleChecklistItem = useCallback(
    (note: QuillNote, item: QuillChecklistItem) => {
      if (note.status === 'trashed') return;
      if (
        !canEdit &&
        !(
          isCaregiver &&
          note.caregiverVisible &&
          note.visibility === 'shared' &&
          note.status === 'active'
        )
      ) {
        return;
      }

      const noteId = note.id;
      const itemId = item.id;
      let nextChecked = !item.checked;

      // Read latest checked state synchronously from state setter and toggle only this item
      setQuillSnapshot((prev) => ({
        ...prev,
        notes: sortBoardNotes(
          (prev?.notes || []).map((n) => {
            if (n.id !== noteId) return n;
            const curItem = (n.items || []).find((it) => it.id === itemId);
            nextChecked = curItem ? !curItem.checked : !item.checked;
            return {
              ...n,
              items: (n.items || []).map((it) =>
                it.id === itemId ? { ...it, checked: nextChecked } : it
              )
            };
          })
        )
      }));

      const targetChecked = nextChecked;
      const prevPending = checklistPendingCountRef.current.get(noteId) ?? 0;
      checklistPendingCountRef.current.set(noteId, prevPending + 1);

      const priorTask = checklistQueueRef.current.get(noteId) ?? Promise.resolve();
      const nextTask = priorTask
        .then(async () => {
          try {
            const rpc = createRpcClient({ profileId: activeProfile.id });
            const res = await unwrapRpc(
              rpc.api.quill.notes[':noteId'].items[':itemId'].$patch({
                param: { noteId, itemId },
                json: { checked: targetChecked }
              })
            );
            const remaining = (checklistPendingCountRef.current.get(noteId) ?? 1) - 1;
            if (remaining <= 0) {
              checklistPendingCountRef.current.delete(noteId);
            } else {
              checklistPendingCountRef.current.set(noteId, remaining);
            }
            if (res?.note && remaining <= 0) {
              const savedNote = res.note;
              optimisticUpdateNotes((list) =>
                list.map((n) => (n.id === savedNote.id ? savedNote : n))
              );
            }
            onGlobalSync?.();
          } catch {
            const remaining = (checklistPendingCountRef.current.get(noteId) ?? 1) - 1;
            if (remaining <= 0) {
              checklistPendingCountRef.current.delete(noteId);
            } else {
              checklistPendingCountRef.current.set(noteId, remaining);
            }
            optimisticUpdateNotes((list) =>
              list.map((n) =>
                n.id === noteId
                  ? {
                      ...n,
                      items: (n.items || []).map((it) =>
                        it.id === itemId ? { ...it, checked: !targetChecked } : it
                      )
                    }
                  : n
              )
            );
            onGlobalSync?.({ force: true });
            showToast?.('Could not update checklist item', 'error');
          }
        })
        .catch(() => {});

      checklistQueueRef.current.set(noteId, nextTask);
    },
    [
      canEdit,
      isCaregiver,
      activeProfile.id,
      setQuillSnapshot,
      optimisticUpdateNotes,
      onGlobalSync,
      showToast
    ]
  );

  const commitReorder = useCallback(
    async ({
      noteId,
      targetSection,
      targetIndex
    }: {
      noteId: string;
      targetSection: NoteBoardSection;
      targetIndex: number;
    }) => {
      if (!canEdit) return;
      const destPinned = targetSection === 'pinned';
      const targetList = (destPinned ? pinnedNotes : otherNotes).filter((n) => n.id !== noteId);
      const nextPos = computeMovedPosition(targetList, targetIndex);
      const movedNote = notes.find((n) => n.id === noteId);

      optimisticUpdateNotes((list) =>
        list.map((n) => (n.id === noteId ? { ...n, pinned: destPinned, position: nextPos } : n))
      );

      setLiveAnnouncement(
        `${movedNote?.title || 'Note'} moved to position ${Math.min(targetIndex + 1, targetList.length + 1)} of ${targetList.length + 1}`
      );

      try {
        const rpc = createRpcClient({ profileId: activeProfile.id });
        const res = await unwrapRpc(
          rpc.api.quill.notes.reorder.$post({
            json: { moves: [{ id: noteId, position: nextPos, pinned: destPinned }] }
          })
        );
        if (Array.isArray(res?.notes)) {
          setQuillSnapshot((prev) => ({ ...prev, notes: res.notes }));
        }
        onGlobalSync?.();
      } catch {
        if (movedNote) {
          optimisticUpdateNotes((list) => list.map((n) => (n.id === noteId ? movedNote : n)));
        }
        onGlobalSync?.({ force: true });
        showToast?.('Could not reorder note — reverted', 'error');
      }
    },
    [canEdit, pinnedNotes, otherNotes, notes, optimisticUpdateNotes, setQuillSnapshot, activeProfile.id, onGlobalSync, showToast]
  );

  const handleKeyboardMove = useCallback(
    (note: QuillNote, section: NoteBoardSection, direction: NoteKeyboardMoveDirection) => {
      const list = section === 'pinned' ? pinnedNotes : otherNotes;
      const idx = list.findIndex((n) => n.id === note.id);
      if (idx === -1) return;
      let targetIndex = idx;
      if (direction === 'left') targetIndex = Math.max(0, idx - 1);
      else if (direction === 'right') targetIndex = Math.min(list.length - 1, idx + 1);
      else if (direction === 'start') targetIndex = 0;
      else if (direction === 'end') targetIndex = list.length - 1;
      if (targetIndex === idx) return;
      void commitReorder({ noteId: note.id, targetSection: section, targetIndex });
    },
    [pinnedNotes, otherNotes, commitReorder]
  );

  const dragEnabled =
    canEdit &&
    (activeTab === 'shared' || activeTab === 'private') &&
    !searchQuery.trim() &&
    !selectedLabel;

  const { dragState, wasRecentlyDragging, getTileDragProps } = useNoteDrag({
    enabled: dragEnabled,
    onReorder: commitReorder
  });

  const handleDuplicate = useCallback(
    async (note: QuillNote) => {
      if (!canEdit) return;
      const duplicatedDraft: QuickAddNoteDraft = {
        id: createNoteId(),
        type: note.type,
        title: note.title ? `${note.title} (Copy)`.slice(0, QUILL_LIMITS.maxTitleLen) : '',
        body: note.type === 'text' ? note.body || '' : '',
        items:
          note.type === 'checklist'
            ? (note.items || []).map((it) => ({
                id: createChecklistItemId(),
                text: it.text,
                checked: Boolean(it.checked)
              }))
            : [],
        color: note.color,
        labels: [...(note.labels || [])],
        visibility: note.visibility,
        caregiverVisible: note.visibility === 'shared' ? Boolean(note.caregiverVisible) : false,
        pinned: false,
        status: 'active'
      };
      const ok = await handleCreateNote(duplicatedDraft);
      if (ok) {
        showToast?.('Duplicated note');
      }
    },
    [canEdit, handleCreateNote, showToast]
  );

  const handleDeleteForever = useCallback(
    (note: QuillNote | null) =>
      runLocked(async () => {
        if (!canEdit || !note) return;
        optimisticUpdateNotes((list) => list.filter((n) => n.id !== note.id));
        setConfirmDeleteNote(null);
        if (editingNoteId === note.id) setEditingNoteId(null);
        try {
          const rpc = createRpcClient({ profileId: activeProfile.id });
          await unwrapRpc(
            rpc.api.quill.notes[':noteId'].$delete({
              param: { noteId: note.id }
            })
          );
          showToast?.('Note permanently deleted');
          onGlobalSync?.();
        } catch {
          optimisticUpdateNotes((list) => [...list, note]);
          onGlobalSync?.({ force: true });
          showToast?.('Could not delete note', 'error');
        }
      }),
    [canEdit, runLocked, optimisticUpdateNotes, editingNoteId, activeProfile.id, showToast, onGlobalSync]
  );

  const handleEmptyTrash = useCallback(
    () =>
      runLocked(async () => {
        if (!canEdit) return;
        const removedNotes = notes.filter((n) => n.status === 'trashed');
        optimisticUpdateNotes((list) => list.filter((n) => n.status !== 'trashed'));
        setConfirmEmptyTrash(false);
        try {
          const rpc = createRpcClient({ profileId: activeProfile.id });
          await unwrapRpc(rpc.api.quill.trash.empty.$post());
          showToast?.('Emptied Quill Trash');
          onGlobalSync?.();
        } catch {
          optimisticUpdateNotes((list) => [...list, ...removedNotes]);
          onGlobalSync?.({ force: true });
          showToast?.('Could not empty trash', 'error');
        }
      }),
    [canEdit, runLocked, notes, optimisticUpdateNotes, activeProfile.id, showToast, onGlobalSync]
  );

  const handleSaveLabels = useCallback(
    (body: QuillLabelsPayload, toastMsg = 'Updated labels') =>
      runLocked(async () => {
        try {
          const rpc = createRpcClient({ profileId: activeProfile.id });
          const res = await unwrapRpc(
            rpc.api.quill.labels.$put({
              json: body
            })
          );
          if (Array.isArray(res?.labels)) {
            setQuillSnapshot((prev) => ({ ...prev, labels: res.labels }));
          }
          if (toastMsg) showToast?.(toastMsg);
          onGlobalSync?.();
        } catch {
          onGlobalSync?.({ force: true });
          showToast?.('Could not update labels', 'error');
        }
      }),
    [runLocked, activeProfile.id, setQuillSnapshot, onGlobalSync, showToast]
  );

  const handleAddLabelFromModal = () => {
    const cleaned = newLabelText.trim().slice(0, QUILL_LIMITS.maxLabelLen);
    if (!cleaned) return;
    if (labels.some((l) => l.toLowerCase() === cleaned.toLowerCase())) {
      setNewLabelText('');
      showToast?.('Label already exists', 'info');
      return;
    }
    void handleSaveLabels({ labels: [...labels, cleaned] }, `Added label "${cleaned}"`);
    setNewLabelText('');
  };

  const handleAddAlmanacReminder = useCallback(
    async (note: QuillNote, dateStr: string) => {
      if (!onMutateAlmanacEvents || !dateStr || !canEdit) return;
      if (note.visibility === 'private' || note.status === 'trashed') {
        showToast?.('Private or trashed notes cannot be added to the shared Almanac', 'error');
        return;
      }
      const category: AlmanacCategory = 'household';
      const newEvt: AlmanacEvent = {
        id: `evt-quill-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        title: note.title?.trim() || 'Quill Note Reminder',
        date: dateStr,
        time: '',
        category,
        assignedTo: 'Both',
        assignedToProfileId: null,
        notes: (note.body || '').slice(0, 160),
        recurrence: 'none'
      };
      const ok = await onMutateAlmanacEvents(
        { nextEvents: [...almanacEvents, newEvt], upserts: [newEvt] },
        ''
      );
      if (ok) {
        showToast?.(`Added Almanac reminder for ${dateStr}`, 'success', {
          actionLabel: 'View',
          onAction: () => onOpenAlmanacDate?.(dateStr)
        });
      }
    },
    [onMutateAlmanacEvents, canEdit, almanacEvents, showToast, onOpenAlmanacDate]
  );

  const partner1Name = profiles.find((p) => p.id === 'partner1')?.name || 'Partner 1';
  const partner2Name = profiles.find((p) => p.id === 'partner2')?.name || 'Partner 2';

  return (
    <ModulePage module="quill">
      <div className="sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>

      <ModuleHeader
        accent="yellow"
        icon={StickyNote}
        shortTitle="Quill"
        title={isCaregiver ? 'Quill • House Notes' : 'Quill • Notes & Shared Board'}
        subtitle={
          isCaregiver
            ? 'Household notes and checklists shared for pet sitting & guests'
            : `Tileable shared notes for ${partner1Name} & ${partner2Name}, plus your private board`
        }
        className="no-print"
        badges={
          <StatusPill accent="yellow">
            {isCaregiver
              ? `${visibleNotes.length} house note${visibleNotes.length === 1 ? '' : 's'}`
              : `${tabCounts.shared} shared • ${tabCounts.priv} private`}
          </StatusPill>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-52">
              <label htmlFor={`${baseId}-search`} className="sr-only">
                Search notes
              </label>
              <Search className="w-4 h-4 text-text-placeholder absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                id={`${baseId}-search`}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes..."
                className={getFieldClass('yellow', 'min-h-[40px] pl-9 pr-3', { compact: true })}
              />
            </div>
            {canEdit && (
              <Button
                variant="secondary"
                accent="yellow"
                size="md"
                icon={Tag}
                onClick={() => setLabelsModalOpen(true)}
              >
                <span>Labels</span>
              </Button>
            )}
          </div>
        }
        footer={
          !isCaregiver || labels.length > 0 ? (
            <div className="space-y-2.5">
              {!isCaregiver && (
                <SegmentedTabs
                  tabs={tabs}
                  activeId={activeTab}
                  onChange={(next) => {
                    setActiveTab(next);
                    setSelectedLabel('');
                  }}
                  accent="yellow"
                />
              )}

              {labels.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5">
                  <button
                    type="button"
                    aria-pressed={!selectedLabel}
                    onClick={() => setSelectedLabel('')}
                    className={`min-h-[36px] px-3 py-1 rounded-full text-xs font-bold shrink-0 border active:scale-[0.98] cursor-pointer transition ${
                      !selectedLabel
                        ? 'bg-yellow-400 text-slate-950 border-yellow-500 shadow-xs'
                        : 'bg-surface-subtle border-border-subtle text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    All
                  </button>
                  {labels.map((lbl) => {
                    const active = selectedLabel.toLowerCase() === lbl.toLowerCase();
                    return (
                      <button
                        key={lbl}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedLabel(active ? '' : lbl)}
                        className={`min-h-[36px] px-3 py-1 rounded-full text-xs font-bold shrink-0 border active:scale-[0.98] cursor-pointer transition ${
                          active
                            ? 'bg-yellow-400 text-slate-950 border-yellow-500 shadow-xs'
                            : 'bg-surface-subtle border-border-subtle text-text-secondary hover:bg-surface-hover'
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null
        }
      />

      {/* Quick Add */}
      {canEdit && (activeTab === 'shared' || activeTab === 'private') && (
        <QuickAddBar
          defaultVisibility={activeTab === 'private' ? 'private' : 'shared'}
          onCreateNote={handleCreateNote}
          triggerRef={quickAddTriggerRef}
        />
      )}

      {/* Trash banner */}
      {activeTab === 'trash' && canEdit && (
        <SectionCard className="no-print py-3 px-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-text-muted font-medium">
            Notes in Trash are automatically deleted forever after 7 days.
          </span>
          {visibleNotes.length > 0 && (
            <Button
              variant="danger"
              size="md"
              disabled={actionPending}
              onClick={() => setConfirmEmptyTrash(true)}
            >
              Empty Trash
            </Button>
          )}
        </SectionCard>
      )}

      {/* Board */}
      {visibleNotes.length === 0 ? (
        <EmptyStateCard
          accent="yellow"
          icon={isCaregiver ? Home : StickyNote}
          title={
            searchQuery || selectedLabel
              ? 'No matching notes'
              : activeTab === 'shared'
                ? isCaregiver
                  ? 'No House Notes shared yet'
                  : 'Shared Board is empty'
                : activeTab === 'private'
                  ? 'No private notes yet'
                  : activeTab === 'archive'
                    ? 'Archive is empty'
                    : 'Trash is empty'
          }
          description={
            searchQuery || selectedLabel
              ? 'Try clearing your search or label filter.'
              : activeTab === 'shared' && !isCaregiver
                ? 'Capture a quick note or checklist above to share it with the household.'
                : activeTab === 'private'
                  ? 'Notes you create here stay private to your profile.'
                  : 'Nothing here right now.'
          }
        />
      ) : (
        <NoteMasonryGrid
          pinnedNotes={pinnedNotes}
          otherNotes={otherNotes}
          showSections={activeTab === 'shared' || activeTab === 'private'}
          nowMs={nowMs}
          canEdit={canEdit}
          canTickChecklist={canEdit || isCaregiver}
          dragState={dragState}
          wasRecentlyDragging={wasRecentlyDragging}
          getTileDragProps={getTileDragProps}
          onOpen={(n) => setEditingNoteId(n.id)}
          onTogglePin={(n) => void patchNote(n, { pinned: !n.pinned })}
          onChangeColor={(n, color) => void patchNote(n, { color })}
          onToggleArchive={(n) =>
            void patchNote(
              n,
              { status: n.status === 'archived' ? 'active' : 'archived', pinned: false },
              n.status === 'archived'
                ? { text: 'Restored from Archive', undoPatch: { status: 'archived' } }
                : { text: 'Note archived', undoPatch: { status: 'active', pinned: n.pinned } }
            )
          }
          onMoveToTrash={(n) =>
            void patchNote(
              n,
              { status: 'trashed', pinned: false },
              {
                text: 'Moved note to Trash',
                undoPatch: { status: n.status, pinned: n.pinned }
              }
            )
          }
          onRestoreFromTrash={(n) =>
            void patchNote(n, { status: 'active' }, { text: 'Restored note from Trash' })
          }
          onDeleteForever={(n) => setConfirmDeleteNote(n)}
          onDuplicate={(n) => void handleDuplicate(n)}
          onToggleVisibility={(n) =>
            void patchNote(
              n,
              {
                visibility: n.visibility === 'shared' ? 'private' : 'shared',
                caregiverVisible: false
              },
              {
                text: n.visibility === 'shared' ? 'Moved to My Notes' : 'Moved to Shared Board'
              }
            )
          }
          onToggleCaregiverVisible={(n) =>
            void patchNote(
              n,
              { caregiverVisible: !n.caregiverVisible },
              {
                text: !n.caregiverVisible
                  ? 'Visible to Caregiver as a House Note'
                  : 'Hidden from Caregiver'
              }
            )
          }
          onToggleChecklistItem={handleToggleChecklistItem}
          onKeyboardMove={handleKeyboardMove}
        />
      )}

      {/* Editor Modal */}
      <NoteEditorModal
        isOpen={Boolean(editingNote)}
        note={editingNote}
        householdLabels={labels}
        activeProfile={activeProfile}
        todayKey={todayKey}
        nowMs={nowMs}
        canEdit={canEdit}
        onSaveNote={handleSaveEditorNote}
        onToggleArchive={(n) =>
          void patchNote(
            n,
            { status: n.status === 'archived' ? 'active' : 'archived', pinned: false },
            { text: n.status === 'archived' ? 'Restored from Archive' : 'Note archived' }
          )
        }
        onMoveToTrash={(n) =>
          void patchNote(
            n,
            { status: 'trashed', pinned: false },
            { text: 'Moved note to Trash', undoPatch: { status: n.status, pinned: n.pinned } }
          )
        }
        onRestoreFromTrash={(n) =>
          void patchNote(n, { status: 'active' }, { text: 'Restored note from Trash' })
        }
        onDeleteForever={(n) => setConfirmDeleteNote(n)}
        onDuplicate={(n) => void handleDuplicate(n)}
        onAddAlmanacReminder={(n, d) => void handleAddAlmanacReminder(n, d)}
        onClose={() => setEditingNoteId(null)}
      />

      {/* Manage Labels Modal */}
      <ModalShell
        isOpen={labelsModalOpen}
        onClose={() => {
          setLabelsModalOpen(false);
          setRenamingLabel(null);
        }}
        title="Household Labels"
        subtitle="Organise shared and private notes with reusable labels"
        icon={Tag}
        accent="yellow"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label htmlFor={`${baseId}-new-label`} className="sr-only">
              Create new label
            </label>
            <input
              id={`${baseId}-new-label`}
              type="text"
              value={newLabelText}
              maxLength={QUILL_LIMITS.maxLabelLen}
              onChange={(e) => setNewLabelText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newLabelText.trim()) {
                  e.preventDefault();
                  handleAddLabelFromModal();
                }
              }}
              placeholder="Create new label..."
              className={getFieldClass('yellow', 'flex-1', { compact: true })}
            />
            <button
              type="button"
              disabled={actionPending}
              onClick={handleAddLabelFromModal}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1 active:scale-[0.98] disabled:opacity-60 cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          {labels.length === 0 ? (
            <p className="text-xs text-text-muted py-2">No labels created yet.</p>
          ) : (
            <div className="space-y-1.5">
              {labels.map((lbl) => (
                <SubSurface
                  key={lbl}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  {renamingLabel?.from === lbl ? (
                    <>
                      <label htmlFor={`${baseId}-rename-label`} className="sr-only">
                        Rename label {lbl}
                      </label>
                      <input
                        id={`${baseId}-rename-label`}
                        type="text"
                        autoFocus
                        value={renamingLabel.to}
                        maxLength={QUILL_LIMITS.maxLabelLen}
                        onChange={(e) =>
                          setRenamingLabel((p) => (p ? { ...p, to: e.target.value } : p))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && renamingLabel?.to.trim()) {
                            void handleSaveLabels(
                              { rename: { from: lbl, to: renamingLabel.to.trim() } },
                              `Renamed "${lbl}"`
                            );
                            setRenamingLabel(null);
                          } else if (e.key === 'Escape') {
                            setRenamingLabel(null);
                          }
                        }}
                        className={getFieldClass('yellow', 'flex-1', { compact: true })}
                      />
                    </>
                  ) : (
                    <span className="font-bold truncate">{lbl}</span>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    {renamingLabel?.from === lbl ? (
                      <button
                        type="button"
                        disabled={actionPending}
                        onClick={() => {
                          if (renamingLabel?.to.trim()) {
                            void handleSaveLabels(
                              { rename: { from: lbl, to: renamingLabel.to.trim() } },
                              `Renamed "${lbl}"`
                            );
                          }
                          setRenamingLabel(null);
                        }}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-extrabold active:scale-[0.98] cursor-pointer"
                      >
                        Save
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRenamingLabel({ from: lbl, to: lbl })}
                        aria-label={`Rename ${lbl}`}
                        className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-text-secondary hover:bg-surface-hover flex items-center justify-center active:scale-[0.98] cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={actionPending}
                      onClick={() =>
                        void handleSaveLabels({ deleteLabel: lbl }, `Deleted label "${lbl}"`)
                      }
                      aria-label={`Delete ${lbl}`}
                      className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center active:scale-[0.98] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </SubSurface>
              ))}
            </div>
          )}
        </div>
      </ModalShell>

      <ConfirmModal
        isOpen={confirmEmptyTrash}
        onClose={() => !actionPending && setConfirmEmptyTrash(false)}
        onConfirm={() => void handleEmptyTrash()}
        title="Empty Quill Trash?"
        message="All notes currently in Trash will be permanently deleted. This cannot be undone."
        icon={Trash2}
        accent="rose"
        maxWidthClass="max-w-sm"
        isPending={actionPending}
        confirmText={actionPending ? 'Emptying...' : 'Empty Trash'}
      />

      <ConfirmModal
        isOpen={Boolean(confirmDeleteNote)}
        onClose={() => !actionPending && setConfirmDeleteNote(null)}
        onConfirm={() => void handleDeleteForever(confirmDeleteNote)}
        title="Delete Note Forever?"
        message={`"${confirmDeleteNote?.title || 'Untitled note'}" will be permanently deleted.`}
        icon={Trash2}
        accent="rose"
        maxWidthClass="max-w-sm"
        zIndexClass="z-[60]"
        isPending={actionPending}
        confirmText={actionPending ? 'Deleting...' : 'Delete Forever'}
      />
    </ModulePage>
  );
}

export default memo(QuillApp);
