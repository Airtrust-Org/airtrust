# eDB / Flight Operations — Operational Core 0477

Status: **implemented on integration branch; disabled; not deployed**.

Branch: `feat/edb-operational-core-0477`

## What changed from the isolated foundation

The original eDB foundation intentionally refused to infer regulatory data from similarly named RDV/Controle de Voos fields. Migration 0477 turns those gaps into explicit first-class data instead of aliases.

### Canonical explicit stage fields

The eDB path now uses these exact semantics:

- `tempo_voo_diurno_minutos`
- `tempo_voo_noturno_minutos`
- `tempo_voo_total_minutos`
- `tempo_ifr_real_minutos`
- `tempo_ifr_simulado_minutos`
- `pousos_total`
- `ciclos`
- `combustivel_antes_partida_motor`
- `pessoas_a_bordo_total`
- `carga_regulatoria_kg`
- `ocorrencias_json`
- `codigo_funcao_anac`

The existing operational fields remain available to the current RDV/SIGVOOS runtime but are not silently treated as regulatory equivalents.

`NULL` means not completed/known. For list JSON, `[]` means explicitly none.

## New persistence model

0477 adds:

- `cv_voo_etapas_regulatorio`
- `cv_voo_tripulantes_regulatorio`
- `edb_diarios`
- `edb_volumes`
- `edb_registro_revisoes`
- `edb_registro_estado`
- `edb_assinaturas`
- `edb_discrepancias_tecnicas`
- `edb_acoes_manutencao`
- `edb_auditoria_eventos`
- `edb_anac_outbox`
- `edb_anac_recibos`
- `edb_incidentes_integridade`

Record payload revisions, signatures, discrepancy declarations, maintenance actions and audit events are append-only. Lifecycle state is deliberately separated from the immutable revision payload.

## New code path

`controle-voos-source-adapter.ts` remains the conservative legacy shadow adapter.

The preferred 0477 path is:

1. existing Controle de Voos/RDV operational structure;
2. load `cv_voo_etapas_regulatorio` and `cv_voo_tripulantes_regulatorio`;
3. validate exact regulatory semantics;
4. overlay only explicit values through `regulatory-projection.ts`;
5. leave any still-null value as an eDB readiness gap;
6. persist a canonical immutable draft revision through `edb-persistence-repository.ts`;
7. progress lifecycle separately;
8. append signatures/audit evidence;
9. queue ANAC transmission only after the official interface is implemented.

## Important non-inference rules retained

The following remain prohibited as automatic equivalences:

- `starts` → regulatory cycles;
- unclassified `tempo_ifr` → actual/simulated IFR;
- total minus night → day flight time;
- `combustivel_inicio` → fuel before engine start;
- `pax` → POB;
- `payload` → regulatory cargo;
- RDV `divergencias` → maintenance technical discrepancy;
- one flight-level occurrence → every stage of a multi-stage RDV.

An explicit 0477 companion value can resolve each corresponding gap.

## Activation state

Still disabled. This branch does **not**:

- register a public Worker eDB route;
- expose a frontend/menu;
- enable a production feature flag;
- apply migration 0477 to staging or production;
- guess the current ANAC DBE request/response contract;
- store any private signing key.

## Next safe gates

1. CI and Schema V2 governance green.
2. Apply 0477 in staging through the governed schema workflow only.
3. Add authenticated internal APIs for explicit regulatory-stage completion and read-only eDB readiness.
4. Add a shadow UI inside Flight Operations showing only missing data / next action.
5. Exercise draft → PIC technical acknowledgement → PIC signature → operator signature → correction → discrepancy/maintenance/RTS.
6. Implement ANAC adapter only with current official homologation documentation/credentials.
7. Production activation only after regulatory/security acceptance gates.
