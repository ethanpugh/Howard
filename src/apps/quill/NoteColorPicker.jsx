import React, { memo } from 'react';
import { Check } from 'lucide-react';
import { QUILL_COLORS } from './quillConstants.js';

function NoteColorPicker({ value = 'default', onChange, compact = false }) {
  return (
    <div
      className={`grid ${compact ? 'grid-cols-6 gap-1.5' : 'grid-cols-6 sm:grid-cols-12 gap-1.5'}`}
      role="radiogroup"
      aria-label="Note colour"
    >
      {QUILL_COLORS.map((col) => {
        const selected = col.key === value;
        return (
          <button
            key={col.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={col.label}
            title={col.label}
            onClick={(e) => {
              e.stopPropagation();
              onChange?.(col.key);
            }}
            className={`w-7 h-7 rounded-full border flex items-center justify-center transition cursor-pointer active:scale-95 ${
              col.swatchClass
            } ${
              selected
                ? 'border-yellow-500 dark:border-yellow-400 ring-2 ring-yellow-400/45 scale-105'
                : 'border-border-strong hover:scale-105'
            }`}
          >
            {selected && <Check className="w-3.5 h-3.5 text-text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

export default memo(NoteColorPicker);
