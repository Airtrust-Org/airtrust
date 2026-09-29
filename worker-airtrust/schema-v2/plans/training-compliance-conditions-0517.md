# training-compliance-conditions-0517

## Objective
Make Training Compliance auditable and risk/designation aware while keeping qualification history as immutable evidence rather than a source of obligation.

## Canonical model
- `compliance_condicoes`: tenant-scoped catalog of exposure, activity, designation and certification conditions.
- `funcionarios_compliance_condicoes`: dated employee assignments with source, normative reference and justification.
- `treinamento_requisitos.condicao_id`: optional extra applicability predicate, combined with the existing company/sector/function/employee/aircraft scope.
- `treinamento_requisitos.justificativa`: human-readable reason the requirement exists.
- `treinamento_requisitos.perfil_competencia`: profile/curriculum metadata (for example PTAP competency profile) without duplicating qualification models merely by job title.
- `treinamento_requisitos.validade_fonte`: `MODELO` or `EVIDENCIA`; document/exam-based requirements can use the validity date actually recorded on the evidence.

## Resolution semantics
A historical qualification never creates a current obligation by itself. Current obligation is derived only from the highest-priority active `treinamento_requisitos` rule that applies to the employee. A condition-specific rule applies only while the employee has an active dated assignment for that condition. Individual rules remain the highest-priority override; condition and aircraft specificity rank above generic organizational rules.

## Initial catalog
The migration seeds only condition definitions for Costa do Sol (tenant 6). It does not infer or assign conditions to people. Deterministic assignments derived from already-existing individual requirement rules are handled by a separately reviewed dry-run/apply reconciliation executor.

## Data safety
- Additive schema except for rebuilding the active unique index to include condition/profile dimensions.
- Tenant triggers reject cross-tenant employee, condition and requirement links.
- No qualification history, LMS enrollment, employee cargo, sector or aircraft assignment is rewritten.
- No LMS enrollment is created by this schema change.

## Operational rollout
1. Apply this Schema V2 change in staging from the reviewed SHA.
2. Deploy Worker and Pages from the same SHA.
3. Run the regulatory matrix reconciliation in dry-run and then apply only in staging.
4. Validate condition assignment CRUD, requirement justification/profile rendering, history-without-current-requirement behavior and notification/renewal suppression.
5. Production requires a new explicit authorization for the exact merged SHA, this change ID and the deterministic matrix reconciliation hash.

## Rollback
Use the D1 Time Travel recovery point captured by the governed Schema V2 workflow if the schema apply fails. After a successful additive apply, application rollback may stop consuming the new columns/tables; do not drop them ad hoc. Any reversal is a reviewed forward compensation.
