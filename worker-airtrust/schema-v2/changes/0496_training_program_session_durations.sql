-- Migration 0496: complete Initial/Semiannual simulator session durations.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference: user-confirmed 120 minutes per missing AW139/SK76 Initial and SK76 Semiannual session (2026-09-14).
--   operational_decision: Fill only missing/non-positive duration_estimada values for the 0495 program mappings; preserve any existing valid 120-minute value.
--   dry_run_required: Validate exact 12+12+2 target current canonical models and reject any conflicting positive non-120 duration before apply.
--   rollback_plan_required: Data correction only. Recovery uses the governed D1 recovery point; no reverse migration should invent prior NULL durations.
--

CREATE TABLE IF NOT EXISTS _0496_pre_guard(id INTEGER PRIMARY KEY CHECK(id=1));
CREATE TRIGGER IF NOT EXISTS _0496_pre_validate BEFORE INSERT ON _0496_pre_guard BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM treinamento_programa_modelos pm
    JOIN treinamento_programas p ON p.id=pm.programa_id AND p.empresa_id=pm.empresa_id
    WHERE pm.empresa_id=6 AND pm.deleted_at IS NULL AND p.deleted_at IS NULL
      AND p.codigo='G1:INICIAL' AND pm.ciclo=1
  )<>12 THEN RAISE(ABORT,'0496 preflight: G1 Initial must map 12 sessions') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM treinamento_programa_modelos pm
    JOIN treinamento_programas p ON p.id=pm.programa_id AND p.empresa_id=pm.empresa_id
    WHERE pm.empresa_id=6 AND pm.deleted_at IS NULL AND p.deleted_at IS NULL
      AND p.codigo='G2:INICIAL' AND pm.ciclo=1
  )<>12 THEN RAISE(ABORT,'0496 preflight: G2 Initial must map 12 sessions') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM treinamento_programa_modelos pm
    JOIN treinamento_programas p ON p.id=pm.programa_id AND p.empresa_id=pm.empresa_id
    WHERE pm.empresa_id=6 AND pm.deleted_at IS NULL AND p.deleted_at IS NULL
      AND p.codigo='G2-SEM:SEMESTRAL' AND pm.ciclo=1
  )<>2 THEN RAISE(ABORT,'0496 preflight: G2 Semiannual must map 2 sessions') END;
  SELECT CASE WHEN (
    SELECT COUNT(DISTINCT ms.id)
    FROM treinamento_programa_modelos pm
    JOIN treinamento_programas p ON p.id=pm.programa_id AND p.empresa_id=pm.empresa_id
    JOIN modelos_sessao_versionamento msv ON msv.empresa_id=pm.empresa_id
      AND msv.codigo_canonico=pm.codigo_canonico AND msv.is_current=1
    JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=msv.empresa_id
      AND ms.deleted_at IS NULL AND COALESCE(ms.ativo,1)=1
    WHERE pm.empresa_id=6 AND pm.deleted_at IS NULL AND p.deleted_at IS NULL
      AND p.codigo IN ('G1:INICIAL','G2:INICIAL','G2-SEM:SEMESTRAL')
  )<>26 THEN RAISE(ABORT,'0496 preflight: expected 26 distinct current target models') END;
  SELECT CASE WHEN EXISTS(
    SELECT 1
    FROM treinamento_programa_modelos pm
    JOIN treinamento_programas p ON p.id=pm.programa_id AND p.empresa_id=pm.empresa_id
    JOIN modelos_sessao_versionamento msv ON msv.empresa_id=pm.empresa_id
      AND msv.codigo_canonico=pm.codigo_canonico AND msv.is_current=1
    JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=msv.empresa_id
    WHERE pm.empresa_id=6 AND pm.deleted_at IS NULL AND p.deleted_at IS NULL
      AND p.codigo IN ('G1:INICIAL','G2:INICIAL','G2-SEM:SEMESTRAL')
      AND ms.deleted_at IS NULL AND COALESCE(ms.ativo,1)=1
      AND COALESCE(ms.duracao_estimada,0)>0 AND ms.duracao_estimada<>120
  ) THEN RAISE(ABORT,'0496 preflight: conflicting positive target duration') END;
END;
INSERT INTO _0496_pre_guard(id) VALUES(1);
DROP TRIGGER IF EXISTS _0496_pre_validate;
DROP TABLE IF EXISTS _0496_pre_guard;

