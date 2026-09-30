# training-compliance-designation-overrides-0521

## Objective
Use the generic Training Compliance designation/condition engine to model auditable inclusion and exclusion overrides, and configure the Costa do Sol RBAC 119 CRM audience without title-name heuristics.

## Canonical semantics
- Broad rules may target company, sector, function, sector+function or a specific employee.
- `NAO_APLICA` is an explicit exclusion override, not deletion of the broader requirement.
- Condition/designation predicates are reusable across any training requirement.
- Specificity remains: employee > condition/designation > aircraft > sector+function > function > sector > company.
- Qualification history never creates a current obligation.

## CRM decision
Five RBAC 119.69 management designations are seeded for Costa do Sol: accountable manager, operations manager/director, chief pilot, maintenance manager/director, and safety manager/director.
Each active designation makes `CRM_DIR_RBAC119` mandatory and makes `CRM_CORP` not applicable. Tripulantes continue under `D3`; a pilot who also holds an RBAC 119 management designation therefore keeps `D3` and additionally receives `CRM_DIR_RBAC119`.

## Safety and rollout
No employee is inferred or automatically assigned to a management designation. The user selects the actual occupants through the existing dated condition/designation assignment UI. No LMS enrollment is created by this change. Every rule remains tenant-scoped and auditable.

Apply only after 0517 (conditions) and 0518 (CRM consolidation) are present. Production application requires the governed Schema V2 workflow, exact SHA authorization, recovery point and post-validation.

## Rollback
Use the D1 recovery point if application fails. After successful application, reverse policy only through a reviewed forward compensation; do not hard-delete assignments or evidence.
