# training-compliance-evidence-multi-profiles-0520

## Objective
Allow one qualification/certificate evidence record to prove one or more explicit competency profiles without multiplying D1/D4 qualification models or duplicating the PDF.

## Dependency
`0519_training_compliance_evidence_profiles` must already be applied. The scalar `qualificacoes_historico.perfil_competencia` remains as a rollout/backward-compatibility projection; the relation table becomes authoritative for multi-profile qualification evidence.

## Data model
- `qualificacoes_historico_perfis_competencia` stores one active row per `empresa_id + historico_id + perfil_competencia`.
- A tenant guard trigger rejects a relation when the qualification history does not belong to the same tenant.
- Existing non-null 0519 scalar profiles are backfilled into the relation table.
- One PDF/history may therefore carry multiple rows such as `AVSEC_TRIPULANTE` plus another profile when the certificate explicitly proves both.

## Runtime rule
Manual certificate upload must explicitly confirm every profile proved by a profiled certificate. The Worker validates every selected value against active Compliance profiles for that qualification. Compliance expands one history into one evidence candidate per related profile and still requires an exact match to the effective requirement.

## Safety
No enrollment is created, no requirement is inferred from history, no qualification history is duplicated or deleted, and no PDF is copied. Existing 0519 single-profile behavior remains compatible before 0520 is applied; multi-profile writes fail closed until the relation table exists.

## Rollback
Use the D1 Time Travel bookmark captured immediately before apply. Do not drop the relation table manually after application; use a reviewed forward compensation if the model changes. The 0519 scalar column remains available for backward compatibility.
