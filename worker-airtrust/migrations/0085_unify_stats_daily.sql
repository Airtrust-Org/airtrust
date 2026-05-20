-- 0085_unify_stats_daily.sql
-- Unifica estrutura da tabela qualificacoes_historico_stats_daily (legacy + nova)
-- Mantém compatibilidade adicionando colunas snapshot_date, day, scope_hash, renovadas, indeterminadas
-- Estratégia: recriar tabela com todas colunas e copiar dados existentes

BEGIN TRANSACTION;

-- Criar tabela unificada temporária
CREATE TABLE IF NOT EXISTS qualificacoes_historico_stats_daily_unified (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  day TEXT NOT NULL,
  scope_hash TEXT NOT NULL DEFAULT 'GLOBAL',
  total INTEGER NOT NULL DEFAULT 0,
  validas INTEGER NOT NULL DEFAULT 0,
  vencendo INTEGER NOT NULL DEFAULT 0,
  vencidas INTEGER NOT NULL DEFAULT 0,
  renovadas INTEGER NOT NULL DEFAULT 0,
  indeterminadas INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Copiar dados da tabela existente (se já existir)
-- Usa COALESCE para suportar colunas presentes em qualquer variante
INSERT INTO qualificacoes_historico_stats_daily_unified (
  snapshot_date, day, scope_hash, total, validas, vencendo, vencidas, renovadas, indeterminadas, generated_at
)
SELECT
  COALESCE(snapshot_date, day, date('now')) AS snapshot_date,
  COALESCE(day, snapshot_date, date('now')) AS day,
  COALESCE(scope_hash, 'GLOBAL') AS scope_hash,
  COALESCE(total, 0) AS total,
  COALESCE(validas, 0) AS validas,
  COALESCE(vencendo, 0) AS vencendo,
  COALESCE(vencidas, 0) AS vencidas,
  COALESCE(renovadas, 0) AS renovadas,
  COALESCE(indeterminadas, 0) AS indeterminadas,
  COALESCE(generated_at, datetime('now')) AS generated_at
FROM qualificacoes_historico_stats_daily;

-- Substituir tabela antiga
DROP TABLE qualificacoes_historico_stats_daily;
ALTER TABLE qualificacoes_historico_stats_daily_unified RENAME TO qualificacoes_historico_stats_daily;

-- Índices
CREATE INDEX IF NOT EXISTS idx_qh_stats_daily_snapshot ON qualificacoes_historico_stats_daily(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_qh_stats_daily_day_scope ON qualificacoes_historico_stats_daily(day, scope_hash);

COMMIT;

-- FIM 0085
