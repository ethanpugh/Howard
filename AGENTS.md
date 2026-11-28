# AGENTS.md — Howard Development Guide

## Overview

Howard is a Dockerised, self-hosted household management suite with 8 modules (`foyer`, `cadence`, `bloom`, `almanac`, `floodgate`, `ledger`, `quill`, `beacon`) and 3 profiles (`partner1`, `partner2`, `caregiver`). All source code is strict, zero-shortcut TypeScript (`tsconfig.app.json` + `tsconfig.server.json` extending `tsconfig.base.json`) backed by SQLite (`node:sqlite`, Schema v7) and a Hono REST + SSE API.

---

## Single Source of Truth Architecture

Data contracts and API types flow strictly in one direction:

1. **Zod Schemas (`shared/schemas/*.ts`)** — canonical runtime validators and TypeScript domain types (`z.infer<typeof ...>`), with zero `.passthrough()` or `z.unknown()` request stubs.
2. **Domain Routes (`server/domains/*.ts`)** — Hono routers validated via `...jsonBody(Schema)` (`Content-Type: application/json` `415` guard + `@hono/zod-validator`), returning typed JSON payloads.
3. **API App Type (`server/http.ts`)** — exports `export type AppType = ReturnType<typeof createApiApp>;`.
4. **Typed Client (`src/utils/apiClient.ts`)** — instantiates `hc<AppType>` (`createRpcClient({ profileId })`) and unwraps responses via `unwrapRpc(...)` (throwing `ApiError` on HTTP error or invalid JSON).
5. **Runtime Sync (`src/hooks/useHouseholdSync.ts`)** — unifies initial snapshot loading, boot PIN checks, profile-switch privacy clearing, and live cross-device Server-Sent Events (`/api/howard/events`, `/api/howard/sync`).

Shared pure helpers and defaults live in `shared/dateUtils.ts`, `shared/profileUtils.ts`, and `shared/defaults.ts`, imported by both `server/` and `src/`.

---

## Verification Command

Always run the full verification suite after finishing changes:

```bash
npm run verify
```

On Windows PowerShell (where execution policy blocks `.ps1` shims and PS 5.1 lacks `&&`):

```powershell
npm.cmd run verify
```

`verify` executes in order:
1. `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit && tsc -p tsconfig.server.json --noEmit`)
2. `npm run lint` (`oxlint`)
3. `npm test` (`node --test tests/*.test.ts`)
4. `npm run build` (`vite build`)
5. `npm run test:e2e` (`playwright test` against a compiled `./dist` and temporary `DATA_DIR`)

Notice `npm run test:e2e` expects `./dist` to exist — run `npm run build` before running `npx playwright test` standalone.

---

## Strict TypeScript & Native Node Execution Rules

`server.ts` runs **directly on Node without a build step** (`node server.ts` locally on Node `>=22.18.0`, and on `node:24-alpine` in Docker). Keep every rule below intact:

- **Split Environment Typeconfigs (`TS-05`)**: `tsconfig.app.json` restricts `src/` to browser `DOM` + `vite/client` types (no `@types/node` leakage), while `tsconfig.server.json` covers `server.ts`, `server/`, `tests/`, `e2e/`, and `playwright.config.ts` with `node` types.
- **Zero-Shortcut Strict Flags**: `tsconfig.base.json` enforces `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, and `forceConsistentCasingInFileNames`. Never add `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `any`, `as unknown as`, or `eslint-disable`.
- **`erasableSyntaxOnly: true`**: never use TypeScript `enum`, `namespace`, or constructor parameter properties (`constructor(private x: number)`). Use string union types / `as const` objects instead.
- **`verbatimModuleSyntax: true`**: always use `import type` for type-only imports (`AppType`, schemas, interfaces) so Node type-stripping leaves zero runtime references.
- **Explicit `.ts`/`.tsx` extensions**: always include `.ts` / `.tsx` on relative imports across `shared/`, `server/`, `src/`, and `tests/`.
- **Bundle Isolation**: `src/` may ONLY `import type` from `server/` (`import type { AppType } from '../../server/http.ts'`). Never import `server/` modules or `node:*` built-ins as runtime values in `src/`.
- **Explicit Form Interfaces & `exactOptionalPropertyTypes`**: Define explicit form/patch interfaces (`interface FooForm`) instead of `Omit<...>` on loose types, and include `| undefined` on optional component props that may receive explicit `undefined` values from Zod-inferred domain types. Also, Zod v4 `z.record(keySchema, valueSchema)` always takes 2 arguments.

