-- Migration 0490: restore simulator planning curriculum metadata for Costa do Sol.
--
-- Root cause: versioned matrix imports preserved the physical/current session rows but
-- did not carry forward planning metadata (`duracao_estimada` and
-- `ordem_no_treinamento`) for the recurrent AW139/S-76 curricula. In addition,
-- `qualificacao_tipo_id` is intentionally dual-use: the generating/check session may
-- remain linked to a qualification even when it is not a member of the currently
-- schedulable curriculum. Curriculum membership is therefore defined by a positive
-- `ordem_no_treinamento`, not by `qualificacao_tipo_id` alone.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: worker-airtrust/data/simuladores-matriz/session-contract-51.json;
--   docs/analysis/composicao-curricular-implementation-sonnet-20260713/CURRICULUM_BEFORE_AFTER.csv;
--   worker-airtrust/migrations/0434_atualizar_nomes_periodico_pto_rev10.sql;
--   worker-airtrust/schema-v2/changes/0459_sk76_periodic_code_denominator.sql;
--   read-only production audit 2026-09-13.
-- operational_decision: restore 120-minute recurrent-session duration for the 25
--   current AW139/S-76 recurrent models and configure the 2026 C2 planning curriculum:
--   G1 = 4 AW139 periodic sessions, G1-SEM = 2 AW139 semiannual sessions,
--   G2 = 3 S-76 periodic sessions. C1/C3 generating checks keep their qualification
--   linkage but stay unordered/non-curricular. S-76 /04 and /03 naming are accepted
--   only as the two complete, non-mixed states around governed change 0459.
-- dry_run_required: run the dedicated 0490 SQLite migration test and the read-only
--   production preflight before any remote apply.
-- rollback_plan_required: use D1 Time Travel recovery point for remote failure; an
--   intentional later curriculum change must be a new reviewed Schema V2 change.

