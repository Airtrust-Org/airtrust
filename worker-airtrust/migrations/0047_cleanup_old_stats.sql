-- 0047_cleanup_old_stats.sql
-- Remove estatísticas materializadas com mais de 90 dias para manter tabela enxuta
-- Safe idempotent: executa DELETE condicional

DELETE FROM qualificacoes_historico_stats_daily
WHERE day < date('now','-90 day');
