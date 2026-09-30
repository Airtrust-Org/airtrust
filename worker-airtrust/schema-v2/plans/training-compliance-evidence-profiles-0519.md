# training-compliance-evidence-profiles-0519

## Objective
Make a DGR or AVSEC completion satisfy Compliance only when its competency profile matches the effective requirement, while keeping one DGR/AVSEC qualification family.

## Data model
- `lms_matriculas.perfil_competencia` snapshots the applicable profile at enrollment/reactivation.
- `qualificacoes_historico.perfil_competencia` records the profile actually proved by the evidence.
- LMS-generated qualification history inherits the enrollment profile; renewals inherit the predecessor profile.
- Existing pilot D1/D4 histories are backfilled as `AVSEC_TRIPULANTE` / `PTAP_TRIPULANTE_VOO`; ambiguous legacy evidence remains NULL and therefore cannot satisfy a profiled rule after 0519.

## Runtime rule
When `treinamento_requisitos.perfil_competencia` is populated, Compliance requires an exact profile match in addition to qualification type, validity and required modality. For unprofiled requirements, profile does not restrict evidence.

## Safety
No enrollment is created, no email is sent and `auto_matricular_ead` is not changed. No history is deleted. The Worker remains compatible with the pre-0519 schema during rollout.

## Rollback
Use the D1 Time Travel bookmark captured immediately before apply. Do not remove the columns or rewrite history manually; ship a reviewed forward compensation if policy changes.