CREATE TABLE IF NOT EXISTS _0490_guard (id INTEGER PRIMARY KEY CHECK(id = 1));
CREATE TRIGGER IF NOT EXISTS _0490_preflight
BEFORE INSERT ON _0490_guard
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sqlite_master WHERE type='table' AND name='modelos_sessao_versionamento'
  ) THEN RAISE(ABORT, '0490 preflight: modelos_sessao_versionamento ausente') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM qualificacoes_tipos
     WHERE empresa_id=6 AND deleted_at IS NULL AND codigo IN ('G1','G1-SEM','G2')
  ) <> 3 THEN RAISE(ABORT, '0490 preflight: G1/G1-SEM/G2 nao resolvem unicamente no tenant 6') END;

  SELECT CASE WHEN (
    SELECT COUNT(*)
      FROM modelos_sessao_versionamento v
     WHERE v.empresa_id=6 AND v.is_current=1
       AND v.codigo_canonico IN (
         'A139-P-01/04-C1','A139-P-01/04-C2','A139-P-01/04-C3',
         'A139-P-02/04-C1-OFFSHORE','A139-P-02/04-C2-OFFSHORE','A139-P-02/04-C3-OFFSHORE',
         'A139-P-03/04-C1-IFR-LOFT','A139-P-03/04-C2-IFR-LOFT','A139-P-03/04-C3-IFR-LOFT',
         'A139-P-04/04-C1-CHECK','A139-P-04/04-C2-CHECK','A139-P-04/04-C3-CHECK',
         'A139-S-01/02-C1','A139-S-01/02-C2','A139-S-01/02-C3',
         'A139-S-02/02-C1','A139-S-02/02-C2','A139-S-02/02-C3'
       )
  ) <> 18 THEN RAISE(ABORT, '0490 preflight: esperados 18 modelos AW139 recorrentes correntes') END;

  SELECT CASE WHEN NOT (
    (SELECT COUNT(*) FROM modelos_sessao_versionamento
      WHERE empresa_id=6 AND is_current=1 AND codigo_canonico IN (
        'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
        'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3')) = 6
    AND
    (SELECT COUNT(*) FROM modelos_sessao_versionamento
      WHERE empresa_id=6 AND is_current=1 AND codigo_canonico IN (
        'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
        'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3')) = 0
    OR
    (SELECT COUNT(*) FROM modelos_sessao_versionamento
      WHERE empresa_id=6 AND is_current=1 AND codigo_canonico IN (
        'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
        'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3')) = 0
    AND
    (SELECT COUNT(*) FROM modelos_sessao_versionamento
      WHERE empresa_id=6 AND is_current=1 AND codigo_canonico IN (
        'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
        'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3')) = 6
  ) THEN RAISE(ABORT, '0490 preflight: estado S-76 /04-/03 misto ou incompleto') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM modelos_sessao_versionamento
     WHERE empresa_id=6 AND is_current=1 AND codigo_canonico='SK76-P-CHECK'
  ) <> 1 THEN RAISE(ABORT, '0490 preflight: SK76-P-CHECK corrente ausente ou ambiguo') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM modelos_sessao_versionamento v
      JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id
     WHERE v.empresa_id=6 AND v.is_current=1
       AND (
         v.codigo_canonico LIKE 'A139-P-%' OR v.codigo_canonico LIKE 'A139-S-%'
         OR v.codigo_canonico LIKE 'S76-P-%' OR v.codigo_canonico='SK76-P-CHECK'
       )
       AND ms.duracao_estimada IS NOT NULL
       AND ms.duracao_estimada <> 120
  ) THEN RAISE(ABORT, '0490 preflight: duracao recorrente existente diverge de 120 minutos') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM modelos_sessao_versionamento v
      JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id=ms.qualificacao_tipo_id AND qt.empresa_id=ms.empresa_id
     WHERE v.empresa_id=6 AND v.is_current=1
       AND v.codigo_canonico IN (
         'A139-P-01/04-C2','A139-P-02/04-C2-OFFSHORE','A139-P-03/04-C2-IFR-LOFT','A139-P-04/04-C2-CHECK'
       )
       AND (ms.qualificacao_tipo_id IS NOT NULL AND COALESCE(qt.codigo,'') <> 'G1'
            OR ms.ordem_no_treinamento IS NOT NULL AND ms.ordem_no_treinamento NOT BETWEEN 1 AND 4)
  ) THEN RAISE(ABORT, '0490 preflight: AW139 G1 C2 possui vinculo/ordem divergente') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM modelos_sessao_versionamento v
      JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id=ms.qualificacao_tipo_id AND qt.empresa_id=ms.empresa_id
     WHERE v.empresa_id=6 AND v.is_current=1
       AND v.codigo_canonico IN ('A139-S-01/02-C2','A139-S-02/02-C2')
       AND (ms.qualificacao_tipo_id IS NOT NULL AND COALESCE(qt.codigo,'') <> 'G1-SEM'
            OR ms.ordem_no_treinamento IS NOT NULL AND ms.ordem_no_treinamento NOT BETWEEN 1 AND 2)
  ) THEN RAISE(ABORT, '0490 preflight: AW139 G1-SEM C2 possui vinculo/ordem divergente') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM modelos_sessao_versionamento v
      JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id=ms.qualificacao_tipo_id AND qt.empresa_id=ms.empresa_id
     WHERE v.empresa_id=6 AND v.is_current=1
       AND (v.codigo_canonico IN ('S76-P-01/04-C2','S76-P-02/04-C2','S76-P-01/03-C2','S76-P-02/03-C2')
            OR v.codigo_canonico='SK76-P-CHECK')
       AND (ms.qualificacao_tipo_id IS NOT NULL AND COALESCE(qt.codigo,'') <> 'G2'
            OR ms.ordem_no_treinamento IS NOT NULL AND ms.ordem_no_treinamento NOT BETWEEN 1 AND 3)
  ) THEN RAISE(ABORT, '0490 preflight: S-76 G2 C2 possui vinculo/ordem divergente') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM modelos_sessao_versionamento v
      JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id
      JOIN qualificacoes_tipos qt ON qt.id=ms.qualificacao_tipo_id AND qt.empresa_id=ms.empresa_id
     WHERE v.empresa_id=6 AND v.is_current=1
       AND qt.codigo IN ('G1','G1-SEM','G2')
       AND ms.ordem_no_treinamento IS NOT NULL
       AND NOT (
         v.codigo_canonico IN (
           'A139-P-01/04-C2','A139-P-02/04-C2-OFFSHORE','A139-P-03/04-C2-IFR-LOFT','A139-P-04/04-C2-CHECK',
           'A139-S-01/02-C2','A139-S-02/02-C2',
           'S76-P-01/04-C2','S76-P-02/04-C2','S76-P-01/03-C2','S76-P-02/03-C2','SK76-P-CHECK'
         )
       )
  ) THEN RAISE(ABORT, '0490 preflight: ha curriculo G1/G1-SEM/G2 ordenado fora do C2 aprovado') END;
