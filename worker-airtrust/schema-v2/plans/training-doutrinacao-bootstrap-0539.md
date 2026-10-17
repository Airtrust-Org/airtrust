# training-doutrinacao-bootstrap-0539

## Purpose
Forward-only repair for environments where the canonical Costa do Sol Maintenance Indoctrination qualification (`MNT_INTEGRACAO_DOUTRINACAO`) is missing or inactive. This blocker was proven by staging run `37659105485` after `0536` passed and before `0537` wrote anything.

## Controlled source
`PRG-MNT-002 — Programa de Treinamento de Manutenção Rev.06`, dated 14/03/2025, item 20.3: the Maintenance Indoctrination is a combined training with minimum **8 h initial**, **4 h recurrent**, recurrent every **36 months** (or earlier for contractual/company need). MGM, MOM and MCQ are part of that curriculum.

## Ordering
This repair deliberately runs between already-numbered reviewed changes:
1. `0536_training_compliance_fdm_three_audiences.sql`
2. `0539_training_doutrinacao_bootstrap.sql`
3. `0537_training_catalog_source_backed_metadata.sql`
4. `0538_training_compliance_manager_designation_nr05.sql`

The non-numeric execution order is explicit because 0537/0538 were already merged when the real staging absence was discovered. Validators fail closed if 0537 or 0538 has already been applied before 0539.

## Change
- Tenant `empresa_id=6` only.
- If one canonical identity exists (even inactive/soft-deleted), preserve its ID and reactivate/normalize it.
- If no identity exists at all, create exactly one model inheriting category/category_id/area_id from active `MNT_MGM`.
- Set controlled PTM metadata and `8 h initial / 4 h recurrent / 36 months`.
- Do not create LMS courses, enrollments, employee requirements, histories, certificates or R2 objects.

## Preflight
- 0536 must be applied and fully valid.
- 0537 and 0538 must still be absent from the target ledger.
- 0539 must be absent.
- Exactly one active `MNT_MGM` source model must exist.
- At most one row (including soft-deleted/inactive) may use the canonical Doutrinação code; ambiguity fails closed.

## Postconditions
- Exactly one active, non-deleted canonical Doutrinação model exists.
- Its load/validity is `8 / 4 / 36` and it cites PTM Rev.06.
- No duplicate canonical code exists.
- 0536 postconditions remain valid.

## Recovery
Official Schema V2 workflow captures a D1 Time Travel recovery point before mutation. Compensation is forward-only; no ad hoc remote SQL.
