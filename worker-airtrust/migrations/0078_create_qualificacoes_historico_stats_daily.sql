-- 0078_create_qualificacoes_historico_stats_daily.sql
-- Materialização diária das estatísticas de qualificações
-- Cria tabela e índice único por data

CREATE TABLE IF NOT EXISTS qualificacoes_historico_stats_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL DEFAULT (date('now')),
  total INTEGER NOT NULL,
  validas INTEGER NOT NULL,
  vencendo INTEGER NOT NULL,
  vencidas INTEGER NOT NULL,
  indeterminadas INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qh_stats_daily_date ON qualificacoes_historico_stats_daily (snapshot_date);
