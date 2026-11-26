import React from 'react';
import { CreditCard, Edit3, Plus, Trash2 } from 'lucide-react';
import { SectionCard, EmptyStateCard } from '../../components/HowardUI.jsx';
import { formatGBP } from '../../utils/householdHelpers.js';

export default function LedgerRecurringTab({
  filteredRecurring,
  recurringTypeFilter,
  onChangeTypeFilter,
  perspective,
  ownerMeta,
  committedMonthlyTotal,
  onOpenNewRecurring,
  onOpenEditRecurring,
  onToggleActive,
  onRequestDelete
}) {
  return (
    <SectionCard className="space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">
            Subscriptions &amp; Direct Debits ({filteredRecurring.length})
          </h2>
          <p className="text-xs text-text-muted">
            Showing {ownerMeta[perspective]?.label} • Committed monthly equivalent:{' '}
            <strong>{formatGBP(committedMonthlyTotal)}/mo</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {[
            { id: 'all', label: 'All Recurring' },
            { id: 'direct-debit', label: 'Direct Debits' },
            { id: 'subscription', label: 'Subscriptions' }
          ].map((flt) => (
            <button
              key={flt.id}
              type="button"
              onClick={() => onChangeTypeFilter(flt.id)}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold border active:scale-[0.98] transition cursor-pointer ${
                recurringTypeFilter === flt.id
                  ? 'bg-orange-700 text-white border-orange-700'
                  : 'bg-surface-subtle border-border-strong text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {flt.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => onOpenNewRecurring('direct-debit')}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-orange-700 hover:bg-orange-800 text-white text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-[0.98] transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New</span>
          </button>
        </div>
      </div>

      {filteredRecurring.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRecurring.map((item) => {
            const ownerInfo = ownerMeta[item.owner] || ownerMeta.joint;
            const isPaused = item.active === false;

            return (
              <div
                key={item.id}
                className={`rounded-2xl p-4 border flex flex-col justify-between gap-3 transition ${
                  isPaused
                    ? 'border-dashed border-border-strong bg-surface-muted/40'
                    : 'bg-surface-subtle border-border-subtle hover:border-border-strong'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-md ${ownerInfo.badgeClass}`}
                      >
                        {ownerInfo.badgeEmoji} {ownerInfo.shortLabel}
                      </span>
                      <span
                        className={`text-xs font-bold uppercase px-2 py-0.5 rounded-md ${
                          item.type === 'direct-debit'
                            ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                            : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                        }`}
                      >
                        {item.type === 'direct-debit' ? 'Direct Debit' : 'Subscription'}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-surface-muted text-text-secondary">
                        {item.category}
                      </span>
                      {isPaused && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-surface-muted text-text-secondary">
                          Paused
                        </span>
                      )}
                    </div>

                    <h3
                      className={`font-extrabold text-sm sm:text-base truncate ${
                        isPaused ? 'text-text-muted' : ''
                      }`}
                    >
                      {item.title}
                    </h3>
                    {item.notes && <p className="text-xs text-text-muted truncate">{item.notes}</p>}
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`text-base sm:text-lg font-extrabold ${
                        isPaused ? 'text-text-muted' : ''
                      }`}
                    >
                      {formatGBP(item.amount)}
                    </div>
                    <div className="text-xs text-text-muted capitalize">
                      {item.cycle}
                      {item.cycle !== 'monthly' && ` (${formatGBP(item.monthlyEquiv)}/mo)`}
                      {item.perspectiveShareFactor < 1 &&
                        ` • Your share: ${formatGBP(item.perspectiveMonthlyEquiv)}/mo`}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-border-subtle text-xs">
                  <div className="text-text-muted">
                    <strong>{item.scheduleLabel}</strong> • Next:{' '}
                    <strong className="text-text-primary">{item.nextDateFormatted}</strong> (
                    {item.daysUntil === 0 ? 'Today' : `${item.daysUntil}d`})
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onToggleActive(item)}
                      className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border active:scale-[0.98] transition cursor-pointer ${
                        isPaused
                          ? 'bg-orange-700 text-white border-orange-700'
                          : 'bg-surface-card border-border-strong text-text-primary hover:bg-surface-hover'
                      }`}
                    >
                      {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenEditRecurring(item)}
                      className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-text-muted hover:text-orange-700 dark:hover:text-orange-400 hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer"
                      title="Edit"
                      aria-label={`Edit ${item.title}`}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onRequestDelete({
                          kind: 'recurring',
                          id: item.id,
                          label: item.title
                        })
                      }
                      className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-text-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98] transition cursor-pointer"
                      title="Delete"
                      aria-label={`Delete ${item.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyStateCard
          accent="orange"
          icon={CreditCard}
          title="No subscriptions or Direct Debits match this filter"
          description="Add a household bill or personal subscription to track monthly commitments."
          action={
            <button
              type="button"
              onClick={() => onOpenNewRecurring('direct-debit')}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-orange-700 hover:bg-orange-800 text-white text-xs font-bold active:scale-[0.98] transition cursor-pointer"
            >
              + Add First Recurring Bill
            </button>
          }
        />
      )}
    </SectionCard>
  );
}
