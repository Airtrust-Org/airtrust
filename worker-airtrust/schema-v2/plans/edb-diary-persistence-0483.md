# Schema V2 plan — eDB Diary Persistence Foundation (0483)

## Change
`0483_edb_diary_persistence_foundation.sql`

## Objective
Persist only the local, regulator-facing diary governance concepts already isolated in the current eDB domain work:

- one tenant-scoped diary identity per active aircraft;
- explicit opening and closing evidence for sequential diary volumes;
- minimum-retention metadata supplied by the application;
- append-only evidence for loss, misplacement or corruption incidents;
- local evidence that a police occurrence and ANAC notification were recorded;
- reconstitution outcome evidence.

This is deliberately **not** the historical #110 migration 0477. It is a new additive foundation on the current main.

## Explicit exclusions

0483 does **not**:

- alter `cv_voo_etapas`, `cv_rdv_operacional` or any existing operational row;
- add or infer regulated cycle values;
- classify legacy `tempo_ifr` as IFR actual or simulated;
- promote RDV free text into structured technical discrepancies;
- create final-flight revisions, signatures, maintenance events or the audit chain (those remain separate later migrations);
- create `ANAC_PENDING`, `ANAC_SYNCED`, an ANAC outbox, receipts, endpoint DTOs, authentication or acceptance semantics;
- send any notification to ANAC.

The `anac_notification_reference` fields on integrity incidents are **local evidence only**, mirroring the domain contract. They do not represent API transmission success or ANAC acceptance.

## Tables

### `edb_diarios`
Local diary identity bound to one active tenant aircraft. Identity fields are immutable. Only `ACTIVE -> CLOSED` is allowed, and closing is blocked while a volume remains open.

### `edb_volumes`
Sequential diary volume boundary acts. One open volume per diary. Opening identity/evidence is immutable; closing is one-way and closed evidence cannot be rewritten or deleted.

### `edb_incidentes_integridade`
Loss/misplacement/corruption evidence with tenant/diary/volume scope guards. Police and ANAC-notification evidence become write-once once recorded. Reconstitution is one-way from `PENDING` to `RECONSTITUTED` or `IMPOSSIBLE`.

## Tenant and integrity posture

- every diary insert proves the aircraft belongs to the same tenant and is not soft-deleted;
- every volume proves same-tenant active diary scope;
- every incident proves same-tenant diary scope and, when present, same-diary volume scope;
- deletes are rejected for all three evidence tables;
- identity updates are rejected;
- chronology guards reject police, notification and reconstitution timestamps that precede their required prior event.

## Rollback / recovery

The migration is additive and no runtime route is enabled by the schema alone. Application rollback is therefore sufficient: leave the unused tables and triggers inert.

A destructive DROP-based rollback is intentionally **not** bundled because it could erase regulated evidence after first use. Any physical removal must be a separately reviewed migration/change with an explicit empty-table or archival precondition.

Before any future remote apply, the normal governed staging backup/recovery-point process and exact Schema V2 hash verification are required.

## Validation

Local SQLite tests must prove:

- tenant aircraft scope is enforced;
- one active diary per aircraft;
- one open volume per diary;
- diary cannot close with an open volume;
- volume closure is one-way and closed evidence is immutable;
- delete attempts fail;
- incident diary/volume scope is enforced;
- police/notification chronology and write-once behavior are enforced;
- impossible reconstitution references the police occurrence;
- the migration creates no `edb_anac_*` tables;
- no `ANAC_PENDING` / `ANAC_SYNCED` lifecycle contract is present;
- the migration contains no `ALTER TABLE cv_voo_etapas` or legacy semantic promotion.