END;
INSERT INTO _0490_guard(id) VALUES (1);
DROP TRIGGER IF EXISTS _0490_preflight;
DROP TABLE IF EXISTS _0490_guard;

-- Restore the source-approved recurrent duration. This changes only current
-- versions. Historical physical rows keep their original state.
UPDATE modelos_sessao
   SET duracao_estimada=120, updated_at=datetime('now')
 WHERE id IN (
   SELECT v.modelo_id
     FROM modelos_sessao_versionamento v
    WHERE v.empresa_id=6 AND v.is_current=1
      AND v.codigo_canonico IN (
        'A139-P-01/04-C1','A139-P-01/04-C2','A139-P-01/04-C3',
        'A139-P-02/04-C1-OFFSHORE','A139-P-02/04-C2-OFFSHORE','A139-P-02/04-C3-OFFSHORE',
        'A139-P-03/04-C1-IFR-LOFT','A139-P-03/04-C2-IFR-LOFT','A139-P-03/04-C3-IFR-LOFT',
        'A139-P-04/04-C1-CHECK','A139-P-04/04-C2-CHECK','A139-P-04/04-C3-CHECK',
        'A139-S-01/02-C1','A139-S-01/02-C2','A139-S-01/02-C3',
        'A139-S-02/02-C1','A139-S-02/02-C2','A139-S-02/02-C3',
        'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
        'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3',
        'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
        'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3',
        'SK76-P-CHECK'
      )
 );

-- 2026 active planning curriculum: AW139 G1 C2 = 4 physical sessions.
UPDATE modelos_sessao SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G1' AND deleted_at IS NULL), ordem_no_treinamento=1, updated_at=datetime('now') WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico='A139-P-01/04-C2');
UPDATE modelos_sessao SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G1' AND deleted_at IS NULL), ordem_no_treinamento=2, updated_at=datetime('now') WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico='A139-P-02/04-C2-OFFSHORE');
UPDATE modelos_sessao SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G1' AND deleted_at IS NULL), ordem_no_treinamento=3, updated_at=datetime('now') WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico='A139-P-03/04-C2-IFR-LOFT');
UPDATE modelos_sessao SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G1' AND deleted_at IS NULL), ordem_no_treinamento=4, updated_at=datetime('now') WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico='A139-P-04/04-C2-CHECK');

-- AW139 G1-SEM C2 = 2 physical sessions.
UPDATE modelos_sessao SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G1-SEM' AND deleted_at IS NULL), ordem_no_treinamento=1, updated_at=datetime('now') WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico='A139-S-01/02-C2');
UPDATE modelos_sessao SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G1-SEM' AND deleted_at IS NULL), ordem_no_treinamento=2, updated_at=datetime('now') WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico='A139-S-02/02-C2');

