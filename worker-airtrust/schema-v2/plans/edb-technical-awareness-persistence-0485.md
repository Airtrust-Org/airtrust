# Schema V2 plan — eDB Technical Awareness Persistence (0485)

## Objective
Persist the preflight technical evidence already defined by the current eDB domain:

- immutable aircraft/maintenance technical-situation snapshots;
- deterministic SHA-256 evidence stored by the application;
- one immutable PIC technical acknowledgement bound to the exact snapshot hash;
- tenant/flight/aircraft scope guards against current Controle de Voos.

## Tables
- `edb_situacoes_tecnicas`
- `edb_ciencias_tecnicas_pic`

## Safety posture
- additive and inert: no route or runtime wiring is enabled by the migration;
- no existing operational row is updated;
- snapshot rows and PIC acknowledgement rows cannot be updated or deleted;
- a supplied aircraft id must match the same-tenant `cv_voos` aircraft; null remains explicit missing evidence rather than an inferred identity;
- the acknowledgement must match snapshot tenant, flight, id and exact canonical snapshot hash;
- acknowledgement time cannot predate snapshot capture;
- at most one PIC acknowledgement exists for one technical snapshot.

## Explicit exclusions
0485 does not create or infer:
- regulated cycles;
- IFR actual/simulated classification;
- technical discrepancies or maintenance/RTS actions;
- final flight-record revisions or final signatures;
- ANAC outbox, receipt, endpoint, auth, payload, transmission or acceptance state.

#91 and #93 remain fail-closed dependencies.

## Rollback / recovery
While unused, application rollback is sufficient and leaves the additive tables inert.
After evidence exists, physical table removal could destroy regulated evidence and therefore requires a separately reviewed migration with archival/empty-table proof.

No staging or production apply is authorized by this plan.
