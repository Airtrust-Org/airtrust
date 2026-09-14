# Schema V2 plan — Training Enrollment Reconciliation (0494)

## Objective
Separate **training need** from **LMS enrollment** without converting historical/manual enrollments into compliance requirements by inference.

The compliance matrix remains the authority for who needs which training. LMS enrollment remains a delivery mechanism. This change stores only an explicit administrator decision that an otherwise-unmatched enrollment is intentionally **standalone** (`MANTER_AVULSA`).

## Scope and invariants
- `treinamento_requisitos` remains the source of compliance applicability;
- `lms_matriculas` remains the enrollment/history source and is not rewritten by this migration;
- `treinamento_matricula_reconciliacoes` stores tenant-scoped, reversible reconciliation acknowledgements;
- the only initial decision is `MANTER_AVULSA`; no decision can silently create a requirement;
- a later matrix rule always supersedes the need for a standalone acknowledgement in runtime classification;
- insert/update triggers reject cross-tenant enrollment references;
- no production data is seeded, inferred, cancelled or enrolled by the migration.

## Runtime rollout
1. Merge only after reconciliation API/UI, tenant/RBAC tests and migration tests pass.
2. Apply 0494 in staging through the official governed staging release path.
3. Validate `Setores`, `Matrículas × Matriz`, organization-first matrix editing and explicit batch enrollment of actionable gaps.
4. Confirm standalone decisions can be added/reopened without changing enrollment or requirement history.
5. Production requires separate exact-SHA authorization for 0494, Worker and Pages.

## Rollback
Application rollback is to stop reading/writing reconciliation acknowledgements. The additive table can remain as audit evidence. Destructive removal requires a separate reviewed change and recovery plan.

Merging this plan does not authorize staging or production apply.
