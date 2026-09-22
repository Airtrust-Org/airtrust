# training-compliance-daily-snapshots-0508

## Objective

Persist the real daily evolution of mandatory training compliance so the Compliance module can show historical trends without reconstructing or inventing past states.

## Data model

- Adds `training_compliance_daily_snapshots` as a tenant-owned aggregate table.
- `empresa_id` is mandatory and every read/write is tenant-scoped.
- `setor_id = 0` and `funcao_id = 0` represent the company-wide aggregate.
- Positive `setor_id` and/or `funcao_id` values represent sector, role, or sector+role aggregates.
- One row is stored per tenant, scope and calendar date.
- The snapshot stores only aggregate counts and percentage; it does not store employee PII.
- Daily writes use `ON CONFLICT (empresa_id, setor_id, funcao_id, snapshot_date) DO UPDATE`, making repeated cron execution idempotent for the same day.

## Safety / tenant

- Additive table only; no existing operational row is changed.
- No employee names, CPF, e-mail or phone are persisted in the snapshot.
- Managers may read only sector/role snapshots inside their authorized operational scope; tenant-wide rows are reserved for all-scope users.
- Absence of historical rows is represented as no history, never backfilled with fabricated values.

## Apply

1. Capture the governed D1 recovery point required by Schema V2.
2. Validate baseline and manifest hashes.
3. Apply `0508_training_compliance_daily_snapshots.sql` through the governed Schema V2 workflow.
4. Verify table constraints and both indexes.
5. Run the migration test and Compliance route/cron tests.
6. After deploy, verify the current-day company, sector, role and sector+role snapshots are written idempotently.

## Rollback / compensation

The change is additive and does not alter existing tables. Application code is fail-soft when the table is absent, so code can be rolled back independently. If the table must be removed later, do so only through a separate governed destructive schema change after backup/recovery validation.
