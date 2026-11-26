import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckSquare,
  FileText,
  Home,
  Lock,
  Palette,
  Pin,
  Plus,
  StickyNote,
  Type,
  Users,
  X
} from 'lucide-react';
import { IconBadge } from '../../components/HowardUI.jsx';
import {
  QUILL_LIMITS,
  createChecklistItemId,
  createNoteId,
  getQuillColorMeta
} from './quillConstants.js';
import {
  applyMarkdownFormat,
  convertChecklistItemsToText,
  convertTextToChecklistItems
} from './quillHelpers.js';
import NoteColorPicker from './NoteColorPicker.jsx';
import FormatToolbar from './FormatToolbar.jsx';

function QuickAddBar({
  defaultVisibility = 'shared',
  onCreateNote,
  triggerRef
}) {
  const [expanded, setExpanded] = useState(false);
  const [type, setType] = useState('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [items, setItems] = useState([]);
  const [newItemText, setNewItemText] = useState('');
  const [color, setColor] = useState('default');
  const [pinned, setPinned] = useState(false);
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [caregiverVisible, setCaregiverVisible] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [showFormatting, setShowFormatting] = useState(false);

  const containerRef = useRef(null);
  const titleInputRef = useRef(null);
  const bodyInputRef = useRef(null);
  const commitRef = useRef(null);

  useEffect(() => {
    if (!expanded) {
      setVisibility(defaultVisibility);
    }
  }, [defaultVisibility, expanded]);

  const resetForm = useCallback(() => {
    setExpanded(false);
    setType('text');
    setTitle('');
    setBody('');
    setItems([]);
    setNewItemText('');
    setColor('default');
    setPinned(false);
    setVisibility(defaultVisibility);
    setCaregiverVisible(false);
    setShowColors(false);
    setShowFormatting(false);
  }, [defaultVisibility]);

  const commitIfNonEmpty = useCallback(() => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    const pendingItem = newItemText.trim();
    const finalItems = pendingItem
      ? [...items, { id: createChecklistItemId(), text: pendingItem, checked: false }]
      : items;

    const hasContent =
      Boolean(trimmedTitle) ||
      (type === 'text' ? Boolean(trimmedBody) : finalItems.length > 0);

    if (hasContent) {
      onCreateNote?.({
        id: createNoteId(),
        type,
        title: title.slice(0, QUILL_LIMITS.maxTitleLen),
        body: type === 'text' ? body.slice(0, QUILL_LIMITS.maxBodyLen) : '',
        items: type === 'checklist' ? finalItems.slice(0, QUILL_LIMITS.maxItems) : [],
        color,
        labels: [],
        visibility,
        caregiverVisible: visibility === 'shared' ? caregiverVisible : false,
        pinned,
        status: 'active'
      });
    }
    resetForm();
  }, [
    title,
    body,
    newItemText,
    items,
    type,
    color,
    visibility,
    caregiverVisible,
    pinned,
    onCreateNote,
    resetForm
  ]);

  useEffect(() => {
    commitRef.current = commitIfNonEmpty;
  }, [commitIfNonEmpty]);

  useEffect(() => {
    if (!expanded) return undefined;
    const handleOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        commitRef.current?.();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [expanded]);

  const openComposer = (initialType = 'text') => {
    setType(initialType);
    setVisibility(defaultVisibility);
    setExpanded(true);
    window.requestAnimationFrame(() => {
      if (initialType === 'text') {
        bodyInputRef.current?.focus();
      } else {
        titleInputRef.current?.focus();
      }
    });
  };

  const addDraftItem = () => {
    const cleaned = newItemText.trim().slice(0, QUILL_LIMITS.maxItemTextLen);
    if (!cleaned || items.length >= QUILL_LIMITS.maxItems) return;
    setItems((prev) => [...prev, { id: createChecklistItemId(), text: cleaned, checked: false }]);
    setNewItemText('');
  };

  const handleToggleType = () => {
    if (type === 'text') {
      setItems(convertTextToChecklistItems(body));
      setBody('');
      setType('checklist');
      setShowFormatting(false);
    } else {
      const pending = newItemText.trim();
      const merged = pending
        ? [...items, { id: createChecklistItemId(), text: pending, checked: false }]
        : items;
      setBody(convertChecklistItemsToText(merged));
      setItems([]);
      setNewItemText('');
      setType('text');
    }
  };

  const handleFormat = useCallback(
    (formatType) => {
      const ta = bodyInputRef.current;
      if (!ta) return;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const next = applyMarkdownFormat(body, start, end, formatType);
      setBody(next.text);
      window.requestAnimationFrame(() => {
        if (!bodyInputRef.current) return;
        bodyInputRef.current.focus();
        bodyInputRef.current.setSelectionRange(next.start, next.end);
      });
    },
    [body]
  );

  const colorMeta = getQuillColorMeta(color);

  if (!expanded) {
    return (
      <div className="w-full no-print">
        <div className="rounded-2xl sm:rounded-3xl border border-border-subtle bg-surface-card shadow-xs px-3.5 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 hover:border-yellow-500/50 transition">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => openComposer('text')}
            className="flex items-center gap-3 flex-1 min-w-[140px] text-left cursor-text group"
          >
            <IconBadge icon={StickyNote} accent="yellow" size="sm" iconClassName="w-4 h-4" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-text-placeholder group-hover:text-text-secondary transition truncate">
                Take a note...
              </div>
              <div className="text-[11px] text-text-muted hidden sm:block">
                {defaultVisibility === 'private' ? 'Private to your board' : 'Shared with household'} •
                Press <kbd className="px-1 py-0.5 rounded border border-border-strong bg-surface-subtle text-[10px] font-bold">C</kbd> to start
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => openComposer('text')}
              className="min-h-[40px] px-3 sm:px-3.5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs active:scale-[0.98] transition cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>New Note</span>
            </button>
            <button
              type="button"
              onClick={() => openComposer('checklist')}
              title="New checklist"
              aria-label="New checklist"
              className="min-h-[40px] px-3 py-2 rounded-xl border border-border-strong bg-surface-subtle hover:bg-surface-hover text-text-secondary text-xs font-bold inline-flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
            >
              <CheckSquare className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Checklist</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full no-print">
      <div
        className={`rounded-2xl sm:rounded-3xl border shadow-md p-4 sm:p-5 space-y-3 transition-colors ${colorMeta.cardClass}`}
      >
        {/* Title Row */}
        <div className="flex items-center gap-2">
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            maxLength={QUILL_LIMITS.maxTitleLen}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                commitIfNonEmpty();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                resetForm();
              }
            }}
            placeholder="Note title..."
            className="input-bare flex-1 min-w-0 bg-transparent border-0 px-1 py-1 text-base sm:text-lg font-extrabold placeholder:text-text-placeholder focus:outline-hidden"
          />
          <button
            type="button"
            onClick={() => setPinned((p) => !p)}
            aria-label={pinned ? 'Unpin note' : 'Pin note'}
            title={pinned ? 'Unpin note' : 'Pin note'}
            className={`min-w-[40px] min-h-[40px] p-2 rounded-xl flex items-center justify-center active:scale-[0.98] transition cursor-pointer shrink-0 ${
              pinned
                ? 'bg-yellow-400 text-slate-950 shadow-xs'
                : 'text-text-secondary hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            <Pin className="w-4 h-4" />
          </button>
        </div>

        <div className="border-t border-black/8 dark:border-white/10" />

        {/* Body or Checklist */}
        {type === 'text' ? (
          <div className="space-y-2.5">
            {showFormatting && (
              <FormatToolbar
                onFormat={handleFormat}
                onConvertToChecklist={handleToggleType}
              />
            )}
            <textarea
              ref={bodyInputRef}
              rows={4}
              value={body}
              maxLength={QUILL_LIMITS.maxBodyLen}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  commitIfNonEmpty();
                } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
                  e.preventDefault();
                  handleFormat('bold');
                } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
                  e.preventDefault();
                  handleFormat('italic');
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  resetForm();
                }
              }}
              placeholder="Write your note... (supports **bold**, *italic*, - lists)"
              className="input-bare w-full min-w-0 min-h-[100px] bg-transparent border-0 px-1 py-1 text-base sm:text-sm leading-relaxed resize-y placeholder:text-text-placeholder focus:outline-hidden"
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() =>
                    setItems((prev) =>
                      prev.map((it) => (it.id === item.id ? { ...it, checked: !it.checked } : it))
                    )
                  }
                  className="w-4 h-4 accent-yellow-600 rounded cursor-pointer shrink-0"
                />
                <span className={`flex-1 min-w-0 break-words ${item.checked ? 'line-through opacity-60' : ''}`}>
                  {item.text}
                </span>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((it) => it.id !== item.id))}
                  aria-label="Remove item"
                  className="min-w-[36px] min-h-[36px] p-1 text-text-muted hover:text-rose-600 flex items-center justify-center active:scale-[0.98] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-dashed border-black/15 dark:border-white/15">
              <Plus className="w-4 h-4 text-text-muted shrink-0" />
              <input
                type="text"
                value={newItemText}
                maxLength={QUILL_LIMITS.maxItemTextLen}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    commitIfNonEmpty();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    addDraftItem();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    resetForm();
                  }
                }}
                placeholder="List item (press Enter to add)..."
                className="input-bare flex-1 min-w-0 bg-transparent border-0 text-base sm:text-sm py-1 placeholder:text-text-placeholder focus:outline-hidden"
              />
              {newItemText.trim() && (
                <button
                  type="button"
                  onClick={addDraftItem}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-extrabold active:scale-[0.98] cursor-pointer transition"
                >
                  Add
                </button>
              )}
            </div>
          </div>
        )}

        {showColors && (
          <div className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5">
            <NoteColorPicker value={color} onChange={setColor} />
          </div>
        )}

        {/* Footer Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-black/8 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowColors((p) => !p)}
              title="Note colour"
              aria-label="Note colour"
              className={`min-w-[40px] min-h-[40px] p-1.5 rounded-xl flex items-center justify-center active:scale-[0.98] transition cursor-pointer ${
                showColors
                  ? 'bg-yellow-400 text-slate-950'
                  : 'text-text-secondary hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              <Palette className="w-4 h-4" />
            </button>

            {type === 'text' && (
              <button
                type="button"
                onClick={() => setShowFormatting((p) => !p)}
                title="Formatting options"
                aria-label="Formatting options"
                className={`min-w-[40px] min-h-[40px] p-1.5 rounded-xl flex items-center justify-center active:scale-[0.98] transition cursor-pointer ${
                  showFormatting
                    ? 'bg-yellow-400 text-slate-950'
                    : 'text-text-secondary hover:bg-black/5 dark:hover:bg-white/10'
                }`}
              >
                <Type className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleType}
              title={type === 'text' ? 'Switch to checklist' : 'Switch to text note'}
              aria-label={type === 'text' ? 'Switch to checklist' : 'Switch to text note'}
              className="min-w-[40px] min-h-[40px] p-1.5 rounded-xl text-text-secondary hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center active:scale-[0.98] transition cursor-pointer"
            >
              {type === 'text' ? <CheckSquare className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() =>
                setVisibility((v) => {
                  const next = v === 'shared' ? 'private' : 'shared';
                  if (next === 'private') setCaregiverVisible(false);
                  return next;
                })
              }
              className="min-h-[40px] px-2.5 py-1 rounded-xl text-xs font-bold bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 inline-flex items-center gap-1.5 active:scale-[0.98] cursor-pointer transition"
            >
              {visibility === 'shared' ? (
                <>
                  <Users className="w-3.5 h-3.5 text-yellow-800 dark:text-yellow-300" />
                  <span>Shared Board</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-text-secondary" />
                  <span>Private</span>
                </>
              )}
            </button>

            {visibility === 'shared' && (
              <button
                type="button"
                onClick={() => setCaregiverVisible((v) => !v)}
                title="Show this shared note to Caregiver"
                className={`min-h-[40px] px-2.5 py-1 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 active:scale-[0.98] cursor-pointer transition ${
                  caregiverVisible
                    ? 'bg-yellow-400/30 text-yellow-900 dark:text-yellow-200 border border-yellow-500/45'
                    : 'bg-black/5 dark:bg-white/10 text-text-muted hover:text-text-primary'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">House Note</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold text-text-secondary hover:bg-black/5 dark:hover:bg-white/10 active:scale-[0.98] cursor-pointer transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitIfNonEmpty}
              className="min-h-[40px] px-4 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-extrabold shadow-xs cursor-pointer active:scale-[0.98] transition"
            >
              Save Note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(QuickAddBar);
