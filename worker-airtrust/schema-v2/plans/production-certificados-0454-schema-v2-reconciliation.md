# Production Schema V2 plan — reconcile qualification type domain override 0454

## Objective

Reconcile the production Schema V2 ledger with the schema state already present in D1 for change `qualificacoes-tipos-dominio-override-0454`, without recreating the existing column and without classifying any qualification type.

## Incident evidence

Run `30919588508`, attempt 2, established the following:

- the dedicated `CLOUDFLARE_D1_MIGRATION_API_TOKEN` was present and accepted;
- the current production schema contract passed;
- baseline `production-d1-baseline-v2-20260714` was active;
- no row existed in `airtrust_schema_changes_v2` for the 0454 change;
- a D1 Time Travel recovery point was captured;
- the atomic apply failed on `duplicate column name: dominio_codigo`.

The failed bundle did not add a ledger row. The error proves that `qualificacoes_tipos.dominio_codigo` already existed before that apply attempt.

## Reviewed operation

The reconciliation SQL only executes:

```sql
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_dominio_codigo
  ON qualificacoes_tipos(dominio_codigo);
```

The Schema V2 builder appends the exact ledger insert for the reviewed manifest. D1 executes the structural assertion/index creation and ledger insert atomically.

If the column is absent, SQLite rejects the index statement and the ledger row is not committed. No `ALTER TABLE`, `UPDATE`, classification, tenant data mutation, or permission widening is performed.

## Postconditions

The official workflow must confirm:

- the exact reviewed ledger row exists;
- `qualificacoes_tipos.dominio_codigo` exists as nullable `TEXT`;
- `idx_qualificacoes_tipos_dominio_codigo` exists on `qualificacoes_tipos`;
- every non-null domain override references an active operational domain;
- the production schema contract remains green.

## Rollback

No application data is changed. If the atomic execution fails, D1 restores the original state. If the reviewed ledger row is committed, it records the reconciled schema state and must not be removed manually.
