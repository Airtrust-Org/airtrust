# training-compliance-fdm-three-audiences-0536

## Decision and scope
The Training Manager's 2026-10-07 decision adds three FDM training audiences to the Costa do Sol Compliance matrix (empresa_id=6), after the final 0534 change and the INTEGRA 0535 prerequisite repair:
1. Treinamento de FDM - Tripulação: Comandantes and Copilotos.
2. Treinamento de FDM - MNT: Mecânicos and Auxiliares de Manutenção, reusing FDM-MECANICO (EAD, one hour, lifetime) already defined in 0534.
3. Treinamento de FDM - Comitê e Gatekeeper: Gerentes de Segurança Operacional, Manutenção and Operações; Analistas de FDM; Coordenadores de FDM and Engenharia; individually appointed Comitê FDM members and Gatekeepers.

## Designation governance
Reuse FDM_COMITE (from 0526) and the distinct GATEKEEPER designation (from 0517). The administrative Compliance conditions editor supports nominal employee assignments under tenant/RBAC/audit guards. This change does not infer committee membership from a job, create designations or assign employees. Named jobs trigger only the training requirement.

## Models and history
Create new FDM-TRIPULACAO and FDM-COMITE-GATEKEEPER qualification/compliance models using the existing generic TREINAMENTO_OPERACIONAL category. No training modality, duration, expiry, EAD/SCORM package, LMS course, qualification evidence or enrollment is invented; these remain separate pending specification. Preserve the existing FDM-MECANICO model id, EAD/one-hour/lifetime metadata and its function rules, changing its displayed title to FDM - MNT. All FDM-EAD and GATEKEEPER legacy models, historical courses, certificates, qualification history and completion records remain untouched. Any existing GATEKEEPER obligation remains independent.

## Before application
- The 0535 INTEGRA repair and its postconditions are actually applied; its validator rechecks the full 0534 matrix.
- Exactly one active generic category TREINAMENTO_OPERACIONAL, one active FDM-MECANICO model, and one active designation catalog entry for each FDM_COMITE and GATEKEEPER, scoped to company 6.
- Both new qualification codes are absent; preflight fails closed on mismatch.
- Approved eight GitHub gates, governed staging recovery/ledger and exact production SHA/artifact/scope authorization.

## After application
- Both new qualification models exist with correct tenant category FK and unknown modality/hours/expiry.
- Required role rules exist for active matching job titles; both distinct designation conditions trigger the Comitê/Gatekeeper training without assigning employees.
- No SQL writes to other tenants, employee designations, historical qualifications, SCORM, certificates, LMS courses or enrollments.

## Compensation
Forward-only reviewed Schema V2 adjustment if audience or metadata changes. D1 Time Travel rollback only as a controlled contingency, never over unrelated production data.