---

## Hono RPC Chaining Rules

- Always chain route handlers fluently (`return new Hono().get(...).post(...)`) in `server/domains/*.ts` and `createApiApp` in `server/http.ts` so `AppType` preserves every route path and payload type.
- **Never** return raw `Response` objects (`auth instanceof Response`) from helper guards or chain `.all(...)` inside `createHowardRoutes`, `createQuillRoutes`, `createCadenceRoutes`, `createBloomRoutes`, or `createFloodgateRoutes` — both widen Hono's route union and collapse inferred `hc<AppType>` payloads to `{}` or `never`. Helpers like `requirePartner`/`requireSelfPartner` return discriminated unions (`PartnerAuthResult`), and `405 Method Not Allowed` is handled outside `createApiApp` in `server/http.ts`.

---

## Security, Privacy & Domain Invariants (Options 1B + 2B)

1. **High-Trust HTTP LAN Profile Model (Option 1B)**:
   - Howard operates over plain `http://` on a trusted home LAN using UI profile PIN switches (verified against `scrypt`-hashed `pinHash` values with `crypto.timingSafeEqual` and a 5-failure / 5-minute `429` rate limiter in `server/honoHelpers.ts`) rather than `HttpOnly` cookie sessions.
   - Mutating `/api/*` requests enforce same-origin `Origin` / `Sec-Fetch-Site` CSRF checks (`403`) and strict `Content-Type: application/json` checks (`415`) on JSON handlers.
2. **Partner 2 Privacy Isolation & UI Boundaries**:
   - **Floodgate** is strictly restricted to `partner2` on live REST/SSE endpoints (`floodgate: null`, revision masked to `0` for `partner1` and `caregiver`; `/api/floodgate/*` returns `403` for non-`partner2`).
   - **Almanac medical events**: any Almanac event with `linkToGpReport: true` OR `category === 'medical'` assigned to `partner2` (by `assignedToProfileId === 'partner2'` or matching Partner 2's name/alias, regardless of profile renames) MUST be filtered out server-side on sync, batch responses, and mutation authorization checks for `partner1` and `caregiver` (see `isAlmanacEventVisibleToProfile` in `shared/profileUtils.ts`).
   - **Quill privacy**: Quill `private` notes are strictly isolated to `ownerProfileId` across all profiles; private note labels never leak into other profiles' label lists, and private notes cannot trigger `'Remind in Almanac'`.
3. **Caregiver RBAC (`403`)**:
   - Caregiver cannot manage profiles, PINs, exports/backups, restores, Almanac, Ledger, Beacon, Cadence settings, Bloom molts/feeders/settings (except clearing `livePrey*` keys on `/api/bloom/settings`), or Household Quill labels, and can only tick/untick items on shared active (non-trashed) `caregiverVisible` (`House Note`) checklists in Quill.
4. **Full Household Admin Backup & Restore (Option 2B)**:
   - `GET /api/howard/backup` returns the full household SQLite snapshot (all shared modules plus Floodgate and private Quill notes, with `pin` / `pinHash` secrets redacted) for both `partner1` and `partner2` (`403` for `caregiver`).
   - `POST /api/howard/restore` is restricted strictly to `partner1` (`403` for `partner2` & `caregiver`), validates payloads upfront with `BackupRestorePayloadSchema`, rejects cross-kind Ledger ID collisions (`409`), creates an automatic pre-restore `VACUUM INTO` safety snapshot, and executes inside an atomic SQLite transaction.
5. **SQLite Schema v7 & UI Conventions**:
   - Bump `CURRENT_SCHEMA_VERSION` in `server/utils.ts` and add a versioned migration in `server/migrations.ts` whenever changing SQLite tables/columns. Never drop user data destructively during startup.
   - Reuse layout, modal, and button primitives from `src/components/HowardUI.tsx` instead of duplicating chrome, bind form controls with `useId()` `htmlFor`/`id`, use `formatTelHref` for `tel:` links, and sanitize CSV exports via `escapeCSVCell`.
   - All `server/`, `shared/`, `src/`, `tests/`, and `e2e/` source files must stay 100% TypeScript (`.ts`/`.tsx`). Do not leave stray `.js`/`.jsx` source files.
