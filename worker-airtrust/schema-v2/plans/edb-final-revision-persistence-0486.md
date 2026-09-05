# Schema V2 plan — eDB Final Revision Persistence (0486)

## Objective
Persist immutable local final-record revisions and final signature evidence after the preflight technical-awareness foundation.

## Tables
- `edb_registro_revisoes`
- `edb_registro_estado`
- `edb_assinaturas`

## Revision invariants
- every revision is tenant-scoped to an existing diary, open volume, flight and flight stage;
- every revision binds to one persisted PIC technical acknowledgement from 0485;
- payload JSON must match tenant, logical id, revision id/number, source flight/stage, correction metadata and exact persisted technical acknowledgement evidence;
- initial revisions cannot supersede another revision;
- correction revisions must supersede exactly the immediately prior revision for the same logical record and carry a correction reason;
- revision rows are immutable and cannot be deleted.

## Local lifecycle
Allowed persisted transitions are only:
- `DRAFT -> READY_FOR_PIC_SIGNATURE`
- `DRAFT -> CANCELLED`
- `READY_FOR_PIC_SIGNATURE -> PIC_SIGNED`
- `READY_FOR_PIC_SIGNATURE -> CANCELLED`
- `PIC_SIGNED -> OPERATOR_SIGNED`
- `PIC_SIGNED -> SUPERSEDED`
- `OPERATOR_SIGNED -> SUPERSEDED`

Each transition must increment the optimistic state version by exactly one.

## Final signatures
- only `PIC_FLIGHT_RECORD` and `OPERATOR_RECORD` are stored here;
- PIC signature requires `READY_FOR_PIC_SIGNATURE`;
- operator signature requires `PIC_SIGNED`;
- one signature of each type per revision;
- signature rows are immutable and cannot be deleted;
- cryptographic payload-hash verification remains the responsibility of the canonical repository/service because PIC and operator sign different derived canonical payloads.

## Explicit exclusions
0486 does not create:
- `ANAC_PENDING` or `ANAC_SYNCED`;
- ANAC outbox, receipt, endpoint, authentication, payload or acceptance semantics;
- cycle or IFR inference;
- discrepancy/maintenance/RTS persistence (that follows only after revisions exist).

## Rollback
Application rollback is sufficient while unused. Once regulated revision/signature evidence exists, destructive removal requires a separately reviewed archival/empty-table proof.

No staging or production apply is authorized by this plan.
