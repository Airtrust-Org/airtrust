# Schema V2 plan — Training Compliance Requirements (0491)

## Objective
Create the canonical requirement matrix used to answer who must complete each training, independently of whether the employee already has a qualification history row.

## Scope model
- `EMPRESA`: applies to every active employee in the tenant.
- `SETOR`: applies to every active employee in one sector.
- `FUNCAO`: applies to a function/cargo across sectors.
- `SETOR_FUNCAO`: applies only to the selected sector + function combination.
- `FUNCIONARIO`: explicit individual exception or assignment.

## Data and tenant invariants
- additive schema change; `matriz_treinamento_funcao` is preserved for compatibility and audit evidence;
- active legacy function rules are backfilled once into `treinamento_requisitos`;
- every rule is tenant-owned by `empresa_id` and every referenced entity is validated again by runtime routes;
- scope shape is constrained in SQL so a rule cannot silently target the wrong dimension;
- `NAO_APLICA` is an explicit override and is excluded from compliance denominators;
- specificity order is `FUNCIONARIO > SETOR_FUNCAO > FUNCAO > SETOR > EMPRESA` when more than one rule for the same qualification applies;
- validity windows are explicit and historical rows are soft-deleted, never rewritten away.

## Rollout
1. Merge only after all eight release gates are green for the exact SHA.
2. Validate the change on a disposable SQLite database containing the current matrix, employees, sectors, functions and qualification types.
3. Apply in staging only through the governed Schema V2 workflow for change ID `training-compliance-requirements-0491`.
4. Validate the backfill count and tenant-scoped requirement endpoints before enabling the new UI in staging.
5. Production apply requires separate SHA/change-specific authorization; generic migration-chain replay is forbidden.

## Rollback
Application rollback is to stop using the V2 routes and continue reading the preserved legacy matrix. Physical removal or deletion of compliance evidence requires a separate reviewed destructive change.

No staging or production apply is authorized by this plan.
