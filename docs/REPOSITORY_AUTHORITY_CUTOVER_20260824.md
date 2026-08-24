# AirTrust Repository Authority Cutover — 2026-08-24

## Canonical contract

- **GitHub `Airtrust-Org/airtrust`** is the authoritative repository for code,
  branches, pull requests, merges, and future development.
- **Google Cloud Build (GCB)** remains the official CI authority. The exact
  source SHA, Git HEAD, `origin/main`, and merge-base must be proven by the
  versioned provenance archive before accepting its result.
- **GitHub Actions** is optional parity/check automation. It is not a release
  authority or a replacement for GCB in this cutover.
- **Cloudflare** remains the staging and production hosting platform.
- **GitLab `airtrust-group/airtrust`** is retained solely as historical legacy.
  No new development branch, MR, merge, deployment, migration, or CI gate is
  required there after this cutover.

## Reconciled history

The GitHub cutover branch is based on GitLab `main` at
`7024af4f25c310dbffffaabdc8f445161c467e5b`, preserving the newer valid
Completion Diagnostics V1 merge (MR !116) and its migration
`0469_lms_completion_pendencias_snapshots.sql` without applying it remotely.

It reapplies GitHub-only PR #16 (`12f3d23847320929b91573998fce06c06e394e4a`)
as a GitHub Actions parity workflow update. The workflow must not supersede
GCB as the canonical release gate.

## Explicit non-actions

This repository cutover does not deploy, apply migrations, write D1 or R2,
seed environments, or change Cloudflare topology.
