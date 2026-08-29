# eDB staging pilot QA

## Purpose

The positive eDB shadow gate must be exercised without borrowing any real Costa do Sol credential or real operational flight. The sanctioned identity is therefore a dedicated synthetic staging fixture:

- login: `qa-edb-pilot@staging.airtrust.invalid`
- tenant: `empresa_id=6`
- application profile: `GESTOR`
- tenant role: `manager`
- employee registration: `QA-EDB-PILOT`
- password source: GitHub Environment `staging` secret `QA_EDB_PILOT_PASSWORD`

The password value must never be stored in the repository, chat, PR, issue, artifact or local worktree.

## Provisioning

`scripts/staging` is not used directly by an interactive agent. The governed entrypoint is `.github/workflows/edb-staging-pilot-positive.yml`, dispatched from `main` with the explicit confirmation phrase `AIRTRUST_EDB_STAGING_PILOT_POSITIVE` and the exact eDB application release SHA already deployed to staging.

The workflow targets only `airtrust-db-staging-baseline-20260701`. The seed is idempotent and writes only the exact synthetic employee, user and tenant membership. It does not create or modify a flight, aircraft, RDV, diary, revision, signature, maintenance record or ANAC evidence.

Rollback support is implemented by `node scripts/staging/seed-qa-edb-pilot.mjs --apply --rollback`, which soft-deletes/deactivates only the exact synthetic user and employee.

## Positive smoke semantics

The smoke verifies:

1. `/api/version` reports staging and the exact expected eDB release SHA;
2. authentication resolves the synthetic identity to tenant 6;
3. `/api/edb/capability` returns `200`, `enabled=true`, `officialLogbook=false` and `replacesPaper=false`;
4. a read-only operational eDB route (`active-diary`) crosses the tenant-6 pilot gate and manager RBAC using a deliberately impossible aircraft ID, returning no diary data;
5. no eDB operational mutation, production action or ANAC transmission occurs.

This identity exists only to validate the guarded staging shadow. It is not an operational employee, pilot credential, regulatory signer or production account.
