-- Compensation for 0481_training_dependency_planning.sql.
-- Disable automation without deleting historical qualification data or already-created plans.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference: PR #225 (feat/training-dependency-planning) - Schema V2 0481 rollback
--   operational_decision: Compensatory rollback disabling active rule and dropping triggers without deleting audit history.
--   dry_run_required: Confirm rule and trigger status in target environment.
--   rollback_plan_required: scripts/rollback/0481_training_dependency_planning.sql
--

UPDATE treinamento_dependencias
   SET ativo = 0,
       updated_at = datetime('now')
 WHERE empresa_id = 6
   AND qualificacao_origem_id = 33
   AND qualificacao_destino_id = 106
   AND vigencia_inicio = '2026-08-31'
   AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_qualificacao_dependencia_after_insert;
DROP TRIGGER IF EXISTS trg_qualificacao_dependencia_after_update;
DROP TRIGGER IF EXISTS trg_treinamento_dependencia_evento_dispatch;
DROP TRIGGER IF EXISTS trg_treinamento_dependencia_evento_recalculate;

-- Deliberately retained for audit/recovery:
--   treinamento_dependencias
--   treinamento_dependencia_eventos
--   generated treinamentos_planejados / participantes / auditoria rows
