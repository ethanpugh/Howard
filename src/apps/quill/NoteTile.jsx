import React, { memo, useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeftToLine,
  ArrowRightToLine,
  Copy,
  Home,
  Lock,
  MoreVertical,
  Palette,
  Pin,
  RotateCcw,
  Trash2,
  Users
} from 'lucide-react';
import { formatDurationAgo } from '../../utils/householdHelpers.js';
import { getQuillColorMeta } from './quillConstants.js';
import MarkdownLite from './MarkdownLite.jsx';
import NoteColorPicker from './NoteColorPicker.jsx';

function NoteTile({
  note,
  section,
  nowMs,
  canEdit,
  canTickChecklist,
  isDragged,
  wasRecentlyDragging,
  dragProps = {},
  measureRef,
  onOpen,
  onTogglePin,
  onChangeColor,
  onToggleArchive,
  onMoveToTrash,
  onRestoreFromTrash,
  onDeleteForever,
  onDuplicate,
  onToggleVisibility,
  onToggleCaregiverVisible,
  onToggleChecklistItem,
  onKeyboardMove
}) {
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const tileMenuRef = useRef(null);

  useEffect(() => {
    if (!colorMenuOpen && !moreMenuOpen) return undefined;
    const handlePointerOutside = (e) => {
      if (tileMenuRef.current && !tileMenuRef.current.contains(e.target)) {
        setColorMenuOpen(false);
        setMoreMenuOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setColorMenuOpen(false);
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('pointerdown', handlePointerOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [colorMenuOpen, moreMenuOpen]);

  const colorMeta = getQuillColorMeta(note.color);
  const items = Array.isArray(note.items) ? note.items : [];
  const unchecked = items.filter((it) => !it.checked);
  const checkedCount = items.length - unchecked.length;
  const visibleUnchecked = unchecked.slice(0, 8);
  const extraUncheckedCount = Math.max(0, unchecked.length - visibleUnchecked.length);
  const editedAgo = formatDurationAgo(note.updatedAt, nowMs) || '';
  const hasMenuOpen = colorMenuOpen || moreMenuOpen;

  const handleOpen = () => {
    if (wasRecentlyDragging?.()) return;
    onOpen?.(note);
  };

  const handleKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpen();
      return;
    }
    if (!canEdit || !onKeyboardMove) return;
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      onKeyboardMove(note, section, 'left');
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      onKeyboardMove(note, section, 'right');
    } else if (e.altKey && e.key === 'Home') {
      e.preventDefault();
      onKeyboardMove(note, section, 'start');
    } else if (e.altKey && e.key === 'End') {
      e.preventDefault();
      onKeyboardMove(note, section, 'end');
    }
  };

  return (
    <article
      ref={measureRef}
      data-quill-note-id={note.id}
      data-quill-section={section}
      tabIndex={0}
      aria-label={note.title ? `Note: ${note.title}` : 'Untitled note'}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      {...dragProps}
      className={`group relative rounded-2xl border p-3.5 transition-shadow select-none cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-yellow-400 ${
        hasMenuOpen ? 'z-20' : ''
      } ${colorMeta.cardClass} ${
        isDragged
          ? 'opacity-35 ring-2 ring-dashed ring-yellow-500'
          : 'shadow-xs hover:shadow-md'
      }`}
    >
      {/* Top-right Pin button */}
      {canEdit && note.status === 'active' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin?.(note);
          }}
          title={note.pinned ? 'Unpin note' : 'Pin note'}
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          className={`no-print absolute top-2.5 right-2.5 w-9 h-9 rounded-xl flex items-center justify-center active:scale-[0.98] transition cursor-pointer ${
            note.pinned
              ? 'bg-yellow-400 text-slate-950 shadow-xs'
              : 'opacity-85 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 bg-black/5 dark:bg-white/10 text-text-secondary hover:bg-black/10 dark:hover:bg-white/20'
          }`}
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Title */}
      {note.title && (
        <h3 className="text-sm font-extrabold leading-snug pr-9 mb-1.5 break-words">
          {note.title}
        </h3>
      )}

      {/* Body or Checklist */}
      {note.type === 'checklist' ? (
        <div className="space-y-1 text-xs">
          {visibleUnchecked.map((item) => (
            <label
              key={item.id}
              data-no-drag="true"
              onClick={(e) => e.stopPropagation()}
              className={`flex items-start gap-2 py-0.5 ${
                canTickChecklist ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              <input
                type="checkbox"
                checked={false}
                disabled={!canTickChecklist}
                onChange={() => onToggleChecklistItem?.(note, item)}
                className="mt-0.5 w-3.5 h-3.5 accent-yellow-600 rounded shrink-0 cursor-pointer disabled:cursor-default"
              />
              <span className="min-w-0 break-words leading-snug">{item.text}</span>
            </label>
          ))}
          {extraUncheckedCount > 0 && (
            <div className="text-[11px] font-bold text-text-muted pt-0.5">
              +{extraUncheckedCount} more item{extraUncheckedCount === 1 ? '' : 's'}
            </div>
          )}
          {checkedCount > 0 && (
            <div className="text-[11px] font-semibold text-text-muted pt-1 border-t border-black/10 dark:border-white/10">
              {checkedCount} ticked item{checkedCount === 1 ? '' : 's'}
            </div>
          )}
          {items.length === 0 && (
            <p className="text-xs text-text-muted italic">Empty checklist</p>
          )}
        </div>
      ) : note.body ? (
        <div className="relative max-h-[16.5rem] overflow-hidden text-xs sm:text-[13px]">
          <MarkdownLite text={note.body} stopLinkPropagation />
          {note.body.length > 360 && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/10 dark:from-black/25 to-transparent rounded-b-lg"
            />
          )}
        </div>
      ) : !note.title ? (
        <p className="text-xs text-text-muted italic">Empty note</p>
      ) : null}

      {/* Labels & Visibility Badges */}
      {((note.labels && note.labels.length > 0) ||
        note.caregiverVisible ||
        note.visibility === 'private') && (
        <div className="flex flex-wrap items-center gap-1 mt-2.5">
          {note.visibility === 'private' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/8 dark:bg-white/10 text-[10px] font-bold text-text-secondary">
              <Lock className="w-2.5 h-2.5" />
              Private
            </span>
          )}
          {note.caregiverVisible && note.visibility === 'shared' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-yellow-400/25 border border-black/15 dark:border-white/15 text-text-primary text-[10px] font-bold">
              <Home className="w-2.5 h-2.5" />
              House Note
            </span>
          )}
          {(note.labels || []).slice(0, 4).map((lbl) => (
            <span
              key={lbl}
              className="px-2 py-0.5 rounded-full bg-black/8 dark:bg-white/10 text-[10px] font-bold text-text-secondary"
            >
              {lbl}
            </span>
          ))}
          {(note.labels || []).length > 4 && (
            <span className="text-[10px] font-bold text-text-muted">
              +{note.labels.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer + Hover Actions */}
      <div
        ref={tileMenuRef}
        className="mt-2.5 pt-2 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-1.5"
      >
        <span className="text-[10px] text-text-muted truncate">
          {note.updatedBy ? `${note.updatedBy}` : ''}
          {note.updatedBy && editedAgo ? ' · ' : ''}
          {editedAgo}
        </span>

        {canEdit && (
          <div
            data-no-drag="true"
            onClick={(e) => e.stopPropagation()}
            className="no-print relative flex items-center gap-0.5 opacity-95 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity shrink-0"
          >
            {note.status === 'trashed' ? (
              <>
                <button
                  type="button"
                  onClick={() => onRestoreFromTrash?.(note)}
                  title="Restore note"
                  aria-label="Restore note"
                  className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-text-secondary hover:bg-black/10 dark:hover:bg-white/15 flex items-center justify-center active:scale-[0.98] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteForever?.(note)}
                  title="Delete forever"
                  aria-label="Delete forever"
                  className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-rose-700 dark:text-rose-300 hover:bg-rose-500/15 flex items-center justify-center active:scale-[0.98] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setColorMenuOpen((p) => !p);
                  }}
                  title="Change colour"
                  aria-label="Change colour"
                  className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-text-secondary hover:bg-black/10 dark:hover:bg-white/15 flex items-center justify-center active:scale-[0.98] cursor-pointer"
                >
                  <Palette className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleArchive?.(note)}
                  title={note.status === 'archived' ? 'Unarchive note' : 'Archive note'}
                  aria-label={note.status === 'archived' ? 'Unarchive note' : 'Archive note'}
                  className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-text-secondary hover:bg-black/10 dark:hover:bg-white/15 flex items-center justify-center active:scale-[0.98] cursor-pointer"
                >
                  {note.status === 'archived' ? (
                    <ArchiveRestore className="w-3.5 h-3.5" />
                  ) : (
                    <Archive className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setColorMenuOpen(false);
                    setMoreMenuOpen((p) => !p);
                  }}
                  title="More actions"
                  aria-label="More actions"
                  className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-text-secondary hover:bg-black/10 dark:hover:bg-white/15 flex items-center justify-center active:scale-[0.98] cursor-pointer"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </>
            )}

            {colorMenuOpen && (
              <div className="absolute right-0 bottom-10 z-30 p-2.5 rounded-2xl border border-border-strong bg-surface-card shadow-xl max-w-[calc(100vw-2rem)]">
                <NoteColorPicker
                  compact
                  value={note.color}
                  onChange={(col) => {
                    onChangeColor?.(note, col);
                    setColorMenuOpen(false);
                  }}
                />
              </div>
            )}

            {moreMenuOpen && (
              <div className="absolute right-0 bottom-10 z-30 w-48 max-w-[calc(100vw-2rem)] py-1.5 rounded-2xl border border-border-strong bg-surface-card shadow-xl text-xs font-semibold text-text-primary">
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onDuplicate?.(note);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-surface-hover flex items-center gap-2 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate note</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onToggleVisibility?.(note);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-surface-hover flex items-center gap-2 cursor-pointer"
                >
                  {note.visibility === 'shared' ? (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Make private</span>
                    </>
                  ) : (
                    <>
                      <Users className="w-3.5 h-3.5" />
                      <span>Move to Shared</span>
                    </>
                  )}
                </button>
                {note.visibility === 'shared' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onToggleCaregiverVisible?.(note);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-surface-hover flex items-center gap-2 cursor-pointer"
                  >
                    <Home className="w-3.5 h-3.5" />
                    <span>
                      {note.caregiverVisible ? 'Hide from Caregiver' : 'Show as House Note'}
                    </span>
                  </button>
                )}
                {note.status === 'active' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        onKeyboardMove?.(note, section, 'start');
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-surface-hover flex items-center gap-2 cursor-pointer"
                    >
                      <ArrowLeftToLine className="w-3.5 h-3.5" />
                      <span>Move to start</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        onKeyboardMove?.(note, section, 'end');
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-surface-hover flex items-center gap-2 cursor-pointer"
                    >
                      <ArrowRightToLine className="w-3.5 h-3.5" />
                      <span>Move to end</span>
                    </button>
                  </>
                )}
                <div className="my-1 border-t border-border-subtle" />
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onMoveToTrash?.(note);
                  }}
                  className="w-full px-3 py-2 text-left text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Move to Trash</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default memo(NoteTile);
