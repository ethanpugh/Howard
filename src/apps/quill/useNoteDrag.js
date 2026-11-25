import { useCallback, useEffect, useRef, useState } from 'react';

const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, label, [data-no-drag="true"]';

export function useNoteDrag({ enabled = true, onReorder }) {
  const [dragState, setDragState] = useState(null);
  const dragRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const lastDragEndAtRef = useRef(0);
  const onReorderRef = useRef(onReorder);

  useEffect(() => {
    onReorderRef.current = onReorder;
  }, [onReorder]);

  const computeDropTarget = useCallback((clientX, clientY, draggedId, fallbackSection) => {
    const cards = Array.from(document.querySelectorAll('[data-quill-note-id]'));
    let bestCard = null;
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
      const pinnedEl = document.querySelector('[data-quill-section="pinned"]');
      if (pinnedEl) {
        const rect = pinnedEl.getBoundingClientRect();
        if (clientY >= rect.top - 24 && clientY <= rect.bottom + 24) {
          return { targetSection: 'pinned', targetIndex: 0 };
        }
      }
      return { targetSection: fallbackSection || 'others', targetIndex: 0 };
    }

    const targetSection = bestCard.getAttribute('data-quill-section') || fallbackSection || 'others';
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
  }, []);

  const cleanupListeners = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    dragRef.current = null;
    setDragState(null);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const handlePointerMove = (e) => {
      const st = dragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;

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

      // Auto-scroll near viewport edges
      if (e.clientY < 80) {
        window.scrollBy(0, -12);
      } else if (e.clientY > window.innerHeight - 80) {
        window.scrollBy(0, 12);
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

    const handlePointerUpOrCancel = (e) => {
      const st = dragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      const wasActive = st.active;
      const finalMove = {
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

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && dragRef.current?.active) {
        e.preventDefault();
        cleanupListeners();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUpOrCancel);
    window.addEventListener('pointercancel', handlePointerUpOrCancel);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUpOrCancel);
      window.removeEventListener('pointercancel', handlePointerUpOrCancel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, computeDropTarget, cleanupListeners]);

  const getTileDragProps = useCallback(
    (note, section) => {
      if (!enabled) return {};
      return {
        onPointerDown: (e) => {
          if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
          if (e.target instanceof Element && e.target.closest(INTERACTIVE_SELECTOR)) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const st = {
            pointerId: e.pointerId,
            pointerType: e.pointerType || 'mouse',
            noteId: note.id,
            note,
            sourceSection: section,
            targetSection: section,
            targetIndex: 0,
            startX: e.clientX,
            startY: e.clientY,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            width: rect.width,
            active: false
          };
          dragRef.current = st;

          if (st.pointerType === 'touch') {
            longPressTimerRef.current = setTimeout(() => {
              if (!dragRef.current || dragRef.current.pointerId !== st.pointerId) return;
              dragRef.current.active = true;
              try {
                navigator.vibrate?.(15);
              } catch {
                // ignore vibrate unsupported
              }
              setDragState({
                noteId: st.noteId,
                note: st.note,
                sourceSection: st.sourceSection,
                targetSection: st.sourceSection,
                targetIndex: 0,
                left: rect.left,
                top: rect.top,
                width: rect.width
              });
            }, 250);
          }
        }
      };
    },
    [enabled]
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
