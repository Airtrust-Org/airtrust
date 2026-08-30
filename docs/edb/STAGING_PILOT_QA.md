# eDB staging pilot QA

## Purpose

The positive eDB shadow gate must be exercised without borrowing any real Costa do Sol credential or real operational flight. The sanctioned identity is therefore a dedicated synthetic staging fixture:

- login: `qa-edb-pilot@staging.airtrust.invalid`
- tenant: `empresa_id=6`
- application profile: `GESTOR`
- tenant role: `manager`
- employee registration: `QA-EDB-PILOT`
- password source: GitHub Environment `staging` secret `STAGING_SMOKE_PASSWORD`

The synthetic account deliberately reuses the centrally governed staging QA password secret, following the same pattern used by sanctioned staging QA identities. The password value must never be stored in the repository, chat, PR, issue, artifact or local worktree.

## Governed entrypoints

`scripts/staging` is not used directly by an interactive agent. The governed entrypoint is `.github/workflows/edb-staging-pilot-positive.yml`.

Two execution modes are supported:

1. **Manual evidence run** — `workflow_dispatch` from `main`, with the explicit confirmation phrase `AIRTRUST_EDB_STAGING_PILOT_POSITIVE` and the exact eDB application release SHA already deployed to staging.
2. **Post-deploy evidence run** — successful completion of `Deploy Staging (Official)` from `main` triggers the eDB positive workflow through `workflow_run`. The workflow shares the official staging concurrency lock, reads `/api/version`, resolves the exact live staging `sourceSha`, and uses that SHA as the expected release for the smoke.

The automatic mode is effective once this workflow version is present on the default branch. It is not used to manufacture retroactive evidence for staging releases that predate the automation.

## Target and fixture isolation

The workflow targets only `airtrust-db-staging-baseline-20260701` and the staging Worker host.

The seed is idempotent and writes only the exact synthetic QA identity/tenant-membership support records needed for authentication. It does not create or modify a real operational flight, aircraft, RDV, diary, revision, signature, maintenance record or ANAC evidence.

A non-synthetic existing tenant-6 record is never reactivated or overwritten by the fixture logic.

Rollback support is implemented by `node scripts/staging/seed-qa-edb-pilot.mjs --apply --rollback`, which deactivates/removes only the exact synthetic fixture records that match the reserved QA identifiers.

## Positive smoke semantics

The smoke verifies:

1. `/api/version` reports staging and the exact expected/resolved eDB release SHA;
2. authentication resolves the synthetic identity to tenant 6;
3. `/api/edb/capability` returns `200`, `enabled=true`, `officialLogbook=false` and `replacesPaper=false`;
4. a read-only operational eDB route (`active-diary`) crosses the tenant-6 pilot gate and manager RBAC using a deliberately impossible aircraft ID, returning no diary data;
5. a deliberately impossible flight proves the eDB error adapter preserves the safe `CONTROLE_VOOS_NOT_FOUND` status/code without leaking the repository's raw internal message;
6. no flight, aircraft or eDB operational mutation, production action or ANAC transmission occurs.

The workflow cleanup step runs under the governed staging environment after the positive-smoke attempt so the synthetic identity fixture does not become an operational account.

## Relationship to full lifecycle validation

This staging smoke is intentionally non-mutating for regulatory eDB domain records. It is not the full lifecycle test.

The mutating persisted lifecycle is validated separately in isolated CI:

- Node SQLite `:memory:` for the complete synthetic evidence lifecycle;
- Cloudflare Wrangler local D1 for 0477–0480 schema/trigger parity and immutability behavior, using a dummy local database ID, sanitized Cloudflare credentials and no remote write path.

The shared staging D1 is not treated as a disposable full-lifecycle database because eDB records are intentionally designed as immutable regulatory evidence.

This synthetic identity exists only to validate the guarded staging shadow. It is not an operational employee, pilot credential, regulatory signer or production account.
