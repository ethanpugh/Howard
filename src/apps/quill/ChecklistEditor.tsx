import { memo, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, FileText, Plus, X } from 'lucide-react';
import type { QuillChecklistItem } from '../../../shared/schemas/quill.ts';
import { QUILL_LIMITS, createChecklistItemId } from './quillConstants.ts';

export interface ChecklistEditorProps {
  items?: QuillChecklistItem[] | undefined;
  onChange: (items: QuillChecklistItem[]) => void;
  onConvertToText?: (() => void) | null | undefined;
  readOnly?: boolean | undefined;
  canToggle?: boolean | undefined;
}

function ChecklistEditor({
  items = [],
  onChange,
  onConvertToText,
  readOnly = false,
  canToggle = !readOnly
}: ChecklistEditorProps) {
  const baseId = useId();
  const [newItemText, setNewItemText] = useState('');
  const [showChecked, setShowChecked] = useState(true);
  const newInputRef = useRef<HTMLInputElement | null>(null);

  const uncheckedItems = items.filter((it) => !it.checked);
  const checkedItems = items.filter((it) => it.checked);

  const handleToggle = (itemId: string) => {
    if (!canToggle) return;
    onChange(
      items.map((it) => (it.id === itemId ? { ...it, checked: !it.checked } : it))
    );
  };

  const handleTextChange = (itemId: string, text: string) => {
    if (readOnly) return;
    onChange(
      items.map((it) =>
        it.id === itemId ? { ...it, text: text.slice(0, QUILL_LIMITS.maxItemTextLen) } : it
      )
    );
  };

  const handleDelete = (itemId: string) => {
    if (readOnly) return;
    onChange(items.filter((it) => it.id !== itemId));
  };

  const handleMove = (itemId: string, delta: number) => {
    if (readOnly) return;
    const group = uncheckedItems;
    const idx = group.findIndex((it) => it.id === itemId);
    const nextIdx = idx + delta;
    if (idx === -1 || nextIdx < 0 || nextIdx >= group.length) return;
    const reordered = [...group];
    const [moved] = reordered.splice(idx, 1);
    if (!moved) return;
    reordered.splice(nextIdx, 0, moved);
    onChange([...reordered, ...checkedItems]);
  };

  const handleAddItem = () => {
    if (readOnly) return;
    const cleaned = newItemText.trim().slice(0, QUILL_LIMITS.maxItemTextLen);
    if (!cleaned || items.length >= QUILL_LIMITS.maxItems) return;
    const next = [...items, { id: createChecklistItemId(), text: cleaned, checked: false }];
    onChange(next);
    setNewItemText('');
    window.requestAnimationFrame(() => newInputRef.current?.focus());
  };

  return (
    <div className="space-y-2.5">
      {!readOnly && onConvertToText && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onConvertToText}
            className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold text-text-secondary hover:bg-black/5 dark:hover:bg-white/10 inline-flex items-center gap-1 active:scale-[0.98] transition cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Convert to text note</span>
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {uncheckedItems.map((item, idx) => (
          <div
            key={item.id}
            className="flex items-center gap-2 px-2 py-1 rounded-xl bg-black/5 dark:bg-white/5"
          >
            <input
              type="checkbox"
              checked={false}
              disabled={!canToggle}
              onChange={() => handleToggle(item.id)}
              aria-label={`Mark "${item.text || 'item'}" complete`}
              className="w-4 h-4 accent-yellow-600 rounded cursor-pointer disabled:cursor-default shrink-0"
            />
            {readOnly ? (
              <span className="flex-1 text-base sm:text-sm py-1">{item.text}</span>
            ) : (
              <>
                <label htmlFor={`${baseId}-item-${item.id}`} className="sr-only">
                  Checklist item text
                </label>
                <input
                  id={`${baseId}-item-${item.id}`}
                  type="text"
                  value={item.text}
                  maxLength={QUILL_LIMITS.maxItemTextLen}
                  onChange={(e) => handleTextChange(item.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      newInputRef.current?.focus();
                    }
                  }}
                  placeholder="List item"
                  className="input-bare flex-1 min-w-0 bg-transparent border-0 text-base sm:text-sm py-1 focus:outline-hidden"
                />
              </>
            )}
            {!readOnly && (
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMove(item.id, -1)}
                  aria-label="Move item up"
                  className="min-w-[36px] min-h-[36px] p-1 rounded-xl text-text-muted hover:text-text-primary disabled:opacity-30 flex items-center justify-center active:scale-[0.98] cursor-pointer"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === uncheckedItems.length - 1}
                  onClick={() => handleMove(item.id, 1)}
                  aria-label="Move item down"
                  className="min-w-[36px] min-h-[36px] p-1 rounded-xl text-text-muted hover:text-text-primary disabled:opacity-30 flex items-center justify-center active:scale-[0.98] cursor-pointer"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  aria-label="Remove item"
                  className="min-w-[36px] min-h-[36px] p-1 rounded-xl text-text-muted hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center active:scale-[0.98] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {!readOnly && items.length < QUILL_LIMITS.maxItems && (
        <div className="flex items-center gap-2 px-2 py-1 rounded-xl border border-dashed border-border-strong">
          <Plus className="w-4 h-4 text-text-muted shrink-0" />
          <label htmlFor={`${baseId}-new-item`} className="sr-only">
            Add list item
          </label>
          <input
            ref={newInputRef}
            id={`${baseId}-new-item`}
            type="text"
            value={newItemText}
            maxLength={QUILL_LIMITS.maxItemTextLen}
            onChange={(e) => setNewItemText(e.target.value)}
            onBlur={() => {
              if (newItemText.trim()) handleAddItem();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddItem();
              }
            }}
            placeholder="Add list item..."
            className="input-bare flex-1 min-w-0 bg-transparent border-0 text-base sm:text-sm py-1 focus:outline-hidden"
          />
          {newItemText.trim() && (
            <button
              type="button"
              onClick={handleAddItem}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-slate-950 text-xs font-extrabold active:scale-[0.98] cursor-pointer"
            >
              Add
            </button>
          )}
        </div>
      )}

      {checkedItems.length > 0 && (
        <div className="pt-2 border-t border-border-subtle">
          <button
            type="button"
            aria-expanded={showChecked}
            onClick={() => setShowChecked((p) => !p)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-text-primary py-1 cursor-pointer"
          >
            {showChecked ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <span>
              {checkedItems.length} ticked item{checkedItems.length === 1 ? '' : 's'}
            </span>
          </button>

          {showChecked && (
            <div className="space-y-1 mt-1.5">
              {checkedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-2 py-1 rounded-xl opacity-70"
                >
                  <input
                    type="checkbox"
                    checked={true}
                    disabled={!canToggle}
                    onChange={() => handleToggle(item.id)}
                    aria-label={`Unmark "${item.text || 'item'}"`}
                    className="w-4 h-4 accent-yellow-600 rounded cursor-pointer disabled:cursor-default shrink-0"
                  />
                  <span className="flex-1 text-sm line-through break-words">{item.text}</span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      aria-label="Remove ticked item"
                      className="p-1 rounded-lg text-text-muted hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(ChecklistEditor);
