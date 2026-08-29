# eDB / Diário de Bordo Digital — Implementation Status

Status: **isolated draft foundation; not deployable and not enabled**.

Branch: `feat/edb-regulatory-foundation`

Draft PR: #97

This branch is intentionally allowed to remain behind `main` while FRMS/LMS and other production workstreams are completed. Do not merge/rebase it into those workstreams and do not reserve a production migration number yet.

## Implemented in the isolated foundation

All items below are pure contracts/services/tests or documentation. They perform no D1/R2 writes and are not registered in Worker runtime routes.

### Regulatory record contract

- `edb.regulatory.v1` flight-record contract.
- Company-controlled aircraft identity snapshot; no automatic RAB dependency.
- Required Res. 773/2025 art. 6 flight fields represented explicitly.
- `null`/zero/empty-list semantics preserved so missing data cannot look complete.
- Technical-situation snapshot required before PIC acknowledgement.
- Separate PIC technical acknowledgement, PIC flight-record signature and operator signature.

### Controle de Voos / RDV shadow adapter

- Read-only adapter from existing Controle de Voos/RDV types.
- Tenant/source ownership checks.
- One projected regulatory record per realized stage.
- Explicit projection-gap reporting.
- No regulatory inference from similar operational fields when semantics are unconfirmed.

Current intentional gaps include:

- `starts` is not treated as cycles;
- unclassified IFR time is not split into actual/simulated IFR;
- day time is not inferred as total minus night;
- stage-start fuel is not automatically declared fuel-before-engine-start;
- PAX is not POB;
- payload is not automatically regulatory cargo;
- operational divergence is not a technical maintenance discrepancy;
- multi-stage RDV occurrences are not distributed automatically.

### Regulatory validation/readiness

- Readiness validation for PIC technical acknowledgement.
- Readiness validation for PIC flight signature.
- Operator signature deadline: 2 days RBAC 121, 15 days RBAC 135, 30 days other.
- Read-only readiness model intended to power a future simple UX showing only the next regulatory action/blocker.
- Fail-closed behavior when previously signed payload changes.

### Lifecycle and correction

- Explicit lifecycle policy:
  `DRAFT → READY_FOR_PIC_TECHNICAL_ACK → READY_FOR_PIC_SIGNATURE → PIC_SIGNED → OPERATOR_SIGNED → ANAC_PENDING → ANAC_SYNCED`.
- Signed content is locked.
- Signed records cannot be cancelled/re-written as if they never existed.
- Correction creates a new draft revision referring to the superseded record and resets signatures.
- ANAC sync cannot be marked complete without explicit external receipt evidence.

### Technical discrepancy / maintenance / RTS

- Original flight discrepancy is retained.
- Maintenance disposition is append-only.
- Corrective action and delayed-action authorization are distinct actions.
- RTS approval must reference a previously recorded corrective action.
- Maintenance actions do not erase the discrepancy recorded by the crew.

### Signature integrity foundation

- Deterministic canonical payload per signature purpose.
- SHA-256 signable payload hash.
- Stored signature proof can be checked against the current canonical payload to detect post-signature mutation.
- Deliberate signing ceremony contract includes content review, explicit intent statement, signer authentication evidence, short-lived ceremony and exact payload binding.
- External signature result is accepted into the internal proof contract only when ceremony, signer and payload all match.

This is **not** by itself a legal/homologated digital-signature implementation. The accepted cryptographic/certificate provider/process must be selected and validated before regulatory production use.

### Audit integrity

- Hash-linked audit-event foundation.
- Historical payload mutation detection.
- Previous-event link tampering detection.
- Audit chain is evidence/tamper detection; it does not replace the required digital/electronic signature controls.

### Diary governance

- One diary identity per aircraft, with volumes delimited by opening and closing acts.
- Minimum retention policy: aircraft life + 5 years and 1 day after deregistration.
- 30-day operation-window policy for onboard availability.
- Loss/misplacement/corruption incident contract.
- Police occurrence evidence.
- ANAC notification evidence.
- Successful reconstitution or documented impossible-reconstitution path.

## Deliberately NOT implemented yet

To preserve isolation from active production work, this branch contains none of the following:

- no D1 migration;
- no Schema V2 change;
- no persistence tables;
- no R2 regulatory archive;
- no Worker route registration;
- no frontend route or menu;
- no feature flag enabled anywhere;
- no production/staging deploy;
- no changes to existing Controle de Voos runtime files;
- no FRMS changes;
- no LMS changes;
- no actual certificate/private-key integration;
- no guessed ANAC API endpoints/payloads.

## External/regulatory blockers before real activation

1. Resolve the remaining operational → regulatory semantics tracked in #91.
2. Obtain the current official ANAC DBE OpenAPI/technical contract and homologation access tracked in #93.
3. Select the signature/certificate architecture that satisfies the accepted Res. 458 scope.
4. Define and test backup/restore/continuity controls and evidence.
5. Define inspector/audit export and availability procedure acceptable to ANAC.
6. Confirm offline/PED approach for availability of volumes covering the last 30 days of operation.

## Activation sequence after FRMS/LMS production work is complete

### Gate 0 — freeze integration point

- Confirm current `main` and completed production releases.
- Confirm no active migration-number collision.
- Rebase this branch onto the then-current `main` only at that time.
- Resolve conflicts without changing FRMS/LMS behavior.
- Re-run all fast/heavy gates.

### Gate 1 — persistence design

Create an append-only storage design behind a disabled feature flag. The future schema should separate at minimum:

- diary/volume identity;
- flight-record revisions;
- signature proofs;
- technical discrepancies;
- maintenance actions / RTS approvals;
- audit events;
- ANAC transmission outbox/receipts;
- loss/reconstitution incidents.

A signed revision must never be updated in place.

### Gate 2 — internal API only

Introduce authenticated/tenant-scoped Worker routes behind a disabled feature flag. No public menu yet.

Required controls include:

- tenant isolation;
- signer authorization;
- optimistic/idempotent commands;
- immutable signed revisions;
- audit events for every regulated state change;
- no private-key material in D1/R2/logs.

### Gate 3 — shadow UI

Add a read-only/shadow eDB view fed from existing Controle de Voos/RDV plus explicit regulatory completion fields. It must not require duplicate entry of data already known by Controle de Voos.

UX principle: show the next action/blocker, not a second giant flight form.

### Gate 4 — staging pilot

- No regulatory claim.
- Compare RDV source with generated eDB draft.
- Exercise technical acknowledgement, end-of-flight record, operator-signature deadline, correction, discrepancy/maintenance/RTS and recovery scenarios.
- Validate 30-day availability and archive/recovery procedures.

### Gate 5 — ANAC homologation/integration

Only after receipt of the current official API/technical contract:

- implement the DBE adapter;
- use an idempotent outbox/retry model;
- retain external receipts/protocols;
- perform reconciliation;
- execute the applicable ANAC acceptance/homologation process.

### Gate 6 — production activation

Production activation requires explicit approval after the regulatory/technical gates above. Until then, the existing Controle de Voos/RDV remains the operational source and this branch must not change production behavior.
