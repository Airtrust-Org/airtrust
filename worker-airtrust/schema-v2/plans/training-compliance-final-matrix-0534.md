# training-compliance-final-matrix-0534

## Objective

Make the QSMS + Segurança Operacional matrix supplied by Training Management on 2026-10-06 the canonical Training Compliance matrix for Costa do Sol (empresa_id=6).

The only explicit correction to the supplied table is: **NR-05 category is EAD, not Treinamento**.

This decision supersedes earlier training-compliance decisions whenever they conflict with this final matrix, including the prior NR-20 hybrid/16 h rule and the prior FDM/HFDM-team-only compliance rule.

## Canonical rules

The migration aligns model metadata and applicability to the 28 rows in the final matrix.

Key deltas from production before 0534:

- Código de Ética: 12 months / 3 h.
- Integração Corporativa: 24 months / 2 h.
- NR-05: EAD, designation MEMBRO_CIPA.
- NR-12: 24 months / 2 h for Mechanic and Maintenance Assistant.
- NR-20: EAD, 24 months / 2 h, for Mechanic, Maintenance Assistant, Supplies Assistant and Supplies Supervisor; EAD completion may again generate the qualification.
- NR-26: exact 18-function audience from the final matrix.
- Regras de Ouro - Petrobras: one canonical model, 24 months / 2 h, company-wide; preserve the evidence-bearing legacy model ID/course/history.
- PPSP Supervisores ARSO: applies to Gestores. In AirTrust this is represented by active organizational functions named Gerente or Gerente ....
- D2 / SGSO: 36 months / 4 h.
- FDM-EAD team obligation is retired from Compliance without deleting its course/history.
- New FDM-MECANICO: EAD, lifetime, 1 h, Mechanic and Maintenance Assistant.
- New BOWTIEXP: EAD, 24 months / 4 h, Gestores.

Individual designation rows for Auditoria Comportamental and Gestão de Mudanças are preserved, because the final matrix itself states that their cargo labels are descriptive of currently designated people and do not make every occupant of those cargos mandatory.

## Safety properties

- Tenant-scoped to empresa_id=6.
- No delete/rewrite of qualificacoes_historico, certificates or LMS completion evidence.
- The evidence-bearing Regras de Ouro model/course/history is preserved; only the unused duplicate model is retired.
- No employee designation is inferred for Auditoria Comportamental, Gestão de Mudanças, Brigada, CIPA, Primeiros Socorros or LOSA.
- Existing FDM-EAD course/history remains intact even though its active Compliance rule is retired.
- No production write outside the governed Schema V2 workflow.

## Missing EAD content

FDM-MECANICO and BOWTIEXP are introduced as canonical qualification/compliance models. This change does **not** fabricate SCORM/content packages. If no approved LMS content exists, the Compliance requirement can exist while course publication remains a separate controlled content task.

## Rollback / compensation

Forward-only. If the final matrix is revised again, create a new compensating Schema V2 change. Do not restore an old D1 snapshot over unrelated newer production data.

## Required validation

- NR-05 category = EAD.
- COD_ETICA = 12 months / 3 h.
- INTEGRA = 24 months / 2 h.
- NR-20 = 24 months / 2 h and no active HIBRIDO requirement; linked LMS course may generate qualification.
- NR-26 has exactly the final 18 active function requirements.
- NR-12 and FDM-MECANICO have exactly Mechanic + Maintenance Assistant requirements.
- PPSP_SUP and BOWTIEXP have exactly the active Gerente / Gerente ... function audience.
- D2 = 36 months / 4 h.
- one canonical active Regras de Ouro model exists with 24 months / 2 h and its historical evidence remains.
- no active Compliance requirement remains for FDM-EAD.
- NR-35 remains PRESENCIAL, 24 months / 8 h, and LMS completion alone does not auto-grant the qualification.
