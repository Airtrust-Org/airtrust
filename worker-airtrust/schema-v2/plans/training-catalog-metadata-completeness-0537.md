# training-catalog-metadata-completeness-0537

## Objective
Complete and reconcile the Costa do Sol training catalog metadata (empresa_id=6) after the governed 0534-0536 compliance changes. The change is data-only and forward-only: it updates qualification/course metadata and regulatory completion guards without modifying employees, enrollments, historical qualifications, certificates, SCORM/R2 packages or other tenants.

## Controlled sources reviewed
- PRG-MNT-002 — Programa de Treinamento de Manutenção — Rev.06 (14/03/2025), especially item 20.3.
- MNL-MNT-001 — MGM — Rev.10; MNL-MNT-004 — MOM — Rev.08; MNL-MNT-005 — MCQ — Rev.08.
- MNL-SSO-002 — Manual de FDM — Rev.09, Anexo 1 (Administradores 6 h, Comitê 2 h, Grupo de Voo 1 h, Mecânicos 1 h).
- PRG-SSO-001 — Programa de Treinamento de Segurança Operacional — Rev.04.
- MNL-SSO-003 — Manual de Safety Case — Rev.10; MNL-SSO-001 — MGSO — Rev.18; PRC-SSO-004 — Rev.03.
- FORM-SGI-037 — Matriz de Treinamentos de QSMS — Rev.03.
- Costa do Sol 2025 LGPD course certificate (2 h EAD) plus PRC-GTI-002 Rev.02 / PRC-GTI-003 Rev.01.
- Current NR-04/NR-05/NR-20/NR-01 requirements.

## Reviewed decisions
1. MGM/MOM/MCQ: do not invent 8 h for each standalone card. PRG-MNT-002 item 20.3 defines 8 h initial / 4 h recurrent for the combined Maintenance Indoctrination.
2. Maintenance Indoctrination: normalize to PRG-MNT-002 Rev.06 and 8 h initial / 4 h recurrent / 36 months.
3. NR-05: current NR-04 classifies group 51.12-9 as GR 3; NR-05 therefore requires 16 h minimum including at least 8 h presencial. Keep the AirTrust EAD identity as the theoretical component, expose 8 h on the LMS card, set the qualification total to 16 h and block EAD-only qualification.
4. NR-20: restore the reviewed Intermediário path for the selected exposed audience: 16 h initial, 4 h update, hybrid completion, no EAD-only qualification.
5. LGPD: 2 h is documented Costa do Sol internal evidence, not a statutory minimum; preserve the internal 24-month cycle.
6. FDM: complete the 0536 models from MNL-SSO-002 Rev.09: Tripulação 1 h, MNT 1 h, Comitê/Gatekeeper 2 h. Do not invent LMS packages or nominal designations.
7. BowTieXP: complete curriculum/references from PRG-SSO-001 Rev.04 and MNL-SSO-003 Rev.10 while preserving the final matrix's internal 4 h / 24-month rule.
8. Fill previously blank observations with auditable applicability/limitations instead of generic filler.
9. Correct unsupported PRG-MNT-002 Rev.07 references to the controlled Rev.06.

## Pre-apply
- 0536 must be applied and validated.
- Existing target models must resolve uniquely in tenant 6.
- 0537 must be unapplied.
- The preflight verifies the expected pre-state for fields being superseded.
- Staging and production use only governed Schema V2 workflows and recovery/ledger contracts.

## Postconditions
- Ledger records 0537.
- NR-05 is 16 h total, hybrid, EAD-only autoqualification disabled, and its LMS theoretical component displays 8 h.
- NR-20 is 16 h initial / 4 h recurrent, hybrid, EAD-only autoqualification disabled.
- Maintenance Indoctrination is 8 h / 4 h / 36 months and MGM/MOM/MCQ have no fictitious standalone duration.
- FDM audience models and BowTieXP carry reviewed source metadata.
- All 49 reviewed active LMS courses have nonempty description, programmatic content, observations and references.
- The only reviewed active courses allowed to have no standalone numeric duration are MGM, MOM and MCQ, with explicit explanatory observations.
- No employee, enrollment, qualification history, certificate, R2 or cross-tenant writes.

## Compensation
Use a reviewed forward-only Schema V2 correction. D1 Time Travel recovery is a controlled contingency only; never overwrite unrelated production data.
