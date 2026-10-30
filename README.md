<div align="center">

# 🎩 Howard — Self-Hosted Household Suite

**A unified, real-time household platform integrating daily briefings, pet medication tracking, clinical symptom logging, calendar overlays, home upkeep, and sitter guides.**

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-Node_22_Built--in-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://nodejs.org/api/sqlite.html)
[![Docker](https://img.shields.io/badge/Docker-Node_22_Alpine-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

</div>

---

## 📖 Overview

**Howard** brings multiple self-hosted household tools together under a single lightweight Docker container and port (`:5170`), backed by zero-dependency **Node.js 22** (`node:sqlite`) databases and 2.5-second live Wi-Fi synchronisation across phones and tablets.

### 🧩 Included Household Modules

| Module | Description |
| :--- | :--- |
| **🏠 Foyer** | **Morning Briefing & Fast Actions:** Time-aware daily dashboard with one-tap Morning/Evening dose buttons for **Mochi**, automatic bottle expiry warnings, upcoming **Almanac** agenda, and **Ledger** upcoming bills & monthly spend. |
| **🐾 Cadence** | **Pet Medication Tracker:** Twice-daily anti-double-dose status banner, bottle shelf-life progress bar, and weekly adherence history—automatically pre-selecting the active Howard user. |
| **📅 Almanac** | **Unified Household Calendar:** Shared events & appointments with live toggleable overlays for **pet medication adherence**, **bottle expiry date**, **Ledger billing days & paydays**, and **Partner 2's Floodgate cycle & printable GP reports**. |
| **🌊 Floodgate** | **Private Cycle & Endometriosis Tracker:** Clinical flow severity, blood clot counts/sizes, 0–10 pain scale, bowel/GI flare-ups, medication relief tracking, and printable GP/Specialist consultation summaries. |
| **💷 Ledger** | **Household Bookkeeping, Subscriptions & Expenses:** Track day-to-day expenses, Direct Debits, subscriptions, and income streams separated between **Partner 1**, **Partner 2**, **Joint/Shared**, and **Unified** views with 50/50 or income-proportional splitting, plus optional Monzo Developer API & Webhook integration. |
| **🚨 Beacon** | **Emergency, Vet & House Guide:** Sitter-ready reference card for **Mochi's** feeding/supply locations, daytime & 24hr emergency vet numbers, household contacts, Wi-Fi, and utilities. |

---

## 👤 Household Profiles & Optional PIN Locks

Howard tailors navigation and data access based on who is holding the device:

* **⚡ Partner 1:** Access to **Foyer**, **Cadence**, **Almanac**, **Ledger**, and **Beacon** (optional 4–8 digit PIN).
* **🌸 Partner 2:** Access to **Foyer**, **Cadence**, **Almanac**, **Floodgate**, **Ledger**, and **Beacon** (optional 4–8 digit PIN; protects Floodgate API & UI).
* **🐾 Caregiver (Pet Sitter Mode):** Always unlocked for zero-friction sitter access—shows **Foyer** (simplified sitter view), **Cadence**, and **Beacon** (read-only).

---

## 💾 Drop-In Database Architecture

Howard keeps three clean SQLite files inside `./data` (`/app/data` in Docker):
* `./data/howard.db` — Profiles, PINs, Almanac calendar events, Ledger bookkeeping, and Beacon house guide.
* `./data/cadence.db` — 100% schema-compatible with standalone Cadence.
* `./data/floodgate.db` — 100% schema-compatible with standalone Floodgate.

---

## 🚀 Getting Started (Docker Deployment)

### 1. Start with Docker Compose (Recommended)
```bash
docker compose up -d --build
```
Howard will be live at `http://localhost:5170` (or `http://<SERVER-LAN-IP>:5170` across your home Wi-Fi).

### 2. Build & Run with `docker run`
```powershell
docker build -t howard .
docker run -d --name howard -p 5170:80 -v "${PWD}/data:/app/data" --restart unless-stopped howard
```

### 3. Windows Server Firewall Rule
```cmd
netsh advfirewall firewall add rule name="Allow Howard 5170" dir=in action=allow protocol=TCP localport=5170 profile=any
```

---

## 🛠️ Local Development (Without Docker)

```bash
npm install

# Terminal 1: Start unified SQLite server on port 3001
PORT=3001 npm start

# Terminal 2: Start Vite dev server on port 5170
npm run dev
```
