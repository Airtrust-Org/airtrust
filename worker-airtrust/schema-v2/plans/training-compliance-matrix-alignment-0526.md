# training-compliance-matrix-alignment-0526

## Objective
Apply the 2026-10-02 reviewed Costa do Sol Training Compliance decisions without deleting historical evidence, creating LMS enrollments, or inferring current designations from training history.

## Authority and sources
- FORM-SGI-037 — Matriz de Treinamentos de QSMS Rev.03, validated 2026-03-25.
- MGSO Rev.18: SGSO initial 8 h, recurrent 4 h, three-year cycle.
- PRC-SSO-001 Rev.22: PRE annual cycle.
- Controlled Maintenance matrix and the existing 24-month controlled-course rule.
- Training Manager decisions dated 2026-10-02:
  - keep matrix audiences when they are broader than the regulatory minimum;
  - NR-11 applies to every Mechanic and Maintenance Assistant;
  - chemical/FDS training remains broad for operational personnel;
  - NR-20 uses the conservative Intermediate trail for the helicopter-maintenance hangar;
  - AVSEC awareness remains company-wide because every employee must be able to access the airport base;
  - LOFT remains a separate qualification/control;
  - controlled Maintenance courses remain at 24 months and that interval is a Petrobras/IOGP client criterion, not an internal-policy interval;
  - individual designations are reserved for genuinely specific programs/roles.

## Forward changes
1. Set D2/SGSO to 36 months, 8 h initial and 4 h recurrent.
2. Set PRE to 12 months.
3. Reactivate/retain LOFT and keep Commander/Copilot requirements.
4. Keep the bounded controlled Maintenance course list at 24 months and normalize active requirement provenance to CLIENTE / CONTRATUAL_CLIENTE.
5. Reconcile broad NR-11, NR-20, NR-26 and NR-35 audiences without requiring individual designations.
6. Set NR-20 metadata to 16 h initial, 4 h recurrent, 24-month cycle and HIBRIDO requirement evidence.
7. Keep NR-35 on a 24-month cycle with PRESENCIAL evidence.
8. Keep NR-26 broad without inventing a new fixed expiry in this change.
9. Keep AVSEC_CONSC company-wide with the reviewed airport-base-access rationale.
10. Seed only missing specific designation catalog entries for FDM administration/committee, LOSA analysis, eDB/logbook users and change-management participants.
11. Preserve broad FDM/PPSP requirements during the designation transition and mark them as transitional instead of narrowing them before manager lists are available.

## Safety properties
- Tenant scoped to empresa_id=6.
- No deletes from qualification history, certificates, LMS completion/evidence or enrollments.
- No auto-enrollment is enabled.
- Current designation assignments are not created or inferred.
- Existing evidence remains valid and auditable.
- Unrelated Maintenance/Other models are not reclassified as Petrobras/IOGP.
- The effective active rule set is stable on re-run; inserts are guarded by the active unique keys and INSERT OR IGNORE.

## Rollback / compensation
Forward-only. If a reviewed decision must be changed, create a new Schema V2 compensating change. Do not restore an old database snapshot over newer unrelated data.

## Required validation
- D2 validity=36, initial=8, recurrent=4.
- PRE validity=12.
- Exactly one active LOFT model per tenant and active Commander/Copilot LOFT requirements where those functions exist.
- Only controlled Maintenance models selected by the change have validity/provenance changed to the 24-month Petrobras/IOGP client criterion.
- NR-20 model has validity=24, initial=16 and recurrent=4; active reviewed function requirements use HIBRIDO.
- NR-35 active reviewed function requirements use PRESENCIAL and the model validity is 24 months.
- NR-26 broad reviewed operational requirements are active without a new validity override.
- AVSEC_CONSC keeps one company-wide mandatory rule.
- Added specific condition codes exist once and no employee assignments are created by this change.
- No tenant other than 6 is modified.
