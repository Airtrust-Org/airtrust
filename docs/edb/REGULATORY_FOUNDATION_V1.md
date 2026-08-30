# eDB Regulatory Foundation V1

Status: **design + code implemented; schema 0477–0480 applied to staging only; branch remains non-production and not ANAC-authorized**.

This document defines the regulatory architecture for a future AirTrust Electronic Journey Log / Diário de Bordo Digital (eDB/DBE). It does not claim that the implementation is authorized, accepted or homologated by ANAC.

## 1. Regulatory baseline

Primary references used by this foundation:

- ANAC Resolução nº 773, de 25/06/2025, effective 01/01/2026 — current Diário de Bordo regulation; it revoked Resolução nº 457/2017;
- ANAC Resolução nº 458, de 20/12/2017, compiled text — computerized systems for mandatory records;
- ANAC Portaria nº 3.220/SPO/SAR, de 15/10/2019, as currently published/compiled — reference model for electronic journey log/eDB.

Resolução nº 773 requires, among other things, integrity and visible corrections, the prescribed per-flight information, PIC signature at the end of the flight/journey, preflight PIC acknowledgement of the aircraft technical situation, operator/designated-person signature within the applicable deadline, retention, and loss/corruption handling.

Resolução nº 773 art. 4 requires the request to use a digital logbook to be submitted to ANAC and makes the digital records subject to the specific computerized-system rules. Resolução nº 458 art. 3 requires explicit ANAC authorization for the scope and provides alternative ways to demonstrate record/storage security. Its art. 7 requires records to remain available for inspection or eventual transmission in the form and periodicity defined for the applicable scope.

The former Portaria nº 9.705/STI/2022 is **not** part of the current baseline: it was revoked by Portaria nº 10.761/STI, de 16/03/2023. The former requirement in Portaria 9.705 for an explicit ANAC-database connection when using one acceptance route must therefore not be treated as a universal current eDB requirement.

Resolução nº 773 art. 15 separately states that digital sharing under the applicable specific regulation can exempt compliance with the SREV regulation. This foundation therefore treats external ANAC sharing as an acceptance/scope-dependent integration track, not as a mandatory final state of every internally completed eDB record.

The software contract and audit controls are implementation foundations only. Regulatory use remains subject to the applicable ANAC acceptance/authorization process and any current external-interface requirements imposed on the accepted scope.

During the 2026-08-30 review, an ANAC Diário de Bordo homologation API documentation host was identified. The referenced public Swagger definition was not available from the reviewed endpoint. That discovery is not treated as an accepted API contract: no endpoint behavior, payload schema, credential model, receipt meaning or acceptance semantics is inferred from it.

## 2. Master-data decision

The operator/company remains master of its AirTrust operational registration:

- aircraft;
- bases/locations;
- crew;
- operational flight data.

Automatic RAB synchronization is not a dependency of the eDB architecture. External official sources may later validate company data but must not silently replace operator-controlled master data.

## 3. Regulatory information model

### Diary / aircraft identity

The frozen regulatory identity supports manufacturer, model, serial number, nationality/registration marks, owners and operators.

### Per-flight record

The `edb.regulatory.v1` contract represents:

- crew;
- date;
- origin/destination;
- engine start, takeoff, landing and engine shutdown;
- total landings;
- cycles;
- day, night and total flight time;
- actual and simulated IFR time;
- total fuel before engine start;
- POB including crew/extras;
- cargo;
- nature of flight;
- occurrences;
- technical discrepancies and detector identity.

`null` is intentionally different from zero or an empty list. For example, `ifrActualMinutes = 0` means explicitly no actual IFR time while `null` means not recorded/classified; `technicalDiscrepancies = []` means explicitly none while `null` means not completed.

## 4. Canonical operational semantics

Because the module has no production eDB history, 0477 corrects ambiguous naming at the source instead of introducing a second operational dataset.

Canonical fields live directly on `cv_voo_etapas`; `codigo_funcao_anac` lives directly on `cv_voo_tripulantes`.

The following are not regulatory aliases:

| Operational/source concept | Regulatory concept | Decision |
|---|---|---|
| `starts` | cycles | do not map |
| `pax` | POB | do not map; POB includes crew/extras |
| unclassified `tempo_ifr` | IFR actual/simulated | preserve as unclassified evidence only |
| total minus night | day time | do not infer |
| `combustivel_inicio` | fuel before engine start | do not map without exact semantic proof |
| `payload` | cargo | do not map without exact semantic proof |
| RDV `divergencias` | technical discrepancy | do not map |
| one RDV occurrence across several stages | per-stage occurrence | do not distribute automatically |

