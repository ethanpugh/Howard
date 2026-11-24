import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export const MODULE_ACCENTS = {
  teal: {
    iconBg: 'bg-teal-500/15 text-teal-800 dark:text-teal-300',
    solidBtn: 'bg-teal-700 hover:bg-teal-800 text-white',
    activeTab: 'bg-teal-700 text-white shadow-xs',
    badge:
      'bg-teal-500/15 text-teal-800 dark:text-teal-300 border border-teal-500/25',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-teal-500',
    focusVisibleRing: 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500',
    borderSoft: 'border-teal-500/35'
  },
  purple: {
    iconBg: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
    solidBtn: 'bg-purple-600 hover:bg-purple-700 text-white',
    activeTab: 'bg-purple-600 text-white shadow-xs',
    badge:
      'bg-purple-500/15 text-purple-800 dark:text-purple-300 border border-purple-500/25',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500',
    focusVisibleRing: 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-500',
    borderSoft: 'border-purple-500/35'
  },
  emerald: {
    iconBg: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
    solidBtn: 'bg-emerald-700 hover:bg-emerald-800 text-white',
    activeTab: 'bg-emerald-700 text-white shadow-xs',
    badge:
      'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500',
    focusVisibleRing: 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500',
    borderSoft: 'border-emerald-500/35'
  },
  indigo: {
    iconBg: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    solidBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    activeTab: 'bg-indigo-600 text-white shadow-xs',
    badge:
      'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border border-indigo-500/25',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
    focusVisibleRing: 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500',
    borderSoft: 'border-indigo-500/35'
  },
  rose: {
    iconBg: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    solidBtn: 'bg-rose-600 hover:bg-rose-700 text-white',
    activeTab: 'bg-rose-600 text-white shadow-xs',
    badge:
      'bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/25',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-rose-500',
    focusVisibleRing: 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500',
    borderSoft: 'border-rose-500/35'
  },
  amber: {
    iconBg: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
    solidBtn: 'bg-amber-700 hover:bg-amber-800 text-white',
    activeTab: 'bg-amber-700 text-white shadow-xs',
    badge:
      'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/25',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500',
    focusVisibleRing: 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500',
    borderSoft: 'border-amber-500/35'
  },
  sky: {
    iconBg: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
    solidBtn: 'bg-sky-700 hover:bg-sky-800 text-white',
    activeTab: 'bg-sky-700 text-white shadow-xs',
    badge:
      'bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/25',
    focusRing:
      'focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:border-sky-500',
    focusVisibleRing: 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-500',
    borderSoft: 'border-sky-500/35'
  }
};

export function getAccentMeta(accent = 'teal') {
  return MODULE_ACCENTS[accent] || MODULE_ACCENTS.teal;
}

export function getFieldClass(accent = 'teal', extraClass = '', options = {}) {
  const { focusRing } = getAccentMeta(accent);
  const padClass = options?.compact ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5';
  const base = `w-full min-w-0 ${padClass} rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-base sm:text-sm transition ${focusRing}`;
  return extraClass ? `${base} ${extraClass}` : base;
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
  darkMode = false,
  className = ''
}) {
  const accentMeta = getAccentMeta(accent);
  const cardSurface = darkMode
    ? 'bg-slate-900 border-slate-800 text-slate-100'
    : 'bg-white border-slate-200/90 text-slate-800';

  return (
    <section
      className={`rounded-2xl sm:rounded-3xl p-4 sm:p-5 border shadow-xs ${cardSurface} ${className}`.trim()}
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
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
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

      {footer && (
        <div className="mt-3">
          {footer}
        </div>
      )}
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
  darkMode = false,
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
      className={`p-1 rounded-2xl border gap-1 ${layoutClass} ${
        darkMode
          ? 'bg-slate-950/70 border-slate-800'
          : 'bg-slate-100 border-slate-200/80'
      } ${className}`.trim()}
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
                : darkMode
                  ? 'text-slate-300 hover:bg-slate-800/80'
                  : 'text-slate-600 hover:bg-white/80'
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
                    : darkMode
                      ? 'bg-slate-800 text-slate-300'
                      : 'bg-slate-200/80 text-slate-700'
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
  darkMode = false,
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
        if (event.shiftKey && (document.activeElement === first || !dialogEl.contains(document.activeElement))) {
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
        } shadow-2xl border flex flex-col overflow-hidden focus:outline-hidden ${
          darkMode
            ? 'bg-slate-900 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {isSheet && (
          <div className="sm:hidden w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mt-2.5 -mb-1 shrink-0" />
        )}

        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-3 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
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
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={disableBackdropClose}
            onClick={() => onClose?.()}
            aria-label={`Close ${ariaLabel || (typeof title === 'string' ? title : 'dialog')}`}
            className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${accentMeta.focusVisibleRing}`}
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
          <div className="px-4 sm:px-6 py-3 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyStateCard({
  icon: Icon = null,
  title,
  description = '',
  action = null,
  darkMode = false,
  accent = 'teal',
  className = ''
}) {
  const accentMeta = getAccentMeta(accent);

  return (
    <div
      className={`rounded-2xl border border-dashed p-6 sm:p-8 text-center space-y-2.5 ${
        darkMode
          ? 'bg-slate-900/60 border-slate-700 text-slate-300'
          : 'bg-slate-50/70 border-slate-300 text-slate-600'
      } ${className}`.trim()}
    >
      {Icon && (
        <div
          className={`w-11 h-11 rounded-2xl mx-auto flex items-center justify-center ${accentMeta.iconBg}`}
        >
          <Icon className="w-5 h-5" />
        </div>
      )}
      {title && (
        <div className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-100">
          {title}
        </div>
      )}
      {description && (
        <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="pt-1 flex justify-center">{action}</div>}
    </div>
  );
}
