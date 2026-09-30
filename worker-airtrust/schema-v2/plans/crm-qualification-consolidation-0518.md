# crm-qualification-consolidation-0518

## Objective
Simplify the Costa do Sol CRM qualification catalog without changing the dedicated flight-crew CRM contract.

## Decision implemented
- Keep `D3` / **CRM — Tripulantes** separate and unchanged.
- Retire the unused `CRM-LOS-T` and `CRM-LOS-P` models; production currently has no qualification history attached to either model.
- Consolidate `MNT_FATORES_HUMANOS_CRM` into the existing `CRM_CORP` model.
- Rename the surviving model to **CRM Corporate**.
- Set the surviving corporate model to 24 months, 16 h initial and 16 h recurrent. This uses the PCRM recurrent option of 16 hours every two years; historical maintenance records keep their original dates, expiration dates and recorded workload as evidence of what was actually completed.

## Evidence basis
The current ANAC IS 00-010B defines the CRM initial phase as 16 classroom hours, allowing at most 8 hours of that initial phase to be replaced by EaD under the conditions in 5.3.2.2; the periodic phase is in-person and may be structured as 8 hours annually or 16 hours every two years. The company PCRM Rev.03 defines CRM as an organization-wide programme, while the IOGP/Petrobras 690-2.46 requirements add crew-specific initial/recurrent, classroom/LOFT and non-technical-skills requirements. This supports keeping `D3` separate while consolidating non-crew CRM at 16 h initial / 16 h recurrent / 24 months. No historical certificate is rewritten merely because the canonical workload changes.

## Data handling
- No physical delete.
- `CRM-LOS-T`, `CRM-LOS-P` and `MNT_FATORES_HUMANOS_CRM` are soft-deleted.
- Active Compliance rules for those retired models are soft-deleted. `CRM_CORP` already has a company-wide mandatory rule, so maintenance-specific duplicate rules are not copied.
- Before reassignment, active CRM history rows for the same employee and completion date are deduplicated. The evidence-rich/original row survives; redundant rows are soft-deleted, and renewal lineage pointing at a redundant predecessor is repointed to the survivor.
- All surviving maintenance CRM qualification-history rows are reassigned to `CRM_CORP`; evidence fields such as completion date, expiration date, historical workload and certificate file/hash are not normalized or regenerated.
- Any planned training still pointing at the maintenance duplicate is reassigned to `CRM_CORP`.
- `CRM_CORP` is linked to all currently active Costa do Sol sectors so the existing multi-sector RBAC resolver uses each employee's own sector domain for history/certificate access.

## Preflight invariants
Before production apply, the governed workflow must prove:
- exactly one active Costa do Sol row exists for each of `D3`, `CRM_CORP`, `MNT_FATORES_HUMANOS_CRM`, `CRM-LOS-T` and `CRM-LOS-P`;
- LOS models have no qualification-history rows;
- the retired models have no active LMS course, simulator/check/curriculum, dependency, certificate or request references outside the explicitly migrated tables;
- CRM history rows that qualify as duplicates have no active LMS-cycle, renewal-request or generated-training references that would become operationally orphaned by soft-delete; notification/audit logs may keep their original immutable references;
- the Schema V2 change is not already applied.

## Postconditions
- only `D3` and `CRM_CORP` remain active among these CRM models;
- `CRM_CORP` is named `CRM Corporate`, with 24-month validity, 16 h initial and 16 h recurrent;
- no active qualification history, planned training, active requirement or active legacy sector link points to the retired maintenance/LOS types;
- no active `CRM_CORP` history has more than one row for the same employee and completion date;
- `D3` remains active and unchanged;
- `CRM_CORP` has active links to all active Costa do Sol sectors and an explicit Tripulação `NAO_APLICA` override, while `D3` keeps the pilot obligation.

## Rollback
Use the D1 Time Travel recovery point captured by the governed Schema V2 workflow. Do not hard-delete or manually reverse production rows. If a later policy decision changes the model, ship a reviewed forward compensation.
