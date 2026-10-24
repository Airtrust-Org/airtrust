# training-catalog-metadata-references-0533

## Objective

Add a dedicated `referencias` field to LMS/qualification training metadata and align the active Costa do Sol LMS catalog with the controlled QSMS, Safety, Maintenance and Operations sources reviewed on 2026-10-05.

## Scope

- Additive DDL: `qualificacoes_tipos.referencias` and `lms_cursos.referencias`.
- Tenant `empresa_id=6` only for data updates.
- Curate description, one-topic-per-line program content, references, observations and loads for the 49 active LMS courses in the four reviewed areas.
- Correct PT6C-67C to 16h initial / 8h recurrent and Maintenance Doutrination to 8h / 4h.
- Preserve a stricter internal 24-month validity for all active Maintenance qualification models that were 36 months when reviewed, and recompute their existing history expiry snapshots to 24 months.
- Keep documentary 36-month sources visible in `referencias`; the 24-month AirTrust rule is explicitly identified as a Training Management decision in `observacoes`.
- Normalize NR-20 naming and preserve 16h/4h as the current reviewed matrix setting without falsely calling it an Iniciação course.
- Make NR-35 requirements presencial and NR-20 requirements hybrid; EAD completion alone no longer generates those regulatory qualifications.
- Reclassify LGPD from Segurança Operacional to QSMS taxonomy.

## Sources

- PRG-MNT-002 PTM Rev.07 (29/07/2026), including §§20.3, 20.6, 20.9, 20.10, 20.11 and 20.16.
- PRG-OPS-001 PTO Rev.10 and MNL-OPS-001 MGO Rev.14.
- PRG-SGI-005 Rev.05, MNL-SGI-001 Rev.09, MNL-SSO-001 MGSO Rev.18 and listed controlled manuals/programs.
- Current applicable RBAC/IS/NR references recorded per course.
- Training Management decision on 2026-10-05: Maintenance qualifications currently at 36 months are managed at 24 months in AirTrust.

## Preflight

1. Target is staging/production database expected by the official Schema V2 workflow.
2. `qualificacoes_tipos` and `lms_cursos` must exist and must not already contain `referencias`.
3. Tenant 6 must contain exactly one active qualification type for every referenced code.
4. QSMS qualification area must resolve uniquely for tenant 6.
5. Dry-run postconditions must show no cross-tenant writes and no missing metadata in the 49 reviewed LMS courses.

## Recovery / rollback

This is forward-only governed DDL. Capture the D1 recovery point required by the workflow before apply. If postconditions fail, restore the recovery point; do not attempt ad-hoc `DROP COLUMN` or remote SQL rollback.

## Postconditions

- Both metadata tables expose `referencias`.
- Every reviewed active LMS course has non-empty description, program content and references.
- No reviewed content contains the `ssot-probe-curl-` marker.
- Maintenance qualification codes reviewed as 36 months are 24 months and corresponding live history snapshots are 24 months.
- PT6C-67C = 16h/8h; MNT_INTEGRACAO_DOUTRINACAO = 8h/4h.
- NR-35 active requirements are PRESENCIAL and NR-20 active requirements are HIBRIDO; both have `auto_matricular_ead=0` and LMS auto-qualification disabled.
- LGPD resolves to QSMS area.
- Tenant isolation is preserved.
