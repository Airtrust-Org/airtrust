-- Migration 0482: enrich training-dependency seeds with the complete simulator curriculum.
-- Additive/compensatory follow-up to 0481. No qualification-history backfill.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference: PR follow-up to #225 / complete-training planning correction
--   operational_decision: Dependency rows remain durable obligations; snapshots expose the full active curriculum and must be expanded by Planning V2 before materialization.
--   dry_run_required: Validate open dependency rows, active session models and postconditions in staging before production execution.
--   rollback_plan_required: scripts/rollback/0482_training_dependency_complete_curriculum.sql
--

CREATE TRIGGER IF NOT EXISTS trg_training_dependency_plan_enrich
AFTER INSERT ON treinamentos_planejados
WHEN NEW.deleted_at IS NULL
 AND NEW.planejamento_origem = 'SIMULADOR_QUINZENA'
 AND json_valid(COALESCE(NEW.planejamento_snapshot_json, '')) = 1
 AND json_extract(NEW.planejamento_snapshot_json, '$.generated_by') = 'TRAINING_DEPENDENCY'
 AND EXISTS (
   SELECT 1
     FROM modelos_sessao ms
    WHERE ms.empresa_id = NEW.empresa_id
      AND ms.qualificacao_tipo_id = NEW.qualificacao_tipo_id
      AND ms.deleted_at IS NULL
      AND COALESCE(ms.ativo, 1) = 1
 )
BEGIN
  UPDATE treinamentos_planejados
     SET planejamento_snapshot_json = json_set(
           planejamento_snapshot_json,
           '$.materialization_strategy', 'TRAINING_PLAN_REQUIRED',
           '$.curriculum_model_ids',
             json(COALESCE((
               SELECT json_group_array(id)
                 FROM (
                   SELECT ms.id AS id
                     FROM modelos_sessao ms
                    WHERE ms.empresa_id = NEW.empresa_id
                      AND ms.qualificacao_tipo_id = NEW.qualificacao_tipo_id
                      AND ms.deleted_at IS NULL
                      AND COALESCE(ms.ativo, 1) = 1
                    ORDER BY COALESCE(ms.ordem_no_treinamento, 999999), ms.id
                 )
             ), '[]')),
           '$.curriculum_total_sessions',
             (
               SELECT COUNT(*)
                 FROM modelos_sessao ms
                WHERE ms.empresa_id = NEW.empresa_id
                  AND ms.qualificacao_tipo_id = NEW.qualificacao_tipo_id
                  AND ms.deleted_at IS NULL
                  AND COALESCE(ms.ativo, 1) = 1
             ),
           '$.participants[0].session_model_ids',
             json(COALESCE((
               SELECT json_group_array(id)
                 FROM (
                   SELECT ms.id AS id
                     FROM modelos_sessao ms
                    WHERE ms.empresa_id = NEW.empresa_id
                      AND ms.qualificacao_tipo_id = NEW.qualificacao_tipo_id
                      AND ms.deleted_at IS NULL
                      AND COALESCE(ms.ativo, 1) = 1
                    ORDER BY COALESCE(ms.ordem_no_treinamento, 999999), ms.id
                 )
             ), '[]'))
         ),
         updated_at = datetime('now')
   WHERE id = NEW.id
     AND empresa_id = NEW.empresa_id
     AND deleted_at IS NULL;
END;

-- Repair only still-open dependency obligations created by 0481. This is not a
-- qualification-history backfill and does not create/cancel training records.
UPDATE treinamentos_planejados
   SET planejamento_snapshot_json = json_set(
         planejamento_snapshot_json,
         '$.materialization_strategy', 'TRAINING_PLAN_REQUIRED',
         '$.curriculum_model_ids',
           json(COALESCE((
             SELECT json_group_array(id)
               FROM (
                 SELECT ms.id AS id
                   FROM modelos_sessao ms
                  WHERE ms.empresa_id = treinamentos_planejados.empresa_id
                    AND ms.qualificacao_tipo_id = treinamentos_planejados.qualificacao_tipo_id
                    AND ms.deleted_at IS NULL
                    AND COALESCE(ms.ativo, 1) = 1
                  ORDER BY COALESCE(ms.ordem_no_treinamento, 999999), ms.id
               )
           ), '[]')),
         '$.curriculum_total_sessions',
           (
             SELECT COUNT(*)
               FROM modelos_sessao ms
              WHERE ms.empresa_id = treinamentos_planejados.empresa_id
                AND ms.qualificacao_tipo_id = treinamentos_planejados.qualificacao_tipo_id
                AND ms.deleted_at IS NULL
                AND COALESCE(ms.ativo, 1) = 1
           ),
         '$.participants[0].session_model_ids',
           json(COALESCE((
             SELECT json_group_array(id)
               FROM (
                 SELECT ms.id AS id
                   FROM modelos_sessao ms
                  WHERE ms.empresa_id = treinamentos_planejados.empresa_id
                    AND ms.qualificacao_tipo_id = treinamentos_planejados.qualificacao_tipo_id
                    AND ms.deleted_at IS NULL
                    AND COALESCE(ms.ativo, 1) = 1
                  ORDER BY COALESCE(ms.ordem_no_treinamento, 999999), ms.id
               )
           ), '[]'))
       ),
       updated_at = datetime('now')
 WHERE deleted_at IS NULL
   AND planejamento_origem = 'SIMULADOR_QUINZENA'
   AND planejamento_status IN (
     'PROPOSTO', 'PLANEJADO', 'AGUARDANDO_DISPONIBILIDADE', 'CONFIRMADO', 'REPLANEJAR'
   )
   AND json_valid(COALESCE(planejamento_snapshot_json, '')) = 1
   AND json_extract(planejamento_snapshot_json, '$.generated_by') = 'TRAINING_DEPENDENCY'
   AND EXISTS (
     SELECT 1
       FROM modelos_sessao ms
      WHERE ms.empresa_id = treinamentos_planejados.empresa_id
        AND ms.qualificacao_tipo_id = treinamentos_planejados.qualificacao_tipo_id
        AND ms.deleted_at IS NULL
        AND COALESCE(ms.ativo, 1) = 1
   );
