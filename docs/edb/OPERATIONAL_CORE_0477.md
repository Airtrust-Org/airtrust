# eDB / Flight Operations — Operational Core 0477

Status: **implemented on integration branch; staging-shadow gated; not deployed**.

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

The current RDV/Controle de Voos runtime can still contain older fields. The eDB adapter exposes ambiguous values only as evidence and does not promote them silently.

Prohibited automatic equivalences include:

- `starts` → cycles;
- `pax` → POB;
- `payload` → regulatory cargo;
- `combustivel_inicio` → fuel before engine start;
- unclassified `tempo_ifr` → IFR actual/simulated;
- total minus night → day flight time;
- RDV `divergencias` → maintenance discrepancy;
- flight-level occurrence → every stage of a multi-stage RDV.

`tempo_ifr_nao_classificado_minutos` retains unresolved IFR evidence without pretending it satisfies actual/simulated IFR classification. Landing totals and cycles remain independent concepts.

## 3. Preflight technical awareness is independent

The PIC technical acknowledgement must exist before the flight and therefore cannot be modeled as a state of an immutable record that only becomes complete after the flight.

0477 separates the flow:

`aircraft + maintenance situation`

→ immutable `edb_situacoes_tecnicas` snapshot

→ canonical snapshot SHA-256

→ deliberate PIC technical signature/acknowledgement

→ immutable `edb_ciencias_tecnicas_pic`

A change to aircraft identity or maintenance data produces a different technical-content hash. Times, landings, cycles, IFR split, fuel, POB, cargo and occurrences are intentionally outside the preflight hash.

## 4. Postflight final record

After the flight, the server reconstructs the signable record from tenant-scoped canonical Controle de Voos data plus the persisted preflight evidence. The client cannot provide an arbitrary `flight` object to become regulated history.

The finalizer:

1. requires an explicit source stage;
2. requires the historical preflight PIC technical acknowledgement;
3. verifies acknowledgement ↔ snapshot ↔ company ↔ flight binding;
4. verifies current aircraft/maintenance against the acknowledged snapshot;
5. verifies acknowledgement occurred before engine start when that time is available;
6. reads the explicit stage values and crew/function data from canonical server sources;
7. blocks unresolved/unclassified IFR and other missing regulatory semantics;
8. freezes a final immutable revision referencing `ciencia_tecnica_pic_id`.

The final-record lifecycle is:

`DRAFT → READY_FOR_PIC_SIGNATURE → PIC_SIGNED → OPERATOR_SIGNED → ANAC_PENDING → ANAC_SYNCED`

`ANAC_SYNCED` remains unavailable until a future official ANAC acceptance adapter defines and validates accepted response semantics.

## 5. Signatures

Three signature intents exist:

- `PIC_TECHNICAL_ACK`: preflight, stored in `edb_ciencias_tecnicas_pic`;
- `PIC_FLIGHT_RECORD`: postflight, stored in `edb_assinaturas`;
- `OPERATOR_RECORD`: after PIC flight signature, stored in `edb_assinaturas`.

The signature ceremony binds intent, reviewed content, authenticated identity, exact target identity and SHA-256 hash. It stores proof references/certificate evidence, never private keys.

PIC signature + `PIC_SIGNED` and operator signature + `OPERATOR_SIGNED` are each persisted atomically in one D1 batch.

In the guarded shadow API, PIC acknowledgement/final signature also requires the authenticated employee to be actually assigned as PIC on the source flight. Operator signature is manager-only.

## 6. Correction model

Signed records are not overwritten.

A correction:

- preserves `logicalRecordId`;
- creates a new `revisionId`;
- references the prior revision through `supersedesRevisionId`;
- records a correction reason;
- preserves the historical preflight technical acknowledgement that actually preceded the flight;
- rebuilds operational values from the current canonical source rather than client-supplied flight JSON;
- clears prior postflight PIC/operator signatures;
- requires new final-record signatures.

A correction made after the event never creates a fictitious new preflight acknowledgement.

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

Immutable evidence receives no-update/no-delete protection where applicable. Mutable lifecycle/outbox state is deliberately separated from immutable payload evidence.

## 8. Current internal code path

1. `controle-voos-source-adapter.ts` exposes existing RDV evidence conservatively.
2. `edb-source-repository.ts` reads canonical fields directly from source rows.
3. `operational-regulatory-source.ts` validates explicit semantics and preserves unclassified IFR evidence.
4. `server-flight-record-source.ts` reconstructs final flight/crew data from server-side canonical sources.
5. `technical-awareness.ts` creates/verifies the preflight snapshot and acknowledgement binding.
6. `edb-technical-awareness-repository.ts` persists and revalidates preflight evidence.
7. `postflight-finalization.ts` enforces the preflight/postflight boundary.
8. `edb-persistence-repository.ts` persists revisions, signatures, lifecycle transitions and ANAC queue evidence.
9. `edb-revision-view-repository.ts` rehydrates immutable revision + current lifecycle/signatures and revalidates hashes.
10. `edb-audit-repository.ts` persists/reconstructs and verifies the diary hash chain.
11. `edb-technical-discrepancy-repository.ts` persists/replays discrepancy → maintenance action → RTS history.
12. `edb-diary-repository.ts` persists/reconstructs diary volumes and integrity incidents.
13. `/api/edb` exposes the guarded staging-shadow workflow under explicit tenant allowlist/RBAC.
14. Controle de Voos flight detail exposes a minimal shadow “next action / missing data” card only when capability is enabled.
15. ANAC outbox remains externally inert until an official adapter exists.

## 9. Additive hardening after 0477

### 0478

Hardens internal ANAC outbox/receipt evidence without defining an external endpoint, payload or acceptance meaning.

### 0479

Materializes audit `voo_id`, `situacao_tecnica_id` and `actor_json`; enforces volume/diary, discrepancy/revision, maintenance/discrepancy and incident/diary/volume scope; and prevents audit-chain forks.

### 0480

Makes diary/volume/incident lifecycle monotonic and historical evidence non-deletable: no diary/volume reopen, no closing-act rewrite, write-once incident references and no reverse reconstitution transition.

## 10. Activation posture

The code surface now exists, but activation remains fail-closed:

- `/api/edb` operational shadow requires `ENVIRONMENT=staging` and an explicit positive tenant ID in `EDB_SHADOW_PILOT_TENANTS`;
- `all` is rejected and production cannot enable the gate;
- no production eDB menu/feature flag is enabled;
- 0477–0480 have not been applied to staging or production;
- no real production eDB data is written;
- no private signing key is stored;
- no ANAC external endpoint/payload/acceptance contract is guessed;
- no claim of ANAC authorization/homologation is made.

The governed staging runner for 0477–0480 verifies the Schema V2 manifest, proves migration/Schema V2 SQL copies are identical, captures a D1 Time Travel recovery point, writes both `airtrust_schema_changes_v2` and `d1_migrations` in the reviewed apply bundle, and fails closed on ledger divergence before migration-specific postconditions.

The remaining safe sequence is:

final CI → confirm current `main` → merge reviewed governance/code → official staging apply `0477 → 0478 → 0479 → 0480` → staging Worker/frontend shadow deploy → full staging exercises → official ANAC/security acceptance work → explicit production approval.
