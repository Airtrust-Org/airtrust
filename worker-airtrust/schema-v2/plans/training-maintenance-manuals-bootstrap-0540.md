# training-maintenance-manuals-bootstrap-0540

## Cause
Two governed staging attempts established an environment prerequisite gap rather than a 0537/0539 SQL defect. 0537 stopped before apply because `MNT_INTEGRACAO_DOUTRINACAO` was absent; 0539 then stopped before apply because its source identity `MNT_MGM` was also absent. After two equivalent prerequisite failures, this forward repair restores the missing Maintenance manual identity layer instead of weakening downstream preflights.

## Controlled source
Repository-controlled Costa do Sol catalog material identifies `MNT_MGM`, `MNT_MOM`, `MNT_MCQ`, category `Treinamento de Doutrinação`, and area `MANUTENCAO`. These manuals are part of Maintenance Indoctrination and receive no standalone hours here. 0537 supplies source-backed descriptive/reference metadata.

## Ordering
Operational order: 0536 -> 0540 -> 0539 -> 0537 -> 0538. 0540 refuses to run after 0537, 0538 or 0539.

## Change
Tenant `empresa_id=6` only. Create/reactivate the canonical Doutrinação category if needed; preserve IDs for existing manual identities; create only identities that are completely absent; bind them to the canonical Maintenance area and leave validity/workload null. No LMS course, enrollment, employee assignment, history, certificate or R2 write.

## Validation
Preflight requires 0536 applied; 0537/0538/0539/0540 absent; exactly one active `MANUTENCAO` area; at most one row for each target manual code and at most one canonical Doutrinação category identity. Postconditions require one active canonical category and exactly one active `MNT_MGM`, `MNT_MOM`, `MNT_MCQ`, all with null workload and the Maintenance area, while 0536 remains valid.

## Recovery
Official Schema V2 captures a D1 Time Travel recovery point before mutation. Compensation is forward-only; no ad hoc remote SQL.
