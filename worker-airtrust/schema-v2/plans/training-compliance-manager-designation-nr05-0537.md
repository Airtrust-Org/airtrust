# training-compliance-manager-designation-nr05-0537

## Decision
Training Management clarified on 2026-10-07 that the business concept is **Gestor**, not "Gestor de Treinamento". Manager-only training applicability must not be inferred from the text of a job title. A person becomes part of this audience only when the company explicitly assigns the generic `GESTOR` designation.

The same decision fixes NR-05 for Costa do Sol as EAD, 24 months, 2 hours, applicable to all employees/functions under the Petrobras requirement adopted by the company.

## Change
- Tenant: Costa do Sol, `empresa_id=6` only.
- Create/normalize `compliance_condicoes.codigo='GESTOR'` with type `DESIGNACAO`.
- Replace the 0534 function-name inference for `PPSP_SUP` and `BOWTIEXP` with one condition-based rule per qualification.
- Enable `auto_matricular_ead=1` only on those manager-designation rules so runtime can enroll a designated employee when the linked EAD course is available.
- Do not infer or insert any employee designation in schema.
- Normalize NR-05 to EAD / 24 months / 2 hours and replace its former CIPA-only designation rule with one company-wide mandatory rule.
- Keep linked NR-05 LMS metadata aligned; do not fabricate an LMS course or SCORM package.

## Safety
This change does not write `funcionarios_compliance_condicoes`, `lms_matriculas`, qualification history, certificates or R2. Employee designation remains an explicit audited runtime action. Tenant boundaries remain fail-closed. Existing completion evidence and historical enrollments are preserved.

## Ordering
0537 is operationally sequenced after the FDM three-audiences 0536 release.

## Compensation
Use the governed Schema V2 workflow with a D1 Time Travel recovery point before mutation. Reverse policy only with a reviewed forward compensation.
