# eDB / Diário de Bordo Digital — Implementation Status

Status: **operational-core draft implemented; disabled; not deployed**.

Branch: `feat/edb-operational-core-0477`

Draft PR: #110

Schema V2 changes — **defined, not applied**:

- `0477_edb_operational_core.sql` — canonical operational semantics and core eDB persistence;
- `0478_edb_anac_receipt_integrity.sql` — ANAC outbox/receipt integrity hardening only.

## Current architecture

The eDB is built on top of the existing Flight Operations / Controle de Voos source instead of creating a second operational registry.

Canonical regulatory semantics live directly on:

- `cv_voo_etapas` for stage/flight values;
- `cv_voo_tripulantes` for the explicit ANAC function code.

There is deliberately no `cv_voo_etapas_regulatorio` or `cv_voo_tripulantes_regulatorio` companion table.

Signed/regulated evidence is separate because it must be immutable and auditable.

## Preflight / postflight boundary

The technical-awareness event and the final flight record are separate legal/operational moments.

### Before flight

1. identify the aircraft selected for the flight;
2. capture the current maintenance/technical situation;
3. freeze an immutable technical snapshot in `edb_situacoes_tecnicas`;
4. calculate the canonical SHA-256 hash;
5. obtain the PIC technical acknowledgement bound to that exact hash and snapshot ID;
6. store the immutable acknowledgement in `edb_ciencias_tecnicas_pic`.

If aircraft identity or maintenance content changes, the previous acknowledgement no longer matches and a new snapshot/acknowledgement is required.

Postflight operational fields are not part of this preflight hash.

### After flight

1. complete the stage with explicit regulatory semantics;
2. validate crew, times, landings, cycles, IFR classification, fuel, POB, cargo, occurrences and discrepancies;
3. verify that aircraft/maintenance still match the acknowledged preflight snapshot;
4. freeze an immutable final eDB revision referencing `ciencia_tecnica_pic_id`;
5. obtain PIC flight-record signature;
6. obtain operator/designated-person signature;
7. queue ANAC transmission only when an official accepted interface is implemented.

The final-record lifecycle is:

`DRAFT → READY_FOR_PIC_SIGNATURE → PIC_SIGNED → OPERATOR_SIGNED → ANAC_PENDING → ANAC_SYNCED`

`SUPERSEDED` and `CANCELLED` are terminal governance states where applicable.

The PIC technical acknowledgement is intentionally **not** a state of this postflight lifecycle.

The persistence layer now keeps the irreversible boundaries atomic:

- inserting `PIC_FLIGHT_RECORD` and advancing to `PIC_SIGNED` happen in one D1 batch;
- inserting `OPERATOR_RECORD` and advancing to `OPERATOR_SIGNED` happen in one D1 batch;
- creating the ANAC outbox item and advancing to `ANAC_PENDING` happen in one D1 batch.

## Record and revision identity

The contract deliberately distinguishes:

- `logicalRecordId` — stable identity for the same flight/stage across corrections;
- `revisionId` — immutable identity of one specific revision.

Final-record signatures target the exact `revisionId`. The revision ID is also part of the canonical signed payload, so moving a valid proof to another revision fails both target binding and payload integrity verification.

Corrections preserve `logicalRecordId`, create a new `revisionId`, and reference the prior revision through `supersedesRevisionId`.

## Canonical stage semantics

Migration 0477 adds these exact fields directly to `cv_voo_etapas`:

- `tempo_voo_diurno_minutos`;
- `tempo_voo_noturno_minutos`;
- `tempo_voo_total_minutos`;
- `tempo_ifr_real_minutos`;
- `tempo_ifr_simulado_minutos`;
- `tempo_ifr_nao_classificado_minutos`;
- `pousos_total`;
- `ciclos`;
- `combustivel_antes_partida_motor`;
- `pessoas_a_bordo_total`;
- `carga_regulatoria_kg`;
- `ocorrencias_json`.

`cv_voo_tripulantes` receives `codigo_funcao_anac` plus provenance/validation metadata.

`NULL` means unknown/not completed. `[]` means explicitly none for list JSON fields.

`tempo_ifr_nao_classificado_minutos` preserves unresolved source evidence only. It never satisfies the requirements for IFR actual/simulated classification.

