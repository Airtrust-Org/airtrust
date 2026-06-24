# AIRTRUST — Release Operations Policy (2026-06-24)

Status: **ACTIVE POLICY**
Scope: Ops / release pipeline only. No product code, no schema, no SQL.

This policy codifies the lessons from the 2026-06-23 Pages release incident, where a
single generic `CLOUDFLARE_API_TOKEN` was reused for two different purposes (Worker
and Pages) whose valid tokens are actually distinct. See
`docs/AIRTRUST_PAGES_RELEASE_RECOVERY_20260623.md`.

Companion: `docs/AIRTRUST_GIT_WORKTREE_AND_RELEASE_POLICY_20260624.md`.

---

## 1. Worker and Pages are separate deploys

`deploy-worker` (backend, Cloudflare Workers) and `deploy-pages` (frontend, Cloudflare
Pages) are independent jobs in `.github/workflows/deploy.yml`. They may be enabled
independently via the `deploy_worker` / `deploy_pages` workflow inputs and must never
be assumed to succeed or fail together.

## 2. Separate secrets per purpose

| Secret | Used by | Capability required |
|---|---|---|
| `CLOUDFLARE_WORKER_API_TOKEN` | `deploy-worker`, D1 migrations | Workers Scripts edit, D1 edit |
| `CLOUDFLARE_PAGES_API_TOKEN`  | `deploy-pages`               | Pages edit + membership read |
| `CLOUDFLARE_ACCOUNT_ID`       | both                         | n/a (account id) |

- The legacy generic `CLOUDFLARE_API_TOKEN` is **deprecated**. Do not reference it in
  any production deploy job. Keep it temporarily only as a documented legacy secret
  until the split tokens are confirmed `OK`, then remove it.
- Secrets are applied at the GitHub **`production` environment** scope. If a secret of
  the same name also exists at the repo scope, the environment value wins inside these
  jobs — so either align both scopes or rely on the environment scope only and document
  that choice. (This name-collision override was the root cause of the 2026-06-23 block.)

## 3. Preflight (before every deploy)

1. **Token health** — run `Debug Cloudflare Token` workflow; require `WORKER_TOKEN_OK`
   and/or `PAGES_TOKEN_OK` for whatever you are about to deploy.
2. **Build** — `test-and-build` job must be green.
3. **Artifact check** — Pages deploy verifies the FRMS strings are present in
   `dist/client/assets` before publishing.
4. **Rollback availability** — confirm the previous good deployment is identifiable
   (Pages keeps prior deployments; Worker keeps prior versions).

## 4. Smoke (after every deploy)

- `GET /api/version` → 200
- `GET /api/health` → 200
- A protected route without a token → 401 (e.g. `/api/lms/matriculas`)
- `/login` serves current UI
- `/sw.js` reflects the intended (kill-switch/decommissioned) state
- The main route affected by the release renders the expected change

## 5. Do not mix release types

A single deploy/PR must not mix: feature, pipeline, docs, and emergency hotfix —
unless it is an explicitly documented **release train**.

## 6. Migrations / SQL have their own gate

D1 migrations run only via the explicit `apply_production_migrations` input plus the
typed production confirmation. They never ride along in a normal deploy and require
separate authorization.

## 7. SIGVOOS / SegVoo

SIGVOOS/SegVoo remain **NO-GO** without formal authorization and have their own gate.
This policy does not change that.

---

## Current status (2026-06-24)

- Token split implemented in `.github/workflows/deploy.yml` and validated by
  `.github/workflows/debug-cloudflare-token.yml` (jobs: `diagnose-worker-token`,
  `diagnose-pages-token`).
- Manual secret action still required: populate `CLOUDFLARE_WORKER_API_TOKEN` and
  `CLOUDFLARE_PAGES_API_TOKEN` in the `production` environment, then run the debug
  workflow and require `WORKER_TOKEN_OK` + `PAGES_TOKEN_OK` before the Pages release.