-- S-76 G2 C2 = 01/03, 02/03 and the shared physical check model as 03/03.
-- The first two rows accept either complete code state around migration 0459.
UPDATE modelos_sessao SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G2' AND deleted_at IS NULL), ordem_no_treinamento=1, updated_at=datetime('now') WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico IN ('S76-P-01/04-C2','S76-P-01/03-C2'));
UPDATE modelos_sessao SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G2' AND deleted_at IS NULL), ordem_no_treinamento=2, updated_at=datetime('now') WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico IN ('S76-P-02/04-C2','S76-P-02/03-C2'));
UPDATE modelos_sessao SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G2' AND deleted_at IS NULL), ordem_no_treinamento=3, updated_at=datetime('now') WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico='SK76-P-CHECK');

-- 0482 originally enriched dependency snapshots by every qualification-linked
-- model. Replace that trigger with the explicit ordered-curriculum semantics.
DROP TRIGGER IF EXISTS trg_training_dependency_plan_enrich;
CREATE TRIGGER trg_training_dependency_plan_enrich
AFTER INSERT ON treinamentos_planejados
WHEN NEW.deleted_at IS NULL
 AND NEW.planejamento_origem = 'SIMULADOR_QUINZENA'
 AND json_valid(COALESCE(NEW.planejamento_snapshot_json, '')) = 1
 AND json_extract(NEW.planejamento_snapshot_json, '$.generated_by') = 'TRAINING_DEPENDENCY'
 AND EXISTS (
   SELECT 1 FROM modelos_sessao ms
    WHERE ms.empresa_id = NEW.empresa_id
      AND ms.qualificacao_tipo_id = NEW.qualificacao_tipo_id
      AND ms.ordem_no_treinamento IS NOT NULL
      AND ms.deleted_at IS NULL AND COALESCE(ms.ativo, 1) = 1
 )
BEGIN
  UPDATE treinamentos_planejados
     SET planejamento_snapshot_json = json_set(
           planejamento_snapshot_json,
           '$.materialization_strategy', 'TRAINING_PLAN_REQUIRED',
           '$.curriculum_model_ids', json(COALESCE((
             SELECT json_group_array(id) FROM (
               SELECT ms.id AS id FROM modelos_sessao ms
                WHERE ms.empresa_id = NEW.empresa_id
                  AND ms.qualificacao_tipo_id = NEW.qualificacao_tipo_id
                  AND ms.ordem_no_treinamento IS NOT NULL
                  AND ms.deleted_at IS NULL AND COALESCE(ms.ativo, 1) = 1
                ORDER BY ms.ordem_no_treinamento, ms.id
             )
           ), '[]')),
           '$.curriculum_total_sessions', (
             SELECT COUNT(*) FROM modelos_sessao ms
              WHERE ms.empresa_id = NEW.empresa_id
                AND ms.qualificacao_tipo_id = NEW.qualificacao_tipo_id
                AND ms.ordem_no_treinamento IS NOT NULL
                AND ms.deleted_at IS NULL AND COALESCE(ms.ativo, 1) = 1
           ),
           '$.participants[0].session_model_ids', json(COALESCE((
             SELECT json_group_array(id) FROM (
               SELECT ms.id AS id FROM modelos_sessao ms
                WHERE ms.empresa_id = NEW.empresa_id
                  AND ms.qualificacao_tipo_id = NEW.qualificacao_tipo_id
                  AND ms.ordem_no_treinamento IS NOT NULL
                  AND ms.deleted_at IS NULL AND COALESCE(ms.ativo, 1) = 1
                ORDER BY ms.ordem_no_treinamento, ms.id
             )
           ), '[]'))
         ),
         updated_at = datetime('now')
   WHERE id = NEW.id AND empresa_id = NEW.empresa_id AND deleted_at IS NULL;
