# AirTrust staging governed-release execution specification

The official CI execution environment for AirTrust is **Google Cloud Build**,
configured by `cloudbuild.ci.yaml` on `origin/main`. CircleCI is
**LEGACY / RETIRED — NOT CURRENT CI**.

## Baseline

- Google Cloud Build `node:24` steps as declared in `cloudbuild.ci.yaml`.
- `git`, `bash`, `curl`, `openssl`, `python3`, `sqlite3`, Node 24 / npm, and project-pinned Wrangler via `npm ci`.
- Egress only to GitLab, npm registry, Cloudflare APIs, Workers/Pages staging endpoints and required browser-download hosts. No production credentials or routes.

## Controls

- Canonical release script: `scripts/staging/deploy-governed-staging.sh`.
- Ephemeral workspace/container per job; no persistent secret files; cache only npm packages.
- Protected, masked, staging-scoped variables for Cloudflare backup, migration, Worker, Pages and account access.
- Artifact retention for manifest/attestation/evidence.
- Fail-closed automatic rollback trap (Worker rollback + Pages forward-rollback).

## Official GCB validation gates

1. `lint`
2. `build-content-gates`
3. `frontend-coverage`
4. `worker-typecheck`
5. `worker-tests-1`
6. `worker-tests-2`
7. `lms-smoke`
8. `public-e2e`
