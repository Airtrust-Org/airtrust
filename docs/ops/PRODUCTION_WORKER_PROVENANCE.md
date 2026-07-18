# Production Worker deploy provenance

This documents the provenance evidence generated and registered by the
**production Worker-only** deploy path, and — importantly — the exact security
guarantee it does and does **not** provide.

## Where it runs

The same closed provenance chain is produced by three call sites, all sharing
the same deterministic hashing helpers so they agree byte-for-byte:

| Path | File |
|---|---|
| Worker-only, no migrations | `scripts/deploy-worker-safe.sh` |
| Worker-only, migrations gate | `scripts/deploy-worker-only.sh` |
| CI (`Deploy AirTrust` workflow, `deploy-worker` job) | `.github/workflows/deploy-airtrust.yml` |

Shared logic:

- `scripts/lib/worker-provenance.sh` — shell orchestration for the local paths.
- `scripts/lib/build-release-manifest.mjs` — deterministic manifest builder +
  SHA-256 (pure, unit-tested in `scripts/__tests__/build-release-manifest.test.mjs`).
- `scripts/lib/patch-wrangler-env-vars.mjs` — stamps the vars into the temp
  wrangler config that is actually deployed.

The runtime side that surfaces these values (`GET /api/version`, `/api/status`,
and `X-AirTrust-*` response headers) already existed and is unchanged:
`worker-airtrust/src/routes/system.ts` + `worker-airtrust/src/middleware/provenance.ts`.

## The chain

For every production Worker deploy the pipeline computes and records:

1. **Source SHA** — `git rev-parse HEAD` of the commit being deployed.
2. **Source tree** — `git rev-parse HEAD^{tree}` (exact tree state).
3. **Worker bundle SHA-256** — over the esbuild bundle (`index.js`) that
   `wrangler deploy --dry-run --outdir <mktemp -d>` produced. The output dir is
   created fresh every run via `mktemp -d` and never reused (this is the direct
   remediation of the 2026-07-18 stale-bundle incident; enforced by
   `scripts/guard-worker-bundle-provenance.mjs`).
4. **Wrangler config SHA-256** — over the exact temp `wrangler.production` config
   handed to `wrangler deploy`, hashed after the source/bundle vars are stamped
   but before the manifest hash is added.
5. **Release manifest** (JSON) — aggregates all of the above plus tool versions
   and build time.
6. **Release manifest SHA-256** — over the exact manifest bytes.
7. **APP_VERSION** — `"<iso8601-utc>-<short-sha>"`. SHA-derived by construction;
   the manifest builder rejects floating values (`latest`, `main`, `dev-local`,
   `managed-by-script`, `unversioned-remote`) and requires the short SHA to be
   embedded.
8. **APP_BUILD_TIME** — ISO 8601 UTC timestamp of the build.

All four `AIRTRUST_*` hashes are stamped into the deployed Worker's own
`env.production.vars`, so every response can echo them back.

Evidence artifacts (CI `deploy-worker` job):

1. **Pre-deploy release manifest** — uploaded as
   `airtrust-production-release-manifest` **before** the real `wrangler deploy`,
   so a later deploy/smoke failure cannot erase it.
2. **Post-attempt release attestation** — built with `if: always()` after
   deploy/smoke (success or failure) and uploaded as
   `airtrust-production-release-attestation`. Booleans come from real GitHub
   Actions step outcomes (`deployAttempted`, `deploySucceeded`,
   `bundleComparisonExecuted`, `bundleComparisonPassed`, `smokeExecuted`,
   `smokePassed`). The final wrangler config SHA-256 lives here
   (`wranglerConfigFinalSha256`), not inside the pre-deploy manifest.

## Cloudflare Worker Version ID — documented limitation

`wrangler deploy --dry-run` does **not** emit a Cloudflare Worker Version ID
(verified against wrangler 4.x in this repo — the dry-run output lists bindings
and exits, with no Version ID line). The **pre-deploy** release manifest
therefore records `workerVersionId: null` (the field may also be omitted). It
must never use a string placeholder such as `"unavailable-in-dry-run"` — that
reads like an identifier and invites downstream misuse.

The **real** Worker Version ID is only available after an actual `wrangler
deploy`. The CI `deploy-worker` job captures it from the deploy log
(`Worker Version ID: …`) and records it only in the **post-deploy attestation**
(and the job summary). It is intentionally **not** back-patched into the
pre-deploy manifest artifact.

## Dry-run bundle vs real-deploy bundle

The bundle SHA-256 published in the vars is computed from the **dry-run** bundle.
`scripts/lib/worker-provenance.sh` also ships `airtrust_verify_real_bundle_matches`,
which — in a real approved deploy window — re-bundles via
`wrangler deploy --outdir <fresh mktemp -d>` (the genuine publish) and compares
that bundle's hash to the published one.

This is **detection, not prevention**: the vars (including the published hash)
are already uploaded by the time the comparison runs, so a mismatch means "the
published `AIRTRUST_WORKER_BUNDLE_SHA256` is unverified — treat this release as
suspect and roll back", not "the bad value never shipped". A true guarantee
would require bundling, hashing, then a **second** network deploy with the
verified hash; that doubles the deploy per release and is deliberately not done.

**This provenance task never performs a real production deploy.** The function
exists and is reviewed for the real deploy window; it is not exercised here.

## HONESTY: pipeline-attested, not Cloudflare-attested

This mechanism is **pipeline-attested**. It attests to what the CI/deploy
pipeline itself built and hashed locally — the esbuild bundle and the wrangler
config it handed to `wrangler deploy`. It is **not** an independent re-hash of
the content Cloudflare actually stored and serves. Cloudflare does not expose a
publicly verifiable content hash of the deployed Worker in this setup.

A matching hash proves *"this is the artifact the pipeline built for this
commit"*. It does **not** prove *"these are the exact bytes Cloudflare's edge is
executing"*. Do not represent it as cryptographic proof of runtime content. See
`docs/ops/STAGING_RUNTIME_FORENSICS_2026-07-18.md` for the same classification
applied to staging.

## Validation

- `node --test scripts/__tests__/build-release-manifest.test.mjs` — pure,
  credential-free unit tests for the pre-deploy manifest/hash logic
  (`workerVersionId` null; rejects placeholder strings).
- `node --test scripts/__tests__/build-release-attestation.test.mjs` — pure
  attestation builder tests (real outcome flags, `sourceTree !== sourceSha`,
  smoke-failure path).
- `node --test scripts/__tests__/exact-final-config-harness.test.mjs` — local
  dry-run harness over `scripts/lib/worker-provenance.sh`: proves pre vs final
  config hashes differ, final SHA-256 matches file bytes, second dry-run uses
  that exact file, staging block stays byte-identical, production D1/R2 IDs
  unchanged, manifest `workerVersionId` is null, workflow has `if: always()`
  evidence steps, and a simulated smoke failure yields `smokePassed=false`.
  This harness validates **build + configuration wiring**, not live Cloudflare
  credentials or a real production publish.
- Local `wrangler deploy --env production --dry-run` validates bundle/config
  generation only. It does not prove secret validity. A real publish remains
  manual via `workflow_dispatch` on `Deploy AirTrust` from `main`.
