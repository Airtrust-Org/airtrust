# eDB / Flight Operations — Operational Core 0477

Status: **implemented on integration branch; disabled; not deployed**.

Branch: `feat/edb-operational-core-0477`

## Purpose

0477 establishes the persistent foundation for the future Diário de Bordo Digital while the module still has no production eDB data. It uses this opportunity to fix ambiguous operational naming before those ambiguities become regulated history.

The design has one operational source of truth and separate immutable regulatory evidence.

Later additive changes 0478–0480 harden ANAC evidence, relational/audit bindings and diary/volume/incident lifecycle. None is applied to staging or production in PR #110.

## 1. One operational source

Canonical flight semantics are added directly to the existing `cv_voo_etapas` rows. The ANAC crew-function code is added directly to `cv_voo_tripulantes`.

No parallel stage/crew registry is created.

### Canonical stage fields

- `tempo_voo_diurno_minutos`
- `tempo_voo_noturno_minutos`
- `tempo_voo_total_minutos`
- `tempo_ifr_real_minutos`
- `tempo_ifr_simulado_minutos`
- `tempo_ifr_nao_classificado_minutos`
- `pousos_total`
- `ciclos`
- `combustivel_antes_partida_motor`
- `pessoas_a_bordo_total`
- `carga_regulatoria_kg`
- `ocorrencias_json`

### Crew field

- `codigo_funcao_anac`

Provenance/version fields are stored with the canonical semantics so writes can use optimistic concurrency and retain who/when information.

`NULL` means unknown/not completed. `[]` means explicitly none for list JSON fields.

## 2. Legacy fields are evidence, not aliases

The current RDV/Controle de Voos runtime can still contain older fields. The eDB adapter exposes ambiguous values only as shadow evidence and does not promote them silently.

Prohibited automatic equivalences include:

- `starts` → cycles;
- `pax` → POB;
- `payload` → regulatory cargo;
- `combustivel_inicio` → fuel before engine start;
- unclassified `tempo_ifr` → IFR actual/simulated;
- total minus night → day flight time;
- RDV `divergencias` → maintenance discrepancy;
- flight-level occurrence → every stage of a multi-stage RDV.

`tempo_ifr_nao_classificado_minutos` exists specifically so unresolved IFR source evidence can be retained without pretending it satisfies actual/simulated IFR classification.

Landing totals and cycles remain independent concepts. Explicit day/night landing counters can support `pousos_total`; they never generate `ciclos`.

## 3. Preflight technical awareness is independent

The PIC technical acknowledgement must exist before the flight and therefore cannot be modeled as a state of an immutable record that only becomes complete after the flight.

0477 separates the flow:

`aircraft + maintenance situation`

→ immutable `edb_situacoes_tecnicas` snapshot

→ canonical snapshot SHA-256

→ deliberate PIC technical signature/acknowledgement

→ immutable `edb_ciencias_tecnicas_pic`

A change to aircraft identity or maintenance data produces a different technical-content hash. The previously signed acknowledgement must not authorize the changed situation.

Times, landings, cycles, IFR split, fuel, POB, cargo, occurrences and other postflight operational values are excluded from this preflight hash.

## 4. Postflight final record

After the flight, the eDB projector reads the existing operational structure plus the explicit canonical fields and validates exact semantics.

The finalizer:

1. requires an explicit source stage;
2. requires the preflight PIC technical acknowledgement;
3. verifies acknowledgement ↔ snapshot ↔ company ↔ flight binding;
4. verifies that current aircraft/maintenance still match the acknowledged snapshot;
5. verifies the acknowledgement occurred before engine start when engine-start time is available;
6. validates all required postflight regulatory data;
7. freezes a final immutable revision that references `ciencia_tecnica_pic_id`.

The final-record lifecycle begins only then:

`DRAFT → READY_FOR_PIC_SIGNATURE → PIC_SIGNED → OPERATOR_SIGNED → ANAC_PENDING → ANAC_SYNCED`

`ANAC_SYNCED` remains unavailable to generic application lifecycle code until a future official ANAC acceptance adapter defines and validates accepted response semantics.

