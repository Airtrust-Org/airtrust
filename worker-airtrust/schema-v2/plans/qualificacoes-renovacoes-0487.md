# Schema V2 plan — Qualification Renewal Requests (0487)

## Objective
Create the canonical backing table for the active qualification-renewal request routes without changing existing qualification history rows.

## Table
- `qualificacoes_renovacoes`

## Data and tenant invariants
- the change is additive only and performs no backfill;
- every request references an existing `qualificacoes_historico.id`;
- runtime tenant isolation remains enforced through the existing qualification-history/employee tenant joins;
- status is constrained to `pendente`, `aprovada` or `rejeitada`;
- soft deletion is preserved through `deleted_at`;
- indexes cover active history lookup and active status/date queue lookup.

## Rollout
1. Merge only after the required repository gates are green for the exact SHA.
2. Validate the reviewed SQL locally against a disposable database with `qualificacoes_historico` present.
3. Apply only through the governed Schema V2 workflow using change ID `qualificacoes-renovacoes-0487`.
4. Verify the table, both indexes and the exact schema-ledger row before enabling or relying on the renewal routes in production.
5. No generic migration-chain replay is permitted.

## Rollback
Because 0487 is additive and initially contains no production data, application rollback is to stop using the renewal-request routes. Physical table removal is not part of this change and, once any renewal-request evidence exists, requires a separately reviewed archival/destructive change.

No staging or production apply is authorized by this plan.
