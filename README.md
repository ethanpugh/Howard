# Howard

Self-hosted household hub for daily routines, pet and mantis care, shared calendars, household bills, and clinical symptom logs.

[![React 19](https://img.shields.io/badge/React-19-149eca?style=flat-square)](https://react.dev/)
[![Vite 8](https://img.shields.io/badge/Vite-8-646cff?style=flat-square)](https://vite.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-06b6d4?style=flat-square)](https://tailwindcss.com/)
[![Node 22 SQLite](https://img.shields.io/badge/SQLite-Node_22_Built--in-003b57?style=flat-square)](https://nodejs.org/api/sqlite.html)
[![Docker](https://img.shields.io/badge/Docker-Node_22_Alpine-2496ed?style=flat-square)](https://www.docker.com/)

## Overview

Howard combines seven household tools inside a single Node.js 22 Docker container on port `5170`, stored in one local SQLite database (`node:sqlite`, unflagged). Connected phones, tablets, and desktops stay in sync over Server-Sent Events (SSE) push with a 3-second polling fallback (30-second keepalive when SSE is active), plus gzip compression and ETag/304 caching on static assets.

The interface adapts across phones, tablets, and desktops using a collapsible sidebar rail on desktop, a `Ctrl+K` / `Cmd+K` Bento module switcher, and a floating bottom capsule on mobile. Two built-in themes (**Warm Beige** and **Softened Dark**) are driven by semantic CSS tokens with dedicated print styling for GP consultation reports.

## Modules

| Module | What it handles |
| :--- | :--- |
| **Foyer** | Daily briefing with quick actions for AM/PM pet medication doses, mantis enclosure misting, premolt/hardening alerts, upcoming Almanac dates, Ledger spend summaries, and uniform `[Open ->]` shortcuts across cards. |
| **Cadence** | Twice-daily pet medication log with double-dose prevention, morning/evening adherence stats, bottle shelf-life and expiry countdown, and weekly Mon-Sun history. |
| **Bloom** | Spiny flower mantis care tracker covering misting intervals, prey feeding and abdomen plumpness logs, Premolt Watch and post-molt exoskeleton hardening lockouts, instar progression, feeder culture alerts, and enclosure clearance checks. |
| **Almanac** | Shared household calendar with recurring events and toggleable overlays for Cadence doses and bottle expiry, Bloom molts and care, Ledger bills and paydays, and Partner 2's private Floodgate cycle/GP entries. |
| **Floodgate** | Private cycle and clinical symptom log recording flow intensity, clot size/count, 0 to 10 pain scores, GI symptoms, medication relief, pattern insights, and printable GP consultation reports. |
| **Ledger** | Shared bookkeeping for day-to-day expenses, Direct Debits, subscriptions, and income across Partner 1, Partner 2, Joint, and Unified views, supporting 50/50 or income-proportional settlements and CSV export. |
| **Beacon** | Reference guide for pet routines, supply locations, daytime and 24-hour emergency vet contacts, household contacts, Wi-Fi details with LAN-safe copy buttons, bin collection days, and utilities. |

## Profiles & Privacy

Access adapts to the active household profile. **Partner 1** and **Partner 2** display names can be renamed in-app, while **Caregiver** stays fixed for sitter access:

* **Partner 1**: Full access to Foyer, Cadence, Bloom, Almanac, Ledger, and Beacon, plus full database export and JSON restore/merge permissions.
* **Partner 2**: Full access to Foyer, Cadence, Bloom, Almanac, Floodgate, Ledger, and Beacon, plus full database export.
* **Caregiver**: Always unlocked for guests and pet sitters; limits navigation to Caregiver Foyer, Cadence, Bloom, and read-only Beacon.

### Security Model

Howard is built for trusted home LANs and private VPNs (such as Tailscale) rather than public multi-tenant hosting:

* **Optional PIN Lock**: Partner 1 and Partner 2 can each set a 4 to 8 digit numeric PIN to stop casual switching on a shared kitchen tablet. These are lightweight device locks, not internet-facing authentication.
* **Private Data Filtering**: Floodgate is strictly scoped to Partner 2 in both the workspace and API sync payloads. Partner 2 private events and GP-report-linked entries in Almanac are hidden from Partner 1 and Caregiver views.

## Database & Backups

All modules persist atomically in `./data/howard.db` (`/app/data/howard.db` in Docker) using SQLite schema `user_version = 5` and `WAL` journal mode by default. On first boot with legacy separate databases (`cadence.db`, `bloom.db`, `floodgate.db`), Howard archives the old files into `./data/backups/legacy-4db-*/` and migrates their data into `howard.db`.

* **Daily Snapshots**: Howard writes compacted daily snapshots via `VACUUM INTO` to `./data/backups/YYYY-MM-DD/howard.db` and prunes snapshots older than 7 days. You can copy any dated snapshot directly without stopping the container.
* **JSON Export & Restore**: Partner 1 and Partner 2 can download a full household JSON backup (including Floodgate) from the top-right Backstage Database dialog. Only Partner 1 can upload restores, supporting full Howard replacement (`mode: "replace"`) as well as merging standalone Cadence, Bloom, or Floodgate JSON exports (`mode: "merge"`). Every restore saves a pre-restore `VACUUM INTO` snapshot to `./data/backups/pre-restore-*/` first.
* **Cold File Copy**: If copying `./data/howard.db` directly instead of using a dated snapshot, stop the container briefly so active `-wal`/`-shm` journals flush cleanly:

```bash
docker compose stop
# Copy ./data to your backup target
docker compose start
```

## Project Structure

```text
.
├── server.js                  # CLI entrypoint booting createHowardApp()
├── server/                    # Modular backend (SQLite db, migrations, cache, backup, HTTP/SSE, domain routes)
├── shared/                    # Zero-dependency date, profile/RBAC, and default settings helpers shared by client & server
├── src/
│   ├── App.jsx                # Root app shell, theme state, and lazy-loaded module routing
│   ├── index.css              # Tailwind v4 @theme semantic tokens, Warm Beige & Softened Dark palettes, print styles
│   ├── components/HowardUI.jsx
│   ├── components/shell/      # Header, desktop rail, mobile floating pill, Bento switcher, Profile & Backstage modals
│   ├── hooks/                 # Live SSE sync (useHouseholdSync), action locks, week navigation
│   ├── utils/                 # Shared helpers and apiClient
│   └── apps/                  # 7 module workspaces and their decomposed tabs/modals
└── tests/                     # Built-in node:test unit and SQLite server integration suites
```

## Getting Started (Docker)

### Docker Compose (Recommended)

`docker-compose.yml` sets `TZ=Europe/London` by default so daily dose windows, calendar boundaries, and recurring bills align with your household timezone. Edit `TZ` before starting if needed.

```bash
docker compose up -d --build
```

Open `http://localhost:5170` (or `http://<SERVER-LAN-IP>:5170` across your home network).

### Upgrading

Pull the latest changes and rebuild without touching `./data`:

```bash
git pull
docker compose up -d --build
```

### Storage & NAS Notes (`docker-compose.yml`)

* **Docker Named Volume**: Uncomment `howard_data:/app/data` and the top-level `volumes:` block to keep SQLite on native Linux `ext4` under Docker Desktop.
* **SMB / NFS Network Shares**: Uncomment `SQLITE_JOURNAL_MODE=TRUNCATE` if `./data` sits on a network mount where SQLite `WAL` shared-memory locking is unsupported.

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

Requires **Node.js 22.13+** for unflagged `node:sqlite`.

```bash
npm ci
```

Run the backend server and Vite dev server in separate terminals:

```powershell
# Terminal 1 (Windows PowerShell): unified API & SQLite server on port 3001
$env:PORT=3001; npm start
```

```bash
# Terminal 1 (macOS / Linux / Git Bash)
PORT=3001 npm start

# Terminal 2: Vite dev server on port 5170 (proxies /api to 3001)
npm run dev
```

Run checks and production builds:

```bash
npm test       # Unit & SQLite server integration tests (node --test)
npm run lint   # Static linting (oxlint)
npm run build  # Production bundle -> ./dist
```
