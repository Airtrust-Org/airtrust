# Production Schema V2 plan — LMS Completion Diagnostics snapshots 0469

## Objective

Create tenant-scoped persistence for `AIRTRUST_COMPLETION_DIAGNOSTICS_V1` in production after staging validation. The snapshot remains informational and cannot authorize SCORM completion, score, qualification, or certificate issuance.

## Preconditions

- exact production release SHA is current GitHub `main` and explicitly authorized;
- GCB is green for that exact SHA;
- staging deployment of the same runtime code is validated for Diagnostics V1 and legacy fallback;
- production D1 schema contract is green;
- baseline `production-d1-baseline-v2-20260714` is ACTIVE;
- change `lms-completion-diagnostics-0469` is absent from `airtrust_schema_changes_v2`;
- fresh governed production recovery point/backup evidence exists.

## Reviewed operation

Create only `lms_completion_diagnostics_snapshots`, UNIQUE `(empresa_id, matricula_id, curso_id, tentativa)` index and tenant/matricula lookup index. No enrollment/progress backfill is included.

## Postconditions

- table exists with required NOT NULL tenant/enrollment/course/attempt/JSON columns;
- UNIQUE index is actually unique and covers the expected columns in order;
- tenant/matricula lookup index exists;
- exact Schema V2 ledger row matches reviewed hashes/baseline/SHA;
- production schema contract remains green.

## Rollback

Capture D1 Time Travel immediately before apply. For an application regression, roll back Worker/Pages and leave the additive table inert. Restore the recovery point only for partial/corrupt schema apply. Snapshot deletion/drop is a separate governed database action.