## 5. Signatures

Three signature intents exist in the contract, but storage follows the operational moment:

- `PIC_TECHNICAL_ACK`: preflight, stored in `edb_ciencias_tecnicas_pic`;
- `PIC_FLIGHT_RECORD`: postflight, stored in `edb_assinaturas`;
- `OPERATOR_RECORD`: after PIC flight signature, stored in `edb_assinaturas`.

`edb_assinaturas` rejects preflight technical acknowledgements by design.

The generic signature ceremony binds explicit intent, reviewed content, authentication evidence, exact target identity and the SHA-256 hash. It stores only proof references/certificate evidence, never private keys.

PIC signature insertion + `PIC_SIGNED` and operator signature insertion + `OPERATOR_SIGNED` are each persisted atomically in one D1 batch.

## 6. Correction model

Signed records are not overwritten.

A correction:

- preserves `logicalRecordId`;
- creates a new `revisionId`;
- references the prior revision through `supersedesRevisionId`;
- records a correction reason;
- preserves the historical preflight technical acknowledgement that actually preceded the flight;
- clears the prior postflight PIC/operator signatures;
- requires new final-record signatures for the corrected revision.

A correction made after the event must never create a fictitious new “preflight” acknowledgement.

## 7. Persistent objects

0477 defines:

- `edb_diarios`
- `edb_volumes`
- `edb_situacoes_tecnicas`
- `edb_ciencias_tecnicas_pic`
- `edb_registro_revisoes`
- `edb_registro_estado`
- `edb_assinaturas`
- `edb_discrepancias_tecnicas`
- `edb_acoes_manutencao`
- `edb_auditoria_eventos`
- `edb_anac_outbox`
- `edb_anac_recibos`
- `edb_incidentes_integridade`

Immutable evidence receives database no-update/no-delete protection where applicable. Mutable lifecycle/outbox state is deliberately separated from immutable payload evidence.

## 8. Current internal code path

1. `controle-voos-source-adapter.ts` exposes current RDV data conservatively.
2. `edb-source-repository.ts` reads canonical fields directly from source rows.
3. `operational-regulatory-source.ts` validates explicit semantics and preserves unclassified IFR evidence.
4. `regulatory-projection.ts` overlays only explicit canonical values.
5. `technical-awareness.ts` creates/verifies the preflight snapshot and acknowledgement binding.
6. `edb-technical-awareness-repository.ts` persists and revalidates preflight evidence.
7. `postflight-finalization.ts` enforces the preflight/postflight boundary.
8. `edb-persistence-repository.ts` persists final revisions, signatures, lifecycle transitions and ANAC queue evidence.
9. `edb-audit-repository.ts` persists/reconstructs the diary hash chain and verifies it cryptographically.
10. `edb-technical-discrepancy-repository.ts` persists/replays discrepancy → deferred/corrective action → RTS history through domain validation.
11. `edb-diary-repository.ts` persists/reconstructs diary volumes and integrity incidents with optimistic lifecycle updates.
12. ANAC outbox remains inert until an official adapter exists.

## 9. Additive hardening after 0477

### 0478

Hardens internal ANAC outbox/receipt evidence without defining an external endpoint, payload or acceptance meaning.

### 0479

Materializes audit `voo_id`, `situacao_tecnica_id` and `actor_json`; enforces volume/diary, discrepancy/revision, maintenance/discrepancy and incident/diary/volume scope; and prevents audit-chain forks.

### 0480

Makes diary/volume/incident lifecycle monotonic and historical evidence non-deletable: no diary/volume reopen, no closing-act rewrite, write-once incident references and no reverse reconstitution transition.

## 10. Activation posture

Still disabled. This branch does not register a public eDB route, expose a frontend/menu, enable a feature flag, apply 0477–0480, store signing secrets, write real operational eDB data or transmit anything to ANAC.

The safe sequence remains:

CI → controlled integration with current main → governed staging apply `0477 → 0478 → 0479 → 0480` → internal APIs → shadow UI → staging validation → regulatory/security acceptance → explicit production approval.
