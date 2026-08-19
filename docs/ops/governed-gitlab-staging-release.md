# Governed GitLab staging release

This is an additional, staging-only release path. It does not replace `.github/workflows/deploy-staging.yml`, CircleCI, or any production path.

## Preconditions

- GitLab is the source of truth and the release is the exact `CI_COMMIT_SHA` on `main`.
- The pipeline is created on protected `main` with `AIRTRUST_GOVERNED_STAGING_RELEASE=true` and `AIRTRUST_STAGING_RELEASE_CONFIRMATION=AIRTRUST_STAGING`. The pipeline supplies `AIRTRUST_RELEASE_ENV=staging` and derives the full 40-character `AIRTRUST_RELEASE_SHA` directly from `CI_COMMIT_SHA`; operators cannot substitute it.
- The job runs only on a protected, locked runner tagged `airtrust-staging-release`.
- Required Cloudflare values are protected, masked, environment-scoped GitLab variables. They are never placed in artifacts.

## Sequence

`contract -> gates -> backup -> preflight -> 0461 -> auth smoke -> preflight 0462 -> 0462 -> qualification smoke -> Worker -> Pages -> smoke -> attestation -> verify`.

The D1 steps reuse `backup-d1-staging.sh`, `preflight-0461-0462.mjs`, and `apply-approved-migration-with-recovery-point.sh`. Direct SQL is prohibited. 0462 cannot begin before 0461 ledger/postconditions and a new preflight succeed.

## Evidence and rollback

The pipeline stores gate logs, backup metadata (never a dump unless policy explicitly allows it), migration evidence, release manifest, Worker/Pages metadata, smoke evidence, and `AIRTRUST_STAGING_RELEASE_ATTESTATION_<SHA>.json` plus SHA-256. The attestation is generated only from step results and is separately verified.

Before deploy, capture a coherent Worker/Pages rollback target. A later Worker/Pages failure rolls both surfaces back using the reviewed GitLab staging mechanism. D1 migrations are forward-only: use the captured Time Travel recovery point and approved runbook, never compensatory ad-hoc SQL.

## Required GitLab configuration

- Protect environment `staging`; authorize only explicit Maintainers/Owners.
- Register a protected runner locked to this project and tagged only `airtrust-staging-release`.
- Scope Cloudflare tokens to `staging`; mark them masked/protected and avoid log output.
- Retain attestation and manifest artifacts at least 180 days. A release-signing key is optional today: unsigned attestations are labelled `ATTESTATION_UNSIGNED_BUT_HASHED`; protected signing is required hardening before any analogous production use.

## Incident response

Stop on any contract, target, backup, preflight, ledger, postcondition, provenance, or smoke failure. Do not bypass jobs, post synthetic checks, or use a developer laptop as a release executor. Production is out of scope.
