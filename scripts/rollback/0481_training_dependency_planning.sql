-- Compensation for 0481_training_dependency_planning.sql.
-- Disable automation without deleting historical qualification data or already-created plans.

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
