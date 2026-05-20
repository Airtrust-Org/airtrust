-- ================================================================
-- Migration 0240: Domain Events para integração reativa entre módulos
-- ================================================================

CREATE TABLE IF NOT EXISTS domain_events (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  modulo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  payload TEXT NOT NULL,
  processado INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_domain_events_empresa_processado
  ON domain_events(empresa_id, processado, created_at);

CREATE INDEX IF NOT EXISTS idx_domain_events_modulo_tipo
  ON domain_events(modulo, tipo, created_at);
