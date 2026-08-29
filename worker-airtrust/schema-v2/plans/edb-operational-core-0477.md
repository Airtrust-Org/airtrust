# Schema V2 plan — Flight Operations / eDB operational core (0477)

## Change
`0477_edb_operational_core.sql`

## Objective
Create the first persistent, still-disabled eDB/DBE core and correct ambiguous flight-operation semantics before the module carries real operational data.

The migration is additive and has two layers:

1. **Canonical semantics on the existing source rows.**
   `cv_voo_etapas` receives explicit fields for ANAC/eDB concepts and `cv_voo_tripulantes` receives the explicit ANAC function code. No parallel stage or crew registration is created.

2. **Append-only eDB persistence.**
   New `edb_*` tables separate diary/volume identity, immutable record revisions, mutable lifecycle state, signature evidence, technical discrepancies, maintenance actions/RTS, hash-linked audit evidence, ANAC outbox/receipts and integrity incidents.

## Canonical operational vocabulary

The canonical fields introduced directly on `cv_voo_etapas` are:

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

`cv_voo_tripulantes` receives `codigo_funcao_anac` plus provenance/validation fields.

The legacy columns `starts`, `tempo_ifr`, `pax`, `payload` and `combustivel_inicio` are not regulatory aliases and are not backfilled into the canonical fields. They may remain physically present until a later cleanup, but new eDB code must not rely on them.

`NULL` means “not completed/known”. For JSON list fields, `'[]'` means explicitly “none”.

## SIGVOOS rule

Only exact semantics may populate canonical fields. Unclassified source IFR must remain unclassified and may not be promoted to IFR actual/simulated. PAX is not POB; starts are not cycles; fuel at a similarly named source point is not automatically “fuel before engine start”.

## Integrity model

- `edb_registro_revisoes` is immutable; correction creates a new revision.
- Lifecycle/status is separated into `edb_registro_estado`.
- Signatures, technical discrepancy declarations, maintenance actions and audit events are append-only through database triggers.
- ANAC synchronization is represented by an idempotent outbox and immutable receipts. No ANAC endpoint or payload is guessed by this migration.
- The application feature remains disabled until runtime/API/UI and homologation gates are approved.

## Safety posture

- Additive schema only: `ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX` and append-only protection triggers.
- No existing row is rewritten or reclassified.
- No existing table is dropped, renamed or rebuilt.
- No FRMS/LMS table or runtime behavior is changed.
- No production feature flag is enabled.
- No private key/certificate secret is stored by the schema.

## Rollback

Application rollback is sufficient while 0477 remains unapplied. Once applied in a controlled environment, the added canonical columns and inert eDB objects can remain unused if the feature is disabled; destructive schema cleanup must be a separately reviewed operation.
