import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import NoteTile from './NoteTile.jsx';
import { getQuillColorMeta } from './quillConstants.js';

const ROW_UNIT = 8;
const ROW_GAP = 12;

function MasonrySection({
  title,
  sectionKey,
  notes,
  nowMs,
  canEdit,
  canTickChecklist,
  dragState,
  getTileDragProps,
  tileProps
}) {
  const [spans, setSpans] = useState({});
  const nodeMapRef = useRef(new Map());
  const observerRef = useRef(null);
  const rafRef = useRef(null);
  const pendingIdsRef = useRef(new Set());

  const flushMeasurements = useCallback(() => {
    rafRef.current = null;
    const ids = Array.from(pendingIdsRef.current);
    pendingIdsRef.current.clear();
    if (ids.length === 0) return;

    setSpans((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of ids) {
        const el = nodeMapRef.current.get(id);
        if (!el) continue;
        const height = el.getBoundingClientRect().height;
        const span = Math.max(4, Math.ceil((height + ROW_GAP) / ROW_UNIT));
        if (next[id] !== span) {
          next[id] = span;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target.getAttribute('data-quill-note-id');
        if (id) pendingIdsRef.current.add(id);
      }
      if (!rafRef.current) {
        rafRef.current = window.requestAnimationFrame(flushMeasurements);
      }
    });
    observerRef.current = ro;
    for (const el of nodeMapRef.current.values()) {
      ro.observe(el);
    }
    return () => {
      ro.disconnect();
      observerRef.current = null;
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [flushMeasurements]);

  const registerTileRef = useCallback(
    (noteId) => (el) => {
      const prevEl = nodeMapRef.current.get(noteId);
      if (prevEl && prevEl !== el) {
        observerRef.current?.unobserve(prevEl);
        nodeMapRef.current.delete(noteId);
      }
      if (el) {
        nodeMapRef.current.set(noteId, el);
        observerRef.current?.observe(el);
        pendingIdsRef.current.add(noteId);
        if (!rafRef.current) {
          rafRef.current = window.requestAnimationFrame(flushMeasurements);
        }
      }
    },
    [flushMeasurements]
  );

  return (
    <div className="space-y-2.5">
      {title && (
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-text-muted px-1">
          {title}
        </div>
      )}

      <div
        data-quill-section={sectionKey}
        className="grid grid-cols-1 min-[440px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-3 items-start min-h-[48px]"
        style={{ gridAutoRows: `${ROW_UNIT}px` }}
      >
        {notes.length === 0 && dragState ? (
          <div
            className="col-span-full rounded-2xl border-2 border-dashed border-yellow-500/60 bg-yellow-400/10 text-xs font-bold text-yellow-900 dark:text-yellow-300 flex items-center justify-center py-4"
            style={{ gridRowEnd: 'span 8' }}
          >
            Drop here to pin note
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              style={{
                gridRowEnd: `span ${spans[note.id] || 18}`,
                paddingBottom: `${ROW_GAP}px`
              }}
            >
              <NoteTile
                note={note}
                section={sectionKey}
                nowMs={nowMs}
                canEdit={canEdit}
                canTickChecklist={canTickChecklist}
                isDragged={dragState?.noteId === note.id}
                dragProps={getTileDragProps(note, sectionKey)}
                measureRef={registerTileRef(note.id)}
                {...tileProps}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function NoteMasonryGrid({
  pinnedNotes = [],
  otherNotes = [],
  showSections = true,
  nowMs,
  canEdit,
  canTickChecklist,
  dragState,
  getTileDragProps,
  ...tileProps
}) {
  const hasPinned = showSections && pinnedNotes.length > 0;
  const showEmptyPinTarget = showSections && pinnedNotes.length === 0 && Boolean(dragState);

  return (
    <div className="relative space-y-4 sm:space-y-5">
      {showEmptyPinTarget && (
        <div
          data-quill-section="pinned"
          className="rounded-2xl border-2 border-dashed border-yellow-500/70 bg-yellow-400/15 text-xs font-extrabold text-yellow-900 dark:text-yellow-200 flex items-center justify-center py-3 shadow-xs"
        >
          Drop here to pin note
        </div>
      )}

      {hasPinned && (
        <MasonrySection
          title="Pinned"
          sectionKey="pinned"
          notes={pinnedNotes}
          nowMs={nowMs}
          canEdit={canEdit}
          canTickChecklist={canTickChecklist}
          dragState={dragState}
          getTileDragProps={getTileDragProps}
          tileProps={tileProps}
        />
      )}

      {otherNotes.length > 0 && (
        <MasonrySection
          title={hasPinned ? 'Others' : ''}
          sectionKey="others"
          notes={otherNotes}
          nowMs={nowMs}
          canEdit={canEdit}
          canTickChecklist={canTickChecklist}
          dragState={dragState}
          getTileDragProps={getTileDragProps}
          tileProps={tileProps}
        />
      )}

      {/* Floating drag ghost */}
      {dragState && (
        <div
          aria-hidden="true"
          className="fixed z-50 pointer-events-none"
          style={{
            left: `${dragState.left}px`,
            top: `${dragState.top}px`,
            width: `${dragState.width}px`
          }}
        >
          <div
            className={`rounded-2xl border p-3.5 shadow-2xl rotate-[-1.5deg] ring-2 ring-yellow-500 ${
              getQuillColorMeta(dragState.note.color).cardClass
            }`}
          >
            {dragState.note.title && (
              <div className="text-sm font-extrabold truncate mb-1">
                {dragState.note.title}
              </div>
            )}
            <div className="text-xs text-text-muted line-clamp-3">
              {dragState.note.type === 'checklist'
                ? `${(dragState.note.items || []).length} checklist items`
                : dragState.note.body || 'Empty note'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(NoteMasonryGrid);
