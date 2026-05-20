-- Migration 0269: rastreabilidade da correção crítica de effectiveness FRMS
-- Observação: a migration 0266 já existe no repositório; por isso esta etapa entra como 0269.

ALTER TABLE frms_fatorizacao_jornada
ADD COLUMN processado_com_bug INTEGER NOT NULL DEFAULT 1;

-- Reforça os sinais corretos no banco para evitar override indevido dos defaults do TypeScript.
UPDATE frms_configuracao_limites
SET valor_numerico = -0.1,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND nome IN (
    'NOTURNO_FATOR',
    'CICLO_EMBARCADO_PCT_MAX',
    'HV_MUITAS_FATOR',
    'FATOR_BASE_AWAY_PCT',
    'FATOR_ACLIMATADO_NAO_PCT'
  );

UPDATE frms_configuracao_limites
SET valor_numerico = -0.05,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND nome = 'APRESENTACAO_AMANHECER_FATOR';

-- Marca o estoque atual como pré-rastreabilidade; os registros novos passam a ser gravados com 0.
UPDATE frms_fatorizacao_jornada
SET processado_com_bug = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL;

SELECT
  'PRE-REPROCESS_TRACKING' AS status,
  COUNT(*) AS total,
  COUNT(CASE WHEN effectiveness_pct = 100 THEN 1 END) AS com_100,
  ROUND(AVG(effectiveness_pct), 1) AS media_pct,
  MIN(effectiveness_pct) AS min_pct,
  MAX(effectiveness_pct) AS max_pct
FROM frms_fatorizacao_jornada
WHERE deleted_at IS NULL;