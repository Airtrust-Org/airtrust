# AirTrust staging governed-release execution specification

The official CI execution environment for AirTrust is **CircleCI** running on standard Docker executors (`image: node:24`). No dedicated self-hosted Linux VM or dedicated runner infrastructure is required.

## Baseline

- Standard CircleCI `node:24` Docker executor image.
- `git`, `bash`, `curl`, `openssl`, `python3`, `sqlite3`, Node 24 / npm, and project-pinned Wrangler via `npm ci`.
- Egress only to GitLab, npm registry, Cloudflare APIs, Workers/Pages staging endpoints and required browser-download hosts. No production credentials or routes.

## Controls

- Canonical release script: `scripts/staging/deploy-governed-staging.sh`.
- Ephemeral workspace/container per job; no persistent secret files; cache only npm packages.
- Protected, masked, staging-scoped variables for Cloudflare backup, migration, Worker, Pages and account access.
- Artifact retention for manifest/attestation/evidence.
- Fail-closed automatic rollback trap (Worker rollback + Pages forward-rollback).
