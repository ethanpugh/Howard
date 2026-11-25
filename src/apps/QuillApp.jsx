import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  ConfirmModal,
  EmptyStateCard,
  ModalShell,
  ModuleHeader,
  SectionCard,
  SegmentedTabs,
  StatusPill,
  SubSurface,
  getFieldClass,
  getOpenModalCount
} from '../components/HowardUI.jsx';
import { apiRequest } from '../utils/apiClient.js';
import { useActionLock } from '../hooks/useActionLock.js';
import { QUILL_LIMITS } from './quill/quillConstants.js';
import {
  computeMovedPosition,
  filterQuillNotes,
  sortBoardNotes
} from './quill/quillHelpers.js';
import { useNoteDrag } from './quill/useNoteDrag.js';
import QuickAddBar from './quill/QuickAddBar.jsx';
import NoteMasonryGrid from './quill/NoteMasonryGrid.jsx';
import NoteEditorModal from './quill/NoteEditorModal.jsx';

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
}) {
  const isCaregiver = activeProfile?.id === 'caregiver';
  const canEdit = !isCaregiver;

  const [activeTab, setActiveTab] = useState('shared');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [labelsModalOpen, setLabelsModalOpen] = useState(false);
  const [newLabelText, setNewLabelText] = useState('');
  const [renamingLabel, setRenamingLabel] = useState(null); // { from, to }
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const { isPending: actionPending, runLocked } = useActionLock();

  const searchInputRef = useRef(null);
  const quickAddTriggerRef = useRef(null);

  const notes = useMemo(() => quillSnapshot?.notes || [], [quillSnapshot]);
  const labels = useMemo(() => quillSnapshot?.labels || [], [quillSnapshot]);

  useEffect(() => {
    if (!navigationIntent) return;
    if (navigationIntent.tab && !isCaregiver) {
      setActiveTab(navigationIntent.tab);
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
    const handleKeyDown = (e) => {
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

  const tabs = useMemo(
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
    (updater) => {
      setQuillSnapshot((prev) => ({
        ...prev,
        notes: sortBoardNotes(updater(prev?.notes || []))
      }));
    },
    [setQuillSnapshot]
  );

  const handleCreateNote = useCallback(
    async (draft) => {
      if (!canEdit) return;
      const nowIso = new Date().toISOString();
      const optimistic = {
        ...draft,
        ownerProfileId: activeProfile.id,
        revision: 1,
        position: -Date.now(),
        createdAt: nowIso,
        createdByProfileId: activeProfile.id,
        createdBy: activeProfile.name,
        updatedAt: nowIso,
        updatedByProfileId: activeProfile.id,
        updatedBy: activeProfile.name
      };
      optimisticUpdateNotes((list) => [optimistic, ...list]);
      try {
        const res = await apiRequest(`/api/quill/notes/${encodeURIComponent(draft.id)}`, {
          method: 'PUT',
          profileId: activeProfile.id,
          body: { note: draft }
        });
        if (res?.note) {
          optimisticUpdateNotes((list) =>
            list.map((n) => (n.id === res.note.id ? res.note : n))
          );
        }
        onGlobalSync?.();
      } catch {
        optimisticUpdateNotes((list) => list.filter((n) => n.id !== draft.id));
        onGlobalSync?.({ force: true });
        showToast?.('Could not save note — reverted', 'error');
      }
    },
    [canEdit, activeProfile, optimisticUpdateNotes, onGlobalSync, showToast]
  );

  const handleSaveEditorNote = useCallback(
    async (draft, baseRevision, options = {}) => {
      if (options.caregiverToggleItem) {
        const item = options.caregiverToggleItem;
        try {
          const res = await apiRequest(
            `/api/quill/notes/${encodeURIComponent(draft.id)}/items/${encodeURIComponent(item.id)}`,
            {
              method: 'PATCH',
              profileId: activeProfile.id,
              body: { checked: item.checked }
            }
          );
          if (res?.note) {
            optimisticUpdateNotes((list) =>
              list.map((n) => (n.id === res.note.id ? res.note : n))
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
        const res = await apiRequest(`/api/quill/notes/${encodeURIComponent(draft.id)}`, {
          method: 'PUT',
          profileId: activeProfile.id,
          keepalive: Boolean(options.keepalive),
          body: { note: draft, baseRevision }
        });
        if (res?.note) {
          optimisticUpdateNotes((list) => {
            const exists = list.some((n) => n.id === res.note.id);
            return exists ? list.map((n) => (n.id === res.note.id ? res.note : n)) : [res.note, ...list];
          });
        }
        onGlobalSync?.();
        return { ok: true, note: res?.note };
      } catch (err) {
        if (err?.status === 409 && err?.payload?.note) {
          return { ok: false, conflict: true, note: err.payload.note };
        }
        onGlobalSync?.({ force: true });
        showToast?.('Could not save note changes', 'error');
        return { ok: false };
      }
    },
    [canEdit, activeProfile.id, optimisticUpdateNotes, onGlobalSync, showToast]
  );

  const patchNote = useCallback(
    async (note, patch, toastInfo = null) => {
      if (!canEdit) return;
      const optimisticOwner =
        note.visibility === 'shared' && patch.visibility === 'private'
          ? activeProfile.id
          : note.ownerProfileId;
      optimisticUpdateNotes((list) =>
        list.map((n) => (n.id === note.id ? { ...n, ...patch, ownerProfileId: optimisticOwner } : n))
      );
      try {
        const res = await apiRequest(`/api/quill/notes/${encodeURIComponent(note.id)}`, {
          method: 'PATCH',
          profileId: activeProfile.id,
          body: patch
        });
        if (res?.note) {
          optimisticUpdateNotes((list) =>
            list.map((n) => (n.id === res.note.id ? res.note : n))
          );
        }
        if (toastInfo?.text) {
          showToast?.(
            toastInfo.text,
            'success',
            toastInfo.undoPatch
              ? {
                  actionLabel: 'Undo',
                  onAction: () => patchNote(res?.note || { ...note, ...patch }, toastInfo.undoPatch)
                }
              : null
          );
        }
        onGlobalSync?.();
      } catch {
        optimisticUpdateNotes((list) => list.map((n) => (n.id === note.id ? note : n)));
        onGlobalSync?.({ force: true });
        showToast?.('Could not update note — reverted', 'error');
      }
    },
    [canEdit, activeProfile.id, optimisticUpdateNotes, onGlobalSync, showToast]
  );

  const handleToggleChecklistItem = useCallback(
    async (note, item) => {
      if (!canEdit && !(isCaregiver && note.caregiverVisible && note.visibility === 'shared')) {
        return;
      }
      const nextChecked = !item.checked;
      optimisticUpdateNotes((list) =>
        list.map((n) =>
          n.id === note.id
            ? {
                ...n,
                items: (n.items || []).map((it) =>
                  it.id === item.id ? { ...it, checked: nextChecked } : it
                )
              }
            : n
        )
      );
      try {
        const res = await apiRequest(
          `/api/quill/notes/${encodeURIComponent(note.id)}/items/${encodeURIComponent(item.id)}`,
          {
            method: 'PATCH',
            profileId: activeProfile.id,
            body: { checked: nextChecked }
          }
        );
        if (res?.note) {
          optimisticUpdateNotes((list) =>
            list.map((n) => (n.id === res.note.id ? res.note : n))
          );
        }
        onGlobalSync?.();
      } catch {
        optimisticUpdateNotes((list) => list.map((n) => (n.id === note.id ? note : n)));
        onGlobalSync?.({ force: true });
        showToast?.('Could not update checklist item', 'error');
      }
    },
    [canEdit, isCaregiver, activeProfile.id, optimisticUpdateNotes, onGlobalSync, showToast]
  );

  const commitReorder = useCallback(
    async ({ noteId, targetSection, targetIndex }) => {
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
        const res = await apiRequest('/api/quill/notes/reorder', {
          method: 'POST',
          profileId: activeProfile.id,
          body: { moves: [{ id: noteId, position: nextPos, pinned: destPinned }] }
        });
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
    (note, section, direction) => {
      const list = section === 'pinned' ? pinnedNotes : otherNotes;
      const idx = list.findIndex((n) => n.id === note.id);
      if (idx === -1) return;
      let targetIndex = idx;
      if (direction === 'left') targetIndex = Math.max(0, idx - 1);
      else if (direction === 'right') targetIndex = Math.min(list.length - 1, idx + 1);
      else if (direction === 'start') targetIndex = 0;
      else if (direction === 'end') targetIndex = list.length - 1;
      if (targetIndex === idx) return;
      commitReorder({ noteId: note.id, targetSection: section, targetIndex });
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
    (note) => {
      handleCreateNote({
        ...note,
        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: note.title ? `${note.title} (Copy)` : '',
        pinned: false,
        status: 'active'
      });
      showToast?.('Duplicated note');
    },
    [handleCreateNote, showToast]
  );

  const handleDeleteForever = useCallback(
    (note) =>
      runLocked(async () => {
        if (!canEdit || !note) return;
        optimisticUpdateNotes((list) => list.filter((n) => n.id !== note.id));
        setConfirmDeleteNote(null);
        if (editingNoteId === note.id) setEditingNoteId(null);
        try {
          await apiRequest(`/api/quill/notes/${encodeURIComponent(note.id)}`, {
            method: 'DELETE',
            profileId: activeProfile.id
          });
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
          await apiRequest('/api/quill/trash/empty', {
            method: 'POST',
            profileId: activeProfile.id
          });
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
    (body, toastMsg = 'Updated labels') =>
      runLocked(async () => {
        try {
          const res = await apiRequest('/api/quill/labels', {
            method: 'PUT',
            profileId: activeProfile.id,
            body
          });
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
    handleSaveLabels({ labels: [...labels, cleaned] }, `Added label "${cleaned}"`);
    setNewLabelText('');
  };

  const handleAddAlmanacReminder = useCallback(
    async (note, dateStr) => {
      if (!onMutateAlmanacEvents || !dateStr) return;
      const newEvt = {
        id: `evt-quill-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        title: note.title?.trim() || 'Quill Note Reminder',
        date: dateStr,
        time: '',
        category: 'household',
        assignedTo: note.visibility === 'private' ? activeProfile.name : 'Both',
        assignedToProfileId: note.visibility === 'private' ? activeProfile.id : null,
        notes: (note.body || '').slice(0, 160),
        linkedNoteId: note.id,
        recurrence: 'none'
      };
      const ok = await onMutateAlmanacEvents(
        { nextEvents: [...almanacEvents, newEvt], upserts: [newEvt] },
        null
      );
      if (ok) {
        showToast?.(`Added Almanac reminder for ${dateStr}`, 'success', {
          actionLabel: 'View',
          onAction: () => onOpenAlmanacDate?.(dateStr)
        });
      }
    },
    [onMutateAlmanacEvents, activeProfile, almanacEvents, showToast, onOpenAlmanacDate]
  );

  const partner1Name = profiles.find((p) => p.id === 'partner1')?.name || 'Partner 1';
  const partner2Name = profiles.find((p) => p.id === 'partner2')?.name || 'Partner 2';

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 space-y-4 sm:space-y-5">
      <div className="sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>

      <ModuleHeader
        accent="yellow"
        icon={StickyNote}
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
              <Search className="w-4 h-4 text-text-placeholder absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes (/)"
                aria-label="Search notes"
                className={getFieldClass('yellow', 'min-h-[40px] pl-9 pr-3', { compact: true })}
              />
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setLabelsModalOpen(true)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-border-strong bg-surface-subtle hover:bg-surface-hover text-text-primary text-xs font-bold inline-flex items-center gap-1.5 active:scale-[0.98] cursor-pointer transition"
              >
                <Tag className="w-4 h-4 text-yellow-800 dark:text-yellow-300" />
                <span>Labels</span>
              </button>
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
                    onClick={() => setSelectedLabel('')}
                    className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-bold shrink-0 border active:scale-[0.98] cursor-pointer transition ${
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
                        onClick={() => setSelectedLabel(active ? '' : lbl)}
                        className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-bold shrink-0 border active:scale-[0.98] cursor-pointer transition ${
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
            <button
              type="button"
              disabled={actionPending}
              onClick={() => setConfirmEmptyTrash(true)}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold active:scale-[0.98] disabled:opacity-60 cursor-pointer transition"
            >
              Empty Trash
            </button>
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
          onTogglePin={(n) => patchNote(n, { pinned: !n.pinned })}
          onChangeColor={(n, color) => patchNote(n, { color })}
          onToggleArchive={(n) =>
            patchNote(
              n,
              { status: n.status === 'archived' ? 'active' : 'archived', pinned: false },
              n.status === 'archived'
                ? { text: 'Restored from Archive', undoPatch: { status: 'archived' } }
                : { text: 'Note archived', undoPatch: { status: 'active', pinned: n.pinned } }
            )
          }
          onMoveToTrash={(n) =>
            patchNote(
              n,
              { status: 'trashed', pinned: false },
              {
                text: 'Moved note to Trash',
                undoPatch: { status: n.status, pinned: n.pinned }
              }
            )
          }
          onRestoreFromTrash={(n) =>
            patchNote(n, { status: 'active' }, { text: 'Restored note from Trash' })
          }
          onDeleteForever={(n) => setConfirmDeleteNote(n)}
          onDuplicate={handleDuplicate}
          onToggleVisibility={(n) =>
            patchNote(
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
            patchNote(
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
          patchNote(
            n,
            { status: n.status === 'archived' ? 'active' : 'archived', pinned: false },
            { text: n.status === 'archived' ? 'Restored from Archive' : 'Note archived' }
          )
        }
        onMoveToTrash={(n) =>
          patchNote(
            n,
            { status: 'trashed', pinned: false },
            { text: 'Moved note to Trash', undoPatch: { status: n.status, pinned: n.pinned } }
          )
        }
        onRestoreFromTrash={(n) =>
          patchNote(n, { status: 'active' }, { text: 'Restored note from Trash' })
        }
        onDeleteForever={(n) => setConfirmDeleteNote(n)}
        onDuplicate={handleDuplicate}
        onAddAlmanacReminder={handleAddAlmanacReminder}
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
            <input
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
                    <input
                      type="text"
                      autoFocus
                      value={renamingLabel.to}
                      maxLength={QUILL_LIMITS.maxLabelLen}
                      onChange={(e) =>
                        setRenamingLabel((p) => ({ ...p, to: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && renamingLabel.to.trim()) {
                          handleSaveLabels(
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
                  ) : (
                    <span className="font-bold truncate">{lbl}</span>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    {renamingLabel?.from === lbl ? (
                      <button
                        type="button"
                        disabled={actionPending}
                        onClick={() => {
                          if (renamingLabel.to.trim()) {
                            handleSaveLabels(
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
                      onClick={() => handleSaveLabels({ deleteLabel: lbl }, `Deleted label "${lbl}"`)}
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
        onConfirm={handleEmptyTrash}
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
        onConfirm={() => handleDeleteForever(confirmDeleteNote)}
        title="Delete Note Forever?"
        message={`"${confirmDeleteNote?.title || 'Untitled note'}" will be permanently deleted.`}
        icon={Trash2}
        accent="rose"
        maxWidthClass="max-w-sm"
        zIndexClass="z-[60]"
        isPending={actionPending}
        confirmText={actionPending ? 'Deleting...' : 'Delete Forever'}
      />
    </main>
  );
}

export default memo(QuillApp);
