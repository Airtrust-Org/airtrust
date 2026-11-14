# Plan 0586: Instructor Guides V2 Schema for PTO Rev.10 V18

## Context
Issue `#2232` and PR `#776` track AirTrust's compliance with **PTO Rev.10 V18**. The legacy instructor guides tables (`simuladores_guias_instrutor`, `simuladores_modelos_sessao_guias`, `simuladores_guias_instrutor_auditoria` created by migration `0439`) restrict `programa` to `('INICIAL', 'PERIODICO', 'SEMESTRAL', 'CHECK')` and define `modelo_aeronave_id INTEGER NOT NULL`.

PTO Rev.10 V18 introduces **88 active session models** (`37` AW139, `45` SK76, and `6` functional `INSTRUTOR`/`EXAMINADOR` sessions across `10` programs: `INICIAL`, `TRANSICAO`, `PERIODICO`, `SEMESTRAL`, `REQUALIFICACAO`, `RECENTE`, `NOTURNO`, `CHECK`, `INSTRUTOR`, `EXAMINADOR`). Functional sessions are not bound to a single aircraft type (`modelo_aeronave_id IS NULL`).

Because Schema V2 forbids non-atomic table rebuilds (`DROP TABLE` + `ALTER TABLE ... RENAME TO`, which under `PRAGMA foreign_keys=ON` also cascades deletes to child link and audit rows), this change uses purely additive `_v2` tables and idempotent backfill preserving exact row IDs.

## Scope & Guarantees
- **Targets**:
  - `simuladores_guias_instrutor_v2`
  - `simuladores_modelos_sessao_guias_v2`
  - `simuladores_guias_instrutor_auditoria_v2`
- **Legacy tables preserved**: `simuladores_guias_instrutor`, `simuladores_modelos_sessao_guias`, and `simuladores_guias_instrutor_auditoria` remain intact as read/archive history during and after rollout.
- **No synthetic/non-approved guide publishing**: This change creates schema structure and copies existing historical rows with exact IDs. It does NOT publish any V18 draft guide or fabricate technical reviewer sign-offs.
- **Zero-downtime deploy & transition sync**:
  1. Legacy-to-`_v2` `AFTER INSERT` / `AFTER UPDATE` / `AFTER DELETE` triggers created in `0586` mirror any writes performed by the previous Worker (or compatible legacy relink executors before V18 divergence) directly into `_v2` during the transition window, preventing lost writes between applying `0586` and deploying the new Worker.
  2. Merge code & apply `0586` via `Apply Schema Change V2` while the current Worker continues reading/writing the original tables without interruption.
  3. Deploy the updated Worker & Pages referencing the `_v2` tables via `Deploy AirTrust`. Once the updated Worker writes to `_v2`, legacy relink executors fail closed on `_v2` divergence.

## Verification & Recovery
- Automated SQLite tests verify additive creation, backfill fidelity (exact IDs, `substituido_por_id` self-FKs, link and audit counts), check constraints (`modelo_aeronave_id IS NULL` allowed strictly for `INSTRUTOR`/`EXAMINADOR` and rejected for aircraft programs), unique active index with `COALESCE(modelo_aeronave_id, -1)`, and idempotency.
- Preflight/postcondition scripts: `scripts/schema-v2/validate-0586-production-preflight.sh` and `scripts/schema-v2/validate-0586-production-postconditions.sh`.
- Rollback/recovery relies on the D1 Time Travel recovery point captured by `Apply Schema Change V2` before execution. Because original tables remain untouched prior to deploying the new Worker, reverting Worker/Pages before cutover is instantaneous and lossless.
