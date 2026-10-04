# training-qualification-catalog-placeholders-0530

## Objective

Ensure tenant 6 has one active qualification model for each planned EAD subject, creating only codes that are missing:

- `REGRAS_OURO_PETROBRAS` — Regras de Ouro — Petrobras
- `JUST_CULTURE` — Cultura Justa
- `STOP_WORK` — Stop Work
- `ETICA_CONDUTA` — Código de Ética e Conduta
- `LGPD_SEG_INFO` — LGPD / Segurança da Informação

This change intentionally creates **qualification models only**. An existing non-deleted model with the same code is authoritative and is preserved verbatim; the change does not reclassify it, reset validity/hours, or detach existing LMS/Compliance relationships.

## Source and decision

- `docs/AIRTRUST_EAD_BACKLOG_V4_20261003.md`
- Training Management decision on 2026-10-04: do not build SCORM packages now; ensure the qualifications exist in AirTrust and bind new content later when applicable.

## Preconditions

1. Tenant `empresa_id=6` exists.
2. Exactly one active canonical qualification category with code `EAD` exists for tenant 6, for any rows that must be created.
3. At most one non-deleted model exists for each target code.
4. Any pre-existing target model must be active. Existing model semantics and dependencies are preserved.

## Writes

Only `qualificacoes_tipos` may receive **new rows for missing codes**.

No writes are permitted to:

- `treinamento_requisitos`
- `lms_cursos`
- `lms_matriculas`
- `qualificacoes_historico`
- certificates, enrollments, assignments or employee records

## Classification of newly created rows

- Regras de Ouro: qualification area `QSMS` when that canonical area exists.
- Cultura Justa / Stop Work: qualification area `SEGURANCA_OPERACIONAL` when that canonical area exists.
- Ética / LGPD: intentionally left without `area_id` rather than inventing a new qualification area.
- Every row actually inserted by 0530 uses the canonical active EAD qualification category.

Pre-existing rows are not forced into those values. This is important because an existing qualification may already carry controlled recurrence, duration, category, LMS course, or Compliance requirements that predate 0530.

## Validity and hours

For rows **created by 0530**, `validade` and `carga_horaria` remain `NULL`. The change does not invent recurrence or duration. Pre-existing rows keep their current values.

## Compliance behavior

This change creates no `treinamento_requisitos`, LMS course, enrollment, completion, history, or certificate. Existing requirements/courses attached to a pre-existing target model remain untouched.

## Rollback / compensation

Before remote apply, use the official Schema V2 recovery-point workflow.

Compensation, if ever required, is to soft-delete only rows created by this change **and only when** they have no LMS course, compliance requirement, history or other dependent record. Never delete or modify pre-existing target models merely because their code is part of this catalog.

## Validation

Post-apply checks must confirm:

1. exactly one active model for each of the five codes in tenant 6;
2. no duplicate active target code exists;
3. every row marked as created by 0530 points to the canonical active `EAD` category;
4. every row marked as created by 0530 has `validade` and `carga_horaria` still `NULL`;
5. no Compliance requirement or LMS course was attached to a row created by 0530;
6. re-running the SQL is idempotent and pre-existing target rows remain unchanged.

Production execution is additionally guarded by `scripts/schema-v2/validate-0530-production-preflight.sh` and `scripts/schema-v2/validate-0530-production-postconditions.sh`, wired into the canonical `apply-schema-change-v2.yml` workflow. The preflight rejects duplicate or inactive target models but deliberately permits existing valid models and their current LMS/Compliance relationships; the postconditions scope EAD/null/no-new-dependency assertions only to rows created by 0530.
