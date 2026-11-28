import { Check, Copy } from 'lucide-react';

export interface CopyButtonProps {
  isCopied?: boolean | undefined;
  onCopy: () => void;
  title: string;
  ariaLabel?: string | undefined;
  showLabel?: boolean | undefined;
}

/**
 * Shared copy-to-clipboard button for phone numbers and Wi-Fi credentials in Beacon.
 */
export default function CopyButton({
  isCopied = false,
  onCopy,
  title,
  ariaLabel,
  showLabel = false
}: CopyButtonProps) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className={`${
        showLabel ? 'min-h-[40px] px-3 py-1.5 gap-1.5 text-xs font-bold' : 'min-w-[40px] min-h-[40px]'
      } rounded-xl border inline-flex items-center justify-center shrink-0 transition active:scale-[0.98] cursor-pointer ${
        isCopied
          ? 'bg-emerald-700 text-white border-emerald-700'
          : 'bg-surface-card border-border-strong text-text-primary hover:bg-surface-hover'
      }`}
      title={title}
      aria-label={ariaLabel || title}
    >
      {isCopied ? (
        <>
          <Check className={showLabel ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          {showLabel && <span>Copied</span>}
        </>
      ) : (
        <>
          <Copy className={showLabel ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          {showLabel && <span>Copy</span>}
        </>
      )}
    </button>
  );
}
