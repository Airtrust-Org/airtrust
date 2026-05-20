-- 0082_create_api_latency_daily.sql
-- Tabela para agregação diária de latência (p95/p99) por rota/método

CREATE TABLE IF NOT EXISTS api_latency_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  calls INTEGER NOT NULL,
  avg_ms REAL NOT NULL,
  p95_ms REAL NOT NULL,
  p99_ms REAL NOT NULL,
  max_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(day, route, method)
);

CREATE INDEX IF NOT EXISTS idx_api_latency_daily_route_day ON api_latency_daily(route, day);
