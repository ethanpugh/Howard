import React, { useEffect, useId, useRef } from 'react';
import {
  ArrowRight,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { WEEKDAY_OPTIONS } from '../utils/householdHelpers.js';

export const MODULE_ACCENTS = {
  teal: {
    iconBg: 'bg-teal-500/15 text-teal-800 dark:text-teal-300',
    solidBtn: 'bg-teal-700 hover:bg-teal-800 text-white',
    activeTab: 'bg-teal-700 text-white shadow-xs',
    badge:
      'bg-teal-500/15 text-teal-800 dark:text-teal-300 border border-teal-500/25',
    openPill:
      'border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 text-teal-800 dark:text-teal-300',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-teal-500',
    focusVisibleRing:
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500',
    borderSoft: 'border-teal-500/35'
  },
  purple: {
    iconBg: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
    solidBtn: 'bg-purple-600 hover:bg-purple-700 text-white',
    activeTab: 'bg-purple-600 text-white shadow-xs',
    badge:
      'bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-500/25',
    openPill:
      'border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-800 dark:text-purple-300',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500',
    focusVisibleRing:
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-500',
    borderSoft: 'border-purple-500/35'
  },
  emerald: {
    iconBg: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
    solidBtn: 'bg-emerald-700 hover:bg-emerald-800 text-white',
    activeTab: 'bg-emerald-700 text-white shadow-xs',
    badge:
      'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25',
    openPill:
      'border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500',
    focusVisibleRing:
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500',
    borderSoft: 'border-emerald-500/35'
  },
  indigo: {
    iconBg: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    solidBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    activeTab: 'bg-indigo-600 text-white shadow-xs',
    badge:
      'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border border-indigo-500/25',
    openPill:
      'border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
    focusVisibleRing:
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500',
    borderSoft: 'border-indigo-500/35'
  },
  rose: {
    iconBg: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    solidBtn: 'bg-rose-600 hover:bg-rose-700 text-white',
    activeTab: 'bg-rose-600 text-white shadow-xs',
    badge:
      'bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/25',
    openPill:
      'border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-800 dark:text-rose-300',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-rose-500',
    focusVisibleRing:
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500',
    borderSoft: 'border-rose-500/35'
  },
  amber: {
    iconBg: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
    solidBtn: 'bg-amber-700 hover:bg-amber-800 text-white',
    activeTab: 'bg-amber-700 text-white shadow-xs',
    badge:
      'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/25',
    openPill:
      'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500',
    focusVisibleRing:
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500',
    borderSoft: 'border-amber-500/35'
  },
  sky: {
    iconBg: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
    solidBtn: 'bg-sky-700 hover:bg-sky-800 text-white',
    activeTab: 'bg-sky-700 text-white shadow-xs',
    badge:
      'bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/25',
    openPill:
      'border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-800 dark:text-sky-300',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:border-sky-500',
    focusVisibleRing:
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-500',
    borderSoft: 'border-sky-500/35'
  }
};

export function getAccentMeta(accent = 'teal') {
  return MODULE_ACCENTS[accent] || MODULE_ACCENTS.teal;
}

export function getFieldClass(accent = 'teal', extraClass = '', options = {}) {
  const { focusRing } = getAccentMeta(accent);
  const padClass = options?.compact ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5';
  const base = `w-full min-w-0 ${padClass} rounded-xl border border-border-strong bg-surface-input text-text-primary text-base sm:text-sm transition ${focusRing}`;
  return extraClass ? `${base} ${extraClass}` : base;
}

/**
 * Primary elevated container card (replaces repeated outer white/slate-900 card boilerplate).
 */
export function SectionCard({ as = 'section', className = '', children, ...rest }) {
  const Tag = as;
  return (
    <Tag
      className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-border-subtle bg-surface-card text-text-primary shadow-xs ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Secondary nested surface panel inside cards.
 */
export function SubSurface({ as = 'div', className = '', children, ...rest }) {
  const Tag = as;
  return (
    <Tag
      className={`rounded-2xl border border-border-subtle bg-surface-subtle text-text-primary ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function IconBadge({
  icon: Icon,
  accent = 'teal',
  size = 'md',
  className = '',
  iconClassName = ''
}) {
  if (!Icon) return null;
  const accentMeta = getAccentMeta(accent);
  const sizeClass =
    size === 'sm'
      ? 'w-9 h-9 rounded-xl'
      : size === 'lg'
        ? 'w-11 h-11 rounded-2xl'
        : 'w-10 h-10 rounded-2xl';
  return (
    <div
      className={`${sizeClass} flex items-center justify-center shrink-0 ${accentMeta.iconBg} ${className}`.trim()}
    >
      <Icon className={`w-5 h-5 ${iconClassName}`.trim()} />
    </div>
  );
}

export function StatusPill({ accent = 'teal', className = '', children }) {
  const accentMeta = getAccentMeta(accent);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold ${accentMeta.badge} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

export function OpenModulePill({
  accent = 'teal',
  onClick,
  desktopLabel = 'Open',
  mobileLabel = 'Open',
  title,
  ariaLabel,
  className = ''
}) {
  const accentMeta = getAccentMeta(accent);
  const hasResponsiveText = desktopLabel !== mobileLabel;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || title || desktopLabel}
      title={title || desktopLabel}
      className={`min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl border inline-flex items-center gap-1 text-xs font-bold cursor-pointer shrink-0 whitespace-nowrap active:scale-[0.98] transition ${accentMeta.openPill} ${accentMeta.focusVisibleRing} ${className}`.trim()}
    >
      {hasResponsiveText ? (
        <>
          <span className="sm:hidden">{mobileLabel}</span>
          <span className="hidden sm:inline">{desktopLabel}</span>
        </>
      ) : (
        <span>{desktopLabel}</span>
      )}
      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
    </button>
  );
}

export function ModuleHeader({
  accent = 'teal',
  icon: Icon,
  title,
  subtitle,
  badges = null,
  actions = null,
  compactActions = false,
  footer = null,
  className = ''
}) {
  const accentMeta = getAccentMeta(accent);

  return (
    <section
      className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-border-subtle bg-surface-card text-text-primary shadow-xs ${className}`.trim()}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div
          className={`flex items-start sm:items-center gap-3 flex-1 ${
            compactActions ? 'min-w-0' : 'min-w-[220px] sm:min-w-[260px]'
          }`}
        >
          {Icon && (
            <div
              className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 ${accentMeta.iconBg}`}
            >
              <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight leading-tight break-words">
                {title}
              </h1>
              {badges}
            </div>
            {subtitle && (
              <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div
            className={`flex flex-wrap items-center gap-2 shrink-0 ${
              compactActions
                ? 'w-auto justify-end'
                : 'w-full sm:w-auto justify-start sm:justify-end'
            }`}
          >
            {actions}
          </div>
        )}
      </div>

      {footer && <div className="mt-3">{footer}</div>}
    </section>
  );
}

const TAB_GRID_COLS = {
  2: 'grid grid-cols-2',
  3: 'grid grid-cols-3',
  4: 'grid grid-cols-2 sm:grid-cols-4'
};

export function SegmentedTabs({
  tabs = [],
  activeId,
  onChange,
  accent = 'teal',
  className = ''
}) {
  const accentMeta = getAccentMeta(accent);
  const tabRefs = useRef([]);
  const isFourOrMore = tabs.length >= 4;
  const layoutClass =
    TAB_GRID_COLS[tabs.length] || 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5';
  const shortHideClass = isFourOrMore ? 'xl:hidden truncate' : 'sm:hidden truncate';
  const longShowClass = isFourOrMore ? 'hidden xl:inline truncate' : 'hidden sm:inline truncate';

  const handleKeyDown = (event, index) => {
    if (!tabs.length) return;
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      const targetTab = tabs[nextIndex];
      if (targetTab) {
        onChange?.(targetTab.id);
        tabRefs.current[nextIndex]?.focus?.();
      }
    }
  };

  return (
    <div
      role="tablist"
      className={`p-1 rounded-2xl border border-border-subtle bg-surface-tray gap-1 ${layoutClass} ${className}`.trim()}
    >
      {tabs.map((tab, index) => {
        const TabIcon = tab.icon;
        const isActive = activeId === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            tabIndex={isActive ? 0 : -1}
            aria-selected={isActive}
            onClick={() => onChange?.(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`min-h-[40px] ${
              tabs.length === 3 ? 'px-1.5 sm:px-3.5 gap-1 sm:gap-1.5' : 'px-2.5 sm:px-3.5 gap-1.5'
            } py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center transition cursor-pointer active:scale-[0.98] ${
              accentMeta.focusVisibleRing
            } ${
              isActive
                ? accentMeta.activeTab
                : 'text-text-secondary hover:bg-surface-hover'
            }`}
          >
            {TabIcon && <TabIcon className="w-4 h-4 shrink-0" />}
            {tab.shortLabel ? (
              <>
                <span className={shortHideClass}>{tab.shortLabel}</span>
                <span className={longShowClass}>{tab.label}</span>
              </>
            ) : (
              <span className="truncate">{tab.label}</span>
            )}
            {tab.badge !== undefined && tab.badge !== null && tab.badge !== '' && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[11px] font-extrabold leading-none shrink-0 ${
                  isActive
                    ? 'bg-black/20 text-white'
                    : 'bg-surface-muted text-text-secondary'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const openModalStack = [];
let previousBodyOverflow = '';

export function getOpenModalCount() {
  return openModalStack.length;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ModalShell({
  isOpen,
  onClose,
  title,
  subtitle = '',
  icon: Icon = null,
  accent = 'teal',
  maxWidthClass = 'max-w-lg',
  zIndexClass = 'z-50',
  variant = 'dialog',
  disableBackdropClose = false,
  footer = null,
  children,
  ariaLabel
}) {
  const modalId = useId();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const disableCloseRef = useRef(disableBackdropClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    disableCloseRef.current = disableBackdropClose;
  }, [disableBackdropClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openModalStack.push(modalId);
    if (openModalStack.length === 1) {
      previousBodyOverflow = document.body.style.overflow || '';
      document.body.style.overflow = 'hidden';
    }

    const focusTimer = window.requestAnimationFrame(() => {
      const dialogEl = dialogRef.current;
      if (!dialogEl) return;
      if (!dialogEl.contains(document.activeElement)) {
        const firstFocusable = dialogEl.querySelector(FOCUSABLE_SELECTOR);
        if (firstFocusable instanceof HTMLElement) {
          firstFocusable.focus();
        } else {
          dialogEl.focus();
        }
      }
    });

    const handleKeyDown = (event) => {
      if (openModalStack[openModalStack.length - 1] !== modalId) return;

      if (event.key === 'Escape') {
        if (!disableCloseRef.current) {
          event.preventDefault();
          onCloseRef.current?.();
        }
        return;
      }

      if (event.key === 'Tab') {
        const dialogEl = dialogRef.current;
        if (!dialogEl) return;
        const focusables = Array.from(dialogEl.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
          (el) => el instanceof HTMLElement && el.offsetParent !== null
        );
        if (focusables.length === 0) {
          event.preventDefault();
          dialogEl.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || !dialogEl.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      const idx = openModalStack.lastIndexOf(modalId);
      if (idx !== -1) openModalStack.splice(idx, 1);
      if (openModalStack.length === 0) {
        document.body.style.overflow = previousBodyOverflow;
      }
      if (opener && opener.isConnected && opener !== document.body) {
        opener.focus?.();
      }
    };
  }, [isOpen, modalId]);

  if (!isOpen) return null;

  const accentMeta = getAccentMeta(accent);
  const isSheet = variant === 'sheet';

  return (
    <div
      onClick={() => {
        if (!disableBackdropClose) {
          onClose?.();
        }
      }}
      className={`fixed inset-0 ${zIndexClass} bg-slate-950/60 backdrop-blur-xs flex ${
        isSheet ? 'items-end sm:items-center sm:p-4' : 'items-center p-3 sm:p-4'
      } justify-center no-print`}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || (typeof title === 'string' ? title : 'Dialog')}
        className={`${maxWidthClass} w-full ${
          isSheet
            ? 'max-h-[85dvh] sm:max-h-[calc(100dvh-3rem)] rounded-t-3xl sm:rounded-3xl'
            : 'max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] rounded-2xl sm:rounded-3xl'
        } shadow-2xl border border-border-subtle bg-surface-card text-text-primary flex flex-col overflow-hidden focus:outline-hidden`}
      >
        {isSheet && (
          <div className="sm:hidden w-10 h-1 rounded-full bg-surface-raised mx-auto mt-2.5 -mb-1 shrink-0" />
        )}

        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {Icon && (
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${accentMeta.iconBg}`}
              >
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg font-extrabold leading-tight line-clamp-2">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{subtitle}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={disableBackdropClose}
            onClick={() => onClose?.()}
            aria-label={`Close ${ariaLabel || (typeof title === 'string' ? title : 'dialog')}`}
            className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center bg-surface-subtle text-text-secondary hover:bg-surface-hover transition cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${accentMeta.focusVisibleRing}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className={`overflow-y-auto px-4 sm:px-6 py-4 space-y-4 flex-1 ${
            isSheet ? 'pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-4' : ''
          }`}
        >
          {children}
        </div>

        {footer && (
          <div className="px-4 sm:px-6 py-3 border-t border-border-subtle shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Shared accessible confirmation modal replacing duplicated delete/confirm prompts across apps.
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle = '',
  message = '',
  icon = null,
  accent = 'rose',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = true,
  isPending = false,
  zIndexClass = 'z-50',
  maxWidthClass = 'max-w-md',
  children = null
}) {
  const accentMeta = getAccentMeta(accent);
  const confirmClass = danger
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : accentMeta.solidBtn;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={icon}
      accent={danger ? 'rose' : accent}
      zIndexClass={zIndexClass}
      maxWidthClass={maxWidthClass}
      disableBackdropClose={isPending}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-surface-subtle text-text-primary hover:bg-surface-hover active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold shadow-xs active:scale-[0.98] transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${confirmClass}`}
          >
            {confirmText}
          </button>
        </div>
      }
    >
      {message && (
        <p className="text-sm text-text-secondary leading-relaxed">{message}</p>
      )}
      {children}
    </ModalShell>
  );
}

/**
 * Shared Mon-Sun weekly pager & history container used by Cadence & Bloom.
 */
export function WeeklyHistoryPanel({
  ariaLabel = 'Weekly History',
  icon: Icon,
  iconClassName = '',
  title,
  subtitle,
  summaryBadge = null,
  weekNav,
  todayKey,
  accent = 'teal',
  jumpLabel = 'Jump to date:',
  children
}) {
  return (
    <SectionCard aria-label={ariaLabel} className="space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <div className="w-10 h-10 rounded-2xl bg-surface-subtle flex items-center justify-center shrink-0">
              <Icon className={`w-5 h-5 ${iconClassName}`.trim()} />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-extrabold text-sm sm:text-base">{title}</h3>
            {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
          </div>
        </div>
        {summaryBadge}
      </div>

      <SubSurface className="flex flex-col lg:flex-row lg:items-center flex-wrap justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 min-w-0">
          <button
            type="button"
            onClick={weekNav.goPrevWeek}
            className="min-w-[40px] min-h-[40px] p-2 rounded-xl border border-border-strong bg-surface-card hover:bg-surface-hover flex items-center justify-center active:scale-[0.98] transition cursor-pointer shrink-0"
            title="Previous week (Mon–Sun)"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 px-1.5 min-w-0">
            <CalendarIcon className="w-4 h-4 text-text-muted shrink-0 hidden sm:block" />
            <span className="text-xs sm:text-sm font-bold truncate">
              {weekNav.weekRangeLabel}
            </span>
            {weekNav.isCurrentWeek ? (
              <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-muted text-text-secondary whitespace-nowrap shrink-0">
                This Week
              </span>
            ) : (
              <button
                type="button"
                onClick={weekNav.goThisWeek}
                className="min-h-[36px] text-xs font-bold px-2.5 py-1 rounded-lg bg-surface-muted hover:bg-surface-hover-strong text-text-primary transition active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0"
              >
                Jump to This Week
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={weekNav.goNextWeek}
            disabled={weekNav.isCurrentWeek}
            className={`min-w-[40px] min-h-[40px] p-2 rounded-xl border border-border-strong bg-surface-card flex items-center justify-center transition shrink-0 ${
              weekNav.isCurrentWeek
                ? 'opacity-35 cursor-not-allowed'
                : 'hover:bg-surface-hover active:scale-[0.98] cursor-pointer'
            }`}
            title="Next week (Mon–Sun)"
            aria-label="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <label
            htmlFor={`${ariaLabel.replace(/\s+/g, '-').toLowerCase()}-jump`}
            className="text-xs font-semibold text-text-muted whitespace-nowrap"
          >
            {jumpLabel}
          </label>
          <input
            id={`${ariaLabel.replace(/\s+/g, '-').toLowerCase()}-jump`}
            type="date"
            max={todayKey}
            value={weekNav.activeWeekMonday}
            onChange={(e) => {
              if (e.target.value) weekNav.jumpToDate(e.target.value);
            }}
            className={getFieldClass(accent, 'w-auto sm:w-40 min-h-[40px] font-medium', {
              compact: true
            })}
          />
        </div>
      </SubSurface>

      {children}
    </SectionCard>
  );
}

/**
 * Shared Mon-Sun monthly calendar + xl:col-span-4 inspector shell used by Almanac & Floodgate.
 */
export function MonthCalendarLayout({
  monthLabel,
  onPrevMonth,
  onNextMonth,
  onResetCurrentMonth,
  showResetMonth = false,
  resetLabel = 'Today',
  headerRight = null,
  legend = null,
  cells = [],
  renderCell,
  inspectorTitle = 'Selected Date',
  inspectorDateLabel,
  inspectorAction = null,
  inspectorChildren,
  inspectorClassName = '',
  titleAccentClass = 'text-indigo-600 dark:text-indigo-400',
  subtitle = null
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5">
      <SectionCard className="xl:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold">{monthLabel}</h2>
            {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {headerRight}
            <button
              type="button"
              onClick={onPrevMonth}
              aria-label="Previous Month"
              className="min-w-[40px] min-h-[40px] p-2 rounded-xl border border-border-strong hover:bg-surface-hover flex items-center justify-center active:scale-[0.98] transition cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {showResetMonth && (
              <button
                type="button"
                onClick={onResetCurrentMonth}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-border-strong bg-surface-card hover:bg-surface-hover text-xs font-bold active:scale-[0.98] transition cursor-pointer"
              >
                {resetLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onNextMonth}
              aria-label="Next Month"
              className="min-w-[40px] min-h-[40px] p-2 rounded-xl border border-border-strong hover:bg-surface-hover flex items-center justify-center active:scale-[0.98] transition cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {legend && <div className="mb-3">{legend}</div>}

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-xs font-bold text-text-muted mb-2">
          {WEEKDAY_OPTIONS.map((d) => (
            <div key={d.id} className="py-1">
              {d.shortLabel}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {cells.map((cell, idx) => renderCell(cell, idx))}
        </div>
      </SectionCard>

      <SectionCard
        className={`xl:col-span-4 flex flex-col justify-between space-y-3.5 sm:space-y-4 ${inspectorClassName}`.trim()}
      >
        <div className="space-y-3.5 sm:space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <span className={`text-xs font-bold uppercase tracking-wider ${titleAccentClass}`}>
                {inspectorTitle}
              </span>
              <h3 className="text-base sm:text-lg font-extrabold">{inspectorDateLabel}</h3>
            </div>
            {inspectorAction}
          </div>
          {inspectorChildren}
        </div>
      </SectionCard>
    </div>
  );
}

export function EmptyStateCard({
  icon: Icon = null,
  title,
  description = '',
  action = null,
  accent = 'teal',
  className = ''
}) {
  const accentMeta = getAccentMeta(accent);

  return (
    <div
      className={`rounded-2xl border border-dashed border-border-strong bg-surface-subtle/60 text-text-secondary p-6 sm:p-8 text-center space-y-2.5 ${className}`.trim()}
    >
      {Icon && (
        <div
          className={`w-11 h-11 rounded-2xl mx-auto flex items-center justify-center ${accentMeta.iconBg}`}
        >
          <Icon className="w-5 h-5" />
        </div>
      )}
      {title && (
        <div className="text-sm sm:text-base font-extrabold text-text-primary">{title}</div>
      )}
      {description && (
        <p className="text-xs text-text-muted max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="pt-1 flex justify-center">{action}</div>}
    </div>
  );
}
