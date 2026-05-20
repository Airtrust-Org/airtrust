-- ============================================================
-- Migration 0353: FRMS — Premissa operacional de sono fixo (8h)
--
-- Contexto: SAFTE-FAST / ICAO Doc 9966 / RBAC 117
-- Premissa provisória:
--   acordou = apresentacao - 90min
--   dormiu  = acordou - 8h
--   sono_efetivo_min = 480 (quando nao informado)
--
-- Preparado para futuro: hora_dormiu informada pelo tripulante.
-- ============================================================

-- 1) Novos parâmetros configuráveis (empresa)
INSERT OR IGNORE INTO frms_configuracao_limites
  (id, nome, valor_numerico, unidade, descricao, ativo, created_at, updated_at)
VALUES
  (
    'cfg_min_antes_apres_0353',
    'MINUTOS_ANTES_APRESENTACAO',
    90,
    'minutos',
    'Tempo entre acordar e se apresentar para o voo (padrão operacional 90min).',
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cfg_horas_sono_padrao_0353',
    'HORAS_SONO_PADRAO',
    8.0,
    'horas',
    'Horas de sono assumidas quando o tripulante nao informa hora_dormiu.',
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

-- 2) Campos da jornada (fonte de sono + rastreabilidade)
ALTER TABLE frms_jornada ADD COLUMN hora_dormiu TEXT;
ALTER TABLE frms_jornada ADD COLUMN hora_acordou TEXT;
ALTER TABLE frms_jornada ADD COLUMN sono_efetivo_min INTEGER;
ALTER TABLE frms_jornada ADD COLUMN fonte_sono TEXT DEFAULT 'PADRAO';
ALTER TABLE frms_jornada ADD COLUMN acordou_na_wocl INTEGER DEFAULT 0;
ALTER TABLE frms_jornada ADD COLUMN repouso_regulatorio_min INTEGER;

CREATE INDEX IF NOT EXISTS idx_frms_jornada_fonte_sono
  ON frms_jornada(fonte_sono)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_frms_jornada_acordou_wocl
  ON frms_jornada(acordou_na_wocl)
  WHERE deleted_at IS NULL;
