<div align="center">

# 🎩 Howard — Self-Hosted Household Suite

**A unified, real-time household platform integrating daily briefings, pet medication tracking, mantis habitat & growth logs, clinical symptom tracking, shared calendars, household bookkeeping, and sitter guides.**

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-Node_22_Built--in-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://nodejs.org/api/sqlite.html)
[![Docker](https://img.shields.io/badge/Docker-Node_22_Alpine-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

</div>

---

## 📖 Overview

**Howard** brings seven self-hosted household tools together under a single lightweight Docker container and port (`:5170`), backed by zero-dependency **Node.js 22.13+** (`node:sqlite`, unflagged) databases and 2.5-second live Wi-Fi synchronisation across phones and tablets.

### 🧩 Included Household Modules

| Module | Description |
| :--- | :--- |
| **🏠 Foyer** | **Morning Briefing & Fast Actions:** Time-aware daily dashboard with one-tap Morning/Evening pet medication dose buttons, one-tap **Bloom** mantis enclosure misting & premolt/hardening safety alerts, automatic bottle expiry warnings, upcoming **Almanac** agenda, and **Ledger** upcoming bills & monthly spend. |
| **🐾 Cadence** | **Pet Medication Tracker:** Twice-daily anti-double-dose status banner, bottle shelf-life progress bar, and weekly adherence history—automatically pre-selecting the active Howard profile. |
| **🌸 Bloom** | **Flower Mantis Growth, Feeding & Habitat Tracker:** Daily anti-double-mist & abdomen plumpness feeding log, Premolt Watch & post-molt exoskeleton hardening lockouts, instar/molt milestone timeline, live feeder culture alerts, and enclosure molting clearance calculator. |
| **📅 Almanac** | **Unified Household Calendar:** Shared events & appointments with live toggleable overlays for **pet medication adherence**, **bottle expiry date**, **Bloom mantis molts & care**, **Ledger billing days & paydays**, and **Partner 2's Floodgate cycle & printable GP reports**. |
| **🌊 Floodgate** | **Private Cycle & Clinical Symptom Tracker:** Flow severity, blood clot counts/sizes, 0–10 pain scale, bowel/GI flare-ups, medication relief tracking, pattern insights, and printable specialist/GP consultation summaries. |
| **💷 Ledger** | **Household Bookkeeping, Subscriptions & Expenses:** Track day-to-day expenses, Direct Debits, subscriptions, and income streams separated between **Partner 1**, **Partner 2**, **Joint/Shared**, and **Unified** views with 50/50 or income-proportional splitting and CSV export. |
| **🚨 Beacon** | **Emergency, Vet & House Guide:** Sitter-ready reference card for household pet care, feeding/supply locations, daytime & 24hr emergency vet numbers, household contacts, Wi-Fi (with HTTP-LAN clipboard fallback), bin collection, and utilities. |

---

## 👤 Household Profiles & Optional PIN Locks

Howard tailors navigation and profile views based on who is holding the device (`Partner 1` and `Partner 2` display names are renameable in-app; `Caregiver` is fixed for sitter mode):

* **⚡ Partner 1:** Access to **Foyer**, **Cadence**, **Bloom**, **Almanac**, **Ledger**, and **Beacon** (optional 4–8 digit PIN).
* **🌸 Partner 2:** Access to **Foyer**, **Cadence**, **Bloom**, **Almanac**, **Floodgate**, **Ledger**, and **Beacon** (optional 4–8 digit PIN).
* **🐾 Caregiver (Pet Sitter Mode):** Always unlocked for zero-friction sitter access—shows **Foyer** (simplified sitter view), **Cadence**, **Bloom**, and **Beacon** (read-only).

### 🔐 Security & Privacy Model

Howard is intentionally designed for **trusted home LAN / Tailscale networks** rather than public internet multi-tenancy:

* **Lightweight Guest Blocking:** Profile PINs prevent casual browsing by guests or pet sitters when switching profiles on a shared kitchen tablet or household phone. They are lightweight device-level locks rather than cryptographic internet-facing authentication.
* **Scoped Private Views:** **Floodgate** is scoped to **Partner 2**'s workspace and Calendar overlay. **Almanac** and **Foyer** keep Partner 1 and shared medical events visible while filtering out Partner 2-private and GP-report-linked entries in other profile views.

---

## 💾 Drop-In Database Architecture & Daily Backups

Howard keeps four clean SQLite files inside `./data` (`/app/data` in Docker):
* `./data/howard.db` — Profiles, PINs, Almanac calendar events, Ledger bookkeeping, and Beacon house guide.
* `./data/cadence.db` — Schema-compatible with standalone Cadence backups (`Logs`, `Settings`).
* `./data/bloom.db` — Mantis specimen settings, daily misting/feeding/climate care logs, molt milestones, and feeder cultures.
* `./data/floodgate.db` — Schema-compatible with standalone Floodgate backups.

> **Backup & Restore Modes:** The in-app Backup & Restore modal performs a full **replace** restore from a JSON snapshot. Non-destructive **`mode: "merge"`** restores (preserving existing records) and partial section updates are available via `POST /api/backup/restore`.

### 📦 Automatic Daily Snapshots & Safe Folder Copies

Howard automatically creates clean daily SQLite snapshots inside `./data/backups/YYYY-MM-DD/` (pruning older snapshots automatically):

* **Quick Explorer / Finder Copy (No Downtime):** Copy any dated folder from `./data/backups/YYYY-MM-DD/` directly without stopping Docker—those snapshot files are already cleanly checkpointed.
* **Cold Copy of Live `./data`:** If copying the live `./data/*.db` files directly, stop the container first so active `-wal`/`-shm` journals are flushed cleanly:
  ```bash
  docker compose stop
  # Copy ./data to your backup drive
  docker compose start
  ```

---

## 🚀 Getting Started (Docker Deployment)

### 1. Start with Docker Compose (Recommended)
`docker-compose.yml` configures `TZ=Europe/London` by default so local daily boundaries, reminders, and recurring schedules align with your household timezone—adjust `TZ` before starting if needed.

```bash
docker compose up -d --build
```
Howard will be live at `http://localhost:5170` (or `http://<SERVER-LAN-IP>:5170` across your home Wi-Fi).

### 2. Upgrading Howard (Preserving Data)
Pull the latest changes and rebuild in place—your mounted `./data` databases and daily snapshots remain untouched:
```bash
git pull
docker compose up -d --build
```

### 3. Optional Storage & NAS Configuration (`docker-compose.yml`)
* **Docker Named Volume (`howard_data`):** Uncomment `howard_data:/app/data` and the top-level `volumes:` block in `docker-compose.yml` to keep SQLite databases on native Linux `ext4` storage under Docker Desktop.
* **NAS / Network Share Mounts:** Uncomment `SQLITE_JOURNAL_MODE=TRUNCATE` in `docker-compose.yml` if `./data` is mounted over SMB/NFS where SQLite `WAL` file locking is unsupported.

### 4. Build & Run with `docker run`
```powershell
docker build -t howard .
docker run -d --name howard -p 5170:80 -e TZ=Europe/London -v "${PWD}/data:/app/data" --restart unless-stopped howard
```

### 5. Windows Firewall Rule (Optional Home LAN Access)
```cmd
netsh advfirewall firewall add rule name="Allow Howard 5170" dir=in action=allow protocol=TCP localport=5170 profile=any
```

---

## 🛠️ Local Development & Verification

Requires **Node.js 22.13+** (for unflagged built-in `node:sqlite` support).

```bash
npm ci
```

**Terminal 1 — Start unified SQLite server on port `3001`:**
```powershell
# Windows PowerShell
$env:PORT=3001; npm start
```
```bash
# macOS / Linux / Git Bash
PORT=3001 npm start
```

**Terminal 2 — Start Vite dev server on port `5170`:**
```bash
npm run dev
```

**Checks & Production Build:**
```bash
npm test          # Node built-in test runner (helper & schedule unit suite)
npm run lint      # Oxlint static checks
npm run build     # Production Vite bundle -> ./dist
```
