# eDB / Diário de Bordo Digital — Implementation Status

Status: **operational-core draft implemented; disabled; not deployed**.

Branch: `feat/edb-operational-core-0477`

Draft PR: #110

Schema V2 changes — **defined, not applied**:

- `0477_edb_operational_core.sql` — canonical operational semantics and core eDB persistence;
- `0478_edb_anac_receipt_integrity.sql` — ANAC outbox/receipt integrity hardening;
- `0479_edb_relational_integrity.sql` — diary/volume, discrepancy/maintenance and audit relational hardening;
- `0480_edb_diary_lifecycle_integrity.sql` — diary/volume/integrity-incident lifecycle and immutability hardening.

## Current architecture

The eDB uses the existing Flight Operations / Controle de Voos source instead of creating a parallel operational registry.

Canonical regulatory semantics live directly on:

- `cv_voo_etapas` for stage/flight values;
- `cv_voo_tripulantes` for the explicit ANAC function code.

There is deliberately no `cv_voo_etapas_regulatorio` or `cv_voo_tripulantes_regulatorio` companion table.

Signed and regulated evidence is stored separately because it must be immutable, auditable and revision-bound.

## Preflight / postflight boundary

### Before flight

1. identify the aircraft selected for the flight;
2. capture the current maintenance/technical situation;
3. freeze an immutable technical snapshot in `edb_situacoes_tecnicas`;
4. calculate the canonical SHA-256 hash;
5. obtain PIC technical acknowledgement bound to that snapshot ID/hash;
6. persist immutable acknowledgement in `edb_ciencias_tecnicas_pic`.

Aircraft or maintenance changes invalidate the match and require a new preflight snapshot/acknowledgement. Postflight operational fields are intentionally outside the preflight hash.

### After flight

1. complete the stage with explicit regulatory semantics;
2. validate crew, times, landings, cycles, IFR classification, fuel, POB, cargo, occurrences and discrepancies;
3. verify aircraft/maintenance still match the acknowledged preflight snapshot;
4. freeze an immutable final revision referencing `ciencia_tecnica_pic_id`;
5. obtain PIC flight-record signature;
6. obtain operator/designated-person signature;
7. queue external transmission only after an official ANAC interface contract exists.

Final-record lifecycle:

`DRAFT → READY_FOR_PIC_SIGNATURE → PIC_SIGNED → OPERATOR_SIGNED → ANAC_PENDING → ANAC_SYNCED`

The PIC technical acknowledgement is not a state of the postflight lifecycle.

The persistence layer keeps irreversible boundaries atomic:

- `PIC_FLIGHT_RECORD` insert + `PIC_SIGNED` in one D1 batch;
- `OPERATOR_RECORD` insert + `OPERATOR_SIGNED` in one D1 batch;
- ANAC outbox insert + `ANAC_PENDING` in one D1 batch.

The generic state helper cannot produce those three states independently. `ANAC_SYNCED` is also fail-closed: receipt existence alone is not treated as regulatory acceptance; a future official acceptance adapter must define and validate that transition.

## Record and revision identity

- `logicalRecordId` — stable identity for the same flight/stage across corrections;
- `revisionId` — immutable identity of one specific revision.

Final-record signatures target the exact `revisionId`. The revision ID is also part of the canonical signed payload. Corrections preserve `logicalRecordId`, create a new `revisionId`, reference the prior revision through `supersedesRevisionId`, preserve the historical preflight acknowledgement, and require new postflight signatures.

## Canonical stage semantics

0477 adds directly to `cv_voo_etapas`:

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

`tempo_ifr_nao_classificado_minutos` preserves unresolved source evidence only and never satisfies IFR actual/simulated requirements.

## No-inference rules

- `starts` is not cycles;
- `pax` is not POB;
- `payload` is not automatically regulatory cargo;
- `combustivel_inicio` is not automatically fuel before engine start;
- unclassified `tempo_ifr` is not IFR actual or simulated;
- total minus night is not automatically accepted as day flight time;
- RDV `divergencias` is not automatically a maintenance discrepancy;
- one flight-level occurrence is not automatically distributed to every stage;
- landing counters are never converted into cycles.

## Persistence implemented

### 0477 core

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

0477 protects immutable technical evidence, revision chains, signature ordering, lifecycle ordering and ANAC queue prerequisites.

### 0478 ANAC evidence hardening

0478 does not define an ANAC endpoint, payload, response meaning or acceptance rule. It only hardens internal evidence:

