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

`scripts/staging` is not used directly by an interactive agent. The governed positive-pilot entrypoint is `.github/workflows/edb-staging-pilot-positive.yml`.

Two positive-pilot execution modes are supported:

1. **Manual evidence run** — `workflow_dispatch` from `main`, with the explicit confirmation phrase `AIRTRUST_EDB_STAGING_PILOT_POSITIVE` and the exact eDB application release SHA already deployed to staging.
2. **Post-deploy evidence run** — successful completion of `Deploy Staging (Official)` from `main` triggers the eDB positive workflow through `workflow_run`. The workflow shares the official staging concurrency lock, reads `/api/version`, resolves the exact live staging `sourceSha`, and uses that SHA as the expected release for the smoke.

The automatic mode is effective once this workflow version is present on the default branch. It is not used to manufacture retroactive evidence for staging releases that predate the automation.

The governed complete shared-staging lifecycle entrypoint is `.github/workflows/edb-staging-full-lifecycle.yml`. It is manual-only and requires all of the following before any D1 lifecycle access or write:

- dispatch from `main` only;
- explicit confirmation phrase `AIRTRUST_EDB_STAGING_FULL_LIFECYCLE`;
- `expected_release_sha` must be a full 40-character SHA;
- the workflow source `GITHUB_SHA` must equal `expected_release_sha` exactly;
- staging `/api/version` must report `environment=staging` and the same exact `sourceSha`;
- tenant `6` must be absent or exactly the reserved synthetic tenant `codigo=edb_pilot_smoke` before identity provisioning;
- the workflow shares the `deploy-airtrust-staging` concurrency group with the official staging deploy and positive eDB pilot so neither a release change nor shared tenant-6 cleanup can race the lifecycle.

The full lifecycle workflow intentionally fails closed when local QA source and deployed staging release differ. It must never use newer local fixture/smoke scripts to exercise an older Worker release.

## Target and fixture isolation

The workflows target only `airtrust-db-staging-baseline-20260701` and the staging Worker host.

The positive-pilot seed is idempotent and writes only the exact synthetic QA identity/tenant-membership support records needed for authentication. It does not create or modify a real operational flight, aircraft, RDV, diary, revision, signature, maintenance record or ANAC evidence.

A non-synthetic existing tenant-6 record is never reactivated or overwritten by the fixture logic. Both active and inactive non-synthetic tenant-6 occupation fail closed before QA sector/user provisioning.

Rollback support is implemented by `node scripts/staging/seed-qa-edb-pilot.mjs --apply --rollback`, which deactivates only the exact synthetic fixture records that match the reserved QA identifiers.

## Positive smoke semantics

The smoke verifies:

1. `/api/version` reports staging and the exact expected/resolved eDB release SHA;
2. authentication resolves the synthetic identity to tenant 6;
3. `/api/edb/capability` returns `200`, `enabled=true`, `officialLogbook=false` and `replacesPaper=false`;
4. a read-only operational eDB route (`active-diary`) crosses the tenant-6 pilot gate and manager RBAC using a deliberately impossible aircraft ID, returning no diary data;
5. a deliberately impossible flight proves the eDB error adapter preserves the safe `CONTROLE_VOOS_NOT_FOUND` status/code without leaking the repository's raw internal message;
6. no flight, aircraft or eDB operational mutation, production action or ANAC transmission occurs.

The workflow cleanup step runs under the governed staging environment after the positive-smoke attempt so the synthetic identity fixture does not become an operational account.

## Full synthetic lifecycle semantics

The shared-staging full lifecycle is reserved for exact synthetic fixtures and exercises the complete eDB operational path through the staging API while retaining immutable eDB evidence. Its mutable canonical flight/RDV fixture is exact-marker scoped and rolled back after the attempt; identity cleanup also runs for partial identity-apply attempts.

The remote lifecycle stops with the internally complete record at `OPERATOR_SIGNED`. At that point `internalRecordComplete === true` and there is no further internal `nextAction`. External ANAC queue/sync remains a separate controlled trail and the staging lifecycle does not invoke ANAC transmission.

The workflow must not be interpreted as authority to replace the official logbook process. Production activation, external ANAC adapter implementation and any production migration remain separately governed actions requiring explicit approval and accepted regulatory interface/security semantics.

## Relationship to isolated lifecycle validation

The positive staging smoke is intentionally non-mutating for regulatory eDB domain records. It is not the full lifecycle test.

The mutating persisted lifecycle is also validated independently in isolated CI:

- Node SQLite `:memory:` for the complete synthetic evidence lifecycle;
- Cloudflare Wrangler local D1 for 0477–0480 schema/trigger parity and immutability behavior, using a dummy local database ID, sanitized Cloudflare credentials and no remote write path.

Those isolated jobs do not write shared staging D1, production D1 or any external ANAC system. The governed shared-staging full lifecycle is an additional controlled evidence run, not a replacement for isolated CI.

This synthetic identity exists only to validate the guarded staging shadow. It is not an operational employee, pilot credential, regulatory signer or production account.
