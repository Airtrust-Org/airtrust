# training-compliance-loft-bootstrap-0527

## Objective
Provide the minimal governed prerequisite required by `0526_training_compliance_matrix_alignment.sql` when a live environment has no tenant-6 LOFT qualification model.

## Incident evidence
The official staging workflow for merge SHA `4f6abc1422b3dfbd545b567647728ced7b98d918` stopped fail-closed on 2026-10-02 during the 0526 read-only preflight with `loft-model-record expected=1 found=0`. The failure happened before the recovery point and before any D1 mutation.

## Authority and scope
- Tenant: Costa do Sol (`empresa_id=6`) only.
- Business decision: LOFT remains a separate qualification/control for flight crew.
- Source framing: current Costa do Sol PTO plus Training Manager decision dated 2026-10-02.
- This change is a prerequisite bootstrap only; 0526 remains the authority that creates/normalizes the Commander/Copilot compliance requirements.

## Forward change
1. If tenant 6 already has a current LOFT row, keep its identity and normalize only active/current metadata needed by 0526.
2. If LOFT exists only as a soft-deleted/historical row, reactivate one existing identity instead of creating a replacement ID.
3. If tenant 6 has no LOFT row at all, create one minimal active LOFT model with a 12-month default validity.
4. Do not create training requirements, LMS enrollments or employee assignments. Those remain outside this bootstrap.

## Safety
- No writes outside `empresa_id=6`.
- No writes/deletes to qualification history, certificates, completion evidence, LMS enrollments or training requirements.
- Existing LOFT identity is preferred to preserve historical foreign-key lineage.
- Existing non-null validity is preserved; 12 months is only the fallback/default when missing or newly created.
- Idempotent: a rerun leaves exactly one current tenant-6 LOFT model.
- 0526 itself is not modified.

## Staging order
1. Confirm 0524 is already applied and 0526/0527 are not in the staging migration ledger.
2. Apply 0527 through the official staging schema-change workflow and validate one current tenant-6 LOFT model.
3. Re-run the official staging workflow for 0526.

## Production order
If the exact production preflight for 0526 finds no tenant-6 LOFT model, apply this 0527 Schema V2 change first under a separately authorized exact SHA, then apply 0526 under its own authorization. Production is never implied by staging success.

## Rollback / compensation
Forward-only. The official workflow captures a D1 Time Travel recovery point before mutation. After successful application, any correction is a new reviewed compensating change; do not delete historical qualification data or improvise remote SQL.
