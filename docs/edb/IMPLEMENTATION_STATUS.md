# eDB / Diário de Bordo Digital — Implementation Status

Status: **operational core + guarded staging-shadow surface implemented; not applied or deployed**.

Branch: `feat/edb-operational-core-0477`  
Draft PR: #110

## Regulatory posture

The AirTrust eDB remains a development/staging-shadow capability. Nothing in this branch claims ANAC authorization, homologation, acceptance or permission to replace the operator's currently valid official logbook process.

External ANAC transmission is deliberately not implemented because no official accepted endpoint/payload/acceptance contract has been established in this work. `ANAC_SYNCED` therefore remains fail-closed.

## Governed schema changes

Defined and reviewed, but not yet applied to staging or production:

- `0477_edb_operational_core.sql` — canonical operational semantics and immutable eDB core;
- `0478_edb_anac_receipt_integrity.sql` — outbox/receipt integrity hardening without guessed external semantics;
- `0479_edb_relational_integrity.sql` — diary/volume, discrepancy/maintenance and audit relational hardening;
- `0480_edb_diary_lifecycle_integrity.sql` — diary/volume/integrity-incident lifecycle hardening.

Each migration has a pinned Schema V2 manifest and an executable copy under `worker-airtrust/schema-v2/changes/`. Tests require the migration and reviewed Schema V2 SQL to remain byte-identical.

## Canonical source architecture

The eDB reuses Flight Operations / Controle de Voos instead of creating a parallel operational registry.

Canonical regulatory semantics live directly on:

- `cv_voo_etapas` — day/night/total flight time, actual/simulated/unclassified IFR, total landings, cycles, pre-engine-start fuel, POB, regulatory cargo and occurrences;
- `cv_voo_tripulantes` — explicit ANAC function code and validation provenance.

No `cv_voo_etapas_regulatorio` or `cv_voo_tripulantes_regulatorio` companion registry is used.

No silent semantic promotion is permitted: `starts` ≠ cycles; `pax` ≠ POB; legacy payload ≠ regulatory cargo; unclassified IFR ≠ actual/simulated IFR; landing counters ≠ cycles; RDV divergence ≠ maintenance discrepancy.

## Preflight boundary

Before flight:

1. identify the aircraft selected for the flight;
2. capture the current maintenance/technical situation;
3. persist an immutable snapshot in `edb_situacoes_tecnicas`;
4. calculate the canonical SHA-256;
5. obtain PIC technical acknowledgement bound to the exact snapshot ID/hash;
6. persist the acknowledgement in `edb_ciencias_tecnicas_pic`.

Aircraft/maintenance changes break the match and require a new snapshot/acknowledgement. Postflight values are not part of this preflight hash.

## Postflight boundary

After flight:

1. complete explicit regulatory semantics on the canonical stage;
2. validate crew, times, landings, cycles, IFR classification, fuel, POB, cargo, occurrences and discrepancies;
3. verify the acknowledged aircraft/maintenance situation;
4. build the final record on the server from canonical Controle de Voos sources;
5. persist an immutable revision;
6. obtain PIC final-record signature;
7. obtain operator/designated-person signature;
8. queue external work only within the internal outbox contract.

The client cannot submit an arbitrary `flight` object and turn it into a signable revision. Initial revisions and corrections are reconstructed server-side from tenant-scoped canonical sources. Unclassified IFR blocks finalization.

Lifecycle:

`DRAFT → READY_FOR_PIC_SIGNATURE → PIC_SIGNED → OPERATOR_SIGNED → ANAC_PENDING → ANAC_SYNCED`

`PIC_TECHNICAL_ACK` is independent preflight evidence, not a final-record lifecycle state.

Irreversible boundaries are atomic:

- final PIC signature + `PIC_SIGNED` in one D1 batch;
- operator signature + `OPERATOR_SIGNED` in one D1 batch;
- ANAC outbox insert + `ANAC_PENDING` in one D1 batch.

Receipt existence does not imply regulatory acceptance, so `ANAC_SYNCED` cannot currently be produced.

## Identity and correction model

- `logicalRecordId` — stable identity of the same flight/stage across corrections;
- `revisionId` — immutable identity of one exact revision and exact final-signature target.

Corrections preserve `logicalRecordId`, create a new `revisionId`, reference `supersedesRevisionId`, preserve the historical preflight acknowledgement and require new postflight signatures.

## Persistence and integrity

Implemented persistence includes:

