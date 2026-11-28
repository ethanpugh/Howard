<div align="center">

# Howard

**Self-hosted household hub for daily routines, pet and mantis care, shared calendars, household bills, and clinical symptom logs.**

[![React 19](https://img.shields.io/badge/React-19-149eca?style=flat-square)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![Vite 8](https://img.shields.io/badge/Vite-8-646cff?style=flat-square)](https://vite.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-06b6d4?style=flat-square)](https://tailwindcss.com/)
[![Node 24 SQLite](https://img.shields.io/badge/SQLite-Node_24_Built--in-003b57?style=flat-square)](https://nodejs.org/api/sqlite.html)
[![Docker](https://img.shields.io/badge/Docker-Node_24_Alpine-2496ed?style=flat-square)](https://www.docker.com/)

<br />

<img src="docs/foyer-preview.png" alt="Howard Foyer dashboard" width="900" />

</div>

---

## Overview

Howard brings eight household tools together in one lightweight Docker container on port `5170`, built end-to-end in strict TypeScript (`tsconfig.app.json` + `tsconfig.server.json`), Zod v4 single-source-of-truth contracts, Hono RPC + SSE push, and Node.js 24 built-in SQLite (`node:sqlite`, unflagged, `Schema v7`). Connected devices stay in sync across phones, tablets, and desktops via Server-Sent Events (SSE) push with a 3-second polling fallback (30-second keepalive when SSE is active), alongside async gzip compression and ETag caching for static assets.

The interface adapts across screen sizes with a collapsible sidebar rail on desktop, a `Ctrl+K` / `Cmd+K` quick module switcher, and a floating navigation pill on mobile. Both **Warm Beige** and **Softened Dark** themes are supported across every view, alongside dedicated print styling for clinical reports.

## Modules

| Module | Description |
| :--- | :--- |
| **Foyer** | Daily household briefing surfacing AM and PM pet dose status, mantis misting and feeding safety alerts, upcoming calendar dates, monthly bill totals, and one-tap care check-ins. |
| **Cadence** | Twice-daily pet medication tracker with morning and evening dose logging, double-dose prevention, adherence tracking, opened bottle expiry monitoring, and weekly history. |
| **Bloom** | Spiny flower mantis care tracker covering daily misting intervals, prey feeding and abdomen condition, premolt and post-molt hardening lockouts, instar growth milestones, feeder culture alerts, and enclosure clearance checks. |
| **Almanac** | Shared household calendar supporting recurring events and toggleable overlays for pet medication logs, bottle expiry dates, mantis molts and care, upcoming bills and paydays, and Partner 2's private cycle logs. |
| **Floodgate** | Private cycle and clinical symptom log recording flow severity, clot counts and sizes, 0 to 10 pain scores, GI flare-ups, medication relief, cycle patterns, and printable GP consultation reports. |
| **Ledger** | Household bookkeeping manager tracking day-to-day expenses, Direct Debits, subscriptions, and income across Partner 1, Partner 2, Joint, and Unified views with 50/50 or income-proportional settlements and CSV export. |
| **Quill** | Keep-style tileable notes & shared household board with drag-and-drop ordering, checklists, Markdown-lite formatting, labels, 12 note colours, private per-partner boards, and optional Caregiver House Notes. |
| **Beacon** | Caregiver and household reference card covering pet routines, supply locations, daytime and 24-hour emergency vet contacts, household contacts, Wi-Fi sharing, bin collection days, and utilities. |

---

## Profiles & Privacy

Access adapts to the active household profile. **Partner 1** and **Partner 2** display names can be renamed in-app, while **Caregiver** stays fixed for sitter access:

* **Partner 1**: Full access to Foyer, Cadence, Bloom, Almanac, Ledger, Quill, and Beacon, plus full database export and JSON restore/merge permissions.
* **Partner 2**: Full access to Foyer, Cadence, Bloom, Almanac, Floodgate, Ledger, Quill, and Beacon, plus full database export.
* **Caregiver**: Always unlocked for guests and pet sitters; scopes navigation to Caregiver Foyer, Cadence, Bloom, read-only Quill House Notes, and read-only Beacon.

### Security Model

Howard is designed for trusted home LANs and private VPNs (such as Tailscale) over `http://` with convenience-first profile switching and defense-in-depth protections:

* **Salted scrypt PIN Locks & Rate Limiting**: Partner 1 and Partner 2 can each set a 4 to 8 digit numeric PIN (stored as salted `scrypt` hashes in Schema v7, never plaintext, checked with `crypto.timingSafeEqual` and protected by a 5-failure / 5-minute `429` rate limiter).
* **Role & Privacy Isolation**: Floodgate is strictly scoped to Partner 2 in live sync, SSE, and `/api/floodgate/*` routes (`403` otherwise). Partner 2 private events and GP-report-linked entries in Almanac are filtered server-side from Partner 1 and Caregiver views. Private Quill notes and their labels are isolated to their owner and blocked from `'Remind in Almanac'`.
* **Caregiver RBAC & CSRF Guards**: Caregiver mutations on partner-only endpoints (profiles, PINs, Almanac, Ledger, Beacon, Cadence/Bloom settings, Bloom molts/feeders) return `403`. Mutating `/api/*` requests enforce same-origin `Origin`/`Sec-Fetch-Site` checks (`403`) and strict `Content-Type: application/json` checks (`415`).

---

## Database & Backups

All modules persist atomically in `./data/howard.db` (`/app/data/howard.db` in Docker) using SQLite schema `user_version = 7` and `WAL` journal mode by default. Legacy multi-database setups (`cadence.db`, `bloom.db`, `floodgate.db`) archive automatically into `./data/backups/legacy-4db-*/` and consolidate on first boot (with v6 -> v7 automatically hashing existing PINs via `scrypt`).

* **Daily Snapshots**: Compacted daily snapshots are written via `VACUUM INTO` to `./data/backups/YYYY-MM-DD/howard.db` and pruned after 7 days. Dated snapshot files can be copied safely without stopping Docker.
* **Full Household Backup & Atomic Restore**: Partner 1 and Partner 2 can download a full household JSON backup (all modules including Floodgate, with PIN hashes redacted) for household disaster recovery; Caregiver access is blocked (`403`). Only Partner 1 can upload restores (`POST /api/howard/restore`), validated upfront via `BackupRestorePayloadSchema`, supporting full Howard replacement (`mode: "replace"`) and merging standalone Cadence, Bloom, Floodgate, or Quill JSON backups (`mode: "merge"`). Every restore saves a pre-restore `VACUUM INTO` snapshot to `./data/backups/pre-restore-*/` first.
* **Cold File Copy**: If backing up `./data/howard.db` directly instead of copying a daily snapshot, stop the container briefly so active `-wal`/`-shm` journals flush cleanly:

```bash
docker compose stop
# Copy ./data to your backup destination
docker compose start
```

## Project Structure

```text
.
├── server.ts                  # Native Node TypeScript entrypoint booting createHowardApp()
├── server/                    # Modular Hono API (SQLite db, v1–v7 migrations, cache, backup, HTTP/SSE, domain routes)
├── shared/                    # Isomorphic Zod schemas (shared/schemas/), date utils, profile/RBAC & defaults
├── docs/                      # Documentation media
├── src/
│   ├── App.tsx                # Root app shell, theme state, boot PIN check, ErrorBoundary & lazy modules
│   ├── index.css              # Tailwind v4 @theme semantic tokens, Warm Beige & Softened Dark palettes, print styles
│   ├── components/HowardUI.tsx
│   ├── components/shell/      # Header, desktop rail, mobile floating pill, Bento switcher, Profile & Backstage modals
│   ├── hooks/                 # Live SSE sync (useHouseholdSync), action locks, week navigation
│   ├── utils/                 # Profile-scoped hc<AppType> RPC client (apiClient.ts), Ledger integer-pence & CSV helpers
│   └── apps/                  # 8 module workspaces and their decomposed tabs/modals (.ts / .tsx)
├── tests/                     # Built-in node:test unit and SQLite server integration suites (.test.ts)
└── e2e/                       # Playwright end-to-end browser verification suite (howard.spec.ts)
```

---

## Getting Started (Docker)

### Docker Compose (Recommended)

`docker-compose.yml` configures `TZ=Europe/London` by default so daily medication windows, calendar boundaries, and recurring bills align with your household timezone. Adjust `TZ` before starting if needed.

```bash
docker compose up -d --build
```

Howard will be available at `http://localhost:5170` (or `http://<SERVER-LAN-IP>:5170` across your home network).

### Upgrading

Pull new changes and rebuild without modifying `./data`:

```bash
git pull
docker compose up -d --build
```

### Storage & NAS Notes (`docker-compose.yml`)

* **Docker Named Volume**: Uncomment `howard_data:/app/data` and the top-level `volumes:` block to keep SQLite on native Linux `ext4` under Docker Desktop.
* **SMB / NFS Network Shares**: Uncomment `SQLITE_JOURNAL_MODE=TRUNCATE` if `./data` sits on a network share where SQLite `WAL` shared-memory locking is unsupported.

### Standalone `docker run`

```powershell
docker build -t howard .
docker run -d --name howard -p 5170:80 -e TZ=Europe/London -v "${PWD}/data:/app/data" --restart unless-stopped howard
```

### Windows Firewall (Optional LAN Access)

```cmd
netsh advfirewall firewall add rule name="Allow Howard 5170" dir=in action=allow protocol=TCP localport=5170 profile=any
```

## Local Development

Requires **Node.js 22.18+** (or **Node 24**, used in Docker) for unflagged `node:sqlite` and native `.ts` execution.

```bash
npm ci
```

Run the API server and Vite dev server in separate terminals:

```powershell
# Terminal 1 (Windows PowerShell): unified API & SQLite server on port 3001
$env:PORT=3001; npm.cmd start
```

```bash
# Terminal 1 (macOS / Linux / Git Bash)
PORT=3001 npm start

# Terminal 2: Vite dev server on port 5170 (proxies /api to 3001)
npm run dev
```

Run the full verification suite (`typecheck`, `lint`, `test`, `build`, `test:e2e`):

```bash
npm run verify       # All checks (or `npm.cmd run verify` on Windows PowerShell)
npm run typecheck    # Split browser (tsconfig.app.json) & server (tsconfig.server.json) checks
npm test             # Unit & SQLite server integration tests (node --test)
npm run lint         # Static linting (oxlint)
npm run build        # Production bundle -> ./dist
npm run test:e2e     # Playwright browser suite against compiled ./dist
```
