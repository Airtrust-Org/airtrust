# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AirTrust is a multi-tenant SaaS platform for aviation crew management (qualifications, scheduling, FRMS, LMS, SGSO). Production system with real data — never deploy, push, or run migrations without explicit authorization.

## Delivery Authority

- GitLab `origin/main` is the code authority.
- Google Cloud Build is the official CI and runs the eight required gates:
  `lint`, `build-content-gates`, `frontend-coverage`, `worker-typecheck`,
  `worker-tests-1`, `worker-tests-2`, `lms-smoke`, and `public-e2e`.
- Cloudflare hosts staging and production.
- CircleCI is retired/legacy. Do not use it as a current merge, release, or
  deployment gate, and do not fall back to it if GCB fails. Inspect
  `origin/main:cloudbuild.ci.yaml` before CI-dependent work.

## Architecture

Two distinct runtimes sharing the same repository:

| Layer | Tech | Entry point |
|---|---|---|
| Frontend SPA | React 19, React Router v7, Vite 6 | `src/react-app/main.tsx` |
| Backend API | Cloudflare Workers, Hono v4 | `worker-airtrust/src/index.ts` |

**Path alias**: `@` resolves to `./src` (configured in `vite.config.ts` and `tsconfig.json`).

**Database**: Cloudflare D1 (SQLite). No ORM — raw SQL via `c.env.DB.prepare()`. 356 sequential migrations in `worker-airtrust/migrations/`.

**Storage**: Cloudflare R2 via `c.env.BUCKET`.

## Development Commands

```bash
# Start both worker (Wrangler local :8787) and frontend (Vite :3000) concurrently
npm start

# Frontend only
npm run dev

# Worker only (local, no remote calls)
npm run dev:worker:local

# Type check
npx tsc --noEmit

# Build (production)
npm run build

# Lint (api-base conventions + secret guard + auth boundary guard)
npm run lint

# Frontend unit tests
npm run test:run

# Worker unit tests
npm run test:worker

# Run both test suites
npm run test:all

# E2E tests
npm run test:e2e

# Health check (local worker must be running)
npm run health

# Tail production logs
npm run logs:tail
```

**Local DB setup** (first time):
```bash
npm run setup:local        # initialize local D1
npm run setup:local:reset  # reset and re-initialize
```

Vite proxies `/api` → `VITE_DEV_PROXY_TARGET` (default `http://localhost:8787`). Set `VITE_DEV_PROXY_TARGET=https://api.airtrust.online/api` in `.env.local` to proxy directly to production (use with extreme care).

## Multi-Tenancy

Every authenticated request passes through `auth` + `tenantMiddleware` (applied globally in `index.ts`). These inject `c.get('empresaId')` and `c.get('userId')` into the Hono context.

**Critical rule**: Every DB query touching tenant data MUST include a `WHERE empresa_id = ?` clause (or equivalent JOIN). Skipping this leaks data across tenants.

Public routes are explicitly whitelisted in `index.ts` (search for `isPublicPath`).

## Auth

- JWT signed with `JWT_SECRET` (Wrangler secret). Library: `jose`.
- Frontend stores tokens in sessionStorage (or localStorage with "remember me").
- All authenticated API calls use `fetchWithAuth()` from `src/react-app/config/api.ts`, which handles token injection and automatic refresh on 401.
- Backend roles: `admin > manager > instructor > editor > student > viewer`. Use `requireRole('admin')` middleware for admin-only routes.
- Dev auth bypass: set `ENABLE_DEV_AUTH_BYPASS=true` in `worker-airtrust/.dev.vars` (never commit this file).

## Backend Route Conventions

Routes live in `worker-airtrust/src/routes/`. All routes returning data follow:
```json
{ "success": true, "data": [...] }
// or error:
{ "success": false, "error": "message" }
```

Zod validation via `@hono/zod-validator`. Rate limiting and no-cache headers are applied selectively in `index.ts` — check there before adding a new route that needs special handling.

Domain events are processed after each request via `domainEventProcessorMiddleware`.

## Frontend Conventions

- All pages are lazy-loaded with `lazyWithRetry()` (retry logic for chunk-load failures).
- Server state: TanStack React Query v5. Local state: Zustand.
- Forms: React Hook Form + Zod.
- Toasts: `sonner`.
- Icons: `lucide-react`.
- i18n: `useLanguage()` hook from `src/react-app/i18n/`.
- Service Worker is registered only in production (`import.meta.env.PROD`).

## Database Migrations

Migrations are numbered sequentially (`0001_...sql` through `038x_...sql`). The current highest is around 0383.

**Never run migrations automatically.** Apply them manually:
```bash
# Local
wrangler d1 execute airtrust-db --config worker-airtrust/wrangler.dev.toml --local --file=worker-airtrust/migrations/XXXX_name.sql

# Remote (requires explicit authorization) — use the reviewed wrapper, not raw wrangler.
# It enforces clean main/origin parity and unconditionally refuses any migration
# marked NO_GO_MIGRATION_PRODUCAO inside the SQL file (see scripts/apply-migration-production.sh).
AIRTRUST_ALLOW_PROD_DB_WRITE=YES \
AIRTRUST_CONFIRM_PROD_DB_WRITE="I understand this may modify production data" \
bash scripts/apply-migration-production.sh worker-airtrust/migrations/XXXX_name.sql
```

If a migration file contains a `-- NO_GO_MIGRATION_PRODUCAO` comment, it cannot be applied to
production through this wrapper under any flag. Lifting the block requires removing the marker
in a reviewed PR — never a runtime override.

If a schema change is needed but migration hasn't been authorized, implement the feature using existing schema and document the limitation.

## Key Module Locations

| Module | Backend route file(s) | Frontend pages |
|---|---|---|
| Qualificações | `routes/qualificacoes.ts`, `routes/qualificacoes-*.ts` | `pages/Qualificacoes.tsx`, `pages/qualificacoes/` |
| Simuladores/Voo | `routes/simuladores-core.ts` | `pages/Simuladores.tsx`, `pages/simuladores/` |
| Escalas (monthly roster) | `routes/escalas-core.ts`, `routes/escalas/` | `pages/escalas/` |
| EVD (daily flight schedule) | `routes/escalas-evd.ts` | `pages/evd/` |
| FRMS | `routes/frms.ts`, `routes/frms-*.ts` | `pages/frms/` |
| LMS | `routes/lms-*.ts` | `pages/lms/` |
| SGSO | `routes/sgso*.ts` | `pages/sgso/` |
| Funcionários | `routes/funcionarios.ts` | `pages/Funcionarios.tsx` |

## Linting Guards

`npm run lint` runs three checks:
1. `lint:api-base` — ensures API calls use consistent base URL patterns.
2. `guard:tracked-secrets` — ensures no secrets are committed.
3. `guard:auth-boundaries` — ensures protected routes cannot be reached without auth.

These must pass before any PR.

## Environment Environments

| Env | Worker name | D1 database |
|---|---|---|
| local | (wrangler.dev.toml) | local SQLite |
| development | `airtrust-api-development` | `airtrust-db-dev` |
| staging | `airtrust-api-staging` | staging D1 |
| production | `airtrust-api` | `airtrust-db` (real data) |
