# eDB Regulatory Foundation V1

Status: **design + code implemented; schema 0477–0480 applied to staging only; guarded shadow deployed; no production activation**.

This document defines the regulatory architecture for a future AirTrust Electronic Journey Log / Diário de Bordo Digital (eDB/DBE). It does not claim that the implementation is authorized, accepted or homologated by ANAC.

## 1. Regulatory baseline

Primary references used by this foundation:

- ANAC Resolução nº 773, de 25/06/2025, effective 01/01/2026 — current Diário de Bordo regulation; it revoked Resolução nº 457/2017;
- ANAC Resolução nº 458, de 20/12/2017, compiled text — computerized systems for mandatory records;
- ANAC Portaria nº 3.220/SPO/SAR, de 15/10/2019, as currently published/compiled — reference model for electronic journey log/eDB.

Resolução nº 773 requires, among other things, integrity and visible corrections, the prescribed per-flight information, PIC signature at the end of the flight/journey, preflight PIC acknowledgement of the aircraft technical situation, operator/designated-person signature within the applicable deadline, retention, and loss/corruption handling.

The software contract and audit controls are implementation foundations only. Regulatory use remains subject to the applicable ANAC acceptance/authorization process and current external-interface requirements.

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

## 8. Final-record lifecycle

The final revision lifecycle is:

`DRAFT → READY_FOR_PIC_SIGNATURE → PIC_SIGNED → OPERATOR_SIGNED → ANAC_PENDING → ANAC_SYNCED`

Preflight PIC technical acknowledgement is not a final-record lifecycle state.

`PIC_SIGNED`, `OPERATOR_SIGNED` and `ANAC_PENDING` can only arise from their atomic persistence operations. `ANAC_SYNCED` is intentionally unavailable until a future official ANAC acceptance adapter defines accepted-response semantics; receipt existence alone is insufficient.

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

`edb_anac_outbox` and `edb_anac_recibos` provide inert internal persistence so an official adapter can later be implemented idempotently after the current official ANAC interface/onboarding material and accepted response semantics are obtained.

The existence of an ANAC homologation documentation host does not relax this boundary while its usable authoritative contract is unavailable to this implementation work.

## 14. Schema governance and validation isolation

The governed sequence is:

`0477_edb_operational_core.sql`

→ `0478_edb_anac_receipt_integrity.sql`

→ `0479_edb_relational_integrity.sql`

→ `0480_edb_diary_lifecycle_integrity.sql`

Each change has a Schema V2 manifest with pinned SQL/plan hashes and isolated SQLite governance tests.

The sequence was applied to the pinned **staging D1 only** through `Deploy Staging (Official)` run #39 / `33269772056` from exact schema release SHA `5e6df4e1fc3b633a260c705c53fe1deca63ad382`. No production schema apply has occurred.

The guarded staging-shadow `/api/edb` route and minimal Controle de Voos eDB card are deployed in staging with explicit Costa do Sol tenant allowlisting. Production remains fail-closed and has no enabled eDB menu/feature flag.

Persisted lifecycle validation is deliberately split from shared staging data:

- a full lifecycle integration test runs on isolated Node SQLite `:memory:`;
- a second gate applies 0477–0480 through Cloudflare Wrangler **local D1** using the tracked dummy database ID and a temporary persistence directory, verifies tables/columns/triggers and proves technical-snapshot immutability;
- Cloudflare credentials are sanitized for the local-D1 gate and no remote D1, production or ANAC write is performed;
- shared staging remains limited to governed authenticated smoke and is not used as a disposable regulatory-evidence database.

## 15. Current activation posture

Staging schema and guarded shadow code exist, but regulatory/production activation remains blocked.

Current safe posture:

- staging 0477–0480 present;
- staging shadow allowlisted only for Costa do Sol (`empresa_id=6`);
- no production schema/application activation;
- no ANAC external transmission;
- `ANAC_SYNCED` fail-closed;
- no private signing keys stored;
- no claim of ANAC authorization/homologation;
- operator's existing official logbook process remains authoritative.

The exact-current-release tenant-6 positive re-smoke gap is preserved as historical evidence rather than bypassed. The PR adds post-deploy automation so future successful official staging releases can trigger the governed eDB positive smoke once that workflow reaches the default branch.

Remaining gates are: frozen green PR evidence, current official ANAC API/onboarding and acceptance material, accepted signature/security architecture, applicable computerized-system authorization/acceptance, and explicit production approval.
