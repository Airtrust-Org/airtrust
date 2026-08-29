# eDB Regulatory Foundation V1

Status: **design + code + unapplied Schema V2 foundation; no production activation**.

This document defines the regulatory architecture for a future AirTrust Electronic Journey Log / Diário de Bordo Digital (eDB/DBE). It does not claim that the implementation is authorized, accepted or homologated by ANAC.

## 1. Regulatory baseline

Primary references used by this foundation:

- ANAC Resolução nº 773, de 25/06/2025, effective 01/01/2026 — Diário de Bordo;
- ANAC Resolução nº 458, de 20/12/2017, compiled text — computerized systems for mandatory records.

The software contract and audit controls are implementation foundations only. Regulatory use remains subject to the applicable ANAC acceptance/authorization/homologation process and the current external interface requirements.

## 2. Master-data decision

The operator/company remains the master of its operational registration in AirTrust:

- aircraft;
- bases/locations;
- crew;
- operational flight data.

Automatic RAB synchronization is not a dependency of the eDB architecture. External official sources may later validate company data, but must not silently replace the operator-controlled master data.

## 3. Regulatory information model

### Diary / aircraft identity

The frozen regulatory identity supports:

- manufacturer;
- model;
- serial number;
- nationality/registration marks;
- owner(s);
- operator(s).

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
- technical discrepancies and the person who detected them.

`null` is intentionally different from zero or an empty list.

Examples:

- `ifrActualMinutes = 0`: explicitly no actual IFR time;
- `ifrActualMinutes = null`: not yet recorded/classified;
- `technicalDiscrepancies = []`: explicitly none;
- `technicalDiscrepancies = null`: not yet completed.

## 4. Canonical operational semantics

Because the module has no production eDB history yet, 0477 corrects ambiguous naming at the source instead of introducing a second operational dataset.

Canonical fields live directly on `cv_voo_etapas`; `codigo_funcao_anac` lives directly on `cv_voo_tripulantes`.

The legacy values below are not regulatory aliases:

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

It freezes:

- aircraft identity;
- last maintenance intervention type/date/RTS approver;
- next maintenance intervention type;
- airframe hours planned for the next intervention;
- capture timestamp and source scope.

The snapshot is canonicalized and hashed with SHA-256. The PIC acknowledgement is bound to that exact snapshot hash and stored as immutable evidence.

If aircraft identity or maintenance content changes, the technical-content hash changes and a new acknowledgement is required before flight.

Postflight operational data is deliberately excluded from this hash so legitimate completion of flight data does not invalidate the preflight event.

## 6. Postflight finalization

After flight, the finalizer requires:

- the preflight technical acknowledgement for the same company/flight/snapshot;
- unchanged aircraft/maintenance content relative to the acknowledged snapshot;
- acknowledgement before engine start when engine-start time is available;
- complete regulatory flight data;
- explicit source-stage provenance.

Only then can an immutable final revision be persisted.

Each final revision stores a reference to the preflight PIC technical acknowledgement used for the actual flight.

## 7. Signature separation

The architecture has three distinct intents:

1. `PIC_TECHNICAL_ACK` — before flight, bound to the technical snapshot;
2. `PIC_FLIGHT_RECORD` — after flight/end of record completion, bound to the final flight payload;
3. `OPERATOR_RECORD` — after the PIC flight-record signature.

The signature ceremony foundation requires content review, explicit intent, authentication evidence and exact payload-hash binding. Cryptographic proof references may be stored; private signing keys must not be stored in eDB records or audit payloads.

Operator-signature deadline evaluation is modeled separately by regulation and produces warnings when remediation is late rather than making a late corrective action impossible.

## 8. Final-record lifecycle

The final revision lifecycle is:

`DRAFT → READY_FOR_PIC_SIGNATURE → PIC_SIGNED → OPERATOR_SIGNED → ANAC_PENDING → ANAC_SYNCED`

The preflight PIC technical acknowledgement is not a final-record lifecycle state.

A signed record is never silently rewritten. Correction creates a new revision referencing the prior one and carrying the correction reason. The historical preflight acknowledgement is retained; new postflight signatures are required for the corrected revision.

## 9. Technical discrepancy / maintenance chain

The foundation models:

technical discrepancy

→ corrective action or authorized deferment

→ return-to-service approval/evidence.

Declarations and maintenance evidence are append-only so later action does not erase what was originally observed.

Operational `divergencias` are not automatically classified as maintenance discrepancies.

## 10. Diary, volume, retention and onboard availability

The foundation supports one active diary per aircraft/operator scope, with controlled volume opening/closing and retention metadata.

Availability logic is designed to identify the volumes necessary to cover the required recent operational period on board without pretending every historical volume must be carried physically/electronically at all times.

Loss, misplacement or corruption can be recorded with notification/reconstitution evidence while preserving the audit history of the incident.

## 11. Integrity and audit

Implemented foundations include:

- deterministic canonical JSON;
- SHA-256 content hashes;
- exact signature/hash binding;
- append-only technical snapshots and acknowledgements;
- immutable final revisions;
- append-only final signatures;
- hash-linked audit events;
- append-only discrepancy/maintenance evidence;
- optimistic concurrency for canonical source writes and lifecycle changes;
- idempotent future ANAC outbox/receipt storage;
- correction by superseding revision instead of overwrite.

These controls support integrity/non-repudiation objectives but do not by themselves constitute ANAC approval of the complete electronic-signature architecture.

## 12. ANAC transmission boundary

No endpoint, payload, credential model or receipt contract is guessed.

`edb_anac_outbox` and `edb_anac_recibos` provide an inert persistence pattern so an official adapter can later be implemented idempotently after the current ANAC interface/homologation material is available.

Until that gate is satisfied, `ANAC_PENDING` / `ANAC_SYNCED` are architectural states only and no production transmission is enabled.

## 13. Isolation and activation

Migration 0477 is defined but unapplied. The branch has no public eDB Worker route, no eDB frontend/menu, no enabled production feature flag and no real eDB operational write path.

FRMS/LMS runtime behavior is outside this branch's scope.

Activation must be staged and explicit: CI → current-main integration → governed staging schema apply → authenticated APIs → shadow UI → staging exercises → regulatory/security acceptance → production approval.
