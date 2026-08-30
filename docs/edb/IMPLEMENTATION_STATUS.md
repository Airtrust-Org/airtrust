# eDB / Diário de Bordo Digital — Implementation Status

Status: **operational core + guarded staging-shadow surface implemented; schema 0477–0480 applied to staging only; production inactive**.

Branch: `feat/edb-operational-core-0477`  
Draft PR: #110

## Regulatory posture

The AirTrust eDB remains a development/staging-shadow capability. Nothing in this branch claims ANAC authorization, homologation, acceptance or permission to replace the operator's currently valid official logbook process.

External ANAC transmission is deliberately not implemented because no official accepted endpoint/payload/credential/acceptance contract has been established in this work. `ANAC_SYNCED` therefore remains fail-closed.

Current regulatory baseline used by the design:

- ANAC Resolução nº 773, de 25/06/2025, effective 01/01/2026 — current Diário de Bordo regulation and revocation of Resolução nº 457/2017;
- ANAC Resolução nº 458, de 20/12/2017, compiled text — computerized systems for mandatory records;
- ANAC Portaria nº 3.220/SPO/SAR, de 15/10/2019, as currently published/compiled — reference model for electronic journey log/eDB.

The public ANAC homologation API documentation host for Diário de Bordo was identified during the 2026-08-30 review, but the referenced public Swagger definition was not available from the reviewed endpoint. No payload, credential model or acceptance semantics are inferred from that discovery.

## Governed schema changes — staging only

The following migrations were applied to the pinned staging D1 database through the official `Deploy Staging (Official)` path, from exact schema release SHA `5e6df4e1fc3b633a260c705c53fe1deca63ad382`, in run #39 / `33269772056` on 2026-08-29:

- `0477_edb_operational_core.sql` — canonical operational semantics and immutable eDB core;
- `0478_edb_anac_receipt_integrity.sql` — outbox/receipt integrity hardening without guessed external semantics;
- `0479_edb_relational_integrity.sql` — diary/volume, discrepancy/maintenance and audit relational hardening;
- `0480_edb_diary_lifecycle_integrity.sql` — diary/volume/integrity-incident lifecycle hardening.

The governed apply confirmed the classic migration ledger, Schema V2 ledger, recovery-point controls and migration-specific postconditions. **No production migration was applied.**

Each migration has a pinned Schema V2 manifest and an executable copy under `worker-airtrust/schema-v2/changes/`. Tests require the migration and reviewed Schema V2 SQL to remain byte-identical.

## Current staging application

The latest official staging application deployment reviewed in this front is `Deploy Staging (Official)` run #53 / `33319537112`, completed on 2026-08-30 from main SHA `0745da8fe06ed6e35a8840942098a81f52b73446`.

Reviewed staging targets remain:

- Worker: `airtrust-api-staging`;
- D1: `airtrust-db-staging-baseline-20260701`;
- R2: `airtrust-storage-staging`;
- eDB pilot allowlist: Costa do Sol only, `EDB_SHADOW_PILOT_TENANTS="6"`.

Run #53 did not apply additional migrations. Production-target guards passed.

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

A tenant-scoped `/api/edb` surface is active only when every shadow gate is satisfied:

- `ENVIRONMENT=staging`;
- `EDB_SHADOW_PILOT_TENANTS` contains the explicit positive tenant ID;
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

Controle de Voos flight detail contains a minimal eDB shadow card rather than a separate dashboard. It is shown only when `/api/edb/capability` enables the tenant and focuses on:

- next required action;
- blocking missing data;
- current shadow status;
- explicit notice that it is not the official logbook and does not replace the current regulated process.

No general eDB menu is exposed in production.

## Validation evidence

Current CI coverage includes:

- 0477–0480 SQLite execution and Schema V2 manifest hashes;
- persisted-record runtime validation and hash mismatch rejection;
- signature target/hash mismatch rejection;
- atomic lifecycle transitions;
- audit-chain persistence/rehydration/verification;
- discrepancy/maintenance/RTS persistence and chronology;
- diary/volume lifecycle and integrity incidents;
- staging-shadow capability/preview fail-closed behavior;
- server-built revision sources;
- dual-ledger staging bundle generation for 0477–0480;
- full persisted lifecycle against isolated Node SQLite `:memory:`;
- 0477–0480 schema/trigger parity and immutability checks against Cloudflare Wrangler **local D1**, with a dummy database ID, temporary persistence directory, sanitized Cloudflare credentials and no remote writes.

The dedicated local-D1 validation intentionally attempts a forbidden technical-snapshot update and requires the D1 trigger to reject it with `EDB_TECHNICAL_SITUATION_IMMUTABLE`.

## Staging smoke evidence

`eDB Staging Read-Only Smoke` run #2 / `33272425549` passed against an earlier staging release and confirmed anonymous/auth boundaries plus fail-closed behavior without operational mutation.

`eDB Staging Pilot Positive` run #7 / `33317218752` passed with the synthetic tenant-6 identity against release `32c684db4ad46914bd84ed9463d0d023e952ca3e`. It verified tenant-6 capability, read-only operational access and safe error handling while cleaning up its synthetic identity fixture.

The currently reviewed staging release `0745da8fe06ed6e35a8840942098a81f52b73446` is newer than that positive smoke. This exact-current-release historical re-smoke gap is **not** backfilled by bypassing the main-only workflow.

The PR adds post-deploy wiring so successful future `Deploy Staging (Official)` completions can trigger the governed tenant-6 positive eDB smoke after that workflow version reaches the default branch. The smoke remains non-mutating for flight/aircraft/eDB operational records.

## Still intentionally blocked

This work does **not**:

- apply 0477–0480 to production;
- enable a production eDB feature flag;
- transmit anything to ANAC;
- infer an ANAC acceptance result from an HTTP receipt;
- store private signing keys;
- claim the eDB is approved/homologated;
- replace the operator's official logbook process;
- use the shared staging regulatory D1 as a disposable full-lifecycle test database.

## Remaining activation sequence

1. Keep PR #110 Draft and maintain fast/heavy/PR/eDB-isolation gates green on a frozen HEAD.
2. Preserve `main` integration without rebase/force; reintegrate only if canonical `main` advances.
3. Keep full mutating lifecycle validation isolated from the shared staging regulatory D1.
4. Once the post-deploy eDB smoke workflow reaches the default branch, require it for future official staging releases and preserve exact release provenance.
5. Obtain the current official ANAC DBE API/interface package, credential/onboarding process and accepted response semantics before implementing an external adapter.
6. Complete the applicable ANAC computerized-system acceptance/authorization work, including the accepted signature/security architecture.
7. Require explicit production approval before any production schema/application activation.

FRMS/LMS production runtime remains outside this eDB front.
