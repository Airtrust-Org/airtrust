# qualification-areas-0513

## Objective
Separate the classification of a qualification model from the organizational sector of an employee.

A qualification model can represent a course, exam, licence, check, certificate or other qualification. Its new `Área da Qualificação` describes the domain to which the qualification belongs. Employee applicability remains canonical in Training Compliance (`treinamento_requisitos`) and is not inferred from this classification.

## Canonical model
- New tenant-scoped catalog: `qualificacoes_areas`.
- New nullable compatibility column during rollout: `qualificacoes_tipos.area_id`.
- New/edited models require an active area at API/UI level after rollout.
- Initial Costa do Sol areas: Operações, Manutenção, QSMS and Segurança Operacional.
- More areas can be created in Qualificações > Classificações.

## Legacy backfill
The existing `qualificacoes_tipos_setores` table is preserved temporarily because older LMS/manager visibility paths still read it. It is no longer the model-classification UI.

For Costa do Sol, unambiguous legacy mappings are backfilled as follows:
- Tripulação / Operações -> Operações.
- CTM / Manutenção -> Manutenção.
- Qualidade / QSMS -> QSMS.
- SGSO / Segurança Operacional -> Segurança Operacional.

If one legacy model resolves to more than one qualification area, the migration does not guess: `area_id` remains null for manual classification.

## Tenant and data safety
- `qualificacoes_areas` is keyed by `empresa_id` with tenant-scoped active uniqueness.
- Triggers reject cross-tenant area assignment to `qualificacoes_tipos`.
- Initial seed rows are inserted only if tenant 6 exists.
- No employee sector, function, Compliance requirement or qualification history row is rewritten.
- Existing `qualificacoes_tipos_setores` rows are not removed by this change.

## Operational rollout
1. Apply the Schema V2 change through the governed workflow.
2. Verify the four initial areas for Costa do Sol.
3. Verify deterministic legacy backfill and list any models left without area because of ambiguity/unmapped legacy data.
4. Publish Worker and Pages from the same reviewed SHA.
5. Smoke-test Classificações, Modelos create/edit/filter and Training Compliance applicability.

## Rollback
Capture the governed D1 recovery point before apply. If the atomic schema apply fails, restore that recovery point. After a successful additive apply, application rollback may stop consuming `area_id`; do not drop the catalog or column ad hoc. Any schema reversal requires a separately reviewed forward compensation.
