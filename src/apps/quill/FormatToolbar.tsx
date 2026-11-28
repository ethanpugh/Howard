import { memo } from 'react';
import {
  Bold,
  CheckSquare,
  Code,
  Eye,
  Heading,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Strikethrough,
  type LucideIcon
} from 'lucide-react';
import type { MarkdownFormatType } from './quillHelpers.ts';

export interface FormatToolbarProps {
  onFormat?: ((formatType: MarkdownFormatType) => void) | undefined;
  isPreview?: boolean | undefined;
  onTogglePreview?: (() => void) | undefined;
  onConvertToChecklist?: (() => void) | undefined;
}

function FormatToolbar({
  onFormat,
  isPreview = false,
  onTogglePreview,
  onConvertToChecklist
}: FormatToolbarProps) {
  const buttons: Array<{ id: MarkdownFormatType; label: string; icon: LucideIcon }> = [
    { id: 'bold', label: 'Bold (Ctrl+B)', icon: Bold },
    { id: 'italic', label: 'Italic (Ctrl+I)', icon: Italic },
    { id: 'strike', label: 'Strikethrough', icon: Strikethrough },
    { id: 'code', label: 'Inline code', icon: Code },
    { id: 'heading', label: 'Heading', icon: Heading },
    { id: 'ul', label: 'Bullet list', icon: List },
    { id: 'ol', label: 'Numbered list', icon: ListOrdered },
    { id: 'link', label: 'Insert link', icon: Link2 }
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-xl border border-border-subtle bg-surface-subtle/80">
      {!isPreview &&
        buttons.map((btn) => {
          const Icon = btn.icon;
          return (
            <button
              key={btn.id}
              type="button"
              onClick={() => onFormat?.(btn.id)}
              title={btn.label}
              aria-label={btn.label}
              className="min-w-[36px] min-h-[36px] p-1.5 rounded-xl text-text-secondary hover:bg-surface-hover hover:text-text-primary flex items-center justify-center active:scale-[0.98] transition cursor-pointer"
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}

      <div className="ml-auto flex items-center gap-1">
        {onTogglePreview && (
          <button
            type="button"
            aria-pressed={isPreview}
            onClick={onTogglePreview}
            className={`min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-bold inline-flex items-center gap-1 active:scale-[0.98] transition cursor-pointer ${
              isPreview
                ? 'bg-yellow-400 text-slate-950'
                : 'text-text-secondary hover:bg-surface-hover'
            }`}
          >
            {isPreview ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{isPreview ? 'Edit' : 'Preview'}</span>
          </button>
        )}
        {onConvertToChecklist && (
          <button
            type="button"
            onClick={onConvertToChecklist}
            title="Convert to checklist"
            className="min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-bold text-text-secondary hover:bg-surface-hover inline-flex items-center gap-1 active:scale-[0.98] transition cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Checklist</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(FormatToolbar);
