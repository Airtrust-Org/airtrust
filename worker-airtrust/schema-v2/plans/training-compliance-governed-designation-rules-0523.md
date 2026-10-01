# training-compliance-governed-designation-rules-0523

## Objective
Restore the five reviewed CRM Corporate exclusions associated with RBAC 119 management designations and make the corresponding condition-based regulatory rules unambiguous as governed definitions.

## Change
- Keep the five `CRM_DIR_RBAC119` mandatory condition rules active and normalize their governance metadata.
- Reactivate the five existing `CRM_CORP` `NAO_APLICA` condition rules created by 0521, including any that were soft-deleted through the generic API.
- Normalize the five Corporate exclusions to `origem=REGULATORIO` and `fundamento_tipo=PADRAO_EXCLUSAO`.
- Do not create, remove, or infer any employee-to-designation assignment.

## Safety
- Tenant is explicitly limited to `empresa_id=6`.
- The target condition set is exactly the five reviewed `RBAC119_*` designations.
- The migration updates only existing rule identities; it does not insert a second active rule for a designation.
- The company-wide CRM Corporate requirement remains untouched.
- Training history, certificates, LMS enrollments, employee records, and designation assignments are untouched.
- Application/API protection is delivered in the same release so governed designation rules cannot be edited or removed through the generic rule editor.

## Preflight
1. Production baseline V2 is active and 0521 is recorded.
2. 0523 is not yet recorded.
3. Exactly five active RBAC 119 designation definitions exist.
4. Exactly five active mandatory `CRM_DIR_RBAC119` designation rules exist.
5. Exactly five total `CRM_CORP` RBAC 119 exclusion rule identities exist across active and soft-deleted rows, one per designation.

## Postconditions
1. Exactly one 0523 Schema V2 ledger row exists.
2. All five management CRM rules are active and governed as regulatory designations.
3. All five CRM Corporate RBAC 119 exclusions are active, regulatory, and non-applicable.
4. The migration has not changed `funcionarios_compliance_condicoes`.

## Rollback
The governed Schema V2 workflow must capture a D1 Time Travel recovery point before mutation. If apply or postconditions fail, restore that point. After a successful release, reverse only through a reviewed forward compensation; do not soft-delete the governed rules ad hoc.
