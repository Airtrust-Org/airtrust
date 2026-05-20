-- 0074_create_historico_stats_view.sql
-- View agregada para estatísticas rápidas de qualificacoes_historico
-- Usa apenas colunas existentes / derivadas sem joins pesados

DROP VIEW IF EXISTS qualificacoes_historico_stats_v;

CREATE VIEW qualificacoes_historico_stats_v AS
SELECT
  COUNT(*) AS total,
  COUNT(CASE WHEN validade IS NOT NULL AND DATE(validade) >= DATE('now') THEN 1 END) AS validas,
  COUNT(CASE WHEN validade IS NOT NULL AND DATE(validade) BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 1 END) AS vencendo,
  COUNT(CASE WHEN validade IS NOT NULL AND DATE(validade) < DATE('now') THEN 1 END) AS vencidas,
  COUNT(CASE WHEN validade IS NULL THEN 1 END) AS indeterminadas
FROM qualificacoes_historico
WHERE deleted_at IS NULL;
