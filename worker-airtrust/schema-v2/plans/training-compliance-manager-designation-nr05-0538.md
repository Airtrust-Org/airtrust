# training-compliance-manager-designation-nr05-0538

## Decision
Training Management clarified on 2026-10-07 that the business concept is **Gestor**, not "Gestor de Treinamento". Manager-only training applicability must not be inferred from the text of a job title. A person enters this audience only when the company explicitly assigns the generic `GESTOR` designation.

Training Management also explicitly fixed NR-05 for Costa do Sol as **EAD, 24 months, 2 hours, all employees/functions**, under the Petrobras requirement adopted by the company. This is an explicit management decision and therefore supersedes the 0537 fail-closed null load/validity that was used when documentary evidence alone did not establish the hours.

## Change
- Tenant: Costa do Sol, `empresa_id=6` only.
- Create/normalize `compliance_condicoes.codigo='GESTOR'` with type `DESIGNACAO`.
- Replace job-title inference for `PPSP_SUP` and `BOWTIEXP` with a condition-based rule.
- Set `auto_matricular_ead=1` on those two Gestor rules; runtime assignment performs immediate fail-closed enrollment when exactly one active published linked course exists.
- Do not infer or insert any employee designation in schema.
- Normalize NR-05 to EAD / 24 months / 2 hours and replace the former CIPA-only rule with one company-wide mandatory rule.
- Keep linked NR-05 LMS load metadata aligned without fabricating a course or SCORM package.

## Safety
The schema change never writes employee designations, LMS enrollments, qualification history, certificates or R2. The runtime designation endpoint is tenant-scoped, RBAC-protected and audited; it preserves valid evidence and existing active enrollment, and fails closed when a course mapping is absent or ambiguous.

## Ordering
0538 depends on the source-backed metadata change 0537 because 0538 deliberately supersedes its NR-05 fail-closed metadata. Applying 0537 after 0538 would revert the management decision and is therefore prohibited by preflight ordering.

## Compensation
Use governed Schema V2 with a D1 Time Travel recovery point before mutation. Reverse policy only with a reviewed forward compensation; do not restore job-title inference or mutate employee designations ad hoc.
