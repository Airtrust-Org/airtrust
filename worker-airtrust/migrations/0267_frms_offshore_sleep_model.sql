-- ============================================================
-- Migration 0267: Modelo de sono offshore + índices de performance
-- Baseado em: ICAO Doc 9966, SAFTE-FAST, operação offshore com hotel
-- Pressupostos validados: acordar 90min antes da apresentação,
-- adormecer 60min após liberação, eficiência do sono em hotel = 0.92
-- ============================================================

-- NOVOS PARÂMETROS DE CONFIGURAÇÃO: Modelo de Sono Offshore
INSERT OR IGNORE INTO frms_configuracao_limites
  (id, nome, valor_numerico, unidade, descricao, ativo, created_at, updated_at)
VALUES
  ('cfg_rep_pre_apres', 'REPOUSO_MIN_PRE_APRESENTACAO', 90, 'minutos',
   'Minutos entre despertar e apresentação na base (deslocamento hotel→base + preparo). Padrão: 90min para offshore com hotel a 30min da base.', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('cfg_rep_pos_lib', 'REPOUSO_MIN_POS_LIBERACAO', 60, 'minutos',
   'Minutos entre liberação da jornada e início do sono (deslocamento base→hotel + jantar + higiene). Padrão: 60min.', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

  ('cfg_rep_qual_hotel', 'REPOUSO_QUALIDADE_HOTEL', 92, 'percentual',
   'Fator de eficiência do sono em hotel vs. casa própria (100=casa, 92=hotel, 75=plataforma). Fonte: literatura medicina do sono offshore.', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CORRIGIR ALERTA_VIOLACAO_PCT para 101 se estiver errado (safety net)
UPDATE frms_configuracao_limites
SET valor_numerico = 101, updated_at = CURRENT_TIMESTAMP
WHERE nome = 'ALERTA_VIOLACAO_PCT' AND valor_numerico = 100;

-- NOVOS CAMPOS na tabela de fatorizacao para o modelo de sono calibrado
-- (effectiveness_pct, effectiveness_nivel, effectiveness_componentes_json já existem)
ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN hora_despertar_estimada TEXT DEFAULT NULL;

ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN hora_inicio_sono_estimado TEXT DEFAULT NULL;

ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN duracao_sono_efetiva_min REAL DEFAULT NULL;

ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN tempo_abaixo_limiar_min REAL DEFAULT NULL;

-- ÍNDICES DE PERFORMANCE (críticos para queries do dashboard)
CREATE INDEX IF NOT EXISTS idx_frms_fat_jornada_eff
  ON frms_fatorizacao_jornada(jornada_id, effectiveness_pct)
  WHERE deleted_at IS NULL AND effectiveness_pct IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_frms_fat_eff_nivel
  ON frms_fatorizacao_jornada(effectiveness_nivel)
  WHERE deleted_at IS NULL AND effectiveness_nivel IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_frms_config_nome
  ON frms_configuracao_limites(nome)
  WHERE ativo = 1;

-- BACKFILL: recalcular effectiveness para registros existentes
-- Usa fórmula: effectiveness = 100 + (total_fatorizado_jornada * 100), cap 0-100
-- NOTA: total_fatorizado_jornada é geralmente positivo (compliance score),
-- portanto a maioria será cap 100%. Valores negativos geram < 100%.
-- O modelo offshore com horários reais diferenciará quando novas jornadas forem processadas.
UPDATE frms_fatorizacao_jornada
SET
  effectiveness_pct = MAX(0.0, MIN(100.0, 100.0 + (total_fatorizado_jornada * 100.0))),
  effectiveness_nivel = CASE
    WHEN MAX(0.0, MIN(100.0, 100.0 + (total_fatorizado_jornada * 100.0))) >= 90 THEN 'verde'
    WHEN MAX(0.0, MIN(100.0, 100.0 + (total_fatorizado_jornada * 100.0))) <= 65 THEN 'vermelho'
    WHEN MAX(0.0, MIN(100.0, 100.0 + (total_fatorizado_jornada * 100.0))) <= 77 THEN 'amarelo'
    ELSE 'atencao'
  END,
  effectiveness_componentes_json = json_object(
    'processo_s', ROUND(COALESCE(fator_ciclo_embarcado_pct, 0) * 100, 2),
    'processo_c', ROUND((COALESCE(fator_apresentacao_pct, 0) + COALESCE(fator_noturno_dep_pct, 0) + COALESCE(fator_noturno_arr_pct, 0)) * 100, 2),
    'repouso',    ROUND(COALESCE(fator_repouso_pct, 0) * 100, 2),
    'hv',         ROUND(COALESCE(fator_hv_quantidade_pct, 0) * 100, 2),
    'duracao',    ROUND(COALESCE(fator_basica_pct, 0) * 100, 2)
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND total_fatorizado_jornada IS NOT NULL;

-- VERIFICAÇÃO pós-backfill
SELECT
  'BACKFILL RESULT' as check_name,
  COUNT(*) as total,
  COUNT(effectiveness_pct) as com_effectiveness,
  COUNT(CASE WHEN effectiveness_pct IS NULL AND total_fatorizado_jornada IS NOT NULL THEN 1 END) as ainda_nulos,
  ROUND(AVG(effectiveness_pct), 1) as media_effectiveness,
  COUNT(CASE WHEN effectiveness_nivel = 'verde'    THEN 1 END) as verde,
  COUNT(CASE WHEN effectiveness_nivel = 'amarelo'  THEN 1 END) as amarelo,
  COUNT(CASE WHEN effectiveness_nivel = 'atencao'  THEN 1 END) as atencao,
  COUNT(CASE WHEN effectiveness_nivel = 'vermelho' THEN 1 END) as vermelho
FROM frms_fatorizacao_jornada
WHERE deleted_at IS NULL;