Landing totals and cycles are independent. Explicit landing counters never create regulatory cycles.

## 5. Technical situation before flight

The preflight technical-awareness flow is independent from the postflight final record.

It freezes aircraft identity, last maintenance intervention/RTS information, next intervention, planned airframe-hour threshold, capture timestamp and source scope.

The snapshot is canonicalized and hashed with SHA-256. PIC acknowledgement is bound to the exact snapshot ID/hash and persisted as immutable evidence.

If aircraft identity or maintenance content changes, the technical-content hash changes and a new acknowledgement is required before flight.

Postflight operational data is deliberately excluded from this hash.

## 6. Postflight finalization

The finalizer requires:

- the same-company/flight/snapshot preflight acknowledgement;
- unchanged aircraft/maintenance content relative to that snapshot;
- acknowledgement before engine start when that time exists;
- complete regulatory flight data;
- explicit source-stage provenance.

Only then can an immutable final revision be persisted. Each final revision references the preflight PIC acknowledgement actually used for the flight.

## 7. Signature separation

Three distinct intents are modeled:

1. `PIC_TECHNICAL_ACK` — before flight, bound to the technical snapshot;
2. `PIC_FLIGHT_RECORD` — postflight, bound to the immutable final revision;
3. `OPERATOR_RECORD` — after the PIC flight-record signature.

Signature proof carries exact target identity and payload hash. Cryptographic proof/certificate references may be stored; private signing keys must not be stored in eDB records or audit payloads.

Final signature insertion and its lifecycle transition are atomic in D1. Operator-signature deadline evaluation is separate and can warn on overdue remediation without making late correction impossible.

The accepted production cryptographic/signature architecture remains an ANAC acceptance gate; implementation controls do not by themselves constitute regulatory acceptance.

## 8. Final-record lifecycle and external sharing

The **internal record-completion lifecycle** is:

`DRAFT → READY_FOR_PIC_SIGNATURE → PIC_SIGNED → OPERATOR_SIGNED`

At `OPERATOR_SIGNED`, the AirTrust-side immutable record/evidence flow is internally complete, subject to the system itself later obtaining the applicable ANAC authorization/acceptance.

Preflight PIC technical acknowledgement is independent evidence and is not a final-record lifecycle state.

The schema also reserves an **optional external integration track**:

`OPERATOR_SIGNED → ANAC_PENDING → ANAC_SYNCED`

That track is not treated as a required user action for internal record completion. It may be used only if the accepted ANAC scope requires or permits an external sharing adapter with a known authoritative contract. `ANAC_SYNCED` remains intentionally unavailable until accepted response semantics are implemented. Receipt existence alone is insufficient.

`PIC_SIGNED`, `OPERATOR_SIGNED` and any future `ANAC_PENDING` transition can only arise through their atomic persistence operations.

A signed record is never silently rewritten. Correction creates a new revision, keeps `logicalRecordId`, changes `revisionId`, references the superseded revision, preserves the historical preflight acknowledgement and requires new postflight signatures.

## 9. Technical discrepancy / maintenance chain

The foundation models:

technical discrepancy

→ corrective action or authorized deferment

→ return-to-service approval/evidence.

Declarations and maintenance evidence are append-only. A discrepancy points to one immutable revision; it does not duplicate the source-stage identifier because that stage is derived from the revision.

Persisted discrepancy/maintenance history is replayed through the domain rules on readback, so cross-tenant scope, chronology, duplicate actions, corrupt evidence and RTS without the proper corrective action fail closed.

Operational `divergencias` are not automatically classified as maintenance discrepancies.

## 10. Diary, volume, retention and onboard availability

The foundation supports one active diary per aircraft/operator scope, with controlled volume opening/closing and retention metadata.

The persisted local diary identity is the `edb_diarios` integer key; no ANAC API diary identifier is invented.

Volume opening/closing acts preserve actor evidence and the aircraft registration snapshot. Diary and volume lifecycles are one-way; closed records cannot be reopened or deleted, and a closing act cannot be rewritten after closure.

Availability logic identifies volumes needed to cover the required recent operating period on board without implying every historical volume must always be carried.

