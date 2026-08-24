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

## Execute the eight gates for an MR SHA

Run this only from a clean checkout whose `HEAD` is the exact MR SHA. The
packaging script creates an isolated source archive with the Git provenance
required by the GCB bootstrap; submit that archive to the current GCB
entrypoint. Do not substitute CircleCI or a local-only result for this build.

```bash
MR_SHA="<exact-MR-SHA>"
ARCHIVE="/tmp/airtrust-gcb-${MR_SHA}.tgz"

bash scripts/package-gcb-provenance-source.sh "$MR_SHA" "$ARCHIVE"
gcloud builds submit "$ARCHIVE" \
  --project=airtrust-ci-poc-tclrzo \
  --config=cloudbuild.ci.yaml \
  --substitutions="_AIRTRUST_SHA=${MR_SHA}" \
  --async --format='value(id)'
```

Record the resulting build ID, its exact `_AIRTRUST_SHA`, and all eight gate
statuses in the MR evidence. `cloudbuild.full-8-gates.yaml` is not a current
entrypoint; resolve the config from the current `origin/main` before running.

## Evidence and rollback

The release generates and stores gate logs, backup metadata, release manifest, Worker/Pages metadata, and smoke evidence.

Before deploy, a coherent Worker/Pages rollback target is captured. A later Worker/Pages failure rolls both surfaces back automatically via fail-closed trap in `scripts/staging/deploy-governed-staging.sh`.
