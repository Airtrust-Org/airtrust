# Schema V2 0546 — canonical PDF Compliance category-contract replacement

## Cause and proven failure
The reviewed 0545 bundle was refused by the official staging D1 migration workflow on 2026-10-09: QUALIFICATION_CATEGORY_INVALID / SQLITE_CONSTRAINT_TRIGGER. Read-only sqlite_master confirmed trg_qualification_type_category_fk_update_0457 rejects every active qualification whose categoria_id becomes NULL. 0545 explicitly sets NR-05 categoria_id=NULL; neither 0545 stage nor production may be applied. The remote D1 file executor reported atomic rollback on the failed import; verify 0545 absence in both ledgers before 0546.

## Canonical scope
The Management-approved PDF modelos_qualificacao_qsms_seguranca_operacional_com_cargos MODIFICADO(1).pdf remains the only canonical source. This 0546 is the complete 0545 implementation with exactly one category-integrity repair: create an active tenant-6 generic qualification category codigo TREINAMENTO_GERAL, nome Treinamento, if it does not already exist; assign its non-null ID to the NR-05 model. Preserve NR-05 designated CIPA, no invented periodicity/hours, deactivate universal NR-05 rule, pause Regras de Ouro pending validation, complete NR-11/NR-12/NR-20/NR-26/NR-35/FOD/PPSP role obligations, set FDM-Mecânico 1-hour lifetime. Do not alter employee designations, enrollments, LMS completion, certificates, qualification history, R2 or other tenants. A generic Treinamento category must not be confused with Treinamentos Operacionais or EAD.

## Preflight
- Schema V2 baseline production-d1-baseline-v2-20260714 ACTIVE; 0534 and 0538 ledgers applied.
- Both 0545 and 0546 absent from the target ledger.
- Tenant-6 category TREINAMENTO_GERAL or category exactly named Treinamento absent (fail closed if another independently created identity exists).
- Production has all 28 approved active model codes, including NR-05 and designated CIPA condition.
- Staging is a historical partial fixture of 24 models; its absence of AUD_COMP/INTRO_SGQ/COL_SEL/MUDA and nonmatching job nomenclature is independently asserted. Its role coverage validator checks all 56 canonical pairs for existing job names, never fakes extra job roles. Production exact numeric gates stay at all 28 model codes and full job audience.
- Explicit recovery point, current reviewed SHA, CI gates, manifest and plan hashes, official allowlisted workflow, atomic bundle and ledger.

## Rollback / compensation
Use a forward-only reviewed corrective change on new source decisions; D1 Time Travel solely for governed incident recovery. Do not rerun failed 0545. Only exact tenant 6 rows are modified; the change is designed to be idempotent in disposable SQLite tests, not for repeated production execution.

## Postconditions
- Exactly one active tenant-6 TREINAMENTO_GERAL qualification category, valid foreign key on NR-05; no NULL categoria_id.
- Exactly one NR-05 requirement bound to MEMBRO_CIPA, zero universal NR-05 requirements.
- Regras de Ouro zero active requirements; FDM-Mecânico one hour and lifetime metadata, expected role audiences per respective environment.
- All seven affected function-target matrices validated; only real active job names count in staging, all canonical counts required in production.
- Exact Schema V2 0546 ledger/file/plan hashes and UI/API read-only smoke with source provenance.
