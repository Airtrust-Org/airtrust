# training-compliance-loft-category-bootstrap-0529

## Objective
Replace the unapplied 0527 LOFT bootstrap with a category-safe prerequisite for `0526_training_compliance_matrix_alignment.sql`.

## Incident evidence
Official staging run `37085353764` reached the governed D1 recovery point at `2026-10-03T01:22:36Z`, then D1 rejected 0527 with `QUALIFICATION_CATEGORY_INVALID` from the qualification-category integrity trigger introduced by 0457. The remote file execution failed and no 0527 ledger row or postcondition success was produced. Migration 0527 remains immutable and unapplied.

## Cause
The 0527 local test modeled `qualificacoes_tipos` without `categoria_id` or the 0457 insert/update trigger. Its absent-LOFT path therefore omitted the required tenant-scoped active category reference. 0529 adds that contract to both SQL and tests.

## Scope and forward change
- Tenant 6 only.
- Preserve an existing valid LOFT category when present.
- Otherwise select only an active tenant-6 `TREINAMENTO_OPERACIONAL` category, falling back to active `TERICO` when that is the environment's canonical catalog.
- Reactivate an existing historical LOFT identity when available; otherwise create one minimal active LOFT model.
- Preserve existing non-null validity; use 12 months only as fallback/new-model default.
- Do not write training requirements, histories, certificates, completion evidence, LMS enrollments or employee designations.

## Staging order
1. Preflight must prove 0524 applied; 0526, 0527 and 0529 unapplied; and at least one reviewed tenant-6 category (`TREINAMENTO_OPERACIONAL` or `TERICO`) active.
2. Apply 0529 through the official staging schema-change workflow with D1 Time Travel recovery point.
3. Validate one current LOFT with a valid same-tenant active category and a unique 0529 ledger row.
4. Apply reviewed 0526 through the official staging workflow.

## Production order
Production remains untouched without explicit exact-SHA authorization. If production needs this prerequisite, use the governed Schema V2 workflow for 0529 and its explicit pre/post validators before separately authorized 0526.

## Rollback / compensation
Forward-only. Use the recovery point captured by the official workflow if recovery is required. Any later correction is a new reviewed compensating change; never improvise remote SQL or delete historical qualification evidence.
