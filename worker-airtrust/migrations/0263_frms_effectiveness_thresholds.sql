-- ===========================================================================
-- 0263: FRMS — Thresholds de Effectiveness (Painel Científico SAFTE-FAST)
--
-- Adiciona parâmetros do modelo biomatemático SAFTE-FAST (FAA/ICAO)
-- para separar score de efetividade (científico, 0–100%)
-- dos thresholds regulatórios de compliance (ALERTA_*_PCT).
--
-- Também adiciona colunas à frms_fatorizacao_jornada para persistir
-- o resultado de effectiveness por jornada.
--
-- Idempotente: INSERT OR IGNORE
-- ===========================================================================

-- ── 1. Parâmetros Científicos de Effectiveness (Painel A) ──

INSERT OR IGNORE INTO frms_configuracao_limites
  (id, nome, valor_numerico, unidade, descricao, ativo, created_at, updated_at)
VALUES
  (lower(hex(randomblob(16))), 'EFFECTIV_VERDE_MIN', 90, '%',
   'Effectiveness ≥ este valor = desempenho pleno (padrão SAFTE-FAST/FAA)', 1, datetime('now'), datetime('now')),

  (lower(hex(randomblob(16))), 'EFFECTIV_AMARELO_MAX', 77, '%',
   'Effectiveness ≤ este valor = início de degradação cognitiva (threshold científico SAFTE-FAST validado FAA)', 1, datetime('now'), datetime('now')),

  (lower(hex(randomblob(16))), 'EFFECTIV_VERMELHO_MAX', 65, '%',
   'Effectiveness ≤ este valor = degradação severa — equivale a ~24h sem dormir (SAFTE-FAST/FAA)', 1, datetime('now'), datetime('now')),

  (lower(hex(randomblob(16))), 'EFFECTIV_PERIODO_PCT', 30, '%',
   'Percentual mínimo do tempo de voo abaixo de 77% para sinalizar risco na jornada', 1, datetime('now'), datetime('now'));

-- ── 2. Colunas de Effectiveness na tabela de fatorização ──

ALTER TABLE frms_fatorizacao_jornada ADD COLUMN effectiveness_pct REAL DEFAULT NULL;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN effectiveness_nivel TEXT DEFAULT NULL;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN effectiveness_componentes_json TEXT DEFAULT NULL;
