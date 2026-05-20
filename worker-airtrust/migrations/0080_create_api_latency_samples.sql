-- 0080_create_api_latency_samples.sql
-- Tabela para armazenar amostras de latência de endpoints críticos

CREATE TABLE IF NOT EXISTS api_latency_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  snapshot_date TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_latency_route_date ON api_latency_samples(route, snapshot_date);