END;

-- Reconcile only still-open dependency seeds; finalized/cancelled records remain historical.
UPDATE treinamentos_planejados
   SET planejamento_snapshot_json = json_set(
         planejamento_snapshot_json,
         '$.materialization_strategy', 'TRAINING_PLAN_REQUIRED',
         '$.curriculum_model_ids', json(COALESCE((
           SELECT json_group_array(id) FROM (
             SELECT ms.id AS id FROM modelos_sessao ms
              WHERE ms.empresa_id = treinamentos_planejados.empresa_id
                AND ms.qualificacao_tipo_id = treinamentos_planejados.qualificacao_tipo_id
                AND ms.ordem_no_treinamento IS NOT NULL
                AND ms.deleted_at IS NULL AND COALESCE(ms.ativo, 1) = 1
              ORDER BY ms.ordem_no_treinamento, ms.id
           )
         ), '[]')),
         '$.curriculum_total_sessions', (
           SELECT COUNT(*) FROM modelos_sessao ms
            WHERE ms.empresa_id = treinamentos_planejados.empresa_id
              AND ms.qualificacao_tipo_id = treinamentos_planejados.qualificacao_tipo_id
              AND ms.ordem_no_treinamento IS NOT NULL
              AND ms.deleted_at IS NULL AND COALESCE(ms.ativo, 1) = 1
         ),
         '$.participants[0].session_model_ids', json(COALESCE((
           SELECT json_group_array(id) FROM (
             SELECT ms.id AS id FROM modelos_sessao ms
              WHERE ms.empresa_id = treinamentos_planejados.empresa_id
                AND ms.qualificacao_tipo_id = treinamentos_planejados.qualificacao_tipo_id
                AND ms.ordem_no_treinamento IS NOT NULL
                AND ms.deleted_at IS NULL AND COALESCE(ms.ativo, 1) = 1
              ORDER BY ms.ordem_no_treinamento, ms.id
           )
         ), '[]'))
       ),
       updated_at = datetime('now')
 WHERE deleted_at IS NULL
   AND planejamento_origem = 'SIMULADOR_QUINZENA'
   AND planejamento_status IN ('PROPOSTO','PLANEJADO','AGUARDANDO_DISPONIBILIDADE','CONFIRMADO','REPLANEJAR')
   AND json_valid(COALESCE(planejamento_snapshot_json, '')) = 1
   AND json_extract(planejamento_snapshot_json, '$.generated_by') = 'TRAINING_DEPENDENCY';

