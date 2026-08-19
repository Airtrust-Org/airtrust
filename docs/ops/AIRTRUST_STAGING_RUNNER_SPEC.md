# AirTrust staging governed-release runner specification

The runner is a dedicated Linux LTS VM, not a developer workstation. Prefer GitLab Runner Docker executor with a pinned Node 24 image; it gives repeatable dependencies and isolated workspaces. A shell executor is acceptable only on an immutable dedicated VM if Playwright/Docker constraints cannot be satisfied, with the same runner lock, network and secret controls.

## Baseline

- amd64 Linux LTS; 4 vCPU, 16 GB RAM, 80 GB encrypted disk minimum pending measurements from the first successful full run.
- GitLab Runner supported stable release; Docker executor; `node:24` image.
- `git`, `bash`, `curl`, `openssl`, `python3`, `sqlite3`, Node 24/npm, Playwright Chromium dependencies, and project-pinned Wrangler via `npm ci`.
- Egress only to GitLab, npm registry, Cloudflare APIs, Workers/Pages staging endpoints and required browser-download hosts. No production credentials or routes.

## Controls

- Runner tag: `airtrust-staging-release`; protected and locked to `airtrust-group/airtrust`.
- No untagged jobs and no shared-runner fallback.
- Ephemeral workspace/container per job; no persistent secret files; cache only npm packages.
- Protected, masked, staging-scoped variables for Cloudflare backup, migration, Worker, Pages and account access. Optional attestation signing key is file-type/protected and never logged.
- Artifact retention: 180 days for manifest/attestation/evidence; dumps excluded unless separately approved.
- Patch Node/Runner images regularly; pin project dependencies with lockfiles; record runtime versions in attestation.
