# Governed staging release

This is the governed staging release path. Google Cloud Build is the official
CI; its current validation entrypoint is `cloudbuild.ci.yaml`. Cloudflare is
the staging/production platform. The legacy CircleCI configuration is not a
release gate.

## Preconditions

- GitLab `origin/main` is the source of truth and the release uses its exact
  commit SHA.
- All 8 official GCB validation gates (`lint`, `build-content-gates`,
  `frontend-coverage`, `worker-typecheck`, `worker-tests-1`, `worker-tests-2`, `lms-smoke`, `public-e2e`) must pass prior to release execution.
- `frontend-typecheck` is not a standalone official gate unless it is added
  to the current `cloudbuild.ci.yaml`.
- Required Cloudflare values are protected, masked, environment-scoped variables. They are never placed in artifacts.

## Sequence

`gates -> target assertions -> pre-deploy rollback capture -> dry-run bundle hash -> worker deploy -> provenance verify -> frontend build -> pages deploy -> smoke verify`.

## Evidence and rollback

The release generates and stores gate logs, backup metadata, release manifest, Worker/Pages metadata, and smoke evidence.

Before deploy, a coherent Worker/Pages rollback target is captured. A later Worker/Pages failure rolls both surfaces back automatically via fail-closed trap in `scripts/staging/deploy-governed-staging.sh`.
