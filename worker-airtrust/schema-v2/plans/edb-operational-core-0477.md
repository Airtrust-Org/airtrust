# Schema V2 plan — Flight Operations / eDB operational core (0477)

## Change
`0477_edb_operational_core.sql`

## Objective
Create the first persistent, still-disabled eDB/DBE core and remove the semantic ambiguity that blocked direct generation of regulatory records from Controle de Voos.

The migration is intentionally additive and has two layers:

1. **Explicit regulatory semantics for each realized stage and crew assignment.**
   `cv_voo_etapas_regulatorio` and `cv_voo_tripulantes_regulatorio` hold only values whose regulatory meaning is explicit. The existing operational fields (`starts`, unclassified `tempo_ifr`, `pax`, `payload`, `combustivel_inicio`, RDV `divergencias`) remain untouched and are not reinterpreted.

2. **Append-only eDB persistence.**
   New `edb_*` tables separate diary/volume identity, immutable record revisions, mutable lifecycle state, signature evidence, technical discrepancies, maintenance actions/RTS, hash-linked audit evidence, ANAC outbox/receipts and integrity incidents.

## Naming / semantic cleanup
The canonical regulatory vocabulary introduced by this change is explicit:

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
- `codigo_funcao_anac`

This avoids treating similarly named operational fields as equivalent to ANAC-required data.

`NULL` means “not completed/known”. For JSON list fields, `'[]'` means explicitly “none”.

## Integrity model
- `edb_registro_revisoes` is immutable; correction creates a new revision.
- Lifecycle/status is separated into `edb_registro_estado`.
- Signatures, technical discrepancy declarations, maintenance actions and audit events are append-only through database triggers.
- ANAC synchronization is represented by an idempotent outbox and immutable receipts. No ANAC endpoint or payload is guessed by this migration.
- The application feature remains disabled until runtime/API/UI and homologation gates are approved.

## Safety posture
- Additive only: `CREATE TABLE`, `CREATE INDEX` and append-only protection triggers.
- No existing table is dropped, renamed, rebuilt or rewritten.
- No legacy flight/RDV data is migrated or reclassified.
- No FRMS/LMS table or runtime behavior is changed.
- No production feature flag is enabled.
- No private key/certificate secret is stored by the schema.

## Rollback
Application rollback is sufficient because no existing schema object is modified. The new tables/triggers are inert until eDB runtime code is explicitly enabled. Any destructive cleanup must be a separately reviewed operation.