UPDATE modelos_sessao
SET duracao_estimada=120, updated_at=datetime('now')
WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(ativo,1)=1
  AND COALESCE(duracao_estimada,0)<=0
  AND id IN (
    SELECT msv.modelo_id
    FROM treinamento_programa_modelos pm
    JOIN treinamento_programas p ON p.id=pm.programa_id AND p.empresa_id=pm.empresa_id
    JOIN modelos_sessao_versionamento msv ON msv.empresa_id=pm.empresa_id
      AND msv.codigo_canonico=pm.codigo_canonico AND msv.is_current=1
    WHERE pm.empresa_id=6 AND pm.deleted_at IS NULL AND p.deleted_at IS NULL
      AND p.codigo IN ('G1:INICIAL','G2:INICIAL','G2-SEM:SEMESTRAL')
  );
CREATE TABLE IF NOT EXISTS _0496_post_guard(id INTEGER PRIMARY KEY CHECK(id=1));
CREATE TRIGGER IF NOT EXISTS _0496_post_validate BEFORE INSERT ON _0496_post_guard BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1
    FROM treinamento_programa_modelos pm
    JOIN treinamento_programas p ON p.id=pm.programa_id AND p.empresa_id=pm.empresa_id
    JOIN modelos_sessao_versionamento msv ON msv.empresa_id=pm.empresa_id
      AND msv.codigo_canonico=pm.codigo_canonico AND msv.is_current=1
    JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=msv.empresa_id
    WHERE pm.empresa_id=6 AND pm.deleted_at IS NULL AND p.deleted_at IS NULL
      AND p.codigo IN ('G1:INICIAL','G2:INICIAL','G2-SEM:SEMESTRAL')
      AND (ms.duracao_estimada IS NULL OR ms.duracao_estimada<>120)
  ) THEN RAISE(ABORT,'0496 post: every target session must be 120 minutes') END;
  SELECT CASE WHEN (
    SELECT SUM(ms.duracao_estimada)
    FROM treinamento_programa_modelos pm
    JOIN treinamento_programas p ON p.id=pm.programa_id AND p.empresa_id=pm.empresa_id
    JOIN modelos_sessao_versionamento msv ON msv.empresa_id=pm.empresa_id
      AND msv.codigo_canonico=pm.codigo_canonico AND msv.is_current=1
    JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=msv.empresa_id
    WHERE pm.empresa_id=6 AND pm.deleted_at IS NULL AND p.deleted_at IS NULL
      AND p.codigo='G1:INICIAL' AND pm.ciclo=1
  )<>1440 THEN RAISE(ABORT,'0496 post: G1 Initial must total 1440 minutes') END;
  SELECT CASE WHEN (
    SELECT SUM(ms.duracao_estimada)
    FROM treinamento_programa_modelos pm
    JOIN treinamento_programas p ON p.id=pm.programa_id AND p.empresa_id=pm.empresa_id
    JOIN modelos_sessao_versionamento msv ON msv.empresa_id=pm.empresa_id
      AND msv.codigo_canonico=pm.codigo_canonico AND msv.is_current=1
    JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=msv.empresa_id
    WHERE pm.empresa_id=6 AND pm.deleted_at IS NULL AND p.deleted_at IS NULL
      AND p.codigo='G2:INICIAL' AND pm.ciclo=1
  )<>1440 THEN RAISE(ABORT,'0496 post: G2 Initial must total 1440 minutes') END;
  SELECT CASE WHEN (
    SELECT SUM(ms.duracao_estimada)
    FROM treinamento_programa_modelos pm
    JOIN treinamento_programas p ON p.id=pm.programa_id AND p.empresa_id=pm.empresa_id
    JOIN modelos_sessao_versionamento msv ON msv.empresa_id=pm.empresa_id
      AND msv.codigo_canonico=pm.codigo_canonico AND msv.is_current=1
    JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=msv.empresa_id
    WHERE pm.empresa_id=6 AND pm.deleted_at IS NULL AND p.deleted_at IS NULL
      AND p.codigo='G2-SEM:SEMESTRAL' AND pm.ciclo=1
  )<>240 THEN RAISE(ABORT,'0496 post: G2 Semiannual must total 240 minutes') END;
END;
INSERT INTO _0496_post_guard(id) VALUES(1);
DROP TRIGGER IF EXISTS _0496_post_validate;
DROP TABLE IF EXISTS _0496_post_guard;
