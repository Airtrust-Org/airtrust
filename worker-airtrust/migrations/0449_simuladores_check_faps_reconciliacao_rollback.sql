-- Rollback for 0449_simuladores_check_faps_reconciliacao.sql.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: same as 0449 — no new source data, reverses that
--   migration's own writes.
-- operational_decision: revert the is_check flips and remove exactly the
--   (modelo_id, qualificacao_tipo_id) pairs this migration inserted.
-- dry_run_required: run against a local D1 copy seeded from a production
--   export taken after 0449, before use.
-- rollback_plan_required: this file is the rollback plan; idempotent in
--   both directions (no historical row touched, no is_current flip).

DELETE FROM modelos_sessao_checks
WHERE qualificacao_tipo_id = 164 AND modelo_id IN (105, 109, 115, 121);

DELETE FROM modelos_sessao_checks
WHERE modelo_id = 135 AND qualificacao_tipo_id IN (78, 114);

DELETE FROM modelos_sessao_checks
WHERE modelo_id = 142 AND qualificacao_tipo_id = 114;

DELETE FROM modelos_sessao_checks
WHERE modelo_id = 144 AND qualificacao_tipo_id = 114;

UPDATE qualificacoes_tipos SET is_check = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND id = 164 AND codigo = 'FAP6-139' AND is_check = 1;

UPDATE qualificacoes_tipos SET is_check = 0, updated_at = datetime('now')
WHERE empresa_id = 6 AND id = 114 AND codigo = 'IFR-SK76' AND is_check = 1;
