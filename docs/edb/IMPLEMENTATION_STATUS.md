# eDB / Diário de Bordo Digital — Implementation Status

Status: **operational-core draft implemented; disabled; not deployed**.

Branch: `feat/edb-operational-core-0477`

Draft PR: #110

The original isolated foundation from #97 has been transplanted onto current `main` and extended with governed migration 0477, explicit regulatory flight semantics and append-only persistence. Runtime activation remains intentionally disabled.

## Implemented

### Regulatory contract and validation

- versioned `edb.regulatory.v1` contract;
- Resolução 773 flight-record fields represented explicitly;
- technical-situation acknowledgement, PIC flight signature and operator signature kept as separate intents;
- operator-signature deadline model for RBAC 121 / RBAC 135 / other;
- deterministic canonical JSON + SHA-256 payload hashing;
- signing-ceremony and signature-proof binding foundation;
- lifecycle, correction/supersession, diary-volume, retention and 30-day onboard-availability policies;
- discrepancy → maintenance action/deferred action → RTS workflow;
- hash-linked audit-chain foundation;
- loss/misplacement/corruption and reconstitution governance.

### 0477 explicit regulatory semantics

The preferred eDB path no longer depends on interpreting similarly named legacy fields. New one-to-one companion data uses explicit names:

- `tempo_voo_diurno_minutos`;
- `tempo_voo_noturno_minutos`;
- `tempo_voo_total_minutos`;
- `tempo_ifr_real_minutos`;
- `tempo_ifr_simulado_minutos`;
- `pousos_total`;
- `ciclos`;
- `combustivel_antes_partida_motor`;
- `pessoas_a_bordo_total`;
- `carga_regulatoria_kg`;
- `ocorrencias_json`;
- `codigo_funcao_anac`.

`NULL` remains “unknown/not completed”. JSON `[]` means explicitly none.

Legacy operational values are still visible to the shadow adapter but are not automatically promoted to regulatory values.

### Persistence core

Migration 0477 adds disabled/inert storage for:

- explicit stage and crew regulatory companions;
- diary and volume identity;
- immutable record revisions;
- separate lifecycle state;
- append-only signatures;
- technical discrepancies;
- maintenance actions / RTS;
- append-only audit events;
- ANAC outbox and external receipts;
- integrity incidents and reconstitution evidence.

Record revisions, signatures, discrepancies, maintenance actions and audit events have database append-only protection. Corrections create new revisions rather than rewriting signed payloads.

### Code path

The current preferred internal flow is:

1. read existing Controle de Voos/RDV structure;
2. read explicit 0477 regulatory companion rows;
3. validate exact semantics;
4. overlay only explicit regulatory values;
5. keep unresolved `NULL` values as readiness blockers;
6. create a canonical immutable draft revision;
7. progress lifecycle in the separate state table;
8. append signature/audit evidence;
9. queue ANAC transmission only after an official interface adapter exists.

## Still intentionally disabled / not implemented

- no public eDB Worker route registered;
- no frontend/menu exposed;
- no production feature flag enabled;
- migration 0477 not applied to staging or production;
- no private-key/certificate secret storage;
- no guessed ANAC DBE endpoint or payload contract;
- no production claim of ANAC authorization/homologation.

## Required gates before activation

1. PR #110 fast/heavy CI and Schema V2 governance green.
2. Governed 0477 staging apply with recovery point and postconditions.
3. Authenticated tenant-scoped internal APIs for regulatory-stage completion and eDB readiness.
4. Shadow Flight Operations UI showing only missing regulatory data / next action.
5. Staging exercises for acknowledgement, signatures, correction, discrepancy/maintenance/RTS, 30-day availability and recovery.
6. Current official ANAC DBE homologation contract/credentials before implementing external transmission.
7. Security/signature architecture accepted for the intended Resolução 458 scope.
8. Explicit approval before production activation.

See `docs/edb/OPERATIONAL_CORE_0477.md` for the 0477 architecture and naming decisions.
