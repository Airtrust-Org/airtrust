-- 0084_create_view_qualificacoes_historico_risco_v.sql
-- View de risco categorizando proximidade de vencimento em faixas agregadas

DROP VIEW IF EXISTS qualificacoes_historico_risco_v;

CREATE VIEW qualificacoes_historico_risco_v AS
SELECT
  status_qualificacao,
  COUNT(*) AS total,
  SUM(CASE WHEN dias_ate_vencimento BETWEEN 0 AND 30 THEN 1 ELSE 0 END) AS faixa_0_30,
  SUM(CASE WHEN dias_ate_vencimento BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS faixa_31_60,
  SUM(CASE WHEN dias_ate_vencimento BETWEEN 61 AND 180 THEN 1 ELSE 0 END) AS faixa_61_180,
  SUM(CASE WHEN dias_ate_vencimento > 180 THEN 1 ELSE 0 END) AS faixa_180_plus,
  SUM(CASE WHEN dias_ate_vencimento < 0 THEN 1 ELSE 0 END) AS vencidas
FROM qualificacoes_historico_v
GROUP BY status_qualificacao;
