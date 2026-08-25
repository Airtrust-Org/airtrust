# Governed staging release

> Historical filename retained for compatibility. GitLab is legacy; GitHub is the current code authority.

This is the governed staging release path. GitHub `Airtrust-Org/airtrust` is the source/merge authority. AirTrust CI has eight required gates split between GitHub Actions and Google Cloud Build (GCB). Cloudflare is the staging/production platform. GitLab and CircleCI are legacy and are not release gates.

## Preconditions

- GitHub `main` is the source of truth and the release uses its exact commit SHA.
- The three fast GitHub Actions gates must pass for the exact SHA: `lint`, `build-content-gates`, `worker-typecheck`.
- The five heavy GCB gates must pass for the exact SHA: `frontend-coverage`, `worker-tests-1`, `worker-tests-2`, `lms-smoke`, `public-e2e`.
- GCB publishes its result on the exact GitHub SHA as commit status context `airtrust-gcb`.
- `frontend-typecheck` standalone is not a required gate while the historical debt policy remains active; regression protection is provided by the ratchet within `frontend-coverage`.
- Required Cloudflare values are protected environment-scoped secrets/variables and are never placed in artifacts.
- Production requires separate explicit authorization for the exact production SHA.

## Sequence

`3 fast GitHub gates + 5 heavy GCB gates -> target assertions -> pre-deploy rollback capture -> governed migrations when approved -> worker deploy -> provenance verify -> frontend build -> Pages deploy -> smoke verify`.

## Execute the five heavy GCB gates for an exact SHA

Run only from a clean GitHub checkout whose `HEAD` is the exact PR head or merged `main` SHA being validated. The packaging script creates an isolated source archive with the Git provenance required by the GCB bootstrap. Do not substitute CircleCI, GitLab CI, or a local-only result for this build.

```bash
SHA="<exact-40-character-SHA>"
ARCHIVE="/tmp/airtrust-gcb-${SHA}.tgz"

bash scripts/package-gcb-provenance-source.sh "$SHA" "$ARCHIVE"
gcloud builds submit "$ARCHIVE" \
  --project=airtrust-ci-poc-tclrzo \
  --config=cloudbuild.ci.yaml \
  --substitutions="_AIRTRUST_SHA=${SHA}" \
  --async --format='value(id)'
```

Publish the build state to the exact GitHub SHA with:

```bash
bash scripts/publish-gcb-github-status.sh pending "$SHA" "<gcb-build-url>"
# after the build reaches a terminal state:
bash scripts/publish-gcb-github-status.sh success "$SHA" "<gcb-build-url>"
# or:
bash scripts/publish-gcb-github-status.sh failed "$SHA" "<gcb-build-url>"
```

Record the resulting build ID, exact `_AIRTRUST_SHA`, and the five heavy gate statuses. Resolve the active configuration from the current GitHub `main`; historical `cloudbuild.full-8-gates.yaml`, GitLab CI, and CircleCI definitions are not current entrypoints.

## Staging dispatch

Use `.github/workflows/deploy-staging.yml` from `main` with the exact reviewed release SHA. When migrations are required, pass only the explicitly approved/allowlisted filenames; the remote ledger decides idempotently whether each migration is already applied. Never replay the generic migration chain.

For the pending SIGVOOS shadow/LMS diagnostics release, the governed order is:

1. `0467_sigvoos_shadow_parallel_v1.sql`
2. `0468_sigvoos_shadow_leg_crew_v1.sql`
3. `0469_lms_completion_pendencias_snapshots.sql`

`0467` must precede `0468` when both are absent; `0469` is independent. The workflow must create its backup/recovery point and validate postconditions before the release is considered complete.

## Evidence and rollback

The release stores gate/build evidence, backup/recovery metadata, release manifest, Worker/Pages provenance, and smoke evidence.

Before deploy, a coherent Worker/Pages rollback target is captured. A later Worker/Pages failure rolls both surfaces back through the governed fail-closed release path. Do not improvise remote D1 DDL or use historical deployment paths.