## No-inference rules

The eDB code does not silently promote similarly named legacy fields:

- `starts` is not cycles;
- `pax` is not POB;
- `payload` is not automatically regulatory cargo;
- `combustivel_inicio` is not automatically fuel before engine start;
- unclassified `tempo_ifr` is not IFR actual or simulated;
- total minus night is not automatically accepted as day flight time;
- RDV `divergencias` is not automatically a maintenance technical discrepancy;
- one flight-level occurrence is not automatically distributed to every stage.

Day/night landing counters may support an explicit landing total, but they are never converted into cycles.

## Persistence implemented by 0477

- `edb_diarios`;
- `edb_volumes`;
- `edb_situacoes_tecnicas`;
- `edb_ciencias_tecnicas_pic`;
- `edb_registro_revisoes`;
- `edb_registro_estado`;
- `edb_assinaturas` for final-record signatures only;
- `edb_discrepancias_tecnicas`;
- `edb_acoes_manutencao`;
- `edb_auditoria_eventos`;
- `edb_anac_outbox`;
- `edb_anac_recibos`;
- `edb_incidentes_integridade`.

Technical snapshots, PIC technical acknowledgements, final revisions, final signatures, discrepancy declarations, maintenance actions and audit events have append-only/immutable database protection.

0477 also installs fail-closed relational/lifecycle guards so direct SQL cannot bypass the technical-snapshot binding, revision correction chain, signature order, lifecycle order or ANAC queue prerequisites.

## ANAC persistence hardening in 0478

0478 intentionally does **not** define an ANAC endpoint, payload contract, response meaning or acceptance rule. It only hardens internal evidence storage:

- outbox identity, revision binding, operation kind, idempotency key and queued payload cannot be rewritten after enqueue;
- delivery-state fields such as status/attempt counters remain mutable;
- outbox history cannot be deleted;
- a receipt must reference an existing outbox item in the same tenant;
- receipt external ID, timestamp and HTTP-status shape receive basic structural validation;
- receipts are append-only and cannot be updated or deleted.

A receipt remains evidence of an external response. Its business/regulatory meaning will only be defined when the official ANAC interface contract is available.

## Other implemented foundations

- versioned `edb.regulatory.v1` contract;
- deterministic canonical JSON and SHA-256 hashing;
- signature ceremony with explicit intent, authentication evidence, target identity and payload binding;
- runtime validation when persisted eDB JSON is rehydrated;
- signature-integrity checks against the immutable revision actually stored in D1;
- discrepancy → corrective/deferred action → return-to-service workflow;
- hash-linked audit-chain model;
- diary/volume opening and closing governance;
- retention and onboard-availability policy for the required recent operating period;
- integrity incident, loss/corruption and reconstitution governance;
- idempotent ANAC outbox/receipt storage without guessing endpoints or payloads;
- regulatory-readiness evaluation designed to support a future simple “what is missing for this flight?” UI.

## Still intentionally disabled

This branch does **not**:

- apply migration 0477 or 0478 to staging or production;
- expose a public eDB Worker route;
- expose an eDB menu or frontend workflow;
- enable a production feature flag;
- write real operational eDB data;
- store private signing keys;
- guess an ANAC DBE endpoint or payload contract;
- claim ANAC authorization, acceptance or homologation.

FRMS and LMS are not part of this branch's runtime scope.

## Required activation gates

1. PR #110 CI and Schema V2 governance green on the final branch head.
2. Controlled integration against the then-current `main` without importing unrelated behavior into eDB changes.
3. Governed staging apply of 0477 followed by 0478, with recovery point and postconditions.
4. Tenant-scoped authenticated internal APIs for preflight snapshot/acknowledgement, regulatory-stage completion and readiness.
5. Shadow UI inside Flight Operations showing only missing data and the next required action.
6. Staging exercises covering preflight acknowledgement, postflight finalization, signatures, correction, discrepancy/maintenance/RTS, retention/onboard availability and recovery.
7. Current official ANAC DBE interface/homologation material and credentials before external transmission is implemented.
8. Accepted security/signature architecture for the intended regulatory scope.
9. Explicit approval before any production activation.
