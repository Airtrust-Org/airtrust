#!/usr/bin/env node

const sql = `
-- AirTrust incident dry-run: modelos_sessao_manobras recovery readiness.
-- READ ONLY. This query performs diagnosis only and never mutates data.
-- Execute only through the approved read-only D1 path after taking a snapshot.

WITH active_models AS (
  SELECT
    ms.id,
    ms.empresa_id,
    ms.codigo,
    ms.modelo_aeronave,
    COUNT(msm.id) AS active_links
  FROM modelos_sessao ms
  LEFT JOIN modelos_sessao_manobras msm
    ON msm.modelo_id = ms.id
   AND msm.deleted_at IS NULL
  WHERE ms.deleted_at IS NULL
    AND COALESCE(ms.ativo, 1) = 1
  GROUP BY ms.id
),
classified_models AS (
  SELECT
    id,
    empresa_id,
    codigo,
    modelo_aeronave,
    active_links,
    CASE
      WHEN codigo LIKE 'SK76-I-__/12' THEN 'versioned:0373_fix_sk76_inicial_modelos_sem_manobras.sql'
      WHEN codigo IN ('TRE-INST', 'CRED-EXA') THEN 'versioned:0296_fap07_fap13_manobras.sql'
      WHEN codigo IN ('SK76-S-01/02', 'SK76-S-02/02') THEN 'versioned:0382_create_sk76_semestral_sessions.sql'
      WHEN codigo IN ('A139-NOT-01', 'A139-NOT-02', 'S76-NOT-01', 'S76-NOT-02') THEN 'versioned:0383_split_night_training_onshore_offshore.sql'
      WHEN codigo LIKE 'A139-P-C%/%' THEN 'versioned:0180_implement_periodico_aw139.sql and later renamed codes'
      WHEN codigo LIKE 'S76-P-C%/%' OR codigo = 'SK76-P-CHECK' THEN 'versioned:0222/0262/0284 SK76 periodic sources'
      WHEN codigo LIKE 'A139-I-__/12' THEN 'source-not-yet-proven:AW139 initial 12-session map'
      WHEN codigo IN ('A139-P-LOFT/CHECK', 'A139-P-LOFT/OFFSHORE') THEN 'versioned:0299/0300 LOFT sources'
      WHEN codigo IN ('A139-REQ-01', 'S76-REQ-01') THEN 'source-not-yet-proven:REQUISITOS map'
      WHEN codigo = 'PILOT-MODELO-001' THEN 'source-not-yet-proven:tenant-8 pilot model'
      ELSE 'source-not-yet-proven'
    END AS source_candidate
  FROM active_models
),
active_fichas AS (
  SELECT
    fs.id,
    fs.empresa_id,
    fs.template_id,
    fs.status,
    COUNT(fsm.id) AS active_manobras
  FROM fichas_sessao fs
  LEFT JOIN fichas_sessao_manobras fsm
    ON fsm.ficha_id = fs.id
   AND fsm.deleted_at IS NULL
  WHERE fs.deleted_at IS NULL
  GROUP BY fs.id
)
SELECT
  'SUMMARY' AS section,
  'active_models' AS metric,
  COUNT(*) AS total,
  SUM(CASE WHEN active_links = 0 THEN 1 ELSE 0 END) AS affected
FROM classified_models
UNION ALL
SELECT
  'SUMMARY',
  'active_fichas',
  COUNT(*),
  SUM(CASE WHEN active_manobras = 0 THEN 1 ELSE 0 END)
FROM active_fichas
UNION ALL
SELECT
  'SUMMARY',
  'signed_fichas_without_manobras',
  COUNT(*),
  SUM(CASE WHEN active_manobras = 0 AND status LIKE 'ASSIN%' THEN 1 ELSE 0 END)
FROM active_fichas;

SELECT
  'MODEL_SOURCE_COVERAGE' AS section,
  source_candidate,
  COUNT(*) AS models_total,
  SUM(CASE WHEN active_links = 0 THEN 1 ELSE 0 END) AS models_without_links
FROM classified_models
GROUP BY source_candidate
ORDER BY models_without_links DESC, source_candidate;

SELECT
  'AFFECTED_MODELS' AS section,
  empresa_id,
  id AS modelo_id,
  codigo,
  modelo_aeronave,
  active_links,
  source_candidate,
  CASE
    WHEN source_candidate LIKE 'source-not-yet-proven%' THEN 'BLOCK_RESTORE_SOURCE_NOT_PROVEN'
    ELSE 'SOURCE_CANDIDATE_REQUIRES_ROW_LEVEL_DRY_RUN'
  END AS recovery_gate
FROM classified_models
WHERE active_links = 0
ORDER BY empresa_id, codigo;
`;

process.stdout.write(sql.trimStart());
