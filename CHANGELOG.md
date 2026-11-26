# Changelog

All notable changes to Howard are documented in this file.

## [2026-11-26] — Design System, Colour Cohesion & Responsive UX

### Design System & Colour Cohesion
- Unified `APP_REGISTRY` and `MODULE_ACCENTS` into a single source of truth in `src/utils/moduleThemes.js` and scoped `--mod-accent` CSS custom properties per `<main data-module="...">` in `src/index.css`.
- Standardized all 8 modules and shell wrappers onto `<ModulePage>` (`max-w-7xl`) so container widths remain identical when switching modules.
- Replaced `border-l-[3px]` corner-pinching borders on `ModuleHeader` and `ModuleEmbedCard` with a crisp inset vertical accent spine.
- Resolved amber/yellow/warning collisions: shifted Ledger to copper/orange (`orange-700`), Quill default indicators to yellow (`yellow-400`), Floodgate clots to burgundy (`fuchsia-700`), Almanac `Bins / Utilities` to cyan (`cyan-700`), and reserved `amber-500` strictly for warnings.
- Fixed cross-app colour drifts across `BackstageBackupModal` (`teal`), `QuickDoseCard` (AM `purple`), `BeaconApp` (Daytime Vet CTA `sky-700`), `Ledger` (`Unified` copper pill), and `FoyerApp` (`Floodgate` card).
- Swept legacy pastel `*-50`/`*-100`/`dark:*-950` and hardcoded `slate` surfaces in favour of semantic theme tokens compatible with both Warm Beige and Softened Dark.
- Added shared UI primitives in `src/components/HowardUI.jsx`: `<Button>` (standardized `36px`/`40px`/`44px` heights and `rounded-xl` geometry), `<CardHeader>`, `<AlertBanner>`, `<ModuleEmbedCard>`, `<MetricStrip>`, `<MetricTile>` (with `tabular-nums`), and `<EmptyStateCard compact />`.
- Replaced remaining operational chrome emojis across Beacon, Almanac, Bloom, Foyer, and Ledger with Lucide icons, and standardized icon containers onto `<IconBadge>`.

### Responsive Layout & Mobile Ergonomics
- Centered `ModuleHeader` and `CardHeader` titles vertically with their icons on mobile, and added `shortTitle` support and safe `min-w-[160px]` floors to prevent multi-button headers from crushing or overlapping titles.
- Updated `SegmentedTabs` to stay single-row on mobile (`grid-cols-4` for 4-tab modules) and switch to full desktop labels at `xl:`.
- Added mobile overflow menu for secondary Ledger actions (`lg:hidden`), 2-column mobile KPI strips, `grid-cols-2` perspective filters, and compact Ledger header/toolbar spacing.
- Paired Bloom (`Today`) and Floodgate (`Daily Log`) desktop cards into two independent columns to eliminate vertical dead space, and added collapsible mobile accordions plus a centered floating unsaved-changes pill in Floodgate.
- Added a matching 2-tile `Today` / `Next 7 Days` summary strip to Foyer's `Almanac Agenda` card and removed duplicate `Switch User` / empty footer buttons.
- Adjusted `MonthCalendarLayout` to split at `xl:grid-cols-12` with a sticky inspector, inline header controls, compact mobile cells, and bounded day-cell status dots; fixed Quill narrow-mobile masonry (`grid-cols-1 min-[440px]:grid-cols-2`) and touch-tablet hover controls.
- Positioned global toast notifications below the 64px sticky header bar so header controls are never occluded.

### Module UX & Data Polish
- Merged Cadence's dose-status banner into `ModuleHeader` footer so AM/PM check-in cards appear above the fold, and fixed the 180-day bottle progress bar to display remaining shelf life.
- Fixed Bloom's `selectedAbdomen` default so `"Plump"` is no longer pre-highlighted when abdomen status is unchecked.
- Clarified Quill's shared-note Caregiver visibility button copy (`"Hidden from Caregiver (click to share)"`).

### Accessibility & Hygiene
- Added a global `:focus-visible` keyboard outline rule in `src/index.css` driven by `--mod-accent`.
- Raised remaining Quill toolbar and checklist icon buttons to the `36px` minimum touch-target floor.
