import { CheckCircle2, Moon, Sun } from 'lucide-react';
import type { CadenceDose } from '../../../shared/schemas/cadence.ts';
import { Button, IconBadge } from '../../components/HowardUI.tsx';
import { formatTimeDisplay } from '../../utils/householdHelpers.ts';

export interface QuickDoseCardProps {
  slot: 'morning' | 'evening';
  dose?: CadenceDose | null | undefined;
  targetTime: string;
  caregiverLabel: string;
  quickActionPending: boolean;
  onQuickRecordDose: (slot: 'morning' | 'evening', note?: string) => void | Promise<void>;
  onNavigateCadence: () => void;
}

/**
 * Parameterized Morning/Evening quick check-in card for Foyer's Cadence widget.
 */
export default function QuickDoseCard({
  slot,
  dose,
  targetTime,
  caregiverLabel,
  quickActionPending,
  onQuickRecordDose,
  onNavigateCadence
}: QuickDoseCardProps) {
  const isMorning = slot === 'morning';
  const SlotIcon = isMorning ? Sun : Moon;
  const title = isMorning ? 'Morning Dose' : 'Evening Dose';
  const isGiven = Boolean(dose?.given);
  const timeDisplay = formatTimeDisplay(dose?.timestamp);
  const givenBy = dose?.givenBy?.trim() || '';

  return (
    <div
      className={`rounded-2xl p-3.5 sm:p-4 border-2 flex flex-col justify-between gap-3 transition ${
        isGiven
          ? 'bg-emerald-500/10 border-emerald-500/35'
          : 'bg-surface-subtle border-border-subtle'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <IconBadge
            icon={SlotIcon}
            accent="purple"
            size="md"
            className={isGiven ? '!bg-emerald-700 !text-white' : ''}
          />
          <div className="min-w-0">
            <div className="font-bold text-sm flex flex-wrap items-center gap-1.5">
              <span>{title}</span>
              <span className="text-xs text-text-muted font-semibold tabular-nums">
                {isMorning ? 'AM' : 'PM'} • ~{targetTime}
              </span>
            </div>
            <div className="text-xs text-text-muted break-words tabular-nums">
              {isGiven
                ? `Given${timeDisplay ? ` at ${timeDisplay}` : ''}${givenBy ? ` by ${givenBy}` : ''}`
                : `Awaiting ${isMorning ? 'morning' : 'evening'} dose`}
            </div>
          </div>
        </div>

        <span
          className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase shrink-0 ${
            isGiven
              ? 'bg-emerald-700 text-white'
              : 'bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-500/25'
          }`}
        >
          {isGiven ? 'Done' : 'Pending'}
        </span>
      </div>

      {isGiven ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">
          <span className="min-w-0">✓ {title} recorded</span>
          <button
            type="button"
            onClick={onNavigateCadence}
            className="min-h-[36px] inline-flex items-center px-2 underline cursor-pointer shrink-0"
          >
            Edit in Cadence
          </button>
        </div>
      ) : (
        <Button
          variant="primary"
          accent="purple"
          size="lg"
          icon={CheckCircle2}
          disabled={quickActionPending}
          onClick={() => void onQuickRecordDose(slot)}
          className="w-full"
        >
          <span>
            Log {isMorning ? 'AM' : 'PM'} Dose ({caregiverLabel})
          </span>
        </Button>
      )}
    </div>
  );
}