- queued outbox identity/revision/operation/idempotency/payload cannot be rebound;
- delivery-state fields remain mutable;
- outbox history cannot be deleted;
- receipt must reference a same-tenant outbox item;
- receipt ID/timestamp/HTTP-status shape is structurally validated;
- receipts are append-only.

### 0479 relational/audit hardening

- materializes `voo_id`, `situacao_tecnica_id` and `actor_json` on audit events so the complete hashed event can be rehydrated;
- enforces volume → diary, discrepancy → revision, maintenance → discrepancy and incident → diary/volume tenant scope;
- requires RTS to reference a prior corrective action on the same discrepancy and prevents duplicate RTS for that action;
- enforces one previous-hash chain per diary and rejects stale/forked audit appends;
- protects immutable volume opening and incident identity.

The audit repository appends against the current diary hash and rehydrates/verifies the entire cryptographic chain from D1.

The discrepancy repository creates only against a same-tenant revision and replays persisted deferred/corrective/RTS history through domain rules. Persisted scope, chronology, duplicate action IDs, evidence JSON and corrective-action → RTS binding therefore fail closed on readback as well as write.

The discrepancy does not duplicate `sourceStageId`; the stage is derived from the immutable revision.

### 0480 diary/lifecycle hardening

- diary tenant/aircraft/regulation identity is immutable;
- diary status is one-way `ATIVO → ENCERRADO`;
- diary rows cannot be deleted;
- volume status is one-way `ABERTO → ENCERRADO`;
- open volumes cannot carry closing evidence;
- closing timestamp/actor/act are required and internally coherent;
- once closed, a volume cannot be reopened or have its closing act rewritten;
- volume rows cannot be deleted;
- police and ANAC incident references are write-once;
- incident reference timestamps and reconstitution evidence must be parseable;
- incident status is one-way `OPEN → RECONSTITUTED|IMPOSSIBLE_TO_RECONSTITUTE`;
- incident rows cannot be deleted;
- legacy `CLOSED` remains in the original table check only for forward compatibility and is intentionally unreachable until a closure contract is explicitly modeled.

The diary repository now persists and rehydrates:

- active aircraft diary identity;
- volume opening/closing acts with the aircraft registration snapshot and exact actor evidence;
- optimistic volume and diary closure;
- loss/misplacement/corruption incidents with optional `volumeId` scope;
- police report, ANAC notification and reconstitution progression with optimistic concurrency.

## Other implemented foundations

- versioned `edb.regulatory.v1` contract;
- deterministic canonical JSON and SHA-256 hashing;
- explicit signature ceremony/authentication/target binding;
- persisted-record runtime validation before signatures/queueing;
- signature-integrity checks against the immutable stored revision;
- discrepancy → deferred/corrective action → RTS workflow;
- persisted cryptographic audit chain;
- diary/volume opening and closing governance;
- retention and onboard-availability policy;
- integrity loss/corruption/reconstitution governance;
- idempotent ANAC outbox/receipt storage without guessed external semantics;
- regulatory-readiness evaluation for a future simple “what is missing for this flight?” UI.

## Still intentionally disabled

This branch does **not**:

- apply 0477, 0478, 0479 or 0480 to staging or production;
- expose a public eDB Worker route;
- expose an eDB menu or frontend workflow;
- enable a production feature flag;
- write real operational eDB data;
- store private signing keys;
- guess an ANAC DBE endpoint or payload contract;
- claim ANAC authorization, acceptance or homologation.

FRMS and LMS are outside this branch's runtime scope.

## Required activation gates

1. PR #110 CI and Schema V2 governance green on the final branch head.
2. Controlled integration against then-current `main` without importing unrelated behavior into eDB changes.
3. Governed staging apply of `0477 → 0478 → 0479 → 0480`, with recovery point and postconditions.
4. Tenant-scoped authenticated internal APIs for preflight snapshot/acknowledgement, regulatory-stage completion and readiness.
5. Shadow UI inside Flight Operations showing only missing data and next required action.
6. Staging exercises covering preflight acknowledgement, postflight finalization, signatures, correction, discrepancy/maintenance/RTS, diary/volume lifecycle, integrity incidents, retention/onboard availability and recovery.
7. Current official ANAC DBE interface/homologation material and credentials before external transmission is implemented.
8. Accepted security/signature architecture for the intended regulatory scope.
9. Explicit approval before any production activation.
