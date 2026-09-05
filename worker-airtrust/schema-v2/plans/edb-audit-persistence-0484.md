# Schema V2 plan — eDB Audit Persistence (0484)

## Change
`0484_edb_audit_persistence.sql`

## Objective
Persist the current tamper-evident eDB audit-chain domain contract as local, append-only evidence scoped to a diary created by migration 0483.

The database stores the event identity, scope, event type, actor JSON, payload JSON, chronology and SHA-256 link values. The application remains responsible for computing and cryptographically verifying event hashes with `audit-chain.ts`; SQLite/D1 provides structural and relational defense in depth.

## Invariants

- every event belongs to an existing same-tenant `edb_diarios` row;
- sequence starts at 1 and is unique per tenant/diary;
- sequence 1 requires a NULL previous hash;
- sequence N>1 must point to the exact hash of sequence N-1;
- event time cannot regress relative to the immediately prior event;
- event hash and previous hash use lowercase 64-character SHA-256 hex shape;
- preflight snapshot/PIC technical acknowledgement events require source flight + technical situation and must not depend on a final revision;
- final-record/signature/discrepancy/maintenance/RTS/supersession/cancellation events require a revision id;
- regulatory-data updates require a source flight;
- UPDATE and DELETE are always rejected.

## Explicit exclusions

0484 does not:

- recompute SHA-256 inside SQLite;
- create final revision, signature or discrepancy tables;
- add ANAC transport, outbox, receipt, acknowledgement or acceptance states;
- alter `cv_voo_etapas`, `cv_rdv_operacional` or legacy operational data;
- resolve cycle or IFR semantics from #91;
- implement any external #93 contract.

## Rollback / recovery
The migration is additive and inert until repository/runtime code writes audit events. Application rollback is sufficient while unused.

Once regulated evidence exists, destructive table removal is not an acceptable routine rollback. Any physical removal requires a separately reviewed change with explicit evidence-retention handling.

## Validation
Disposable SQLite tests must prove:

- same-tenant diary scope;
- valid first and second event insertion;
- wrong previous hash rejection;
- skipped sequence rejection;
- chronological regression rejection;
- invalid preflight/final scope shapes rejected;
- update/delete rejected;
- no ANAC transport/lifecycle constructs are introduced.
