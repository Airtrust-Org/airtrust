# training-compliance-requirement-sanitization-0524

## Objective
Remove redundant or orphaned Training Compliance requirement rows and reconcile the reviewed 2026-09-30 audience decisions without changing historical training evidence or creating LMS enrollments.

## Sources and decisions
- AirTrust audited requirement matrix snapshot dated 2026-09-28.
- Reviewed 2026-09-30 decision matrix: audited audience is authoritative for who must train; controlled programs/norms support basis, content, modality and periodicity.
- Company decision: corporate AVSEC awareness applies to all employees; specialized AVSEC profiles remain additional.
- Company decision: FDM-EAD remains broad awareness for the audited population; FDM team designation remains an additional condition.
- Company decision: current Mechanics and Maintenance Assistants work both AW139 and S-76; both maintenance product requirements apply to those two functions.

## Change
1. Soft-deactivate generic company-wide `NAO_APLICA` fallback rows. Absence of an applicable rule already means no obligation.
2. Preserve specific exclusions that override broader rules, including governed RBAC 119/CRM exclusions.
3. Soft-deactivate active requirement rows whose qualification model is inactive or deleted.
4. Rebuild FDM-EAD organizational rules from the reviewed broad function audience, preserving condition-based FDM-team rules.
5. Normalize AW139 and S-76 maintenance product applicability to Mechanic and Maintenance Assistant.
6. Add the corporate AVSEC-awareness model/rule while preserving specialized AVSEC certification rules.
7. Complete audit metadata for the CRM Corporate flight-crew exclusion and D3 crew CRM rule.

## Safety
- No training history, certificate, LMS enrollment, employee record, condition assignment or tenant membership is deleted or rewritten.
- No automatic enrollment is enabled.
- All cleanup is soft-delete/disable at requirement-rule level.
- Employee-specific obligations are preserved; they are not inferred anew from history.
- The change is tenant-scoped to Costa do Sol (`empresa_id=6`) and references qualification/function identities only inside that tenant.

## Preflight
1. Production baseline V2 is active.
2. Schema V2 changes 0517, 0518, 0521 and 0523 are recorded.
3. Required Compliance tables/columns and active FDM/AW139/S-76 models exist exactly once.
4. The active function catalog contains Mechanic and Maintenance Assistant.

## Postconditions
1. Exactly one 0524 Schema V2 ledger row exists.
2. No generic unconditioned company-wide `NAO_APLICA` fallback remains.
3. No active requirement references an inactive/deleted qualification model.
4. FDM-EAD has the reviewed function audience plus any reviewed condition-based FDM team rule, with no stale sector/function variants.
5. AW139 and S-76 maintenance product rules apply organizationally to exactly Mechanic and Maintenance Assistant.
6. Corporate AVSEC awareness exists once and is mandatory company-wide; specialized AVSEC rules remain untouched.
7. Reviewed specific CRM exclusions remain active and audit metadata is complete.

## Rollback
Use the governed D1 recovery point captured immediately before mutation. After successful release, reverse only through a reviewed forward compensation; do not recreate generic N/A fallback rows.