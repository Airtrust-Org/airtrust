-- Rollback for 0448_simuladores_matriz_aw139_sk76_gera_qualificacao.sql.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: same as 0448 — no new source data, reverses that
--   migration's own writes.
-- operational_decision: clear gera_qualificacao/qualificacao_tipo_id back
--   to 0/NULL on exactly the same 7 ids, guarded by the exact values 0448
--   wrote so a row a human edited afterwards is left untouched.
-- dry_run_required: run against a local D1 copy seeded from a production
--   export taken after 0448, before use.
-- rollback_plan_required: this file is the rollback plan; idempotent in
--   both directions (no historical row touched).

UPDATE modelos_sessao SET gera_qualificacao = 0, qualificacao_tipo_id = NULL, updated_at = datetime('now')
WHERE empresa_id = 6 AND gera_qualificacao = 1 AND qualificacao_tipo_id = 33
  AND id IN (109, 115, 121);

UPDATE modelos_sessao SET gera_qualificacao = 0, qualificacao_tipo_id = NULL, updated_at = datetime('now')
WHERE empresa_id = 6 AND gera_qualificacao = 1 AND qualificacao_tipo_id = 106
  AND id IN (111, 117, 153);

UPDATE modelos_sessao SET gera_qualificacao = 0, qualificacao_tipo_id = NULL, updated_at = datetime('now')
WHERE empresa_id = 6 AND gera_qualificacao = 1 AND qualificacao_tipo_id = 40
  AND id IN (142);
