import {
  Home,
  Moon,
  Coffee,
  Lock,
  Database,
  ChevronUp,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { ModalShell } from '../HowardUI.jsx';
import { APP_REGISTRY } from '../../utils/moduleStatuses.js';

const IS_MAC_PLATFORM =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
const QUICK_JUMP_SHORTCUT = IS_MAC_PLATFORM ? '⌘K' : 'Ctrl K';

const PROFILE_PILL_STYLES = {
  partner2:
    'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/60',
  partner1:
    'bg-teal-50 dark:bg-teal-950/60 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 hover:bg-teal-100 dark:hover:bg-teal-900/60',
  caregiver:
    'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60'
};

export function HeaderBar({
  isConnected,
  syncTransport,
  lastSyncedAt,
  activeAppMeta,
  urgentModuleCount,
  activeProfile,
  themeMode,
  onNavigateModule,
  onOpenLauncher,
  onOpenProfileModal,
  onOpenBackupModal,
  onToggleTheme
}) {
  const pillStyle = PROFILE_PILL_STYLES[activeProfile.id] || PROFILE_PILL_STYLES.caregiver;

  return (
    <header className="sticky top-0 z-40 w-full overflow-x-clip border-b backdrop-blur-md no-print">
      <div className="w-full px-2.5 sm:px-4 lg:px-6 h-16 flex items-center justify-between gap-1.5 sm:gap-2">
        {/* Brand Logo + Live Sync Status */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateModule('foyer')}
            className="flex items-center gap-1.5 sm:gap-2 lg:gap-2.5 text-left group cursor-pointer shrink-0"
            title="Return to Foyer (Daily Briefing)"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-900 to-teal-700 dark:from-teal-600 dark:to-cyan-700 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition shrink-0">
              <Home className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1 sm:gap-1.5">
                <span className="font-extrabold text-sm min-[360px]:text-base lg:text-lg tracking-tight leading-none whitespace-nowrap">
                  Howard
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-1 sm:px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                    isConnected
                      ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                      : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                  }`}
                  title={
                    lastSyncedAt
                      ? `Live Household Sync (${syncTransport === 'sse' ? 'Instant SSE Push' : 'Polling Fallback'}) • Last synced ${lastSyncedAt.toLocaleTimeString()}`
                      : 'Connecting to local SQLite server'
                  }
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                    }`}
                  />
                  <span className="hidden sm:inline">{isConnected ? 'Live' : 'Sync'}</span>
                </span>
              </div>
              <p className="text-[11px] text-text-muted hidden sm:block truncate">
                Household Suite
              </p>
            </div>
          </button>
        </div>

        {/* Center Tablet & Desktop Bento Quick-Jump Trigger (Ctrl+K) */}
        <div className="hidden md:flex items-center justify-center flex-1 max-w-xs lg:max-w-sm mx-2">
          <button
            type="button"
            onClick={onOpenLauncher}
            className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-2xl border border-border-strong bg-surface-subtle text-text-secondary hover:bg-surface-hover text-xs font-semibold transition cursor-pointer"
            title={`Open Bento Module Switcher (${QUICK_JUMP_SHORTCUT})`}
          >
            <span className="flex items-center gap-2 min-w-0 truncate">
              <LayoutGrid className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
              <span className="truncate">
                Jump to module...{' '}
                <span className="text-text-muted font-normal">({activeAppMeta.name})</span>
              </span>
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {urgentModuleCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500/20 text-amber-800 dark:text-amber-300">
                  {urgentModuleCount}
                </span>
              )}
              <kbd className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold border border-border-strong bg-surface-card text-text-secondary">
                {QUICK_JUMP_SHORTCUT}
              </kbd>
            </div>
          </button>
        </div>

        {/* Right Controls: Profile Switcher, Backups & Theme Toggle */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenProfileModal}
            className={`min-h-[40px] flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${pillStyle}`}
            title="Switch Household Profile or Configure PIN"
          >
            <span>{activeProfile.badgeEmoji}</span>
            <span className="max-w-[52px] min-[375px]:max-w-[88px] sm:max-w-[140px] truncate">
              {activeProfile.name}
            </span>
            {activeProfile.pinEnabled && <Lock className="w-3 h-3 text-current shrink-0" />}
          </button>

          {activeProfile.id !== 'caregiver' && (
            <button
              type="button"
              onClick={onOpenBackupModal}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center p-2 sm:p-2.5 rounded-xl border border-border-strong bg-surface-subtle text-text-secondary hover:bg-surface-hover transition cursor-pointer"
              title="Household Backups & SQLite Status"
              aria-label="Household Backups & SQLite Status"
            >
              <Database className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            className="min-w-[40px] min-h-[40px] px-2 sm:px-2.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer bg-[#E9DFC8] border-[#D5C7A9] text-[#4A3B2C] hover:bg-[#DFD3B8] dark:bg-surface-subtle dark:border-border-strong dark:text-amber-300 dark:hover:bg-surface-hover"
            title={
              themeMode === 'warm'
                ? 'Theme: Warm (Click for Dark)'
                : 'Theme: Dark (Click for Warm)'
            }
            aria-label={
              themeMode === 'warm'
                ? 'Theme: Warm (Click for Dark)'
                : 'Theme: Dark (Click for Warm)'
            }
          >
            {themeMode === 'warm' ? (
              <Coffee className="w-4 h-4 text-amber-800" />
            ) : (
              <Moon className="w-4 h-4 text-amber-300" />
            )}
            <span className="hidden xl:inline capitalize">{themeMode}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function SidebarRail({
  allowedApps,
  activeAppId,
  moduleStatuses,
  sidebarCollapsed,
  onToggleCollapse,
  onNavigateModule
}) {
  return (
    <aside
      aria-label="Howard Module Navigation"
      className={`howard-rail hidden md:flex flex-col shrink-0 sticky top-16 h-[calc(100dvh-4rem)] border-r backdrop-blur-md overflow-y-auto py-3 px-2 gap-1.5 transition-[width] duration-200 no-print w-[88px] ${
        sidebarCollapsed ? 'lg:w-[88px]' : 'lg:w-52 xl:w-60'
      }`}
    >
      <div
        className={`hidden lg:flex items-center px-2 pb-1.5 mb-1 border-b border-border-subtle ${
          sidebarCollapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {!sidebarCollapsed && (
          <span className="text-xs font-extrabold uppercase tracking-wider text-text-muted">
            Modules ({allowedApps.length})
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="min-w-[36px] min-h-[36px] flex items-center justify-center p-1.5 rounded-xl border border-border-strong bg-surface-subtle text-text-secondary hover:bg-surface-hover transition cursor-pointer"
          title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar to Icon Rail'}
          aria-label={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar to Icon Rail'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {allowedApps.map((appItem) => {
        const Icon = appItem.icon;
        const isActive = activeAppId === appItem.id;
        const statusInfo = moduleStatuses[appItem.id];

        return (
          <button
            key={appItem.id}
            type="button"
            onClick={() => onNavigateModule(appItem.id)}
            aria-current={isActive ? 'page' : undefined}
            title={`${appItem.name} • ${appItem.subtitle}${
              statusInfo?.label ? ` (${statusInfo.label})` : ''
            }`}
            className={`relative w-full rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-1 py-2.5 px-1 text-[11px] font-bold ${
              !sidebarCollapsed
                ? 'lg:flex-row lg:justify-start lg:gap-2.5 lg:px-3 lg:py-2.5 lg:text-xs'
                : ''
            } ${
              isActive
                ? `${appItem.accent} shadow-sm`
                : 'text-text-secondary hover:bg-surface-hover'
            }`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className="truncate max-w-full">{appItem.name}</span>

            {!sidebarCollapsed && statusInfo?.label && appItem.id !== 'foyer' && (
              <span
                className={`hidden lg:inline-flex ml-auto px-2 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : statusInfo.urgent
                      ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                      : 'bg-surface-muted text-text-secondary'
                }`}
              >
                {statusInfo.label}
              </span>
            )}

            {statusInfo?.urgent && !isActive && (
              <span
                className={`absolute top-2 right-2.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-[var(--ring-contrast)] ${
                  !sidebarCollapsed ? 'lg:hidden' : ''
                }`}
              />
            )}
          </button>
        );
      })}
    </aside>
  );
}

export function MobileFloatingPill({
  activeAppId,
  activeAppMeta,
  appLauncherOpen,
  urgentModuleCount,
  onNavigateModule,
  onToggleLauncher
}) {
  const ActiveIcon = activeAppMeta.icon;

  return (
    <nav
      aria-label="Mobile Floating App Launcher"
      className="md:hidden fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 pointer-events-none no-print"
    >
      <div className="howard-floating-pill pointer-events-auto inline-flex items-center gap-1.5 p-1.5 rounded-full border backdrop-blur-xl text-text-primary">
        <button
          type="button"
          onClick={() => onNavigateModule('foyer')}
          className={`min-h-[40px] flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-extrabold transition-all cursor-pointer active:scale-95 ${
            activeAppId === 'foyer'
              ? 'bg-teal-700 text-white shadow-sm'
              : 'text-text-secondary hover:bg-surface-hover'
          }`}
        >
          <Home className="w-4 h-4 shrink-0" />
          <span>Foyer</span>
        </button>

        <div className="w-px h-5 bg-border-strong" />

        <button
          type="button"
          onClick={onToggleLauncher}
          aria-expanded={appLauncherOpen}
          className={`min-h-[40px] flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-extrabold transition-all cursor-pointer active:scale-95 ${
            activeAppId !== 'foyer'
              ? `${activeAppMeta.accent} shadow-sm`
              : 'text-text-primary hover:bg-surface-hover'
          }`}
        >
          {activeAppId === 'foyer' ? (
            <LayoutGrid className="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-400" />
          ) : (
            <ActiveIcon className="w-4 h-4 shrink-0" />
          )}
          <span>{activeAppId === 'foyer' ? 'Apps' : activeAppMeta.name}</span>
          {activeAppId !== 'foyer' && (
            <ChevronUp
              className={`w-3.5 h-3.5 transition-transform ${
                appLauncherOpen ? 'rotate-180' : ''
              }`}
            />
          )}
          {urgentModuleCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[11px] font-extrabold leading-none ${
                activeAppId !== 'foyer'
                  ? 'bg-black/20 text-white'
                  : 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
              }`}
            >
              {urgentModuleCount}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}

export function BentoSwitcherModal({
  isOpen,
  onClose,
  allowedApps,
  activeAppId,
  activeProfile,
  moduleStatuses,
  onNavigateModule
}) {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      variant="sheet"
      title={`Household Modules (${allowedApps.length})`}
      subtitle={`${activeProfile.badgeEmoji} ${activeProfile.name} • Tap any module to switch`}
      icon={LayoutGrid}
      accent="teal"
      maxWidthClass="max-w-lg"
      ariaLabel="Howard Modules"
    >
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {allowedApps.map((appItem) => {
          const Icon = appItem.icon;
          const isCurrent = activeAppId === appItem.id;
          const statusInfo = moduleStatuses[appItem.id];

          return (
            <button
              key={appItem.id}
              type="button"
              onClick={() => onNavigateModule(appItem.id)}
              className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2.5 sm:gap-3 cursor-pointer active:scale-[0.99] min-w-0 overflow-hidden ${
                isCurrent
                  ? `${appItem.activeCardClass} bg-surface-subtle`
                  : 'bg-surface-subtle/80 border-border-subtle hover:bg-surface-hover'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5 w-full min-w-0">
                <div
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-xs shrink-0 ${appItem.accent}`}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>

                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold max-w-full truncate ${
                    isCurrent
                      ? appItem.accent
                      : statusInfo?.urgent
                        ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                        : 'bg-surface-card text-text-secondary border border-border-subtle'
                  }`}
                >
                  {isCurrent ? '● Active' : statusInfo?.label || 'Open'}
                </span>
              </div>

              <div className="min-w-0">
                <div className="font-extrabold text-sm leading-tight truncate">{appItem.name}</div>
                <div className="text-xs text-text-muted truncate mt-0.5">{appItem.subtitle}</div>
              </div>
            </button>
          );
        })}
      </div>
    </ModalShell>
  );
}

export { APP_REGISTRY };
