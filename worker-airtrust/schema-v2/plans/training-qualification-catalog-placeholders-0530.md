# Schema V2 plan — training qualification catalog placeholders 0530

## Objective

Create five canonical Costa do Sol qualification models that will receive LMS/SCORM packages later:

- `REGRAS_OURO_PETROBRAS` — Regras de Ouro — Petrobras
- `JUST_CULTURE` — Cultura Justa
- `STOP_WORK` — Stop Work
- `ETICA_CONDUTA` — Código de Ética e Conduta
- `LGPD_SEG_INFO` — LGPD / Segurança da Informação

This change intentionally creates **qualification models only**.

## Source and decision

- `docs/AIRTRUST_EAD_BACKLOG_V4_20261003.md`
- Training Management decision on 2026-10-04: do not build SCORM packages now; create the qualifications in AirTrust and bind content later.

## Preconditions

1. Tenant `empresa_id=6` exists.
2. Exactly one active canonical qualification category with code `EAD` exists for tenant 6.
3. Existing models with the same codes are preserved; the change is idempotent.

## Writes

Only `qualificacoes_tipos` may receive new rows.

No writes are permitted to:

- `treinamento_requisitos`
- `lms_cursos`
- `lms_matriculas`
- `qualificacoes_historico`
- certificates, enrollments, assignments or employee records

## Classification

- Regras de Ouro: qualification area `QSMS` when that canonical area exists.
- Cultura Justa / Stop Work: qualification area `SEGURANCA_OPERACIONAL` when that canonical area exists.
- Ética / LGPD: intentionally left without `area_id` rather than inventing a new qualification area.

All five models use the canonical EAD qualification category so future LMS packages can bind to the model without another model migration.

## Validity and hours

`validade` and `carga_horaria` remain `NULL`. This change does not invent recurrence or duration. Those values may be defined later from the controlled source/policy when the package and requirement are configured.

## Compliance behavior

This change creates no `treinamento_requisitos`. Therefore none of the five qualifications becomes mandatory merely because the model exists.

## Rollback / compensation

Before remote apply, use the official Schema V2 recovery-point workflow.

Compensation, if ever required, is to soft-delete only rows created by this change **and only when** they have no LMS course, compliance requirement, history or other dependent record. Never delete history or evidence.

## Validation

Post-apply checks must confirm:

1. exactly one active model for each of the five codes in tenant 6;
2. all five point to the canonical active `EAD` category;
3. no active `treinamento_requisitos` were created for those model IDs by this change;
4. no LMS course/enrollment/history counts changed as a consequence of the migration;
5. re-running the SQL is idempotent.