- aircraft diaries and volumes;
- immutable technical snapshots and PIC acknowledgements;
- immutable final revisions and lifecycle state;
- target/hash-bound final signatures;
- discrepancies, deferred/corrective maintenance actions and RTS evidence;
- cryptographic audit-chain events;
- ANAC outbox/receipt internal evidence;
- loss/misplacement/corruption incidents and reconstitution progression.

0477–0480 enforce tenant/scope relationships, append-only evidence, correction-chain validity, lifecycle ordering, volume/diary one-way closure, audit previous-hash integrity, maintenance chronology and incident evidence immutability.

## Authenticated staging-shadow API

A tenant-scoped `/api/edb` surface is implemented but remains unreachable unless all activation conditions below are satisfied.

Activation gate:

- `ENVIRONMENT` must equal `staging`;
- `EDB_SHADOW_PILOT_TENANTS` must contain the explicit positive tenant ID;
- missing/invalid configuration fails closed;
- `all` is rejected;
- production always fails closed.

Access rules:

- administrative eDB data/diary/maintenance operations require manager-level tenant access;
- preflight acknowledgement and PIC final signature require the authenticated user to resolve to an employee actually assigned as PIC on that flight;
- operator final signature requires manager access;
- signer identity is resolved/revalidated server-side rather than trusted from arbitrary client identity fields.

The pre-existing shadow capability/preview/assessment/review contracts remain isolated from the full operational RBAC middleware.

## Shadow Flight Operations UI

The Controle de Voos flight-detail screen contains a minimal eDB shadow card rather than a separate dashboard. It is shown only when `/api/edb/capability` enables the tenant and focuses on:

- next required action;
- blocking missing data;
- current shadow status;
- explicit notice that it is not the official logbook and does not replace the current regulated process.

No general eDB menu is exposed in production.

## Staging migration governance

The official `Deploy Staging (Official)` workflow remains the only intended remote staging path.

For 0477–0480:

1. the migration must be explicitly allowlisted;
2. the staging D1 target name/ID is pinned and production IDs are blocked;
3. verified staging backup is required by the release workflow;
4. per-migration read-only ledger preflight runs;
5. a D1 Time Travel recovery point is captured immediately before the write;
6. the reviewed Schema V2 manifest revalidates SQL and plan hashes;
7. the classic migration SQL must be byte-identical to the reviewed Schema V2 SQL;
8. one remote `--file` bundle contains the schema change plus both governance entries: `airtrust_schema_changes_v2` and `d1_migrations`;
9. any `0/1` or `1/0` ledger divergence fails closed;
10. migration-specific postconditions verify both ledgers and the expected tables/columns/triggers.

No ad-hoc `wrangler d1 migrations apply` or direct production schema write is part of this front.

## Validation coverage

Tests cover, among other things:

- 0477–0480 SQLite execution and Schema V2 manifest hashes;
- persisted-record runtime validation and hash mismatch rejection;
- signature target/hash mismatch rejection;
- atomic lifecycle transitions;
- audit-chain persistence/rehydration/verification;
- discrepancy/maintenance/RTS persistence and chronology;
- diary/volume lifecycle and integrity incidents;
- staging-shadow capability/preview fail-closed behavior;
- server-built revision sources;
- dual-ledger staging bundle generation for 0477–0480.

## Still intentionally blocked

Until the remaining activation gates are satisfied, this work does **not**:

- apply 0477–0480 to production;
- enable a production eDB feature flag;
- transmit anything to ANAC;
- infer an ANAC acceptance result from an HTTP receipt;
- store private signing keys;
- claim the eDB is approved/homologated;
- replace the operator's official logbook process.

## Remaining activation sequence

1. Final PR #110 fast/heavy/PR gates green on a frozen HEAD.
2. Confirm `main` has not advanced or reintegrate it explicitly.
3. Merge the reviewed code/governance change to `main` only after the required repository gates permit it.
4. Run the official staging release with `0477 → 0478 → 0479 → 0480`, backup, recovery point and migration-specific postconditions.
5. Deploy the same reviewed SHA to the staging Worker/frontend with the shadow tenant allowlist only.
6. Exercise staging: capability, preflight snapshot/acknowledgement, regulatory stage data, server-built final revision, PIC/operator signatures, correction, discrepancy/maintenance/RTS, diary/volume lifecycle, audit verification and integrity incidents.
7. Obtain current official ANAC DBE interface/homologation material and accepted signature/security architecture before implementing any external transmission/acceptance adapter.
8. Require explicit production approval before any production activation.

FRMS/LMS production runtime remains outside this eDB front.
