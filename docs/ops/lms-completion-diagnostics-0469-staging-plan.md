# Staging plan — 0469 LMS Completion Diagnostics snapshots

## Scope

Apply `worker-airtrust/migrations/0469_lms_completion_pendencias_snapshots.sql` only to the official staging D1 through `.github/workflows/deploy-staging.yml` and `scripts/staging/apply-approved-migrations.sh`.

This plan does not authorize production.

## Change

The migration is additive DDL only. It creates:

- `lms_completion_diagnostics_snapshots`;
- unique index `idx_lms_completion_diag_unique` on `(empresa_id, matricula_id, curso_id, tentativa)`;
- lookup index `idx_lms_completion_diag_matricula` on `(empresa_id, matricula_id)`.

The stored JSON is informational and does not become an authority for SCORM completion, score, qualification or certificate generation.

## Preconditions

1. Release SHA is the exact reviewed GitHub PR head or current merged `main` accepted by the staging release guard.
2. GCB canonical gates are green for that exact SHA.
3. Target is exactly `airtrust-db-staging-baseline-20260701` / `bf9963f4-eb12-439b-a830-20bbf577ac22`.
4. Production DB ID `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae` remains blocked.
5. Ledger preflight includes `0469` and reports no ambiguous or registered-but-missing state.
6. A fresh verified staging D1 backup/recovery point is created by the governed workflow before the write.
7. The exact migration filename is explicitly passed in `approved_migrations`.

## Apply

Apply exactly one migration:

`0469_lms_completion_pendencias_snapshots.sql`

No generic migration-chain replay is allowed.

## Postconditions

Run `scripts/staging/validate-0469-postconditions.sh` read-only and require `POSTCONDITIONS_OK`.

It proves:

- the table exists;
- required tenant-scoped columns exist with expected types and `NOT NULL` constraints;
- the unique index exists and is actually unique;
- the unique index covers `empresa_id,matricula_id,curso_id,tentativa` in order;
- the tenant/matricula lookup index exists.

After schema validation, deploy the Worker and frontend from the same release SHA and run staging smoke.

## Compensation / rollback

The preferred application rollback is **not** an ad-hoc `DROP TABLE`.

Because the change is additive and older application code does not depend on the table, the safe first response to an application regression is:

1. roll Worker/frontend back to the previous coherent staging release;
2. leave the additive table inert;
3. confirm the previous release health.

If the schema application itself is partial or corrupted, use the verified staging backup / D1 recovery mechanism produced by the governed workflow to restore the database to the pre-0469 point. Do not improvise manual DDL on the remote database.

Any destructive cleanup of stored diagnostic snapshots is a separate governed database action.

## Production

Production requires a separate Schema V2 bundle, exact production release SHA, fresh backup and explicit production authorization. Successful staging application does not authorize production.
