# Governed staging release

This is the governed staging release path. It executes via official CircleCI (`.circleci/config.yml`) calling `scripts/staging/deploy-governed-staging.sh`.

## Preconditions

- GitLab is the source of truth and the release is the exact `CI_COMMIT_SHA` / `CIRCLE_SHA1` on `main`.
- All 8 official validation gates (`lint`, `build-content-gates`, `frontend-coverage`, `frontend-typecheck`, `worker-typecheck`, `worker-tests-1`, `worker-tests-2`, `lms-smoke`, `public-e2e`) must pass prior to release execution.
- Required Cloudflare values are protected, masked, environment-scoped variables. They are never placed in artifacts.

## Sequence

`gates -> target assertions -> pre-deploy rollback capture -> dry-run bundle hash -> worker deploy -> provenance verify -> frontend build -> pages deploy -> smoke verify`.

## Evidence and rollback

The release generates and stores gate logs, backup metadata, release manifest, Worker/Pages metadata, and smoke evidence.

Before deploy, a coherent Worker/Pages rollback target is captured. A later Worker/Pages failure rolls both surfaces back automatically via fail-closed trap in `scripts/staging/deploy-governed-staging.sh`.
