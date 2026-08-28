# eDB Regulatory Foundation V1

Status: **design/code foundation only — no runtime route, no migration, no deploy**.

This document defines the first isolated foundation for a future AirTrust Electronic Journey Log / Diário de Bordo Digital (eDB/DBE). It deliberately does not alter the operational Controle de Voos/RDV flow while FRMS and LMS workstreams are being completed.

## 1. Regulatory baseline

Primary current references used by this foundation:

- ANAC Resolução nº 773, de 25/06/2025, effective 01/01/2026 — Diário de Bordo.
  - https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2025/resolucao-773
- ANAC Resolução nº 458, de 20/12/2017, compiled text — computerized systems for mandatory records.
  - https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2017/resolucao-no-458-20-12-2017

The system must not claim that a record is official, homologated, accepted or transmitted to ANAC merely because it conforms to this internal contract. Use of the digital means for mandatory records requires the applicable ANAC authorization/acceptance process.

## 2. Master-data decision

The operator/company remains the master of its operational registration in AirTrust:

- aircraft;
- bases/locations;
- crew;
- operational flight data.

**Automatic RAB synchronization is not a dependency of the eDB architecture.** The eDB takes the aircraft selected from the company-controlled master data and freezes the required identification in the regulatory snapshot.

External official sources may later be offered as optional validation, but must not silently replace company master data.

## 3. Resolução 773 information model

The `edb.regulatory.v1` contract represents:

### Diary/aircraft identification — art. 5

- manufacturer;
- model;
- serial number;
- nationality/registration marks;
- owner(s);
- operator(s).

### Per-flight record — art. 6

- crew;
- date;
- origin/destination;
- engine start, takeoff, landing and engine shutdown;
- total landings and cycles;
- day, night and total flight time;
- actual and simulated IFR time;
- total fuel before engine start;
- POB including crew/extras;
- cargo;
- nature of flight;
- occurrences;
- technical discrepancies and person who detected them.

`null` is intentionally different from zero or an empty list. For example:

- `ifrActualMinutes = 0` means explicitly no actual IFR time;
- `ifrActualMinutes = null` means not yet recorded/classified;
- `technicalDiscrepancies = []` means explicitly none;
- `technicalDiscrepancies = null` means the field has not yet been completed.

### Technical situation before flight — art. 9

The contract includes a technical snapshot containing:

- last maintenance intervention type/date/RTS approver;
- next maintenance intervention type;
- airframe hours planned for the next intervention;
- separate PIC technical-awareness signature.

### Signatures — arts. 7 and 10

Three independent signature intents are modeled:

1. `PIC_TECHNICAL_ACK` — before flight, for the technical-situation acknowledgement;
2. `PIC_FLIGHT_RECORD` — end of flight/duty, for the flight record;
3. `OPERATOR_RECORD` — operator/designated-person signature after PIC.

Operator signature deadline rules are encoded as:

- RBAC 121: 2 days;
- RBAC 135: 15 days;
- other operators: 30 days.

A late signature is still technically possible but is reported as a regulatory deadline warning; the system must not prevent remediation merely because the deadline has passed.

## 4. Resolução 458 security direction

The foundation prepares a deterministic canonical payload and SHA-256 hash for each signature intent. This is only one building block.

Before a production regulatory signature is enabled, the implementation still needs the complete accepted cryptographic/signature architecture required for the authorized scope, including asymmetric cryptography, signature/certificate controls, auditability, secure archival, access control, backup/continuity and non-repudiation controls.

No private key may ever be stored inside an eDB record or audit payload.

## 5. RDV → eDB shadow projection

The existing Controle de Voos/RDV remains operational and non-regulated. The shadow projector only copies fields whose semantics are sufficiently explicit and exposes gaps for everything else.

### Safe/structural projection in V1

- flight/RDV source identifiers and version;
- company/operator scope;
- company-controlled aircraft snapshot supplied to the projector;
- date and nature;
- per-stage origin/destination;
- per-stage engine start/takeoff/landing/shutdown timestamps;
- total/night duration when already normalized with those exact semantics;
- day/night landings summed to a total when both are explicitly available;
- stage crew supplied with explicit identity/operational role;
- a single-RDV occurrence only when there is exactly one stage.

### Explicitly NOT inferred

| Current operational concept | eDB field | V1 decision |
|---|---|---|
| `etapa.starts` | cycles | **Do not map** |
| unclassified `tempo_ifr` | IFR actual/simulated | **Do not map** |
| total - night | day time | **Do not infer** |
| `combustivel_inicio` | fuel before engine start | **Do not map until semantics are confirmed** |
| `pax` | POB | **Do not map** — POB includes crew/extras |
| `payload` | cargo | **Do not map until semantics are confirmed** |
| RDV `divergencias` | technical discrepancy | **Do not map** |
| one RDV occurrence across several stages | per-flight occurrence | **Do not distribute automatically** |

This fail-closed behavior is intentional. Missing regulatory data must be visible as a gap instead of being manufactured from a similar-looking operational field.

## 6. Lifecycle direction

The contract reserves the following states:

`DRAFT → READY_FOR_PIC_TECHNICAL_ACK → READY_FOR_PIC_SIGNATURE → PIC_SIGNED → OPERATOR_SIGNED → ANAC_PENDING → ANAC_SYNCED`

Correction is append-only in the target design: a signed record is never rewritten as if the prior content had not existed. A correction creates a new revision referencing the superseded record and carrying a correction reason, with the complete historical/audit evidence retained.

Persistence/event semantics for this lifecycle are intentionally deferred to a later isolated slice because they require schema work.

## 7. Isolation from active workstreams

This slice must remain safe to carry while other production work continues:

- no D1 migration;
- no Schema V2 change;
- no Worker route registration;
- no React route/menu;
- no feature enabled in staging/production;
- no edits to FRMS files;
- no edits to LMS files;
- no edits to current Controle de Voos runtime files.

Only new `services/edb`, tests and documentation are introduced.

## 8. Next implementation slices — only after current production priorities are clear

1. Add a read-only adapter from the actual Controle de Voos/RDV repository into the normalized shadow source.
2. Add company-master aircraft completeness checks for the art. 5 fields — no RAB dependency.
3. Decide where the missing art. 6 fields are collected in the UX, avoiding duplicate flight entry.
4. Model technical discrepancies → maintenance action/deferred action → RTS.
5. Add append-only persistence/schema behind a disabled feature flag.
6. Implement the accepted cryptographic signature flow and audit evidence.
7. Add ANAC DBE adapter only against the current official OpenAPI/technical contract supplied by ANAC; do not reconstruct the API from unofficial copies.
8. Run shadow comparison and homologation before any claim of official digital Diário de Bordo.
