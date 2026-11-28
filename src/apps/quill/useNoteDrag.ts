import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { QuillNote } from '../../../shared/schemas/quill.ts';

export type NoteBoardSection = 'pinned' | 'others';

export interface NoteDragState {
  noteId: string;
  note: QuillNote;
  sourceSection: NoteBoardSection;
  targetSection: NoteBoardSection;
  targetIndex: number;
  left: number;
  top: number;
  width: number;
}

export interface NoteReorderMove {
  noteId: string;
  sourceSection: NoteBoardSection;
  targetSection: NoteBoardSection;
  targetIndex: number;
}

interface DragInternalState {
  pointerId: number;
  pointerType: string;
  noteId: string;
  note: QuillNote;
  sourceSection: NoteBoardSection;
  targetSection: NoteBoardSection;
  targetIndex: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  active: boolean;
}

const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, label, [data-no-drag="true"]';

export function useNoteDrag({
  enabled = true,
  onReorder
}: {
  enabled?: boolean | undefined;
  onReorder?: ((move: NoteReorderMove) => void) | undefined;
}) {
  const [dragState, setDragState] = useState<NoteDragState | null>(null);
  const dragRef = useRef<DragInternalState | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollDeltaRef = useRef(0);
  const lastDragEndAtRef = useRef(0);
  const onReorderRef = useRef(onReorder);

  useEffect(() => {
    onReorderRef.current = onReorder;
  }, [onReorder]);

  const computeDropTarget = useCallback(
    (
      clientX: number,
      clientY: number,
      draggedId: string,
      fallbackSection: NoteBoardSection
    ): { targetSection: NoteBoardSection; targetIndex: number } => {
      // Check empty "Drop here to pin note" drop-zone BEFORE nearest-card distance so 2+ unpinned notes don't steal the drop
      const pinnedEl = document.querySelector('[data-quill-section="pinned"]');
      if (pinnedEl) {
        const pRect = pinnedEl.getBoundingClientRect();
        const pinnedCards = Array.from(
          pinnedEl.querySelectorAll('[data-quill-note-id]')
        ).filter((el) => el.getAttribute('data-quill-note-id') !== draggedId);

        if (
          pinnedCards.length === 0 &&
          clientX >= pRect.left - 16 &&
          clientX <= pRect.right + 16 &&
          clientY >= pRect.top - 16 &&
          clientY <= pRect.bottom + 16
        ) {
          return { targetSection: 'pinned', targetIndex: 0 };
        }
      }

      const cards = Array.from(document.querySelectorAll('[data-quill-note-id]'));
      let bestCard: Element | null = null;
      let bestDist = Infinity;

      for (const el of cards) {
        const id = el.getAttribute('data-quill-note-id');
        if (!id || id === draggedId) continue;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(clientX - cx, clientY - cy);
        if (dist < bestDist) {
          bestDist = dist;
          bestCard = el;
        }
      }

      if (!bestCard) {
        return { targetSection: fallbackSection || 'others', targetIndex: 0 };
      }

      const rawSection = bestCard.getAttribute('data-quill-section');
      const targetSection: NoteBoardSection =
        rawSection === 'pinned' || rawSection === 'others'
          ? rawSection
          : fallbackSection || 'others';
      const sectionCards = cards.filter(
        (el) =>
          el.getAttribute('data-quill-section') === targetSection &&
          el.getAttribute('data-quill-note-id') !== draggedId
      );
      const cardIdx = sectionCards.indexOf(bestCard);
      const rect = bestCard.getBoundingClientRect();
      const afterCard = clientX > rect.left + rect.width / 2 || clientY > rect.top + rect.height * 0.65;
      return {
        targetSection,
        targetIndex: afterCard ? cardIdx + 1 : cardIdx
      };
    },
    []
  );

  const stopAutoScroll = useCallback(() => {
    autoScrollDeltaRef.current = 0;
    if (autoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const cleanupListeners = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    stopAutoScroll();
    dragRef.current = null;
    setDragState(null);
  }, [stopAutoScroll]);

  const scheduleAutoScroll = useCallback(
    (delta: number) => {
      autoScrollDeltaRef.current = delta;
      if (delta === 0) {
        stopAutoScroll();
        return;
      }
      if (autoScrollRafRef.current !== null) return;
      const tick = () => {
        const st = dragRef.current;
        const step = autoScrollDeltaRef.current;
        if (!st || !st.active || step === 0) {
          autoScrollRafRef.current = null;
          return;
        }
        window.scrollBy(0, step);
        const drop = computeDropTarget(st.currentX, st.currentY, st.noteId, st.sourceSection);
        st.targetSection = drop.targetSection;
        st.targetIndex = drop.targetIndex;
        setDragState((prev) =>
          prev
            ? {
                ...prev,
                targetSection: drop.targetSection,
                targetIndex: drop.targetIndex
              }
            : prev
        );
        autoScrollRafRef.current = window.requestAnimationFrame(tick);
      };
      autoScrollRafRef.current = window.requestAnimationFrame(tick);
    },
    [computeDropTarget, stopAutoScroll]
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const handlePointerMove = (e: PointerEvent) => {
      const st = dragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;

      st.currentX = e.clientX;
      st.currentY = e.clientY;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      const dist = Math.hypot(dx, dy);

      if (!st.active) {
        if (st.pointerType === 'touch') {
          if (dist > 8) {
            cleanupListeners();
          }
          return;
        }
        if (dist < 6) return;
        st.active = true;
      }

      e.preventDefault();

      // Smooth rAF edge auto-scroll (avoids scroll teleporting on high-frequency pointer events)
      if (e.clientY < 80) {
        scheduleAutoScroll(-8);
      } else if (e.clientY > window.innerHeight - 80) {
        scheduleAutoScroll(8);
      } else {
        scheduleAutoScroll(0);
      }

      const drop = computeDropTarget(e.clientX, e.clientY, st.noteId, st.sourceSection);
      st.targetSection = drop.targetSection;
      st.targetIndex = drop.targetIndex;

      setDragState({
        noteId: st.noteId,
        note: st.note,
        sourceSection: st.sourceSection,
        targetSection: drop.targetSection,
        targetIndex: drop.targetIndex,
        left: e.clientX - st.offsetX,
        top: e.clientY - st.offsetY,
        width: st.width
      });
    };

    const handlePointerUpOrCancel = (e: PointerEvent) => {
      const st = dragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      const wasActive = st.active;
      const finalMove: NoteReorderMove = {
        noteId: st.noteId,
        sourceSection: st.sourceSection,
        targetSection: st.targetSection ?? st.sourceSection,
        targetIndex: st.targetIndex ?? 0
      };
      cleanupListeners();
      if (wasActive) {
        lastDragEndAtRef.current = Date.now();
        if (e.type === 'pointerup') {
          onReorderRef.current?.(finalMove);
        }
      }
    };

    const handleScrollWhilePending = () => {
      const st = dragRef.current;
      if (st && !st.active) {
        cleanupListeners();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragRef.current?.active) {
        e.preventDefault();
        cleanupListeners();
      }
    };

    const handleWindowBlur = () => {
      if (dragRef.current) {
        cleanupListeners();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUpOrCancel);
    window.addEventListener('pointercancel', handlePointerUpOrCancel);
    window.addEventListener('scroll', handleScrollWhilePending, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUpOrCancel);
      window.removeEventListener('pointercancel', handlePointerUpOrCancel);
      window.removeEventListener('scroll', handleScrollWhilePending);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleWindowBlur);
      cleanupListeners();
    };
  }, [enabled, computeDropTarget, cleanupListeners, scheduleAutoScroll]);

  const getTileDragProps = useCallback(
    (
      note: QuillNote,
      section: NoteBoardSection
    ): { onPointerDown?: ((e: ReactPointerEvent<HTMLElement>) => void) | undefined } => {
      if (!enabled) return {};
      return {
        onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
          if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
          if (e.target instanceof Element && e.target.closest(INTERACTIVE_SELECTOR)) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const st: DragInternalState = {
            pointerId: e.pointerId,
            pointerType: e.pointerType || 'mouse',
            noteId: note.id,
            note,
            sourceSection: section,
            targetSection: section,
            targetIndex: 0,
            startX: e.clientX,
            startY: e.clientY,
            currentX: e.clientX,
            currentY: e.clientY,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            width: rect.width,
            active: false
          };
          dragRef.current = st;

          if (st.pointerType === 'touch') {
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
            }
            longPressTimerRef.current = setTimeout(() => {
              longPressTimerRef.current = null;
              const cur = dragRef.current;
              if (!cur || cur.pointerId !== st.pointerId) return;
              cur.active = true;
              try {
                navigator.vibrate?.(15);
              } catch {
                // ignore vibrate unsupported
              }
              const drop = computeDropTarget(
                cur.currentX,
                cur.currentY,
                cur.noteId,
                cur.sourceSection
              );
              cur.targetSection = drop.targetSection;
              cur.targetIndex = drop.targetIndex;
              setDragState({
                noteId: cur.noteId,
                note: cur.note,
                sourceSection: cur.sourceSection,
                targetSection: drop.targetSection,
                targetIndex: drop.targetIndex,
                left: cur.currentX - cur.offsetX,
                top: cur.currentY - cur.offsetY,
                width: cur.width
              });
            }, 250);
          }
        }
      };
    },
    [enabled, computeDropTarget]
  );

  const wasRecentlyDragging = useCallback(
    () => Date.now() - lastDragEndAtRef.current < 250,
    []
  );

  return {
    dragState,
    isDragging: Boolean(dragState),
    wasRecentlyDragging,
    getTileDragProps
  };
}
