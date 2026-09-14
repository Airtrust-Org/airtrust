# Staging simulator planning after Schema V2 0490

## Decision

Schema V2 `0490_simulator_planning_curriculum_metadata.sql` is a production data
reconciliation for Costa do Sol at `empresa_id=6`. It is **not** a portable schema
migration and must not be applied to canonical staging.

Read-only inspection proved that staging `empresa_id=6` is `edb_pilot_smoke`,
while simulator-planning functional QA uses the isolated tenant
`qa_examiner_training`. PR #649 therefore removed 0490 from staging's schema
change allowlist and updated the staging planning smoke to use the canonical
`/comparar-cae` second stage.

## Read-only identity audit

Run:

```bash
node scripts/staging/audit-simulator-matrix-baseline.mjs
```

The command is hard-locked to `airtrust-db-staging-baseline-20260701`, issues
only SELECT/WITH/PRAGMA, and verifies:

- staging tenant id 6 remains `edb_pilot_smoke`;
- `qa_examiner_training` exists as the isolated functional-QA tenant;
- 0490 is not present in staging's D1 migration ledger;
- the QA tenant has simulator model/version fixtures available for runtime QA.

A healthy result is `STAGING_TENANT_IDENTITY_ISOLATED`. Any identity drift is a
hard stop; never repair it by copying Costa do Sol production data into staging.

## Functional staging validation

The correct staging path is the existing workflow
`.github/workflows/staging-simulator-planning-persistence-qa.yml`, which:

1. requires an exact already-deployed staging SHA that is an ancestor of trusted
   `main` and has canonical release gates;
2. verifies live Worker/frontend provenance against that SHA;
3. provisions only the dedicated synthetic examiner/planning fixtures;
4. generates a proposal, applies a manual crew adjustment, persists/reopens it,
   imports CAE, calls `/comparar-cae`, and verifies the CAE comparison preserves
   all existing proposal needs;
5. resumes the persisted planning in the real browser and generates the PDF;
6. keeps production target/data out of the run.

Do not dispatch this QA against a SHA that is not actually deployed to staging.
Deploy authorization remains governed separately from this runbook.

## Production boundary

0490 keeps its dedicated production preflight/postconditions and Schema V2
workflow. Nothing here authorizes a production database write, deploy, migration,
seed, import, or executor enablement. Production apply requires explicit
authorization tied to the exact current `main` SHA.

## Closure for issue #648

The original staging blocker was based on an invalid assumption that tenant id 6
represented Costa do Sol in both environments. It does not. The correct closure
is tenant isolation plus synthetic runtime QA, not production-matrix parity.
After a reviewed SHA containing PR #649 is deployed to staging and the governed
simulator-planning persistence QA passes, the staging portion of #648 is closed.
