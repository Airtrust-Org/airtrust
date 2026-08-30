# Schema V2 Plan — eDB diary/volume/incident lifecycle integrity 0480

## Purpose

Make the remaining mutable lifecycle objects fail closed before any eDB staging activation.

## Preconditions

- Schema V2 baseline `production-d1-baseline-v2-20260714`.
- `0477_edb_operational_core.sql`, `0478_edb_anac_receipt_integrity.sql`, and `0479_edb_relational_integrity.sql` precede this change.
- eDB remains disabled and no staging/production eDB data is expected.

## Change

- make diary identity immutable and allow only `ATIVO -> ENCERRADO`;
- prohibit deletion of diaries and volumes;
- allow volume status only `ABERTO -> ENCERRADO`;
- require internally consistent closing evidence and make the closing act immutable once closed;
- keep incident police/ANAC references write-once;
- require valid evidence JSON/timestamps when incident references or reconstitution outcomes are recorded;
- allow incident status only `OPEN -> RECONSTITUTED|IMPOSSIBLE_TO_RECONSTITUTE`;
- prohibit deletion of integrity incidents.

`CLOSED` remains present in the original table check for forward compatibility but is intentionally unreachable in the current application/schema lifecycle until a separate closure contract is explicitly modeled.

## Postconditions

- a diary cannot be rebound to another tenant/aircraft/regulation or reopened;
- a closed volume cannot be reopened or have its closing act rewritten;
- historical diary/volume rows cannot be deleted;
- incident regulatory references cannot be replaced after recording;
- reconstitution outcomes require parseable evidence and cannot transition backwards;
- integrity incidents cannot be deleted.

## Rollback / recovery

This is additive trigger hardening. Before any future governed apply, create the normal recovery point. If rollback is required before activation, restore that recovery point rather than issuing destructive ad-hoc SQL.

## Activation posture

Defined only. Do not apply to staging or production as part of PR #110.