CREATE TABLE IF NOT EXISTS _0490_post_guard (id INTEGER PRIMARY KEY CHECK(id = 1));
CREATE TRIGGER IF NOT EXISTS _0490_postcheck
BEFORE INSERT ON _0490_post_guard
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*)
      FROM modelos_sessao_versionamento v
      JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id
     WHERE v.empresa_id=6 AND v.is_current=1
       AND ms.duracao_estimada=120
       AND (
         v.codigo_canonico IN (
           'A139-P-01/04-C1','A139-P-01/04-C2','A139-P-01/04-C3',
           'A139-P-02/04-C1-OFFSHORE','A139-P-02/04-C2-OFFSHORE','A139-P-02/04-C3-OFFSHORE',
           'A139-P-03/04-C1-IFR-LOFT','A139-P-03/04-C2-IFR-LOFT','A139-P-03/04-C3-IFR-LOFT',
           'A139-P-04/04-C1-CHECK','A139-P-04/04-C2-CHECK','A139-P-04/04-C3-CHECK',
           'A139-S-01/02-C1','A139-S-01/02-C2','A139-S-01/02-C3',
           'A139-S-02/02-C1','A139-S-02/02-C2','A139-S-02/02-C3',
           'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3',
           'S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3',
           'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3',
           'S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3','SK76-P-CHECK'
         )
       )
  ) <> 25 THEN RAISE(ABORT, '0490 postcheck: esperados 25 modelos recorrentes correntes com 120 minutos') END;

  SELECT CASE WHEN (
    SELECT COUNT(*)
      FROM modelos_sessao_versionamento v
      JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id
      JOIN qualificacoes_tipos qt ON qt.id=ms.qualificacao_tipo_id AND qt.empresa_id=ms.empresa_id
     WHERE v.empresa_id=6 AND v.is_current=1
       AND qt.codigo IN ('G1','G1-SEM','G2')
       AND ms.ordem_no_treinamento IS NOT NULL
  ) <> 9 THEN RAISE(ABORT, '0490 postcheck: curriculo ativo deve ter exatamente 9 sessoes ordenadas') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM modelos_sessao_versionamento v
    JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id
    JOIN qualificacoes_tipos qt ON qt.id=ms.qualificacao_tipo_id AND qt.empresa_id=ms.empresa_id
    WHERE v.empresa_id=6 AND v.is_current=1 AND qt.codigo IN ('G1','G1-SEM','G2')
      AND ms.ordem_no_treinamento IS NOT NULL
      AND NOT (
        (qt.codigo='G1' AND (
          (v.codigo_canonico='A139-P-01/04-C2' AND ms.ordem_no_treinamento=1) OR
          (v.codigo_canonico='A139-P-02/04-C2-OFFSHORE' AND ms.ordem_no_treinamento=2) OR
          (v.codigo_canonico='A139-P-03/04-C2-IFR-LOFT' AND ms.ordem_no_treinamento=3) OR
          (v.codigo_canonico='A139-P-04/04-C2-CHECK' AND ms.ordem_no_treinamento=4)
        )) OR
        (qt.codigo='G1-SEM' AND (
          (v.codigo_canonico='A139-S-01/02-C2' AND ms.ordem_no_treinamento=1) OR
          (v.codigo_canonico='A139-S-02/02-C2' AND ms.ordem_no_treinamento=2)
        )) OR
        (qt.codigo='G2' AND (
          (v.codigo_canonico IN ('S76-P-01/04-C2','S76-P-01/03-C2') AND ms.ordem_no_treinamento=1) OR
          (v.codigo_canonico IN ('S76-P-02/04-C2','S76-P-02/03-C2') AND ms.ordem_no_treinamento=2) OR
          (v.codigo_canonico='SK76-P-CHECK' AND ms.ordem_no_treinamento=3)
        ))
      )
  ) THEN RAISE(ABORT, '0490 postcheck: codigo/qualificacao/ordem do curriculo ativo divergente') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='trg_training_dependency_plan_enrich'
  ) THEN RAISE(ABORT, '0490 postcheck: trigger de dependencia curricular ausente') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM treinamentos_planejados t, json_each(t.planejamento_snapshot_json, '$.curriculum_model_ids') j
      LEFT JOIN modelos_sessao ms ON ms.id=CAST(j.value AS INTEGER) AND ms.empresa_id=t.empresa_id
     WHERE t.deleted_at IS NULL
       AND t.planejamento_origem='SIMULADOR_QUINZENA'
       AND t.planejamento_status IN ('PROPOSTO','PLANEJADO','AGUARDANDO_DISPONIBILIDADE','CONFIRMADO','REPLANEJAR')
       AND json_valid(COALESCE(t.planejamento_snapshot_json,''))=1
       AND json_extract(t.planejamento_snapshot_json,'$.generated_by')='TRAINING_DEPENDENCY'
       AND (ms.id IS NULL OR ms.ordem_no_treinamento IS NULL)
  ) THEN RAISE(ABORT, '0490 postcheck: snapshot aberto contem modelo fora do curriculo ordenado') END;
END;
INSERT INTO _0490_post_guard(id) VALUES (1);
DROP TRIGGER IF EXISTS _0490_postcheck;
DROP TABLE IF EXISTS _0490_post_guard;
