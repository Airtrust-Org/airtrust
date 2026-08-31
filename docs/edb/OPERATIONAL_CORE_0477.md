# eDB / Flight Operations — Operational Core 0477

Status: **implemented; schema 0477–0480 applied to staging only; branch runtime non-production and not ANAC-authorized**.

Branch: `feat/edb-operational-core-0477`

## Purpose

0477 establishes the persistent foundation for the future Diário de Bordo Digital while the module still has no production eDB data. It uses this opportunity to fix ambiguous operational naming before those ambiguities become regulated history.

The design has one operational source of truth and separate immutable regulatory evidence.

Later additive changes 0478–0480 harden ANAC evidence, relational/audit bindings and diary/volume/incident lifecycle. The complete 0477–0480 sequence has been applied to the pinned staging D1 through the governed staging release path. None has been applied to production.

## 1. One operational source

Canonical flight semantics are added directly to the existing `cv_voo_etapas` rows. The regulatory crew-function code is added directly to `cv_voo_tripulantes`.

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

The **internal final-record lifecycle** is:

`DRAFT → READY_FOR_PIC_SIGNATURE → PIC_SIGNED → OPERATOR_SIGNED`

`OPERATOR_SIGNED` is the internal completion point for the immutable AirTrust record/evidence flow. This does not itself authorize official regulatory use of the system.

The schema reserves a separate external integration track:

`OPERATOR_SIGNED → ANAC_PENDING → ANAC_SYNCED`

That track is not required for internal record completion. It can only become operational if the accepted ANAC scope requires or permits such sharing and an authoritative adapter contract is available. `ANAC_SYNCED` remains unavailable until accepted response semantics are implemented.

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
8. `edb-persistence-repository.ts` persists revisions, signatures, lifecycle transitions and optional ANAC queue evidence.
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

## 10. Staging evidence and QA consolidation

The 0477–0480 sequence was applied to the pinned staging D1 through `Deploy Staging (Official)` run #39 / `33269772056`, from exact schema release SHA `5e6df4e1fc3b633a260c705c53fe1deca63ad382`.

Prior governed staging evidence proved authentication, tenant gating and safe error behavior against exact reviewed eDB branch releases.

The full synthetic lifecycle QA work that began as Draft PR #184 was superseded without source change by PR #186 and merged to canonical `main` as `0a5e25a3e7126c97046f5bfd8a848cebd40483a3`. That workflow intentionally stops both signed revisions at `OPERATOR_SIGNED` and performs no ANAC queue/sync/transmission.

Because PR #110 remains unmerged, canonical `main` does not contain the branch-only `worker-airtrust/src/routes/edb-shadow.ts`. A later staging Worker deploy from `main` can therefore replace a prior eDB branch release. The full synthetic lifecycle must run only after exact staging `/api/version` provenance proves the Worker contains the reviewed #110 runtime.

## 11. Isolated persistence and D1-runtime validation

CI contains two complementary isolated gates:

1. **Node SQLite `:memory:` persisted lifecycle** — exercises the complete synthetic persistence/evidence lifecycle without remote side effects.
2. **Cloudflare Wrangler local D1 parity** — applies 0477–0480 to the tracked local-only D1 configuration, validates the eDB tables/columns/triggers and deliberately attempts a forbidden technical-snapshot update, which must fail with `EDB_TECHNICAL_SITUATION_IMMUTABLE`.

The local D1 gate uses:

- database name `airtrust-db-local`;
- dummy database ID `00000000-0000-0000-0000-000000000001`;
- `--local` + temporary `--persist-to` directory;
- sanitized/blank Cloudflare credentials;
- cleanup of the local persistence directory after execution.

It has no staging/production D1 write path and no ANAC transmission path.

## 12. Activation posture

The code exists, but official activation remains fail-closed:

- `/api/edb` operational shadow requires `ENVIRONMENT=staging` and an explicit positive tenant ID in `EDB_SHADOW_PILOT_TENANTS`;
- `all` is rejected and production cannot enable the gate;
- no production eDB menu/feature flag is enabled;
- 0477–0480 are present in staging only and have not been applied to production;
- no real production eDB data is written;
- no private signing key is stored;
- no ANAC external endpoint/payload/acceptance contract is guessed;
- no claim of ANAC authorization/homologation is made.

The current regulatory reading also preserves a key separation: ANAC authorization/acceptance of the system is mandatory before official digital use, but external record transmission is not modeled as a universal mandatory terminal state. The applicable acceptance path and any sharing obligations must be established with ANAC for the intended operating scope.

The remaining safe sequence is:

frozen green PR evidence → exact reviewed #110 staging Worker release → governed full synthetic staging lifecycle → determine applicable Resolução 458 acceptance path and current ANAC onboarding/interface obligations → freeze accepted signature/security architecture → explicit production approval.
