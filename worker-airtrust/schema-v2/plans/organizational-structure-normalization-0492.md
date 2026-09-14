# Schema V2 plan — Organizational Structure Normalization (0492)

## Objective
Normalize employee sector/function ownership so Training Compliance and every employee-facing surface use the same organizational identity.

## Approved business mapping
- CTM is part of Manutenção: sector 21 merges into canonical Manutenção sector 11.
- Qualidade is QSMS: sector 15 merges into canonical QSMS sector 28.
- `Coord de Engenharia` becomes `Coordenador de Engenharia`.
- `Auxiliar de Suprimentos` belongs to Logística; the maintenance record using `Auxiliar de Suprimentos II` is normalized and moved to Logística.
- Tripulação contains only `Comandante` and `Copiloto`; any `1º Oficial` is normalized to `Copiloto`.
- Active `QA Fictício` employee fixtures are soft-deleted/inactivated; no employee history is physically deleted.
- The empty `Segurança` sector is intentionally out of scope because no merge destination was approved.

## Schema and tenant invariants
- `funcionarios.funcao_id` is added as the canonical function link while legacy `funcao`/`cargo` text remains for compatibility.
- function IDs are tenant validated by insert/update triggers;
- only `empresa_id=6` receives the approved organizational data correction;
- other tenants receive only the additive nullable column/index/triggers and no data rewrite;
- sector references in `funcionarios`, `qualificacoes_tipos_setores`, `lms_cursos_setores`, `setores_gestores`, and `treinamento_requisitos` are reconciled before source sectors are soft-deleted;
- duplicate sector mappings are soft-deleted before remap to preserve active unique indexes;
- no qualification, LMS completion, training history, certificate, or employee row is physically deleted.

## Rollout
1. Focused SQLite migration tests and runtime mutation tests.
2. Merge only with the eight official GitHub release gates green.
3. Apply 0492 to staging through its dedicated governed runner with backup/recovery point.
4. Deploy affected Worker/frontend if needed and validate real authenticated Compliance sector/function catalogs and employee drilldowns.
5. Production apply requires a fresh explicit authorization for the exact merged SHA and change ID `organizational-structure-normalization-0492`.
6. Post-apply production smoke verifies exact sector/function counts and absence of live references to merged sectors.

## Rollback / compensation
Use the D1 Time Travel recovery point captured by the governed workflow for full rollback. A forward compensation may reactivate source sectors and restore affected references from backup evidence, but must be separately reviewed. No ad hoc production SQL rollback is permitted.

No production apply is authorized by this plan.
