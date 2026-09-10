# Pilot staging lease activation — 2026-09-10

Tracking issue: #580

## Scope

This change enables the public, frontend-side trust store required for the Pilot App offline lease verifier on staging origins only.

## Secret handling

The private ES256 JWK is not committed. It was provisioned as the Cloudflare Worker staging secret named `PILOT_OFFLINE_LEASE_PRIVATE_KEY_JWK` for `airtrust-api-staging`.

Only the public verification JWK is tracked in `public/pilot/pilot-lease-trust.js`.

## Key metadata

- key_id: `pilot-staging-20260910-01`
- algorithm: ES256 / P-256
- trusted origins:
  - `https://staging.airtrust.pages.dev`
  - `https://airtrust-staging.pages.dev`
- production origin trusted by this key: no

## Required runtime variables for staging

The Worker must also receive these runtime values before authenticated Pilot smoke can exercise lease creation and sync:

- `PILOT_OFFLINE_LEASE_KEY_ID=pilot-staging-20260910-01`
- `PILOT_OFFLINE_LEASE_TTL_MINUTES=720`
- `PILOT_OFFLINE_SYNC_ENABLED=true`

These are staging-only. Production remains disabled.

## Preconditions already satisfied

- 0488 staging apply completed through governed workflow.
- 0488 staging postconditions completed successfully.
- Worker/Pages staging code deploy completed successfully for `2cf9430a9a7899756c3e9d7930224e7f618913fd`.

## Remaining gates after merge

1. Confirm runtime values above are present in `airtrust-api-staging`.
2. Deploy staging Worker and Pages from the merge commit.
3. Run authenticated Pilot smoke.
4. Run real iPad/Android/PWA offline validation before any production discussion.
