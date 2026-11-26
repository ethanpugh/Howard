import React from 'react';
import { Flower2, Palette, Ruler, Sparkles } from 'lucide-react';
import { EmptyStateCard, SectionCard, SubSurface } from '../../components/HowardUI.jsx';
import { formatFriendlyDate } from '../../utils/householdHelpers.js';
import { INSTAR_STAGES } from './bloomConstants.js';
import { DeleteIconButton } from './BloomSharedParts.jsx';

export default function BloomGrowthTab({
  settings,
  summary,
  todayKey,
  canConfigure,
  isPending,
  pronounPossessive,
  onOpenMoltModal,
  onRequestDelete
}) {
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Visual Instar Progression Ladder */}
      <SectionCard className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold">
              {settings.mantisName}&apos;s Instar Progression
            </h2>
            <p className="text-xs text-text-muted">
              Day {summary.daysInCurrentInstar} in {settings.currentInstar} • Avg inter-molt cadence:
              ~{summary.avgInterMoltDays} days
              {summary.projectedNextMoltDateStr
                ? ` • Next molt window around ${formatFriendlyDate(summary.projectedNextMoltDateStr, todayKey)}`
                : ' • Final winged adult stage reached!'}
            </p>
          </div>
          {canConfigure && (
            <button
              type="button"
              onClick={onOpenMoltModal}
              className="min-h-[40px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs active:scale-[0.98] transition cursor-pointer shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>Log New Molt</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-9 gap-1.5">
          {INSTAR_STAGES.map((stage, idx) => {
            const currentIdx = INSTAR_STAGES.indexOf(settings.currentInstar);
            const isCurrent = stage === settings.currentInstar;
            const isPassed = currentIdx !== -1 && idx < currentIdx;
            return (
              <div
                key={stage}
                className={`p-2 sm:p-2.5 rounded-2xl border text-center transition ${
                  isCurrent
                    ? 'bg-emerald-700 text-white border-emerald-800 ring-2 ring-emerald-500/40 font-extrabold'
                    : isPassed
                      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-800 dark:text-emerald-300 font-bold'
                      : 'bg-surface-subtle border-border-subtle text-text-muted'
                }`}
              >
                <div className="text-xs">{stage}</div>
                <div
                  className={`text-xs mt-0.5 ${
                    isCurrent
                      ? 'text-emerald-100'
                      : isPassed
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-text-muted'
                  }`}
                >
                  {isCurrent
                    ? 'Current'
                    : isPassed
                      ? '✓ Shed'
                      : stage === 'Adult'
                        ? 'Winged'
                        : 'Upcoming'}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Molt Milestones History (8 cols) */}
        <SectionCard className="lg:col-span-8 space-y-3.5">
          <h3 className="text-base font-extrabold">
            Recorded Molts &amp; Growth Milestones ({summary.molts.length})
          </h3>

          {summary.molts.length === 0 ? (
            <EmptyStateCard
              accent="emerald"
              icon={Sparkles}
              title={`No molts logged yet for ${settings.mantisName}`}
              description={`When ${settings.mantisName} sheds ${pronounPossessive} exuvia, log the molt milestone to advance ${pronounPossessive} instar and start the post-molt hardening timer.`}
              action={
                canConfigure ? (
                  <button
                    type="button"
                    onClick={onOpenMoltModal}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold inline-flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Log First Molt</span>
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="space-y-2.5">
              {summary.molts.map((m) => (
                <SubSurface
                  key={m.id}
                  className="p-3.5 flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1 break-words">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-700 text-white">
                        {m.fromInstar} &rarr; {m.toInstar}
                      </span>
                      <span className="text-xs font-bold">
                        {formatFriendlyDate(m.dateKey, todayKey)} ({m.dateKey})
                      </span>
                      {m.lengthMm && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 tabular-nums">
                          <Ruler className="w-3 h-3 shrink-0" />
                          <span>{m.lengthMm} mm</span>
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                          m.quality === 'clean'
                            ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                            : 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {m.quality === 'clean'
                          ? 'Clean Exuvia'
                          : m.quality === 'minor_issue'
                            ? 'Minor Snag'
                            : 'Mismolt Note'}
                      </span>
                    </div>
                    {m.colorShift && (
                      <div className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 shrink-0" />
                        <span>Colour/Pattern: {m.colorShift}</span>
                      </div>
                    )}
                    {m.note && <p className="text-xs text-text-secondary">{m.note}</p>}
                    <div className="text-xs text-text-muted">Logged by {m.loggedBy}</div>
                  </div>

                  {canConfigure && (
                    <DeleteIconButton
                      disabled={isPending}
                      title="Delete molt record"
                      ariaLabel="Delete molt record"
                      onClick={() =>
                        onRequestDelete({
                          kind: 'molt',
                          id: m.id,
                          label: `${m.fromInstar} → ${m.toInstar} molt on ${m.dateKey}`
                        })
                      }
                    />
                  )}
                </SubSurface>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Species Reference Card (4 cols) */}
        <SectionCard className="lg:col-span-4 space-y-3 text-xs">
          <div className="font-extrabold text-sm flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <Flower2 className="w-4 h-4 shrink-0" />
            <span>{settings.commonName || 'Mantis'} Keeper Notes</span>
          </div>
          <div className="space-y-2.5 leading-relaxed text-text-secondary">
            <p>
              <strong>Male Growth Path:</strong> Male{' '}
              <em>{settings.scientificName || settings.commonName || 'your mantis'}</em> typically
              mature in <strong>6–7 molts</strong> (one molt quicker than females), developing long
              antennae, agile flight wings, and characteristic adult markings!
            </p>
            <p>
              <strong>Counting Segments (L4+):</strong> Males show <strong>8</strong> underside
              abdominal segments (ending in a slimmer terminal segment), whereas females show{' '}
              <strong>6</strong> broader segments and a larger spiny sub-adult pronotum.
            </p>
            <p>
              <strong>Molt Clearance:</strong> Always ensure at least{' '}
              <strong>3× body length</strong> of unobstructed vertical drop beneath the soft mesh
              lid so {settings.mantisName} can slide cleanly out of {pronounPossessive} old skin.
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
