# Schema V2 training-compliance-canonical-pdf-alignment-0545

## Source, conflict and authority
On 2026-10-09 Training Management designated the attached 2-page QSMS/Safety Operational PDF MODIFICADO(1) as canonical for the 28 models in Costa do Sol (empresa_id=6).
This supersedes the 2026-10-07 V6 NR-05 universal-policy decision where contradictory.
The PDF itself records: NR-05 only designated CIPA, category Treinamento, no stated hours or validity; Regras de Ouro active model but no active requirement, with target pending validation (page 2 note 3).

## Live production comparison (2026-10-09 read-only)
NR-05: one company-wide rule currently active; Regras de Ouro: one company-wide rule currently active.
FDM-MECANICO: two correct function rules, but null charge; validity is lifetime (NULL).
Existing rule counts versus PDF roles: NR-11 0/2, NR-12 0/2, NR-20 2/4, NR-26 12/18, NR-35 0/2, FOD 13/20, PPSP 13/20.
All 28 models exist; remaining rules/metadata were not shown to diverge from the approved PDF and are left intact.
The additional 0536 FDM trainings and 0538 designation GESTOR remain intact because they are separate management decisions.

## Scope and safety
No deletion of LMS courses, credentials, history, completions, certificates, enrollments, employees, employee designations or R2.
No automatic batch enrollment/notification. This migration soft-deactivates only the legacy NR-05 universal requirement and Regras de Ouro compliance requirement.
Adds CIPA conditional requirement using existing MEMBRO_CIPA condition; never infers member identities.
Adds missing function rules using exact active job names. For NR-35, modality remains PRESENCIAL.
For NR-05, replaces model category with Treinamento and clears 0538 inferred duration/renewal fields; do not change historical LMS course metadata.
Only tenant 6 and active model/function records. Guard with production preflight, D1 recovery point, atomic change, ledger, postconditions and read-only smoke.

## Compensation and authorization
Forward-only compensating schema change on any subsequent revision, not a historical snapshot restore.
No production writes without exact SHA/change authorization. Model/case smoke must confirm no CIPA obligation without designation.
