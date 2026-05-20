-- MIGRATION 0046 - Materialized Daily Stats for qualificacoes_historico
-- Cria tabela para armazenar estatísticas agregadas diárias por escopo (filtros).
-- Escopo identificado por hash simples (funcionario|qualificacao|status) permitindo cache persistente além do tempo de vida do worker.

CREATE TABLE IF NOT EXISTS qualificacoes_historico_stats_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day DATE NOT NULL, -- formato YYYY-MM-DD (UTC)
  scope_hash TEXT NOT NULL, -- funcionarioId|qualificacaoId|status ou vazio para global
  total INTEGER NOT NULL DEFAULT 0,
  validas INTEGER NOT NULL DEFAULT 0,
  vencendo INTEGER NOT NULL DEFAULT 0,
  vencidas INTEGER NOT NULL DEFAULT 0,
  renovadas INTEGER NOT NULL DEFAULT 0,
  generated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(day, scope_hash)
);

-- Índice para acelerar buscas por dia + escopo
CREATE INDEX IF NOT EXISTS idx_qh_stats_daily_day_scope ON qualificacoes_historico_stats_daily(day, scope_hash);
