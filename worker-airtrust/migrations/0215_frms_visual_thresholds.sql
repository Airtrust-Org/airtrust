-- ============================================================
-- Migration 0215: FRMS Visual Thresholds (early warning)
-- Adiciona 3 parâmetros de threshold visual separados dos
-- limites regulatórios (ALERTA_*_PCT).
-- Permite configurar "semáforos" visuais no dashboard ANTES
-- de atingir os limites regulatórios.
-- ============================================================

INSERT OR IGNORE INTO frms_configuracao_limites (id, nome, valor_numerico, unidade, descricao, ativo, created_at, updated_at)
VALUES
  ('lim_visual_aviso',   'VISUAL_AVISO_PCT',   40.0, 'PERCENTUAL', 'Threshold visual AVISO — early warning antes do limite regulatório (amarelo claro)', 1, datetime('now'), datetime('now')),
  ('lim_visual_atencao', 'VISUAL_ATENCAO_PCT',  85.0, 'PERCENTUAL', 'Threshold visual ATENÇÃO — early warning (amarelo/laranja)', 1, datetime('now'), datetime('now')),
  ('lim_visual_critico', 'VISUAL_CRITICO_PCT',  95.0, 'PERCENTUAL', 'Threshold visual CRÍTICO — early warning (vermelho no dashboard)', 1, datetime('now'), datetime('now'));