Retention follows the current Diário de Bordo rule: records are designed to remain available for the life of the aircraft and for the minimum post-cancellation period required by the applicable regulation.

## 11. Loss, corruption and reconstitution

Loss, misplacement or corruption incidents retain diary scope and optional volume scope.

The persistence layer records police occurrence reference/time, ANAC notification reference/time and reconstitution evidence with optimistic concurrency. References are write-once, outcome transitions are one-way, and records cannot be deleted.

The current lifecycle permits `OPEN → RECONSTITUTED` or `OPEN → IMPOSSIBLE_TO_RECONSTITUTE`. The legacy table value `CLOSED` is intentionally unreachable until a separate closure contract/evidence model is explicitly defined.

## 12. Integrity and audit

Implemented foundations include:

- deterministic canonical JSON;
- SHA-256 content hashes;
- exact signature target/hash binding;
- append-only technical snapshots and acknowledgements;
- immutable final revisions;
- append-only final signatures;
- persisted hash-linked audit events;
- materialized audit flight/technical-situation/actor scope for full rehydration;
- one previous-hash chain per diary with stale/forked append rejection;
- append-only discrepancy/maintenance evidence;
- immutable diary/volume identity and one-way closure;
- optimistic concurrency for canonical source and mutable lifecycle changes;
- idempotent future ANAC outbox/receipt storage;
- correction by superseding revision rather than overwrite.

These controls support integrity/non-repudiation objectives but do not by themselves constitute ANAC approval of the complete electronic-signature architecture.

## 13. ANAC transmission boundary

No endpoint, payload, credential model, receipt meaning or acceptance rule is guessed.

`edb_anac_outbox` and `edb_anac_recibos` provide inert internal persistence so an official adapter can later be implemented idempotently if the accepted scope calls for digital sharing and authoritative interface/onboarding material and accepted response semantics are available.

The outbox is not required to make an `OPERATOR_SIGNED` record internally complete. `readyForAnacQueue` means only that the record is technically eligible to be queued if an authorized external adapter applies.

The existence of an ANAC homologation documentation host does not relax this boundary while its usable authoritative contract is unavailable to this implementation work.

## 14. Schema governance and validation isolation

The governed sequence is:

`0477_edb_operational_core.sql`

→ `0478_edb_anac_receipt_integrity.sql`

→ `0479_edb_relational_integrity.sql`

→ `0480_edb_diary_lifecycle_integrity.sql`

Each change has a Schema V2 manifest with pinned SQL/plan hashes and isolated SQLite governance tests.

The sequence was applied to the pinned **staging D1 only** through `Deploy Staging (Official)` run #39 / `33269772056` from exact schema release SHA `5e6df4e1fc3b633a260c705c53fe1deca63ad382`. No production schema apply has occurred.

The guarded `/api/edb` route and minimal Controle de Voos eDB card have been deployed and validated in staging on prior reviewed branch releases. Because PR #110 remains unmerged, a later staging Worker deployment from canonical `main` can replace that branch runtime; current remote QA must therefore verify `/api/version` provenance and the presence of the eDB route before exercising the lifecycle.

Persisted lifecycle validation is split into complementary paths:

- full lifecycle integration on isolated Node SQLite `:memory:`;
- 0477–0480 parity/immutability validation through Cloudflare Wrangler **local D1** using a dummy database ID and temporary persistence directory;
- a governed **staging full synthetic lifecycle** workflow now exists on canonical `main` (merged through PR #186) with strict synthetic-tenant preflight and exact cleanup, but it must only run against a staging Worker that actually contains the reviewed eDB branch code;
- no production or external ANAC write is performed by the isolated gates.

## 15. Current activation posture

Regulatory/production activation remains blocked.

Current safe posture:

- staging schema 0477–0480 present;
- branch eDB runtime remains guarded by staging + explicit tenant allowlist and is not in canonical `main`;
- current remote staging Worker provenance must be checked before lifecycle QA because later `main` deployments may not contain the unmerged eDB route;
- no production schema/Worker eDB activation;
- no ANAC external transmission;
- `ANAC_SYNCED` fail-closed;
- no private signing keys stored;
- no claim of ANAC authorization/homologation;
- operator's existing official logbook process remains authoritative.

Remaining gates are: frozen green PR evidence, governed staging lifecycle execution against an exact reviewed eDB staging release, current ANAC acceptance/onboarding requirements for the chosen Resolução 458 compliance path, accepted signature/security architecture, and explicit production approval.
