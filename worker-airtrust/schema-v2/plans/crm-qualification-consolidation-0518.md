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
The company PCRM Rev.03 defines CRM as an organization-wide programme, while the IOGP/Petrobras 690-2.46 requirements add crew-specific initial/recurrent, LOFT and non-technical-skills requirements. The Petrobras RPEA/PQ-C 2026 audit matrix explicitly treats item 46 as crew resource management and records the dedicated crew structure. This supports keeping `D3` separate while eliminating duplicate non-crew models.

## Data handling
- No physical delete.
- `CRM-LOS-T`, `CRM-LOS-P` and `MNT_FATORES_HUMANOS_CRM` are soft-deleted.
- Active Compliance rules for those retired models are soft-deleted. `CRM_CORP` already has a company-wide mandatory rule, so maintenance-specific duplicate rules are not copied.
- All maintenance CRM qualification-history rows are reassigned to `CRM_CORP`; evidence fields such as completion date, expiration date, workload, certificate file/hash and renewal lineage are not rewritten.
- Any planned training still pointing at the maintenance duplicate is reassigned to `CRM_CORP`.
- `CRM_CORP` is linked to all currently active Costa do Sol sectors so the existing multi-sector RBAC resolver uses each employee's own sector domain for history/certificate access.

## Preflight invariants
Before production apply, the governed workflow must prove:
- exactly one active Costa do Sol row exists for each of `D3`, `CRM_CORP`, `MNT_FATORES_HUMANOS_CRM`, `CRM-LOS-T` and `CRM-LOS-P`;
- LOS models have no qualification-history rows;
- the retired models have no active LMS course, simulator/check/curriculum, dependency, certificate or request references outside the explicitly migrated tables;
- the Schema V2 change is not already applied.

## Postconditions
- only `D3` and `CRM_CORP` remain active among these CRM models;
- `CRM_CORP` is named `CRM Corporate`, with 24-month validity, 16 h initial and 16 h recurrent;
- no qualification history, planned training, active requirement or active legacy sector link points to the retired maintenance/LOS types;
- `D3` remains active and unchanged;
- `CRM_CORP` has active links to all active Costa do Sol sectors and an explicit Tripulação `NAO_APLICA` override, while `D3` keeps the pilot obligation.

## Rollback
Use the D1 Time Travel recovery point captured by the governed Schema V2 workflow. Do not hard-delete or manually reverse production rows. If a later policy decision changes the model, ship a reviewed forward compensation.
